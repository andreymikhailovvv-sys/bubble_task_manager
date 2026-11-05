import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  findExistingSystemNotificationKeys,
  createSystemNotificationUnlessExists,
  taskNotificationTiming,
  taskSystemNotificationEventKey
} from '../src/lib/task-notification-persistence.js';

type Event = { eventKey: string; userId: string; taskId?: string | null; content: string };

function fakeDb(initial: string[] = []) {
  const saved = new Set(initial);
  const queryKeys: string[][] = [];
  const createCalls: Event[] = [];
  let shouldRace = false;
  let unexpectedError: Error | undefined;
  const db = {
    systemNotification: {
      findMany: async (args: { where: { eventKey: { in: string[] } } }) => {
        const keys = args.where.eventKey.in;
        queryKeys.push(keys);
        return keys.filter(key => saved.has(key)).map(eventKey => ({ eventKey }));
      },
      create: async (args: { data: Event }) => {
        createCalls.push(args.data);
        if (unexpectedError) throw unexpectedError;
        if (shouldRace) throw Object.assign(new Error('duplicate key'), { code: 'P2002' });
        if (saved.has(args.data.eventKey)) throw Object.assign(new Error('duplicate key'), { code: 'P2002' });
        saved.add(args.data.eventKey);
        return { id: args.data.eventKey };
      }
    }
  } as unknown as Pick<PrismaClient, 'systemNotification'>;
  return {
    db, saved, queryKeys, createCalls,
    race: (enabled: boolean) => { shouldRace = enabled; },
    fail: (error?: Error) => { unexpectedError = error; }
  };
}

test('already persisted overdue alerts are read once and not inserted again', async () => {
  const key = taskSystemNotificationEventKey('task', '2026-11-05T08:00:00.000Z', 'owner', false, 'overdue');
  const store = fakeDb([key]);
  const existing = await findExistingSystemNotificationKeys(store.db, [key, key]);
  await createSystemNotificationUnlessExists(store.db, existing,
    { userId: 'owner', taskId: 'task', eventKey: key, content: 'Overdue' });
  assert.equal(store.queryKeys.length, 1);
  assert.deepEqual(store.queryKeys[0], [key]);
  assert.equal(store.createCalls.length, 0);
});

test('new alerts are created just once, keeping the original eventKey', async () => {
  const store = fakeDb();
  const key = taskSystemNotificationEventKey('task', '2026-11-05T08:00:00.000Z', 'owner', false, 'upcoming');
  const found = await findExistingSystemNotificationKeys(store.db, [key]);
  const event = { userId: 'owner', taskId: 'task', eventKey: key, content: 'Upcoming' };
  await createSystemNotificationUnlessExists(store.db, found, event);
  await createSystemNotificationUnlessExists(store.db, found, event);
  assert.equal(store.createCalls.length, 1);
  assert.equal(store.saved.has(key), true);
});

test('concurrent replica duplicate P2002 remains nonfatal, other failures propagate', async () => {
  const store = fakeDb();
  const found = await findExistingSystemNotificationKeys(store.db, ['once']);
  store.race(true);
  await createSystemNotificationUnlessExists(store.db, found,
    { userId: 'one', eventKey: 'once', content: 'Message' });
  await createSystemNotificationUnlessExists(store.db, found,
    { userId: 'one', eventKey: 'once', content: 'Message' });
  assert.equal(store.createCalls.length, 1);
  store.race(false);
  const failure = new Error('Database unavailable');
  store.fail(failure);
  await assert.rejects(() => createSystemNotificationUnlessExists(store.db, found,
    { userId: 'one', eventKey: 'other', content: 'Message' }), failure);
  assert.equal(found.has('other'), false);
});

test('key checks are bounded, while shared alerts preserve recipient isolation', async () => {
  const keys = Array.from({ length: 950 }, (_, i) => 'task:' + i);
  const store = fakeDb(keys.slice(0, 200));
  const found = await findExistingSystemNotificationKeys(store.db, keys);
  assert.deepEqual(store.queryKeys.map(batch => batch.length), [400, 400, 150]);
  assert.equal(found.size, 200);
  const a = taskSystemNotificationEventKey('task', '2026-11-05', 'user-a', true, 'overdue');
  const b = taskSystemNotificationEventKey('task', '2026-11-05', 'user-b', true, 'overdue');
  assert.notEqual(a, b);
  assert.equal(taskSystemNotificationEventKey('task', '2026-11-05', 'user-a', false, 'overdue'),
    'task:2026-11-05:overdue');
  assert.notEqual(a, taskSystemNotificationEventKey('task', '2026-11-06', 'user-a', true, 'overdue'));
});

test('original deadline timing and upcoming/overdue notifications remain intact', () => {
  const now = Date.parse('2026-11-05T08:00:00.000Z');
  const minute = 60_000;
  const max = 60;
  assert.deepEqual(taskNotificationTiming(now - minute, now, 0, max),
    { diffMs: -minute, isShining: true, notificationKind: 'overdue' });
  assert.deepEqual(taskNotificationTiming(now - minute, now, 15, max),
    { diffMs: -minute, isShining: false, notificationKind: 'overdue' });
  assert.deepEqual(taskNotificationTiming(now, now, 0, max),
    { diffMs: 0, isShining: true, notificationKind: 'overdue' });
  assert.deepEqual(taskNotificationTiming(now, now, 15, max),
    { diffMs: 0, isShining: false, notificationKind: 'overdue' });
  assert.deepEqual(taskNotificationTiming(now + 5 * minute, now, 15, max),
    { diffMs: 5 * minute, isShining: true, notificationKind: 'upcoming' });
  assert.deepEqual(taskNotificationTiming(now + 65 * minute, now, 120, max),
    { diffMs: 65 * minute, isShining: false, notificationKind: null });
  assert.deepEqual(taskNotificationTiming(now + 5 * minute, now, 0, max),
    { diffMs: 5 * minute, isShining: false, notificationKind: null });
});
