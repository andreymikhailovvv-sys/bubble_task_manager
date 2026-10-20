import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { taskAccessWhere } from '../src/lib/task-access.js';

const readSource = () => readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');

test('legacy AI checks active membership before accessing tasks it created', async () => {
  assert.deepEqual(taskAccessWhere('owner').OR?.[0], { userId: 'owner', collaborationId: null });
  const src = await readSource();
  const method = src.slice(src.indexOf('export async function applyLegacyGeneralProposalActions'));
  assert.match(method, /userId: input\.userId,\s*AND: \[taskAccessWhere\(input\.userId\)\],\s*parentTaskId: null/);
  assert.match(method, /id: action\.parentTaskId, userId: input\.userId, parentTaskId: null, AND: \[taskAccessWhere\(input\.userId\)\]/);
  assert.equal((method.match(/id: action\.subtaskId, userId: input\.userId, parentTaskId: \{ not: null \}, AND: \[taskAccessWhere\(input\.userId\)\]/g)||[]).length,5);
  assert.match(method, /id: action\.taskId, userId: input\.userId, AND: \[taskAccessWhere\(input\.userId\)\]/);
});

test('legacy AI refuses to create a task in a foreign sector', async () => {
  const src = await readSource();
  const method = src.slice(src.indexOf("if (action.type === 'create_task')"), src.indexOf("if (action.type === 'create_subtask')",src.indexOf("if (action.type === 'create_task')")));
  assert.match(method, /where: \{ id: action\.sphereId, userId: input\.userId \}/);
  assert.ok(method.indexOf("if (!allowedSphere)") < method.indexOf("await prisma.task.create("));
});

test('undo and automated schedule updates cannot mutate excluded collaborators tasks', async () => {
  const src=await readSource();
  const undo=src.slice(src.indexOf('undoGeneralAssistantActions: async'),src.indexOf('generateOverdueTaskNudge: async'));
  assert.match(undo,/id: operation\.taskId, userId: input\.userId, AND: \[taskAccessWhere\(input\.userId\)\]/);
  const overdue=src.slice(src.indexOf('generateOverdueTaskNudge: async'),src.indexOf('generateSubtasks: async'));
  assert.match(overdue,/AND: \[taskAccessWhere\(input\.userId\)\]/);
  assert.match(overdue,/updateMany\(\{ where:\{id:u\.taskId, userId:input\.userId, taskType: \{ notIn: \['EVENT', 'REMINDER'\] \}, AND:\[taskAccessWhere\(input\.userId\)\]\}/);
  assert.match(overdue,/updateMany\(\{ where: \{ id: task\.id, userId: input\.userId, AND: \[taskAccessWhere\(input\.userId\)\] \}/);
  assert.doesNotMatch(overdue,/where:\{id:u\.taskId\}, data:/);
});
