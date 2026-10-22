import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatTelegramDailyCheckupPreview, telegramDailyCheckupKeyboard } from '../src/services/telegram.service.js';

test('daily checkup Telegram preview is <4000 characters, valid HTML and shows continuation', () => {
  const unsafe = '<важная задача> & длинный текст 😀\n'.repeat(260);
  const preview = formatTelegramDailyCheckupPreview(unsafe);
  assert.ok(preview.length < 4000);
  assert.ok(preview.includes('&lt;важная задача&gt;'));
  assert.ok(preview.includes('&amp;'));
  assert.ok(preview.includes('Продолжение'));
  assert.ok(!preview.includes('\uFFFD'));
  assert.ok(!preview.includes('<важная задача>'));
  const short = formatTelegramDailyCheckupPreview('Короткий чекап');
  assert.equal(short, 'Короткий чекап');
});

test('Telegram approval and in-app view use exactly the stored owner-bound proposal', async () => {
  const keyboard = telegramDailyCheckupKeyboard('proposal123', true);
  const buttons = keyboard.inline_keyboard.flat();
  assert.ok(buttons.some(button => 'callback_data' in button && button.callback_data === 'ckap:proposal123'));
  assert.ok(buttons.some(button => 'callback_data' in button && button.callback_data === 'ckrj:proposal123'));
  assert.ok(buttons.some(button => 'web_app' in button && button.web_app.url.includes('openQuickAi=1')));
  const after = telegramDailyCheckupKeyboard('proposal123', false);
  assert.equal(after.inline_keyboard.flat().filter(button => 'callback_data' in button).length, 0);
  const noProposal = telegramDailyCheckupKeyboard(null, false);
  assert.equal(noProposal.inline_keyboard.flat().length, 1);
  const server = await readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8');
  assert.match(server, /source: 'daily_checkup', autoApplied: false/);
  assert.match(server, /telegramChatId: chatId/);
  assert.match(server, /await applyTaskProposal\(userId, taskId\)/);
  assert.match(server, /await rejectTaskProposal\(userId, taskId\)/);
  assert.match(server, /editMessageReplyMarkup/);
  assert.match(server, /formatTelegramDailyCheckupPreview\(input.text\)/);
});
