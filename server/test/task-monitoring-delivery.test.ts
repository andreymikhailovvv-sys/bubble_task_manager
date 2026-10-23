import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('automatic monitoring replies fan out to task chat, Quick AI, system and Telegram', async () => {
  const [worker, delivery, schema, migration] = await Promise.all([
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/services/task-monitoring-delivery.service.ts'),
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261023221000_monitoring_quick_message_destination/migration.sql')
  ]);
  assert.match(worker, /appendTaskDialogAssistantMessage/);
  assert.match(worker, /publishTaskMonitoringReply/);
  assert.match(delivery, /requireMonitoredTask\(input.userId, input.taskId\)/);
  assert.match(delivery, /systemNotification\.createMany/);
  assert.match(delivery, /eventKey = 'monitoring:' \+ input.runId/);
  assert.match(delivery, /skipDuplicates: true/);
  assert.match(delivery, /generalAiMessage\.create/);
  assert.match(delivery, /monitoringTaskId: task.id/);
  assert.match(delivery, /telegramService\.notifyMonitoringTaskReply/);
  assert.match(schema, /monitoringTaskId String\?/);
  assert.match(migration, /ALTER TABLE "GeneralAiMessage" ADD COLUMN "monitoringTaskId"/);
});

test('Telegram Reply opens exact task AI Mini App chat', async () => {
  const telegram = await read('../src/services/telegram.service.ts');
  const mini = await read('../../client/src/MiniApp.tsx');
  assert.match(telegram, /async notifyMonitoringTaskReply/);
  assert.match(telegram, /text: '↩️ Ответить', web_app: \{ url: buildMiniAppTaskAiUrl\(input.taskId\) \}/);
  assert.match(telegram, /const buildMiniAppTaskAiUrl/);
  assert.match(mini, /if \(launchParams.openAi\) setIsAiDialogOpen\(true\)/);
});

test('desktop notification and mobile quick message navigate directly to task AI', async () => {
  const [app, mini, ai, styles] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../src/services/ai-assistant.service.ts'),
    read('../../client/src/styles.css')
  ]);
  assert.match(app, /eventKey.startsWith\('monitoring:'\)/);
  assert.match(app, /onOpenTaskAi=\{/);
  assert.match(app, /item.message.monitoringTaskId/);
  assert.match(mini, /message.monitoringTaskId/);
  assert.match(mini, /monitoringNotificationToast/);
  assert.match(ai, /monitoringTaskId: true/);
  assert.match(styles, /task-monitor-status-popover/);
});
