import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completionItems, completionProgress } from './completionStatistics';
import type { Task } from './types';

const task = (id: string, fields: Partial<Task> = {}): Task => ({ id, title: id, status: 'TODO', ...fields } as Task);
const now = new Date('2026-11-26T22:30:00Z');
const tz = 'Europe/Moscow';
const today = task('today', { dueDate: '2026-11-27T12:00:00Z' });
const subToday = task('subToday', { parentTaskId: 'today', dueDate: '2026-11-27T13:00:00Z', status: 'DONE' });
const root = task('root');
const sub = task('sub', { parentTaskId: 'root' });
const event = task('event', { taskType: 'EVENT', dueDate: today.dueDate });
const tasks = [today, subToday, root, sub, event];

describe('completion spotlight', () => {
  it('uses the user timezone and combines dated tasks and subtasks', () => {
    assert.deepEqual(completionItems(tasks, 'today', tz, now).map(t => t.id), ['today', 'subToday']);
    assert.deepEqual(completionProgress(tasks, today, tz, now, 1), { scope: 'today', before: 1, after: 2, total: 2, sequence: 1 });
  });
  it('uses independent counts for other dates and undated items', () => {
    assert.deepEqual(completionProgress(tasks, root, tz, now, 2), { scope: 'tasks', before: 0, after: 1, total: 2, sequence: 2 });
    assert.deepEqual(completionProgress(tasks, sub, tz, now, 3), { scope: 'subtasks', before: 1, after: 2, total: 2, sequence: 3 });
  });
  it('does not celebrate already completed items or events', () => {
    assert.equal(completionProgress(tasks, subToday, tz, now, 4), null);
    assert.equal(completionProgress(tasks, event, tz, now, 5), null);
  });
});
