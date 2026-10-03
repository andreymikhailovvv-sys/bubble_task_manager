import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { validateTelegramWebAppInitData } from '../src/lib/telegram-webapp-auth.js';

const BOT_TOKEN = '123456:test-token';
const NOW = 1_800_000_000;

const createInitData = (overrides: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    auth_date: String(NOW),
    query_id: 'AAExample',
    user: JSON.stringify({ id: 424242, first_name: 'Иван' }),
    ...overrides
  });
  const pairs = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs).digest('hex'));
  return params.toString();
};

test('проверяет подпись Telegram Web App и возвращает пользователя', () => {
  assert.equal(validateTelegramWebAppInitData(createInitData(), BOT_TOKEN, NOW).id, 424242);
});

test('отклоняет подменённые и просроченные данные Telegram Web App', () => {
  const tampered = new URLSearchParams(createInitData());
  tampered.set('user', JSON.stringify({ id: 1 }));
  assert.throws(() => validateTelegramWebAppInitData(tampered.toString(), BOT_TOKEN, NOW), /signature/);
  assert.throws(() => validateTelegramWebAppInitData(createInitData({ auth_date: String(NOW - 86_401) }), BOT_TOKEN, NOW), /expired/);
});
