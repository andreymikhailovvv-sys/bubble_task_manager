import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskChatOpenAiPayload } from '../src/services/ai-assistant.service.js';
import { aiAssistantService } from '../src/services/ai-assistant.service.js';
import { isDynamicTaskChatBillingEnabled } from '../src/controllers/ai.controller.js';
import { prisma } from '../src/db/prisma.js';

test('task chat OpenAI payload включает одинаковый retrieval protocol для preflight и response', () => {
  const message = { role: 'assistant', content: 'Ответ', creditsSpentMilli: 1054, id: 'message-id', createdAt: 'now', billing: { mode: 'dynamic' } } as any;
  const payload = createTaskChatOpenAiPayload('gpt-6-luna', [message]);
  assert.deepEqual(payload.input, [{ role: 'assistant', content: 'Ответ' }]);
  assert.equal(payload.tool_choice, 'auto');
  assert.equal(payload.parallel_tool_calls, false);
  assert.equal(payload.tools[0].name, 'task_context_lookup');
  assert.equal(createTaskChatOpenAiPayload('gpt-6-luna', [message], 512).max_output_tokens, 512);
  const finalPayload = createTaskChatOpenAiPayload('gpt-6-luna', [message], 512, { allowTools: false });
  assert.equal(finalPayload.tool_choice, 'none');
  assert.equal('tools' in finalPayload, false);
});

test('история хранит фактическую dynamic и legacy стоимость только у ответов ИИ', async () => {
  const originalFindTask = prisma.task.findFirstOrThrow;
  const originalCreate = prisma.taskAiMessage.create;
  const originalCreateMany = prisma.taskAiMessage.createMany;
  const created: Array<Record<string, unknown>> = [];
  (prisma.task.findFirstOrThrow as any) = async () => ({ id: 'task-1' });
  (prisma.taskAiMessage.create as any) = async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; };
  (prisma.taskAiMessage.createMany as any) = async ({ data }: { data: Array<Record<string, unknown>> }) => { created.push(...data); return { count: data.length }; };
  try {
    await aiAssistantService.appendTaskDialogAssistantMessage({ userId: 'user-1', taskId: 'task-1', content: 'Dynamic', creditsSpentMilli: 1054 });
    await aiAssistantService.appendTaskDialogAssistantMessage({ userId: 'user-1', taskId: 'task-1', content: 'Legacy', creditsSpentMilli: 5000 });
    await aiAssistantService.appendTaskDialogMessages({ userId: 'user-1', taskId: 'task-1', messages: [{ role: 'user', content: 'Вопрос' }] });
    assert.deepEqual(created.map(({ role, creditsSpentMilli }) => ({ role, creditsSpentMilli })), [
      { role: 'assistant', creditsSpentMilli: 1054 },
      { role: 'assistant', creditsSpentMilli: 5000 },
      { role: 'user', creditsSpentMilli: undefined }
    ]);
  } finally {
    (prisma.task.findFirstOrThrow as any) = originalFindTask;
    (prisma.taskAiMessage.create as any) = originalCreate;
    (prisma.taskAiMessage.createMany as any) = originalCreateMany;
  }
});

test('history API model сохраняет стоимость ответа и не выдумывает её для старых сообщений', async () => {
  const originalFindTask = prisma.task.findFirstOrThrow;
  const originalFindMany = prisma.taskAiMessage.findMany;
  (prisma.task.findFirstOrThrow as any) = async () => ({ id: 'task-1' });
  (prisma.taskAiMessage.findMany as any) = async () => [
    { role: 'assistant', content: 'Старый ответ', creditsSpentMilli: null },
    { role: 'assistant', content: 'Новый ответ', creditsSpentMilli: 593 },
    { role: 'user', content: 'Вопрос', creditsSpentMilli: null }
  ];
  try {
    assert.deepEqual(await aiAssistantService.listTaskDialog({ userId: 'user-1', taskId: 'task-1' }), [
      { role: 'assistant', content: 'Старый ответ' },
      { role: 'assistant', content: 'Новый ответ', creditsSpentMilli: 593 },
      { role: 'user', content: 'Вопрос' }
    ]);
  } finally {
    (prisma.task.findFirstOrThrow as any) = originalFindTask;
    (prisma.taskAiMessage.findMany as any) = originalFindMany;
  }
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
