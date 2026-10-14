import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeManualTelegramRequest,
  checkManualTelegramSendWindow,
  isManualTelegramSendingEnabled,
  telegramUserClientSend
} from '../src/services/telegram-user-client-send.service.js';

test('outbound Telegram send is independently disabled by default', () => {
  assert.equal(isManualTelegramSendingEnabled({}), false);
  assert.equal(isManualTelegramSendingEnabled({ TELEGRAM_USER_CLIENT_ENABLED: 'true' }), false);
  assert.equal(isManualTelegramSendingEnabled({ TELEGRAM_USER_SEND_ENABLED: 'true' }), false);
  assert.equal(isManualTelegramSendingEnabled({ TELEGRAM_USER_CLIENT_ENABLED: 'true', TELEGRAM_USER_SEND_ENABLED: 'TRUE' }), false);
  assert.equal(isManualTelegramSendingEnabled({ TELEGRAM_USER_CLIENT_ENABLED: 'true', TELEGRAM_USER_SEND_ENABLED: 'true' }), true);
});

test('manual sender accepts saved messages or one strict username, never arbitrary entities', () => {
  assert.deepEqual(normalizeManualTelegramRequest('saved', undefined, 'Test'), { kind: 'saved', username: null, text: 'Test' });
  assert.deepEqual(normalizeManualTelegramRequest('username', '@Alice_123', 'Hello'), { kind: 'username', username: '@alice_123', text: 'Hello' });
  for (const bad of ['@a', 'https://t.me/example', '-10012345678', '@channel/123', 'tg://user?id=123', '@name with space']) {
    assert.throws(() => normalizeManualTelegramRequest('username', bad, 'Hello'));
  }
  assert.throws(() => normalizeManualTelegramRequest('group', '@alice_123', 'Hello'));
  assert.throws(() => normalizeManualTelegramRequest('username', '@alice_123', ''));
  assert.throws(() => normalizeManualTelegramRequest('saved', null, ' '.repeat(100)));
  assert.throws(() => normalizeManualTelegramRequest('saved', null, 'a'.repeat(1001)));
  assert.throws(() => normalizeManualTelegramRequest('saved', null, 'Hello\u0000'));
  assert.throws(() => normalizeManualTelegramRequest('saved', null, '🚀'.repeat(1000)));
});

test('rate limits enforce 20s spacing, 3 in 10m, 12 in 24h even after server restarts', () => {
  const now = Date.parse('2026-10-15T13:00:00.000Z');
  assert.equal(checkManualTelegramSendWindow([], now), 0);
  assert.equal(checkManualTelegramSendWindow([new Date(now - 5_000)], now), 15);
  assert.equal(checkManualTelegramSendWindow([new Date(now - 21_000)], now), 0);
  const recent = [9, 8, 7].map((minutes) => new Date(now - minutes * 60_000));
  assert.equal(checkManualTelegramSendWindow(recent, now), 60);
  assert.equal(checkManualTelegramSendWindow([...recent].reverse(), now), 60);
  const fullDay = Array.from({ length: 12 }, (_, i) => new Date(now - (12 - i) * 60 * 60_000));
  assert.equal(checkManualTelegramSendWindow(fullDay, now), 12 * 60 * 60);
});

test('confirm requires a well-formed single-use token before any database or Telegram work', async () => {
  await assert.rejects(telegramUserClientSend.confirm('user-id', 'not-a-uuid'), /Некорректный код/);
  await assert.rejects(telegramUserClientSend.confirm('user-id', '11111111-2222-4333-8444-555555555555'), /истекло или уже использовано/);
});
