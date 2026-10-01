import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTaskChatMemory,
  isTaskChatMemoryEnabled,
  normalizeTaskChatMemory,
  TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES_V2,
  TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V2,
  TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS,
  TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES_V2,
  TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V2
} from '../src/services/task-chat-memory.service.js';

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
  assert.equal(normalized.goal.length, 700);
  assert.equal(normalized.decisions[0], 'Решение');
  assert.equal(normalized.decisions.length, 20);
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
  assert.equal(TASK_CHAT_RECENT_HISTORY_TOKEN_BUDGET_V2, 6_000);
  assert.equal(TASK_CHAT_RECENT_HISTORY_MAX_MESSAGES_V2, 20);
  assert.equal(TASK_CHAT_ATTACHMENT_HISTORY_TOKEN_BUDGET_V2, 3_000);
  assert.equal(TASK_CHAT_ATTACHMENT_HISTORY_MAX_MESSAGES_V2, 6);
  assert.ok(TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS >= 1_600 && TASK_CHAT_MEMORY_MAX_OUTPUT_TOKENS <= 1_800);
});
