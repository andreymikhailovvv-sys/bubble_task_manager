import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('Timeline events and reminders cannot leak into Bubbles or List when modes are split', async () => {
  const app = await load('../../client/src/App.tsx');
  assert.match(app, /const activeTasks = useMemo\(\(\) => rootTasks\.filter\(\(task\) => task\.status !== 'DONE' && task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
  assert.match(app, /filterWorkspaceTasks\(activeTasks, fullscreenPaneFilters\.bubbles\)/);
  assert.match(app, /filterWorkspaceTasks\(activeTasks, fullscreenPaneFilters\.list\)/);
  assert.match(app, /filterWorkspaceTasks\(activeTimelineItems,/);
  assert.match(app, /tasks=\{isBubbleFullscreen \? fullscreenBubbleTasks : visibleTasks\}/);
  assert.match(app, /const fullscreenListTasks = sortWorkspaceList\(fullscreenListTasksFiltered\)/);
  assert.match(app, /const timelineRootTasks = \[\.\.\.timelineFilteredRootTasks\]/);
  assert.doesNotMatch(app, /\(isTimelineMode \? activeTimelineItems : activeTasks\)\.filter/);
  assert.doesNotMatch(app, /const effectiveTimeFilter = isTimelineMode/);
});

test('each fullscreen mode owns filters for sectors and time, including the timeline subtask feed', async () => {
  const [app, filter] = await Promise.all([
    load('../../client/src/App.tsx'),
    load('../../client/src/components/FullscreenPaneFilters.tsx')
  ]);
  assert.match(app, /useState<Record<DisplayMode, WorkspacePaneFilter>>\(/);
  assert.match(app, /bubbles: createDefaultWorkspacePaneFilter\(\)/);
  assert.match(app, /list: createDefaultWorkspacePaneFilter\(\)/);
  assert.match(app, /timeline: createDefaultWorkspacePaneFilter\(\)/);
  for (const mode of ['bubbles', 'list', 'timeline']) {
    assert.match(app, new RegExp('fullscreenPaneFilters\\.' + mode));
  }
  assert.match(app, /<FullscreenPaneFilters mode=\{workspaceMode\} filter=\{fullscreenPaneFilters\[workspaceMode\]\}/);
  assert.match(app, /updateFullscreenPaneFilters\(workspaceMode, next\)/);
  assert.match(app, /allowedFullscreenTimelineSubtaskIds/);
  assert.match(app, /filterWorkspaceTasks\(timelineSubtasksForPreview, fullscreenPaneFilters\.timeline, ''\)/);
  assert.match(app, /filter\.sphereIds !== null && \(!sectorId \|\| !filter\.sphereIds\.includes\(sectorId\)\)/);
  assert.match(filter, /aria-label=\{\x60Фильтры режима/);
  assert.match(filter, /aria-haspopup="dialog" aria-expanded=\{open\}/);
  assert.match(filter, /filter\.timeFilter/);
  assert.match(filter, /filter\.sphereIds === null/);
  assert.match(filter, /createPortal\(/);
  const header = app.slice(app.indexOf('data-tour="bubbles-fullscreen-toolbar"'), app.indexOf('</header>', app.indexOf('data-tour="bubbles-fullscreen-toolbar"')));
  assert.doesNotMatch(header, /data-sphere-filter-root/);
  assert.doesNotMatch(header, /value=\{timeFilter\}/);
});

test('split bubbles display the same fixed Timeline-style hover card outside their clipped SVG canvas', async () => {
  const [bubbles, css] = await Promise.all([
    load('../../client/src/components/BubbleField.tsx'),
    load('../../client/src/styles.css')
  ]);
  assert.match(bubbles, /compact && hoveredBubble && compactHoverPoint/);
  assert.match(bubbles, /timeline-hover-card pointer-events-none fixed/);
  assert.match(bubbles, /noteHtmlToPlainText\(hoveredBubble\.task\.description/);
  assert.match(bubbles, /hoveredSubtasks\.slice\(0, 3\)/);
  assert.match(bubbles, /createPortal\([\s\S]*?document\.body/);
  assert.match(bubbles, /setCompactHoverPoint\(null\)/);
  assert.match(css, /\.timeline-hover-card \{/);
  assert.match(css, /\.fullscreen-pane-filter-popover \{/);
});
