import type { ChatMessage } from './ai-assistant.service.js';

export const TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1 = 12_000;
export const TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES = 20;
export const TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V1 = 4_000;
export const TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES = 6;

export type TaskChatContextTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  importance: number;
  urgency: number;
  priorityScore: number;
  status: string;
  sphere?: { id: string; name: string } | null;
  parentTask?: { sphere?: { id: string; name: string } | null } | null;
  subtasks: Array<{ id: string; title: string; dueDate: Date | null; status: string }>;
  attachments?: Array<{ name: string; mimeType: string }>;
};

export type TaskChatContextDiagnostics = {
  contextVersion: 'v2' | 'v3';
  historyMessagesAvailable: number;
  historyMessagesUsed: number;
  historyEstimatedTokens: number;
  taskContextEstimatedTokens: number;
  activeSubtasksCount: number;
  storedAttachmentsCount: number;
  historyBudget: number;
  historyMaxMessages: number;
  historyBudgetExceededBySingleMessage: boolean;
};

/**
 * Консервативная оценка бюджета для русского текста. Реальное число входных
 * токенов по-прежнему берётся из /responses/input_tokens. Фиксированная оценка
 * заменяет o200k_base только потому, что tokenizer может быть недоступен в runtime.
 */
export function estimateTaskChatTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function normalizeTaskChatHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content.length > 0);
}

export function selectRecentTaskChatHistory(
  history: ChatMessage[],
  options: { tokenBudget: number; maxMessages: number }
): { messages: ChatMessage[]; estimatedTokens: number; historyBudgetExceededBySingleMessage: boolean; availableMessages: number } {
  const normalized = normalizeTaskChatHistory(history);
  const selected: ChatMessage[] = [];
  let estimatedTokens = 0;
  let historyBudgetExceededBySingleMessage = false;

  for (let index = normalized.length - 1; index >= 0 && selected.length < options.maxMessages; index -= 1) {
    const message = normalized[index];
    const messageTokens = estimateTaskChatTokens(message.content);
    if (selected.length === 0) {
      selected.push(message);
      estimatedTokens += messageTokens;
      historyBudgetExceededBySingleMessage = messageTokens > options.tokenBudget;
      if (historyBudgetExceededBySingleMessage) break;
      continue;
    }
    if (estimatedTokens + messageTokens > options.tokenBudget) break;
    selected.push(message);
    estimatedTokens += messageTokens;
  }

  return {
    messages: selected.reverse(),
    estimatedTokens,
    historyBudgetExceededBySingleMessage,
    availableMessages: normalized.length
  };
}

function formatDueDate(date: Date | null, userTimeZone: string) {
  return date ? date.toLocaleString('ru-RU', { timeZone: userTimeZone }) : 'не указан';
}

function formatCompactTaskContext(task: TaskChatContextTask, userTimeZone: string): string {
  const sphere = task.sphere?.name ?? task.parentTask?.sphere?.name ?? 'без сектора';
  const subtasks = task.subtasks.length > 0
    ? task.subtasks.map((subtask, index) => `${index + 1}. [${subtask.id}] ${subtask.title} | ${subtask.status} | срок: ${formatDueDate(subtask.dueDate, userTimeZone)}`).join('\n')
    : 'Подзадач нет';
  const attachments = task.attachments?.length
    ? task.attachments.map((attachment, index) => `${index + 1}. ${attachment.name} (${attachment.mimeType})`).join('\n')
    : 'Нет прикреплённых файлов';

  return [
    `ID задачи: ${task.id}`,
    `Название задачи: ${task.title}`,
    `Описание: ${task.description ?? 'нет'}`,
    `Дедлайн: ${formatDueDate(task.dueDate, userTimeZone)}`,
    `Статус: ${task.status}`,
    `Сектор: ${sphere}`,
    `Важность: ${task.importance}`,
    `Срочность: ${task.urgency}`,
    `Приоритет: ${task.priorityScore}`,
    `Подзадачи:\n${subtasks}`,
    `Прикреплённые файлы:\n${attachments}`
  ].join('\n');
}

export function isTaskChatContextV2Enabled(userId: string): boolean {
  if (process.env.TASK_CHAT_CONTEXT_V2_ENABLED !== 'true') return false;
  const allowlist = (process.env.TASK_CHAT_CONTEXT_V2_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(userId);
}

export function buildTaskChatContext(input: {
  task: TaskChatContextTask;
  history: ChatMessage[];
  userTimeZone: string;
  hasAttachments: boolean;
  historyTokenBudget?: number;
  historyMaxMessages?: number;
  contextVersion?: 'v2' | 'v3';
}) {
  const historyBudget = input.historyTokenBudget ?? (input.hasAttachments
    ? TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V1
    : TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V1);
  const historyMaxMessages = input.historyMaxMessages ?? (input.hasAttachments
    ? TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES
    : TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES);
  const selected = selectRecentTaskChatHistory(input.history, { tokenBudget: historyBudget, maxMessages: historyMaxMessages });
  const taskContext = formatCompactTaskContext(input.task, input.userTimeZone);
  const diagnostics: TaskChatContextDiagnostics = {
    contextVersion: input.contextVersion ?? 'v2',
    historyMessagesAvailable: selected.availableMessages,
    historyMessagesUsed: selected.messages.length,
    historyEstimatedTokens: selected.estimatedTokens,
    taskContextEstimatedTokens: estimateTaskChatTokens(taskContext),
    activeSubtasksCount: input.task.subtasks.length,
    storedAttachmentsCount: input.task.attachments?.length ?? 0,
    historyBudget,
    historyMaxMessages,
    historyBudgetExceededBySingleMessage: selected.historyBudgetExceededBySingleMessage
  };
  return { taskContext, recentHistory: selected.messages, diagnostics };
}
