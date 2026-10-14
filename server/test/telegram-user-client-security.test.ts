import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptTelegramUserSession, encryptTelegramUserSession } from '../src/lib/telegram-user-client-crypto.js';
import { canUseTelegramUserClient, isTelegramUserClientGloballyEnabled } from '../src/lib/telegram-user-client-access.js';

const KEY = 'd4'.repeat(32);

test('encrypts MTProto session with fresh nonce, authenticates owner and recovers original', () => {
  const secret = 'sensitive-telegram-user-session';
  const first = encryptTelegramUserSession(secret, 'user-a', KEY);
  const second = encryptTelegramUserSession(secret, 'user-a', KEY);
  assert.notEqual(first, second);
  assert.ok(!first.includes(secret));
  assert.equal(decryptTelegramUserSession(first, 'user-a', KEY), secret);
  assert.throws(() => decryptTelegramUserSession(first, 'user-b', KEY), /authentication failed/);
});

test('rejects modified encrypted data and incorrect keys', () => {
  const value = encryptTelegramUserSession('auth-key-data', 'user-a', KEY);
  const tampered = value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A');
  assert.throws(() => decryptTelegramUserSession(tampered, 'user-a', KEY));
  assert.throws(() => decryptTelegramUserSession(value, 'user-a', 'ab'.repeat(32)), /authentication failed/);
  assert.throws(() => decryptTelegramUserSession('plaintext', 'user-a', KEY), /Invalid Telegram session envelope/);
});

test('missing or weak encryption keys fail closed', () => {
  assert.throws(() => encryptTelegramUserSession('session', 'user-a', ''), /32-byte hex secret/);
  assert.throws(() => decryptTelegramUserSession('invalid', 'user-a', 'weak'), /32-byte hex secret/);
  assert.throws(() => encryptTelegramUserSession('session', '', KEY), /Invalid Telegram session owner/);
});

test('global kill switch and per-user permission are both required', () => {
  assert.equal(isTelegramUserClientGloballyEnabled(undefined), false);
  assert.equal(isTelegramUserClientGloballyEnabled('TRUE'), false);
  assert.equal(canUseTelegramUserClient(true, undefined), false);
  assert.equal(canUseTelegramUserClient(false, 'true'), false);
  assert.equal(canUseTelegramUserClient(true, 'true'), true);
});
