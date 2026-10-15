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

test('web and Mini App use the same circular Telegram action component and dimensions', () => {
  assert.match(web, /TelegramMessageQuickShare text=\{.*?\} compact/);
  assert.match(mini, /TelegramMessageQuickShare text=\{.*?\} compact/);
  assert.match(share, /className="telegram-quick-share__trigger"/);
  assert.match(share, /data-telegram-share-trigger="true"/);
  assert.match(shareCss, /button\.telegram-quick-share__trigger\s*\{/);
  assert.match(shareCss, /border:\s*1px solid/);
  assert.match(shareCss, /border-radius:\s*9999px/);
  assert.match(shareCss, /width:\s*26px/);
  assert.match(shareCss, /height:\s*26px/);
  assert.match(shareCss, /body\[data-theme='dark'\] button\.telegram-quick-share__trigger/);
});
