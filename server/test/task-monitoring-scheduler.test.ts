import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const file = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('monitoring scheduler only scans opt-in private roots and dedupes by deadline', async () => {
  const [worker, schema, index] = await Promise.all([
    file('../src/services/task-monitoring-worker.service.ts'),
    file('../prisma/schema.prisma'),
    file('../src/index.ts')
  ]);
  assert.match(schema, /eventKey  String   @unique/);
  assert.match(worker, /aiMonitoringEnabled: true, parentTaskId: null, collaborationId: null/);
  assert.match(worker, /status: \{ not: 'DONE' as const \}/);
  assert.match(worker, /'overdue:' \+ root.id \+ ':' \+ event.id \+ ':' \+ event.due.toISOString\(\)/);
  assert.match(worker, /PrismaClientKnownRequestError/);
  assert.match(worker, /requireMonitoredTask\(userId, taskId\)/);
  assert.match(index, /pollTaskMonitoring\(\)/);
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
