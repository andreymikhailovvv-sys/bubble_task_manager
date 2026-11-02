import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('timeline top row has separate search, postpone and expandable utilities, not optimize or filters', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const start = mini.indexOf('<section ref={searchBarPanelRef}');
  const end = mini.indexOf('</section>', start);
  const toolbar = mini.slice(start, end);
  assert.ok(start > -1 && end > start);
  assert.match(toolbar, /miniapp-workspace-topbar-row/);
  assert.match(toolbar, /<WorkspaceGlobalSearch/);
  assert.match(toolbar, /displayMode === 'timeline' \? \(/);
  assert.match(toolbar, /miniapp-timeline-postpone-button/);
  assert.match(toolbar, /onClick=\{\(\) => void postponeAllOverdueToToday\(\)\}/);
  assert.match(toolbar, /miniapp-timeline-more-toggle/);
  assert.match(toolbar, /aria-expanded=\{isTimelineMoreOpen\}/);
  assert.match(toolbar, /miniapp-workspace-utilities-panel/);
  assert.match(toolbar, /Кредиты/);
  assert.match(toolbar, /Рейтинг · \{formattedEfficiencyScore\}/);
  assert.match(toolbar, /Настройки/);
  assert.match(css, /\.miniapp-premium-topbar\.miniapp-timeline-topbar/);
  assert.match(css, /\.miniapp-workspace-utilities\.is-timeline\.is-open/);

  const sectionStart = mini.indexOf('<section className="miniapp-timeline-section miniapp-timeline-independent-blocks">');
  const navigationStart = mini.indexOf('<div className="miniapp-timeline-navigation">', sectionStart);
  assert.ok(sectionStart > -1 && navigationStart > sectionStart);
  assert.doesNotMatch(mini.slice(sectionStart, navigationStart), /MiniWorkspaceTools|Оптимизировать|Фильтры/);
  assert.match(mini.slice(navigationStart, navigationStart + 600), /miniapp-timeline-view-switch/);
});

test('list retains its original layout, and search focus does not repaint timeline field', async () => {
  const [mini, css, shared] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/components/MiniWorkspaceTools.tsx')
  ]);
  const listStart = mini.indexOf('<div className="miniapp-list-workspace">');
  const timelineStart = mini.indexOf('<section className="miniapp-timeline-section miniapp-timeline-independent-blocks">', listStart);
  assert.ok(listStart > -1 && timelineStart > listStart);
  assert.match(mini.slice(listStart, timelineStart), /<MiniWorkspaceTools/);
  assert.match(shared, /miniapp-workspace-tool-optimize/); // list action preserved
  assert.match(shared, /miniapp-workspace-tool-filter/);
  assert.match(mini, /miniapp-list-topbar/);
  assert.match(css, /\.miniapp-workspace-utilities\.is-list/);
  assert.match(css, /\.miniapp-timeline-topbar \.miniapp-global-search-field:focus-within/);
  assert.match(css, /outline: none !important/);
  assert.match(mini, /setIsSearchBarFloating\(true\)/);
  assert.match(mini, /setIsHeaderVisible\(false\)/);
  assert.match(mini, /miniapp-bottom-navigation/);
  assert.match(mini, /miniapp-native-day-timeline/);
});
