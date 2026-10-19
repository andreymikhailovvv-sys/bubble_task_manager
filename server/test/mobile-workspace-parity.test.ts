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

test('compact and Telegram notes share web CRUD, grouping, autosave and rich-text editor', async () => {
  const [mini, board, group, notesApi] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/StandaloneNotesWorkspace.tsx'),
    read('../../client/src/components/StandaloneNoteGroupManager.tsx'),
    read('../../client/src/lib/api.ts')
  ]);
  assert.match(mini, /<StandaloneNotesWorkspace key=\{currentUser\.id\} userId=\{currentUser\.id\}/);
  assert.match(mini, /mode="mobile" onClose=\{\(\) => setIsStandaloneNotesOpen\(false\)\}/);
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
