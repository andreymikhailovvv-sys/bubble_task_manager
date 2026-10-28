import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { formatMonitoringAlert, monitoringHeadline } from '../src/lib/monitoring-notification.js';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('monitoring notification shows two lines, while chats retain the full AI answer', () => {
  const alert = formatMonitoringAlert('Письмо Иванову',
    'ЗАГОЛОВОК: Письмо Иванову отправлено?\n\nЕсли уже отправил, приложи копию. Если нет, подготовь черновик.');
  assert.equal(alert.headline, 'Письмо Иванову отправлено?');
  assert.equal(alert.context, '✅Мониторинг задачи «Письмо Иванову»');
  assert.equal(alert.content, 'Письмо Иванову отправлено?\n✅Мониторинг задачи «Письмо Иванову»');
  assert.equal(alert.message, 'Письмо Иванову отправлено?\n\nЕсли уже отправил, приложи копию. Если нет, подготовь черновик.');
  assert.doesNotMatch(alert.content, /Если уже отправил/);
  assert.doesNotMatch(alert.message, /ЗАГОЛОВОК:/);
});

test('explicit headline takes precedence over body text, even when the reply has other sentences', () => {
  const alert = formatMonitoringAlert('Проект', 'ЗАГОЛОВОК: Нужна дата встречи.\n\nПервый абзац с пояснениями. Второй абзац.');
  assert.equal(alert.headline, 'Нужна дата встречи.');
  assert.equal(alert.body, 'Первый абзац с пояснениями. Второй абзац.');
  assert.equal(alert.content.split('\n').length, 2);
});

test('model headlines are clipped at 90 characters and malformed legacy prose cannot flood alerts', () => {
  const alert = formatMonitoringAlert('Проект', 'Это очень длинное предложение об анализе и подготовке множества разных материалов для большого события и дальнейшего планирования без точки');
  assert.ok(alert.headline.length <= 90);
  assert.equal(alert.content.split('\n').length, 2);
});

test('monitoring title is always derived from the actual model message, not a server template', () => {
  const fallback = monitoringHeadline('Подрядчик подтвердил макет до 16:00. Передайте материалы в печать.',
    'Ответ поддержки');
  assert.match(fallback.headline, /Подрядчик подтвердил макет до 16:00/);
  assert.doesNotMatch(fallback.headline, /Пора вернуться к задаче/);
  assert.match(fallback.body, /Передайте материалы/);
});

test('autonomous subtask completion is persisted in the existing event queue, and is not triggered by model edits', async () => {
  const [task, telegram, worker, delivery] = await Promise.all([
    read('../src/services/task.service.ts'),
    read('../src/services/telegram.service.ts'),
    read('../src/services/task-monitoring-worker.service.ts'),
    read('../src/services/task-monitoring-delivery.service.ts')
  ]);
  assert.match(task, /context\.source !== 'ai_monitoring'/);
  assert.match(task, /kind: 'subtask_completed', state: 'scheduled'/);
  assert.match(telegram, /action === 'done_subtask'[\s\S]*kind: 'subtask_completed'/);
  assert.match(worker, /kind: \{ in: \['overdue', 'subtask_completed', MONITORING_INTRO_KIND\] \}/);
  assert.match(worker, /job\.kind === 'subtask_completed'/);
  assert.match(worker, /add_monitoring_status/);
  assert.match(worker, /billingFeature: 'task_monitoring'/);
  assert.match(delivery, /formatMonitoringAlert\(title, answer\)/);
  assert.match(delivery, /const display = alert\.message/);
  assert.match(delivery, /content: alert\.content/);
  assert.match(worker, /content: visibleAnswer/);
});

test('browser and Android folded notifications use the headline and the task identifier', async () => {
  const [browser, native, telegram, push] = await Promise.all([
    read('../../client/src/lib/browser-system-notifications.ts'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/notifications/AndroidNotificationDelivery.kt'),
    read('../src/services/telegram.service.ts'),
    read('../src/lib/android-push-payload.ts')
  ]);
  assert.match(browser, /new Notification\(headline/);
  assert.match(browser, /notification\.eventKey\?\.startsWith\('monitoring:'\)/);
  assert.match(native, /setContentTitle\(headline\)/);
  assert.match(native, /setContentText\(contextLine\)/);
  assert.match(telegram, /escapeHtml\(alert\.headline\)/);
  assert.match(push, /content: \[\.\.\.event\.content\]/);
  assert.match(browser, /const \[first, second\] = notification\.content\.split/);
  assert.doesNotMatch(telegram.slice(telegram.indexOf('async notifyMonitoringTaskReply('), telegram.indexOf('async notifyOverdueTaskAiMessage(')), /alert\.body/);
});

test('autonomous charges are counted under task AI without counting child totals twice', async () => {
  const [stats, ui, api, android] = await Promise.all([
    read('../src/services/ai-credit-statistics.service.ts'),
    read('../../client/src/components/CreditUsageStats.tsx'),
    read('../../client/src/lib/api.ts'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiAccountSheets.kt')
  ]);
  assert.match(stats, /featureTotals\.get\('task_monitoring'\)/);
  assert.match(stats, /featureRows\.delete\('task_monitoring'\)/);
  assert.match(stats, /featureRows\.set\('task_chat', combined\)/);
  assert.match(stats, /label: 'Запросы'/);
  assert.match(stats, /label: 'Автомониторинг'/);
  assert.match(ui, /item\.children\?\.map/);
  assert.match(api, /children\?: CreditUsageBreakdownItem\[\]/);
  assert.match(android, /item\.children\.forEach/);
});
