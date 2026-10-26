import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { enqueueMonitoringIntroduction, monitoringIntroEventKey } from '../src/services/task-monitoring-schedule.service.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('monitoring intro uses one persistent idempotency key per opt-in generation', async () => {
  assert.equal(monitoringIntroEventKey('root', 3), 'monitoring-intro:root:g3');
  assert.notEqual(monitoringIntroEventKey('root', 3), monitoringIntroEventKey('root', 4));
  const inserted: any[] = [];
  const db = { taskMonitoringRun: { createMany: async (arg: any) => { inserted.push(arg); return { count: 1 }; } } };
  await enqueueMonitoringIntroduction(db as never, { id: 'root', userId: 'owner', aiMonitoringGeneration: 3 });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].skipDuplicates, true);
  assert.equal(inserted[0].data[0].kind, 'monitoring_intro');
  assert.equal(inserted[0].data[0].state, 'scheduled');
  assert.equal(inserted[0].data[0].eventKey, 'monitoring-intro:root:g3');
  assert.ok(inserted[0].data[0].dueAt instanceof Date);
});

test('initial introduction is scheduled on enabling, not on every task edit or reload', async () => {
  const [task, schedule, worker] = await Promise.all([
    read('../src/services/task.service.ts'),
    read('../src/services/task-monitoring-schedule.service.ts'),
    read('../src/services/task-monitoring-worker.service.ts')
  ]);
  assert.match(task, /if \(created\.aiMonitoringEnabled && created\.status !== 'DONE'\)/);
  assert.match(task, /!currentTask\.aiMonitoringEnabled && updatedTask\.aiMonitoringEnabled/);
  assert.match(task, /enqueueMonitoringIntroduction\(tx, updatedTask\)/);
  assert.match(task, /kind: MONITORING_INTRO_KIND, state: 'scheduled'/);
  assert.match(schedule, /source\.dueDate!\.getTime\(\) <= introduction\.createdAt\.getTime\(\)/);
  assert.match(schedule, /monitoringIntroEventKey\(root\.id, root\.aiMonitoringGeneration\)/);
  assert.match(worker, /job\.kind === MONITORING_INTRO_KIND/);
  assert.match(worker, /monitoringIntroEventKey\(root\.id, root\.aiMonitoringGeneration\)/);
  assert.match(worker, /overdueCount > overdue\.length/);
  assert.match(worker, /'monitoring_intro'\)/);
});

test('only one AI run discusses multiple existing overdue subtasks and moves to one next step', async () => {
  const worker = await read('../src/services/task-monitoring-worker.service.ts');
  const intro = worker.slice(worker.indexOf('if (job.kind === MONITORING_INTRO_KIND)'),
    worker.indexOf("if (job.kind === 'subtask_completed')"));
  assert.match(intro, /prisma\.task\.count\(/);
  assert.match(intro, /orderBy: \[\{ dueDate: 'desc' \}/);
  assert.match(intro, /'Просрочено незакрытых подзадач: '/);
  assert.match(intro, /'Пользователь только что включил автомониторинг/);
  assert.equal((intro.match(/await deliver\(/g) ?? []).length, 1);
  assert.match(intro, /continue;/);
});

test('native Android shows only title and task label; Telegram uses checked label and clean headline', async () => {
  const [native, telegram] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/notifications/AndroidNotificationDelivery.kt'),
    read('../src/services/telegram.service.ts')
  ]);
  assert.match(native, /setContentTitle\(headline\)/);
  assert.match(native, /setContentText\(contextLine\)/);
  assert.match(native, /if\(!monitoring\)setStyle/);
  assert.doesNotMatch(native, /bigText\(expanded\)/);
  const notify = telegram.slice(telegram.indexOf('async notifyMonitoringTaskReply('),
    telegram.indexOf('async notifyOverdueTaskAiMessage('));
  assert.match(notify, /'<b>' \+ escapeHtml\(alert\.headline\)/);
  assert.match(notify, /✔️Мониторинг задачи <i>/);
  assert.doesNotMatch(notify, /🔔/);
});
