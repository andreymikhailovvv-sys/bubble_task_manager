import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  browserNotificationPermission,
  shouldShowBrowserNotification
} from '../../client/src/lib/browser-system-notifications.js';

const incoming = { id: 'system-123', content: 'Пора выполнить важную задачу', readAt: null };

test('OS notification is emitted ONLY when enabled, unread, hidden and granted', () => {
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: true, pageHidden: true, permission: 'granted' }), true);
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: true, pageHidden: false, permission: 'granted' }), false);
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: false, pageHidden: true, permission: 'granted' }), false);
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: true, pageHidden: true, permission: 'default' }), false);
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: true, pageHidden: true, permission: 'denied' }), false);
  assert.equal(shouldShowBrowserNotification(incoming, { enabled: true, pageHidden: true, permission: 'unsupported' }), false);
  assert.equal(shouldShowBrowserNotification({ ...incoming, readAt: new Date().toISOString() }, { enabled: true, pageHidden: true, permission: 'granted' }), false);
  assert.equal(shouldShowBrowserNotification({ ...incoming, content: ' ' }, { enabled: true, pageHidden: true, permission: 'granted' }), false);
  assert.equal(shouldShowBrowserNotification({ ...incoming, id: '' }, { enabled: true, pageHidden: true, permission: 'granted' }), false);
});

test('server offers default-on per-account setting with strict boolean validation', async () => {
  const [schema, sql, api] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261020130000_browser_system_notifications/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8')
  ]);
  assert.match(schema, /browserNotificationsEnabled Boolean @default\(true\)/);
  assert.match(sql, /"browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(api, /browserNotificationsEnabled: user\.browserNotificationsEnabled \?\? true/);
  assert.match(api, /typeof req\.body\?\.browserNotificationsEnabled !== 'boolean'/);
  assert.match(api, /data\.browserNotificationsEnabled = req\.body\.browserNotificationsEnabled/);
  assert.match(api, /browserNotificationsEnabled: true,/);
});

test('browser delivery mirrors the existing system notification feed, not a separate event producer', async () => {
  const [app, client, browser, routes] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/browser-system-notifications.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8')
  ]);
  assert.match(app, /api\.getSystemNotifications\(\)/);
  assert.match(app, /if \(baselineLoaded\) deliverBrowserSystemNotifications\(newNotifications\)/);
  assert.match(app, /deliverBrowserSystemNotifications\(newNotifications\)/);
  assert.match(app, /document\.visibilityState !== 'hidden'/);
  assert.match(app, /setBrowserPermission\(browserNotificationPermission\(\)\)/);
  assert.match(app, /requestBrowserNotifications\(\)/);
  assert.match(app, /browserNotificationsEnabled: enabled/);
  assert.match(client, /browserNotificationsEnabled\?: boolean/);
  assert.match(routes, /apiRouter\.get\('\/system-notifications'/);
  assert.match(browser, /Notification\.requestPermission\(\)/);
  assert.match(browser, /navigator\.locks\?\.request/);
  assert.match(browser, /'btm:browser-system-notifications:seen:' \+ userId/);
  assert.match(browser, /new Notification\(headline/);
  assert.match(browser, /: 'Планировыч'/);
  assert.match(browser, /notification\.eventKey\?\.startsWith\('monitoring:'\)/);
  assert.doesNotMatch(browser, /new WebSocket|PushSubscription|subscribePush/);
});

test('browser notification module does not use Notification API in unsupported server environment', () => {
  assert.equal(browserNotificationPermission(), 'unsupported');
});

test('monitoring notifications are no longer hidden from the system toast and browser channel', async () => {
  const app = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/const visibleNotifications = result\.notifications;/g) ?? []).length, 2);
  assert.match(app, /const newNotifications = visibleNotifications\.filter/);
  assert.match(app, /deliverBrowserSystemNotifications\(newNotifications\)/);
  assert.match(app, /setSystemNotificationToast\(newestUnseen\)/);
  assert.match(app, /systemNotifications\.filter\(notification => !notification\.eventKey\?\.startsWith\('monitoring:'\)\)/);
});
