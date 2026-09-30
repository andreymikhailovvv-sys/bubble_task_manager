import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskChatOpenAiPayload } from '../src/services/ai-assistant.service.js';
import { isDynamicTaskChatBillingEnabled } from '../src/controllers/ai.controller.js';

test('task chat OpenAI payload удаляет внутренние поля истории для preflight и response', () => {
  const message = { role: 'user', content: 'Привет', creditsSpentMilli: 593, id: 'message-id', createdAt: 'now', billing: { mode: 'dynamic' } } as any;
  assert.deepEqual(createTaskChatOpenAiPayload('gpt-6-luna', [message]), { model: 'gpt-6-luna', input: [{ role: 'user', content: 'Привет' }] });
  assert.deepEqual(createTaskChatOpenAiPayload('gpt-6-luna', [message], 512), { model: 'gpt-6-luna', input: [{ role: 'user', content: 'Привет' }], max_output_tokens: 512 });
});

test('dynamic task chat flag поддерживает default-off и canary allowlist', () => {
  const previousEnabled = process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED;
  const previousUsers = process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS;
  try {
    process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED = 'false';
    assert.equal(isDynamicTaskChatBillingEnabled('one'), false);
    process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED = 'true';
    process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS = '';
    assert.equal(isDynamicTaskChatBillingEnabled('one'), true);
    process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS = 'two, three';
    assert.equal(isDynamicTaskChatBillingEnabled('one'), false);
    assert.equal(isDynamicTaskChatBillingEnabled('three'), true);
  } finally {
    if (previousEnabled === undefined) delete process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED; else process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED = previousEnabled;
    if (previousUsers === undefined) delete process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS; else process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS = previousUsers;
  }
});
