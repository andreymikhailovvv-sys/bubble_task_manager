import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Mini App and compact mobile web month cells open the selected day, except task chips', async () => {
  const [mini, styles] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);

  // Both compact surfaces render MiniApp. Only month cells receive a cell-level action.
  assert.match(mini, /timelineView === 'month' \? \{\s*role: 'button' as const,\s*tabIndex: 0,/);
  assert.match(mini, /'aria-label': .*Открыть таймлайн на /);
  assert.match(mini, /onClick: \(\) => openDayTimeline\(date\)/);
  assert.match(mini, /onKeyDown: \(event: ReactKeyboardEvent<HTMLDivElement>\) => \{/);
  assert.match(mini, /event\.target !== event\.currentTarget/);
  assert.match(mini, /event\.key === 'Enter' \|\| event\.key === ' '/);

  // Month date is not a nested button; tapping it delegates to the whole cell.
  assert.match(mini, /timelineView === 'month' \? \(\s*<span className="miniapp-calendar-date" aria-hidden="true">/);

  // Month entries are inert spans that absorb taps, while week entries still open tasks.
  assert.match(mini, /return timelineView === 'month' \? \(\s*<span key=\{entry\.id\} className=\{entryClassName\} style=\{entryStyle\} onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(mini, /\) : \(\s*<button key=\{entry\.id\} type="button" className=\{entryClassName\}/);
  assert.match(mini, /onClick=\{\(\) => 'task' in entry \?/);

  assert.match(styles, /\.miniapp-calendar-grid-month \.miniapp-calendar-day:focus-visible/);
  assert.match(styles, /\.miniapp-calendar-grid-month \.miniapp-calendar-entry \{ cursor: default; \}/);
});
