import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramRelayController } from '../src/controllers/telegram-relay.controller.js';

const ENV_KEYS = [
  'TELEGRAM_RELAY_ENABLED',
  'TELEGRAM_RELAY_TARGET_URL',
  'TELEGRAM_RELAY_SOURCE_SECRET',
  'TELEGRAM_RELAY_TARGET_SECRET'
] as const;

const makeRequest = (secret?: string, body: unknown = { update_id: 123456 }) => ({
  body,
  get: (name: string) => name === 'x-telegram-bot-api-secret-token' ? secret : undefined
});

const makeResponse = () => {
  const result = { status: 0, body: undefined as unknown };
  return {
    result,
    response: {
      status(status: number) {
        result.status = status;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      }
    }
  };
};

const configureRelay = () => {
  process.env.TELEGRAM_RELAY_ENABLED = 'true';
  process.env.TELEGRAM_RELAY_TARGET_URL = 'https://target.example/api/telegram/webhook';
  process.env.TELEGRAM_RELAY_SOURCE_SECRET = 'source-secret';
  process.env.TELEGRAM_RELAY_TARGET_SECRET = 'target-secret';
};

test.afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

test('returns 404 without forwarding when relay is disabled', async () => {
  const fetchMock = async () => { throw new Error('fetch must not be called'); };
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest() as never, response as never);
  assert.equal(result.status, 404);
});

test('returns 503 without forwarding when required configuration is missing', async () => {
  process.env.TELEGRAM_RELAY_ENABLED = 'true';
  const fetchMock = async () => { throw new Error('fetch must not be called'); };
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest() as never, response as never);
  assert.equal(result.status, 503);
});

test('returns 401 for an invalid source secret', async () => {
  configureRelay();
  const fetchMock = async () => { throw new Error('fetch must not be called'); };
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest('wrong') as never, response as never);
  assert.equal(result.status, 401);
});

test('forwards the update and target secret and returns 200 for target 2xx', async () => {
  configureRelay();
  let forwarded: { url?: string; init?: RequestInit } = {};
  const fetchMock = async (url: URL | RequestInfo, init?: RequestInit) => {
    forwarded = { url: String(url), init };
    return new Response(null, { status: 204 });
  };
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest('source-secret') as never, response as never);

  assert.equal(result.status, 200);
  assert.equal(forwarded.url, 'https://target.example/api/telegram/webhook');
  assert.equal(forwarded.init?.method, 'POST');
  assert.equal((forwarded.init?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.equal((forwarded.init?.headers as Record<string, string>)['x-telegram-bot-api-secret-token'], 'target-secret');
  assert.equal(forwarded.init?.body, JSON.stringify({ update_id: 123456 }));
});

test('returns 5xx when target responds with 500', async () => {
  configureRelay();
  const fetchMock = async () => new Response(null, { status: 500 });
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest('source-secret') as never, response as never);
  assert.equal(result.status, 502);
});

test('returns 5xx when target connection fails', async () => {
  configureRelay();
  const fetchMock = async () => { throw new Error('connection failed'); };
  const { result, response } = makeResponse();
  await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest('source-secret') as never, response as never);
  assert.equal(result.status, 502);
});

test('returns 5xx when target request times out', async () => {
  configureRelay();
  const fetchMock = (_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: TimerHandler) => originalSetTimeout(handler, 0)) as typeof setTimeout;
  try {
    const { result, response } = makeResponse();
    await createTelegramRelayController(fetchMock as typeof fetch).webhook(makeRequest('source-secret') as never, response as never);
    assert.equal(result.status, 504);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});
