import assert from 'node:assert/strict';
import test from 'node:test';
import { clearWorkspaceSnapshot, readWorkspaceSnapshot, writeWorkspaceSnapshot } from './workspaceSnapshot';

function fakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values
  };
}

test('session snapshot is user scoped, then revalidated by the caller', () => {
  const storage = fakeStorage();
  const snapshot = { spheres: [], tasks: [{ id: 'task-1', title: 'Check', importance: 3, urgency: 3, priorityScore: 3 }], habits: [] };
  assert.equal(writeWorkspaceSnapshot('alice', snapshot, storage, 1000), true);
  assert.deepEqual(readWorkspaceSnapshot('alice', storage, 2000), snapshot);
  assert.equal(readWorkspaceSnapshot('bob', storage, 2000), null);
  clearWorkspaceSnapshot('alice', storage);
  assert.equal(readWorkspaceSnapshot('alice', storage, 2000), null);
});

test('expired, future and corrupted data never replace the server response', () => {
  const storage = fakeStorage();
  assert.equal(writeWorkspaceSnapshot('alice', { spheres: [], tasks: [], habits: [] }, storage, 1000), true);
  assert.equal(readWorkspaceSnapshot('alice', storage, 0), null);
  assert.equal(readWorkspaceSnapshot('alice', storage, 1000 + 24 * 60 * 60 * 1000 + 1), null);
  for (const key of storage.values.keys()) storage.setItem(key, '{bad json');
  assert.equal(readWorkspaceSnapshot('alice', storage, 1200), null);
});

test('unavailable storage is harmless', () => {
  assert.equal(writeWorkspaceSnapshot('alice', { spheres: [], tasks: [], habits: [] }, undefined, 1000), false);
  assert.equal(readWorkspaceSnapshot('alice', undefined, 1000), null);
});
