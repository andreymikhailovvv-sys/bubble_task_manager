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
  assert.match(css,/\.fullscreen-task-embedded \.focused-task-modal-layout \{[^}]*display: grid !important;[^}]*grid-template-columns: minmax\(0, calc\(var\(--focus-inner-ratio, 58%\) - 5px\)\) 10px minmax\(0, 1fr\)/);
  assert.match(css,/\.fullscreen-task-embedded \.focused-task-editor-shell \{[^}]*grid-column: 1/);
  assert.match(css,/\.fullscreen-task-embedded \.focused-task-ai-panel \{[^}]*grid-column: 3/);
  assert.match(focus,/className="fullscreen-focus-inner-divider" role="separator" tabIndex=\{0\}/);
  assert.match(focus,/aria-orientation="vertical"/);
  assert.match(focus,/rootRef\.current\?\.style\.setProperty\('--focus-inner-ratio'/);
  assert.match(focus,/event\.key === 'ArrowLeft'/);
  assert.match(focus,/event\.key === 'ArrowRight'/);
  assert.match(focus,/event\.key === 'Home'/);
  assert.match(focus,/event\.key === 'End'/);
  assert.match(focus,/onDoubleClick=\{\(\) => setRatio\(58\)\}/);
  assert.match(app,/mode="inline" requestedNote=\{requestedStandaloneNote\}/);
  assert.match(notes,/mode === 'inline' \? inlineMount! : document\.body/);
  assert.match(editor,/inlineTarget \?\? document\.body/);
  assert.match(css,/\.notes-editor-backdrop\.notes-editor-inline/);
  assert.match(upcoming,/onComplete\(task\)/);
});
test('closing enlarged task AI leaves the embedded Focus task selected',async()=>{
  const app=await load('../../client/src/App.tsx');
  assert.match(app,/onClick=\{\(\) => \{\s*setIsAiExpanded\(false\);\s*\/\/ Closing the enlarged AI conversation must not clear the[\s\S]*?if \(!embeddedFocusActive\) void closeFocusedTask\(\);\s*\}\}/);
  assert.match(app,/title=\{embeddedFocusActive \? 'Закрыть диалог' : 'Закрыть'\}/);
  const frame=await load('../../client/src/components/FocusedTaskWindowFrame.tsx');
  assert.match(frame,/if \(embedded && !inlineTarget\) return null/);
  assert.match(frame,/embedded && inlineTarget \? createPortal\(surface, inlineTarget\) : surface/);
});


test('solo has symmetric add rails, and closing one of two panes keeps only the other', async () => {
  const [app, controls, css, upcoming] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css'),
    load('../../client/src/components/FullscreenUpcomingTasksPanel.tsx')
  ]);
  assert.ok(controls.includes('fullscreen-workspace-single-rail--left'));
  assert.ok(controls.includes('fullscreen-workspace-single-rail--right'));
  assert.ok(controls.includes("onChoose('left', next)"));
  assert.ok(controls.includes("onChoose('right', next)"));
  assert.ok(app.includes("side === 'left' ? [next, fullscreenPanels[0]] : [fullscreenPanels[0], next]"));
  assert.ok(app.includes("const remaining = fullscreenPanels.filter((_, position) => position !== index)"));
  assert.ok(app.includes("remaining.length"));
  assert.ok(app.includes("closeFullscreenPanel(index as 0 | 1)"));
  assert.ok(upcoming.includes('onClose?: () => void'));
  assert.ok(css.includes('.fullscreen-workspace-single-rail .fullscreen-add-window-trigger'));
  assert.ok(css.includes('width: 34px'));
});

test('modal overlay hides the entire outer divider; circular pluses keep independent hitboxes',async()=>{
  const [app, layout, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.ok(css.includes('.bubble-fullscreen-shell.fullscreen-overlay-active .fullscreen-workspace-divider,'));
  assert.ok(css.includes('.bubble-fullscreen-shell.fullscreen-overlay-active .fullscreen-focus-inner-divider'));
  assert.ok(css.includes('visibility: hidden !important;'));
  assert.ok(css.includes('.fullscreen-workspace-divider > .fullscreen-add-window:first-child { left: -27px; }'));
  assert.ok(css.includes('border-radius: 50% !important;'));
  assert.ok(layout.includes("closest('.fullscreen-add-window')"));
  assert.ok(app.includes("focusedPane.taskId === focusedTask.id"));
});

test('single timeline stays visible, embedded chat stays pinned and subtask editor remains local',async()=>{
  const [app, chat, editor, frame, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/components/ExpandedAiChat.tsx'),
    load('../../client/src/components/TaskEditor.tsx'), load('../../client/src/components/TaskEditorFrame.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.ok(app.includes("!isBubbleFullscreen ? 'timeline-toolbar-hidden' : 'timeline-toolbar-visible'"));
  assert.ok(app.includes("editorState.task?.parentTaskId === focusedTask?.id ? fullscreenFocusTarget : null"));
  assert.ok(editor.includes('inlineTarget={inlineTarget}'));
  assert.ok(frame.includes('inlineTarget ? createPortal(surface, inlineTarget) : surface'));
  assert.ok(css.includes('.fullscreen-embedded-focus > .task-editor-inline-backdrop'));
  assert.ok(chat.includes('if (inlineTarget) return;'));
  assert.ok(chat.includes("headerHidden && !inlineTarget"));
  assert.ok(css.includes('.ai-chat-expanded-embedded .ai-chat-expanded-header'));
});

test('all training tours use visible UI and restore the original pane layout',async()=>{
  const [app, tours] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/components/TourOverlay.tsx')
  ]);
  assert.ok(tours.includes('export const PRIMARY_WORKSPACE_TOUR_STEPS'));
  assert.ok(tours.includes("selector: '.fullscreen-mode-picker'"));
  assert.ok(tours.includes("selector: '.fullscreen-workspace-single-rail--right .fullscreen-add-window-trigger'"));
  assert.ok(tours.includes("selector: '.standalone-notes-inline-mount'"));
  assert.ok(app.includes("tourWorkspaceUsesPrimary ? PRIMARY_WORKSPACE_TOUR_STEPS : WORKSPACE_TOUR_STEPS"));
  assert.ok(app.includes('setIsBubbleFullscreen(false);'));
  assert.ok(app.includes('setIsBubbleFullscreen(restore.isBubbleFullscreen);'));
  assert.ok(app.includes('setFullscreenPanelSlots(restore.fullscreenPanelSlots);'));
  assert.ok(app.includes('setFullscreenSplitRatio(restore.fullscreenSplitRatio);'));
});
