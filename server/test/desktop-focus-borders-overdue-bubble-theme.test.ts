import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');
const rule = (css: string, selector: string) => {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `Missing selector: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  assert.ok(open >= 0 && close > open);
  return css.slice(open + 1, close);
};

test('top-bar overdue popover is opaque in light and dark modes', async () => {
  const [css, app] = await Promise.all([
    read('../../client/src/styles.css'), read('../../client/src/App.tsx')
  ]);
  assert.match(app, /id="topbar-overdue-list" className="timeline-overdue-panel topbar-overdue-popover/);
  const shared = rule(css, '.topbar-overdue-popover {');
  assert.match(shared, /background: #f8fafc;/);
  assert.match(shared, /backdrop-filter: none;/);
  const dark = rule(css, "body[data-theme='dark'] .topbar-overdue-popover {");
  assert.match(dark, /background: #19283e;/);
  assert.doesNotMatch(dark, /rgba\([^)]*\)/, 'Dark popover background must be solid');
});

test('dark bubble task information uses a readable navy surface rather than near-black', async () => {
  const [css, bubbles] = await Promise.all([
    read('../../client/src/styles.css'), read('../../client/src/components/BubbleField.tsx')
  ]);
  assert.match(bubbles, /bubble-tooltip-card bubble-task-info-panel/);
  const dark = rule(css, "body[data-theme='dark'] .bubble-task-info-panel {");
  assert.match(dark, /linear-gradient\(145deg, #1c3049, #14243a 58%, #111e32\)/);
  assert.match(dark, /border-color: rgba\(100, 132, 165, 0\.34\)/);
  const light = rule(css, "body[data-theme='light'] .bubble-task-info-panel {");
  assert.match(light, /background: #ffffff !important/);
});

test('focus task and subtask editor dark outlines are muted without recoloring actions', async () => {
  const [css, taskEditor, app] = await Promise.all([
    read('../../client/src/styles.css'),
    read('../../client/src/components/TaskEditor.tsx'),
    read('../../client/src/App.tsx')
  ]);
  assert.match(taskEditor, /task-edit-shell focused-task-editor-shell/);
  assert.match(app, /className="focus-mode-shell/);
  const darkFocus = rule(css, "body[data-theme='dark'] .focus-setup-modal,");
  assert.match(darkFocus, /border-color: rgba\(100, 116, 139, 0\.42\)/);
  const shared = css.slice(css.lastIndexOf('/* Dark focus surfaces:'));
  assert.match(shared, /--focus-utility-border: rgba\(100, 116, 139, \.44\)/);
  assert.match(shared, /\.focused-task-title-edit-button/);
  assert.match(shared, /\.focused-task-inline-subtask-button/);
  assert.match(shared, /\.focused-task-calendar-like-button/);
  assert.match(shared, /\.focused-task-add-subtask-button/);
  assert.match(shared, /\.focused-task-sector-button/);
  assert.match(shared, /\.focused-task-pill-select/);
  assert.match(shared, /\.focus-timer-select-trigger/);
  assert.doesNotMatch(shared, /\.success-button|\.danger-button|\.importance-choice-button/);
  assert.match(css, /body\[data-theme='dark'\] \.focused-task-editor-shell,[\s\S]*?border-color: rgba\(100, 116, 139, 0\.42\) !important/);
});
