import assert from 'node:assert/strict';
import test from 'node:test';
import { attachChatMessageId } from './chatMessages.js';

test('сохраняет стоимость ответа ИИ при добавлении идентификатора', () => {
  const message = attachChatMessageId({
    role: 'assistant',
    content: 'Готово',
    creditsSpentMilli: 1054
  }, 'message-id');

  assert.deepEqual(message, {
    id: 'message-id',
    role: 'assistant',
    content: 'Готово',
    creditsSpentMilli: 1054
  });
});
