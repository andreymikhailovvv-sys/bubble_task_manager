import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTaskChatMemory,
  isTaskChatMemoryEnabled,
  normalizeTaskChatMemory,
  evaluateTaskChatMemoryTrigger,
  TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES_V2,
  TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V2,
  TASK_CHAT_MEMORY_MAX_ESTIMATED_TOKENS,
  TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS,
  TASK_CHAT_MEMORY_TARGET_MAX_MESSAGES,
  TASK_CHAT_MEMORY_TARGET_TOKEN_BUDGET,
  TASK_CHAT_MEMORY_TRIGGER_MAX_MESSAGES,
  TASK_CHAT_MEMORY_TRIGGER_TOKEN_BUDGET
} from '../src/services/task-chat-memory.service.js';
import { estimateTaskChatTokens, selectRecentTaskChatHistory } from '../src/services/task-chat-context.service.js';

const messages = (count: number, contentLength = 30) => Array.from({ length: count }, (_, index) => ({
  id: `message-${index}`,
  role: index % 2 ? 'assistant' as const : 'user' as const,
  content: 'x'.repeat(contentLength),
  createdAt: new Date(index)
}));

test('memory flag требует Context V2 и поддерживает глобальное включение и allowlist', () => {
  const previous = { memory: process.env.TASK_CHAT_MEMORY_ENABLED, context: process.env.TASK_CHAT_CONTEXT_V2_ENABLED, users: process.env.TASK_CHAT_MEMORY_USER_IDS };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    process.env.TASK_CHAT_MEMORY_ENABLED = 'true';
    process.env.TASK_CHAT_CONTEXT_V2_ENABLED = 'false';
    assert.equal(isTaskChatMemoryEnabled('u1'), false);
    process.env.TASK_CHAT_CONTEXT_V2_ENABLED = 'true';
    process.env.TASK_CHAT_MEMORY_USER_IDS = '';
    assert.equal(isTaskChatMemoryEnabled('u1'), true);
    process.env.TASK_CHAT_MEMORY_USER_IDS = 'u2, u3';
    assert.equal(isTaskChatMemoryEnabled('u1'), false);
    assert.equal(isTaskChatMemoryEnabled('u2'), true);
  } finally {
    console.warn = warn;
    if (previous.memory === undefined) delete process.env.TASK_CHAT_MEMORY_ENABLED; else process.env.TASK_CHAT_MEMORY_ENABLED = previous.memory;
    if (previous.context === undefined) delete process.env.TASK_CHAT_CONTEXT_V2_ENABLED; else process.env.TASK_CHAT_CONTEXT_V2_ENABLED = previous.context;
    if (previous.users === undefined) delete process.env.TASK_CHAT_MEMORY_USER_IDS; else process.env.TASK_CHAT_MEMORY_USER_IDS = previous.users;
  }
});

test('нормализация memory удаляет пустые значения, повторы и ограничивает размер', () => {
  const normalized = normalizeTaskChatMemory({
    goal: `  ${'ц'.repeat(800)}  `,
    decisions: [' Решение ', '', 'Решение', ...Array.from({ length: 30 }, (_, index) => `Пункт ${index}`)],
    importantFacts: 'не массив',
    constraints: [42, null],
    userPreferences: [],
    openQuestions: []
  });
  assert.equal(normalized.goal.length, 500);
  assert.equal(normalized.decisions[0], 'Решение');
  assert.equal(normalized.decisions.length, 12);
  assert.deepEqual(normalized.importantFacts, []);
  assert.deepEqual(normalized.constraints, []);
});

test('formatter объясняет приоритет task context и не печатает пустые разделы', () => {
  const formatted = formatTaskChatMemory({ goal: 'Подготовить презентацию', decisions: ['Выбран второй вариант'], importantFacts: [], constraints: [], userPreferences: [], openQuestions: [] });
  assert.match(formatted, /Актуальные данные карточки задачи имеют приоритет/);
  assert.match(formatted, /Принятые решения:\n- Выбран второй вариант/);
  assert.doesNotMatch(formatted, /Открытые вопросы:/);
});

test('V3 budgets и output limit зафиксированы безопасными значениями', () => {
  assert.equal(TASK_CHAT_MEMORY_TARGET_TOKEN_BUDGET, 6_000);
  assert.equal(TASK_CHAT_MEMORY_TARGET_MAX_MESSAGES, 20);
  assert.equal(TASK_CHAT_MEMORY_TRIGGER_TOKEN_BUDGET, 8_000);
  assert.equal(TASK_CHAT_MEMORY_TRIGGER_MAX_MESSAGES, 30);
  assert.equal(TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V2, 3_000);
  assert.equal(TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES_V2, 6);
  assert.ok(TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS >= 1_600 && TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS <= 1_800);
});

test('хвост от 22 до 30 коротких сообщений не запускает compaction', () => {
  for (const count of [22, 25, 30]) {
    const history = messages(count);
    const result = evaluateTaskChatMemoryTrigger(history);
    assert.equal(result.triggered, false);
    assert.equal(result.triggerReason, null);
    const provider = selectRecentTaskChatHistory(history, { tokenBudget: TASK_CHAT_MEMORY_TRIGGER_TOKEN_BUDGET, maxMessages: TASK_CHAT_MEMORY_TRIGGER_MAX_MESSAGES });
    assert.deepEqual(provider.messages.map((message) => message.content), history.map((message) => message.content));
    assert.equal(provider.messages.length, count);
  }
});

test('31-е сообщение запускает compaction по messages и target оставляет не больше 20', () => {
  const history = messages(31);
  assert.deepEqual(evaluateTaskChatMemoryTrigger(history).triggerReason, 'messages');
  const target = selectRecentTaskChatHistory(history, { tokenBudget: TASK_CHAT_MEMORY_TARGET_TOKEN_BUDGET, maxMessages: TASK_CHAT_MEMORY_TARGET_MAX_MESSAGES });
  assert.equal(target.messages.length, 20);
});

test('token trigger работает до 30 сообщений и target возвращается к 6000 tokens', () => {
  const history = messages(24, 1_014); // 24 * ceil(1014 / 3) = 8112
  assert.deepEqual(evaluateTaskChatMemoryTrigger(history).triggerReason, 'tokens');
  const target = selectRecentTaskChatHistory(history, { tokenBudget: TASK_CHAT_MEMORY_TARGET_TOKEN_BUDGET, maxMessages: TASK_CHAT_MEMORY_TARGET_MAX_MESSAGES });
  assert.ok(target.estimatedTokens <= TASK_CHAT_MEMORY_TARGET_TOKEN_BUDGET);
  assert.ok(target.messages.length <= TASK_CHAT_MEMORY_TARGET_MAX_MESSAGES);
});

test('переполненная summary детерминированно укладывается в общий memory budget', () => {
  const huge = Array.from({ length: 20 }, (_, index) => `${index}: ${'я'.repeat(1_000)}`);
  const normalized = normalizeTaskChatMemory({ goal: 'ц'.repeat(1_000), decisions: huge, constraints: huge, importantFacts: huge, openQuestions: huge, userPreferences: huge });
  assert.ok(estimateTaskChatTokens(formatTaskChatMemory(normalized)) <= TASK_CHAT_MEMORY_MAX_ESTIMATED_TOKENS);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(normalized)));
});
