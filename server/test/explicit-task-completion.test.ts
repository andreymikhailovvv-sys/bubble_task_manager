import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  enforceExplicitSubtaskCompletion,
  TaskCompletionConfirmationRequired
} from '../src/services/task.service.js';
import { completeTaskWithUserConfirmation } from '../../client/src/lib/explicitTaskCompletion.js';

test('server refuses implicit cascade when parent still has unfinished subtasks', () => {
  assert.throws(
    () => enforceExplicitSubtaskCompletion('DONE', true, 32),
    (error: unknown) => error instanceof TaskCompletionConfirmationRequired
      && error.code === 'UNFINISHED_SUBTASKS_REQUIRE_CONFIRMATION'
      && error.unfinishedSubtasks === 32
  );
  for (const [status, root, count, confirmed] of [
    ['TODO', true, 3, false],
    ['IN_PROGRESS', true, 3, false],
    ['DONE', false, 50, false],
    ['DONE', true, 0, false],
    ['DONE', true, 3, true]
  ] as const) assert.doesNotThrow(() => enforceExplicitSubtaskCompletion(status, root, count, confirmed));
});

const parent = { id: 'parent', parentTaskId: null, status: 'TODO' };
const child = { id: 'child1', parentTaskId: 'parent', status: 'TODO' };
const childDone = { id: 'child2', parentTaskId: 'parent', status: 'DONE' };

test('web and Mini App cancellation never submit completion or change any child', async () => {
  const requests: unknown[] = [];
  const ok = await completeTaskWithUserConfirmation(
    parent, [parent, child, childDone], async payload => requests.push(payload),
    message => { assert.match(message, /1 незавершённых подзадач/); return false; }
  );
  assert.equal(ok, false);
  assert.deepEqual(requests, []);
});

test('user-confirmed parent closure explicitly permits child cascade', async () => {
  const requests: unknown[] = [];
  const ok = await completeTaskWithUserConfirmation(
    parent, [parent, child, childDone], async payload => { requests.push(payload); },
    () => true
  );
  assert.equal(ok, true);
  assert.deepEqual(requests, [{ status: 'DONE', completeSubtasks: true }]);
});

test('subtask and parent with only completed children do not request bulk permission', async () => {
  const requests: unknown[] = [];
  for (const item of [child, parent]) {
    const done = await completeTaskWithUserConfirmation(
      item, [parent, childDone], async payload => { requests.push(payload); },
      () => { throw new Error('Should not prompt'); }
    );
    assert.equal(done, true);
  }
  assert.deepEqual(requests, [{ status: 'DONE' }, { status: 'DONE' }]);
});

test('stale sibling list cannot silently close newly added child', async () => {
  const requests: unknown[] = [];
  let asked = 0;
  const completed = await completeTaskWithUserConfirmation(
    parent, [parent, childDone],
    async payload => {
      requests.push(payload);
      if (requests.length === 1) throw Object.assign(new Error('Confirmation required'), {
        code: 'UNFINISHED_SUBTASKS_REQUIRE_CONFIRMATION'
      });
    },
    () => { asked++; return true; }
  );
  assert.equal(completed, true);
  assert.equal(asked, 1);
  assert.deepEqual(requests, [{ status: 'DONE' }, { status: 'DONE', completeSubtasks: true }]);
});

test('service transaction guards bulk update, API reports 409, AI receives action error', async () => {
  const [service, controller, tools, web, mini] = await Promise.all([
    readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/task.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/planner-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(service, /unfinishedChildCount = await tx\.task\.count/);
  assert.match(service, /enforceExplicitSubtaskCompletion\(input\.status, true, unfinishedChildCount, input\.completeSubtasks\)/);
  assert.match(service, /input\.status === 'DONE' && !currentTask\.parentTaskId && input\.completeSubtasks === true/);
  assert.match(service, /\[Task\] explicit bulk subtask completion/);
  assert.match(controller, /res\.status\(409\)/);
  assert.match(tools, /error instanceof TaskCompletionConfirmationRequired/);
  assert.match(web, /completeTaskWithUserConfirmation/);
  assert.match(mini, /completeTaskWithUserConfirmation/);
});
