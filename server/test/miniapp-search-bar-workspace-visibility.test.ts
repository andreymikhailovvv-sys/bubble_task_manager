import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Mini App search header is rendered only in the list/timeline workspace', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('const showWorkspaceSearchBar =');
  const end = source.indexOf(';', start);
  assert.ok(start >= 0 && end > start);
  const workspaceOnly = source.slice(start, end);
  for (const overlay of [
    '!isAiChatOpen', '!isStandaloneNotesOpen',
    '!openedTaskId', '!openedSubtaskId',
    '!isAiDialogOpen', '!isCreateTaskModalOpen', '!isHabitModalOpen',
    '!isQuickCreateOpen', '!isSettingsOpen', '!authModalMode',
    '!isTaskNotesEditorOpen', '!isSubtaskNotesEditorOpen',
    '!isAiChatProjectDialogOpen', '!isCalendarExportOpen', '!reportPromptTask'
  ]) {
    assert.ok(workspaceOnly.includes(overlay), `header must be hidden while ${overlay.slice(1)} is open`);
  }
  assert.match(source, /\{showWorkspaceSearchBar \? <div ref=\{searchBarSlotRef\} className="miniapp-premium-topbar-slot"/);
  assert.match(source, /<\/section>\s*<\/div> : null\}\s*\{error \?/);
  assert.match(source, /if \(!showWorkspaceSearchBar\) return;/);
});

test('floating search header state is reset when leaving the workspace', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('useEffect(() => {\n    if (showWorkspaceSearchBar) return;');
  const end = source.indexOf('}, [showWorkspaceSearchBar]);', start);
  assert.ok(start >= 0 && end > start);
  const effect = source.slice(start, end);
  assert.match(effect, /setIsSearchBarFloating\(false\)/);
  assert.match(effect, /setIsHeaderVisible\(true\)/);
  assert.match(effect, /setFloatingSearchBarHeight\(0\)/);
  assert.match(effect, /setIsGlobalSearchOpen\(false\)/);
  assert.match(effect, /mainScrollIntentRef\.current = 0/);
});
