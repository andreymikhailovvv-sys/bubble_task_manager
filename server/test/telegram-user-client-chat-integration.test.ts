import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramChatRequestIsSameOrigin } from '../src/lib/telegram-chat-origin.js';
import { requireTelegramReadOwner } from '../src/services/telegram-user-client-read.service.js';
import { validateTelegramContextConsent } from '../src/services/telegram-user-client-dialog-assistant.service.js';
import { normalizeManualTelegramRequest } from '../src/services/telegram-user-client-send.service.js';

test('Telegram chat cookie-authenticated write endpoints reject cross-site and forged origins', () => {
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example', 'plan.example', 'same-origin'), true);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example:443', 'plan.example', 'same-origin'), true);
  assert.equal(telegramChatRequestIsSameOrigin(undefined, 'plan.example', 'same-origin'), true);
  assert.equal(telegramChatRequestIsSameOrigin('http://localhost:5173', 'localhost:5173', 'same-origin'), true);
  assert.equal(telegramChatRequestIsSameOrigin('https://evil.example', 'plan.example', 'cross-site'), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example', 'plan.example', 'cross-site'), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example', 'plan.example', 'same-site'), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://evil.example', 'plan.example', 'same-origin'), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example.attacker.com', 'plan.example', 'same-origin'), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example:123', 'plan.example', 'same-origin'), false);
  assert.equal(telegramChatRequestIsSameOrigin('invalid', 'plan.example', 'same-origin'), false);
  assert.equal(telegramChatRequestIsSameOrigin(undefined, 'plan.example', undefined), false);
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example', undefined, 'same-origin'), false);
});

test('chat history is user-owned and AI analysis still requires individual context consent', () => {
  assert.doesNotThrow(() => requireTelegramReadOwner('owner', 'owner'));
  assert.throws(() => requireTelegramReadOwner('owner', 'other-owner'), /только владелец/);
  const request = { dialogId: '123456', fingerprint: 'a'.repeat(64), instruction: 'Ответь кратко', tone: 'friendly', consent: false };
  assert.throws(() => validateTelegramContextConsent(request), /отдельное подтверждение/);
  assert.equal(validateTelegramContextConsent({ ...request, consent: true }).dialogId, '123456');
  assert.throws(() => normalizeManualTelegramRequest('username', '@person', ''), /1000 символов/);
});

test('no Telegram account information or chat text in capability or request origin guard', () => {
  assert.equal(telegramChatRequestIsSameOrigin('https://plan.example', 'plan.example', 'same-origin'), true);
  assert.equal(typeof telegramChatRequestIsSameOrigin('https://plan.example', 'plan.example', 'same-origin'), 'boolean');
});
