import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('task AI clear deletes the persisted transcript and its compacted memory, owner-scoped', async () => {
  const [routes, controller, service, client] = await Promise.all([
    source('../src/routes/api.ts'),
    source('../src/controllers/ai.controller.ts'),
    source('../src/services/ai-assistant.service.ts'),
    source('../../client/src/lib/api.ts')
  ]);
  assert.match(routes, /apiRouter\.delete\('\/tasks\/:id\/ai-chat', requireAuth, aiController\.clearTaskAssistantHistory\)/);
  assert.match(controller, /clearTaskAssistantHistory:/);
  assert.match(controller, /await aiAssistantService\.clearTaskDialog/);
  assert.match(service, /where: \{ id: input\.taskId, userId: input\.userId \}/);
  assert.match(service, /taskAiMessage\.deleteMany\(\{ where: \{ taskId: input\.taskId \} \}\)/);
  assert.match(service, /taskAiConversationMemory\.deleteMany\(\{ where: \{ taskId: input\.taskId \} \}\)/);
  assert.match(service, /await prisma\.\$transaction\(/);
  assert.match(client, /clearTaskAssistantHistory: \(taskId: string\)/);
  assert.match(client, /method: 'DELETE'/);
});

test('task AI clear waits for server success and guards against stale history poll results', async () => {
  const app = await source('../../client/src/App.tsx');
  const clear = app.slice(app.indexOf('const clearFocusedAiDialog = async'), app.indexOf('const formatFocusTime'));
  assert.match(clear, /await api\.clearTaskAssistantHistory\(taskId\)/);
  assert.ok(clear.indexOf('await api.clearTaskAssistantHistory(taskId)') < clear.indexOf('setAiDialogByTask'));
  assert.match(clear, /taskAiClearRevisionRef\.current\[taskId\]/);
  assert.match(app, /revision !== \(taskAiClearRevisionRef\.current\[focusedTaskId\] \?\? 0\)/);
  assert.match(app, /Очищаю…/);
  assert.match(app, /Полноэкранный диалог с ИИ<\/p>[\s\S]*?title=\{focusedTask\.title\}/);
});

test('focus task switches the actual task AI conversation and selected model without synthetic messages', async () => {
  const app = await source('../../client/src/App.tsx');
  assert.match(app, /const focusTaskAiDialog = focusActiveTask \? \(aiDialogByTask\[focusActiveTask\.id\]/);
  assert.match(app, /const focusTaskAiModel: AiChatModel = focusActiveTask/);
  assert.match(app, /api\.getTaskAssistantHistory\(taskId\)/);
  assert.match(app, /model: aiModelByTask\[taskId\] \?\? 'gpt-5\.4-mini'/);
  assert.match(app, /setAiDialogByTask\(prev => \(\{ \.\.\.prev, \[taskId\]/);
  assert.match(app, /\{focusTaskAiDialog\.map\(/);
  assert.doesNotMatch(app, /\{focusAiMessages\.map\(/);
  assert.doesNotMatch(app, /Пользователь переключился на эту задачу\. Дай ближайшие конкретные действия/);
  const focus = app.slice(app.indexOf('data-tour="feature-focus-ai"'), app.indexOf('      {focusRemainingSeconds > 0'));
  assert.match(focus, /<TaskMonitoringStatuses taskId=\{focusActiveTask\.id\}/);
  assert.match(focus, /<TaskMonitoringTriggerChips taskId=\{focusActiveTask\.id\} enabled/);
  assert.match(focus, /onChange=\{model => setAiModelByTask/);
});
