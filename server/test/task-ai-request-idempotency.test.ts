import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { claimAiChatRequest, completeAiChatRequest, failAiChatRequest } from '../src/services/ai-chat-request.service.js';

type Row = {
  id: string;
  userId: string;
  clientRequestId: string;
  payloadSha256: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  responseJson: unknown | null;
};

class RequestStore {
  private rows = new Map<string, Row>();
  private nextId = 1;
  private key(userId: string, id: string) { return `${userId}:${id}`; }
  async create({ data }: { data: Pick<Row, 'userId' | 'clientRequestId' | 'payloadSha256'> }) {
    const key = this.key(data.userId, data.clientRequestId);
    if (this.rows.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
    const row: Row = { ...data, id: String(this.nextId++), status: 'PROCESSING', responseJson: null };
    this.rows.set(key, row);
    return { ...row };
  }
  async findUnique({ where }: { where: { userId_clientRequestId: { userId: string; clientRequestId: string } } }) {
    const w = where.userId_clientRequestId;
    const row = this.rows.get(this.key(w.userId, w.clientRequestId));
    return row ? { ...row } : null;
  }
  async updateMany({ where, data }: { where: { id: string; status: string }; data: Partial<Row> }) {
    for (const row of this.rows.values()) {
      if (row.id !== where.id || row.status !== where.status) continue;
      const { responseJson, ...other } = data;
      Object.assign(row, other, responseJson !== undefined ? {
        responseJson: responseJson === Prisma.DbNull ? null : responseJson
      } : {});
      return { count: 1 };
    }
    return { count: 0 };
  }
  get count() { return this.rows.size; }
}

const UUID = 'f40bf3b4-38b8-487a-b995-ef9bf2c72c6d';
const payload = (taskId: string, question = 'Перенеси сроки подзадач') => ({
  clientRequestId: UUID, question, model: 'gpt-6.1-sol', userMessage: question,
  __aiRequestKind: 'task-chat', __aiTaskId: taskId
});
const claim = (store: RequestStore, taskId: string, question?: string, userId = 'user-1') =>
  claimAiChatRequest(userId, UUID, payload(taskId, question), store as never);

test('parallel identical task requests claim once, return 409-equivalent duplicate without second execution', async () => {
  const db = new RequestStore();
  const results = await Promise.all([claim(db, 'task-a'), claim(db, 'task-a'), claim(db, 'task-a')]);
  assert.deepEqual(results.map(r => r.kind), ['new', 'duplicate', 'duplicate']);
  assert.equal(db.count, 1);
  for (const duplicate of results.slice(1)) {
    if (duplicate.kind === 'duplicate') assert.equal(duplicate.reason, 'processing');
  }
});

test('success caches task answer for replay instead of executing actions or charging again', async () => {
  const db = new RequestStore();
  const first = await claim(db, 'task-a');
  assert.equal(first.kind, 'new');
  const answer = { answer: 'Сроки обновлены', taskDataChanged: true, billing: { creditsSpentMilli: 2400 }, actionReports: ['3 подзадачи перенесены'] };
  await completeAiChatRequest(first, answer, db as never);
  const replay = await claim(db, 'task-a');
  assert.equal(replay.kind, 'replay');
  if (replay.kind === 'replay') assert.deepEqual(replay.response, answer);
  assert.equal(db.count, 1);
});

test('task id is part of server-owned fingerprint: UUID cannot replay another task or changed request', async () => {
  const db = new RequestStore();
  const first = await claim(db, 'task-a');
  await completeAiChatRequest(first, { answer: 'Private task-a reply' }, db as never);
  const differentTask = await claim(db, 'task-b');
  assert.deepEqual(differentTask, { kind: 'duplicate', reason: 'payload_changed' });
  const changedQuestion = await claim(db, 'task-a', 'Удали все подзадачи');
  assert.deepEqual(changedQuestion, { kind: 'duplicate', reason: 'payload_changed' });
  const generalPayload = { clientRequestId: UUID, question: 'Перенеси сроки подзадач', model: 'gpt-6.1-sol' };
  const general = await claimAiChatRequest('user-1', UUID, generalPayload, db as never);
  assert.deepEqual(general, { kind: 'duplicate', reason: 'payload_changed' });
});

test('users cannot replay other users task responses even with identical UUID', async () => {
  const db = new RequestStore();
  const first = await claim(db, 'task-a');
  await completeAiChatRequest(first, { answer: 'Private' }, db as never);
  assert.equal((await claim(db, 'task-a', undefined, 'user-2')).kind, 'new');
  assert.equal(db.count, 2);
});

test('FAILED or incomplete task operation is never transparently replayed or restarted', async () => {
  const db = new RequestStore();
  const first = await claim(db, 'task-a');
  assert.deepEqual(await claim(db, 'task-a'), { kind: 'duplicate', reason: 'processing' });
  await failAiChatRequest(first, db as never);
  assert.deepEqual(await claim(db, 'task-a'), { kind: 'duplicate', reason: 'failed' });
});

test('task endpoint checks membership before ledger lookup and stream headers', async () => {
  const source = await readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8');
  const a = source.slice(source.indexOf('  askTaskAssistant: async'), source.indexOf('  appendTaskAssistantMessages: async'));
  const access = a.indexOf('aiAssistantService.listTaskDialogForContext(');
  const claimAt = a.indexOf('taskRequestClaim = await claimAiChatRequest(');
  const stream = a.indexOf('res.flushHeaders()');
  const edit = a.indexOf('editUserDocumentIfRequested(');
  const model = a.indexOf('aiAssistantService.askTaskAssistant(');
  const firstAppend = a.indexOf('aiAssistantService.appendTaskDialogMessages(');
  const lastAppend = a.indexOf('aiAssistantService.appendTaskDialogAssistantMessage(');
  const finalize = a.indexOf('await completeAiChatRequest(');
  const reply = a.indexOf("writeStreamEvent({ type: 'result', result })");
  assert.ok(access > 0 && access < claimAt && claimAt < stream && stream < edit && edit < model);
  assert.ok(model < firstAppend && firstAppend < lastAppend && lastAppend < finalize && finalize < reply);
  assert.match(a, /__aiRequestKind: 'task-chat', __aiTaskId: req\.params\.id/);
  assert.match(a, /await failAiChatRequest\(taskRequestClaim\)/);
  assert.match(a, /res\.status\(409\).*application\/x-ndjson/);
  const assistant = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const accessChecker = assistant.slice(assistant.indexOf('  listTaskDialogForContext: async'), assistant.indexOf('  appendTaskDialogMessages: async'));
  assert.match(accessChecker, /taskAccessWhere\(input\.userId\)/);
});

test('site, focus and mini task requests have stable message UUID and API fallback for non-chat callers', async () => {
  const app = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8');
  assert.match(app, /const clientRequestId = crypto\.randomUUID\(\);\s*const nextDialog/);
  assert.match(app, /await askTaskAssistant\(taskId, \{\s*clientRequestId,/);
  assert.match(app, /await askTaskAssistant\(currentTask\.id, \{ clientRequestId,/);
  assert.match(mini, /const clientRequestId = crypto\.randomUUID\(\);\s*const nextDialog/);
  assert.match(mini, /api\.askTaskAssistantStreaming\(openedTask\.id, \{\s*clientRequestId,/);
  assert.match(api, /clientRequestId: payload\.clientRequestId \?\? crypto\.randomUUID\(\)/);
});

test('legacy task clients without a clientRequestId continue working without ledger', async () => {
  const db = new RequestStore();
  const result = await claimAiChatRequest('user-1', undefined, { question: 'legacy', __aiRequestKind: 'task-chat', __aiTaskId: 'task' }, db as never);
  assert.equal(result.kind, 'untracked');
  assert.equal(db.count, 0);
});
