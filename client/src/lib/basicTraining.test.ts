import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTrainingBubbleAction, BASIC_TRAINING_STEPS, createTrainingTasks, createCompletionTrainingTask, nextBasicTrainingStep, TRAINING_COMPLETE_ID, TRAINING_SPHERES } from './basicTraining';

test('training has unique ordered steps and no automatic start', () => {
  assert.equal(new Set(BASIC_TRAINING_STEPS.map(step => step.id)).size, BASIC_TRAINING_STEPS.length);
  assert.equal(nextBasicTrainingStep('intro'), 'intro-next');
  assert.equal(nextBasicTrainingStep('goodbye'), null);
  assert.equal(createCompletionTrainingTask().importance, 5);
  assert.equal(createCompletionTrainingTask().id, TRAINING_COMPLETE_ID);
});

test('sector exercise advances only on an actual sector change and preserves source', () => {
  const tasks = createTrainingTasks();
  const task = tasks[0];
  const same = applyTrainingBubbleAction(tasks, 'move', task.id, { action: 'move', sphereId: task.sphereId, x: 50, y: 60 });
  assert.equal(same.next, null);
  const moved = applyTrainingBubbleAction(tasks, 'move', task.id, { action: 'move', sphereId: TRAINING_SPHERES[1].id });
  assert.equal(moved.next, 'link');
  assert.equal(moved.tasks[0].sphereId, TRAINING_SPHERES[1].id);
  assert.equal(tasks[0].sphereId, TRAINING_SPHERES[0].id);
});

test('link is mutual, nest keeps task data and clears invalid links', () => {
  const tasks = createTrainingTasks();
  const [a, b, c] = tasks;
  const linked = applyTrainingBubbleAction(tasks, 'link', a.id, { action: 'link', targetTaskId: b.id });
  assert.equal(linked.next, 'linked');
  assert.deepEqual(linked.tasks[0].linkedTaskIds, [b.id]);
  assert.deepEqual(linked.tasks[1].linkedTaskIds, [a.id]);
  const nested = applyTrainingBubbleAction(linked.tasks, 'nest', a.id, { action: 'nest', targetTaskId: c.id });
  assert.equal(nested.next, 'nested');
  assert.equal(nested.tasks[0].parentTaskId, c.id);
  assert.equal(nested.tasks[0].title, a.title);
  assert.equal(nested.tasks[0].importance, a.importance);
  assert.deepEqual(nested.tasks[1].linkedTaskIds, []);
});

test('wrong gestures and non-training IDs cannot mutate tasks or advance', () => {
  const tasks = createTrainingTasks();
  const result = applyTrainingBubbleAction(tasks, 'link', tasks[0].id, { action: 'nest', targetTaskId: tasks[1].id });
  assert.equal(result.tasks, tasks);
  assert.equal(result.next, null);
  assert.equal(applyTrainingBubbleAction(tasks, 'move', 'real-user-task', { action: 'move', sphereId: TRAINING_SPHERES[1].id }).tasks, tasks);
});

test('basic training requires mode placement and teaches task placement after the divider', () => {
  assert.equal(nextBasicTrainingStep('modes'), 'two-modes');
  assert.equal(nextBasicTrainingStep('two-modes'), 'mode-added');
  assert.equal(nextBasicTrainingStep('mode-added'), 'block');
  assert.equal(nextBasicTrainingStep('divider'), 'task-window');
  assert.equal(nextBasicTrainingStep('task-window'), 'task-window-added');
  assert.equal(nextBasicTrainingStep('task-window-added'), 'notes');
  assert.equal(BASIC_TRAINING_STEPS.find(step => step.id === 'two-modes')?.action, true);
  assert.equal(BASIC_TRAINING_STEPS.find(step => step.id === 'task-window')?.action, true);
});
