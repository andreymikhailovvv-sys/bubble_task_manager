import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('fullscreen toolbar remains one row, ordered, taller and inset from viewport', async () => {
  const [app, css] = await Promise.all([load('../../client/src/App.tsx'), load('../../client/src/styles.css')]);
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const end = app.indexOf('</header>', start);
  const header = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  const order = ['Планировыч AI', '<WorkspaceGlobalSearch', '<FullscreenModePicker',
    'className="fullscreen-create-control', '{renderOverdueControl()}',
    '{renderCreditsControl()}', '<TelegramIntegrationsMenu', 'href="/about"',
    'className="auth-actions"', 'data-tour="fullscreen-workspace-settings"', 'data-tour="bubbles-fullscreen-exit"'];
  let pos = -1;
  for (const part of order) {
    const next = header.indexOf(part);
    assert.ok(next > pos, part);
    pos = next;
  }
  assert.doesNotMatch(header, /<FullscreenAddWindowMenu/);
  assert.match(css, /\.app-shell\.bubble-fullscreen-shell > \.fullscreen-workspace-toolbar--one-row \{[^}]*min-height: 72px/);
  assert.match(css, /margin-top: 18px/);
  assert.match(css, /--fullscreen-workspace-width: calc\(100vw - clamp\(32px, 4vw, 80px\)\)/);
});

test('three checkboxes remain separate from new side-rail menu', async () => {
  const controls = await load('../../client/src/components/FullscreenWorkspaceLayout.tsx');
  const picker = controls.slice(controls.indexOf('export function FullscreenModePicker'), controls.indexOf('export type FullscreenTaskChoice'));
  assert.match(picker, /VIEW_OPTIONS\.map/);
  assert.match(picker, /<input type="checkbox"/);
  assert.match(picker, /checked=\{selected\}/);
  assert.doesNotMatch(picker, /createPortal|aria-haspopup/);
  assert.match(controls, /fullscreen-workspace-single-rail/);
  assert.match(controls, /export function FullscreenWorkspaceSplit/);
});