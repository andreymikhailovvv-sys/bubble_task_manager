import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatCollaborativeSubtaskCompletedNotification } from '../src/services/collaboration-subtask-notification.service.js';

test('формат уведомления о закрытии чужой подзадачи соответствует продуктовой формулировке', () => {
  assert.equal(
    formatCollaborativeSubtaskCompletedNotification({
      actorName: 'Андрей',
      subtaskTitle: 'Позвонить подрядчику',
      taskTitle: 'Запуск выставки'
    }),
    'Пользователь Андрей закрыл подзадачу «Позвонить подрядчику» в совместной задаче «Запуск выставки»'
  );
});

test('task service уведомляет только при первом закрытии чужой совместной подзадачи', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  const updateMethod = source.slice(source.indexOf('update: async'), source.indexOf('remove: async'));

  assert.match(updateMethod, /currentTask\.parentTaskId/);
  assert.match(updateMethod, /currentTask\.collaborationId/);
  assert.match(updateMethod, /currentTask\.userId !== userId/);
  assert.match(updateMethod, /currentTask\.status !== 'DONE'/);
  assert.match(updateMethod, /input\.status === 'DONE'/);
  assert.match(updateMethod, /notifyCollaborativeSubtaskCompleted\(\{ subtaskId: id, actorUserId: userId \}\)/);
});

test('фильтр по участнику остаётся локальным состоянием клиентов и закрывается при скролле', async () => {
  const [appSource, miniAppSource] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(appSource, /subtaskAuthorFilterByTaskId, setSubtaskAuthorFilterByTaskId.*useState/);
  assert.match(appSource, /creatorUserId === authorUserId/);
  assert.match(appSource, /onScroll=\{\(\) => setIsSubtaskFilterOpen\(false\)\}/);
  assert.match(miniAppSource, /openedTaskSubtaskAuthorFilterUserId, setOpenedTaskSubtaskAuthorFilterUserId.*useState/);
  assert.match(miniAppSource, /task\.creatorUserId === openedTaskSubtaskAuthorFilterUserId/);
  assert.match(miniAppSource, /onScroll=\{\(\) => setIsOpenedTaskSubtaskFilterOpen\(false\)\}/);
});
