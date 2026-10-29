import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSelectableAiChatModel, SELECTABLE_AI_CHAT_MODELS } from '../src/lib/ai-chat-model.js';

test('Terra replaces Mini while legacy clients still resolve to the new middle model', () => {
  assert.deepEqual(SELECTABLE_AI_CHAT_MODELS, ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol']);
  assert.equal(normalizeSelectableAiChatModel('gpt-6.1-terra'), 'gpt-6.1-terra');
  assert.equal(normalizeSelectableAiChatModel('gpt-5.4-mini'), 'gpt-6.1-terra');
  assert.equal(normalizeSelectableAiChatModel('made-up-model'), undefined);
});
