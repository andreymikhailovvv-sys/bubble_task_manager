import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Mini App and compact mobile web month cells provide one full-cell day tap target', async () => {
  const [mini, styles, entry] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/main.tsx', import.meta.url), 'utf8')
  ]);

  // Telegram Mini App and the narrow mobile website share this same component.
  assert.match(entry, /<MiniApp runtime="telegram"/);
  assert.match(entry, /<MiniApp runtime="web"/);

  const monthCellStart = mini.indexOf('<div key={dateKey} className={`miniapp-calendar-day');
  const monthCellEnd = mini.indexOf('</div>', mini.indexOf('miniapp-calendar-more', monthCellStart));
  assert.ok(monthCellStart > -1 && monthCellEnd > monthCellStart);
  const cell = mini.slice(monthCellStart, monthCellEnd);

  // The absolute hit area exists for EVERY month cell, not only the date number.
  assert.match(cell, /timelineView === 'month' && \(\s*<button type="button" className="miniapp-calendar-cell-hitarea"/);
  assert.match(cell, /onClick=\{\(\) => openDayTimeline\(date\)\}/);
  assert.match(cell, /aria-label=\{`Открыть таймлайн на /);

  // No month task chip can swallow the click or launch the task dialog.
  assert.match(cell, /return timelineView === 'month' \? \(\s*<span key=\{entry\.id\} className=\{entryClassName\} style=\{entryStyle\}>/);
  assert.doesNotMatch(cell, /stopPropagation\(/);
  assert.match(cell, /\) : \(\s*<button key=\{entry\.id\} type="button" className=\{entryClassName\}/);
  assert.match(cell, /onClick=\{\(\) => 'task' in entry \?/);

  // It fills the complete grid cell and remains above dates and task previews.
  assert.match(styles, /\.miniapp-calendar-grid-month \.miniapp-calendar-day \{ position: relative;/);
  const hitArea = styles.match(/\.miniapp-calendar-grid-month \.miniapp-calendar-cell-hitarea \{([^}]+)\}/)?.[1] ?? '';
  for (const property of [/position: absolute;/, /z-index: 1;/, /inset: 0;/, /width: 100%;/, /height: 100%;/, /background: transparent;/, /touch-action: manipulation;/]) {
    assert.match(hitArea, property);
  }
  assert.match(styles, /\.miniapp-calendar-grid-month \.miniapp-calendar-cell-hitarea:focus-visible/);
});
