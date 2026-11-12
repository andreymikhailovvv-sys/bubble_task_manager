import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('fullscreen toolbar keeps brand, search, three checkboxes, create task, account actions and exit in order', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css')
  ]);
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const end = app.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start);
  const header = app.slice(start, end);
  const order = ['Планировыч AI', '<WorkspaceGlobalSearch', '<FullscreenModePicker',
    'className="fullscreen-create-control', '{renderOverdueControl()}',
    '{renderCreditsControl()}', '<TelegramIntegrationsMenu', 'href="/about"',
    'className="auth-actions"', 'data-tour="fullscreen-workspace-settings"',
    'data-tour="bubbles-fullscreen-exit"'];
  let last = -1;
  for (const item of order) {
    const pos = header.indexOf(item);
    assert.ok(pos > last, `Expected ${item} after preceding toolbar element`);
    last = pos;
  }
  assert.doesNotMatch(header, /data-tour="feature-telegram-button"/);
  assert.match(header, /fullscreen-workspace-toolbar--one-row/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \{[^}]*flex-flow: row nowrap/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \.workspace-global-search-anchor \{[^}]*max-width: 290px !important/);
});

test('mode selection is an inline, keyboard-accessible trio of actual checkboxes', async () => {
  const controls = await load('../../client/src/components/FullscreenWorkspaceLayout.tsx');
  const picker = controls.slice(controls.indexOf('export function FullscreenModePicker'),
    controls.indexOf('export function FullscreenWorkspaceSplit'));
  assert.match(picker, /display-mode-toggle-group/);
  assert.match(picker, /VIEW_OPTIONS\.map/);
  assert.match(picker, /<input type="checkbox"/);
  assert.match(picker, /checked=\{selected\}/);
  assert.match(picker, /onChange=\{\(\) => toggle\(option\.value\)\}/);
  assert.match(picker, /if \(modes\.length > 1\) onChange\(modes\.filter/);
  assert.match(picker, /onChange\(\[modes\[0\], value\]\)/);
  assert.doesNotMatch(picker, /createPortal|aria-haspopup|aria-expanded/);
});

test('one shared viewport-width column constrains header, single modes and split modes', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css')
  ]);
  assert.match(css, /\.app-shell\.bubble-fullscreen-shell \{[^}]*width: 100vw;[^}]*max-width: none;[^}]*--fullscreen-workspace-width: calc\(100vw - clamp\(32px, 4vw, 80px\)\)/);
  // At the reference screenshot width the margins are roughly 35px on either side.
  assert.equal(Math.round(Math.min(80, Math.max(32, 1745 * 0.04)) / 2), 35);
  assert.match(css, /\.bubble-fullscreen-shell > \.fullscreen-workspace-toolbar--one-row,\s*\.bubble-fullscreen-shell > \.workspace-shell \{[^}]*width: var\(--fullscreen-workspace-width\)/);
  assert.match(css, /\.fullscreen-workspace-single--open > \.fullscreen-mode-surface \{\s*width: 100%;\s*max-width: 100%;/);
  assert.match(css, /\.fullscreen-workspace-split \{[^}]*grid-template-columns/);
  assert.match(app, /fullscreenDisplayModes\.length === 2 \? \(/);
  assert.match(app, /fullscreen-workspace-single--open/);
  assert.match(css, /\.fullscreen-workspace-single--open \.fullscreen-mode-surface-content > :is\(\.list-mode-canvas, \.timeline-canvas\) \{[^}]*border: 0 !important/);
});
