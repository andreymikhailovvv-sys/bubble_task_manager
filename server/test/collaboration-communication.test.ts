import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatCollaborativeSubtaskCommentNotification } from '../src/services/task-comment.service.js';
import { formatParticipantMessageNotification } from '../src/services/task-participant-message.service.js';

test('ответ на комментарий уведомляет автора исходного комментария', async () => {
  assert.equal(
    formatCollaborativeSubtaskCommentNotification({
      actorName: 'Иван',
      subtaskTitle: 'Собрать документы',
      comment: 'Понял, добавлю',
      isReply: true
    }),
    'Пользователь Иван ответил на ваш комментарий по подзадаче «Собрать документы»: Понял, добавлю'
  );

  const source = await readFile(new URL('../src/services/task-comment.service.ts', import.meta.url), 'utf8');
  assert.match(source, /recipientUserId: parentComment\?\.userId \?\? task\.userId/);
  assert.match(source, /text: 'Ответить'/);
  assert.match(source, /buildMiniAppTaskCommentsUrl\(input\.task\.parentTask!\.id, input\.task\.id\)/);
});

test('адресные сообщения task chat исключаются из контекста ИИ', async () => {
  const source = await readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.match(source, /where: \{ taskId: input\.taskId, messageKind: 'AI' \}/);
  assert.match(source, /messageKind === 'HUMAN'/);

  const migration = await readFile(new URL('../prisma/migrations/20261006142500_task_chat_direct_messages/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /"messageKind" TEXT NOT NULL DEFAULT 'AI'/);
  assert.match(migration, /"recipientUserId" TEXT/);
});

test('уведомление адресного сообщения сформулировано человеческим языком', () => {
  assert.equal(
    formatParticipantMessageNotification({
      actorName: 'Мария',
      taskTitle: 'Подготовить выставку',
      content: 'Проверь макет, пожалуйста'
    }),
    'Пользователь Мария написал вам в совместной задаче «Подготовить выставку»: Проверь макет, пожалуйста'
  );
});

test('web и Mini App позволяют выбрать участника вместо ИИ', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(web, /Получатель:/);
  assert.match(web, /sendTaskParticipantMessage/);
  assert.match(web, /message\.messageKind === 'HUMAN'/);
  assert.match(mini, /Получатель:/);
  assert.match(mini, /sendTaskParticipantMessage/);
  assert.match(mini, /chatRecipientUserId/);
});

test('комментарии доступны из каждой совместной подзадачи в web и Mini App', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(web, /if \(\(subtask\.commentCount \?\? 0\) <= 0\) return null/);
  assert.match(web, /subtaskCommentScrollRef/);
  assert.match(web, /comment\.authorColor/);
  assert.match(mini, /openTaskComments\(subtask\)/);
  assert.match(mini, /taskCommentScrollRef/);
  assert.match(mini, /comment\.authorColor/);
  assert.match(mini, /pendingLaunchCommentTaskId/);
});

test('новости описывают коммуникации и unread badge связан с последней новостью', async () => {
  const [updates, web] = await Promise.all([
    readFile(new URL('../../client/src/components/UpdatesMenu.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(updates, /Совместные задачи стали удобнее для общения/);
  assert.match(updates, /Комментарии теперь доступны у любой подзадачи/);
  assert.match(updates, /В чате задачи можно писать не только ИИ, но и участникам/);
  assert.match(web, /hasUnreadNews/);
  assert.match(web, /LATEST_NEWS_ID/);
  assert.match(web, />1<\/span>/);
});
