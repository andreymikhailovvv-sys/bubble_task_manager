import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const entry = read('../src/main.tsx');
const testPage = read('../src/TestPage.tsx');
const styles = read('../src/TestPage.css');
const planner = read('../src/App.tsx');

test('Test Page is an opt-in route and preserves the default planner and Economic routes', () => {
  assert.match(entry, /const TestPage = React\.lazy/);
  assert.match(entry, /const isTestPageRoute =/);
  assert.match(entry, /test-page\|test%20page/);
  assert.match(entry, /isTestPageRoute\s*\?\s*<TestPage/);
  assert.match(entry, /isEconomicRoute\s*\?\s*<EconomicApp/);
  assert.match(entry, /:\s*<App \/>/);
});

test('dashboard uses live task, sector, credits, subscriptions and notes data', () => {
  for (const method of ['getTasks', 'getSpheres', 'getMe', 'getCreditUsageStatistics', 'getSubscriptionLinks']) {
    assert.match(testPage, new RegExp('api\\.' + method + '\\('));
  }
  assert.match(testPage, /<StandaloneNotesWorkspace/);
  assert.match(testPage, /<SectorEditor/);
  assert.match(testPage, /<TaskEditor/);
  assert.match(testPage, /<FocusedTaskWindowFrame/);
  assert.match(testPage, /<PlanikMascot/);
  assert.doesNotMatch(testPage, /mockTasks|mockCredits|dummyTask|fakeBalance/);
});

test('full Focus deep link resolves to the unchanged native focus window', () => {
  assert.match(testPage, /\?focusTask=/);
  assert.match(planner, /url\.searchParams\.get\('focusTask'\)/);
  assert.match(planner, /setFocusedTaskId\(requestedId\)/);
  assert.match(planner, /<FocusedTaskWindowFrame/);
});

test('blue Test Page theme is isolated from the Economic golden theme and mobile friendly', () => {
  assert.match(styles, /\.tp-root\s*\{/);
  assert.match(styles, /--tp-accent:/);
  assert.match(styles, /\.tp-light\s*\{/);
  assert.match(styles, /@media \(max-width:720px\)/);
  assert.doesNotMatch(styles, /\.econ-root\s*\{/);
});
