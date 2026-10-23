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

test('status endpoints re-check owner and monitoring before reading or writing', async () => {
  const [monitor, routes] = await Promise.all([
    file('../src/services/task-monitoring.service.ts'), file('../src/routes/api.ts')
  ]);
  assert.match(monitor, /userId, parentTaskId: null, collaborationId: null, taskType: 'TASK', aiMonitoringEnabled: true/);
  assert.match(monitor, /requireMonitoredTask\(userId, taskId\)/);
  assert.match(routes, /apiRouter\.get\('\/tasks\/:id\/monitoring\/statuses'/);
  assert.match(routes, /apiRouter\.post\('\/tasks\/:id\/monitoring\/statuses', requireAuth, taskProposalSameOrigin/);
});

test('same beta opt-in/status UI exists on web, Telegram and mobile web', async () => {
  const [web, mini, panel, types] = await Promise.all([
    file('../../client/src/components/TaskEditor.tsx'), file('../../client/src/MiniApp.tsx'),
    file('../../client/src/components/TaskMonitoringControls.tsx'), file('../../client/src/lib/types.ts')
  ]);
  assert.match(web, /<TaskMonitoringControls/);
  assert.match(mini, /<TaskMonitoringControls/g);
  assert.match(panel, /Автомониторинг/);
  assert.match(panel, /beta/);
  assert.match(panel, /Что такое автомониторинг\?/);
  const statuses = await file('../../client/src/components/TaskMonitoringStatuses.tsx');
  const desktop = await file('../../client/src/App.tsx');
  assert.doesNotMatch(panel, /task-monitor-status-timeline|statuses\.map\(/);
  assert.match(statuses, /История статусов/);
  assert.match(statuses, /task-monitor-status-timeline/);
  assert.match(desktop, /<TaskMonitoringControls/);
  assert.match(desktop, /aiMonitoringEnabled: task.aiMonitoringEnabled/);
  assert.match(desktop, /'aiNotificationsEnabled', 'aiMonitoringEnabled'/);
  assert.equal((desktop.match(/<TaskMonitoringStatuses/g) ?? []).length, 2);
  assert.match(mini, /<TaskMonitoringStatuses taskId=\{openedTask.id\}/);
  assert.match(types, /aiMonitoringEnabled\?: boolean/);
});


test('status popover escapes task-chat clipping and stays within the visible viewport in both themes', async () => {
  const [component, css, desktop, mini] = await Promise.all([
    file('../../client/src/components/TaskMonitoringStatuses.tsx'),
    file('../../client/src/styles.css'),
    file('../../client/src/App.tsx'),
    file('../../client/src/MiniApp.tsx')
  ]);
  assert.match(component, /import \{ createPortal \} from 'react-dom'/);
  assert.match(component, /\), document\.body/);
  assert.match(component, /className="task-monitor-status-popover task-monitor-status-portal fixed/);
  assert.match(component, /const left = Math\.max\(GUTTER, Math\.min\(/);
  assert.match(component, /const openAbove = availableBelow < 260 && availableAbove > availableBelow/);
  assert.match(component, /style=\{\{ left: layout\.left, top: layout\.top, width: layout\.width, maxHeight: layout\.maxHeight \}\}/);
  assert.match(component, /window\.addEventListener\('resize', reposition\)/);
  assert.match(component, /window\.addEventListener\('scroll', reposition, true\)/);
  assert.match(component, /document\.addEventListener\('pointerdown', onPointerDown\)/);
  assert.match(component, /event\.key === 'Escape'/);
  assert.match(component, /data-status-theme=\{layout\.theme\}/);
  assert.match(css, /task-monitor-status-popover\.task-monitor-status-portal\[data-status-theme='light'\]/);
  assert.match(css, /max-width: calc\(100vw - 24px\)/);
  assert.doesNotMatch(css, /\.miniapp-ai-chat-header-task:has\(\.task-monitor-status-anchor\)/);
  assert.equal((desktop.match(/<TaskMonitoringStatuses/g) ?? []).length, 2);
  assert.match(mini, /<TaskMonitoringStatuses taskId=\{openedTask.id\}/);
});
