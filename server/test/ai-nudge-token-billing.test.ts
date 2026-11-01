import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('overdue AI reminders use metered wallet charges and show actual cost in Telegram', async () => {
  const [assistant, controller, telegram, api, web] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8')
  ]);
  const nudge = assistant.slice(assistant.indexOf('generateOverdueTaskNudge: async'), assistant.indexOf('optimizeTimelineSchedule: async'));
  const taskChat = assistant.slice(assistant.indexOf('askTaskAssistant: async'), assistant.indexOf('askGeneralAssistant: async'));

  assert.match(nudge, /billingMode: 'dynamic'/);
  assert.match(nudge, /billingFeature: 'overdue_nudge'/);
  assert.doesNotMatch(nudge, /chargeSingleAiNotificationCredit|skipCreditsCharge: true/);
  assert.match(nudge, /creditsSpentMilli: result\.billing\.creditsSpentMilli/);
  assert.match(nudge, /overdueAiNotifiedAt: null/);
  assert.match(taskChat, /reserveAiCreditsMilliUpTo/);
  assert.match(taskChat, /settleAiCreditReservation/);
  assert.match(taskChat, /feature: input\.billingFeature \?\? 'task_chat'/);
  assert.match(controller, /creditsSpentMilli: result\.billing\?\.creditsSpentMilli \?\? 0/);
  assert.match(telegram, /Потрачено: \$\{escapeHtml\(formatCreditsSpent\(creditsSpentMilli\)\)\}/);
  assert.match(api, /ai-overdue-nudge[\s\S]*?/);
  assert.match(web, /creditsSpentMilli: result\.billing\?\.creditsSpentMilli \?\? 0/);
});

test('legacy AI notification settings are removed while task reminders and monitoring remain', async () => {
  const [web, editor, mini, server, routes] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(web, /Уведомления от ИИ|уведомления от ИИ|data-tour="ai-notifications-settings"/);
  assert.doesNotMatch(editor, /уведомления от ИИ/);
  assert.doesNotMatch(mini, /уведомления от ИИ|Уведомления от ИИ/);
  assert.match(server, /aiNotificationsEnabled: false/);
  assert.match(routes, /ai-overdue-nudge'[^\\n]+410/);
  assert.match(web, /<AiCheckupScheduleSettings/);
  assert.match(web, /TaskMonitoringStatuses/);
});
