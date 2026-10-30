import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseTelegramRelayAtStartup } from '../src/services/telegram-relay-diagnostics.service.js';

const KEYS = [
  'TELEGRAM_RELAY_ENABLED', 'TELEGRAM_RELAY_TARGET_URL',
  'TELEGRAM_RELAY_TARGET_SECRET', 'TELEGRAM_RELAY_SOURCE_SECRET',
  'TELEGRAM_BOT_API_RELAY_ENABLED', 'TELEGRAM_BOT_API_RELAY_BOT_TOKEN'
] as const;

test('read-only checks verify incoming auth and inspect main bot webhook without changing anything', async () => {
  const saved = KEYS.map(key => process.env[key]);
  const originalInfo = console.info;
  const seen: Array<{ target: string; init?: RequestInit }> = [];
  const entries: Array<[string, unknown]> = [];
  try {
    process.env.TELEGRAM_RELAY_ENABLED = 'true';
    process.env.TELEGRAM_RELAY_TARGET_URL = 'https://planirovych.ru/api/telegram/webhook';
    process.env.TELEGRAM_RELAY_TARGET_SECRET = 'test_secret_123';
    process.env.TELEGRAM_RELAY_SOURCE_SECRET = 'source_secret_123';
    process.env.TELEGRAM_BOT_API_RELAY_ENABLED = 'true';
    process.env.TELEGRAM_BOT_API_RELAY_BOT_TOKEN = '123456:fakeTestToken';
    console.info = (label: unknown, info: unknown) => { entries.push([String(label), info]); };
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      seen.push({ target, init });
      if (target.startsWith('https://planirovych.ru/')) {
        return new Response(JSON.stringify({ error: 'Invalid Telegram update_id' }), { status: 400 });
      }
      assert.equal(target, 'https://api.telegram.org/bot123456:fakeTestToken/getWebhookInfo');
      return new Response(JSON.stringify({
        ok: true,
        result: { url: 'https://bubble-task-manager.onrender.com/api/telegram-relay', pending_update_count: 3 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await diagnoseTelegramRelayAtStartup(fetcher as typeof fetch);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].init?.method, 'POST');
    assert.equal(seen[0].init?.body, '{}');
    assert.equal((seen[0].init?.headers as Record<string, string>)['x-telegram-bot-api-secret-token'], 'test_secret_123');
    assert.equal(seen[1].init?.method, undefined);
    const auth = entries.find(([label]) => label.includes('target authentication probe'))?.[1] as { result: string };
    assert.equal(auth?.result, 'authorized_webhook_rejected_invalid_update_as_expected');
    const webhook = entries.find(([label]) => label.includes('main bot webhook info'))?.[1] as { webhookPathKind: string; pendingUpdates: number };
    assert.equal(webhook?.webhookPathKind, 'render_ingress_relay');
    assert.equal(webhook?.pendingUpdates, 3);
    assert.ok(!JSON.stringify(entries).includes('fakeTestToken'));
    assert.ok(!JSON.stringify(entries).includes('test_secret_123'));
  } finally {
    console.info = originalInfo;
    KEYS.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
