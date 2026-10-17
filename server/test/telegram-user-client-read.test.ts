import assert from 'node:assert/strict';
import test from 'node:test';
import { Api } from 'teleproto';
import {
  isTelegramUserReadEnabled,
  requireTelegramReadOwner,
  validateTelegramDialogId,
  isReadablePersonalDialog,
  safeTelegramMessage,
  withTelegramReadSlot
} from '../src/services/telegram-user-client-read.service.js';

const current = { TELEGRAM_USER_CLIENT_ENABLED: 'true', TELEGRAM_USER_READ_ENABLED: 'true' };

test('private chat read is separately off by default and respects the main MTProto kill switch', () => {
  assert.equal(isTelegramUserReadEnabled({}), false);
  assert.equal(isTelegramUserReadEnabled({ TELEGRAM_USER_READ_ENABLED: 'true' }), false);
  assert.equal(isTelegramUserReadEnabled({ TELEGRAM_USER_CLIENT_ENABLED: 'true' }), false);
  assert.equal(isTelegramUserReadEnabled({ ...current, TELEGRAM_USER_READ_ENABLED: 'TRUE' }), false);
  assert.equal(isTelegramUserReadEnabled(current), true);
});

test('admin password alone cannot authorize reading another user’s Telegram', () => {
  assert.doesNotThrow(() => requireTelegramReadOwner('user1', 'user1'));
  assert.throws(() => requireTelegramReadOwner(undefined, 'user1'), /только владелец/);
  assert.throws(() => requireTelegramReadOwner('adminUser', 'otherUser'), /только владелец/);
});

test('only strict positive numeric IDs chosen from the dialog list are permitted', () => {
  assert.equal(validateTelegramDialogId('123456789'), '123456789');
  for (const bad of ['0', '-1', '01', '1e2', '@username', '-10012', '1/2', 1234, {}, null, '3'.repeat(25)]) {
    assert.throws(() => validateTelegramDialogId(bad));
  }
});

const mockUser = (id: string, extra: Record<string, unknown> = {}): Api.User =>
  Object.assign(Object.create(Api.User.prototype), { id, firstName: 'Собеседник', bot: false, deleted: false, ...extra }) as Api.User;

const mockDialog = (id: string, overrides: Record<string, unknown> = {}) => ({
  isUser: true, isGroup: false, isChannel: false, isCommunity: false,
  entity: mockUser(id), ...overrides
});

test('filters groups, channels, bots, deleted accounts and self from private chat browsing', () => {
  assert.equal(isReadablePersonalDialog(mockDialog('123'), '999'), true);
  assert.equal(isReadablePersonalDialog(mockDialog('999'), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { isGroup: true }), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { isChannel: true }), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { isCommunity: true }), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { entity: mockUser('123', { bot: true }) }), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { entity: mockUser('123', { deleted: true }) }), '999'), false);
  assert.equal(isReadablePersonalDialog(mockDialog('123', { entity: null }), '999'), false);
});

test('history serializer sends only bounded text and safe metadata, not message objects or attachments', () => {
  const message = Object.assign(Object.create(Api.Message.prototype), {
    id: 15, date: 1792054800, out: false, message: 'Привет', media: { secret: 'never return raw media' }, entities: [{ secret: 'never return entity' }]
  }) as Api.Message;
  assert.deepEqual(safeTelegramMessage(message, 'Александр'), {
    id: 15, date: 1792054800, out: false, senderName: 'Александр',
    text: 'Привет', truncated: false, hasMedia: true
  });
  const longMessage = Object.assign(Object.create(Api.Message.prototype), {
    id: 16, date: 0, out: true, message: 'a'.repeat(5000), media: undefined
  }) as Api.Message;
  const serialized = safeTelegramMessage(longMessage, 'Someone');
  assert.equal(serialized.senderName, 'Вы');
  assert.equal(serialized.text.length, 4096);
  assert.equal(serialized.truncated, true);
  assert.equal(JSON.stringify(serialized).includes('secret'), false);
});

test('interactive Telegram reads queue behind active monitoring; another poll is skipped', async () => {
  const userId = 'test-read-slot-owner';
  const events: string[] = [];
  let finishMonitor!: () => void;
  const monitorGate = new Promise<void>(resolve => { finishMonitor = resolve; });
  const monitor = withTelegramReadSlot(userId, 'monitor', async () => {
    events.push('monitor-start');
    await monitorGate;
    events.push('monitor-finish');
  });
  const interactive = withTelegramReadSlot(userId, 'list', async () => {
    events.push('list');
    return 'loaded';
  });
  const nextInteractive = withTelegramReadSlot(userId, 'history', async () => {
    events.push('history');
    return 'loaded';
  });
  await assert.rejects(
    withTelegramReadSlot(userId, 'monitor', async () => 'should not execute'),
    (error: unknown) => error instanceof Error && error.message.includes('Предыдущий запрос Telegram')
  );
  assert.deepEqual(events, ['monitor-start']);
  finishMonitor();
  assert.equal(await interactive, 'loaded');
  assert.equal(await nextInteractive, 'loaded');
  await monitor;
  assert.deepEqual(events, ['monitor-start', 'monitor-finish', 'list', 'history']);
});

test('Telegram read slots do not serialize independent accounts', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const blocked = withTelegramReadSlot('read-slot-account-1', 'monitor', async () => {
    await pending;
  });
  assert.equal(await withTelegramReadSlot('read-slot-account-2', 'list', async () => 42), 42);
  finish();
  await blocked;
});
