import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encryptTelegramAppCredentials, decryptTelegramAppCredentials, validateTelegramAppCredentials } from '../src/lib/telegram-user-app-credentials.js';

test('self-service Telegram applications credentials validate API ID/hash, never accept malformed secrets', () => {
  assert.deepEqual(validateTelegramAppCredentials('1234567', 'A'.repeat(32)), { apiId: 1234567, apiHash: 'a'.repeat(32) });
  for (const id of ['0','-123','123x','','1234567890123',null]) assert.throws(() => validateTelegramAppCredentials(id, 'a'.repeat(32)));
  for (const hash of ['secret','','z'.repeat(32),undefined,'a'.repeat(33)]) assert.throws(() => validateTelegramAppCredentials('123', hash));
});
test('application API secrets encrypt with owner context and are not returned in status', () => {
  const saved = process.env.TELEGRAM_USER_SESSION_KEY;
  process.env.TELEGRAM_USER_SESSION_KEY = 'f'.repeat(64);
  try {
    const v = { apiId: 123456, apiHash: 'abcd'.repeat(8) };
    const enc = encryptTelegramAppCredentials('owner-123', v);
    assert.ok(!enc.includes(v.apiHash));
    assert.deepEqual(decryptTelegramAppCredentials('owner-123', enc), v);
    assert.throws(() => decryptTelegramAppCredentials('owner-other', enc));
    assert.throws(() => decryptTelegramAppCredentials('owner-123', enc.slice(0,-2)+'zz'));
    assert.notEqual(encryptTelegramAppCredentials('owner-123', v), enc);
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_USER_SESSION_KEY; else process.env.TELEGRAM_USER_SESSION_KEY = saved;
  }
});
test('old administrator test routes removed; new owner routes require auth and same-origin writes', () => {
  const routes = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(routes, /\/admin\/users\/:userId\/telegram-user-client(?:-pilot|\/)/);
  for (const action of ['configure','start','password','cancel','disconnect']) {
    assert.match(routes, new RegExp('integrations/'+action+"', requireAuth, requireTelegramChatOrigin"));
  }
  assert.match(routes, /integrations\/status', requireAuth/);
  const admin = readFileSync(new URL('../../client/src/AdminPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(admin, /telegramAuthAction|updateTelegramPilot|adminTelegramManualSendPreview|закрытый пилот/);
});
test('all MTProto send/read capabilities require per-user encrypted credentials, not global shared API keys', () => {
  for (const path of ['telegram-user-client-send.service.ts','telegram-user-client-read.service.ts','telegram-user-client-chat-access.service.ts']) {
    const file = readFileSync(new URL('../src/services/'+path, import.meta.url), 'utf8');
    assert.match(file, /encryptedApiCredentials/);
    assert.doesNotMatch(file, /process\.env\.TELEGRAM_USER_API_(?:ID|HASH)/);
  }
  const db = readFileSync(new URL('../prisma/migrations/20261015170000_self_service_telegram_integrations/migration.sql', import.meta.url), 'utf8');
  assert.match(db, /"encryptedSession" = NULL/);
  assert.match(db, /"encryptedApiCredentials" = NULL/);
  assert.doesNotMatch(db, /UPDATE "User"|DELETE FROM "TelegramSession"/);
});
