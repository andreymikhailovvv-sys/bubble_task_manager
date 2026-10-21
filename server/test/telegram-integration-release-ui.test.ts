import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (relative: string) => readFileSync(new URL('../../client/src/' + relative, import.meta.url), 'utf8');
const setup = load('components/TelegramIntegrationsMenu.tsx');
const setupCss = load('components/TelegramIntegrationsMenu.css');
const share = load('components/TelegramMessageQuickShare.tsx');
const shareCss = load('components/TelegramMessageQuickShare.css');
const web = load('App.tsx');
const mini = load('MiniApp.tsx');

test('Telegram Apps tutorial uses the submitted exact five-field example and explains QR timing', () => {
  for (const value of [
    'App title', 'Planinrovych',
    'Short name', 'planirovychapp',
    'https://planirovych.ru',
    'Platform', '>Web<',
    'Description', 'Personal productivity assistant',
    'Сохранить ключи и подключить', 'в этом окне появится'
  ]) assert.ok(setup.includes(value), 'missing instruction fragment: ' + value);
  assert.match(setup, /режиме инкогнито/);
  assert.match(setupCss, /telegram-integrations-modal__app-example/);
});

test('Saved Messages leads the list without sticky scrolling', () => {
  assert.match(share, /telegram-quick-share__saved/);
  const saved = share.indexOf('telegram-quick-share__saved');
  const contacts = share.indexOf('visible.map((dialog)', saved);
  assert.ok(saved > 0 && saved < contacts, 'Saved Messages must appear before normal contacts');
  const rule = shareCss.match(/\.telegram-quick-share__saved\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(rule, /position:\s*static/);
  assert.doesNotMatch(rule, /position:\s*sticky|top:\s*0/);
});

test('web and Mini App share the neutral paper-plane and integration picker', () => {
  assert.match(web, /TelegramMessageQuickShare text=\{.*?\} compact/);
  assert.match(mini, /TelegramMessageQuickShare text=\{.*?\} compact/);
  assert.match(share, /<MessageActionArrow direction="forward"/);
  assert.match(share, /<TelegramPlaneIcon size=\{17\}/);
  assert.match(share, /data-message-forward-trigger="true"/);
  assert.match(share, /role="menu"/);
  assert.match(share, /role="menuitem"/);
  assert.match(share, /setMenuOpen\(false\); void show\(\)/);
  assert.match(shareCss, /telegram-quick-share__platform-menu/);
  assert.doesNotMatch(share, /data-telegram-share-trigger="true"/);
});

test('forward actions render below each bubble on site and Mini App, never inside it', () => {
  assert.equal((web.match(/<TelegramMessageQuickShare/g) ?? []).length, 6);
  assert.equal((mini.match(/<TelegramMessageQuickShare/g) ?? []).length, 2);
  assert.equal((web.match(/className="ai-message-forward-actions"/g) ?? []).length, 6);
  assert.equal((mini.match(/className="ai-message-forward-actions"/g) ?? []).length, 2);
  assert.match(shareCss, /\.ai-message-forward-group\s*\{/);
  assert.match(shareCss, /\.ai-message-forward-actions\s*\{/);
  assert.match(shareCss, /border:\s*0 !important/);
  assert.match(shareCss, /fill:\s*none !important/);
  assert.doesNotMatch(shareCss, /border-radius:\s*9999px !important/);
  assert.doesNotMatch(shareCss, /stroke:\s*none !important/);
});
