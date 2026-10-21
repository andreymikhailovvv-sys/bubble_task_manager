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


test('focus task sector stays dirty until server confirms its update', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const panelStart = web.indexOf('{isFocusedSettingsOpen ? (');
  const selectStart = web.indexOf('ariaLabel="Выбрать сектор"', panelStart);
  const sectorStart = web.lastIndexOf('<CustomSelect', selectStart);
  const selectEnd = web.indexOf('detachedPopup', selectStart);
  assert.ok(panelStart >= 0 && sectorStart > panelStart && selectStart > sectorStart && selectEnd > selectStart, 'focused task sector select must exist');
  const selection = web.slice(sectorStart, selectEnd);
  assert.match(selection, /value=\{focusedDraft\.sphereId \?\? ''\}/);
  assert.match(selection, /const nextSphereId = value \|\| null/);
  assert.match(selection, /setFocusedDraft\(\(prev\) => \(\{ \.\.\.\(prev \?\? \{\}\), sphereId: nextSphereId \}\)\)/);
  assert.doesNotMatch(selection, /setTasks\(/, 'must not change remote task list before PATCH succeeds');

  const baseline = { sphereId: 'sphere-old', title: 'Планы' };
  const newDraft = { ...baseline, sphereId: 'sphere-new' };
  assert.deepEqual(changedDraftFields(baseline, newDraft, ['sphereId', 'title']), { sphereId: 'sphere-new' });

  const saveStart = web.indexOf('focusedAutosaveTimeoutRef.current = setTimeout(() => {');
  const saveEnd = web.indexOf('  const flushFocusedTaskSave = async', saveStart);
  const autosave = web.slice(saveStart, saveEnd);
  assert.match(autosave, /api\.updateTask\(focusedTask\.id,/);
  assert.match(autosave, /\.then\(\(savedTask\) =>/);
  assert.match(autosave, /task\.id === savedTask\.id \? \{ \.\.\.task, \.\.\.savedTask \} : task/);
  assert.ok(autosave.indexOf('focusedAutosaveSignatureRef.current = JSON.stringify') < autosave.indexOf('setTasks('), 'server reply must be acknowledged before task list changes');
});

test('failed focus task saves are visible and do not close an unsaved editor', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const flush = web.slice(web.indexOf('  const flushFocusedTaskSave = async () =>'), web.indexOf('  const closeFocusedTask = async () =>'));
  const close = web.slice(web.indexOf('  const closeFocusedTask = async () =>'), web.indexOf('  const applyFocusedRecurrence = async () =>'));
  assert.match(flush, /setFocusedSaveError\(error instanceof Error/);
  assert.match(flush, /return false;/);
  assert.match(close, /if \(!\(await flushFocusedTaskSave\(\)\)\) return;/);
  assert.match(web, /role="alert"[^\n]*Не удалось сохранить изменения:/);
});


test('focused task autosave cannot change status implicitly', async () => {
  const web = await readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');
  const keys = web.slice(web.indexOf('const FOCUSED_TASK_EDIT_KEYS = ['), web.indexOf('] as const satisfies readonly (keyof Task)[];'));
  const snapshot = web.slice(web.indexOf('const focusedTaskEditableSnapshot ='), web.indexOf('const AI_CHAT_MODEL_OPTIONS'));
  assert.doesNotMatch(keys, /['"]status['"]/, 'status must not be part of autosave dirty field keys');
  assert.doesNotMatch(snapshot, /status:\\s*task\\.status/, 'status must not be part of autosave snapshots');
  assert.match(web, /api\\.updateTask\\(task\\.id, \\{ status: 'DONE'/, 'explicit completion still works');
  assert.match(web, /api\\.updateTask\\(task\\.id, \\{ status: 'TODO'/, 'explicit reopening still works');
});

test('task update logs distinguish browser mutations from internal tools', async () => {
  const controller = await readFile(new URL('../src/controllers/task.controller.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');
  assert.match(controller, /source: \`api:\\$\\{surface\\}\`/);
  assert.match(service, /source: context\\.source \\?\\? 'internal'/);
  assert.match(service, /requestedStatus: input\\.status \\?\\? null/);
  assert.match(service, /updatedFields: Object\\.keys\\(input\\)/);
});
