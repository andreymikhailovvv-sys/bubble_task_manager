import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android List and Timeline headers mirror Mini App topbar actions without one enclosing bar', async () => {
  const [android, mini, tools] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx')
  ]);
  const start = android.indexOf('private fun WorkspaceTopbar(');
  const end = android.indexOf('private fun HabitsStrip(', start);
  const header = android.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(header, /mode:WorkspaceMode/);
  assert.match(header, /BasicTextField\(value=state\.query,onValueChange=search/);
  assert.match(header, /state\.query\.isNotEmpty\(\)/);
  assert.match(header, /if\(mode==WorkspaceMode\.LIST\) \{/);
  assert.match(header, /onCredits\(\)/);
  assert.match(header, /onScore\(\)/);
  assert.match(header, /Modifier\.clickable\(onClick=onPostpone\)/);
  assert.match(header, /DropdownMenu\(expanded=moreOpen/);
  assert.match(header, /Icons\.Default\.MoreVert/);
  assert.match(header, /Icons\.Default\.Settings/);
  assert.match(header, /tint=creditColor/);
  assert.match(header, /if\(dark\)Color\(0xFF37243B\) else Color\(0xFFFDF2F8\)/);
  assert.match(android, /WorkspaceTopbar\(state,colors,mode=contentMode,dark=dark/);
  assert.match(android, /canPostpone=overdue && !state\.taskBusy/);
  assert.doesNotMatch(header.slice(header.indexOf('val shape='), header.indexOf('Row(Modifier.fillMaxWidth()')), /Surface\(/);

  // List actions are three individual chips, while Timeline displays only filters
  // below its header; postponing already lives beside the search on Timeline.
  const toolbarStart = android.indexOf('private fun WorkspaceToolbar(');
  const toolbarEnd = android.indexOf('private fun ModeButton(', toolbarStart);
  const toolbar = android.slice(toolbarStart, toolbarEnd);
  assert.match(toolbar, /No outer tinted container/);
  assert.match(toolbar, /if\(mode==WorkspaceMode\.TIMELINE\)/);
  assert.match(toolbar, /ToolbarButton\("Отложить"/);
  assert.match(toolbar, /ToolbarButton\("Оптимизировать"/);
  assert.match(toolbar, /ToolbarButton\("Фильтры"/);
  assert.match(toolbar, /enabled=false,dimDisabled=false/);
  assert.match(android, /onFilter\s*=\s*\{\s*filtersOpen=true\s*\}/);
  assert.match(android, /onPostpone\s*=\s*\{\s*vm\.postponeOverdue\(\)\s*\}/);
  assert.match(mini, /miniapp-workspace-utilities/);
  assert.match(mini, /miniapp-timeline-more-toggle/);
  assert.match(mini, /miniapp-timeline-postpone-button/);
  assert.match(tools, /miniapp-workspace-tool-optimize/);
});
