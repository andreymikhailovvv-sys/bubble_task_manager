import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('создание и редактирование привычки показываются отдельными окнами', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /isHabitModalOpen && !editingHabitId/);
  assert.match(source, /isHabitModalOpen && editingHabit/);
  assert.match(source, /miniapp-habit-editor-panel/);
  assert.match(source, /MiniAppHabitTracker habit=\{editingHabit\} onHabitChanged=/);
  assert.match(source, /setIsHabitSettingsOpen\(\(open\) => !open\)/);
  assert.equal((source.match(/\{renderHabitSettingsFields\(\)\}/g) ?? []).length, 2);
  assert.match(source, /if \(editingHabitId\) closeMiniWindowWithMotion\('habit', closeHabitModal\)/);
});

test('история загружается отдельно, доступ ограничен владельцем привычки', async () => {
  const [api, routes, service, tracker] = await Promise.all([
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/habit.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/MiniAppHabitTracker.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(api, /getHabitHistory:/);
  assert.match(routes, /get\('\/habits\/:id\/history', requireAuth, asyncHandler\(habitController\.history\)\)/);
  assert.match(service, /history: async \(id: string, userId: string\)/);
  assert.match(service, /prisma\.habit\.findFirstOrThrow\(\{ where: \{ id, userId \} \}\)/);
  assert.match(service, /where: \{ habitId: id, userId \}/);
  assert.match(tracker, /api\.getHabitHistory\(habit\.id\)/);
});


test('в редакторе привычки крестик сохраняет правки, лишних кнопок сохранения нет', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('      {isHabitModalOpen && editingHabit ? (');
  const end = source.indexOf('      {isCreateTaskModalOpen ? (', start);
  assert.ok(start >= 0 && end > start, 'habit editing must have its own modal');
  const editing = source.slice(start, end);
  const closeHandler = source.slice(source.indexOf('  const closeHabitEditor = () => {'), source.indexOf('  const renderHabitSettingsFields = () =>'));
  assert.match(editing, /onClick=\{closeHabitEditor\}/);
  assert.match(closeHandler, /JSON\.stringify\(habitDraft\) === JSON\.stringify\(original\)/);
  assert.match(closeHandler, /closeMiniWindowWithMotion\('habit', closeHabitModal\)/);
  assert.match(closeHandler, /void saveHabit\(\)/);
  assert.doesNotMatch(editing, /Сохранить изменения|miniapp-habit-editor-save|miniapp-habit-editor-bottom/);
  assert.match(editing, /Завершить привычку/);
  assert.match(editing, /Удалить привычку/);
});

test('создание привычки сохраняет прежние поля и показывает единственную закреплённую кнопку', async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const start = source.indexOf('      {isHabitModalOpen && !editingHabitId ? (');
  const end = source.indexOf('      {isHabitModalOpen && editingHabit ? (', start);
  assert.ok(start >= 0 && end > start, 'habit creation must have its own modal');
  const creating = source.slice(start, end);
  assert.match(creating, /miniapp-habit-create-panel/);
  assert.match(creating, /miniapp-habit-create-content min-h-0 flex-1/);
  assert.match(creating, /miniapp-habit-create-bottom miniapp-habit-editor-bottom/);
  assert.match(creating, /onClick=\{\(\) => void saveHabit\(\)\}/);
  assert.match(creating, /Создать привычку/);
  assert.equal((creating.match(/onClick=\{\(\) => void saveHabit\(\)\}/g) ?? []).length, 1, 'create only once');
  assert.ok(creating.indexOf('{renderHabitSettingsFields()}') < creating.indexOf('miniapp-habit-create-bottom'), 'create action must stay after the scroll area');
  assert.match(creating, /miniapp-habit-editor-name/);
  assert.match(creating, /miniapp-habit-editor-completion/);
  assert.match(creating, /getMiniWindowMotionClass\('habit'\)/);
  assert.match(creating, /backdrop-blur-sm/);
  assert.match(styles, /\.miniapp-habit-create-content/);
  assert.match(styles, /body|\.miniapp-shell:not\(\.miniapp-light\) \.miniapp-habit-create-panel/);
  // The settings renderer is reused, so the creation form retains the same
  // icon, color, repetitions, reminders, duration, and recurrence controls.
  const sharedFields = source.slice(source.indexOf('  const renderHabitSettingsFields = () =>'), source.indexOf('\n  const ', source.indexOf('  const renderHabitSettingsFields = () =>') + 10));
  for (const field of ['Иконка', 'Цвет круга', 'Повторов в день', 'Уведомления', 'Продолжительность привычки']) {
    assert.ok(sharedFields.includes(field), field);
  }
  assert.equal((source.match(/\{renderHabitSettingsFields\(\)\}/g) ?? []).length, 2);
});

test('переключение дней календаря сохраняется через сервер и обновляет статистику', async () => {
  const [tracker, mini] = await Promise.all([
    readFile(new URL('../../client/src/components/MiniAppHabitTracker.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(tracker, /api\.uncompleteHabit\(habit\.id/);
  assert.match(tracker, /api\.completeHabit\(habit\.id/);
  assert.match(tracker, /pendingDayKey/);
  assert.match(tracker, /setEditedDays/);
  assert.match(tracker, /onHabitChanged\?\.\(updated\)/);
  assert.match(mini, /onHabitChanged=\{\(updated\) =>/);
});
