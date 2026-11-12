import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('the fullscreen header uses a single desktop row, small search, and right-hand mode selection', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css')
  ]);
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const end = app.indexOf('</header>', start);
  const header = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(header, /fullscreen-workspace-toolbar--one-row/);
  assert.match(header, /fullscreen-workspace-toolbar-main flex min-w-0 flex-nowrap/);
  assert.doesNotMatch(header, /fullscreen-workspace-toolbar-bottom/);
  assert.ok(header.indexOf('<WorkspaceGlobalSearch') < header.indexOf('className="fullscreen-create-control'));
  assert.ok(header.indexOf('className="fullscreen-create-control') < header.indexOf('<FullscreenModePicker'));
  assert.ok(header.indexOf('<FullscreenModePicker') < header.indexOf('data-tour="bubbles-fullscreen-exit"'));
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \{[^}]*flex-flow: row nowrap/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \.workspace-global-search-anchor \{[^}]*max-width: 170px !important/);
});

test('mode picker popup stays within the visible viewport using a body portal', async () => {
  const control = await load('../../client/src/components/FullscreenWorkspaceLayout.tsx');
  assert.match(control, /createPortal\(/);
  assert.match(control, /triggerRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(control, /Math\.min\(rect\.right - width, window\.innerWidth - width - 12\)/);
  assert.match(control, /panelRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(control, /style=\{menuPosition\}/);
  assert.match(control, /window\.addEventListener\('resize', updateOnViewportChange\)/);
  assert.match(control, /window\.addEventListener\('scroll', updateOnViewportChange, true\)/);
  assert.doesNotMatch(control, /fullscreen-mode-picker-menu topbar-dropdown absolute right-0/);
});

test('single fullscreen list and timeline render on the workspace without an enclosing card', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.match(app, /fullscreenDisplayModes\[0\] === 'bubbles' \? '' : 'fullscreen-workspace-single--open'/);
  assert.match(css, /\.fullscreen-workspace-single--open > \.fullscreen-mode-surface \{[^}]*width: calc\(100% - 56px\);[^}]*max-width: none/);
  assert.match(css, /\.fullscreen-workspace-single--open \.fullscreen-mode-surface-content > :is\(\.list-mode-canvas, \.timeline-canvas\) \{[^}]*border: 0 !important;[^}]*border-radius: 0 !important;[^}]*background: transparent !important/);
  assert.match(css, /\.fullscreen-workspace-single--open \.fullscreen-mode-surface\[data-fullscreen-mode='list'\] \.list-mode-canvas/);
});
