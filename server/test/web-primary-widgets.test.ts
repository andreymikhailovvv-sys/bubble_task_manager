import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (relativePath: string) =>
  readFile(new URL('../../' + relativePath, import.meta.url), 'utf8');

test('primary desktop workspace mounts the independent right sidebar after its existing + pane control', async () => {
  const app = await source('client/src/App.tsx');
  assert.match(app, /<div className="primary-workspace-layout">/);
  assert.match(app, /<div className="primary-workspace-stage">/);
  assert.match(app, /<FullscreenWorkspaceSingle[\s\S]+?<PrimaryWorkspaceSidebar/);
  assert.match(app, /windowCount=\{fullscreenPanels\.length\}/);
  assert.match(app, /onCompleteTask=\{async task => \{ await toggleSubtaskDone\(task\); \}\}/);
  assert.match(app, /onHabitUpsert=\{updated => setHabits/);
  assert.match(app, /\{!isBubbleFullscreen \? <aside/);
});

test('all six reorderable widgets persist per-user order and do not drag on ordinary clicks', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  for (const key of ['upcoming', 'completed', 'habits', 'progress', 'sectors', 'notes'])
    assert.match(widget, new RegExp("\\b" + key + "\\b"));
  assert.match(widget, /Reorder\.Group[\s\S]+?axis="y"/);
  assert.match(widget, /Reorder\.Item[\s\S]+?dragListener=\{false\}/);
  assert.match(widget, /dragControls=\{controls\}/);
  assert.match(widget, /btm:primary-sidebar:order:/);
  assert.match(widget, /JSON\.stringify\(order\)/);
  assert.match(widget, /onKeyDown=\{event =>/);
});

test('two pane auto-collapse does not overwrite manual visibility and the toggle always remains', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  assert.match(widget, /useState\(windowCount > 1\)/);
  assert.match(widget, /setAutoCollapsed\(windowCount > 1\)/);
  assert.match(widget, /const isOpen = visible && !autoCollapsed/);
  assert.match(widget, /if \(autoCollapsed\) \{ setAutoCollapsed\(false\); setVisible\(true\); \}/);
  assert.match(widget, /primary-workspace-sidebar-toggle-slot/);
  assert.match(widget, /aria-expanded=\{isOpen\}/);
  assert.match(widget, /localStorage\.setItem\('btm:primary-sidebar:visible:' \+ userId, String\(visible\)\)/);
});

test('habit actions and progress metric use the real shared API and Mini App task definition', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  assert.match(widget, /api\.completeHabit\(/);
  assert.match(widget, /api\.uncompleteHabit\(/);
  assert.match(widget, /api\.createHabit\(/);
  assert.match(widget, /api\.updateHabit\(/);
  assert.match(widget, /<MiniAppHabitTracker habit=\{selectedHabit\}/);
  assert.match(widget, /<PrimaryHabitDialog/);
  assert.doesNotMatch(widget, /TestPageHabitDialog|TestPage\.css/);
  assert.match(widget, /todayTasks = tasks\.filter\(task =>/);
  assert.match(widget, /&& task\.dueDate && Number\.isFinite/);
  const editor = await source('client/src/components/PrimaryHabitDialog.tsx');
  assert.match(editor, /primary-habit-dialog dialog-surface/);
  assert.match(editor, /onSave/);
  assert.match(widget, /\(task\.taskType \?\? 'TASK'\) === 'TASK' && !task\.parentTaskId/);
  assert.match(widget, /metric\('Все задачи', doneCount, taskItems\.length/);
  assert.match(widget, /metric\('За сегодня', todayDone, todayTasks\.length/);
  const css = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /primary-widget-grip:hover/);
});

test('classic sidebar notes are embedded without a second card, and the rail animates with no visible scrollbar', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  const notes = await source('client/src/components/StandaloneNotesWorkspace.tsx');
  const css = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  assert.match(widget, /<StandaloneNotesWorkspace userId=\{userId\} requestedNote=\{requestedNote\} compactWidget\/>/);
  assert.match(notes, /standalone-notes-widget--embedded/);
  assert.match(notes, /compactWidget \? <span/);
  assert.match(widget, /<Reorder.Group[\s\S]+?<div className="primary-workspace-sidebar-toggle-slot">/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /primary-workspace-sidebar\.is-collapsed \.primary-workspace-sidebar-list/);
  assert.match(css, /body:has\(\.primary-workspace-sidebar\.is-open\) \.ai-chat-launcher\.bubble-ai-fullscreen/);
  assert.doesNotMatch(css, /primary-habit-modal-host|--tp-panel/);
});
