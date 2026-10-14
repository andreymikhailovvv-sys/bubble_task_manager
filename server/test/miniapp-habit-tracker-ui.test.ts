import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('создание и редактирование привычки показываются отдельными окнами', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /isHabitModalOpen && !editingHabitId/);
  assert.match(source, /isHabitModalOpen && editingHabit/);
  assert.match(source, /miniapp-habit-editor-panel/);
  assert.match(source, /MiniAppHabitTracker habit=\{editingHabit\}/);
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
