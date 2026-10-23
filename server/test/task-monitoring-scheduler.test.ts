import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const file = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('event-driven monitoring saves per-task and subtask deadlines, not a repeating overdue scan', async () => {
  const [worker, schedule, schema, migration, index] = await Promise.all([
    file('../src/services/task-monitoring-worker.service.ts'),
    file('../src/services/task-monitoring-schedule.service.ts'),
    file('../prisma/schema.prisma'),
    file('../prisma/migrations/20261023194000_task_monitoring_deadline_queue/migration.sql'),
    file('../src/index.ts')
  ]);
  assert.match(schema, /dueAt\s+DateTime\?/);
  assert.match(schema, /sourceTaskId String\?/);
  assert.match(schema, /@@index\(\[state, dueAt\]\)/);
  assert.match(migration, /TaskMonitoringRun_state_dueAt_idx/);
  assert.match(schedule, /aiMonitoringEnabled: true/);
  assert.match(schedule, /'overdue:' \+ root.id \+ ':' \+ source.id \+ ':' \+ source.dueDate!\.toISOString\(\)/);
  assert.match(schedule, /state: 'cancelled'/);
  assert.match(schedule, /status === 'DONE'/);
  assert.match(schedule, /skipDuplicates: true/);
  assert.match(worker, /kind: 'overdue', state: 'scheduled', dueAt: \{ lte: now \}/);
  assert.match(worker, /deadlineStillCurrent\(/);
  assert.match(worker, /state: 'processing'/);
  assert.match(worker, /startTaskMonitoringWorker\(\)/);
  assert.match(worker, /recoverMonitoredDeadlinesOnBoot\(\)/);
  assert.match(worker, /RECOVERY_INTERVAL_MS/);
  assert.doesNotMatch(worker, /prisma\.task\.findMany\(/);
  assert.match(index, /startTaskMonitoringWorker\(\)/);
  assert.doesNotMatch(index, /setInterval\(\(\) => \{\s*void pollTaskMonitoring/);
});

test('task mutations schedule/cancel deadlines for both main tasks and subtasks', async () => {
  const [task, schedule, trigger] = await Promise.all([
    file('../src/services/task.service.ts'),
    file('../src/services/task-monitoring-schedule.service.ts'),
    file('../src/services/task-monitoring-trigger.service.ts')
  ]);
  assert.match(task, /await rescheduleMonitoringSource\(prisma, created.id\)/);
  assert.match(task, /await rescheduleMonitoringSource\(tx, id\)/);
  assert.match(task, /await rescheduleMonitoringTree\(tx, id\)/);
  assert.match(task, /await cancelMonitoringSource\(prisma, id\)/);
  assert.match(schedule, /where: \{ sourceTaskId: sourceId, kind: MONITOR_KIND, state: 'scheduled' \}/);
  assert.match(schedule, /root\.status === 'DONE' \|\| root\.collaborationId/);
  assert.match(trigger, /signalTaskMonitoringWakeup\(\)/);
});

test('trigger tool is available only for opted-in personal tasks and revalidates on server', async () => {
  const [ai, trigger, route] = await Promise.all([
    file('../src/services/ai-assistant.service.ts'),
    file('../src/services/task-monitoring-trigger.service.ts'),
    file('../src/routes/api.ts')
  ]);
  assert.match(ai, /monitoringTools: monitoringEnabled/);
  assert.match(ai, /task.aiMonitoringEnabled === true && task.userId === input.userId/);
  assert.match(ai, /call.name === 'set_task_monitoring_trigger'/);
  assert.match(trigger, /requireMonitoredTask\(userId, taskId\)/);
  assert.match(trigger, /minimum: 5, maximum: 10080/);
  assert.match(route, /\/tasks\/:id\/monitoring\/triggers/);
});

test('human responses cancel pending triggers, opt-out cancels all pending reminders', async () => {
  const [ai, monitor, task, controller, worker] = await Promise.all([
    file('../src/services/ai-assistant.service.ts'),
    file('../src/services/task-monitoring.service.ts'),
    file('../src/services/task.service.ts'),
    file('../src/controllers/ai.controller.ts'),
    file('../src/services/task-monitoring-worker.service.ts')
  ]);
  assert.match(ai, /cancelPendingMonitoringTriggers\(input.userId, input.taskId, input.replyReceivedAt\)/);
  assert.match(controller, /replyReceivedAt: taskReplyReceivedAt/);
  assert.match(monitor, /updatedAt: \{ lte: receivedAt \}/);
  assert.match(task, /input.aiMonitoringEnabled === false \|\| input.status === 'DONE'/);
  assert.match(worker, /role: 'user', createdAt: \{ gt: trigger.updatedAt \}/);
});

test('follow-up countdown is visible in task chat on web and mobile', async () => {
  const [web, mini, chip] = await Promise.all([
    file('../../client/src/App.tsx'),
    file('../../client/src/MiniApp.tsx'),
    file('../../client/src/components/TaskMonitoringTriggerChips.tsx')
  ]);
  assert.equal((web.match(/<TaskMonitoringTriggerChips/g) ?? []).length, 2);
  assert.match(mini, /<TaskMonitoringTriggerChips taskId=\{openedTask.id\}/);
  assert.match(chip, /Триггер запущен/);
  assert.match(chip, /getTaskMonitoringTriggers/);
});
