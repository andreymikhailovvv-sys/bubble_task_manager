import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const load=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('workspace panels can replace the left or right slot and bind a task ID',async()=>{
  const [types,app,controls]=await Promise.all([
    load('../../client/src/lib/fullscreenWorkspacePanels.ts'),
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx')]);
  for(const kind of ['general-ai','task-ai','notes','upcoming-tasks'])assert.ok(types.includes("kind: '"+kind+"'"),kind);
  assert.match(types,/Окно задачи/);
  assert.match(types,/taskId: string \| null/);
  assert.match(types,/function replaceFullscreenPanel\(/);
  assert.match(types,/panels\.push\(next\)/);
  assert.match(app,/const chooseFullscreenPanel = \(index: 0 \| 1, next: FullscreenWorkspacePanel\)/);
  assert.match(app,/setFullscreenPanelSlots\(nextSlots\)/);
  assert.match(controls,/onChoose\(0, next\)/);
  assert.match(controls,/onChoose\(1, next\)/);
});

test('solo rail and both split side pluses open a searchable task picker',async()=>{
  const [app,controls]=await Promise.all([
    load('../../client/src/App.tsx'),load('../../client/src/components/FullscreenWorkspaceLayout.tsx')]);
  assert.match(controls,/export function FullscreenWorkspaceSingle/);
  assert.match(controls,/fullscreen-workspace-single-rail/);
  assert.match(controls,/<FullscreenAddWindowMenu side="left"/);
  assert.match(controls,/<FullscreenAddWindowMenu side="right"/);
  assert.match(controls,/createPortal\(/);
  assert.match(controls,/placeholder="Поиск по задачам"/);
  assert.match(controls,/choose\(\{ kind: 'task-ai', taskId: task\.id \}\)/);
  assert.match(app,/<FullscreenWorkspaceSingle panel=\{fullscreenPanels\[0\]\}/);
  const start=app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  assert.doesNotMatch(app.slice(start,app.indexOf('</header>',start)),/FullscreenAddWindowMenu/);
});

test('real chat, task Focus, notes and upcoming tasks mount into selected workbench pane',async()=>{
  const [app,chat,focus,notes,editor,upcoming,css]=await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/ExpandedAiChat.tsx'),
    load('../../client/src/components/FocusedTaskWindowFrame.tsx'),
    load('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    load('../../client/src/components/NotesEditor.tsx'),
    load('../../client/src/components/FullscreenUpcomingTasksPanel.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.match(app,/ref=\{setFullscreenChatTarget\}/);
  assert.match(chat,/inlineTarget \? createPortal\(chatSurface, inlineTarget\)/);
  assert.match(app,/ref=\{setFullscreenFocusTarget\}/);
  assert.match(focus,/embedded && inlineTarget \? createPortal\(surface, inlineTarget\)/);
  assert.match(css,/\.fullscreen-task-embedded \.focused-task-modal-layout \{[^}]*flex-direction: column/);
  assert.match(app,/mode="inline" requestedNote=\{requestedStandaloneNote\}/);
  assert.match(notes,/mode === 'inline' \? inlineMount! : document\.body/);
  assert.match(editor,/inlineTarget \?\? document\.body/);
  assert.match(css,/\.notes-editor-backdrop\.notes-editor-inline/);
  assert.match(upcoming,/onComplete\(task\)/);
});