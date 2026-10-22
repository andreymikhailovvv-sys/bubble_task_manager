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

test('Telegram has only an in-app button, pointed to the original checkup proposal', async () => {
  const keyboard = telegramDailyCheckupKeyboard('proposal123');
  const buttons = keyboard.inline_keyboard.flat();
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].text, '📱 Посмотреть изменения');
  assert.ok('web_app' in buttons[0] && buttons[0].web_app.url.includes('openQuickAi=1'));
  assert.ok('web_app' in buttons[0] && buttons[0].web_app.url.includes('openCheckupProposal=proposal123'));
  assert.equal(buttons.some(button => 'callback_data' in button), false);
  assert.equal(telegramDailyCheckupKeyboard(null).inline_keyboard.flat().length, 1);
  const server = await readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8');
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(server, /Откройте ИИ-чекап в приложении для выбора изменений/);
  assert.match(server, /telegramDailyCheckupKeyboard\(input.proposalId\)/);
  assert.match(mini, /openCheckupProposal/);
  assert.match(mini, /linkedCheckupProposal/);
  assert.match(server, /formatTelegramDailyCheckupPreview\(input.text\)/);
});
