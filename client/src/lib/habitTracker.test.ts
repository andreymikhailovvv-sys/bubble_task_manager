import assert from 'node:assert/strict';
import test from 'node:test';
import { computeHabitTracker } from '../components/MiniAppHabitTracker';
import type { Habit } from './types';

const makeHabit = (input: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  name: 'Зарядка',
  icon: '🏃',
  color: '#22c55e',
  targetCount: 1,
  recurrenceType: 'DAILY',
  weekdays: [],
  createdAt: new Date(2026, 9, 1, 12).toISOString(),
  stats: [],
  ...input
});
const on = (day: number) => new Date(2026, 9, day, 12);
const dateKey = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

test('месячный процент учитывает только полностью выполненные плановые дни и не учитывает будущее', () => {
  const habit = makeHabit({
    targetCount: 2,
    stats: [
      { dateKey: dateKey(11), amount: 2, events: 2 },
      { dateKey: dateKey(12), amount: 2, events: 2 },
      { dateKey: dateKey(13), amount: 2, events: 2 },
      { dateKey: dateKey(14), amount: 1, events: 1 }
    ]
  });
  const result = computeHabitTracker(habit, on(1), on(14));
  assert.equal(result.eligibleMonth, 14);
  assert.equal(result.doneMonth, 3);
  assert.equal(result.partialMonth, 1);
  assert.equal(result.percent, 21);
  assert.equal(result.currentStreak, 3);
  assert.equal(result.longestStreak, 3);
});

test('серия привычки по дням недели не прерывается в незапланированные дни', () => {
  const habit = makeHabit({
    recurrenceType: 'WEEKDAYS',
    weekdays: [1, 3, 5],
    createdAt: on(5).toISOString(),
    stats: [5, 7, 9, 12].map((day) => ({ dateKey: dateKey(day), amount: 1, events: 1 }))
  });
  const result = computeHabitTracker(habit, on(1), on(14));
  assert.equal(result.eligibleMonth, 5);
  assert.equal(result.doneMonth, 4);
  assert.equal(result.currentStreak, 4);
  assert.equal(result.longestStreak, 4);
});

test('интервальная привычка считает только запланированные дни по календарным датам', () => {
  const habit = makeHabit({
    recurrenceType: 'INTERVAL',
    intervalDays: 2,
    stats: [11, 13].map((day) => ({ dateKey: dateKey(day), amount: 1, events: 1 }))
  });
  const result = computeHabitTracker(habit, on(1), on(14));
  assert.equal(result.eligibleMonth, 7);
  assert.equal(result.doneMonth, 2);
  assert.equal(result.percent, 29);
  assert.equal(result.currentStreak, 2);
});

test('пустая история не приводит к делению на ноль до начала действия привычки', () => {
  const habit = makeHabit({ createdAt: new Date(2026, 10, 1).toISOString() });
  const result = computeHabitTracker(habit, on(1), on(14));
  assert.equal(result.percent, 0);
  assert.equal(result.currentStreak, 0);
  assert.equal(result.eligibleMonth, 0);
});
