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
  assert.match(schedule, /'overdue:' \+ root.id \+ ':g' \+ root.aiMonitoringGeneration \+ ':' \+ source.id \+ ':' \+ source.dueDate!\.toISOString\(\)/);
  assert.match(schedule, /state: 'cancelled'/);
  assert.match(schedule, /status === 'DONE'/);
  assert.match(schedule, /skipDuplicates: true/);
  assert.match(worker, /kind: \{ in: \['overdue', 'subtask_completed', MONITORING_INTRO_KIND\] \}, state: 'scheduled', dueAt: \{ lte: now \}/);
  assert.match(worker, /deadlineStillCurrent\(/);
  assert.match(worker, /state: 'processing'/);
  assert.match(worker, /startTaskMonitoringWorker\(\)/);
  assert.match(worker, /recoverMonitoredDeadlinesOnBoot\(\)/);
  assert.match(worker, /RECOVERY_INTERVAL_MS/);
  // A bounded lookup of remaining subtasks is needed after completion;
  // that is not a global overdue polling scan.
  assert.match(worker, /parentTaskId: job\.taskId, userId: job\.userId/);
  assert.match(worker, /take: 8, select: \{ title: true, dueDate: true \}/);
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

test('one-time follow-up tool works for owned normal tasks and monitoring actions remain gated', async () => {
  const [ai, trigger, route] = await Promise.all([
    file('../src/services/ai-assistant.service.ts'),
    file('../src/services/task-monitoring-trigger.service.ts'),
    file('../src/routes/api.ts')
  ]);
  assert.match(ai, /monitoringTools: monitoringEnabled, followupTools: followupToolsEnabled/);
  assert.match(ai, /task.aiMonitoringEnabled === true && task.userId === input.userId/);
  assert.match(ai, /call.name === 'set_task_monitoring_trigger'/);
  assert.match(trigger, /requireMonitoringOwner\(userId, taskId\)/);
  assert.match(trigger, /minimum: 5, maximum: 10080/);
  assert.match(trigger, /MAX_TASK_FOLLOWUPS = 3/);
  assert.match(trigger, /TransactionIsolationLevel.Serializable/);
  assert.match(route, /\/tasks\/:id\/monitoring\/triggers/);
});

test('human replies cancel only fallback; opt-out preserves regular reminders while completion cancels', async () => {
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
  assert.match(monitor, /question: MONITORING_FALLBACK_QUESTION/);
  assert.match(task, /input.status === 'DONE' && !updatedTask.isRecurring/);
  assert.doesNotMatch(task, /input.aiMonitoringEnabled === false \|\| input.status === 'DONE'/);
  assert.match(worker, /const isFallback = trigger.question === MONITORING_FALLBACK_QUESTION/);
  assert.match(worker, /const hasAnswer = isFallback/);
  assert.match(worker, /if \(!isFallback\) return true/);
});

test('follow-up countdown is visible in task chat on web and mobile', async () => {
  const [web, mini, chip] = await Promise.all([
    file('../../client/src/App.tsx'),
    file('../../client/src/MiniApp.tsx'),
    file('../../client/src/components/TaskMonitoringTriggerChips.tsx')
  ]);
  assert.equal((web.match(/<TaskMonitoringTriggerChips/g) ?? []).length, 4);
  assert.match(mini, /<TaskMonitoringTriggerChips taskId=\{openedTask.id\}/);
  assert.doesNotMatch(chip, /Триггер запущен/);
  assert.match(chip, /trigger.title \|\| 'Уточнить по задаче'/);
  assert.match(chip, /createPortal\(/);
  assert.match(chip, /data-tone=\{index % 3\}/);
  assert.match(chip, /getTaskMonitoringTriggers/);
  assert.match(chip, /task-monitoring-triggers-updated/);
  assert.match(chip, /requestRevision/);
  assert.match(chip, /window.addEventListener\('focus'/);
  const api = await file('../../client/src/lib/api.ts');
  assert.match(api, /window.dispatchEvent\(new CustomEvent\('task-monitoring-triggers-updated'/);
});


test('Telegram snoozes, AI bulk moves and undo actions update persisted monitored deadlines', async () => {
  const [telegram, ai, undo, schedule] = await Promise.all([
    file('../src/services/telegram.service.ts'),
    file('../src/services/ai-assistant.service.ts'),
    file('../src/services/ai-task-proposal-undo.service.ts'),
    file('../src/services/task-monitoring-schedule.service.ts')
  ]);
  assert.match(telegram, /refreshMonitoringAfterExternalWrite\(\[task\.id\]\)/);
  assert.match(telegram, /refreshMonitoringAfterExternalWrite\(\[subtask\.id\]\)/);
  assert.match(telegram, /rescheduleMonitoringTree\(prisma, completed\.taskId\)/);
  assert.match(ai, /refreshMonitoringAfterExternalWrite\(updates\.map\(u => u\.taskId\)\)/);
  assert.match(ai, /refreshMonitoringAfterExternalWrite\(input\.plan\.map\(item => item\.taskId\)\)/);
  assert.match(ai, /refreshMonitoringAfterExternalWrite\(candidates\.map\(item => item\.id\)\)/);
  assert.match(undo, /await rescheduleMonitoringSource\(tx, item\.id\)/);
  assert.match(schedule, /refreshMonitoringAfterExternalWrite\(sourceIds: readonly string\[\]\)/);
});


test('a new opt-in session can rearm the same overdue deadline, without duplicates from ordinary saves', async () => {
  const [task, schedule, schema, migration, worker, route] = await Promise.all([
    file('../src/services/task.service.ts'),
    file('../src/services/task-monitoring-schedule.service.ts'),
    file('../prisma/schema.prisma'),
    file('../prisma/migrations/20261024010000_monitoring_reactivation_generation/migration.sql'),
    file('../src/services/task-monitoring-worker.service.ts'),
    file('../src/routes/api.ts')
  ]);
  assert.match(schema, /aiMonitoringGeneration Int @default\(0\)/);
  assert.match(migration, /ADD COLUMN "aiMonitoringGeneration" INTEGER NOT NULL DEFAULT 0/);
  assert.match(task, /input.aiMonitoringEnabled === true && !currentTask.aiMonitoringEnabled/);
  assert.match(task, /patch.aiMonitoringGeneration = \{ increment: 1 \}/);
  assert.match(schedule, /':g' \+ root.aiMonitoringGeneration/);
  assert.match(worker, /\[TaskMonitoring\] event worker started/);
  assert.match(worker, /\[TaskMonitoring\] deadline claimed/);
  assert.match(worker, /void pollTaskMonitoring\(\)\.catch\(error =>\s*console.error\('\[TaskMonitoring\] immediate dispatch failed'/);
  assert.match(route, /apiRouter.get\('\/tasks\/:id\/monitoring\/diagnostics', requireAuth/);
  assert.match(route, /requireMonitoredTask\(req.user!\.id, req.params.id\)/);
});
