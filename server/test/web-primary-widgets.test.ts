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


test('sidebar cards align with toolbar right inset while edge toggle stays independent of rail width', async () => {
  const sidebar = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  const topbar = await source('client/src/styles.css');
  assert.ok(topbar.includes('width: calc(100% - 24px)'));
  assert.ok(sidebar.includes('--primary-sidebar-edge-inset: 12px'));
  assert.ok(sidebar.includes('padding-right: var(--primary-sidebar-edge-inset)'));
  assert.ok(sidebar.includes('position: absolute;') && sidebar.includes('.primary-workspace-sidebar-toggle-slot'));
  assert.ok(sidebar.includes('right: 0;'));
  assert.ok(sidebar.includes('padding: 12px 0 24px 10px'));
});

test('Planik is offset from open widgets but returns to screen corner for centered modal windows', async () => {
  const css = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  const app = await source('client/src/App.tsx');
  assert.ok(app.includes("fullscreen-overlay-active"));
  assert.ok(css.includes("right: calc(384px + 12px + 56px) !important"));
  assert.ok(css.includes('.bubble-fullscreen-shell.fullscreen-overlay-active .primary-workspace-sidebar.is-open'));
  assert.ok(css.includes('.primary-habit-backdrop'));
  assert.ok(css.includes('.standalone-notes-backdrop'));
  assert.ok(css.includes('right: max(16px, env(safe-area-inset-right)) !important'));
});

test('habit ring strip follows the Mini App: completion badge, daily rings, offday divider and plus', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  const css = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  assert.ok(widget.includes('primary-habit-summary-badge'));
  assert.ok(widget.includes('Выполнено {completedHabitCount} из {todayHabits.length}'));
  assert.ok(widget.includes('primary-widget-habit-strip'));
  assert.ok(widget.includes('primary-widget-habit-circle'));
  assert.ok(widget.includes('primary-widget-habit-divider'));
  assert.ok(widget.includes('primary-widget-habit-day-badge'));
  assert.ok(widget.includes('primary-widget-habit-add-circle'));
  assert.ok(widget.includes("setSelectedHabitId(habit.id)"));
  assert.ok(!widget.includes('primary-widget-habit-summary'));
  assert.ok(css.includes('conic-gradient(var(--habit-color) var(--habit-progress)'));
});

test('habit detail mirrors Mini App completion controls, calendar and embedded settings', async () => {
  const widget = await source('client/src/components/PrimaryWorkspaceSidebar.tsx');
  const editor = await source('client/src/components/PrimaryHabitDialog.tsx');
  const css = await source('client/src/components/PrimaryHabitDialog.css');
  assert.ok(widget.includes('primary-habit-detail-overview'));
  assert.ok(widget.includes('primary-habit-detail-completion'));
  assert.ok(widget.includes('primary-habit-detail-complete'));
  assert.ok(widget.includes('<MiniAppHabitTracker habit={selectedHabit}'));
  assert.ok(widget.includes('aria-expanded={editingHabitId === selectedHabit.id}'));
  assert.ok(widget.includes('<PrimaryHabitDialog key={editingHabitId} embedded habit={editingHabit}'));
  assert.ok(editor.includes('embedded?: boolean'));
  assert.ok(editor.includes('if (embedded) return panel'));
  assert.ok(editor.includes('primary-habit-settings-card'));
  assert.ok(editor.includes('primary-habit-duration-options'));
  assert.ok(editor.includes('primary-habit-full-stepper'));
  assert.ok(editor.includes('primary-habit-icon-grid'));
  assert.ok(css.includes('.primary-habit-dialog.primary-habit-dialog--embedded'));
  assert.ok(css.includes('.primary-habit-detail-content .miniapp-habit-tracker-calendar'));
  assert.ok(css.includes("body[data-theme='dark'] .primary-habit-dialog.dialog-surface"));
});

test('card scale keeps 18px spacing, glass matches header, and collapse handle uses viewport edge', async () => {
  const css = await source('client/src/components/PrimaryWorkspaceSidebar.css');
  assert.ok(css.includes('--primary-sidebar-width: 374px'));
  assert.ok(css.includes('gap: 18px'));
  assert.ok(css.includes('background: var(--topbar-bg) !important'));
  assert.ok(css.includes('rgba(240,249,255,.70)'));
  assert.ok(css.includes('position: fixed !important'));
  assert.ok(css.includes('right: 0 !important'));
  assert.ok(css.includes('top: 50dvh !important'));
  assert.ok(css.includes('--primary-sidebar-width: 357px'));
});
