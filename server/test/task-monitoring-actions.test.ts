import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('autonomous edits are advertised exclusively in opted-in task chats', async () => {
  const [ai, actions] = await Promise.all([
    read('../src/services/ai-assistant.service.ts'),
    read('../src/services/task-monitoring-actions.service.ts')
  ]);
  assert.match(ai, /monitoringTools: monitoringEnabled/);
  assert.match(ai, /monitoringTools \? TASK_MONITOR_ACTION_TOOLS/);
  assert.match(ai, /followupTools \|\| options\?\.monitoringTools \? \[TASK_MONITOR_FOLLOWUP_TOOL, TASK_MONITOR_CANCEL_FOLLOWUP_TOOL\]/);
  assert.match(ai, /monitoringActionsExecuted <= 3/);
  assert.match(actions, /requireMonitoredTask\(input.userId, input.taskId\)/);
  assert.match(actions, /eventKey = 'monitor-action:' \+ input.requestId \+ ':' \+ input.callId/);
  assert.match(actions, /PrismaClientKnownRequestError/);
});

test('monitoring subtasks have future due dates and cannot be created as speculative duplicates', async () => {
  const actions = await read('../src/services/task-monitoring-actions.service.ts');
  assert.match(actions, /dueDate.getTime\(\) < Date.now\(\) \+ 60_000/);
  assert.match(actions, /90 \* 86400_000/);
  assert.match(actions, /parentTaskId: task.id/);
  assert.match(actions, /skippedDuplicate: true/);
});

test('AI priority changes are bound to 1..5 and recorded in task activity and chat', async () => {
  const [actions, web, mini, types] = await Promise.all([
    read('../src/services/task-monitoring-actions.service.ts'),
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/lib/types.ts')
  ]);
  assert.match(actions, /importance < 1 \|\| importance > 5/);
  assert.match(actions, /source: 'ai_monitoring'/);
  assert.match(actions, /type: 'monitoring_importance_changed'/);
  assert.match(actions, /messageKind: 'MONITOR_ACTION'/);
  const ai = await read('../src/services/ai-assistant.service.ts');
  assert.match(ai, /message.messageKind === 'MONITOR_ACTION'/);
  assert.match(web, /TaskMonitoringActionBadge/);
  assert.match(mini, /TaskMonitoringActionBadge/);
  assert.match(types, /'MONITOR_ACTION'/);
});

test('chat monitoring sources remain disabled until separate provider consent exists', async () => {
  const actions = await read('../src/services/task-monitoring-actions.service.ts');
  assert.match(actions, /FUTURE_MONITORING_SOURCES = \['telegram', 'email'\]/);
  assert.doesNotMatch(actions, /sendTelegramMessage|readGmailInbox/);
});
