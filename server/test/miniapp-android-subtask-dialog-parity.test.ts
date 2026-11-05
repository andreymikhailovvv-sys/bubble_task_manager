import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Mini App subtask editor uses the parent focus title, date and description actions', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const begin = mini.indexOf('{(openedSubtask || isCreatingNewSubtask) && openedSubtaskDraft ? (');
  const end = mini.indexOf('{commentPanelTaskId ? (() => {', begin);
  assert.ok(begin >= 0 && end > begin);
  const editor = mini.slice(begin, end);
  assert.match(editor, /miniapp-subtask-editor-panel/);
  assert.match(editor, /className=\{`miniapp-focus-title-input/);
  assert.match(editor, /buttonLabel="Выбрать дату"/);
  assert.match(editor, /miniapp-focus-expand-description/);
  assert.match(editor, /Редактировать описание/);
  assert.doesNotMatch(editor, /Минимальная карточка с описанием и сроком/);
  assert.doesNotMatch(editor, /<p className="text-xs font-semibold uppercase/);
  assert.match(css, /\.miniapp-subtask-editor-panel \.miniapp-subtask-actions > button/);
});

test('Android subtask is a centered dialog above its still-mounted parent sheet', async () => {
  const [home, child] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppSubtaskEditorSheet.kt')
  ]);
  const parentStart = home.indexOf('if (openedTask != null && parent == null');
  const parentEnd = home.indexOf('} else if (parent != null) {', parentStart);
  const parentFocus = home.slice(parentStart, parentEnd);
  assert.match(parentFocus, /overlaySubtaskId = childId/);
  assert.match(parentFocus, /overlayNewSubtaskParentId = openedTask.id/);
  assert.doesNotMatch(parentFocus, /openedTaskId = childId/);
  assert.doesNotMatch(parentFocus, /openedTaskId = null/);
  assert.match(home, /val overlayChild=overlaySubtaskId\?\.let/);
  assert.match(home, /if\(overlayParent!=null && \(overlayChild!=null \|\| overlayNewSubtaskParentId!=null\)\)/);
  assert.match(child, /Dialog\(/);
  assert.match(child, /DialogProperties\(usePlatformDefaultWidth=false\)/);
  assert.doesNotMatch(child, /ModalBottomSheet\(/);
  assert.match(child, /Text\("Выбрать дату"/);
  assert.match(child, /Text\("Редактировать описание"/);
  assert.match(child, /modifier\.height\(44\.dp\)/);
  assert.doesNotMatch(child, /Минимальная карточка с описанием и сроком/);
});
