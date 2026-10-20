import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('desktop settings is a centered modal rather than a tiny anchored popover', async () => {
  const source = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /isSettingsOpen \? createPortal\(/);
  assert.match(source, /aria-label="Настройки"/);
  assert.match(source, /Настройки Планировыча/);
  assert.match(source, /max-w-xl overflow-y-auto overscroll-contain/);
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
  assert.match(source, /max-h-\[88dvh\].*max-w-lg.*overflow-y-auto/);
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
