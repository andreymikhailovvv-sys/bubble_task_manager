import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AI_CHAT_OPENAI_TOOLS } from '../src/services/ai-chat-tools.service.js';
import { matchTelegramRecipient, validateTelegramDraftArguments } from '../src/services/telegram-inline-send-draft.service.js';
import { validateQuickSendInput } from '../src/services/telegram-quick-share.service.js';

const people = [
  { id: '12345', name: 'Иван Иванов', username: '@vanya_ivanov' },
  { id: '45678', name: 'Иван Сидоров', username: null },
  { id: '99999', name: 'Анна Иванова', username: '@ivanova' }
];

test('Telegram AI tool prepares one card, not a callable send', () => {
  const tool = AI_CHAT_OPENAI_TOOLS.find(x => x.name === 'prepare_telegram_send');
  assert.ok(tool);
  assert.equal(tool.type, 'function');
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.parameters.required, ['recipient', 'text']);
  assert.deepEqual(Object.keys(tool.parameters.properties), ['recipient', 'text']);
  assert.equal(AI_CHAT_OPENAI_TOOLS.some(x => x.name === 'telegram_send'), false);
});

test('recipient resolution accepts only unique matches and never guesses ambiguous names', () => {
  assert.deepEqual(matchTelegramRecipient('Иван Иванов', people), { match: 'exact', recipient: people[0] });
  assert.deepEqual(matchTelegramRecipient('@vanya_ivanov', people), { match: 'exact', recipient: people[0] });
  assert.deepEqual(matchTelegramRecipient('Сидоров', people), { match: 'unique', recipient: people[1] });
  assert.deepEqual(matchTelegramRecipient('Иван', people), { match: 'ambiguous', recipient: null });
  assert.deepEqual(matchTelegramRecipient('Пётр Петров', people), { match: 'not_found', recipient: null });
});

test('invalid recipient, text, or tool arguments never create a send draft', () => {
  assert.deepEqual(validateTelegramDraftArguments({ recipient: ' Ваня ', text: 'Тест' }), { recipient: 'Ваня', text: 'Тест' });
  assert.throws(() => validateTelegramDraftArguments({ recipient: '', text: 'hello' }));
  assert.throws(() => validateTelegramDraftArguments({ recipient: 'Ваня', text: '' }));
  assert.throws(() => validateTelegramDraftArguments({ recipient: 'Ваня', text: 'x'.repeat(4001) }));
  assert.throws(() => validateTelegramDraftArguments(null));
  assert.throws(() => validateTelegramDraftArguments({ recipient: 'Ваня', text: 123 }));
});

test('approval reuses the existing durable idempotent quick send and includes only one recipient', () => {
  const data = validateQuickSendInput({
    requestId: randomUUID(),
    recipientIds: ['12345'],
    text: 'Договорились обсудить проект в пятницу.',
    mode: 'DIRECT'
  });
  assert.equal(data.recipientIds.length, 1);
  assert.equal(data.mode, 'DIRECT');
  assert.equal(data.instruction, null);
});
