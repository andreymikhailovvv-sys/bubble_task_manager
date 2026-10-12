import assert from 'node:assert/strict';
import test from 'node:test';
import { isTelegramWebhookSecretConfigured, isTelegramWebhookSecretValid } from '../src/lib/telegram-webhook-security.js';

test('configured Telegram webhook secret is mandatory and has Bot API-compatible characters', () => {
  assert.equal(isTelegramWebhookSecretConfigured(undefined), false);
  assert.equal(isTelegramWebhookSecretConfigured(''), false);
  assert.equal(isTelegramWebhookSecretConfigured('bad secret'), false);
  assert.equal(isTelegramWebhookSecretConfigured('token!'), false);
  assert.equal(isTelegramWebhookSecretConfigured('a'.repeat(257)), false);
  assert.equal(isTelegramWebhookSecretConfigured('Aa09_-'), true);
  assert.equal(isTelegramWebhookSecretConfigured('a'.repeat(256)), true);
});

test('missing secret is fail-closed even for empty/missing header', () => {
  for (const configured of [undefined, '', null, 'invalid secret']) {
    for (const supplied of [undefined, '', null, 'anything', ['anything']]) {
      assert.equal(isTelegramWebhookSecretValid(configured, supplied), false);
    }
  }
});

test('webhook compares configured and received tokens exactly', () => {
  const secret = 'AbCd_-0123456789_AbCd0123456789';
  assert.equal(isTelegramWebhookSecretValid(secret, secret), true);
  assert.equal(isTelegramWebhookSecretValid(secret, secret.toLowerCase()), false);
  assert.equal(isTelegramWebhookSecretValid(secret, secret + 'extra'), false);
  assert.equal(isTelegramWebhookSecretValid(secret, secret.slice(1)), false);
  assert.equal(isTelegramWebhookSecretValid(secret, 'x'.repeat(300)), false);
  assert.equal(isTelegramWebhookSecretValid(secret, [secret]), false);
});
