import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import {
  AI_CHAT_MAX_CACHED_RESULT_BYTES, aiChatPayloadHash,
  claimAiChatRequest, completeAiChatRequest, failAiChatRequest,
  validateAiChatRequestKey, aiChatDuplicateMessage
} from '../src/services/ai-chat-request.service.js';

type Stored = {
  id: string;
  userId: string;
  clientRequestId: string;
  payloadSha256: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  responseJson: unknown | null;
  completedAt: Date | null;
};

class MemoryStore {
  private rows = new Map<string, Stored>();
  private serial = 0;
  key(userId: string, clientRequestId: string) { return `${userId}:${clientRequestId}`; }
  async create({ data }: { data: { userId: string; clientRequestId: string; payloadSha256: string } }) {
    const key = this.key(data.userId, data.clientRequestId);
    if (this.rows.has(key)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
    const row: Stored = {
      id: `record-${++this.serial}`, userId: data.userId, clientRequestId: data.clientRequestId,
      payloadSha256: data.payloadSha256, status: 'PROCESSING', responseJson: null, completedAt: null
    };
    this.rows.set(key, row);
    return { ...row };
  }
  async findUnique({ where }: { where: { userId_clientRequestId: { userId: string; clientRequestId: string } } }) {
    const { userId, clientRequestId } = where.userId_clientRequestId;
    return this.rows.get(this.key(userId, clientRequestId)) ?? null;
  }
  async updateMany({ where, data }: { where: { id: string; status: string }; data: Partial<Stored> }) {
    for (const [key, row] of this.rows) {
      if (row.id !== where.id || row.status !== where.status) continue;
      this.rows.set(key, {
        ...row, ...data,
        responseJson: data.responseJson === undefined ? row.responseJson : (
          data.responseJson === Prisma.DbNull ? null : data.responseJson
        )
      });
      return { count: 1 };
    }
    return { count: 0 };
  }
  get(userId: string, key: string) { return this.rows.get(this.key(userId, key)); }
  get count() { return this.rows.size; }
}

const UUID1 = '5bd2974e-65cb-485a-8b1a-293e7a2743f0';
const UUID2 = 'b0977b8b-9614-4f3d-a8b5-5cb8c1f6aa92';
const requestBody = { clientRequestId: UUID1, question: 'Создай задачу', chatId: 'quick-ai-requests', model: 'gpt-5.4-mini', history: [] };
const check = (userId: string, id: unknown, body: Record<string, unknown>, db: MemoryStore) =>
  claimAiChatRequest(userId, id, body, db as never);

test('same request identity is claimed at most once with concurrent attempts', async () => {
  const db = new MemoryStore();
  const [one, two, three] = await Promise.all([
    check('user-a', UUID1, requestBody, db),
    check('user-a', UUID1, requestBody, db),
    check('user-a', UUID1, requestBody, db)
  ]);
  assert.equal(one.kind, 'new');
  assert.deepEqual([two.kind, three.kind], ['duplicate', 'duplicate']);
  if (two.kind === 'duplicate') assert.equal(two.reason, 'processing');
  assert.equal(db.count, 1);
});

test('after success the same HTTP request replays stored output without a new execution', async () => {
  const db = new MemoryStore();
  const first = await check('user-a', UUID1, requestBody, db);
  const result = { answer: 'Задача создана', taskDataChanged: true, billing: { creditsSpentMilli: 127 }, actionReports: ['Создана задача'] };
  assert.equal(first.kind, 'new');
  await completeAiChatRequest(first, result, db as never);
  const second = await check('user-a', UUID1, requestBody, db);
  assert.equal(second.kind, 'replay');
  if (second.kind === 'replay') assert.deepEqual(second.response, result);
  assert.equal(db.count, 1);
  assert.equal(db.get('user-a', UUID1)?.status, 'SUCCEEDED');
});

test('reusing the same id with different payload is never accepted', async () => {
  const db = new MemoryStore();
  await check('user-a', UUID1, requestBody, db);
  const result = await check('user-a', UUID1, { ...requestBody, question: 'Удалить задачи' }, db);
  assert.deepEqual(result, { kind: 'duplicate', reason: 'payload_changed' });
  assert.equal(db.count, 1);
});

test('same UUID on another user does not expose cached responses', async () => {
  const db = new MemoryStore();
  const original = await check('user-a', UUID1, requestBody, db);
  await completeAiChatRequest(original, { answer: 'Private answer' }, db as never);
  const another = await check('user-b', UUID1, requestBody, db);
  assert.equal(another.kind, 'new');
  assert.equal(db.count, 2);
});

test('failed and unfinished executions cannot be re-run under the same UUID', async () => {
  const db = new MemoryStore();
  const unfinished = await check('user-a', UUID1, requestBody, db);
  const stillProcessing = await check('user-a', UUID1, requestBody, db);
  assert.deepEqual(stillProcessing, { kind: 'duplicate', reason: 'processing' });
  await failAiChatRequest(unfinished, db as never);
  assert.deepEqual(await check('user-a', UUID1, requestBody, db), { kind: 'duplicate', reason: 'failed' });
  const fresh = await check('user-a', UUID2, { ...requestBody, clientRequestId: UUID2 }, db);
  assert.equal(fresh.kind, 'new');
});

test('large cached results do not trigger duplicate provider calls', async () => {
  const db = new MemoryStore();
  const original = await check('user-a', UUID1, requestBody, db);
  await completeAiChatRequest(original, { answer: 'A'.repeat(AI_CHAT_MAX_CACHED_RESULT_BYTES + 1) }, db as never);
  assert.equal(db.get('user-a', UUID1)?.status, 'SUCCEEDED');
  assert.deepEqual(await check('user-a', UUID1, requestBody, db), { kind: 'duplicate', reason: 'result_unavailable' });
});

test('invalid request keys reject without silently disabling idempotency', async () => {
  assert.equal(validateAiChatRequestKey(undefined), null);
  assert.throws(() => validateAiChatRequestKey('invalid'), /Некорректный/);
  assert.throws(() => validateAiChatRequestKey(123), /Некорректный/);
  const db = new MemoryStore();
  await assert.rejects(check('user-a', 'invalid', requestBody, db), /Некорректный/);
  assert.equal((await check('user-a', undefined, { question: 'legacy' }, db)).kind, 'untracked');
  assert.equal(db.count, 0);
  assert.equal(aiChatPayloadHash({ ...requestBody, clientRequestId: UUID1 }), aiChatPayloadHash({ ...requestBody, clientRequestId: UUID2 }));
  assert.match(aiChatDuplicateMessage('processing'), /обрабатывается/);
});

test('controller guards requests before streaming and all AI calls; clients send message UUID', async () => {
  const controller = await readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8');
  const chatSection = controller.slice(controller.indexOf('  askAiChat: async'), controller.indexOf('  getGeneralAssistantHistory:'));
  const claimAt = chatSection.indexOf('requestClaim = await claimAiChatRequest(');
  const streamAt = chatSection.indexOf('res.flushHeaders()');
  const toolsAt = chatSection.indexOf('await saveConversationUploads(');
  const chargeAt = chatSection.indexOf('aiAssistantService.askAiChat(');
  const completedAt = chatSection.indexOf('await completeAiChatRequest(');
  const responseAt = chatSection.indexOf("writeStreamEvent({ type: 'result', result: publicResult })");
  assert.ok(claimAt > 0 && claimAt < streamAt && streamAt < toolsAt && toolsAt < chargeAt);
  assert.ok(completedAt > chargeAt && completedAt < responseAt);
  assert.match(chatSection, /await failAiChatRequest\(requestClaim\)/);
  for (const path of ['../../client/src/App.tsx', '../../client/src/MiniApp.tsx']) {
    const content = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(content, /api\.askAiChatStreaming\(\{\s*clientRequestId: userMessage\.id,/);
  }
});

test('migration makes user/request key unique and deletes ledger records with owner', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20261013213000_ai_chat_request_idempotency/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX "AiChatRequest_userId_clientRequestId_key"/);
  assert.match(sql, /"status" IN \('PROCESSING','SUCCEEDED','FAILED'\)/);
  assert.match(sql, /ON DELETE CASCADE/);
});
