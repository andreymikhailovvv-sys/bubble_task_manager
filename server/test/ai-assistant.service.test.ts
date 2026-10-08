import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_ASSISTANT_ACTIONS,
  normalizeTaskAssistantActionAnswer,
  parseGeneralAssistantPayload,
  toOpenAiGeneralHistory
} from '../src/services/ai-assistant.service.js';

const makeCreateSubtaskActions = (count: number) => Array.from({ length: count }, (_, index) => ({
  type: 'create_subtask',
  parentTaskId: 'parent-task',
  title: `Подзадача ${index + 1}`,
  description: `Описание ${index + 1}`,
  dueDate: null
}));

test('task assistant не обещает изменение без action', () => {
  const failure = 'Изменение не выполнено: ИИ не сформировал действие для задачи. Повтори команду.';

  assert.equal(normalizeTaskAssistantActionAnswer('Сейчас обновляю описание подзадачи.', 0), failure);
  assert.equal(normalizeTaskAssistantActionAnswer('Сделал.', 0), failure);
  assert.equal(
    normalizeTaskAssistantActionAnswer('Могу обновить описание после подтверждения.', 0),
    'Могу обновить описание после подтверждения.'
  );
  assert.equal(normalizeTaskAssistantActionAnswer('Обновляю описание.', 1), 'Обновляю описание.');
});

test('task chat считает прямую команду пользователя подтверждением action', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('askTaskAssistant: async'), source.indexOf('async askAiChat('));

  assert.match(method, /Прямой приказ пользователя изменить данные задачи уже является явным подтверждением/);
  assert.match(method, /«да», «делай», «обновляй», «выполняй», «подтверждаю»/);
  assert.match(method, /Не пиши «сделаю», «обновляю», «выполняю», «добавлю» или «сделал», если в этом же ответе actions пустой/);
  assert.doesNotMatch(method, /без явного подтверждения пользователя не выполняй никакие actions/);
});

test('клиенты показывают подтвержденные actions и Mini App обновляет измененные данные', async () => {
  const miniApp = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8');

  assert.match(api, /TaskAssistantResult = \{ answer: string; model: string; taskDataChanged: boolean;/);
  assert.match(miniApp, /result\.actionReports/);
  assert.match(miniApp, /if \(result\.taskDataChanged\) await loadData\(\);/);
  assert.match(app, /result\.actionReports/);
});

test('сохраняет все действия при создании списка из 30 подзадач', () => {
  const payload = JSON.stringify({
    answer: 'Создаю все подзадачи из списка.',
    actions: makeCreateSubtaskActions(30)
  });

  const parsed = parseGeneralAssistantPayload(payload);

  assert.equal(parsed.actions.length, 30);
  assert.equal(parsed.actions.at(-1)?.type, 'create_subtask');
  assert.equal(
    parsed.actions.at(-1)?.type === 'create_subtask' ? parsed.actions.at(-1)?.title : undefined,
    'Подзадача 30'
  );
});

test('ограничивает чрезмерно большой ответ безопасным максимумом', () => {
  const payload = JSON.stringify({
    answer: 'Создаю подзадачи.',
    actions: makeCreateSubtaskActions(MAX_ASSISTANT_ACTIONS + 10)
  });

  const parsed = parseGeneralAssistantPayload(payload);

  assert.equal(parsed.actions.length, MAX_ASSISTANT_ACTIONS);
});

test('general assistant использует общий dynamic text workflow вместе с business actions', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const method = source.slice(
    source.indexOf('askGeneralAssistant: async'),
    source.indexOf('undoGeneralAssistantActions: async')
  );

  assert.match(method, /return runTextWorkflow\(\{/);
  assert.match(method, /feature: 'general_assistant'/);
  assert.match(method, /legacyCharge: \(\) => chargeAiCredits\(input\.userId, GENERAL_CHAT_MODEL\)/);
  assert.match(method, /complete: async \(responseJson\) => \{[\s\S]*parseGeneralAssistantPayload[\s\S]*await prisma\.task\.(?:create|update|delete)/);
  assert.doesNotMatch(method, /await chargeAiCredits\(input\.userId, GENERAL_CHAT_MODEL\)/);
  assert.doesNotMatch(method, /openAiFetch\(/);
  assert.doesNotMatch(method, /billing:\s*\{\s*mode:\s*'legacy'/);
});

test('общий AI chat всегда использует единый tool workflow и выбранную модель', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('async askAiChat('), source.indexOf('async parseRecurrence('));
  assert.doesNotMatch(method, /TASK_INTENT_PATTERN|plannerToolsEnabled|askGeneralAssistant/);
  assert.match(method, /askAiChatWithTools\([\s\S]*model[\s\S]*dynamicBilling: isDynamicTextBillingEnabled\(input\.userId\)/);
});

test('provider history не содержит внутренних id сообщений', () => {
  const history = toOpenAiGeneralHistory([
    { id: 'm1', role: 'user', content: 'Первый вопрос' },
    { id: 'm2', role: 'assistant', content: 'Первый ответ' }
  ]);

  assert.deepEqual(history, [
    { role: 'user', content: 'Первый вопрос' },
    { role: 'assistant', content: 'Первый ответ' }
  ]);
  assert.equal(JSON.stringify(history).includes('m1'), false);
  assert.equal(JSON.stringify(history).includes('m2'), false);
});

test('general AI очищает history только после подготовки smart context для всех режимов', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('async askAiChat('), source.indexOf('async parseRecurrence('));
  const prepareIndex = method.indexOf('prepareAiChatSmartContext');
  const sanitizeIndex = method.indexOf('toOpenAiGeneralHistory(history)');

  assert.ok(prepareIndex >= 0 && sanitizeIndex > prepareIndex, 'memory должна получить history с id до sanitization');
  assert.match(method, /history = normalizedHistory\.slice\(quick \? -20 : -24\)/);
  assert.match(method, /const providerHistory = toOpenAiGeneralHistory\(history\)/);
  assert.match(method, /\.\.\.providerHistory,[\s\S]*\{ role: 'user', content: question \}/);
  assert.doesNotMatch(method, /\.\.\.history,[\s\S]*\{ role: 'user', content: question \}/);
});

test('controller сохраняет context diagnostics до ранней ошибки provider', async () => {
  const source = await readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('askAiChat: async'), source.indexOf('getGeneralAssistantHistory:'));
  assert.match(method, /onDiagnosticsPrepared: \(diagnostics\) => \{ traceDiagnostics = diagnostics; \}/);
  assert.match(method, /traceResult\?\.diagnostics \?\? traceDiagnostics/);
});

test('billing не начисляет AI-рейтинг в зависимости от потраченных кредитов', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /AI_CREDIT_EFFICIENCY_BONUS/);
  assert.doesNotMatch(source, /recordAiEfficiencyBonus\([^\n]*creditsSpent/);
  assert.doesNotMatch(source, /recordAiEfficiencyBonus\([^\n]*chargedMilli/);
  assert.doesNotMatch(source, /recordAiEfficiencyBonus\([^\n]*reservation\.cost/);
});

test('ровно четыре продуктовых AI workflow явно начисляют фиксированные 0.3 после успеха', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const awards = [...source.matchAll(/grantAiProductActionRating\(input\.userId, '([^']+)'\)/g)].map((match) => match[1]);

  assert.match(source, /const AI_PRODUCT_ACTION_RATING_BONUS = 0\.3/);
  assert.deepEqual(awards.sort(), ['generate_subtasks', 'generate_task', 'optimize_timeline', 'parse_recurrence']);

  const subtasks = source.slice(source.indexOf('generateSubtasks: async'), source.indexOf('generateTaskFromPrompt: async'));
  assert.ok(subtasks.indexOf('await prisma.$transaction') < subtasks.indexOf("grantAiProductActionRating(input.userId, 'generate_subtasks')"));

  const timeline = source.slice(source.indexOf('optimizeTimelineSchedule: async'), source.indexOf('postponeOverdueWithAi: async'));
  assert.ok(timeline.indexOf('parseTimelineOptimizationPlan') < timeline.indexOf("grantAiProductActionRating(input.userId, 'optimize_timeline')"));
  assert.doesNotMatch(source.slice(source.indexOf('applyTimelineOptimization: async'), source.indexOf('generateSubtasks: async')), /grantAiProductActionRating/);
});

test('AI-чаты и их task actions не начисляют рейтинг', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const generalChat = source.slice(source.indexOf('async askAiChat('), source.indexOf('async parseRecurrence('));
  const taskChat = source.slice(source.indexOf('async askTaskAssistant('), source.indexOf('generateOverdueTaskNudge:'));

  assert.doesNotMatch(generalChat, /grantAiProductActionRating|recordAiEfficiencyBonus/);
  assert.doesNotMatch(taskChat, /grantAiProductActionRating|recordAiEfficiencyBonus/);
});


test('AI-подзадачи в совместной задаче наследуют collaborationId родителя', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const taskChat = source.slice(source.indexOf('askTaskAssistant: async'), source.indexOf('generateOverdueTaskNudge:'));
  const generateSubtasks = source.slice(source.indexOf('generateSubtasks: async'));

  assert.match(taskChat, /create_subtask[\s\S]*prisma\.task\.create\([\s\S]*collaborationId:\s*task\.collaborationId/);
  assert.match(generateSubtasks, /generatedSubtasks\.map[\s\S]*prisma\.task\.create\([\s\S]*collaborationId:\s*task\.collaborationId/);
});

test('backfill migration восстанавливает collaborationId у существующих подзадач', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20261005221500_backfill_collaborative_subtasks/migration.sql', import.meta.url), 'utf8');

  assert.match(migration, /UPDATE "Task" AS child/);
  assert.match(migration, /SET "collaborationId" = parent\."collaborationId"/);
  assert.match(migration, /child\."parentTaskId" = parent\."id"/);
  assert.match(migration, /child\."collaborationId" IS NULL/);
  assert.match(migration, /parent\."collaborationId" IS NOT NULL/);
});
