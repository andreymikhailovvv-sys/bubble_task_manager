import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const file = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('monitoring is opt-in and persisted only for personal root tasks', async () => {
  const [schema, service, migration] = await Promise.all([
    file('../prisma/schema.prisma'),
    file('../src/services/task.service.ts'),
    file('../prisma/migrations/20261023182000_task_ai_monitoring/migration.sql')
  ]);
  assert.match(schema, /aiMonitoringEnabled Boolean @default\(false\)/);
  assert.match(migration, /"aiMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(service, /!isSubtask && !isEvent && !isReminder && !parent\?\.collaborationId/);
  assert.match(service, /currentTask\.collaborationId \|\| currentTask\.parentTaskId \|\| currentTask\.taskType !== 'TASK'/);
});

test('owner can read archived statuses even when opted out; writing still requires beta', async () => {
  const [monitor, routes, schema] = await Promise.all([
    file('../src/services/task-monitoring.service.ts'),
    file('../src/routes/api.ts'), file('../prisma/schema.prisma')
  ]);
  assert.match(monitor, /requireMonitoringOwner\(userId, taskId\)/);
  assert.match(monitor, /!task\.aiMonitoringEnabled/);
  assert.match(monitor, /getMonitoringStatusUnread/);
  assert.match(monitor, /markMonitoringStatusesSeen/);
  assert.match(routes, /\/tasks\/:id\/monitoring\/statuses\/unread/);
  assert.match(routes, /\/tasks\/:id\/monitoring\/statuses\/seen/);
  assert.match(routes, /apiRouter\.post\('\/tasks\/:id\/monitoring\/statuses', requireAuth, taskProposalSameOrigin/);
  assert.match(schema, /aiMonitoringStatusSeenAt DateTime\?/);
});

test('same AI-chat monitoring panel exists on desktop, Telegram and mobile web', async () => {
  const [editor, mini, panel, desktop, statuses, types] = await Promise.all([
    file('../../client/src/components/TaskEditor.tsx'),
    file('../../client/src/MiniApp.tsx'),
    file('../../client/src/components/TaskMonitoringControls.tsx'),
    file('../../client/src/App.tsx'),
    file('../../client/src/components/TaskMonitoringStatuses.tsx'),
    file('../../client/src/lib/types.ts')
  ]);
  assert.doesNotMatch(editor, /<TaskMonitoringControls/);
  assert.doesNotMatch(mini, /<TaskMonitoringControls/);
  assert.doesNotMatch(desktop, /<TaskMonitoringControls/);
  assert.match(panel, /Автомониторинг/);
  assert.match(panel, /beta/);
  assert.match(panel, /Что такое автомониторинг\?/);
  assert.match(statuses, /<TaskMonitoringControls enabled=\{monitorEnabled\}/);
  assert.match(statuses, /История статусов/);
  assert.match(statuses, /getTaskMonitoringUnread/);
  assert.match(statuses, /markTaskMonitoringSeen/);
  assert.match(statuses, /task-monitor-unread/);
  assert.equal((desktop.match(/<TaskMonitoringStatuses/g) ?? []).length, 2);
  assert.match(mini, /<TaskMonitoringStatuses taskId=\{openedTask.id\}/);
  assert.match(types, /aiMonitoringEnabled\?: boolean/);
});

test('monitor panel escapes clipping and repositions on the viewport in both themes', async () => {
  const [component, css] = await Promise.all([
    file('../../client/src/components/TaskMonitoringStatuses.tsx'),
    file('../../client/src/styles.css')
  ]);
  assert.match(component, /import \{ createPortal \} from 'react-dom'/);
  assert.match(component, /document\.body/);
  assert.match(component, /className="task-monitor-status-popover task-monitor-status-portal fixed/);
  assert.match(component, /const left = Math\.max\(GUTTER, Math\.min\(/);
  assert.match(component, /window\.addEventListener\('resize', reposition\)/);
  assert.match(component, /window\.addEventListener\('scroll', reposition, true\)/);
  assert.match(component, /document\.addEventListener\('pointerdown', outside\)/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /data-status-theme=\{layout\.theme\}/);
  assert.match(css, /task-monitor-status-popover\.task-monitor-status-portal\[data-status-theme='light'\]/);
  assert.match(css, /task-monitor-chat-link/);
  assert.match(css, /task-monitor-button/);
});
