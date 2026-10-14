import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesBotLinkedTelegramAccount } from '../src/lib/telegram-user-client-binding.js';

test('QR login only binds the exact Telegram account linked through Bot API', () => {
  assert.equal(matchesBotLinkedTelegramAccount('1234567', '1234567', false), true);
  assert.equal(matchesBotLinkedTelegramAccount('1234567', '7654321', false), false);
  assert.equal(matchesBotLinkedTelegramAccount('1234567', '1234567', true), false);
  assert.equal(matchesBotLinkedTelegramAccount(null, '1234567', false), false);
  assert.equal(matchesBotLinkedTelegramAccount('1234567', '1234567 ', false), false);
  assert.equal(matchesBotLinkedTelegramAccount('1234567', '1234567', false), true);
});
