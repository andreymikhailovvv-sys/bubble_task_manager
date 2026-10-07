import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('website task editor leaves a few extra pixels below one-line title glyphs', async () => {
  const source = await readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8');
  assert.match(
    source,
    /task-edit-title-input[^"]*min-h-\[2\.8rem\][^"]*pb-\[0\.2rem\]/
  );
});

test('Mini App task focus keeps completed subtasks available for the eye toggle and sorts them last', async () => {
  const source = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');

  const mapStart = source.indexOf('const subtasksByParent = useMemo');
  const mapEnd = source.indexOf('const subtaskProgressByParent', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart);
  const mapBlock = source.slice(mapStart, mapEnd);
  assert.doesNotMatch(mapBlock, /if \(task\.status === 'DONE'\) continue/);

  const focusStart = source.indexOf('const openedTaskSubtasks = useMemo');
  const focusEnd = source.indexOf('const openedSubtask =', focusStart);
  assert.ok(focusStart >= 0 && focusEnd > focusStart);
  const focusBlock = source.slice(focusStart, focusEnd);
  assert.match(focusBlock, /!hideClosedOpenedTaskSubtasks \|\| task\.status !== 'DONE'/);

  const statusSortIndex = focusBlock.indexOf("const statusDiff = Number(a.status === 'DONE')");
  const urgencySortIndex = focusBlock.indexOf("openedTaskSubtaskFilterMode === 'urgency'");
  assert.ok(statusSortIndex >= 0 && urgencySortIndex > statusSortIndex);
});
