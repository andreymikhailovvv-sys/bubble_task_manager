import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const entry = read('../src/main.tsx');
const page = read('../src/TestMainPage.tsx');
const css = read('../src/TestMainPage.css');
const geometry = read('../src/lib/testMainGrid.ts');

test('new main-page prototype has a separate opt-in route without changing classic and test-page entry', () => {
  assert.match(entry, /const TestMainPage = React\.lazy/);
  assert.match(entry, /const isTestMainPageRoute/);
  assert.match(entry, /isTestMainPageRoute\s*\? <TestMainPage\s*\/>/);
  assert.match(entry, /isTestPageRoute\s*\? <TestPage\s*\/>/);
  assert.match(entry, /: isCompactWorkspaceViewport\s*\? <MiniApp/);
});

test('grid includes actual Planner modules and user-specific persistence', () => {
  for (const moduleName of ['BubbleField', 'StandaloneNotesWorkspace', 'TestPageChat',
    'TestPageHabits', 'FullscreenUpcomingTasksPanel', 'TestPageTaskDialog']) {
    assert.ok(page.includes(moduleName), moduleName);
  }
  assert.match(page, /api\.getTasks\(\)/);
  assert.match(page, /api\.getSpheres\(\)/);
  assert.match(page, /localStorage\.setItem\(testMainStorageKey\(user\.id\)/);
  assert.match(geometry, /test-main-page:layout:v1/);
  for (const kind of ['bubbles', 'tasks', 'timeline', 'notes', 'chat', 'habits', 'upcoming']) {
    assert.match(geometry, new RegExp("kind: '" + kind + "'"));
  }
});

test('move, resize, keyboard and mobile grid are enabled', () => {
  assert.match(page, /setPointerCapture/);
  assert.match(page, /onPointerCancel/);
  assert.match(page, /keyboardGrid/);
  assert.match(page, /testMainMove/);
  assert.match(page, /testMainReflow/);
  assert.match(css, /\.tm-resize-handle/);
  assert.match(css, /@media\(max-width:719px\)/);
  assert.match(css, /grid-auto-rows:var\(--tm-row\)/);
});
