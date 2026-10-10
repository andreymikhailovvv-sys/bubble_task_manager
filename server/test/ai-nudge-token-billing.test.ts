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

test('web AI notification setting supplies defaults for each creation path', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /aiNotificationsEnabled: isEventEditor[\s\S]*?defaultAiNotificationsEnabled/);
  assert.match(web, /aiNotificationsEnabled: editorState\?\.task\?\.id \? payload\.aiNotificationsEnabled : \(payload\.aiNotificationsEnabled \?\? isAiNotificationsDefaultEnabled\)/);
  assert.match(web, /parentTaskId: parentTask\.id,[\s\S]*?aiNotificationsEnabled: payload\.aiNotificationsEnabled \?\? isAiNotificationsDefaultEnabled/);
  assert.match(web, /createdTask = await api\.createTask\([\s\S]*?aiNotificationsEnabled: isAiNotificationsDefaultEnabled/);
  assert.match(web, /Кредиты за подсказку ИИ списываются по фактическим токенам/);
});
