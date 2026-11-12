import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('fullscreen checkboxes support two distinct views without cloning implementations', async () => {
  const [app, controls] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenWorkspaceLayout.tsx')
  ]);
  assert.match(app, /const \[fullscreenDisplayModes, setFullscreenDisplayModes\] = useState<DisplayMode\[]>\(\['bubbles'\]\)/);
  assert.match(app, /<FullscreenModePicker modes=\{fullscreenDisplayModes\}/);
  assert.match(app, /fullscreenDisplayModes\.length === 2 \? \(/);
  assert.match(app, /<FullscreenWorkspaceSplit[\s\S]*?renderMode=\{renderWorkspaceMode\}/);
  assert.match(app, /const renderWorkspaceMode = \(workspaceMode: DisplayMode\): ReactNode/);
  assert.equal((app.match(/<BubbleField\b/g) ?? []).length, 1);
  assert.match(controls, /modes\.length === 2/);
  assert.match(controls, /onChange\(\[modes\[0\], value\]\)/);
  assert.match(controls, /if \(modes\.length > 1\) onChange\(modes\.filter/);
  assert.match(controls, /<input type="checkbox"/);
  assert.match(controls, /checked=\{selected\}/);
});

test('credits, overdue and exit controls remain functional', async () => {
  const app = await load('../../client/src/App.tsx');
  assert.match(app, /const renderOverdueControl = \(\) => \(/);
  assert.match(app, /timelineOverdueTasks\.map\(task =>/);
  assert.match(app, /postponeAllOverdueToToday/);
  assert.match(app, /postponeAllOverdueByAi/);
  assert.match(app, /const renderCreditsControl = \(\) => \(/);
  assert.match(app, /setIsSubscriptionModalOpen\(true\)/);
  const start = app.indexOf('data-tour="bubbles-fullscreen-toolbar"');
  const header = app.slice(start, app.indexOf('</header>', start));
  assert.match(header, /\{renderOverdueControl\(\)\}/);
  assert.match(header, /\{renderCreditsControl\(\)\}/);
  assert.match(header, /setIsBubbleFullscreen\(false\)/);
  assert.match(header, /data-tour="bubbles-fullscreen-exit"/);
  assert.match(app, /data-tour="workspace-fullscreen-enter"/);
  assert.match(app, /setFullscreenDisplayModes\(\[displayMode\]\)/);
});

test('split remains draggable and keyboard accessible, all modes use bounded widths', async () => {
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
  assert.match(styles, /\.fullscreen-workspace-split \{[^}]*grid-template-columns/);
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.fullscreen-workspace-split \{[\s\S]*?grid-template-rows/);
  assert.match(app, /fullscreen-workspace-single--open/);
  assert.match(styles, /\.fullscreen-workspace-single--open > \.fullscreen-mode-surface \{\s*width: 100%;\s*max-width: 100%;/);
  assert.match(bubbles, /compact\s*\?\s*`\$\{BUBBLE_WORKSPACE_X - 32\}/);
  assert.match(app, /compact=\{isBubbleFullscreen && fullscreenDisplayModes\.length === 2\}/);
});
