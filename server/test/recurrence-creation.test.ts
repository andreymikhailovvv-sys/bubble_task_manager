import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { computeNextRecurringDueDate } from '../src/services/task.service.js';
import { makeManualRecurrenceSchedule, validateManualRecurrenceSchedule } from '../src/services/recurrence-slots.service.js';

test('daily recurrence with several times chooses nearest local slot, then rolls over', () => {
  const schedule = makeManualRecurrenceSchedule('DAILY', [{ time: '08:30' }, { time: '18:00' }, { time: '13:15' }], 'Europe/Moscow');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-10-16T07:00:00Z'))?.toISOString(), '2026-10-16T10:15:00.000Z');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-10-16T15:00:00Z'))?.toISOString(), '2026-10-17T05:30:00.000Z');
});

test('weekly recurrence supports clicked days with different times', () => {
  const schedule = makeManualRecurrenceSchedule('WEEKLY', [
    { weekday: 1, time: '09:00' }, { weekday: 5, time: '19:30' }
  ], 'Europe/Moscow');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-10-16T07:00:00Z'))?.toISOString(), '2026-10-16T16:30:00.000Z');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-10-16T16:30:00Z'))?.toISOString(), '2026-10-19T06:00:00.000Z');
});

test('monthly recurrence uses last day in short months including February and leap years', () => {
  const schedule = makeManualRecurrenceSchedule('MONTHLY', [
    { monthDay: 31, time: '09:00' }, { monthDay: 1, time: '10:00' }
  ], 'Europe/Moscow');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-01-31T20:00:00Z'))?.toISOString(), '2026-02-01T07:00:00.000Z');
  const thirtyFirst = makeManualRecurrenceSchedule('MONTHLY', [{ monthDay: 31, time: '09:00' }], 'Europe/Moscow');
  assert.equal(computeNextRecurringDueDate(thirtyFirst, new Date('2026-02-01T00:00:00Z'))?.toISOString(), '2026-02-28T06:00:00.000Z');
  assert.equal(computeNextRecurringDueDate(thirtyFirst, new Date('2028-02-01T00:00:00Z'))?.toISOString(), '2028-02-29T06:00:00.000Z');
  assert.equal(computeNextRecurringDueDate(thirtyFirst, new Date('2026-03-31T20:00:00Z'))?.toISOString(), '2026-04-30T06:00:00.000Z');
  assert.equal(computeNextRecurringDueDate(thirtyFirst, new Date('2026-04-30T06:00:00Z'))?.toISOString(), '2026-05-31T06:00:00.000Z');
});

test('DST does not shift a local 09:00 repeating task', () => {
  const schedule = makeManualRecurrenceSchedule('DAILY', [{ time: '09:00' }], 'Europe/Berlin');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-03-28T10:00:00Z'))?.toISOString(), '2026-03-29T07:00:00.000Z');
  assert.equal(computeNextRecurringDueDate(schedule, new Date('2026-10-24T10:00:00Z'))?.toISOString(), '2026-10-25T08:00:00.000Z');
});

test('invalid times, duplicate slots, impossible week/month day or invalid timezone are rejected', () => {
  assert.throws(() => makeManualRecurrenceSchedule('DAILY', [{ time: '25:00' }], 'Europe/Moscow'), /время/);
  assert.throws(() => makeManualRecurrenceSchedule('DAILY', [{ time: '09:00' }, { time: '09:00' }], 'Europe/Moscow'), /Одинаковые/);
  assert.throws(() => makeManualRecurrenceSchedule('WEEKLY', [{ time: '09:00', weekday: 8 }], 'Europe/Moscow'), /день недели/);
  assert.throws(() => makeManualRecurrenceSchedule('MONTHLY', [{ time: '09:00', monthDay: 32 }], 'Europe/Moscow'), /день месяца/);
  assert.throws(() => makeManualRecurrenceSchedule('DAILY', [{ time: '09:00' }], 'Invalid/Timezone'), /временная зона/);
  assert.throws(() => validateManualRecurrenceSchedule({ rrule: 'FREQ=DAILY', timezone: 'Europe/Moscow', slots: [] }), /1 до 31/);
});

test('recurrence AI retries a fully consumed output and uses actual token billing and website system notification', async () => {
  const [service, controller, editor, api, task] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8')
  ]);
  const section = service.slice(service.indexOf('  async parseRecurrence('), service.indexOf('  async generateDailyCheckup('));
  assert.match(section, /for \(let attempt = 1; attempt <= 2;/);
  assert.match(section, /maxOutputTokensCap: attempt === 1 \? 4096 : 6144/);
  assert.match(section, /refundDynamicResponsesCall\(call\)/);
  assert.match(section, /settleDynamicResponsesCall\(call\)/);
  assert.match(section, /recurrence_schedule/);
  assert.match(controller, /createAiBillingSystemNotification\(\{ userId: req\.user!\.id, taskId: task\?\.id/);
  assert.match(controller, /ai-billing:recurrence/);
  assert.match(api, /parseRecurrence:/);
  assert.match(editor, /setRecurrenceError\(error instanceof Error/);
  assert.match(editor, /recurrence-manual-slots/);
  assert.match(editor, /aria-label="Добавить время уведомления"/);
  assert.match(editor, /aria-label="Дни недели для повторения"/);
  assert.match(editor, /aria-label="Календарь дней месяца"/);
  assert.match(editor, /task-create-save-footer/);
  assert.doesNotMatch(editor, /aria-label="Количество повторов"/);
  assert.match(editor, /task-create-draft-subtasks/);
  assert.match(task, /validateManualRecurrenceSchedule\(recurrenceSchedule\)/);
});


test('task creation recurrence layout retains scrollable content and independent submit footer in all recurrence modes', async () => {
  const [editor, styles, clientRule] = await Promise.all([
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/recurrenceSchedule.ts', import.meta.url), 'utf8')
  ]);
  assert.match(editor, /recurrenceMethod === "manual"/);
  assert.match(editor, /recurrence-add-time-button/);
  assert.match(editor, /recurrence-month-calendar/);
  assert.match(editor, /recurrenceSlots\.some\(\(slot\) => slot\.weekday === day\.value\)/);
  assert.match(editor, /recurrenceSlots\.some\(\(slot\) => slot\.monthDay === day\)/);
  assert.match(editor, /task-editor-scroll-content invisible-scrollbar/);
  const footerIndex = editor.indexOf('task-create-save-footer');
  const branchEnd = editor.indexOf('          {isEditing && isSubtask ?');
  assert.ok(footerIndex > editor.indexOf('              {isRecurring ? (') && footerIndex < branchEnd);
  assert.match(styles, /body\[data-theme='light'\] \.focused-task-editor-shell \.recurrence-choice-button/);
  assert.match(styles, /body\[data-theme='dark'\] \.focused-task-editor-shell \.recurrence-choice-button/);
  assert.match(styles, /\.task-create-draft-subtasks \{\s*flex: 0 0 auto/);
  assert.match(styles, /\.task-create-save-footer \{\s*position: relative/);
  assert.match(clientRule, /new Set\(checked\.map/);
});
