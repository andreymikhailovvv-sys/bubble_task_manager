import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_CHAT_OPENAI_TOOLS, executePlannerBatchActions, formatPlannerActionReport, MAX_BATCH_TASK_ACTIONS, MAX_PROVIDER_CALLS, MAX_TOOL_CALLS } from '../src/services/ai-chat-tools.service.js';
import type { PlannerActionInput } from '../src/services/planner-tools.service.js';

const batchAction = (itemId: string, dueDate = '2026-10-05T10:00:00Z') => ({ operation: 'reschedule' as const, itemId, dueDate, importance: null, urgency: null, notifyBeforeMinutes: null, sphereId: null });

test('task_actions schema is compact and global limits remain unchanged', () => {
  const tool = AI_CHAT_OPENAI_TOOLS.find((candidate) => candidate.name === 'task_actions');
  assert.ok(tool);
  assert.equal((tool.parameters.properties.actions as { maxItems: number }).maxItems, 100);
  assert.equal(MAX_BATCH_TASK_ACTIONS, 100);
  assert.equal(MAX_TOOL_CALLS, 5);
  assert.equal(MAX_PROVIDER_CALLS, 6);
});

test('batch executes sequentially, retains successes, and rejects unresolved item', async () => {
  const called: string[] = []; const reports: string[] = [];
  const result = await executePlannerBatchActions({
    value: { actions: [batchAction('A'), batchAction('B'), batchAction('FAKE')] },
    execute: async (action: PlannerActionInput) => {
      called.push(action.itemId!);
      if (action.itemId === 'FAKE') return { ok: false, code: 'ITEM_NOT_RESOLVED', message: 'not resolved' };
      return { ok: true, report: action.itemId, undoOperation: { taskId: action.itemId } };
    },
    onSuccess: (value) => reports.push(value.report)
  });
  assert.deepEqual(called, ['A', 'B', 'FAKE']);
  assert.deepEqual(reports, ['A', 'B']);
  assert.deepEqual({ requestedCount: result.requestedCount, successCount: result.successCount, failureCount: result.failureCount, partial: result.partial }, { requestedCount: 3, successCount: 2, failureCount: 1, partial: true });
  assert.equal(result.failures?.[0].code, 'ITEM_NOT_RESOLVED');
});

test('batch rejects 101 actions before mutation', async () => {
  let calls = 0;
  const result = await executePlannerBatchActions({ value: { actions: Array.from({ length: 101 }, (_, index) => batchAction(String(index))) }, execute: async () => { calls += 1; return { ok: true }; } });
  assert.equal(result.code, 'BATCH_TOO_LARGE'); assert.equal(calls, 0);
});

test('batch rejects forbidden operations and duplicate mutations', async () => {
  let calls = 0;
  const duplicate = batchAction('A');
  const result = await executePlannerBatchActions({ value: { actions: [duplicate, duplicate, { ...duplicate, operation: 'delete' }] }, execute: async () => { calls += 1; return { ok: true, report: 'ok' }; } });
  assert.equal(calls, 1); assert.equal(result.successCount, 1); assert.equal(result.failureCount, 2);
  assert.deepEqual(result.failures?.map((failure) => failure.code), ['DUPLICATE_ACTION', 'INVALID_BATCH_OPERATION']);
});

test('creation reports expose real object references only', () => {
  assert.equal(formatPlannerActionReport({ operation: 'create_task', itemId: 'T-1', report: 'Создана задача.' }), 'Создана задача. [[task_ref=T-1]]');
  assert.equal(formatPlannerActionReport({ operation: 'create_event', itemId: 'E-2', report: 'Создано событие.' }), 'Создано событие. [[task_ref=E-2]]');
  assert.equal(formatPlannerActionReport({ operation: 'create_subtask', itemId: 'S-3', report: 'Добавлена подзадача.' }), 'Добавлена подзадача. [[task_ref=S-3]]');
  assert.equal(formatPlannerActionReport({ operation: 'reschedule', itemId: 'T-1', report: 'Перенесена задача.' }), 'Перенесена задача.');
  assert.equal(formatPlannerActionReport({ operation: 'create_task', report: 'Создана задача.' }), 'Создана задача.');
});
