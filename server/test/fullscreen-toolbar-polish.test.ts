import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('fullscreen toolbar retains text labels, settings and account management', async () => {
  const [app, css] = await Promise.all([load('../../client/src/App.tsx'),load('../../client/src/styles.css')]);
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const header = app.slice(start,app.indexOf('</header>',start));
  for (const part of ['/icon.png','Планировыч AI','<TelegramIntegrationsMenu','О сервисе','onClick={openProfileModal}',
    'className="auth-login-button"','className="auth-register-button"','className="auth-logout-button"',
    'data-tour="fullscreen-workspace-settings"','data-tour="bubbles-fullscreen-exit"']) assert.ok(header.includes(part),part);
  assert.match(css, /@media \(min-width: 1200px\)/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \.auth-logout-button::before \{\s*content: none;/);
  assert.match(css, /\.fullscreen-mode-picker \.fullscreen-mode-picker-option \{[^}]*gap: 8px;[^}]*padding: 8px 12px;/);
});

test('bubbles retain sector switching, viewport filters and compact split placement', async () => {
  const [app,css]=await Promise.all([load('../../client/src/App.tsx'),load('../../client/src/styles.css')]);
  assert.match(app, /className="fullscreen-bubble-mode-switch/);
  assert.match(app, /mode === 'global' \? <CircleIcon/);
  assert.match(app, /<FullscreenPaneFilters mode=\{workspaceMode\}/);
  assert.match(css, /\.fullscreen-mode-surface\[data-fullscreen-mode='bubbles'\] \.fullscreen-bubble-mode-switch \{[^}]*top: 62px/);
  assert.match(app, /compact=\{isBubbleFullscreen && fullscreenPanels\.length === 2\}/);
});

test('single list and timeline remain unframed, and Planik moves with real chat', async () => {
  const [app,css,chat,controls]=await Promise.all([
    load('../../client/src/App.tsx'),load('../../client/src/styles.css'),
    load('../../client/src/components/ExpandedAiChat.tsx'),load('../../client/src/components/FullscreenWorkspaceLayout.tsx')
  ]);
  assert.match(controls, /fullscreen-workspace-single--open/);
  assert.match(css, /\.fullscreen-workspace-single--open \.fullscreen-mode-surface-content > :is\(\.list-mode-canvas, \.timeline-canvas\)/);
  assert.match(app, /!hasGeneralAiPane \? <QuickAiLauncherFrame/);
  assert.match(app, /inlineTarget=\{hasGeneralAiPane \? fullscreenChatTarget : null\}/);
  assert.match(chat, /showPlanik \? <div className="planik-composer-float"/);
  assert.match(css, /\.ai-chat-expanded-backdrop\.ai-chat-expanded-embedded/);
});

test('turquoise period selection leaves sector checkboxes purple',async()=>{
  const css=await load('../../client/src/styles.css');
  const at=css.lastIndexOf('.fullscreen-pane-filter-time.is-active {');
  assert.ok(at>=0);
  assert.match(css.slice(at,css.indexOf('}',at)),/#06b6d4/);
  assert.match(css,/\.fullscreen-pane-filter-sector input \{[^}]*accent-color: #8b5cf6/);
});