import assert from 'node:assert/strict';
import test from 'node:test';
import type { TelegramUpdateJob } from '@prisma/client';
import { createTelegramController } from '../src/controllers/telegram.controller.js';
import {
  TELEGRAM_JOB_MAX_ATTEMPTS,
  TELEGRAM_JOB_STALE_AFTER_MS,
  TelegramUpdateQueue,
  TelegramUpdateWorker
} from '../src/services/telegram-update-queue.service.js';

const makeResponse = () => {
  const result = { status: 200, body: undefined as unknown };
  return {
    result,
    response: {
      status(status: number) { result.status = status; return this; },
      json(body: unknown) { result.body = body; return this; }
    }
  };
};

const makeController = (enqueue: (updateId: number, payload: unknown) => Promise<'queued' | 'deduplicated'>, authorized = true) => (
  createTelegramController({
    queue: { enqueue },
    service: { isEnabled: () => true, isWebhookAuthorized: () => authorized }
  })
);

test('webhook ставит новый update в очередь и не ждёт его длительную обработку', async () => {
  let resolveProcessing!: () => void;
  const processing = new Promise<void>((resolve) => { resolveProcessing = resolve; });
  let queued = 0;
  const controller = makeController(async () => { queued += 1; return 'queued'; });
  const { result, response } = makeResponse();

  await Promise.race([
    controller.webhook({ body: { update_id: 101, message: { voice: {} } }, headers: {} } as never, response as never),
    processing.then(() => { throw new Error('webhook waited for voice processing'); })
  ]);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(queued, 1);
  resolveProcessing();
});

test('duplicate update_id возвращает 200 и не создаёт второй job', async () => {
  const ids = new Set<number>();
  let created = 0;
  const controller = makeController(async (id) => {
    if (ids.has(id)) return 'deduplicated';
    ids.add(id); created += 1; return 'queued';
  });
  for (let index = 0; index < 2; index += 1) {
    const { result, response } = makeResponse();
    await controller.webhook({ body: { update_id: 202 }, headers: {} } as never, response as never);
    assert.equal(result.status, 200);
  }
  assert.equal(created, 1);
});

test('авторизация webhook secret продолжает отклонять запрос', async () => {
  let enqueueCalled = false;
  const controller = makeController(async () => { enqueueCalled = true; return 'queued'; }, false);
  const { result, response } = makeResponse();
  await controller.webhook({ body: { update_id: 303 }, headers: {} } as never, response as never);
  assert.equal(result.status, 401);
  assert.equal(enqueueCalled, false);
});

class MemoryJobClient {
  jobs: TelegramUpdateJob[] = [];
  private sequence = 0;

  async create(args: { data: Record<string, unknown> }) {
    const updateId = args.data.updateId as bigint;
    if (this.jobs.some((job) => job.updateId === updateId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
    const now = args.data.nextAttemptAt as Date;
    const job = {
      id: `job-${++this.sequence}`, updateId, payload: args.data.payload, status: 'PENDING', attempts: 0,
      nextAttemptAt: now, processingStartedAt: null, processedAt: null, lastError: null, createdAt: now, updatedAt: now
    } as TelegramUpdateJob;
    this.jobs.push(job);
    return job;
  }

  async findFirst(args: { where: Record<string, any> }) {
    const now = args.where.nextAttemptAt.lte as Date;
    const job = this.jobs.find((item) => item.status === 'PENDING' && item.nextAttemptAt <= now && item.attempts < TELEGRAM_JOB_MAX_ATTEMPTS);
    return job ? { ...job } : null;
  }

  async updateMany(args: { where: Record<string, any>; data: Record<string, any> }) {
    let count = 0;
    for (const job of this.jobs) {
      const where = args.where;
      if (where.id && job.id !== where.id) continue;
      if (where.status && job.status !== where.status) continue;
      if (typeof where.attempts === 'number' && job.attempts !== where.attempts) continue;
      if (where.attempts?.gte !== undefined && job.attempts < where.attempts.gte) continue;
      if (where.attempts?.lt !== undefined && job.attempts >= where.attempts.lt) continue;
      if (where.processingStartedAt?.lt && (!job.processingStartedAt || job.processingStartedAt >= where.processingStartedAt.lt)) continue;
      const { attempts, ...data } = args.data;
      Object.assign(job, data);
      if (attempts?.increment) job.attempts += attempts.increment;
      count += 1;
    }
    return { count };
  }

  async update(args: { where: { id: string }; data: Record<string, any> }) {
    const job = this.jobs.find((item) => item.id === args.where.id)!;
    Object.assign(job, args.data);
    return job;
  }
}

const setupQueue = async () => {
  let clock = Date.parse('2026-09-23T12:00:00Z');
  const client = new MemoryJobClient();
  const queue = new TelegramUpdateQueue(client as never, () => new Date(clock));
  await queue.enqueue(404, { update_id: 404 });
  return { client, queue, advance: (milliseconds: number) => { clock += milliseconds; } };
};

test('один job обрабатывается один раз, а DONE больше не запускается', async () => {
  const { client, queue } = await setupQueue();
  let calls = 0;
  const worker = new TelegramUpdateWorker(queue, async () => { calls += 1; });
  assert.equal(await worker.processNext(), true);
  assert.equal(await worker.processNext(), false);
  assert.equal(calls, 1);
  assert.equal(client.jobs[0].status, 'DONE');
});

test('ошибка увеличивает attempts и после трёх попыток job остаётся FAILED', async () => {
  const { client, queue, advance } = await setupQueue();
  const worker = new TelegramUpdateWorker(queue, async () => { throw new Error('temporary failure'); });
  for (let attempt = 1; attempt <= TELEGRAM_JOB_MAX_ATTEMPTS; attempt += 1) {
    assert.equal(await worker.processNext(), true);
    assert.equal(client.jobs[0].attempts, attempt);
    advance(60_000);
  }
  assert.equal(client.jobs[0].status, 'FAILED');
  assert.equal(await worker.processNext(), false);
  assert.equal(client.jobs[0].attempts, TELEGRAM_JOB_MAX_ATTEMPTS);
});

test('зависший PROCESSING job восстанавливается после timeout', async () => {
  const { client, queue, advance } = await setupQueue();
  const claimed = await queue.claimNext();
  assert.ok(claimed);
  advance(TELEGRAM_JOB_STALE_AFTER_MS + 1);
  assert.equal(await queue.recoverStaleJobs(), 1);
  assert.equal(client.jobs[0].status, 'PENDING');
  assert.equal(await queue.claimNext() !== null, true);
  assert.equal(client.jobs[0].attempts, 2);
});
