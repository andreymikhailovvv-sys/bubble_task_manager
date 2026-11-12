import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('fullscreen toolbar retains all actions, with modes to the left of the create task', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css')
  ]);
  const begin = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const end = app.indexOf('</header>', begin);
  assert.ok(begin >= 0 && end > begin);
  const header = app.slice(begin, end);
  assert.match(header, /fullscreen-workspace-toolbar-main/);
  assert.match(header, /src="\/icon\.png"/);
  assert.match(header, /Планировыч AI/);
  assert.match(header, /<WorkspaceGlobalSearch/);
  assert.match(header, /<TelegramIntegrationsMenu/);
  assert.match(header, /href="\/about">О сервисе/);
  assert.match(header, /onClick=\{openProfileModal\}/);
  assert.match(header, /className="auth-login-button"/);
  assert.match(header, /className="auth-register-button"/);
  assert.match(header, /className="auth-logout-button"/);
  assert.match(header, /data-tour="fullscreen-workspace-settings"/);
  assert.match(header, /setIsSettingsOpen\(prev => !prev\)/);
  assert.match(header, /fullscreen-workspace-toolbar--one-row/);
  assert.match(header, /className="fullscreen-create-control/);
  assert.match(header, /data-tour="bubbles-fullscreen-create-task"/);
  assert.match(header, /<FullscreenModePicker/);
  assert.match(header, /\{renderOverdueControl\(\)\}/);
  assert.match(header, /\{renderCreditsControl\(\)\}/);
  assert.ok(header.indexOf('<FullscreenModePicker') < header.indexOf('className="fullscreen-create-control'));
  assert.ok(header.indexOf('className="fullscreen-create-control') < header.indexOf('<TelegramIntegrationsMenu'));
  assert.ok(header.indexOf('<TelegramIntegrationsMenu') < header.indexOf('data-tour="bubbles-fullscreen-exit"'));
  assert.doesNotMatch(header, /data-tour="feature-telegram-button"/);
  assert.match(header, /<Minimize2 size=\{17\} \/>/);
  assert.match(css, /\.fullscreen-workspace-toolbar--one-row \{[^}]*flex-flow: row nowrap/);
  assert.match(css, /\.bubble-fullscreen-shell > \.fullscreen-workspace-toolbar--one-row/);
});

test('fullscreen bubbles keep their toggle directly below pane filters', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css')
  ]);
  assert.match(app, /isBubbleFullscreen \? \(\s*<button type="button" data-tour="bubble-layout"/);
  assert.match(app, /className="fullscreen-bubble-mode-switch/);
  assert.match(app, /onClick=\{\(\) => setMode\(previous => previous === 'global' \? 'sectors' : 'global'\)\}/);
  assert.match(app, /mode === 'global' \? <CircleIcon/);
  assert.match(app, /: <PieChart/);
  assert.match(css, /\.fullscreen-mode-surface\[data-fullscreen-mode='bubbles'\] \.fullscreen-bubble-mode-switch \{[^}]*top: 62px;[^}]*right: 14px;/);
  assert.match(css, /\.fullscreen-pane-filters-anchor \{[^}]*top: 14px;/);
  assert.match(app, /<FullscreenPaneFilters mode=\{workspaceMode\}/);
});

test('solo list and timeline stay frameless and bounded; Planik remains in all fullscreen modes', async () => {
  const [app, css, frame] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css'),
    load('../../client/src/components/QuickAiLauncherFrame.tsx')
  ]);
  assert.match(app, /fullscreenDisplayModes\[0\] === 'bubbles' \? '' : 'fullscreen-workspace-single--open'/);
  assert.match(css, /\.fullscreen-workspace-single--open > \.fullscreen-mode-surface \{\s*width: 100%;\s*max-width: 100%;/);
  assert.match(css, /\.fullscreen-workspace-single--open \.fullscreen-mode-surface-content > :is\(\.list-mode-canvas, \.timeline-canvas\) \{[^}]*border: 0 !important/);
  assert.match(css, /\.bubble-fullscreen-shell > \.workspace-shell \{[^}]*width: var\(--fullscreen-workspace-width\)/);
  assert.doesNotMatch(app, /'fullscreen-workspace-single--balanced'/);
  assert.match(app, /fullscreenBubbles=\{isBubbleFullscreen\}/);
  assert.match(frame, /fullscreenBubbles\?'bubble-ai-fullscreen'/);
  assert.match(css, /\.ai-chat-launcher\.bubble-ai-fullscreen \{\s*right: max\(16px, env\(safe-area-inset-right\)\)/);
});

test('time filters remain turquoise independently of sector checkbox styling', async () => {
  const css = await load('../../client/src/styles.css');
  const pos = css.lastIndexOf('.fullscreen-pane-filter-time.is-active {');
  assert.ok(pos >= 0);
  const active = css.slice(pos, css.indexOf('}', pos));
  assert.match(active, /#06b6d4/);
  assert.doesNotMatch(active, /#8b5cf6/);
  assert.match(css, /\.fullscreen-pane-filter-sector input \{[^}]*accent-color: #8b5cf6/m);
});
