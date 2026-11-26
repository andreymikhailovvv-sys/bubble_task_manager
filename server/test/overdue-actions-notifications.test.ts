import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('desktop and compact web show the actual successful postpone count in a bubble-style top notice', async () => {
  const [desktop, mini, toast] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/WorkspaceActionToast.tsx')
  ]);
  const desktopBulk = desktop.slice(desktop.indexOf('const postponeAllOverdueToToday = async'), desktop.indexOf('const postponeAllOverdueByAi = async'));
  const miniBulk = mini.slice(mini.indexOf('const postponeAllOverdueToToday = async'), mini.indexOf('const timelineToday = useMemo'));
  for (const bulk of [desktopBulk, miniBulk]) {
    assert.match(bulk, /let postponedCount = 0/);
    assert.match(bulk, /await api\.updateTask/);
    assert.match(bulk, /postponedCount \+= 1/);
    assert.match(bulk, /if \(postponedCount > 0\) setPostponeNotice\(\{ count: postponedCount/);
    assert.ok(bulk.indexOf('postponedCount += 1') > bulk.indexOf('await api.updateTask'));
  }
  assert.match(desktop, /<WorkspaceActionToast count=\{postponeNotice\?\.count \?\? null\}/);
  assert.match(mini, /<WorkspaceActionToast count=\{postponeNotice\?\.count \?\? null\}/);
  assert.match(toast, /Отложено \{count\} просроченных задач/);
  assert.match(toast, /role="status"/);
  assert.match(toast, /safe-area-inset-top/);
  assert.match(toast, /backdrop-blur-md/);
});

test('Telegram and mobile web open one overdue list with a top-right postpone button and task navigation', async () => {
  const [mini, toolbar] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniWorkspaceTools.tsx')
  ]);
  assert.match(toolbar, /onOpenOverdue: \(\) => void/);
  assert.match(toolbar, /onClick=\{onOpenOverdue\}/);
  assert.match(toolbar, /Просроченные задачи<\/span>/);
  assert.doesNotMatch(toolbar, /Оптимизировать|aria-disabled="true"/);
  assert.match(mini, /onOpenOverdue=\{\(\) => setIsOverdueTasksOpen\(true\)\}/);
  assert.match(mini, /role="dialog" aria-modal="true" aria-labelledby="mini-overdue-title"/);
  assert.match(mini, /Всего: \{overdueTasks\.length\}/);
  assert.match(mini, /onClick=\{\(\) => void postponeAllOverdueToToday\(\)\}/);
  assert.match(mini, /if \(task\.parentTaskId\) openSubtaskModal\(task\)/);
  assert.match(mini, /task\.status !== 'DONE' && task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
});

test('Android overdue list excludes events/reminders and exposes a transient top notice with completed count', async () => {
  const [screen, vm, repository] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/data/repository/WorkspaceRepository.kt')
  ]);
  assert.match(screen, /ToolbarButton\("Просроченные задачи"/);
  assert.match(screen, /onOpenOverdue = \{ overdueOpen=true \}/);
  assert.match(screen, /if\(overdueOpen\) \{/);
  assert.match(screen, /Text\("Просроченные задачи"/);
  assert.match(screen, /TextButton\(onClick=\{vm\.postponeOverdue\(\)\}/);
  assert.match(screen, /it\.taskType != TaskType\.REMINDER && it\.dueDate != null/);
  assert.match(screen, /Popup\(alignment=Alignment\.TopCenter/);
  assert.match(screen, /Отложено \$\{notice\.count\} просроченных задач/);
  assert.match(vm, /val count = repository\.postponeOverdue/);
  assert.match(vm, /if \(count > 0\) OverduePostponeNotice/);
  assert.match(repository, /suspend fun postponeOverdue\(tasks: List<Task>\): Int/);
  assert.match(repository, /api\.updateTask\(task\.id, buildJsonObject/);
  assert.match(repository, /postponedCount \+= 1/);
  assert.match(repository, /return postponedCount/);
});
