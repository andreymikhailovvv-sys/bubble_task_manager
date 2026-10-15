import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_TELEGRAM_AI_CHAT_SETTINGS, validateTelegramAiChatSettings } from '../src/services/telegram-ai-chat-policy.service.js';

test('Telegram assistant settings have a valid safe default, never implicitly activate', () => {
  const v = validateTelegramAiChatSettings(DEFAULT_TELEGRAM_AI_CHAT_SETTINGS);
  assert.equal(v.mode, 'OBSERVE');
  assert.equal(v.dailyCreditLimitMilli, 2000);
  assert.equal(v.monthlyCreditLimitMilli, 20000);
  const migration = readFileSync(new URL('../prisma/migrations/20261015230000_telegram_ai_chat_policies/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /"isEnabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /messageBody|encryptedSession|sessionString/);
});

test('Telegram assistant settings reject invalid credit budgets, modes, intervals and implicit flags', () => {
  const valid = DEFAULT_TELEGRAM_AI_CHAT_SETTINGS;
  for (const body of [
    { ...valid, dailyCreditLimitMilli: -1000 },
    { ...valid, dailyCreditLimitMilli: 1.5 },
    { ...valid, dailyCreditLimitMilli: 1 },
    { ...valid, monthlyCreditLimitMilli: 1000 },
    { ...valid, mode: 'SUPER_AUTO' },
    { ...valid, checkIntervalMinutes: 1 },
    { ...valid, maxMessagesPerCheck: 1000 },
    { ...valid, instructions: 'x'.repeat(3001) },
    { ...valid, suggestTasks: 'true' }
  ]) assert.throws(() => validateTelegramAiChatSettings(body));
});

test('Telegram assistant routes are signed-in and same-origin; no background send or read in PR1', () => {
  const routes = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.match(routes, /assistant\/chats', requireAuth/);
  assert.match(routes, /assistant\/chats\/:chatId', requireAuth, requireTelegramChatOrigin/);
  const service = readFileSync(new URL('../src/services/telegram-ai-chat-policy.service.ts', import.meta.url), 'utf8');
  assert.match(service, /telegramUserChatCapability\(userId\)/);
  assert.match(service, /listSendTargets\(userId\)/);
  assert.match(service, /isEnabled: false/);
  assert.doesNotMatch(service, /\.aiHistory\(|\.sendMessage\(|\.confirm\(/);
});
