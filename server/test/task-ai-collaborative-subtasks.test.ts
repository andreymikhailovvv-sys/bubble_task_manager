import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('task AI actions accept a subtask from another collaboration member', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const actionStart = source.indexOf("if ('subtaskId' in action)");
  const actionEnd = source.indexOf("actionReports.push(\`Действие", actionStart);
  assert.ok(actionStart >= 0 && actionEnd > actionStart);
  const block = source.slice(actionStart, actionEnd);

  assert.match(block, /where: \{ id: action\.subtaskId, parentTaskId: task\.id \}/);
  assert.doesNotMatch(block, /userId: input\.userId, parentTaskId: task\.id/);
  assert.match(block, /taskService\.update\(subtask\.id, input\.userId/);
  assert.match(block, /taskService\.remove\(subtask\.id, input\.userId\)/);
});

test('task context lookup scopes subtasks to current task, not to creator', async () => {
  const source = await readFile(new URL('../src/services/task-chat-context-lookup.service.ts', import.meta.url), 'utf8');
  const subtaskLookupEnd = source.indexOf("if (args.operation === 'list_attachments')");
  const block = source.slice(0, subtaskLookupEnd);

  assert.match(block, /parentTaskId: input\.taskId/);
  assert.doesNotMatch(block, /userId: input\.userId, parentTaskId: input\.taskId/);
});
