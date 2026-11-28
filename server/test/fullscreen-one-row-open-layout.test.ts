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
    'className="auth-actions"', 'data-tour="fullscreen-workspace-settings"'];
  let pos = -1;
  for (const part of order) {
    const next = header.indexOf(part);
    assert.ok(next > pos, part);
    pos = next;
  }
  assert.match(header, /<FullscreenBlockMenu/);
  assert.doesNotMatch(header, /bubbles-fullscreen-exit/);
  assert.match(css, /\.app-shell\.bubble-fullscreen-shell > \.fullscreen-workspace-toolbar--one-row \{[^}]*min-height: 72px/);
  assert.match(css, /margin-top: 18px/);
  assert.match(css, /--fullscreen-workspace-width: calc\(100vw - clamp\(32px, 4vw, 80px\)\)/);
});

test('single mode selector remains separate from side-rail menu', async () => {
  const controls = await load('../../client/src/components/FullscreenWorkspaceLayout.tsx');
  const picker = controls.slice(controls.indexOf('export function FullscreenModePicker'), controls.indexOf('export type FullscreenTaskChoice'));
  assert.match(picker, /VIEW_OPTIONS\.map/);
  assert.doesNotMatch(picker, /<input type="checkbox"/);
  assert.match(picker, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(picker, /createPortal|aria-haspopup/);
  assert.match(controls, /fullscreen-workspace-single-rail/);
  assert.match(controls, /export function FullscreenWorkspaceSplit/);
});

test('multi-pane view is the only reachable web workspace, including lessons', async () => {
  const app = await load('../../client/src/App.tsx');
  assert.ok(app.includes('const [isBubbleFullscreen, setIsBubbleFullscreen] = useState(true);'));
  assert.doesNotMatch(app, /setIsBubbleFullscreen\(false\)|data-tour="bubbles-fullscreen-exit"|data-tour="workspace-fullscreen-enter"/);
});

test('left updates button reuses training and news, without increasing toolbar dimensions', async () => {
  const [app, css] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css')
  ]);
  const toolbar = app.slice(app.indexOf('data-tour="bubbles-fullscreen-toolbar"'),
    app.indexOf('</header>', app.indexOf('data-tour="bubbles-fullscreen-toolbar"')));
  assert.ok(toolbar.indexOf('className="updates-menu-trigger fullscreen-updates-trigger') <
    toolbar.indexOf('src="/icon.png"'));
  assert.ok(toolbar.includes('onClick={() => setIsUpdatesOpen(true)}'));
  assert.ok(toolbar.includes('hasUnreadNews'));
  assert.ok(app.includes('<UpdatesMenu open={isUpdatesOpen}'));
  assert.ok(css.includes('.fullscreen-workspace-toolbar-main > .fullscreen-updates-trigger'));
  assert.ok(css.includes('flex: 0 0 36px'));
});

test('opened modals mask workspace pluses and filters, but not inline task panes', async () => {
  const [app, css, launcher] = await Promise.all([
    load('../../client/src/App.tsx'), load('../../client/src/styles.css'),
    load('../../client/src/components/QuickAiLauncherFrame.tsx')
  ]);
  assert.ok(app.includes('const workspaceOverlayActive = Boolean('));
  assert.ok(app.includes('(focusedTask && !embeddedFocusActive)'));
  assert.ok(app.includes('!workspaceOverlayActive ? ('));
  assert.ok(app.includes("'fullscreen-overlay-active'"));
  assert.ok(css.includes('.bubble-fullscreen-shell.fullscreen-overlay-active .fullscreen-workspace-divider > .fullscreen-add-window'));
  assert.ok(css.includes('.bubble-fullscreen-shell.fullscreen-overlay-active .fullscreen-pane-filters-anchor'));
  assert.ok(app.includes("embeddedTaskFocus={embeddedFocusActive && fullscreenPanels[1]?.kind === 'task-ai' && !hasGeneralAiPane}"));
  assert.ok(launcher.includes("embeddedTaskFocus?'ai-chat-launcher-task-embedded':''"));
  assert.ok(css.includes('.ai-chat-launcher.bubble-ai-fullscreen.ai-chat-launcher-task-embedded'));
});

test('task search shows caret without an input focus ring', async () => {
  const [control, css] = await Promise.all([
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.ok(control.includes('placeholder="Поиск по задачам"'));
  assert.ok(css.includes('.fullscreen-add-window-search input:focus-visible'));
  assert.ok(css.includes('--tw-ring-shadow: none !important;'));
  assert.ok(css.includes('.fullscreen-add-window-search:focus-within'));
});
