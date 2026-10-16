import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TELEGRAM_AI_CHAT_SETTINGS,
  TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI,
  TELEGRAM_AI_MONITOR_MODELS,
  validateTelegramAiChatSettings
} from '../src/services/telegram-ai-chat-policy.service.js';

test('Telegram assistant has three-level modes, three intervals and a safe default', () => {
  const v = validateTelegramAiChatSettings(DEFAULT_TELEGRAM_AI_CHAT_SETTINGS);
  assert.equal(v.mode, 'OBSERVE');
  assert.equal(v.taskMode, 'SUGGEST');
  assert.equal(v.checkIntervalMinutes, 30);
  assert.equal(v.monitorModel, 'gpt-6-luna');
  assert.deepEqual(TELEGRAM_AI_MONITOR_MODELS, ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6.1-sol']);
  assert.equal(v.dailyCreditLimitMilli, 50_000);
  assert.deepEqual(TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI, [
    50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null
  ]);
  const migration = readFileSync(new URL('../prisma/migrations/20261015233000_telegram_ai_assistant_slider_settings/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "taskMode"/);
  assert.match(migration, /DROP COLUMN "monthlyCreditLimitMilli"/);
  assert.match(migration, /"isEnabled" = false/);
});

test('all valid slider positions and nullable unlimited budget round-trip', () => {
  const v = DEFAULT_TELEGRAM_AI_CHAT_SETTINGS;
  for (const mode of ['OBSERVE', 'SUGGEST', 'AUTO']) {
    for (const taskMode of ['NONE', 'SUGGEST', 'AUTO']) {
      for (const interval of [5, 30, 180]) {
        const parsed = validateTelegramAiChatSettings({ ...v, mode, taskMode, checkIntervalMinutes: interval });
        assert.equal(parsed.mode, mode);
        assert.equal(parsed.taskMode, taskMode);
        assert.equal(parsed.checkIntervalMinutes, interval);
      }
    }
  }
  for (const model of TELEGRAM_AI_MONITOR_MODELS) {
    assert.equal(validateTelegramAiChatSettings({ ...v, monitorModel: model }).monitorModel, model);
  }
  for (const tier of TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI) {
    assert.equal(validateTelegramAiChatSettings({ ...v, dailyCreditLimitMilli: tier }).dailyCreditLimitMilli, tier);
  }
});

test('Telegram assistant rejects arbitrary budgets, intervals and extra automatic privileges', () => {
  const valid = DEFAULT_TELEGRAM_AI_CHAT_SETTINGS;
  for (const body of [
    { ...valid, dailyCreditLimitMilli: -1000 },
    { ...valid, dailyCreditLimitMilli: 0 },
    { ...valid, dailyCreditLimitMilli: 300_000 },
    { ...valid, dailyCreditLimitMilli: 'unlimited' },
    { ...valid, dailyCreditLimitMilli: Number.POSITIVE_INFINITY },
    { ...valid, mode: 'SUPER_AUTO' },
    { ...valid, monitorModel: 'gpt-999-nonexistent' },
    { ...valid, monitorModel: null },
    { ...valid, taskMode: 'CREATE_EVERYTHING' },
    { ...valid, checkIntervalMinutes: 15 },
    { ...valid, checkIntervalMinutes: 60 },
    { ...valid, checkIntervalMinutes: 1 },
    { ...valid, instructions: 'x'.repeat(3001) },
    { ...valid, notifyImportant: 'true' }
  ]) assert.throws(() => validateTelegramAiChatSettings(body));
});

test('assistant routes are signed-in and same-origin; preferences do not activate autonomous work', () => {
  const routes = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.match(routes, /assistant\/chats', requireAuth/);
  assert.match(routes, /assistant\/chats\/:chatId', requireAuth, requireTelegramChatOrigin/);
  const service = readFileSync(new URL('../src/services/telegram-ai-chat-policy.service.ts', import.meta.url), 'utf8');
  assert.match(service, /telegramUserChatCapability\(userId\)/);
  assert.match(service, /listSendTargets\(userId\)/);
  assert.match(service, /isEnabled: false/);
  assert.doesNotMatch(service, /\.aiHistory\(|\.sendMessage\(|\.confirm\(/);
});

test('web interface exposes four real range controls, not legacy selects/checkboxes', () => {
  const ui = readFileSync(new URL('../../client/src/components/TelegramAiAssistantSettings.tsx', import.meta.url), 'utf8');
  for (const label of ['Режим работы', 'Добавление задач', 'Интенсивность проверки', 'Дневной предел кредитов']) {
    assert.ok(ui.includes(label), 'Missing: ' + label);
  }
  assert.match(ui, /type="range"/);
  assert.match(ui, /aria-valuetext=/);
  assert.match(ui, /DAILY_LIMITS = \[/);
  assert.match(ui, /null\] as const/);
  assert.doesNotMatch(ui, /<select value=\{draft\./);
  assert.doesNotMatch(ui, /summaryFrequency|analysisLevel|maxMessagesPerCheck|monthlyCreditLimitMilli|suggestTasks/);
  assert.match(ui, /<input type="checkbox" checked=\{draft.notifyImportant\}/);
});
