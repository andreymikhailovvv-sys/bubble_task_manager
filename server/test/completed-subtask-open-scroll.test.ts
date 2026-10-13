import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readClient = (path: string) =>
  readFile(new URL('../../client/src/' + path, import.meta.url), 'utf8');

test('Mini App opens completed subtasks rather than silently ignoring the tap', async () => {
  const source = await readClient('MiniApp.tsx');
  assert.match(source, /const openedSubtask = openedSubtaskId\s*\? tasks\.find\(\(task\) => task\.id === openedSubtaskId\)/);
  assert.doesNotMatch(source, /task\.id === openedSubtaskId && task\.status !== 'DONE'/);
  assert.match(source, /onClick=\{\(\) => openSubtaskModal\(subtask\)\}/);
  assert.match(source, /openedSubtask\.status === 'DONE' \? 'Вернуть' : 'Выполнить'/);
  assert.match(source, /restoreOpenedSubtask\(openedSubtask\)/);
});

test('Mini App Return changes DONE to TODO without deleting the subtask', async () => {
  const source = await readClient('MiniApp.tsx');
  const fn = source.slice(source.indexOf('const restoreOpenedSubtask = async'), source.indexOf('const deleteTask = async'));
  assert.match(fn, /subtask\.status !== 'DONE'/);
  assert.match(fn, /api\.updateTask\(subtask\.id, \{ status: 'TODO' \}\)/);
  assert.match(fn, /setTasks\(\(current\) => current\.map/);
  assert.match(fn, /setError\(cause instanceof Error/);
  assert.doesNotMatch(fn, /api\.deleteTask|setOpenedSubtaskId\(null\)/);
});

test('restoring a subtask preserves the parent scroll viewport in Mini App', async () => {
  const source = await readClient('MiniApp.tsx');
  assert.match(source, /ref=\{openedTaskContentsScrollRef\} className="min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /nextStatus === 'TODO' && openedTaskContentsScrollRef\.current/);
  assert.match(source, /pendingOpenedTaskScrollTopRef\.current = openedTaskContentsScrollRef\.current\.scrollTop/);
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*const top = pendingOpenedTaskScrollTopRef\.current;/);
  assert.match(source, /container\.scrollTop = Math\.min\(top,/);
});

test('web restores finished subtasks, shows Return and keeps scrolled lists in place', async () => {
  const [app, editor] = await Promise.all([readClient('App.tsx'), readClient('components/TaskEditor.tsx')]);
  assert.match(app, /onComplete=\{editorState\.task\?\.id \? async \(\) => \{/);
  assert.match(app, /if \(selected\.parentTaskId\) \{\s*await toggleSubtaskDone\(selected\)/);
  assert.match(editor, /task\?\.status === 'DONE' \? 'Вернуть' : 'Выполнить'/);
  assert.match(app, /ref=\{focusedSubtaskListScrollRef\}/);
  assert.match(app, /ref=\{focusModeSubtaskListScrollRef\}/);
  assert.match(app, /pendingSubtaskScrollRef\.current = \{/);
  assert.match(app, /focusedSubtaskListScrollRef\.current\?\.scrollTop/);
  assert.match(app, /focusModeSubtaskListScrollRef\.current\?\.scrollTop/);
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*const pending = pendingSubtaskScrollRef\.current/);
});
