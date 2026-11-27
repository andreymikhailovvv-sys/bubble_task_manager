import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('single mode shortcuts and split rendering retain the original BubbleField', async () => {
  const [app, controls] = await Promise.all([load('../../client/src/App.tsx'), load('../../client/src/components/FullscreenWorkspaceLayout.tsx')]);
  assert.match(app, /<FullscreenModePicker modes=\{fullscreenPanels\.filter/);
  assert.match(app, /fullscreenPanels\.length === 2 \? \(/);
  assert.match(app, /renderPanel=\{renderFullscreenPanel\}/);
  assert.equal((app.match(/<BubbleField\b/g) ?? []).length, 1);
  assert.match(controls, /onChange\(\[value\]\)/);
  assert.match(controls, /const selected = modes\[0\] === option\.value/);
  assert.match(controls, /aria-pressed=\{selected\}/);
  assert.match(controls, /onDoubleClick=\{onSwap\}/);
});

test('credits and overdue remain available; classic switch is gone', async () => {
  const app = await load('../../client/src/App.tsx');
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const header = app.slice(start, app.indexOf('</header>', start));
  for (const part of ['{renderOverdueControl()}', '{renderCreditsControl()}', '<FullscreenBlockMenu']) {
    assert.ok(header.includes(part), 'Missing: ' + part);
  }
  assert.doesNotMatch(header, /bubbles-fullscreen-exit/);
});

test('split divider handles pointer/keyboard drag and placement targets', async () => {
  const [app, controls, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css')
  ]);
  for (const part of ['role="separator" tabIndex={0}', 'setPointerCapture(event.pointerId)',
    "root.style.setProperty('--fullscreen-split-ratio'",
    'onChoose(0, placement)', 'onChoose(1, placement)']) assert.ok(controls.includes(part), part);
  assert.match(css, /grid-template-columns: minmax\(0, calc\(var\(--fullscreen-split-ratio, 50%\) - 7px\)\) 14px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-rows: minmax\(0, calc\(var\(--fullscreen-split-ratio, 50%\) - 7px\)\) 14px minmax\(0, 1fr\)/);
  assert.match(css, /\.fullscreen-workspace-divider \{[^}]*z-index: 60;/);
  assert.doesNotMatch(controls, /<FullscreenAddWindowMenu/);
  assert.match(controls, /onDragOver=/);
  assert.match(controls, /onDrop=/);
  assert.match(app, /<FullscreenWorkspaceSingle panel=\{fullscreenPanels\[0\]\}/);
  assert.match(app, /compact=\{isBubbleFullscreen && fullscreenPanels\.length === 2\}/);
});