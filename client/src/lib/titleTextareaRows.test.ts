import assert from 'node:assert/strict';
import test from 'node:test';
import { measureTitleTextareaRows } from './titleTextareaRows';

test('title field expands to 1, 2 or 3 rows without losing its previous attributes', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const globals = globalThis as unknown as { window: unknown; document: unknown };
  try {
    globals.window = {
      getComputedStyle: () => ({ lineHeight: '36px', paddingTop: '0px', paddingBottom: '0px' })
    };
    globals.document = { activeElement: null };
    for (const [height, expected] of [[38, 1], [74, 2], [110, 3], [146, 3]]) {
      const element = {
        rows: 2,
        style: { minHeight: '4rem', maxHeight: '8rem' },
        scrollHeight: height,
        scrollTop: 20,
        scrollLeft: 5
      } as unknown as HTMLTextAreaElement;
      assert.equal(measureTitleTextareaRows(element), expected);
      assert.equal(element.rows, 2);
      assert.equal(element.style.minHeight, '4rem');
      assert.equal(element.style.maxHeight, '8rem');
      assert.equal(element.scrollTop, 0);
      assert.equal(element.scrollLeft, 0);
    }
  } finally {
    globals.window = originalWindow;
    globals.document = originalDocument;
  }
});
