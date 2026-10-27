import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const miniApp = new URL('../../client/src/MiniApp.tsx', import.meta.url);
const styles = new URL('../../client/src/styles.css', import.meta.url);

test('focus subtasks have an independent checkbox, and title still opens editing', async () => {
  const source = await readFile(miniApp, 'utf8');
  const start = source.indexOf('openedTaskSubtasks.map((subtask)');
  const end = source.indexOf('                  </div>\n                </div> : null}', start);
  assert.ok(start >= 0 && end > start);
  const markup = source.slice(start, end);
  assert.match(markup, /role="checkbox"/);
  assert.match(markup, /aria-checked=\{subtask.status === 'DONE'\}/);
  assert.match(markup, /onClick=\{\(\) => void toggleFocusSubtaskStatus\(subtask\)\}/);
  assert.match(markup, /disabled=\{updatingFocusSubtaskIds.includes\(subtask.id\)\}/);
  assert.match(markup, /onClick=\{\(\) => openSubtaskModal\(subtask\)\}/);
  assert.doesNotMatch(markup, /h-2 w-2 shrink-0 rounded-full bg-violet-400/);
});

test('checkbox toggles DONE and TODO via server with immediate update and rollback', async () => {
  const source = await readFile(miniApp, 'utf8');
  const start = source.indexOf('const toggleFocusSubtaskStatus = async (subtask: Task) =>');
  const end = source.indexOf('  const deleteTask = async', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /subtask.status === 'DONE' \? 'TODO' : 'DONE'/);
  assert.match(handler, /api.updateTask\(subtask.id, \{ status: nextStatus \}\)/);
  assert.match(handler, /setTasks\(\(current\) => current.map/);
  assert.match(handler, /status: subtask.status/);
  assert.match(handler, /setError\(error instanceof Error/);
  assert.match(handler, /updatingFocusSubtasksRef.current.has\(subtask.id\)/);
  assert.match(handler, /setHideClosedOpenedTaskSubtasks\(false\)/);
  assert.doesNotMatch(handler, /completeTask\(/);
  assert.doesNotMatch(handler, /status: 'DONE'.*parentTaskId/);
});

test('focus checkbox has accessible checked and unchecked appearance in dark and light themes', async () => {
  const css = await readFile(styles, 'utf8');
  assert.match(css, /\.miniapp-focus-subtask-check-toggle \{/);
  assert.match(css, /\.miniapp-focus-subtask-check-toggle:focus-visible/);
  assert.match(css, /\.miniapp-focus-subtask-check-box-done/);
  assert.match(css, /\.miniapp-light \.miniapp-focus-subtask-check-box-done/);
});

test('light Mini App and Android checkbox accent matches focus icon cyan, without recoloring dark mode', async () => {
  const [css, android] = await Promise.all([
    readFile(styles, 'utf8'),
    readFile(new URL('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppTaskFocusSheet.kt', import.meta.url), 'utf8')
  ]);
  assert.match(css, /\.miniapp-shell\.miniapp-light \.miniapp-focus-subtask-check-box-done \{\s*border-color: #0891b2;\s*background: #0891b2;/);
  assert.match(css, /\.miniapp-shell\.miniapp-light \.miniapp-focus-subtask-check-toggle:focus-visible \{ outline-color: #0891b2;/);
  assert.match(android, /Color\(0xFF0891B2\)/);
  assert.match(android, /\.border\(1\.5\.dp,if\(c\.teal==Color\(0xFF0891B2\)\)c\.teal else c\.purple/);
});
