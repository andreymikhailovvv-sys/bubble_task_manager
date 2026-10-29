import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prisma } from '../src/db/prisma.js';
import { cancelMonitoringTrigger } from '../src/services/task-monitoring-trigger.service.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('cancelling a scheduled AI action changes only the owned pending trigger', async () => {
  const task = prisma.task as unknown as { findFirst: (...args: unknown[]) => Promise<unknown> };
  const triggers = prisma.taskMonitoringTrigger as unknown as { updateMany: (...args: unknown[]) => Promise<unknown> };
  const beforeTask = task.findFirst;
  const beforeUpdate = triggers.updateMany;
  const rows = [
    { id: 'abc', taskId: 'task1', userId: 'owner', state: 'pending' },
    { id: 'xyz', taskId: 'task1', userId: 'owner', state: 'pending' },
    { id: 'abc', taskId: 'task2', userId: 'other', state: 'pending' }
  ];
  try {
    task.findFirst = async () => ({ id: 'task1', userId: 'owner', status: 'TODO', taskType: 'TASK', aiMonitoringEnabled: false });
    triggers.updateMany = async (args: unknown) => {
      const { where, data } = args as { where: { id: string; taskId: string; userId: string; state: string }; data: { state: string } };
      assert.equal(where.userId, 'owner');
      assert.equal(where.taskId, 'task1');
      assert.equal(where.state, 'pending');
      let count = 0;
      rows.forEach(row => {
        if (row.id === where.id && row.taskId === where.taskId && row.userId === where.userId && row.state === where.state) {
          row.state = data.state; count++;
        }
      });
      return { count };
    };
    assert.deepEqual(await cancelMonitoringTrigger('owner', 'task1', 'abc'), { ok: true, triggerId: 'abc', state: 'cancelled' });
    assert.equal(rows[0].state, 'cancelled');
    assert.equal(rows[1].state, 'pending');
    assert.equal(rows[2].state, 'pending');
    assert.deepEqual(await cancelMonitoringTrigger('owner', 'task1', 'abc'), { ok: false, code: 'FOLLOWUP_NOT_FOUND' });
    assert.deepEqual(await cancelMonitoringTrigger('owner', 'task1', 'no space'), { ok: false, code: 'INVALID_TRIGGER_ID' });
  } finally {
    task.findFirst = beforeTask;
    triggers.updateMany = beforeUpdate;
  }
});

test('task follow-ups expose cancel API, accessible cross, and replacement instructions to AI', async () => {
  const [routes, client, chips, ai, service] = await Promise.all([
    read('../src/routes/api.ts'), read('../../client/src/lib/api.ts'),
    read('../../client/src/components/TaskMonitoringTriggerChips.tsx'),
    read('../src/services/ai-assistant.service.ts'), read('../src/services/task-monitoring-trigger.service.ts')
  ]);
  assert.match(routes, /apiRouter.delete\('\/tasks\/:id\/monitoring\/triggers\/:triggerId'/);
  assert.match(routes, /taskProposalSameOrigin/);
  assert.match(routes, /cancelMonitoringTrigger\(req.user!\.id, req.params.id, req.params.triggerId\)/);
  assert.match(client, /cancelTaskMonitoringTrigger/);
  assert.match(chips, /aria-label=\{`Отменить:/);
  assert.match(chips, /await api.cancelTaskMonitoringTrigger\(taskId, triggerId\)/);
  assert.match(chips, /setTriggers\(current => current.filter\(item => item.id !== triggerId\)\)/);
  assert.match(ai, /'triggerId=' \+ item.id/);
  assert.match(ai, /call.name === 'cancel_task_monitoring_trigger'/);
  assert.match(ai, /СНАЧАЛА отмени его через cancel_task_monitoring_trigger/);
  assert.match(service, /TASK_MONITOR_CANCEL_FOLLOWUP_TOOL/);
});

test('compact website Quick AI sends only plain Enter and leaves Shift+Enter to newline', async () => {
  const source = await read('../../client/src/App.tsx');
  const start = source.indexOf('placeholder="Спросить быстро…"');
  assert.ok(start > 0);
  const handler = source.slice(start - 650, start);
  assert.match(handler, /e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing/);
  assert.match(handler, /e.preventDefault\(\); void sendAiChatQuestion\(true\)/);
});

test('checkup proposal details appear in the confirmation card, not repeated in report text', async () => {
  const [checkup, delivery] = await Promise.all([
    read('../src/services/daily-ai-checkup.service.ts'),
    read('../src/services/ai-checkup-delivery.service.ts')
  ]);
  assert.match(checkup, /'📋 Ближайшие задачи'/);
  assert.match(checkup, /'💡 Рекомендации'/);
  assert.doesNotMatch(checkup, /🗓️ Предложенные изменения от ИИ/);
  assert.match(delivery, /Они собраны в карточке ниже/);
  assert.match(delivery, /!proposalId/);
  assert.match(delivery, /Ничего не изменено/);
});

test('native Android follow-up chips support the same scoped cancellation', async () => {
  const [api, repository, viewModel, chat] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/PlanirovychApi.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/data/repository/WorkspaceRepository.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(api, /@DELETE\("api\/tasks\/\{id\}\/monitoring\/triggers\/\{triggerId\}"\)/);
  assert.match(repository, /api\.cancelTaskMonitoringTrigger\(taskId,triggerId\)/);
  assert.match(viewModel, /fun cancelTaskAiMonitoringTrigger\(/);
  assert.match(viewModel, /monitoringTriggers\.filter\{trigger->trigger\.id!=triggerId\}/);
  assert.match(chat, /vm\.cancelTaskAiMonitoringTrigger\(task\.id,triggerId\)/);
  assert.match(chat, /contentDescription="Отменить: "\+title/);
});
