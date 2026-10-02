import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  AI_CHAT_MEMORY_MAX_ESTIMATED_TOKENS,
  AI_CHAT_MEMORY_TARGET_MAX_MESSAGES,
  AI_CHAT_MEMORY_TARGET_TOKEN_BUDGET,
  AI_CHAT_MEMORY_TRIGGER_MAX_MESSAGES,
  AI_CHAT_MEMORY_TRIGGER_TOKEN_BUDGET,
  estimateAiChatTokens,
  formatAiChatMemory,
  normalizeAiChatMemory
} from '../src/services/ai-chat-memory.service.js';

test('порог и target rolling memory образуют hysteresis без context gap', () => {
  assert.equal(AI_CHAT_MEMORY_TARGET_TOKEN_BUDGET, 6_000);
  assert.equal(AI_CHAT_MEMORY_TARGET_MAX_MESSAGES, 20);
  assert.equal(AI_CHAT_MEMORY_TRIGGER_TOKEN_BUDGET, 8_000);
  assert.equal(AI_CHAT_MEMORY_TRIGGER_MAX_MESSAGES, 30);
});

test('structured memory очищается и детерминированно укладывается в бюджет', () => {
  const item = 'важный контекст '.repeat(100);
  const memory = normalizeAiChatMemory(Object.fromEntries(['goals', 'decisions', 'importantContext', 'constraints', 'userPreferences', 'openThreads'].map((key) => [key, Array.from({ length: 30 }, (_, index) => `${item}${index}`)])));
  assert.ok(estimateAiChatTokens(formatAiChatMemory(memory)) <= AI_CHAT_MEMORY_MAX_ESTIMATED_TOKENS);
  assert.match(formatAiChatMemory(memory), /актуальные данные задач проверяй tools/);
});

test('project chat не дублирует current question, quick chat не включает smart context', () => {
  const source = readFileSync(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('async askAiChat('), source.indexOf('async parseRecurrence('));
  assert.match(method, /chatId === 'quick-ai-requests'/);
  assert.match(method, /history = normalizedHistory\.slice\(quick \? -20 : -24\)/);
  assert.equal((method.match(/\{ role: 'user', content: question \}/g) ?? []).length, 1);
  assert.match(method, /\.\.\.history,[\s\S]*\{ role: 'user', content: question \}/);
});
