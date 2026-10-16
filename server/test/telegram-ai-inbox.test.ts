import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatTelegramAiSummary, telegramAiThreadId, TELEGRAM_AI_PROJECT_ID } from '../src/services/telegram-ai-inbox.service.js';
import { buildMonitorPayload } from '../src/services/telegram-ai-monitor-summary.service.js';

const src = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const sample = {
  summary: 'Договорились подготовить документы.',
  decisions: ['Одобрена встреча'], obligations: ['Подготовить документы'],
  openQuestions: ['Согласовать дату'], risks: ['Срок переносится'],
  taskSuggestions: ['Подготовить документы'], important: true
};

test('Telegram monitor models are separate from chat reply selection and billing preflight', () => {
  const messages = [{ id: 7, date: 1730000000, speaker: 'Bob', text: 'Привет', truncated: false, hasMedia: false }];
  for (const model of ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.1-sol']) {
    const payload = buildMonitorPayload(messages, '', 'SUGGEST', model);
    assert.equal(payload.model, model);
    assert.equal(payload.store, false);
    assert.equal(payload.tool_choice, 'none');
  }
  const summaryService = src('../src/services/telegram-ai-monitor-summary.service.ts');
  assert.match(summaryService, /calculateMaximumRequestCreditsMilli\(\{[\s\S]*model: payload.model/);
  assert.match(summaryService, /calculateOpenAiUsageCost\(input.model/);
});

test('every monitored Telegram conversation gets stable project and thread identity', () => {
  assert.equal(TELEGRAM_AI_PROJECT_ID, 'telegram-ai-assistant-project');
  assert.equal(telegramAiThreadId('policy-123'), 'telegram-ai-assistant:policy-123');
  const server = src('../src/services/telegram-ai-inbox.service.ts');
  assert.match(server, /where: \{ userId \}/);
  assert.match(server, /telegramAiInboxEvent.findMany/);
  assert.match(server, /telegramAiChatPolicy.findMany/);
});

test('model-generated summary is rendered with explicit task proposals', () => {
  const result = formatTelegramAiSummary('Рабочая группа', sample, 'SUGGEST');
  assert.match(result, /Рабочая группа/);
  assert.match(result, /Предложения задач/);
  assert.match(result, /Подготовить документы/);
  const denied = formatTelegramAiSummary('Рабочая группа', sample, 'NONE');
  assert.doesNotMatch(denied, /Предложения задач/);
});

test('publishing is persistent, idempotent and fan-outs to system notifications and bot', () => {
  const server = src('../src/services/telegram-ai-inbox.service.ts');
  assert.match(server, /prisma\.\$transaction\(async tx =>/);
  assert.match(server, /telegramAiInboxEvent.upsert/);
  assert.match(server, /systemNotification.upsert/);
  assert.match(server, /telegramService.notifyDailyAiCheckup/);
  assert.match(server, /botStatus: 'SENDING'/);
  assert.match(server, /botStatus: 'UNKNOWN'/);
  assert.doesNotMatch(server, /telegramUserClientSend\(|telegramQuickShare\.enqueue/);
});

test('suggested tasks require human approval and are deduplicated', () => {
  const server = src('../src/services/telegram-ai-inbox.service.ts');
  const api = src('../src/routes/api.ts');
  assert.match(server, /telegramAiTaskApproval.create/);
  assert.match(server, /if \(event.policy.taskMode === 'NONE'\)/);
  assert.match(api, /assistant\/inbox\/:eventId\/tasks\/:index', requireAuth, requireTelegramChatOrigin/);
});

test('web app syncs managed Telegram project and uses owner-authorized chat context', () => {
  const app = src('../../client/src/App.tsx');
  const ui = src('../../client/src/components/ExpandedAiChat.tsx');
  const ai = src('../src/services/ai-assistant.service.ts');
  assert.match(app, /mergeTelegramAiInbox\(/);
  assert.match(app, /telegramAssistantInbox\(\)/);
  assert.match(app, /openSystemNotification\(systemNotificationToast\)/);
  assert.match(ui, /project.icon === 'telegram'/);
  assert.match(ai, /telegramAiChatPolicy.findFirst\(/);
  assert.match(ai, /request_telegram_chat_read/);
  assert.match(ai, /prepare_telegram_send/);
});
