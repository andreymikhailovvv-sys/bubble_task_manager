import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaskChatContext,
  estimateTaskChatTokens,
  isTaskChatContextV2Enabled,
  selectRecentTaskChatHistory,
  TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES,
  TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V1,
  TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES,
  TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1
} from '../src/services/task-chat-context.service.js';

const task = {
  id: 'task-1',
  title: 'X',
  description: 'Длинное описание основной задачи',
  dueDate: new Date('2026-10-05T10:00:00.000Z'),
  importance: 8,
  urgency: 7,
  priorityScore: 56,
  status: 'IN_PROGRESS',
  sphere: { id: 'sphere-1', name: 'Работа' },
  subtasks: [{
    id: 'subtask-1',
    title: 'Y',
    description: 'ОЧЕНЬ ДЛИННОЕ ОПИСАНИЕ ПОДЗАДАЧИ',
    dueDate: new Date('2026-10-08T10:00:00.000Z'),
    status: 'TODO'
  }],
  attachments: [{ id: 'attachment-1', name: 'contract.pdf', mimeType: 'application/pdf', size: 999_999 }]
};

test('V2 оставляет полный контекст задачи, но сокращает подзадачи и metadata файлов', () => {
  const result = buildTaskChatContext({ task, history: [], userTimeZone: 'UTC', hasAttachments: false });
  assert.match(result.taskContext, /Длинное описание основной задачи/);
  assert.match(result.taskContext, /Y \| TODO \| срок:/);
  assert.doesNotMatch(result.taskContext, /ОЧЕНЬ ДЛИННОЕ ОПИСАНИЕ ПОДЗАДАЧИ/);
  assert.match(result.taskContext, /contract\.pdf \(application\/pdf\)/);
  assert.doesNotMatch(result.taskContext, /999999|размер/);
  assert.equal(result.diagnostics.activeSubtasksCount, 1);
  assert.equal(result.diagnostics.subtasksPreviewed, 1);
  assert.equal(result.diagnostics.storedAttachmentsPreviewed, 1);
  assert.equal(result.diagnostics.storedAttachmentContentIncluded, false);
});

test('preview ограничивает подзадачи и файлы, сохраняя итоговые количества', () => {
  const many = {
    ...task,
    subtasks: Array.from({ length: 14 }, (_, index) => ({ id: `s-${index}`, title: `Подзадача ${index}`, description: 'секрет', dueDate: null, status: 'TODO' })),
    attachments: Array.from({ length: 12 }, (_, index) => ({ id: `a-${index}`, name: `file-${index}.pdf`, mimeType: 'application/pdf' }))
  };
  const result = buildTaskChatContext({ task: many, history: [], userTimeZone: 'UTC', hasAttachments: false });
  assert.match(result.taskContext, /Активных: 14/);
  assert.match(result.taskContext, /Ещё 2 подзадач/);
  assert.doesNotMatch(result.taskContext, /\[s-12\]/);
  assert.match(result.taskContext, /Всего файлов: 12/);
  assert.doesNotMatch(result.taskContext, /\[a-10\]/);
});

test('короткая история сохраняет все 20 сообщений и хронологический порядок', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `message-${index}` }));
  const result = selectRecentTaskChatHistory(history, { tokenBudget: 12_000, maxMessages: 20 });
  assert.equal(result.messages.length, 20);
  assert.equal(result.messages[0].content, 'message-0');
  assert.equal(result.messages[19].content, 'message-19');
});

test('token budget выбирает максимально возможный непрерывный хвост', () => {
  const history = [
    { role: 'user' as const, content: 'а'.repeat(300) },
    { role: 'assistant' as const, content: 'б'.repeat(300) },
    { role: 'user' as const, content: 'короткий-1' },
    { role: 'assistant' as const, content: 'короткий-2' }
  ];
  const result = selectRecentTaskChatHistory(history, { tokenBudget: 10, maxMessages: 20 });
  assert.deepEqual(result.messages.map(({ content }) => content), ['короткий-1', 'короткий-2']);
});

test('одно самое новое большое сообщение включается целиком поверх бюджета', () => {
  const content = 'я'.repeat((TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1 * 3) + 1);
  const result = selectRecentTaskChatHistory([{ role: 'user', content }], {
    tokenBudget: TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1,
    maxMessages: TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES
  });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].content, content);
  assert.equal(result.estimatedTokens, estimateTaskChatTokens(content));
  assert.equal(result.historyBudgetExceededBySingleMessage, true);
});

test('режим вложений использует отдельные budget и hard cap', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: 'user' as const, content: `m-${index}` }));
  const regular = buildTaskChatContext({ task, history, userTimeZone: 'UTC', hasAttachments: false });
  const attachments = buildTaskChatContext({ task, history, userTimeZone: 'UTC', hasAttachments: true });
  assert.equal(regular.diagnostics.historyBudget, TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1);
  assert.equal(regular.diagnostics.historyMaxMessages, TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES);
  assert.equal(regular.recentHistory.length, 20);
  assert.equal(attachments.diagnostics.historyBudget, TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V1);
  assert.equal(attachments.diagnostics.historyMaxMessages, TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES);
  assert.equal(attachments.recentHistory.length, 6);
});

test('feature flag поддерживает default-off, глобальное включение и allowlist', () => {
  const enabled = process.env.TASK_CHAT_CONTEXT_V2_ENABLED;
  const users = process.env.TASK_CHAT_CONTEXT_V2_USER_IDS;
  try {
    process.env.TASK_CHAT_CONTEXT_V2_ENABLED = 'false';
    assert.equal(isTaskChatContextV2Enabled('one'), false);
    process.env.TASK_CHAT_CONTEXT_V2_ENABLED = 'true';
    process.env.TASK_CHAT_CONTEXT_V2_USER_IDS = '';
    assert.equal(isTaskChatContextV2Enabled('one'), true);
    process.env.TASK_CHAT_CONTEXT_V2_USER_IDS = 'two, three';
    assert.equal(isTaskChatContextV2Enabled('one'), false);
    assert.equal(isTaskChatContextV2Enabled('three'), true);
  } finally {
    if (enabled === undefined) delete process.env.TASK_CHAT_CONTEXT_V2_ENABLED; else process.env.TASK_CHAT_CONTEXT_V2_ENABLED = enabled;
    if (users === undefined) delete process.env.TASK_CHAT_CONTEXT_V2_USER_IDS; else process.env.TASK_CHAT_CONTEXT_V2_USER_IDS = users;
  }
});

test('текущий вопрос не является частью history budget и не дублируется payload builder', async () => {
  const { createTaskChatOpenAiPayload } = await import('../src/services/ai-assistant.service.js');
  const history = [{ role: 'assistant' as const, content: 'Предыдущий ответ' }];
  const context = buildTaskChatContext({ task, history, userTimeZone: 'UTC', hasAttachments: false });
  const question = 'Новый вопрос';
  const payload = createTaskChatOpenAiPayload('model', [...context.recentHistory, { role: 'user', content: question }]);
  assert.equal(context.diagnostics.historyEstimatedTokens, estimateTaskChatTokens('Предыдущий ответ'));
  assert.equal(payload.input.filter((message) => message.content === question).length, 1);
});
