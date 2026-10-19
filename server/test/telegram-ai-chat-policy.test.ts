import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TELEGRAM_AI_CHAT_SETTINGS,
  TELEGRAM_AI_DAILY_CREDIT_TIERS_MILLI,
  TELEGRAM_AI_MONITOR_MODELS,
  TELEGRAM_AI_INTERVALS, TELEGRAM_AI_SUMMARY_INTERVALS,
  validateTelegramAiChatSettings
} from '../src/services/telegram-ai-chat-policy.service.js';

test('Telegram assistant has independent participation, summary and task settings', () => {
  const v = validateTelegramAiChatSettings(DEFAULT_TELEGRAM_AI_CHAT_SETTINGS);
  assert.equal(v.mode, 'OBSERVE');
  assert.equal(v.taskMode, 'SUGGEST');
  assert.equal(v.taskIntervalMinutes, 30);
  assert.equal(v.taskCreationWhen, '');
  assert.equal(validateTelegramAiChatSettings({ ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS,
    taskCreationWhen: 'Только по конкретным просьбам' }).taskCreationWhen,
    'Только по конкретным просьбам');
  assert.throws(() => validateTelegramAiChatSettings({
    ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS, taskCreationWhen: 'x'.repeat(2001)
  }));

  assert.equal(v.interactionIntervalMinutes, 5);
  assert.equal(v.autoReplyIntervalMinutes, 5);
  assert.equal(v.summaryIntervalMinutes, 30);
  const oldClientPayload = { ...DEFAULT_TELEGRAM_AI_CHAT_SETTINGS } as Partial<typeof DEFAULT_TELEGRAM_AI_CHAT_SETTINGS>;
  delete oldClientPayload.taskIntervalMinutes;
  assert.equal(validateTelegramAiChatSettings(oldClientPayload).taskIntervalMinutes, 30);
  const migrationTaskFrequency = readFileSync(new URL('../prisma/migrations/20261019123000_telegram_ai_task_interval_minutes/migration.sql', import.meta.url), 'utf8');
  assert.match(migrationTaskFrequency, /ADD COLUMN "taskIntervalMinutes" INTEGER NOT NULL DEFAULT 30/);
  assert.deepEqual(TELEGRAM_AI_INTERVALS, [0, 5, 10, 30, 180, 360, 1440]);
  assert.deepEqual(TELEGRAM_AI_SUMMARY_INTERVALS, [-1, 0, 5, 10, 30, 180, 360, 1440]);
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
      for (const interval of TELEGRAM_AI_INTERVALS) {
        const parsed = validateTelegramAiChatSettings({ ...v, mode, taskMode,
          interactionIntervalMinutes: interval, autoReplyIntervalMinutes: interval,
          taskIntervalMinutes: interval,
          ...(mode === 'SUGGEST' ? { suggestWhen: 'Когда упоминают', suggestHow: 'Коротко' } : {}),
          ...(mode === 'AUTO' ? { autoReplyWhen: 'Когда меня упоминают', autoReplyHow: 'Коротко отвечай' } : {}) });
        assert.equal(parsed.mode, mode);
        assert.equal(parsed.taskMode, taskMode);
        assert.equal(parsed.interactionIntervalMinutes, interval);
        assert.equal(parsed.autoReplyIntervalMinutes, interval);
        assert.equal(parsed.taskIntervalMinutes, interval);
      }
    }
  }
  for (const interval of TELEGRAM_AI_SUMMARY_INTERVALS) {
    assert.equal(validateTelegramAiChatSettings({ ...v, summaryIntervalMinutes: interval }).summaryIntervalMinutes, interval);
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
    { ...valid, dailyCreditLimitMilli: -100 },
    { ...valid, dailyCreditLimitMilli: 'unlimited' },
    { ...valid, dailyCreditLimitMilli: Number.POSITIVE_INFINITY },
    { ...valid, mode: 'SUPER_AUTO' },
    { ...valid, monitorModel: 'gpt-999-nonexistent' },
    { ...valid, monitorModel: null },
    { ...valid, taskMode: 'CREATE_EVERYTHING' },
    { ...valid, interactionIntervalMinutes: 15 },
    { ...valid, taskIntervalMinutes: -9 },
    { ...valid, taskIntervalMinutes: -1 },
    { ...valid, taskIntervalMinutes: '5' },
    { ...valid, autoReplyIntervalMinutes: -4 },
    { ...valid, summaryIntervalMinutes: -2 },
    { ...valid, taskIntervalMonths: -3 },
    { ...valid, taskIntervalMonths: 121 },
    { ...valid, autoReplyIntervalMonths: '1' },
    { ...valid, summaryIntervalMonths: 2, summaryIntervalMinutes: -1 },
    { ...valid, dailyCreditLimitMilli: 100_000_001 },
    { ...valid, dailyCreditLimitMilli: 10.5 },
    { ...valid, summaryInstructions: 'x'.repeat(2001) },
    { ...valid, mode: 'SUGGEST' },
    { ...valid, mode: 'AUTO' },
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

test('web interface separates participation frequency and summary configuration', () => {
  const ui = readFileSync(new URL('../../client/src/components/TelegramAiAssistantSettings.tsx', import.meta.url), 'utf8');
  for (const label of ['Участие в переписке', 'Добавление задач', 'Частота добавления задач', 'Частота сводок', 'Частота предложений ответов', 'Частота автоответов', 'Дневной предел кредитов']) {
    assert.ok(ui.includes(label), 'Missing: ' + label);
  }
  assert.match(ui, /type="range"/);
  assert.match(ui, /draft\.taskMode !== 'NONE' && \(/);
  assert.match(ui, /minutes=\{draft\.taskIntervalMinutes\} months=\{draft\.taskIntervalMonths\}/);
  assert.equal((ui.match(/<details key=/g) ?? []).length, 4);
  assert.equal((ui.match(/<summary className="telegram-ai-settings-section__header">/g) ?? []).length, 4);
  assert.doesNotMatch(ui, /<details key=[^\n]+ open\b/);
  for (const name of ['Участие в переписке', 'Добавление задач', 'Частота сводок', 'Общие параметры']) {
    assert.ok(ui.includes(name), name);
  }
  const css = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.css', import.meta.url), 'utf8');
  assert.match(css, /\.telegram-ai-settings-section/);
  assert.match(css, /background: var\(--integration-surface\)/);
  assert.match(ui, /aria-valuetext=/);
  assert.match(ui, /DAILY_LIMITS = \[/);
  assert.match(ui, /null\] as const/);
  assert.doesNotMatch(ui, /<select value=\{draft\./);
  assert.doesNotMatch(ui, /summaryFrequency|analysisLevel|maxMessagesPerCheck|monthlyCreditLimitMilli|suggestTasks/);
  assert.match(ui, /<input type="checkbox" checked=\{draft.notifyImportant\}/);
  assert.doesNotMatch(ui, />Инструкции ассистенту</);
  assert.doesNotMatch(ui, /title="Интенсивность проверки"/);
});

test('Telegram assistant custom values preserve minutes, calendar months and milli-credit caps', () => {
  const base = DEFAULT_TELEGRAM_AI_CHAT_SETTINGS;
  const custom = validateTelegramAiChatSettings({
    ...base,
    taskIntervalMinutes: 90, taskIntervalMonths: null,
    autoReplyIntervalMinutes: 43200, autoReplyIntervalMonths: 1,
    summaryIntervalMinutes: 1440, summaryIntervalMonths: 2,
    dailyCreditLimitMilli: 375_125
  });
  assert.equal(custom.taskIntervalMinutes, 90);
  assert.equal(custom.autoReplyIntervalMonths, 1);
  assert.equal(custom.summaryIntervalMonths, 2);
  assert.equal(custom.dailyCreditLimitMilli, 375_125);
  assert.equal(validateTelegramAiChatSettings({
    ...base, taskIntervalMonths: undefined, autoReplyIntervalMonths: undefined,
    summaryIntervalMonths: undefined
  }).taskIntervalMonths, null);
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../prisma/migrations/20261019195000_telegram_assistant_custom_month_intervals/migration.sql', import.meta.url), 'utf8');
  for (const name of ['taskIntervalMonths', 'autoReplyIntervalMonths', 'summaryIntervalMonths']) {
    assert.match(schema, new RegExp(name));
    assert.match(migration, new RegExp(name));
  }
});
test('wider Telegram settings put profile tags above one-column sliders and use matching recipient modal', () => {
  const ui = readFileSync(new URL('../../client/src/components/TelegramAiAssistantSettings.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.css', import.meta.url), 'utf8');
  for (const fragment of ['telegram-ai-profile-list', 'Добавить переписку', 'Добавить ассистента',
    'pickerDialogs', 'pickerSearch', 'telegram-quick-share__recipients', 'TimeFrequencySlider',
    'CreditLimitSlider', 'CUSTOM_OPTION', 'aria-label="Поиск по перепискам Telegram"']) {
    assert.ok(ui.includes(fragment), fragment);
  }
  assert.ok(ui.indexOf('telegram-ai-profile-list') < ui.indexOf('aria-label="Настройки участия в переписке"'));
  assert.match(css, /telegram-ai-slider-setting__marks span/);
  assert.match(css, /telegram-ai-slider-setting__labels span/);
  assert.match(css, /scrollbar-gutter: stable/);
});

test('Telegram assistant live monitor status colors and closed settings work in both themes', () => {
  const ui = readFileSync(new URL('../../client/src/components/TelegramAiAssistantSettings.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.css', import.meta.url), 'utf8');
  assert.match(ui, /telegram-ai-monitor-status--\$\{selected\.isEnabled \? 'active' : 'paused'\}/);
  assert.match(ui, /Мониторинг включён/);
  assert.match(ui, /Мониторинг приостановлен/);
  assert.match(ui, /<ChevronDown size=\{19\}/);
  for (const key of ['conversation', 'tasks', 'summaries', 'general']) {
    assert.ok(ui.includes('telegram-ai-settings-section--' + key), key);
    assert.match(css, new RegExp('telegram-ai-settings-section--' + key));
  }
  for (const state of ['active', 'paused']) {
    assert.match(css, new RegExp('telegram-ai-monitor-status--' + state));
    assert.match(css, new RegExp("body\\[data-theme='light'\\] \\.telegram-ai-monitor-status--" + state));
  }
  assert.match(css, /\.telegram-ai-settings-section:not\(\[open\]\) > \.telegram-ai-settings-section__content/);
  assert.match(css, /\.telegram-ai-slider-setting__labels--dense span:nth-child\(even\)/);
  assert.match(css, /--slider-inset: 44px/);
  assert.match(ui, /telegram-ai-slider-setting--dense/);
});

test('Telegram assistant colored accordion surfaces use standard theme colors except for left accent bars', () => {
  const css = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.css', import.meta.url), 'utf8');
  const section = css.slice(css.indexOf('/* Neutral accordion cards.'), css.indexOf('/* Color is reserved for the live state panel'));
  assert.match(section, /background: var\(--integration-surface\)/);
  assert.match(section, /border-color: var\(--integration-border\)/);
  assert.match(section, /color: var\(--integration-text\)/);
  assert.match(section, /box-shadow: inset 3px 0 0 var\(--section-accent\)/);
  assert.match(section, /color: var\(--integration-muted\)/);
  assert.doesNotMatch(section, /--section-(?:surface|border|caption)/);
  assert.doesNotMatch(section, /color: var\(--section-accent\)/);
  for (const state of ['active', 'paused']) {
    assert.match(css, new RegExp('\\.telegram-ai-monitor-status--' + state + ' \\{'));
  }
});
