import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ASSISTANT_ACTIONS,
  parseGeneralAssistantPayload
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
