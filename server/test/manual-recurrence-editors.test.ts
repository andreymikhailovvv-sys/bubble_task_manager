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
  assert.match(styles, /Unified soft lavender recurrence controls/);
  assert.match(styles, /#78609d/);
  assert.doesNotMatch(styles.slice(styles.indexOf('Unified soft lavender recurrence controls')), /#355c69/);
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


test('desktop existing task focus supports the same manual choice and preserves its autosave', async () => {
  const app = await read('../../client/src/App.tsx');
  const focus = app.slice(app.indexOf("{isFocusedSettingsOpen ? ("), app.indexOf("focused-task-importance", app.indexOf("{isFocusedSettingsOpen ? (")));
  assert.ok(focus.includes('TaskRecurrenceConfigurator'));
  assert.ok(focus.includes('key={focusedTask.id}'));
  assert.ok(focus.includes('onParseWithAi={() => void applyFocusedRecurrence()}'));
  assert.ok(focus.includes('setFocusedDraft((previous) => previous ?'));
  assert.ok(focus.includes('setFocusedSaveError(null)'));
  assert.match(app, /focusedTaskEditableSnapshot\(normalized, isAiNotificationsDefaultEnabled\)/);
});

test('mobile task and create dialogs grow when repeat settings open without exceeding viewport', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.ok(mini.includes("isTaskSettingsOpen ? 'miniapp-focus-task-panel--settings-open' : ''"));
  assert.ok(mini.includes("isCreateTaskSettingsOpen ? 'miniapp-focus-task-panel--settings-open' : ''"));
  assert.match(css, /height: min\(90dvh, 790px\)/);
  assert.match(css, /miniapp-focus-task-panel--settings-open \.miniapp-task-settings-panel/);
  assert.match(css, /miniapp-focus-task-panel--settings-open \.miniapp-create-settings-panel/);
  assert.match(css, /bottom: 0\.75rem/);
  assert.match(css, /max-height: none/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /\.miniapp-settings-scroll-area::-webkit-scrollbar/);
  assert.match(css, /scrollbar-width: none !important/);
  assert.match(css, /-webkit-overflow-scrolling: touch/);
  assert.match(css, /\.miniapp-settings-scroll-area \.mini-recurrence-configuration/);
  assert.match(css, /\.miniapp-web-task-backdrop \.miniapp-focus-task-panel--settings-open/);
});

test('both edit and creation settings scroll as full overlays rather than being clipped', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  const edit = mini.slice(mini.indexOf('{isTaskSettingsOpen ? ('), mini.indexOf('ref={openedTaskContentsScrollRef}'));
  assert.ok(edit.includes('miniapp-settings-scroll-area invisible-scrollbar'));
  const createHeader = mini.indexOf('onClick={() => setIsCreateTaskSettingsOpen((prev) => !prev)}');
  const createMenu = mini.indexOf('{isCreateTaskSettingsOpen ? (', createHeader);
  assert.ok(createHeader >= 0 && createMenu > createHeader);
  const nearMenu = mini.slice(createMenu - 65, createMenu);
  assert.ok(nearMenu.includes('</div>'), 'creation menu is outside its tiny relative header');
  const createBody = mini.indexOf('className="min-h-0 flex-1 overflow-y-auto pb-24 pr-1"', createMenu);
  assert.ok(createBody > createMenu);
  assert.ok(mini.slice(createMenu, createBody).includes('miniapp-settings-scroll-area invisible-scrollbar'));
});
