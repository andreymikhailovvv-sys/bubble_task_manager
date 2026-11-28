import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAndroidPushData } from '../src/lib/android-push-payload.js';
import { originalAndroidEventKey, isDeadlineEvent, notificationReplyHash } from '../src/services/android-notification-actions.service.js';

test('deferred events retain original occurrence without stacking prefixes', () => {
  const key = 'habit-reminder:habit-id:2026-11-28:12:30';
  assert.equal(originalAndroidEventKey('android-snooze:event-id:' + key), key);
  assert.equal(originalAndroidEventKey(key), key);
  assert.equal(isDeadlineEvent('task-id:2026-11-28T15:00:00.000Z:upcoming', 'task-id'), true);
  assert.equal(isDeadlineEvent('monitoring:run-id', 'task-id'), false);
});
test('exact draft hash changes on edits, not whitespace normalization', () => {
  assert.equal(notificationReplyHash(' ответ '), notificationReplyHash('ответ'));
  assert.notEqual(notificationReplyHash('ответ'), notificationReplyHash('другой ответ'));
});
test('action metadata stays data-only and payload respects FCM byte budget', () => {
  const androidActions = JSON.stringify({commands:['reply_send'], preview:'Привет', replyHash:notificationReplyHash('Привет')});
  const data = buildAndroidPushData({id:'n',userId:'u',taskId:null,eventKey:'mail-ai-reply:mail',content:'😀'.repeat(1000),androidActions});
  assert.equal(data.androidActions, androidActions);
  assert.ok(Buffer.byteLength(JSON.stringify(data),'utf8')<=3500);
  assert.equal('notification' in data,false);
});
