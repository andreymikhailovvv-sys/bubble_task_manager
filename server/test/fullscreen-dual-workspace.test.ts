import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('checkbox mode shortcuts and split rendering retain the original BubbleField', async () => {
  const [app, controls] = await Promise.all([load('../../client/src/App.tsx'), load('../../client/src/components/FullscreenWorkspaceLayout.tsx')]);
  assert.match(app, /<FullscreenModePicker modes=\{fullscreenPanels\.filter/);
  assert.match(app, /fullscreenPanels\.length === 2 \? \(/);
  assert.match(app, /renderPanel=\{renderFullscreenPanel\}/);
  assert.equal((app.match(/<BubbleField\b/g) ?? []).length, 1);
  assert.match(controls, /if \(modes\.length > 1\) onChange\(modes\.filter/);
  assert.match(controls, /onChange\(\[modes\[0\], value\]\)/);
  assert.match(controls, /<input type="checkbox"/);
});

test('credits, overdue and fullscreen exit are still functional', async () => {
  const app = await load('../../client/src/App.tsx');
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const header = app.slice(start, app.indexOf('</header>', start));
  for (const part of ['{renderOverdueControl()}', '{renderCreditsControl()}', 'setIsBubbleFullscreen(false)', 'data-tour="bubbles-fullscreen-exit"']) {
    assert.ok(header.includes(part), 'Missing: ' + part);
  }
});

test('split divider handles pointer/keyboard drag and two independent add buttons', async () => {
  const [app, controls, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css')
  ]);
  for (const part of ['role="separator" tabIndex={0}', 'setPointerCapture(event.pointerId)',
    "root.style.setProperty('--fullscreen-split-ratio'", "closest('button')",
    'onChoose(0, next)', 'onChoose(1, next)']) assert.ok(controls.includes(part), part);
  assert.match(css, /grid-template-columns: minmax\\(0, calc\\(var\\(--fullscreen-split-ratio, 50%\\) - 5px\\)\\) 10px minmax\\(0, 1fr\\)/);
  assert.match(css, /\\.fullscreen-workspace-divider > \\.fullscreen-add-window:first-child \\{ left: -24px; \\}/);
  assert.match(css, /\\.fullscreen-workspace-divider > \\.fullscreen-add-window:last-child \\{ right: -24px; \\}/);
  assert.match(css, /grid-template-rows: minmax\\(0, calc\\(var\\(--fullscreen-split-ratio, 50%\\) - 5px\\)\\) 10px minmax\\(0, 1fr\\)/);
  assert.match(app, /<FullscreenWorkspaceSingle panel=\{fullscreenPanels\[0\]\}/);
  assert.match(app, /compact=\{isBubbleFullscreen && fullscreenPanels\.length === 2\}/);
});