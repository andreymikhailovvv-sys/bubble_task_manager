import assert from 'node:assert/strict';
import test from 'node:test';
import { FormData } from 'undici';
import {
  createTelegramBotApiRelayController, parseBotApiRelayEnvelope
} from '../src/controllers/telegram-bot-api-relay.controller.js';
import { buildTelegramBotApiRelayEnvelope } from '../src/lib/telegram-fetch.js';

const TEST_TOKEN = '123456:fakeBotTokenForTesting';
const LEGACY_RENDER_BOT_TOKEN = '654321:deprecatedRenderBotForTesting';
const TEST_SECRET = 'telegram_render_outbound_relay_secret_testing_32';
const VARIABLES = ['TELEGRAM_BOT_API_RELAY_ENABLED', 'TELEGRAM_BOT_API_RELAY_SECRET', 'TELEGRAM_BOT_TOKEN'] as const;
const saved = Object.fromEntries(VARIABLES.map(key => [key, process.env[key]]));

test.afterEach(() => {
  for (const key of VARIABLES) {
    const original = saved[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function setup() {
  process.env.TELEGRAM_BOT_API_RELAY_ENABLED = 'true';
  process.env.TELEGRAM_BOT_API_RELAY_SECRET = TEST_SECRET;
  process.env.TELEGRAM_BOT_TOKEN = LEGACY_RENDER_BOT_TOKEN;
}
function request(body: unknown, secret: string | undefined = TEST_SECRET, botToken: string | null = TEST_TOKEN) {
  return {
    body: body && typeof body === 'object'
      ? { ...body, ...(botToken === null ? {} : { botToken }) }
      : body,
    get: (name: string) => name === 'x-telegram-outbound-relay-secret' ? secret : undefined
  };
}
function response() {
  const out: { status: number; payload?: unknown; headers: Record<string, string> } = { status: 0, headers: {} };
  return {
    out,
    res: {
      status(value: number) { out.status = value; return this; },
      set(key: string, value: string) { out.headers[key] = value; return this; },
      json(payload: unknown) { out.payload = payload; return this; },
      send(payload: unknown) { out.payload = payload; return this; }
    }
  };
}

test('outbound relay is disabled by default and never calls Telegram', async () => {
  const mock = async () => { throw new Error('must not fetch'); };
  const { out, res } = response();
  await createTelegramBotApiRelayController(mock as typeof fetch)
    .forward(request({ kind: 'api', method: 'sendMessage', payload: {} }) as never, res as never);
  assert.equal(out.status, 404);
});

test('fails closed with missing configuration and wrong relay credentials', async () => {
  setup();
  delete process.env.TELEGRAM_BOT_API_RELAY_SECRET;
  const mock = async () => { throw new Error('must not fetch'); };
  const controller = createTelegramBotApiRelayController(mock as typeof fetch);
  const first = response();
  await controller.forward(request({ kind: 'api', method: 'getFile', payload: {} }) as never, first.res as never);
  assert.equal(first.out.status, 503);
  process.env.TELEGRAM_BOT_API_RELAY_SECRET = TEST_SECRET;
  const noOutboundToken = response();
  await controller.forward(request({ kind: 'api', method: 'getFile', payload: {} }, TEST_SECRET, null) as never, noOutboundToken.res as never);
  assert.equal(noOutboundToken.out.status, 400, 'must not fall back to legacy Render bot token');
  const second = response();
  await controller.forward(request({ kind: 'api', method: 'getFile', payload: {} }, 'wrong') as never, second.res as never);
  assert.equal(second.out.status, 401);
});

test('rejects disallowed methods, URL traversal, and malformed payloads', async () => {
  assert.equal(parseBotApiRelayEnvelope({ kind: 'api', method: 'setWebhook', payload: {} }), null);
  assert.equal(parseBotApiRelayEnvelope({ kind: 'api', method: 'getUpdates', payload: {} }), null);
  assert.equal(parseBotApiRelayEnvelope({ kind: 'api', method: 'sendMessage', payload: 'bad' }), null);
  assert.equal(parseBotApiRelayEnvelope({ kind: 'file', path: '../secrets' }), null);
  assert.equal(parseBotApiRelayEnvelope({ kind: 'file', path: 'voice/%2e%2e/file.ogg' }), null);
  assert.equal(parseBotApiRelayEnvelope({ kind: 'file', path: 'voice/file.ogg?evil=true' }), null);
  assert.deepEqual(parseBotApiRelayEnvelope({ kind: 'file', path: 'voice/file_1.oga' }),
    { kind: 'file', path: 'voice/file_1.oga' });
  setup();
  const mock = async () => { throw new Error('must not fetch'); };
  const { out, res } = response();
  await createTelegramBotApiRelayController(mock as typeof fetch)
    .forward(request({ kind: 'api', method: 'deleteWebhook', payload: {} }) as never, res as never);
  assert.equal(out.status, 400);
});

test('forwards sendMessage with the dedicated Timeweb bot token, never the legacy Render bot token', async () => {
  setup();
  let url = '';
  let init: RequestInit | undefined;
  const mock = async (target: string | URL | Request, options?: RequestInit) => {
    url = String(target);
    init = options;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  const { out, res } = response();
  await createTelegramBotApiRelayController(mock as typeof fetch)
    .forward(request({ kind: 'api', method: 'sendMessage', payload: { chat_id: 42, text: 'hi' } }) as never, res as never);
  assert.equal(url, `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`);
  assert.ok(!url.includes(LEGACY_RENDER_BOT_TOKEN));
  assert.equal(init?.method, 'POST');
  assert.equal(JSON.parse(String(init?.body)).text, 'hi');
  assert.equal(out.status, 200);
  assert.equal(out.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse((out.payload as Buffer).toString()).ok, true);
});

test('downloads files from fixed Telegram host and returns unchanged binary bytes', async () => {
  setup();
  let url = '';
  const mock = async (target: string | URL | Request) => {
    url = String(target);
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'audio/ogg' } });
  };
  const { out, res } = response();
  await createTelegramBotApiRelayController(mock as typeof fetch)
    .forward(request({ kind: 'file', path: 'voice/file_1.oga' }) as never, res as never);
  assert.equal(url, `https://api.telegram.org/file/bot${TEST_TOKEN}/voice/file_1.oga`);
  assert.equal(out.status, 200);
  assert.equal(out.headers['Content-Type'], 'audio/ogg');
  assert.deepEqual([...out.payload as Buffer], [1, 2, 3, 4]);
});

test('reconstructs photo multipart from validated base64, keeping binary intact', async () => {
  setup();
  let photo: Uint8Array | undefined;
  const mock = async (_target: string | URL | Request, options?: RequestInit) => {
    const form = options?.body as FormData;
    const value = form.get('photo');
    assert.ok(value && typeof value !== 'string');
    photo = new Uint8Array(await value.arrayBuffer());
    assert.equal(form.get('chat_id'), '42');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const body = {
    kind: 'multipart', method: 'sendPhoto', parts: [
      { name: 'chat_id', value: '42' },
      { name: 'photo', filename: 'picture.jpg', mimeType: 'image/jpeg', base64: 'AQIDBA==' }
    ]
  };
  const { out, res } = response();
  await createTelegramBotApiRelayController(mock as typeof fetch)
    .forward(request(body) as never, res as never);
  assert.equal(out.status, 200);
  assert.deepEqual([...(photo ?? [])], [1, 2, 3, 4]);
});

test('preserves Telegram errors and returns 502 when upstream connection fails', async () => {
  setup();
  const body = { kind: 'api', method: 'sendMessage', payload: { chat_id: 42, text: 'x' } };
  const errorResponse = response();
  await createTelegramBotApiRelayController((async () =>
    new Response('Bad Request: chat not found', { status: 400 })) as typeof fetch)
    .forward(request(body) as never, errorResponse.res as never);
  assert.equal(errorResponse.out.status, 400);
  assert.match(String(errorResponse.out.payload), /chat not found/);

  const unavailableResponse = response();
  await createTelegramBotApiRelayController((async () => {
    throw new Error('network unavailable');
  }) as typeof fetch)
    .forward(request(body) as never, unavailableResponse.res as never);
  assert.equal(unavailableResponse.out.status, 502);
});

test('Timeweb validates outgoing envelopes before including the token in the authenticated relay request', async () => {
  setup();
  // On Timeweb the configured bot is the main bot, not Render's legacy bot.
  process.env.TELEGRAM_BOT_TOKEN = TEST_TOKEN;
  const apiEnvelope = await buildTelegramBotApiRelayEnvelope(
    `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`, {
      method: 'POST', body: JSON.stringify({ chat_id: 42, text: 'hello' })
    });
  assert.deepEqual(apiEnvelope, { kind: 'api', method: 'sendMessage', payload: { chat_id: 42, text: 'hello' } });
  assert.ok(!JSON.stringify(apiEnvelope).includes(TEST_TOKEN));
  const relayPayload = { ...apiEnvelope, botToken: TEST_TOKEN };
  assert.equal(relayPayload.botToken, TEST_TOKEN);
  assert.deepEqual(parseBotApiRelayEnvelope(relayPayload), apiEnvelope);

  const fileEnvelope = await buildTelegramBotApiRelayEnvelope(
    `https://api.telegram.org/file/bot${TEST_TOKEN}/voice/file_1.oga`);
  assert.deepEqual(fileEnvelope, { kind: 'file', path: 'voice/file_1.oga' });

  const form = new FormData();
  form.append('chat_id', '42');
  form.append('photo', new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }), 'picture.png');
  const photoEnvelope = await buildTelegramBotApiRelayEnvelope(
    `https://api.telegram.org/bot${TEST_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  assert.equal(photoEnvelope.kind, 'multipart');
  assert.ok(!JSON.stringify(photoEnvelope).includes(TEST_TOKEN));

  await assert.rejects(buildTelegramBotApiRelayEnvelope(
    'https://evil.example/bot123456:fakeBotTokenForTesting/sendMessage',
    { method: 'POST', body: '{}' }
  ), /only supports the configured Bot API/);
});
