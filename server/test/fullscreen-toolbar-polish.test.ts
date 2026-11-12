import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('fullscreen header shares regular navigation and anchors create task in the centre', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css')
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
  assert.match(header, /className="fullscreen-workspace-toolbar-bottom"/);
  assert.match(header, /className="fullscreen-create-control/);
  assert.match(header, /data-tour="bubbles-fullscreen-create-task"/);
  assert.match(header, /<FullscreenModePicker/);
  assert.match(header, /\{renderOverdueControl\(\)\}/);
  assert.match(header, /\{renderCreditsControl\(\)\}/);
  assert.ok(header.indexOf('className="fullscreen-workspace-toolbar-actions') < header.indexOf('className="fullscreen-create-control'));
  assert.ok(header.indexOf('className="fullscreen-create-control') < header.indexOf('data-tour="bubbles-fullscreen-exit"'));
  assert.match(header, /<Minimize2 size=\{17\} \/>/);
  assert.doesNotMatch(header, /<span>Выйти<\/span>/);
  assert.match(css, /\.fullscreen-workspace-toolbar \{[^}]*max-width: none/);
  assert.match(css, /\.fullscreen-workspace-toolbar-bottom \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
});

test('fullscreen bubbles have a single circle/sectors switch below per-pane filters', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css')
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

test('single list and timeline are balanced; Planik stays at bottom right in every fullscreen mode', async () => {
  const [app, css, frame] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/styles.css'),
    load('../../client/src/components/QuickAiLauncherFrame.tsx')
  ]);
  assert.match(app, /fullscreenDisplayModes\[0\] === 'bubbles' \? '' : 'fullscreen-workspace-single--balanced'/);
  assert.match(css, /\.fullscreen-workspace-single--balanced > \.fullscreen-mode-surface \{[^}]*max-width: min\(1320px, 86vw\)/m);
  assert.match(app, /fullscreenBubbles=\{isBubbleFullscreen\}/);
  assert.doesNotMatch(app, /fullscreenBubbles=\{isBubbleFullscreen && displayMode === 'bubbles'\}/);
  assert.match(frame, /fullscreenBubbles\?'bubble-ai-fullscreen'/);
  assert.match(css, /\.ai-chat-launcher\.bubble-ai-fullscreen \{\s*right: max\(16px, env\(safe-area-inset-right\)\)/);
});

test('time filter selection uses turquoise, leaving sector checkbox tint unchanged', async () => {
  const css = await load('../../client/src/styles.css');
  const pos = css.lastIndexOf('.fullscreen-pane-filter-time.is-active {');
  assert.ok(pos >= 0);
  const active = css.slice(pos, css.indexOf('}', pos));
  assert.match(active, /#06b6d4/);
  assert.doesNotMatch(active, /#8b5cf6/);
  assert.match(css, /\.fullscreen-pane-filter-sector input \{[^}]*accent-color: #8b5cf6/m);
});
