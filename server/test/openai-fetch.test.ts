import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'undici';
import { createOpenAiFetch, normalizeOpenAiError } from '../src/lib/openai-fetch.js';

const networkError = (code: string) => Object.assign(new TypeError('fetch failed'), {
  cause: Object.assign(new Error(`connect ${code}`), { code, errno: -1, syscall: 'connect', address: '127.0.0.1', port: 443 })
});

test('не повторяет успешный запрос', async () => {
  let calls = 0;
  const request = createOpenAiFetch(async () => { calls += 1; return new Response('ok', { status: 200 }); }, async () => {});
  assert.equal((await request('https://api.openai.com')).status, 200);
  assert.equal(calls, 1);
});

test('повторяет временную сетевую ошибку и сохраняет cause.code в диагностике', async () => {
  let calls = 0;
  const request = createOpenAiFetch(async () => {
    calls += 1;
    if (calls === 1) throw networkError('ECONNRESET');
    return new Response('ok', { status: 200 });
  }, async () => {});
  assert.equal((await request('https://api.openai.com', undefined, { requestId: 'request-1' })).status, 200);
  assert.equal(calls, 2);
  assert.equal(normalizeOpenAiError(networkError('ECONNREFUSED')).cause?.code, 'ECONNREFUSED');
});

test('останавливается после трёх сетевых попыток', async () => {
  let calls = 0;
  const request = createOpenAiFetch(async () => { calls += 1; throw networkError('ETIMEDOUT'); }, async () => {});
  await assert.rejects(request('https://api.openai.com'), /fetch failed/);
  assert.equal(calls, 3);
});

test('не повторяет HTTP 400, но повторяет временный 5xx', async () => {
  let badRequestCalls = 0;
  const badRequest = createOpenAiFetch(async () => { badRequestCalls += 1; return new Response('', { status: 400 }); }, async () => {});
  assert.equal((await badRequest('https://api.openai.com')).status, 400);
  assert.equal(badRequestCalls, 1);

  let unavailableCalls = 0;
  const unavailable = createOpenAiFetch(async () => {
    unavailableCalls += 1;
    return new Response('', { status: unavailableCalls === 1 ? 503 : 200 });
  }, async () => {});
  assert.equal((await unavailable('https://api.openai.com')).status, 200);
  assert.equal(unavailableCalls, 2);
});

test('нормализатор не копирует произвольные секретные поля', () => {
  const normalized = normalizeOpenAiError(Object.assign(networkError('ENOTFOUND'), { authorization: 'Bearer secret', payload: 'private' }));
  assert.equal('authorization' in normalized, false);
  assert.equal('payload' in normalized, false);
});
