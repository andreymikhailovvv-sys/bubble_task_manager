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
  assert.match(toolbar, /miniapp-utility-menu-label">Рейтинг<\/span>/);
  assert.match(toolbar, /miniapp-utility-menu-value">\{formattedEfficiencyScore\}\/100/);
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


test('timeline toolbar tiles match list height and overflow menu is consistently aligned', async () => {
  const [mini, css] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/styles.css')
  ]);
  const start = css.indexOf('/* Timeline top controls: three independent surfaces');
  assert.ok(start >= 0);
  const toolbarCss = css.slice(start);

  // All three timeline controls are 2.75rem, the same as the list toolbar.
  assert.match(toolbarCss, /\.miniapp-timeline-topbar \.miniapp-global-search-field \{\s*height: 2\.75rem;\s*min-height: 2\.75rem;/);
  assert.match(toolbarCss, /\.miniapp-timeline-topbar \.miniapp-global-search-field input \{ height: 2\.65rem; \}/);
  assert.match(toolbarCss, /\.miniapp-timeline-postpone-button,[\s\S]*?\.miniapp-timeline-more-toggle \{[\s\S]*?min-height: 2\.75rem;/);
  assert.match(toolbarCss, /\.miniapp-timeline-more-toggle \{\s*width: 2\.75rem;/);
  assert.match(toolbarCss, /\.miniapp-workspace-utilities\.is-list \.miniapp-credit-badge,[\s\S]*?height: 2\.75rem;/);

  assert.match(mini, /miniapp-utility-menu-label">Рейтинг<\/span>/);
  assert.match(mini, /miniapp-utility-menu-value">\{formattedEfficiencyScore\}\/100/);
  assert.match(mini, /miniapp-utility-menu-value' : undefined\}>\{aiCredits\}/);
  assert.match(toolbarCss, /grid-template-columns: 1\.7rem minmax\(0, 1fr\) auto;/);
  assert.match(toolbarCss, /\.miniapp-utility-menu-value \{[\s\S]*?font-variant-numeric: tabular-nums;/);
  assert.match(toolbarCss, /\.miniapp-timeline-view-switch button:first-child \{\s*border-radius: \.95rem \.72rem \.72rem \.95rem;/);
  assert.match(toolbarCss, /\.miniapp-timeline-view-switch button:last-child \{\s*border-radius: \.72rem \.95rem \.95rem \.72rem;/);
  assert.match(toolbarCss, /\.miniapp-timeline-view-switch \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
});


test('light toolbar has independent tiles and overflow rows are uniform across both themes', async () => {
  const css = await read('../../client/src/styles.css');
  const marker = css.indexOf('/* Light Mini App: the toolbar is only a layout row');
  assert.ok(marker >= 0, 'light theme overrides should be declared after shared toolbar styles');
  const fixes = css.slice(marker);

  // No white parent strip between separately rounded search, postpone and overflow tiles.
  assert.match(fixes, /miniapp-shell\.miniapp-light \.miniapp-premium-topbar\.miniapp-timeline-topbar/);
  assert.match(fixes, /body\[data-theme='light'\] \.miniapp-shell \.miniapp-premium-topbar\.miniapp-timeline-topbar/);
  assert.match(fixes, /background: transparent !important;/);
  assert.match(fixes, /miniapp-premium-topbar-slot/);

  // The list's credit balance regains the pink accent of the existing badge.
  assert.match(fixes, /miniapp-workspace-utilities\.is-list \.miniapp-credit-badge/);
  assert.match(fixes, /background: #fdf2f8;/);
  assert.match(fixes, /color: #be185d;/);

  // Every overflow row is a separate card; no special white first row.
  assert.match(fixes, /miniapp-workspace-utilities\.is-timeline \.miniapp-workspace-utilities-panel > button \{/);
  assert.match(fixes, /background: #263a56;/);
  assert.match(fixes, /background: #eef2f7;/);
  assert.match(fixes, /gap: \.38rem;/);
  assert.match(fixes, /border-radius: \.83rem;/);
  assert.match(fixes, /prefers-reduced-motion: reduce/);
});
