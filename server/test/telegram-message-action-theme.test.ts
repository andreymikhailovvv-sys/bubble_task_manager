import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../../client/src/' + path, import.meta.url), 'utf8');
const css = read('components/TelegramMessageQuickShare.css');
const action = read('components/TelegramMessageQuickShare.tsx');
const expanded = read('components/ExpandedAiChat.tsx');
const web = read('App.tsx');
const mini = read('MiniApp.tsx');

test('one neutral forwarding action is shared by website and Mini App', () => {
  assert.match(action, /className="telegram-quick-share__trigger"/);
  assert.match(action, /<Send size=\{18\}/);
  assert.doesNotMatch(action, /<Forward size=/);
  assert.match(web, /<TelegramMessageQuickShare text=\{/);
  assert.match(mini, /<TelegramMessageQuickShare text=\{/);
  assert.match(css, /width:\s*28px\s*!important/);
  assert.match(css, /height:\s*25px\s*!important/);
  assert.match(css, /place-items:\s*center\s*!important/);
  assert.match(css, /transform:\s*none\s*!important/);
  assert.match(css, /fill:\s*none\s*!important/);
  assert.match(css, /stroke:\s*currentColor\s*!important/);
});

test('light Mini App button overrides cannot add a white box around the paper-plane icon', () => {
  assert.match(css, /body\[data-theme\] \.miniapp-shell \.ai-message-forward-actions button\.telegram-quick-share__trigger/);
  assert.match(css, /\.miniapp-shell\.miniapp-light \.ai-message-forward-actions button\.telegram-quick-share__trigger/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(css, /border:\s*0\s*!important/);
  assert.match(css, /color:\s*#737c8b\s*!important/);
  assert.match(css, /background-image:\s*none\s*!important/);
});

test('paper-plane share icon is below the message in a separate action row', () => {
  assert.match(css, /\.ai-message-forward-group\s*\{/);
  assert.match(css, /\.ai-message-forward-actions\s*\{/);
  assert.equal((web.match(/className="ai-message-forward-actions"/g) ?? []).length, 6);
  assert.equal((mini.match(/className="ai-message-forward-actions"/g) ?? []).length, 2);
  assert.doesNotMatch(css, /background:\s*rgba\(7, 35, 77, \.74\)\s*!important/);
  assert.doesNotMatch(css, /border-radius:\s*9999px\s*!important/);
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
