import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('миграция сохраняет существующие настройки каждой совместной задачи', async () => {
  const sql = await readFile(new URL('../prisma/migrations/20261006120000_collaboration_personal_settings/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE "CollaborativeTaskMember"/);
  for (const name of ['importance', 'urgency', 'notifyBeforeMinutes', 'aiNotificationsEnabled', 'isRecurring', 'recurrenceText', 'recurrenceJson', 'recurrenceSummary', 'recurrenceUntil', 'telegramNotifiedAt']) {
    assert.match(sql, new RegExp('"' + name + '"'), name);
  }
  assert.match(sql, /UPDATE "CollaborativeTaskMember" AS member/);
  assert.match(sql, /JOIN "Task" AS task ON task\."id" = collaboration\."rootTaskId"/);
});

test('совместная задача отдает каждому участнику его настройки, а обновления не трогают общие параметры', async () => {
  const source = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  assert.match(source, /importance: ownMembership\.importance/);
  assert.match(source, /notifyBeforeMinutes: ownMembership\.notifyBeforeMinutes/);
  assert.match(source, /aiNotificationsEnabled: ownMembership\.aiNotificationsEnabled/);
  assert.match(source, /isRecurring: ownMembership\.isRecurring/);
  assert.match(source, /!isCollaborativeRoot && input\.importance !== undefined/);
  assert.match(source, /!isCollaborativeRoot && input\.notifyBeforeMinutes !== undefined/);
  assert.match(source, /!isCollaborativeRoot && input\.aiNotificationsEnabled !== undefined/);
  assert.match(source, /!isCollaborativeRoot && \(input\.isRecurring === true/);
  assert.match(source, /collaborativeTaskMember\.update\(/);
  assert.match(source, /sharedDueDateChanged/);
  assert.match(source, /priorityScore: calcScore\(member\.importance, member\.urgency\)/);
});

test('отправка напоминаний совместных задач идет всем участникам с личными параметрами', async () => {
  const source = await readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8');
  const scheduler = source.slice(source.indexOf('async notifyShiningTasks()'));
  assert.match(scheduler, /collaboration\.members\.map\(\(member\) => \(/);
  assert.match(scheduler, /status: member\.statusOverride \?\? task\.status/);
  assert.match(scheduler, /notifyBeforeMinutes: member\.notifyBeforeMinutes/);
  assert.match(scheduler, /telegramNotifiedAt: member\.telegramNotifiedAt/);
  assert.match(scheduler, /userId: recipient\.userId/);
  assert.match(scheduler, /recipient\.memberId/);
  assert.match(scheduler, /collaborativeTaskMember\.update\(/);
});

test('серый фильтр Все есть на сайте и в Mini App, без серверного сохранения выбора', async () => {
  const [web, mini] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(web, /setSubtaskAuthorFilterByTaskId\(\(prev\) => \(\{ \.\.\.prev, \[focusedTask\.id\]: null \}\)\)/);
  assert.match(web, /bg-slate-500/);
  assert.match(web, />Все<\/button>/);
  assert.match(mini, /setOpenedTaskSubtaskAuthorFilterUserId\(null\)/);
  assert.match(mini, /backgroundColor: '#64748b'/);
  assert.match(mini, />Все<\/button>/);
});
