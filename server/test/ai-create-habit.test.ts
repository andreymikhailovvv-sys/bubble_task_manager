import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiCreateHabitArgs } from '../src/services/ai-create-habit.service.js';

test('general AI habit tool accepts daily, weekly and interval schedules', () => {
  const daily = validateAiCreateHabitArgs({
    name: 'Выпить воду', icon: '💧', recurrenceType: 'DAILY', weekdays: [],
    intervalDays: null, reminderTimes: ['09:00', '21:00', '09:00'], targetCount: 8
  });
  assert.deepEqual(daily.reminderTimes, ['09:00', '21:00']);
  assert.equal(daily.targetCount, 8);
  const weekly = validateAiCreateHabitArgs({
    ...daily, recurrenceType: 'WEEKDAYS', weekdays: [5, 1, 3], intervalDays: null
  });
  assert.deepEqual(weekly.weekdays, [1, 3, 5]);
  const interval = validateAiCreateHabitArgs({
    ...daily, recurrenceType: 'INTERVAL', intervalDays: 3, weekdays: []
  });
  assert.equal(interval.intervalDays, 3);
});

test('general AI rejects malformed habit schedules and times rather than silently fixing them', () => {
  const base = {
    name: 'Читать', icon: '📚', recurrenceType: 'WEEKDAYS',
    weekdays: [1, 3, 5], intervalDays: null, reminderTimes: ['20:30'], targetCount: 1
  };
  for (const patch of [
    { weekdays: [] }, { weekdays: [7] }, { reminderTimes: ['25:30'] },
    { recurrenceType: 'INTERVAL', weekdays: [], intervalDays: 0 },
    { targetCount: 0 }, { name: ' ' }, { recurrenceType: 'INVALID' }
  ]) assert.throws(() => validateAiCreateHabitArgs({ ...base, ...patch }));
});
