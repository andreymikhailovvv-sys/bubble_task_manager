import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTelegramAiDraftEnabled,
  validateTelegramDraftInput,
  telegramDraftPayload,
  parseTelegramDraftOutput
} from '../src/services/telegram-user-client-draft.service.js';

const active = {
  TELEGRAM_USER_CLIENT_ENABLED: 'true',
  TELEGRAM_USER_SEND_ENABLED: 'true',
  TELEGRAM_USER_AI_DRAFT_ENABLED: 'true'
};

test('AI draft is off unless explicitly enabled alongside all MTProto send gates', () => {
  assert.equal(isTelegramAiDraftEnabled({}), false);
  assert.equal(isTelegramAiDraftEnabled({ TELEGRAM_USER_AI_DRAFT_ENABLED: 'true' }), false);
  assert.equal(isTelegramAiDraftEnabled({ ...active, TELEGRAM_USER_SEND_ENABLED: 'false' }), false);
  assert.equal(isTelegramAiDraftEnabled({ ...active, TELEGRAM_USER_CLIENT_ENABLED: 'false' }), false);
  assert.equal(isTelegramAiDraftEnabled({ ...active, TELEGRAM_USER_AI_DRAFT_ENABLED: 'TRUE' }), false);
  assert.equal(isTelegramAiDraftEnabled(active), true);
});

test('draft instructions and selected style must be bounded and explicit', () => {
  assert.deepEqual(validateTelegramDraftInput('  Сообщи, что опоздаю  ', 'friendly'), {
    instructions: 'Сообщи, что опоздаю', tone: 'friendly'
  });
  for (const tone of ['neutral', 'friendly', 'formal']) {
    assert.equal(validateTelegramDraftInput('Напиши короткое напоминание', tone).tone, tone);
  }
  for (const invalid of ['', ' '.repeat(15), '\u0000danger', 'a'.repeat(2501), '🚀'.repeat(2500)]) {
    assert.throws(() => validateTelegramDraftInput(invalid, 'neutral'));
  }
  assert.throws(() => validateTelegramDraftInput('Текст', 'any'));
  assert.throws(() => validateTelegramDraftInput({ instruction: 'text' }, 'neutral'));
});

test('OpenAI draft payload has no tools, session, chat access or previous message history', () => {
  const payload = telegramDraftPayload('Напиши приглашение', 'formal', 'test-model');
  assert.equal(payload.model, 'test-model');
  assert.equal(payload.store, false);
  assert.equal(payload.tool_choice, 'none');
  assert.equal(payload.input.length, 2);
  assert.equal(payload.input[1].content, 'Напиши приглашение');
  assert.ok(!JSON.stringify(payload).includes('encryptedSession'));
  assert.ok(!JSON.stringify(payload).includes('telegramAccountId'));
  assert.ok(!JSON.stringify(payload).includes('sendMessage'));
});

test('parses only actual draft text and rejects blanks and overlong answers', () => {
  assert.equal(parseTelegramDraftOutput({ output_text: '  Привет! Увидимся завтра.  ' }), 'Привет! Увидимся завтра.');
  assert.equal(parseTelegramDraftOutput({ output: [
    { type: 'reasoning', content: [] },
    { type: 'message', content: [{ type: 'output_text', text: 'Здравствуйте! Спасибо за ответ.' }] }
  ] }), 'Здравствуйте! Спасибо за ответ.');
  assert.throws(() => parseTelegramDraftOutput({ output: [] }), /слишком длинный/);
  assert.throws(() => parseTelegramDraftOutput({ output_text: 'т'.repeat(1001) }), /слишком длинный/);
  assert.throws(() => parseTelegramDraftOutput({ output_text: '🚀'.repeat(1000) }), /слишком длинный/);
  assert.throws(() => parseTelegramDraftOutput({ output_text: 'Тест\u0000' }), /слишком длинный/);
});
