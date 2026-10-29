import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/db/prisma.js';
import { createMonitoringTrigger, getMonitoringTriggers, MAX_TASK_FOLLOWUPS, MONITORING_FALLBACK_QUESTION } from '../src/services/task-monitoring-trigger.service.js';
import { createTaskChatOpenAiPayload } from '../src/services/ai-assistant.service.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('three independent ordinary-chat actions keep their identities and deadlines; fourth is rejected', async () => {
  const userId = 'followup-owner';
  const taskId = 'ordinary-task';
  const taskClient = prisma.task as unknown as { findFirst: (...args: unknown[]) => Promise<unknown> };
  const triggerClient = prisma.taskMonitoringTrigger as unknown as { findMany: (...args: unknown[]) => Promise<unknown> };
  const originalOwner = taskClient.findFirst;
  const originalList = triggerClient.findMany;
  const originalTransaction = prisma.$transaction;
  const rows: Array<{ id: string; taskId: string; userId: string; dueAt: Date; title: string; description: string; question: string; state: string }> = [];
  let serializableCalls = 0;

  try {
    taskClient.findFirst = async () => ({
      id: taskId, userId, status: 'TODO', taskType: 'TASK', aiMonitoringEnabled: false
    });
    triggerClient.findMany = async () => rows.filter(row => row.state === 'pending');
    (prisma as unknown as { $transaction: unknown }).$transaction = async (
      callback: (client: unknown) => Promise<unknown>, options: { isolationLevel: string }
    ) => {
      assert.equal(options.isolationLevel, 'Serializable');
      serializableCalls++;
      return callback({
        taskMonitoringTrigger: {
          updateMany: async ({ where, data }: { where: { question: string }; data: { state: string } }) => {
            const matches = rows.filter(row => row.state === 'pending' && row.question === where.question);
            matches.forEach(row => { row.state = data.state; });
            return { count: matches.length };
          },
          count: async () => rows.filter(row => row.state === 'pending').length,
          create: async ({ data }: { data: Omit<(typeof rows)[number], 'id' | 'state'> }) => {
            const row = { ...data, id: String(rows.length + 1), state: 'pending' };
            rows.push(row);
            return row;
          }
        }
      });
    };

    for (let index = 0; index < MAX_TASK_FOLLOWUPS; index++) {
      const result = await createMonitoringTrigger(userId, taskId, {
        delayMinutes: 30 + index * 20,
        title: 'Напомнить отправить письмо ' + index,
        description: 'Проверю переписку с подрядчиком по шагу ' + index,
        question: 'Уточнить результат письма ' + index
      });
      assert.equal(result.ok, true);
    }
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map(row => row.id)).size, 3);
    assert.deepEqual(rows.map(row => row.title), [
      'Напомнить отправить письмо 0',
      'Напомнить отправить письмо 1',
      'Напомнить отправить письмо 2'
    ]);
    assert.ok(Math.abs(rows[1].dueAt.getTime() - rows[0].dueAt.getTime() - 20 * 60_000) < 1000);

    const overflow = await createMonitoringTrigger(userId, taskId, {
      delayMinutes: 40,
      title: 'Спросить о заказе',
      description: 'Уточнить готовность доставки заказа',
      question: 'Уточнить статус заказа'
    });
    assert.deepEqual(overflow, { ok: false, code: 'FOLLOWUP_LIMIT_REACHED', limit: 3 });
    assert.equal(rows.length, 3);
    assert.equal(serializableCalls, 4);

    // A generic safety-net check-in yields its slot to a concrete action,
    // but the other two named reminders are never changed.
    rows[0].question = MONITORING_FALLBACK_QUESTION;
    const newAction = await createMonitoringTrigger(userId, taskId, {
      delayMinutes: 85,
      title: 'Проверить документы',
      description: 'Уточнить получение пакета документов',
      question: 'Спросить, получил ли адресат документы'
    });
    assert.equal(newAction.ok, true);
    assert.equal(rows[0].state, 'replaced');
    assert.equal(rows[1].state, 'pending');
    assert.equal(rows[2].state, 'pending');
    assert.equal(rows.filter(row => row.state === 'pending').length, 3);
    assert.equal(serializableCalls, 5);

    const visible = await getMonitoringTriggers(userId, taskId);
    assert.equal(visible.length, 3);
    assert.equal(visible[2].description, rows[3].description);
  } finally {
    taskClient.findFirst = originalOwner;
    triggerClient.findMany = originalList;
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTransaction;
  }
});

test('ordinary task chat exposes only the follow-up tool, not autonomous monitoring mutation tools', () => {
  const input = [{ role: 'user' as const, content: 'Напомни через 30 минут' }];
  const ordinary = createTaskChatOpenAiPayload('gpt-6-luna', input, 300, {
    followupTools: true, monitoringTools: false, allowWebSearch: false
  });
  const names = (ordinary.tools ?? []).filter(tool => tool.type === 'function').map(tool => tool.name);
  assert.ok(names.includes('set_task_monitoring_trigger'));
  assert.ok(!names.includes('create_monitoring_subtask'));
  assert.ok(!names.includes('change_monitoring_importance'));
  assert.ok(!names.includes('add_monitoring_status'));
});

test('one-time follow-up delivery does not require autonomous monitoring', async () => {
  const [worker, delivery, task, alert, chip, styles] = await Promise.all([
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/services/task-monitoring-delivery.service.ts'),
    read('../src/services/task.service.ts'),
    read('../src/lib/monitoring-notification.ts'),
    read('../../client/src/components/TaskMonitoringTriggerChips.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(worker, /kind === 'trigger'\s*\? await requireMonitoringOwner/);
  assert.match(worker, /billingFeature: monitoringEnabled \? 'task_monitoring' : 'task_chat'/);
  assert.match(delivery, /requireMonitoringOwner\(input.userId, input.taskId\)/);
  assert.match(task, /if \(input.status === 'DONE' && !updatedTask.isRecurring\)/);
  assert.match(alert, /Напоминание по задаче/);
  assert.match(chip, /role="tooltip"/);
  assert.match(chip, /selected.description \|\| selected.question/);
  assert.match(styles, /task-followup-chip\[data-tone='2'\]/);
  assert.match(styles, /task-followup-tooltip\[data-status-theme='dark'\]/);
});
