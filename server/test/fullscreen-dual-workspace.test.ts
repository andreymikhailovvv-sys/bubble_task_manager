import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('fullscreen mode dropdown supports two distinct views without duplicating the workspace implementation', async () => {
  const [app, controls] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx')
  ]);
  assert.match(app, /const \[fullscreenDisplayModes, setFullscreenDisplayModes\] = useState<DisplayMode\[]>\(\['bubbles'\]\)/);
  assert.match(app, /<FullscreenModePicker modes=\{fullscreenDisplayModes\}/);
  assert.match(app, /fullscreenDisplayModes\.length === 2 \? \(/);
  assert.match(app, /<FullscreenWorkspaceSplit[\s\S]*?renderMode=\{renderWorkspaceMode\}/);
  assert.match(app, /const renderWorkspaceMode = \(workspaceMode: DisplayMode\): ReactNode/);
  assert.equal((app.match(/<BubbleField\b/g) ?? []).length, 1,
    'split mode renders the same interactive bubble field rather than cloning its JSX');
  assert.match(controls, /modes\.length === 2/);
  assert.match(controls, /onChange\(\[modes\[0\], value\]\)/);
  assert.match(controls, /if \(modes\.length > 1\) onChange\(modes\.filter/);
  assert.match(controls, /aria-pressed=\{selected\}/);
  assert.match(controls, /aria-expanded=\{open\}/);
});

test('fullscreen has the existing credits and overdue actions plus a functional exit control', async () => {
  const app = await load('../../client/src/App.tsx');
  assert.match(app, /const renderOverdueControl = \(\) => \(/);
  assert.match(app, /timelineOverdueTasks\.map\(task =>/);
  assert.match(app, /postponeAllOverdueToToday/);
  assert.match(app, /postponeAllOverdueByAi/);
  assert.match(app, /const renderCreditsControl = \(\) => \(/);
  assert.match(app, /setIsSubscriptionModalOpen\(true\)/);
  const header = app.slice(app.indexOf('data-tour="bubbles-fullscreen-toolbar"'),
    app.indexOf('</header>', app.indexOf('data-tour="bubbles-fullscreen-toolbar"')));
  assert.match(header, /\{renderOverdueControl\(\)\}/);
  assert.match(header, /\{renderCreditsControl\(\)\}/);
  assert.match(header, /setIsBubbleFullscreen\(false\)/);
  assert.match(header, /data-tour="bubbles-fullscreen-exit"/);
  assert.match(app, /data-tour="workspace-fullscreen-enter"/);
  assert.match(app, /setFullscreenDisplayModes\(\[displayMode\]\)/);
});

test('two panes retain keyboard-accessible resizer; single list and timeline fill the workspace', async () => {
  const [app, controls, styles, bubbles] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx'),
    load('../../client/src/styles.css'),
    load('../../client/src/components/BubbleField.tsx')
  ]);
  assert.match(controls, /role="separator" tabIndex=\{0\}/);
  assert.match(controls, /setPointerCapture\(event\.pointerId\)/);
  assert.match(controls, /root\.style\.setProperty\('--fullscreen-split-ratio'/);
  assert.match(controls, /if \(event\.key === 'Home'\) next = 25/);
  assert.match(controls, /else if \(event\.key === 'End'\) next = 75/);
  assert.match(styles, /\.fullscreen-workspace-single > \.fullscreen-mode-surface \{/);
  assert.match(styles, /\.fullscreen-workspace-split \{[^}]*grid-template-columns/m);
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.fullscreen-workspace-split \{[\s\S]*?grid-template-rows/);
  assert.match(app, /<div className="fullscreen-workspace-single">/);
  assert.doesNotMatch(app, /fullscreenDisplayModes\[0\] !== 'bubbles' \? 'fullscreen-workspace-single--framed'/);
  assert.match(bubbles, /compact\s*\?\s*`\$\{BUBBLE_WORKSPACE_X - 32\}/);
  assert.match(app, /compact=\{isBubbleFullscreen && fullscreenDisplayModes\.length === 2\}/);
});
