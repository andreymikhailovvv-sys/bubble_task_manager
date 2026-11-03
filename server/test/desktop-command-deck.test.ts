import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('desktop workspace uses independent command cards and keeps existing actions and tutorial entry', async () => {
  const [app, css, mini] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/styles.css'),
    read('../../client/src/MiniApp.tsx')
  ]);
  const begin = app.indexOf('className="top-control-bar workspace-command-deck');
  const finish = app.indexOf('</section> : null}', begin);
  assert.ok(begin >= 0 && finish > begin, 'desktop command deck exists');
  const deck = app.slice(begin, finish);
  const ordered = [
    'workspace-command-menu', 'workspace-command-modes',
    'workspace-command-filters', 'workspace-command-metrics',
    'workspace-command-actions', 'workspace-command-settings'
  ];
  for (const item of ordered) assert.match(deck, new RegExp(item));
  for (const [i, name] of ordered.entries()) {
    if (i > 0) assert.ok(deck.indexOf(ordered[i - 1]) < deck.indexOf(name), 'cards preserve visual hierarchy');
  }
  const preserved = [
    'updates-menu-trigger', 'setIsUpdatesOpen(true)', 'hasUnreadNews',
    'data-tour="display-modes"', 'setDisplayMode(option.value)',
    'data-tour="workspace-filters"', 'setIsSphereFilterOpen',
    'toggleSphereSelection', 'setTimeFilter', 'setRankingMode',
    'ref={efficiencyDetailsRef}', 'setIsEfficiencyDetailsOpen',
    'data-tour="credits"', "setCreditModalView('purchase')",
    'ref={overduePopoverRef}', 'topbar-overdue-popover',
    'postponeAllOverdueToToday', 'postponeAllOverdueByAi',
    'data-tour="feature-focus-button"', 'openFocusSetup',
    'data-tour="create-task"', 'setIsAddMenuOpen',
    'data-tour="create-event"', 'data-tour="create-sector"',
    'ref={settingsMenuRef}', 'setIsSettingsOpen'
  ];
  for (const marker of preserved) assert.ok(deck.includes(marker), 'preserves '+marker);
  for (const cls of ['workspace-command-tile', 'workspace-command-caption', 'workspace-command-action-row']) {
    assert.ok(css.includes('.'+cls), 'style present '+cls);
  }
  assert.match(css, /\.top-control-bar\.workspace-command-deck \{[\s\S]*?display: grid;/);
  assert.match(css, /@media \(max-width: 1649px\) and \(min-width: 1181px\)/);
  assert.match(css, /@media \(max-width: 1180px\) and \(min-width: 961px\)/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /body\[data-theme='light'\] \.workspace-command-deck/);
  assert.match(css, /body\[data-theme='dark'\] \.workspace-command-deck/);
  assert.ok(!mini.includes('workspace-command-deck'), 'Telegram Mini App is unchanged');
});
