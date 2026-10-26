import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildManualRecurrence } from '../../client/src/lib/recurrenceSchedule.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('manual daily, weekly and monthly rules match the server recurrence format', () => {
  const daily = buildManualRecurrence('DAILY', [{ time: '09:00' }, { time: '18:00' }], 'Europe/Moscow');
  assert.equal(daily.schedule.rrule, 'FREQ=DAILY');
  assert.equal(daily.schedule.slots?.length, 2);
  assert.equal(daily.schedule.timezone, 'Europe/Moscow');
  const weekly = buildManualRecurrence('WEEKLY', [{ time: '11:30', weekday: 1 }, { time: '11:30', weekday: 5 }], 'Europe/Moscow');
  assert.deepEqual(weekly.schedule.slots?.map(slot => slot.weekday), [1, 5]);
  const monthly = buildManualRecurrence('MONTHLY', [{ time: '09:15', monthDay: 1 }, { time: '09:15', monthDay: 29 }], 'Europe/Moscow');
  assert.deepEqual(monthly.schedule.slots?.map(slot => slot.monthDay), [1, 29]);
});

test('miniapp, mobile web and desktop use the same non-AI schedule builder', async () => {
  const [mini, control, desktop, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/TaskRecurrenceConfigurator.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(mini, /TaskRecurrenceConfigurator key=\{openedTask\.id\}/);
  assert.match(mini, /TaskRecurrenceConfigurator key=\{createEditorType\}/);
  assert.match(control, /buildManualRecurrence\(nextPeriod, nextSlots, timezone\)/);
  assert.match(control, /'WEEKLY'/);
  assert.match(control, /'MONTHLY'/);
  assert.match(control, /onParseWithAi/);
  assert.match(desktop, /buildManualRecurrence\(period, slots, timeZone\)/);
  assert.match(styles, /A shared, restrained recurrence palette/);
});

test('native Android supports manual JSON schedule both on creation and task edit', async () => {
  const [native, create, focus] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskRecurrenceEditor.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeDetailedTaskCreateSheet.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppTaskFocusSheet.kt')
  ]);
  assert.match(native, /put\("rrule","FREQ="\+period\)/);
  assert.match(native, /put\("timezone",ZoneId\.systemDefault\(\)\.id\)/);
  assert.match(native, /put\("slots",JsonArray\(slots\)\)/);
  assert.match(native, /"manual" to "Вручную"/);
  assert.match(create, /NativeTaskRecurrenceEditor\(/);
  assert.match(create, /manualRule\?:parsed\?\.schedule/);
  assert.match(focus, /NativeTaskRecurrenceEditor\(/);
  assert.match(focus, /if\(recurring != task\.isRecurring\)put\("isRecurring",recurring\)/);
  assert.match(focus, /put\("recurrenceJson",recurrenceRule\?:JsonNull\)/);
});
