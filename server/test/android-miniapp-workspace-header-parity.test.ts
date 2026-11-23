import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android overview header uses brand, account, credits, expandable search and settings', async () => {
  const [android, mini, tools] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx')
  ]);
  const start = android.indexOf('private fun WorkspaceTopbar(');
  const end = android.indexOf('private fun workspaceHabitNextDay(', start);
  const header = android.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(header, /state:HomeState,colors:WorkspaceColors,dark:Boolean/);
  assert.match(header, /onAccount:.*onSearchToggle:/);
  assert.match(header, /clickable\(onClick=onCredits\)/);
  assert.match(header, /Icons\.Default\.Settings/);
  assert.match(header, /Icons\.Default\.Search/);
  assert.match(header, /Icons\.Default\.AccountCircle/);
  assert.match(android, /WorkspaceTopbar\(state,colors,dark,/);
  assert.match(android, /BasicTextField\(value=state\.query/);
  assert.match(android, /onSearchToggle=/);
  assert.match(android, /ToolbarButton\("Просроченные задачи"/);
  assert.match(android, /ToolbarButton\("Отложить"/);
  assert.match(android, /ToolbarButton\("Фильтры"/);
  assert.match(android, /onOpenOverdue/);
  assert.match(android, /onFilter\s*=\s*\{\s*filtersOpen=true\s*\}/);
  assert.match(android, /onPostpone\s*=\s*\{\s*vm\.postponeOverdue\(\)\s*\}/);
  assert.match(mini, /miniapp-workspace-utilities/);
  assert.match(tools, /miniapp-workspace-tool-overdue/);
});
