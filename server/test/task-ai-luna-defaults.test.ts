import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { initialTaskMonitoringModel, DEFAULT_TASK_AI_CHAT_MODEL } from '../../client/src/lib/ai-chat-model.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Luna is the first monitoring model; saved monitored Terra/Sol stay untouched', () => {
  assert.equal(DEFAULT_TASK_AI_CHAT_MODEL, 'gpt-6-luna');
  assert.equal(initialTaskMonitoringModel(false, 0, 'gpt-6.1-terra'), 'gpt-6-luna');
  assert.equal(initialTaskMonitoringModel(false, 0, undefined), 'gpt-6-luna');
  assert.equal(initialTaskMonitoringModel(true, 1, 'gpt-6.1-terra'), 'gpt-6.1-terra');
  assert.equal(initialTaskMonitoringModel(true, 2, 'gpt-6.1-sol'), 'gpt-6.1-sol');
  assert.equal(initialTaskMonitoringModel(false, 2, 'gpt-6.1-terra'), 'gpt-6.1-terra');
});

test('server and database use Luna for future monitored tasks without rewriting old choices', async () => {
  const [schema, task, migration] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../src/services/task.service.ts'),
    read('../prisma/migrations/20261030190000_task_monitoring_model_default_luna/migration.sql')
  ]);
  assert.match(schema, /aiMonitoringModel String @default\("gpt-6-luna"\)/);
  assert.match(task, /aiMonitoringModel: input.aiMonitoringModel \?\? 'gpt-6-luna'/);
  assert.match(task, /currentTask.aiMonitoringGeneration === 0/);
  assert.match(task, /input.aiMonitoringModel !== undefined/);
  assert.match(migration, /ALTER COLUMN "aiMonitoringModel" SET DEFAULT 'gpt-6-luna'/);
  assert.doesNotMatch(migration, /UPDATE\s+"Task"/i);
});

test('new standard task chats use Luna without overriding manual model choices', async () => {
  const [desktop, mobile, settings] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/TaskMonitoringStatuses.tsx')
  ]);
  assert.match(desktop, /aiModelByTask\[focusedTask\.id\] \?\? DEFAULT_TASK_AI_CHAT_MODEL/);
  assert.match(desktop, /aiModelByTask\[focusActiveTask\.id\] \?\? DEFAULT_TASK_AI_CHAT_MODEL/);
  assert.match(mobile, /taskChatModelByIdRef\.current\[openedTaskId\] \?\? DEFAULT_TASK_AI_CHAT_MODEL/);
  assert.match(mobile, /taskChatModelByIdRef\.current\[openedTask\.id\] = model/);
  assert.match(settings, /initialTaskMonitoringModel\(enabled, generation, model\)/);
  assert.match(settings, /aiMonitoringModel: monitorModel/);
});
