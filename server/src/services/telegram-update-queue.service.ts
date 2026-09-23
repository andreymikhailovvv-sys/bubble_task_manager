import { Prisma, TelegramUpdateJob, TelegramUpdateJobStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export const TELEGRAM_JOB_MAX_ATTEMPTS = 3;
export const TELEGRAM_JOB_STALE_AFTER_MS = 5 * 60_000;
const BASE_RETRY_DELAY_MS = 5_000;

type QueueClient = Pick<typeof prisma.telegramUpdateJob, 'create' | 'findFirst' | 'updateMany' | 'update'>;
type ProcessUpdate = (payload: unknown) => Promise<void>;

const isUniqueConstraintError = (error: unknown) => (
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
);

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
};

export class TelegramUpdateQueue {
  constructor(
    private readonly client: QueueClient = prisma.telegramUpdateJob,
    private readonly now: () => Date = () => new Date()
  ) {}

  async enqueue(updateId: number, payload: unknown): Promise<'queued' | 'deduplicated'> {
    try {
      await this.client.create({
        data: {
          updateId: BigInt(updateId),
          payload: payload as Prisma.InputJsonValue,
          nextAttemptAt: this.now()
        }
      });
      return 'queued';
    } catch (error) {
      if (isUniqueConstraintError(error)) return 'deduplicated';
      throw error;
    }
  }

  async recoverStaleJobs(): Promise<number> {
    const now = this.now();
    const staleBefore = new Date(now.getTime() - TELEGRAM_JOB_STALE_AFTER_MS);
    const failed = await this.client.updateMany({
      where: { status: 'PROCESSING', processingStartedAt: { lt: staleBefore }, attempts: { gte: TELEGRAM_JOB_MAX_ATTEMPTS } },
      data: { status: 'FAILED', processingStartedAt: null, lastError: 'Processing interrupted and retry limit reached' }
    });
    const pending = await this.client.updateMany({
      where: { status: 'PROCESSING', processingStartedAt: { lt: staleBefore }, attempts: { lt: TELEGRAM_JOB_MAX_ATTEMPTS } },
      data: { status: 'PENDING', processingStartedAt: null, nextAttemptAt: now, lastError: 'Processing interrupted; scheduled for retry' }
    });
    return failed.count + pending.count;
  }

  async claimNext(): Promise<TelegramUpdateJob | null> {
    const now = this.now();
    const candidate = await this.client.findFirst({
      where: { status: 'PENDING', nextAttemptAt: { lte: now }, attempts: { lt: TELEGRAM_JOB_MAX_ATTEMPTS } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }]
    });
    if (!candidate) return null;

    const claimed = await this.client.updateMany({
      where: { id: candidate.id, status: 'PENDING', attempts: candidate.attempts },
      data: { status: 'PROCESSING', processingStartedAt: now, attempts: { increment: 1 }, lastError: null }
    });
    if (claimed.count === 0) return null;
    return { ...candidate, status: TelegramUpdateJobStatus.PROCESSING, attempts: candidate.attempts + 1, processingStartedAt: now };
  }

  async complete(job: TelegramUpdateJob): Promise<void> {
    await this.client.update({
      where: { id: job.id },
      data: { status: 'DONE', processedAt: this.now(), processingStartedAt: null, lastError: null }
    });
  }

  async fail(job: TelegramUpdateJob, error: unknown): Promise<void> {
    const exhausted = job.attempts >= TELEGRAM_JOB_MAX_ATTEMPTS;
    await this.client.update({
      where: { id: job.id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        processingStartedAt: null,
        nextAttemptAt: exhausted ? job.nextAttemptAt : new Date(this.now().getTime() + BASE_RETRY_DELAY_MS * 2 ** (job.attempts - 1)),
        lastError: safeErrorMessage(error)
      }
    });
  }
}

export class TelegramUpdateWorker {
  private running = false;

  constructor(
    private readonly queue: TelegramUpdateQueue,
    private readonly processUpdate: ProcessUpdate,
    private readonly now: () => Date = () => new Date()
  ) {}

  async processNext(): Promise<boolean> {
    const job = await this.queue.claimNext();
    if (!job) return false;
    const startedAt = this.now().getTime();
    console.info(`[TelegramWorker] started updateId=${job.updateId} attempt=${job.attempts}`);
    try {
      await this.processUpdate(job.payload);
      await this.queue.complete(job);
      console.info(`[TelegramWorker] completed updateId=${job.updateId} durationMs=${this.now().getTime() - startedAt}`);
    } catch (error) {
      await this.queue.fail(job, error);
      console.error(`[TelegramWorker] failed updateId=${job.updateId} attempt=${job.attempts} durationMs=${this.now().getTime() - startedAt}`);
    }
    return true;
  }

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (await this.processNext()) { /* process all currently eligible jobs sequentially */ }
    } finally {
      this.running = false;
    }
  }
}

export const telegramUpdateQueue = new TelegramUpdateQueue();
