import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { changedDraftFields, mergeRemoteDraftFields } from '../../client/src/lib/taskDraftSync.js';

test('closing unchanged stale task drafts must not overwrite server AI changes', () => {
  const original = { title: 'Старая задача', dueDate: null, description: 'Черновик' };
  assert.deepEqual(changedDraftFields(original, { ...original }, ['title', 'dueDate', 'description']), {});
  assert.deepEqual(
    changedDraftFields(original, { ...original, description: 'Ручная правка' }, ['title', 'dueDate', 'description']),
    { description: 'Ручная правка' }
  );
});

test('AI updates populate clean fields while preserving simultaneous manual edits', () => {
  const original = { title: 'Старое', dueDate: null as string | null, description: 'Черновик' };
  const draft = { ...original, description: 'Изменено вручную' };
  const remote = { title: 'Новое имя от ИИ', dueDate: '2026-10-15T18:00:00.000Z', description: 'Черновик' };
  const merged = mergeRemoteDraftFields(original, draft, remote, ['title', 'dueDate', 'description']);
  assert.deepEqual(merged, { ...remote, description: 'Изменено вручную' });
  assert.deepEqual(changedDraftFields(remote, merged, ['title', 'dueDate', 'description']), { description: 'Изменено вручную' });
});

test('web X and autosave submit only dirty fields, with no unchanged full snapshot', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const start = web.indexOf('  const flushFocusedTaskSave = async () =>');
  const end = web.indexOf('  const closeFocusedTask = async () =>', start);
  const flush = web.slice(start, end);
  assert.match(flush, /changedDraftFields\(baseline, snapshot, FOCUSED_TASK_EDIT_KEYS\)/);
  assert.match(flush, /if \(Object\.keys\(patch\)\.length === 0\) return true/);
  assert.doesNotMatch(flush, /api\.updateTask\(focusedTask\.id, \{ \.\.\.normalized/);
  assert.match(web, /mergeRemoteDraftFields\(baseline, local, remote, FOCUSED_TASK_EDIT_KEYS\)/);
});

test('Mini App X saves only manual field edits, not old task snapshots', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const start = mini.indexOf('  const saveTask = async (taskId: string) =>');
  const end = mini.indexOf('  const saveAndCloseTaskEditor = async', start);
  const save = mini.slice(start, end);
  assert.match(save, /changedDraftFields\(baseline, draft, Object\.keys\(draft\)/);
  assert.match(save, /if \(Object\.keys\(changed\)\.length === 0\) return true/);
  assert.match(save, /changed\.title !== undefined/);
  assert.match(save, /changed\.dueDate !== undefined/);
  assert.match(mini, /mergeRemoteDraftFields\(baseline, local, fresh,/);
  assert.match(mini, /saveAndCloseTaskEditor\(openedTask\.id, 'task'\)/);
});
