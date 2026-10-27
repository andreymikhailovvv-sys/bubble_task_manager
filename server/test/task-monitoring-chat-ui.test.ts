import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('one monitoring event creates one visible AI reply plus an unread badge-only event', async () => {
  const [delivery, schema, migration] = await Promise.all([
    read('../src/services/task-monitoring-delivery.service.ts'),
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261024013500_monitoring_quick_chat_event_key/migration.sql')
  ]);
  assert.match(delivery, /generalAiMessage\.createMany\(/);
  assert.match(delivery, /monitoringEventKey: eventKey/);
  assert.match(delivery, /skipDuplicates: true/);
  assert.doesNotMatch(delivery, /systemNotification\.createMany/);
  assert.match(delivery, /systemNotification\.create\(/);
  assert.match(delivery, /eventKey,\s*content:/);
  assert.match(delivery, /P2002/);
  assert.match(schema, /monitoringEventKey String\? @unique/);
  assert.match(migration, /GeneralAiMessage_monitoringEventKey_key/);
});

test('monitored AI prioritizes actual help and proactively follows up at requested times', async () => {
  const [ai, worker, tool] = await Promise.all([
    read('../src/services/ai-assistant.service.ts'),
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/services/task-monitoring-trigger.service.ts')
  ]);
  assert.match(ai, /Действуй инициативно/);
  assert.match(ai, /СНАЧАЛА выполни полезную работу/);
  assert.match(ai, /После содержательного ответа поддерживай дальнейшее сопровождение/);
  assert.match(ai, /ОБЯЗАТЕЛЬНО установи триггер/);
  assert.match(ai, /Не заменяй точное пожелание произвольным напоминанием/);
  assert.match(worker, /подготовь полезные материалы, варианты/);
  assert.match(worker, /обычно устанавливай set_task_monitoring_trigger/);
  assert.match(tool, /MUST honor explicit user reminder dates/);
});

test('task-chat settings have a single monitoring entry with badges on all clients', async () => {
  const [app, mini, editor, popup, css] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/components/TaskMonitoringStatuses.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((app.match(/<TaskMonitoringStatuses/g) ?? []).length, 2);
  assert.equal((mini.match(/<TaskMonitoringStatuses/g) ?? []).length, 1);
  assert.doesNotMatch(editor, /<TaskMonitoringControls/);
  assert.doesNotMatch(app, /<TaskMonitoringControls/);
  assert.doesNotMatch(mini, /<TaskMonitoringControls/);
  assert.match(popup, /api\.updateTask\(taskId, \{ aiMonitoringEnabled: next \}\)/);
  assert.match(popup, /task-monitor-unread/);
  assert.match(popup, /getTaskMonitoringUnread/);
  assert.match(popup, /markTaskMonitoringSeen/);
  assert.match(css, /\.task-monitor-chat-link/);
});


test('monitoring unread events light up the round Quick AI launcher without duplicate chat bubbles', async () => {
  const [app, delivery] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../src/services/task-monitoring-delivery.service.ts')
  ]);
  assert.match(delivery, /systemNotification\.create\(/);
  assert.match(app, /const visibleNotifications = result.notifications;/);
  assert.match(app, /systemNotifications\.filter\(notification => !notification\.eventKey\?\.startsWith\('monitoring:'\)\)/);
  assert.match(app, /setUnreadSystemNotificationCount\(result\.notifications\.filter\(notification => notification\.readAt == null\)\.length\)/);
  assert.match(app, /unreadSystemNotificationCount > 0 \? <span/);
  assert.match(app, /markSystemNotificationsRead\(\)/);
});

test('expanded task chat has monitoring control to the left of clear button, not floating below icons', async () => {
  const app = await read('../../client/src/App.tsx');
  const expanded = app.slice(app.indexOf('focused-task-ai-expanded-panel relative'), app.indexOf('<AiModelChip value={focusedAiModel}', app.indexOf('focused-task-ai-expanded-panel relative')));
  assert.match(expanded, /<TaskMonitoringStatuses taskId=\{focusedTask\.id\}/);
  assert.ok(expanded.indexOf('<TaskMonitoringStatuses taskId={focusedTask.id}') < expanded.indexOf('onClick={clearFocusedAiDialog}'));
  assert.doesNotMatch(expanded, /absolute right-5 top-16/);
});

test('monitoring panel uses an accessible pill switch instead of a checkbox', async () => {
  const controls = await read('../../client/src/components/TaskMonitoringControls.tsx');
  assert.match(controls, /role="switch" aria-checked=\{enabled\}/);
  assert.match(controls, /disabled=\{!allowed\}/);
  assert.match(controls, /onClick=\{\(\) => onChange\(!enabled\)\}/);
  assert.match(controls, /Вкл/);
  assert.match(controls, /Выкл/);
  assert.doesNotMatch(controls, /type="checkbox"/);
});
