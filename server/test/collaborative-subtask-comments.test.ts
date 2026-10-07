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

test('миграция скриншотов комментариев создаёт каскадную связь с комментарием', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20261007165000_task_comment_attachments/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE "TaskCommentAttachment"/);
  assert.match(sql, /TaskCommentAttachment_commentId_fkey/);
  assert.match(sql, /REFERENCES "TaskComment"\("id"\)/);
  assert.match(sql, /ON DELETE CASCADE/);
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

test('основная задача агрегирует счетчики комментариев своих подзадач', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  assert.match(source, /const rootCommentStats = new Map/);
  assert.match(source, /rootCommentStats\.get\(item\.parentTaskId\)/);
  assert.match(source, /current\.total \+= stats\.total/);
  assert.match(source, /current\.unread \+= stats\.unread/);
  assert.match(source, /rootCommentStats\.get\(task\.id\)/);
});

test('индикаторы комментариев отображаются на бабле, в списке и таймлайне', async () => {
  const appSource = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const bubbleSource = await readFile(new URL('../../client/src/components/BubbleField.tsx', import.meta.url), 'utf8');

  assert.match(bubbleSource, /commentBadgeX = bubble\.radius \* 0\.78/);
  assert.match(bubbleSource, /commentBadgeY = bubble\.radius \* 0\.78/);
  assert.match(bubbleSource, /<MessageCircle size=\{12\} color="#ffffff" \/>/);
  assert.match(bubbleSource, /unreadCommentCount > 0/);

  const listIndex = appSource.indexOf('className="flex shrink-0 items-center gap-1.5"');
  const listSlice = appSource.slice(listIndex, listIndex + 1800);
  assert.ok(listIndex >= 0);
  assert.ok(listSlice.indexOf('renderWorkspaceCommentIndicator(task)') < listSlice.indexOf("rankingMode === 'coefficient'"));

  const timelineIndex = appSource.indexOf('const renderTimelineTaskChip');
  const timelineSlice = appSource.slice(timelineIndex, timelineIndex + 9500);
  assert.ok(timelineIndex >= 0);
  assert.match(timelineSlice, /renderWorkspaceCommentIndicator\(task, true\)/);
  assert.match(timelineSlice, /const isSubtaskChip = options\?\.isSubtask/);
});

test('чтение комментариев синхронизирует персональные индикаторы с сервером для всех участников', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  for (const source of [web, mini]) {
    assert.match(source, /refreshTaskCommentIndicators/);
    assert.match(source, /api\.getTasks\(\)/);
    assert.match(source, /unreadCommentCount: task\.unreadCommentCount \?\? 0/);
    assert.match(source, /setInterval\(sync, 10_000\)/);
    assert.match(source, /await refreshTaskCommentIndicators\(\)/);
  }
  assert.doesNotMatch(web, /clearedUnread/);
  assert.doesNotMatch(mini, /clearedUnread/);
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


test('комментарии поддерживают до трёх скриншотов и защищённую загрузку', async () => {
  const [service, controller, routes, schema, web, mini] = await Promise.all([
    readFile(new URL('../src/services/task-comment.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/task-comment.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(schema, /model TaskCommentAttachment/);
  assert.match(service, /MAX_COMMENT_ATTACHMENTS = 3/);
  assert.match(service, /MAX_COMMENT_ATTACHMENT_SIZE = 3 \* 1024 \* 1024/);
  assert.match(service, /image\/png/);
  assert.match(service, /image\/jpeg/);
  assert.match(service, /image\/webp/);
  assert.match(service, /taskCommentAttachment\.findFirstOrThrow/);
  assert.match(controller, /downloadAttachment/);
  assert.match(routes, /comments\/:commentId\/attachments\/:attachmentId\/download/);

  for (const source of [web, mini]) {
    assert.match(source, /MAX_COMMENT_SCREENSHOTS = 3/);
    assert.match(source, /getTaskCommentAttachmentDownloadUrl/);
    assert.match(source, /Paperclip/);
    assert.match(source, /attachments/);
  }
});
