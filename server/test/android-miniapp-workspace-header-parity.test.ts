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
  assert.match(android, /BasicTextField\(value=query/);
  assert.match(android, /focusRequester\(requester\)/);
  assert.match(android, /keyboard\?\.show\(\)/);
  assert.match(android, /item\(key="workspace-unified-header"\)/);
  assert.match(android, /if\(timelineActive\) workspaceScroll\.scrollToItem\(0\)/);
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


test('Android search focuses only the visible pager tab and never navigates to AI Chat', async () => {
  const source = await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
  assert.match(source, /var searchOpenedOnPage by rememberSaveable \{ mutableIntStateOf\(-1\) \}/);
  assert.doesNotMatch(source, /var searchFieldOpen by rememberSaveable/);
  // HorizontalPager keeps adjacent tabs composed. Both hidden pages must NOT
  // mount a focused search field when one tab's magnifier was tapped.
  assert.match(source, /val searchActiveHere = searchOpenedOnPage==page && pagerState\.currentPage==page/);
  assert.equal((source.match(/if\(searchActiveHere\) \{/g) ?? []).length, 2);
  assert.equal((source.match(/if\(searchActiveHere && searchExpanded && searchQuery\.isNotEmpty\(\)\)/g) ?? []).length, 2);
  assert.equal((source.match(/if\(searchOpenedOnPage==page\)/g) ?? []).length, 2);
  assert.equal((source.match(/onClose=\{search\(""\);searchOpenedOnPage=-1;searchExpanded=false\}/g) ?? []).length, 2);
  assert.match(source, /if\(searchOpenedOnPage!=-1 && searchOpenedOnPage!=pagerState\.currentPage\)/);
  // Wait for attachment of the visible BasicTextField before requesting focus and IME.
  assert.match(source, /withFrameNanos \{ \}[\s\S]*requester\.requestFocus\(\)[\s\S]*keyboard\?\.show\(\)/);
  const searchCallbacks = source.match(/onSearchToggle=\{[\s\S]*?searchExpanded=false\s*\}/g) ?? [];
  assert.equal(searchCallbacks.length, 2);
  for (const callback of searchCallbacks) {
    assert.doesNotMatch(callback, /scrollToPage|animateScrollToPage|onExit/);
  }
});
