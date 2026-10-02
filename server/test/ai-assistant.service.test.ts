import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_ASSISTANT_ACTIONS,
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
