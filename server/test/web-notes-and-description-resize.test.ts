import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clampDescriptionHeight } from '../../client/src/components/ResizableDescriptionSurface.js';

const read = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');

test('web description height is bounded to 96–320px, with keyboard and drag controls', async () => {
  assert.equal(clampDescriptionHeight(40, 96, 320), 96);
  assert.equal(clampDescriptionHeight(128.4, 96, 320), 128);
  assert.equal(clampDescriptionHeight(220, 96, 320), 220);
  assert.equal(clampDescriptionHeight(999, 96, 320), 320);
  const component = await read('../../client/src/components/ResizableDescriptionSurface.tsx');
  assert.match(component, /role="separator"/);
  assert.match(component, /aria-valuenow=\{height\}/);
  assert.match(component, /setPointerCapture/);
  assert.match(component, /onPointerMove=\{moveResize\}/);
  assert.match(component, /onPointerCancel=\{endResize\}/);
  assert.match(component, /ArrowUp/);
  assert.match(component, /ArrowDown/);
  assert.match(component, /event\.preventDefault\(\)/);
});

test('web task focus and task/subtask editor use the same resizable viewport', async () => {
  const [app, editor, field, css, mini] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/components/TaskDescriptionInput.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/MiniApp.tsx')
  ]);
  for (const content of [app, editor]) {
    assert.match(content, /<ResizableDescriptionSurface className="focused-task-description-surface/);
    assert.match(content, /<TaskDescriptionInput/);
  }
  assert.match(field, /task-description-preview \$\{className\}/);
  assert.match(css, /\.resizable-description-surface > \.task-description-preview,/);
  assert.match(css, /\.resizable-description-surface > textarea,/);
  assert.match(css, /height: 100% !important/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /\.resizable-description-grip/);
  assert.doesNotMatch(mini, /ResizableDescriptionSurface/);
});

test('note card picker and note editor both create a new group and assign it to selected note', async () => {
  const [workspace, manager] = await Promise.all([
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/StandaloneNoteGroupManager.tsx')
  ]);
  assert.match(workspace, /const startNewGroupForNote = \(noteId: string\)/);
  assert.match(workspace, /onClick=\{\(\) => startNewGroupForNote\(groupPicker\.noteId\)\}/);
  assert.match(workspace, /Создать новую группу/);
  assert.match(workspace, /aria-label="Выбрать группу заметки"/);
  assert.match(workspace, /showGroupPicker\(editing\.id, event\.currentTarget\)/);
  assert.match(workspace, /onCreated=\{\(created\) => \{/);
  assert.match(workspace, /void assignGroup\(noteId, created\.id\)/);
  assert.match(manager, /onCreated\?: \(group: StandaloneNoteGroup\) => void/);
  assert.match(manager, /const created = await onCreate\(data\)/);
  assert.match(manager, /onCreated\?\.\(created\)/);
});

test('group creation and note reassignment serialize autosaves and preserve text edits', async () => {
  const [workspace, manager] = await Promise.all([
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/StandaloneNoteGroupManager.tsx')
  ]);
  assert.match(workspace, /if \(draftRef\.current\?\.id === noteId\) await saveChanges\(\)/);
  assert.match(workspace, /api\.updateStandaloneNote\(noteId, \{ groupId \}\)/);
  assert.match(workspace, /draftRef\.current = \{ \.\.\.draftRef\.current, groupId \}/);
  assert.match(workspace, /groupId: original\.groupId/);
  assert.match(manager, /z-\[2147483647\]/);
  assert.match(workspace, /editing \? 'z-\[2147483647\]' : 'z-\[270\]'/);
});
