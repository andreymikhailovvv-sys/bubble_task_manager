import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatCollaborativeSubtaskCommentNotification } from '../src/services/task-comment.service.js';

test('миграция комментариев создаёт обе таблицы и безопасную связь ответов', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20261006122500_collaborative_subtask_comments/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE "TaskComment"/);
  assert.match(sql, /CREATE TABLE "TaskCommentReadState"/);
  assert.match(sql, /TaskCommentReadState_taskId_userId_key/);
  assert.match(sql, /TaskComment_parentCommentId_fkey/);
  assert.match(sql, /ON DELETE SET NULL/);
});

test('уведомление о комментарии использует требуемую формулировку', () => {
  assert.equal(
    formatCollaborativeSubtaskCommentNotification({
      actorName: 'Анна',
      subtaskTitle: 'Собрать документы',
      comment: 'Добавь справку'
    }),
    'Пользователь Анна оставил комментарий по подзадаче «Собрать документы»: Добавь справку'
  );
});

test('редактор не отправляет устаревший status при autosave и закрытии', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const persistBlock = source.slice(source.indexOf('const persistTask = async'), source.indexOf('const autosaveEditorTask = async'));
  const autosaveBlock = source.slice(source.indexOf('const autosaveEditorTask = async'), source.indexOf('const createTaskFromAi = async'));

  assert.match(persistBlock, /status: ignoredEditorStatus/);
  assert.match(persistBlock, /api\.updateTask\(editorState\.task\.id, \{ \.\.\.editableNormalized/);
  assert.match(autosaveBlock, /status: ignoredEditorStatus/);
  assert.match(autosaveBlock, /api\.updateTask\(editorState\.task\.id, \{ \.\.\.editableNormalized/);
  assert.doesNotMatch(autosaveBlock, /api\.updateTask\(editorState\.task\.id, \{ \.\.\.normalized/);
});

test('вложения совместной задачи доступны любому активному участнику', async () => {
  const source = await readFile(new URL('../src/services/task-attachment.service.ts', import.meta.url), 'utf8');
  assert.match(source, /collaboration: \{ members: \{ some: \{ userId, isHidden: false \} \} \}/);
  assert.match(source, /await ensureTaskAccess\(taskId, userId\)/);
  assert.match(source, /where: \{ taskId \}/);
  assert.doesNotMatch(source, /where: \{ taskId, userId \}/);
});

test('комментарии разрешены только для совместных подзадач и поддерживают ответы', async () => {
  const source = await readFile(new URL('../src/services/task-comment.service.ts', import.meta.url), 'utf8');
  assert.match(source, /parentTaskId: \{ not: null \}/);
  assert.match(source, /collaborationId: \{ not: null \}/);
  assert.match(source, /members: \{ some: \{ userId, isHidden: false \} \}/);
  assert.match(source, /parentCommentId/);
  assert.match(source, /taskCommentReadState\.upsert/);
  assert.match(source, /collaboration-subtask-comment:/);
});

test('список задач содержит персональные счетчики комментариев', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  assert.match(source, /commentCount: taskCommentStats\.total/);
  assert.match(source, /unreadCommentCount: taskCommentStats\.unread/);
  assert.match(source, /comment\.userId !== userId/);
  assert.match(source, /comment\.createdAt > lastReadAt/);
});

test('web UI показывает контекстное меню, ответы и корректный порядок правых элементов', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /onContextMenu=\{\(event\) => handleSubtaskCommentContextMenu/);
  assert.match(source, />\s*Комментировать\s*<\/button>/);
  assert.match(source, /renderSubtaskCommentButton\(subtask\)/);
  assert.match(source, /unreadCommentCount/);
  assert.match(source, />\s*Ответить\s*<\/button>/);

  const rowStart = source.indexOf('title="Открыть доп задачу"');
  const row = source.slice(rowStart, rowStart + 2500);
  const due = row.indexOf('formatSubtaskRelativeDeadline');
  const comments = row.indexOf('renderSubtaskCommentButton');
  const creator = row.indexOf('subtask.creatorName');
  const calendar = row.indexOf('<InlineDateTimePickerIcon');
  assert.ok(due >= 0 && comments > due && creator > comments && calendar > creator);
});
