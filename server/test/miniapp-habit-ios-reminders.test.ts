import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('habit reminder picker receives a real iOS touch in both create and edit settings', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const renderStart = source.indexOf('const renderHabitSettingsFields = () => (');
  assert.ok(renderStart >= 0);
  const notificationStart = source.indexOf('>Уведомления</label>', renderStart);
  const notificationEnd = source.indexOf('Продолжительность привычки', notificationStart);
  const notificationFields = source.slice(notificationStart, notificationEnd);

  assert.ok(notificationFields.includes('type="time"'), 'native time input must be rendered inside the reminder control');
  assert.match(notificationFields, /className="miniapp-habit-native-time-input absolute inset-0 z-10 h-full w-full cursor-pointer"/);
  assert.match(notificationFields, /<label\s+className="miniapp-habit-add-reminder/);
  assert.ok(notificationFields.includes('onChange={(event) => {'));
  assert.ok(notificationFields.includes('normalizeHabitReminderTimes([...prev.reminderTimes, nextTime])'));
  assert.ok(notificationFields.includes('reminderTimes: prev.reminderTimes.filter') === false, 'removing notifications remains a separate action');

  assert.ok(!source.includes('habitReminderTimeInputRef'), 'must not reopen an offscreen time input by ref');
  assert.ok(!source.includes('pickerInput.showPicker()'), 'must not programmatically open the time picker');
  assert.equal(source.split('{renderHabitSettingsFields()}').length - 1, 2, 'the same control must be present in create and edit modes');
});

test('habit reminder time picker remains tappable while its native chrome is visually hidden', async () => {
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  const start = css.indexOf('.miniapp-habit-add-reminder .miniapp-habit-native-time-input {');
  assert.ok(start >= 0);
  const rules = css.slice(start, css.indexOf('\n}', start));
  assert.ok(rules.includes('opacity: 0.01'), 'hide native decoration without display:none or visibility:hidden');
  assert.ok(rules.includes('touch-action: manipulation'));
  assert.ok(rules.includes('font-size: 16px'));
});
