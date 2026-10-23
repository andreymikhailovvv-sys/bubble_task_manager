import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { newestFocusSubtaskFirst, urgentFocusSubtaskFirst } from '../../client/src/lib/focusSubtaskSort.js';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Telegram Mini App and compact mobile browser render the same workspace component', async () => {
  const [entry, mini, sort] = await Promise.all([
    read('../../client/src/main.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/lib/focusSubtaskSort.ts')
  ]);
  assert.match(entry, /isMiniAppRoute\s*\?\s*<MiniApp runtime="telegram"\s*\/>/);
  assert.match(entry, /isCompactWorkspaceViewport\s*\?\s*<MiniApp runtime="web"\s*\/>/);
  assert.match(mini, /if \(openedTaskSubtaskFilterMode === 'none'\) return newestFocusSubtaskFirst\(a, b\)/);
  assert.match(mini, /if \(openedTaskSubtaskFilterMode === 'urgency'\) return urgentFocusSubtaskFirst\(a, b\)/);
  assert.match(sort, /createdAtTimestamp\(b\) - createdAtTimestamp\(a\)/);
  const old = { id: 'old', createdAt: '2026-10-01T00:00:00Z', dueDate: null };
  const fresh = { id: 'fresh', createdAt: '2026-10-19T00:00:00Z', dueDate: null };
  assert.deepEqual([old, fresh].sort(newestFocusSubtaskFirst).map(item => item.id), ['fresh', 'old']);
  assert.deepEqual([old, fresh].sort(urgentFocusSubtaskFirst).map(item => item.id), ['fresh', 'old']);
});

test('one toolbar on both list and timeline offers notes, disabled optimize and accessible filters', async () => {
  const [mini, toolbar, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((mini.match(/<MiniWorkspaceTools/g) ?? []).length, 2);
  assert.match(toolbar, /aria-label="Открыть заметки"/);
  assert.match(toolbar, /disabled aria-disabled="true"/);
  assert.match(toolbar, /aria-label="Фильтры задач"/);
  assert.match(toolbar, /aria-expanded=\{open\}/);
  assert.match(toolbar, /onTimeFilterChange\('all'\)/);
  assert.match(toolbar, /onSelectAllSpheres\(true\)/);
  assert.match(toolbar, /onTimelineSphereChange\('all'\)/);
  assert.match(toolbar, /onPointerDown/);
  assert.match(toolbar, /onEscape/);
  assert.match(styles, /\.miniapp-workspace-filter-panel/);
  assert.match(styles, /body\[data-theme='light'\] \.miniapp-shell \.miniapp-workspace-tool/);
  assert.doesNotMatch(mini, /isListSphereFilterOpen/);
});

test('workspace tools remain below dialogs and the credits popover on both compact surfaces', async () => {
  const [mini, toolbar, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  const toolbarRule = css.match(/\.miniapp-workspace-tools \{([^}]+)\}/)?.[1] ?? '';
  const openRule = css.match(/\.miniapp-workspace-tools\.is-filter-menu-open \{([^}]+)\}/)?.[1] ?? '';
  const normalLayer = Number(toolbarRule.match(/z-index:\s*(\d+)/)?.[1]);
  const openLayer = Number(openRule.match(/z-index:\s*(\d+)/)?.[1]);
  const headerLayer = Number(mini.match(/sticky top-0 z-(\d+)(?: miniapp-premium-topbar)? rounded-xl/)?.[1]);
  const createTaskLayer = Number(mini.match(/miniapp-slide-backdrop fixed inset-0 z-(\d+) flex items-end/)?.[1]);
  assert.equal(normalLayer, 1);
  assert.ok(normalLayer < openLayer && openLayer < headerLayer);
  assert.ok(openLayer < createTaskLayer);
  assert.match(mini, /miniapp-credit-popover absolute right-0 top-full z-\[60\]/);
  assert.match(toolbar, /open \? 'is-filter-menu-open'/);
  assert.match(toolbar, /miniapp-workspace-filter-panel absolute right-0[^"]*z-\[180\]/);
});

test('notes and filters are neutral; disabled optimize uses rose in both themes', async () => {
  const [toolbar, css] = await Promise.all([
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.match(toolbar, /miniapp-workspace-tool-notes/);
  assert.match(toolbar, /miniapp-workspace-tool-filter/);
  assert.match(toolbar, /miniapp-workspace-tool-optimize/);
  assert.match(toolbar, /disabled aria-disabled="true"/);
  assert.match(css, /\.miniapp-workspace-tool \{[^}]*background: rgba\(100, 116, 139, \.16\);[^}]*color: #cbd5e1;/);
  assert.match(css, /\.miniapp-workspace-tool-optimize \{[^}]*background: rgba\(244, 63, 94, \.15\);[^}]*color: #fda4af;/);
  assert.match(css, /body\[data-theme='light'\] \.miniapp-shell \.miniapp-workspace-tool,\s*\.miniapp-shell\.miniapp-light \.miniapp-workspace-tool \{[^}]*color: #475569;/);
  assert.match(css, /body\[data-theme='light'\] \.miniapp-shell \.miniapp-workspace-tool-optimize,\s*\.miniapp-shell\.miniapp-light \.miniapp-workspace-tool-optimize \{[^}]*color: #be123c;/);
});

test('compact and Telegram notes share web CRUD, grouping, autosave and rich-text editor', async () => {
  const [mini, board, group, notesApi] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/StandaloneNoteGroupManager.tsx'),
    read('../../client/src/lib/api.ts')
  ]);
  assert.match(mini, /<StandaloneNotesWorkspace key=\{currentUser\.id\} userId=\{currentUser\.id\}/);
  assert.match(mini, /mode="mobile" onClose=\{\(\) => \{ setIsStandaloneNotesOpen\(false\); setRequestedStandaloneNote\(null\); \}\}/);
  assert.match(board, /setBoardOpen\(mode === 'mobile'\)/);
  assert.match(board, /api\.getStandaloneNotes\(\)/);
  assert.match(board, /api\.getStandaloneNoteGroups\(\)/);
  assert.match(board, /api\.createStandaloneNote\(/);
  assert.match(board, /api\.updateStandaloneNote\(/);
  assert.match(board, /api\.deleteStandaloneNote\(/);
  assert.match(board, /<StandaloneNoteGroupManager/);
  assert.match(board, /<NotesEditor/);
  assert.match(group, /onDelete/);
  assert.match(notesApi, /getStandaloneNotes:/);
});

test('fresh mobile browser navigations receive current app HTML rather than cached entrypoint', async () => {
  const server = await read('../src/index.ts');
  assert.match(server, /index: false/);
  assert.match(server, /endsWith\('\.html'\)/);
  assert.match(server, /'Cache-Control', 'no-store, must-revalidate'/);
  assert.match(server, /app\.get\('\*'/);
});


test('compact premium toolbar keeps symmetric mode/filter and note/postpone/optimize rows in both displays', async () => {
  const [mini, tools, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((mini.match(/<MiniWorkspaceTools/g) ?? []).length, 2);
  assert.equal((mini.match(/onDisplayModeChange=\{setDisplayMode\}/g) ?? []).length, 2);
  assert.equal((mini.match(/onPostpone=\{\(\) => void postponeAllOverdueToToday\(\)\}/g) ?? []).length, 2);
  const topStart = tools.indexOf('className="miniapp-workspace-primary"');
  const filterStart = tools.indexOf('ref={rootRef}', topStart);
  const bottomStart = tools.indexOf('className="miniapp-workspace-actions"', filterStart);
  assert.ok(topStart > 0 && filterStart > topStart && bottomStart > filterStart);
  assert.match(tools.slice(topStart, filterStart), /Режим отображения/);
  assert.match(tools.slice(filterStart, bottomStart), /Фильтры задач/);
  assert.match(tools.slice(bottomStart), /Заметки/);
  assert.match(tools.slice(bottomStart), /Отложить/);
  assert.match(tools.slice(bottomStart), /Оптимизировать/);
  assert.match(styles, /\.miniapp-shell \.miniapp-workspace-primary \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 2\.7rem/);
  assert.match(styles, /\.miniapp-shell \.miniapp-workspace-actions \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.05fr\) minmax\(0, 1\.48fr\)/);
  assert.match(mini, /miniapp-premium-timeline/);
  assert.match(mini, /miniapp-premium-habits/);
});

test('compact task cards use themed sector badges rather than left color bars and retain task actions', async () => {
  const [mini, styles] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const list = mini.slice(mini.indexOf('{listTasks.map((task) => {'), mini.indexOf('          </div>\n          </div>\n        ) : (', mini.indexOf('{listTasks.map((task) => {')));
  assert.match(list, /miniapp-task-sector-badge/);
  assert.match(list, /taskSphere\?\.name \?\?/);
  assert.match(list, /'--miniapp-sector-color': taskSphereColor/);
  assert.doesNotMatch(list, /borderLeftWidth: '4px'|leftStripeColor|--miniapp-task-stripe/);
  assert.match(list, /onClick=\{\(\) => openTaskModal\(task\)\}/);
  assert.match(list, /onClick=\{\(\) => void completeTask\(task\.id\)\}/);
  assert.match(list, /hasSubtasks/);
  assert.match(styles, /\.miniapp-shell \.miniapp-task-feed \.miniapp-task-list-card/);
  assert.match(styles, /\.miniapp-shell\.miniapp-light \.miniapp-task-feed \.miniapp-task-sector-badge/);
  assert.match(styles, /\.miniapp-shell \.miniapp-task-complete-trigger/);
});
