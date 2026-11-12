import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('auxiliary fullscreen panels have typed descriptors and a two-slot resolver', async () => {
  const [types, app] = await Promise.all([
    load('../../client/src/lib/fullscreenWorkspacePanels.ts'),
    load('../../client/src/App.tsx')
  ]);
  for (const kind of ["general-ai", "task-ai", "notes", "upcoming-tasks"]) {
    assert.ok(types.includes(`kind: '${kind}'`), `Missing catalog entry: ${kind}`);
  }
  assert.match(types, /export type FullscreenWorkspacePanel/);
  assert.match(types, /taskId: string \| null/);
  assert.match(types, /function resolveFullscreenPanels\(/);
  assert.match(types, /if \(auxiliary\) return \[primary, auxiliary\]/);
  assert.match(types, /if \(modes\[1\] && modes\[1\] !== modes\[0\]\)/);
  assert.match(app, /const fullscreenPanels = resolveFullscreenPanels\(fullscreenDisplayModes, fullscreenAuxiliaryPanel\)/);
  assert.match(app, /const renderFullscreenPanel = \(panel: FullscreenWorkspacePanel\): ReactNode/);
  assert.match(app, /<FullscreenWorkspaceSplit\s+panels=\{fullscreenPanels as/);
  assert.match(app, /renderPanel=\{renderFullscreenPanel\}/);
});

test('add-window menu exposes four future widgets without opening real chats prematurely', async () => {
  const [controls, app] = await Promise.all([
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/App.tsx')
  ]);
  assert.match(controls, /export function FullscreenAddWindowMenu/);
  assert.match(controls, /aria-label="Добавить окно в рабочее пространство"/);
  assert.match(controls, /FULLSCREEN_AUXILIARY_OPTIONS\.map/);
  assert.match(controls, /onClick=\{\(\) => \{ onAdd\(option\.kind\); setOpen\(false\); \}\}/);
  assert.match(controls, /export function FullscreenFuturePanel/);
  assert.match(controls, /onClick=\{onClose\}/);
  assert.match(app, /<FullscreenAddWindowMenu onAdd=\{\(kind\) => \{/);
  assert.match(app, /setFullscreenAuxiliaryPanel\(createAuxiliaryPanel\(kind\)\)/);
  assert.match(app, /setFullscreenAuxiliaryPanel\(null\)/);
  assert.match(app, /<FullscreenFuturePanel panel=\{panel\}/);
});

test('wider checkboxes and right-side captions are retained on desktop', async () => {
  const css = await load('../../client/src/styles.css');
  assert.match(css, /\.fullscreen-mode-picker \.fullscreen-mode-picker-option \{[^}]*gap: 7px;[^}]*padding: 8px 11px;/);
  assert.match(css, /@media \(min-width: 1200px\) \{[\s\S]*?\.fullscreen-workspace-toolbar--one-row \.integration-menu__trigger \{[^}]*font-size: \.82rem/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \.public-nav-link\[href="\/about"\]::before,[\s\S]*?\.fullscreen-workspace-toolbar--one-row \.auth-logout-button::before \{\s*content: none;/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \.auth-logout-button \{\s*font-size: \.82rem/);
  assert.match(css, /\.fullscreen-add-window-menu \{/);
  assert.match(css, /\.fullscreen-future-panel \{/);
});
