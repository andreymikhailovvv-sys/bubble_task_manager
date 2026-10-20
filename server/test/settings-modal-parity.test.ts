import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('desktop settings is a centered modal rather than a tiny anchored popover', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /isSettingsOpen \? createPortal\(/);
  assert.match(source, /aria-label="Настройки"/);
  assert.match(source, /Настройки Планировыча/);
  assert.match(source, /settings-modal-shell[^\n]+h-\[min\(88dvh,820px\)\][^\n]+max-w-xl flex-col overflow-hidden/);
  assert.match(source, /settings-modal-scroll[^\n]+overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(source, /data-tour="settings-panel" className="surface-popover light-dropdown absolute right-0/);
  assert.match(source, /Часовой пояс пользователя/);
  assert.match(source, /browser-notification-settings/);
  assert.match(source, /ai-checkup-settings/);
  assert.match(source, /ai-notifications-settings/);
  assert.match(source, /offerTaskCompletionReport/);
});

test('miniapp and mobile web settings are full dialogs without browser permission or destructive actions', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(source, /isSettingsOpen \? createPortal\(/);
  assert.match(source, /aria-modal="true" aria-label="Настройки Планировыча"/);
  assert.match(source, /settings-modal-shell[^\n]+h-\[min\(88dvh,780px\)\][^\n]+max-w-lg flex-col overflow-hidden/);
  assert.match(source, /settings-modal-scroll[^\n]+overflow-y-auto overscroll-contain/);
  assert.match(source, /onTouchMove=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /'Europe\/Moscow','Europe\/Kaliningrad'/);
  assert.match(source, /morningAiCheckupEnabled/);
  assert.match(source, /morningAiCheckupTime/);
  assert.match(source, /aiNotificationDefault/);
  assert.match(source, /aiNotificationsEnabled: aiNotificationDefault/);
  assert.match(source, /offerTaskCompletionReport/);
  const part = source.slice(source.indexOf('{isSettingsOpen ? createPortal('),
    source.indexOf(') : null}', source.indexOf('{isSettingsOpen ? createPortal(')));
  assert.doesNotMatch(part, /browserNotificationsEnabled|Удалить аккаунт/);
  assert.doesNotMatch(source, /miniapp-settings-popover absolute right-0 top-full z-40/);
});

test('settings select menus remain above dialogs, themed and tappable while scrolling', async () => {
  const [desktop, mini, select, css] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/CustomSelect.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const desktopDialog = desktop.slice(desktop.indexOf('{isSettingsOpen ? createPortal('), desktop.indexOf('document.body', desktop.indexOf('{isSettingsOpen ? createPortal(')));
  const miniDialog = mini.slice(mini.indexOf('{isSettingsOpen ? createPortal('), mini.indexOf('document.body', mini.indexOf('{isSettingsOpen ? createPortal(')));
  assert.equal((desktopDialog.match(/popupVariant="settings"/g) ?? []).length, 5);
  assert.equal((miniDialog.match(/popupVariant="settings"/g) ?? []).length, 4);
  assert.match(select, /data-miniapp-popover=\{popupVariant === 'settings' \? 'settings'/);
  assert.match(select, /onTouchMove=\{popupVariant === 'settings'/);
  assert.match(select, /const openAbove =/);
  assert.match(select, /maxHeight: menuPosition\.maxHeight/);
  assert.match(css, /\.custom-select-menu\.settings-select-menu \{[\s\S]*?z-index: 390 !important/);
  assert.match(css, /settings-select-menu\[data-theme='light'\]/);
  assert.match(css, /\.settings-modal-scroll::\-webkit-scrollbar/);
});
