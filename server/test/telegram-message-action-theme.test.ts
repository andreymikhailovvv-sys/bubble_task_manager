import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../../client/src/' + path, import.meta.url), 'utf8');
const css = read('components/TelegramMessageQuickShare.css');
const action = read('components/TelegramMessageQuickShare.tsx');
const expanded = read('components/ExpandedAiChat.tsx');
const web = read('App.tsx');
const mini = read('MiniApp.tsx');

test('one Telegram message action is shared by website and Mini App', () => {
  assert.match(action, /className="telegram-quick-share__trigger"/);
  assert.match(web, /<TelegramMessageQuickShare text=\{/);
  assert.match(mini, /<TelegramMessageQuickShare text=\{/);
  assert.match(css, /width:\s*26px\s*!important/);
  assert.match(css, /height:\s*26px\s*!important/);
  assert.match(css, /place-items:\s*center\s*!important/);
  assert.match(css, /transform:\s*translate\(-50%, -50%\)/);
  assert.match(css, /fill:\s*currentColor\s*!important/);
});

test('light Mini App global white-button override cannot win over Telegram action styles', () => {
  assert.match(css, /body\[data-theme\] \.miniapp-shell \.miniapp-ai-chat-message button\.telegram-quick-share__trigger/);
  assert.match(css, /\.miniapp-shell\.miniapp-light \.miniapp-ai-chat-message button\.telegram-quick-share__trigger/);
  assert.match(css, /background:\s*rgba\(14, 165, 233, \.12\)\s*!important/);
  assert.match(css, /color:\s*#0369a1\s*!important/);
  assert.match(css, /background-image:\s*none\s*!important/);
});

test('icons on user blue bubbles use high-contrast white glyphs in both themes', () => {
  for (const container of [
    '.ai-chat-message-user', '.quick-ai-chat-message-user',
    '.chat-message-user', '.miniapp-ai-chat-message-user'
  ]) assert.ok(css.includes(container + ' button.telegram-quick-share__trigger'));
  assert.match(css, /color:\s*#ffffff\s*!important/);
  assert.match(css, /background:\s*rgba\(7, 35, 77, \.74\)\s*!important/);
});

test('obsolete header Telegram button and entire old chat panel are gone, current flows remain', () => {
  assert.doesNotMatch(expanded, /TelegramChatAssistantPanel|telegramOpen|setTelegramOpen/);
  assert.doesNotMatch(expanded, /Telegram: прочитать переписку/);
  assert.equal(existsSync(new URL('../../client/src/components/TelegramChatAssistantPanel.tsx', import.meta.url)), false);
  assert.match(web, /<TelegramMessageQuickShare/);
  assert.match(web, /<TelegramInlineSendCard/);
  assert.match(mini, /<TelegramMessageQuickShare/);
  assert.match(mini, /<TelegramInlineSendCard/);
});
