import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAndroidPushData, validateAndroidPushRegistration } from '../src/lib/android-push-payload.js';

test('server-to-Android event is data-only and contains stable dedupe and account IDs', () => {
  const payload = buildAndroidPushData({
    id: 'notif-123', userId: 'user-a', taskId: 'task-1',
    eventKey: 'reminder:1:2026-10-26', content: '⏰ Встреча'
  });
  assert.equal(payload.notificationId, 'notif-123');
  assert.equal(payload.userId, 'user-a');
  assert.equal(payload.taskId, 'task-1');
  assert.equal(payload.eventKey, 'reminder:1:2026-10-26');
  assert.equal(payload.content, '⏰ Встреча');
  assert.equal('notification' in payload, false);
});

test('notification content is bounded for FCM payload size', () => {
  const payload = buildAndroidPushData({
    id: 'n', userId: 'u', taskId: null, eventKey: 'k', content: 'a'.repeat(15000)
  });
  assert.equal(payload.content.length, 1000);
  assert.equal(payload.taskId, '');
});

test('device registration requires a real installation UUID and token', () => {
  const installationId = '2b77f022-4d80-482c-bc95-2214f765f3c1';
  assert.equal(validateAndroidPushRegistration({
    installationId, token: 'abcDef01234567890123:token'
  }), true);
  assert.equal(validateAndroidPushRegistration({
    installationId, token: 'short'
  }), false);
  assert.equal(validateAndroidPushRegistration({
    installationId: '../other-user', token: 'abcDef01234567890123:token'
  }), false);
  assert.equal(validateAndroidPushRegistration({
    installationId, token: 'abcDef01234567890123:\nexploit'
  }), false);
});

test('Android push outbox is durable and old notifications are not backfilled', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20261026100000_android_push_outbox/migration.sql', import.meta.url), 'utf8');
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const android = await readFile(new URL('../../android-app/app/src/main/java/ru/planirovych/app/notifications/AndroidNotificationDelivery.kt', import.meta.url), 'utf8');
  const fcm = await readFile(new URL('../src/services/android-fcm.service.ts', import.meta.url), 'utf8');
  assert.match(schema, /model AndroidPushDevice/);
  assert.match(schema, /pushDispatchedAt/);
  assert.match(migration, /UPDATE "SystemNotification" SET "pushDispatchedAt" = CURRENT_TIMESTAMP/);
  assert.match(android, /deliverPush/);
  assert.match(android, /registerAndroidPushDevice/);
  assert.match(android, /unregisterAndroidPushDevice/);
  assert.match(fcm, /data: buildAndroidPushData\(event\)/);
  assert.doesNotMatch(fcm, /notification:\s*\{/);
});
