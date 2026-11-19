import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createBoundedStringTransformCache } from './boundedStringTransformCache';
import { linkifyNoteHtml, noteHtmlToPlainText, sanitizeNoteHtml } from './notes';

test('note transform cache reuses stable content and invalidates edited inputs', () => {
  const cache = createBoundedStringTransformCache({ maxEntries: 3, maxChars: 300, maxEntryChars: 100 });
  let calls = 0;
  const render = (value: string, kind = 'sanitize') =>
    cache(kind, value, () => `${value}:${++calls}`);

  assert.equal(render('original'), 'original:1');
  assert.equal(render('original'), 'original:1');
  assert.equal(render('modified'), 'modified:2');
  assert.equal(render('original', 'plain'), 'original:3');
  assert.equal(render('original'), 'original:1');
  assert.equal(calls, 3);
});

test('note transform cache evicts least recently used entry and limits memory', () => {
  const cache = createBoundedStringTransformCache({ maxEntries: 2, maxChars: 100, maxEntryChars: 60 });
  let calls = 0;
  const render = (source: string) => cache('html', source, () => String(++calls));
  assert.equal(render('first'), '1');
  assert.equal(render('second'), '2');
  assert.equal(render('first'), '1'); // Refresh LRU order.
  assert.equal(render('third'), '3');
  assert.equal(render('second'), '4'); // Second was evicted.

  const memoryLimited = createBoundedStringTransformCache({ maxEntries: 10, maxChars: 14, maxEntryChars: 14 });
  let attempts = 0;
  const renderLong = (source: string) => memoryLimited('t', source, () => String(++attempts).repeat(6));
  assert.equal(renderLong('one'), '111111');
  assert.equal(renderLong('two'), '222222');
  assert.equal(renderLong('one'), '333333'); // Shared character budget evicted first.
  assert.equal(renderLong('oversized-source-string'), '444444');
  assert.equal(renderLong('oversized-source-string'), '555555'); // Large entries never cached.
});

test('failed transformations are never cached', () => {
  const cache = createBoundedStringTransformCache({ maxEntries: 2, maxChars: 100, maxEntryChars: 50 });
  assert.throws(() => cache('html', 'bad', () => { throw new Error('unsafe'); }), /unsafe/);
  assert.equal(cache('html', 'bad', () => 'safe'), 'safe');
  assert.equal(cache('html', 'bad', () => { throw new Error('should be cached'); }), 'safe');
});

test('plain notes never instantiate DOM parser; entities, markup and links still use sanitizer', () => {
  const globalDocument = globalThis as unknown as { document?: Document };
  const originalDocument = globalDocument.document;
  globalDocument.document = {
    createElement: () => { throw new Error('DOM path required'); }
  } as unknown as Document;

  try {
    assert.equal(sanitizeNoteHtml('Простая заметка 123'), 'Простая заметка 123');
    assert.equal(linkifyNoteHtml('Текст без ссылок'), 'Текст без ссылок');
    assert.equal(noteHtmlToPlainText('Строка 1\nСтрока 2  '), 'Строка 1\nСтрока 2');
    assert.equal(noteHtmlToPlainText('Текст   ', { trimEnd: false }), 'Текст   ');
    assert.throws(() => sanitizeNoteHtml('<img src=x onerror=alert(1)>'), /DOM path required/);
    assert.throws(() => sanitizeNoteHtml('A &amp; B'), /DOM path required/);
    assert.throws(() => linkifyNoteHtml('https://example.org'), /DOM path required/);
    assert.throws(() => noteHtmlToPlainText('<b>formatted</b>'), /DOM path required/);
  } finally {
    if (originalDocument === undefined) delete globalDocument.document;
    else globalDocument.document = originalDocument;
  }
});

test('HTML security path stays intact while React previews are memoized', () => {
  const notesSource = readFileSync(new URL('./notes.ts', import.meta.url), 'utf8');
  const componentSource = readFileSync(new URL('../components/LinkifiedText.tsx', import.meta.url), 'utf8');
  assert.match(notesSource, /sanitizeElement\(wrapper\)/);
  assert.match(notesSource, /element\.removeAttribute\(attribute\.name\)/);
  assert.match(notesSource, /return sanitizeNoteHtml\(wrapper\.innerHTML\)/);
  assert.match(notesSource, /wrapper\.innerHTML = sanitizeNoteHtml\(value\)/);
  assert.match(componentSource, /export const LinkifiedText = memo\(function LinkifiedText/);
  assert.match(componentSource, /const content = useMemo\(/);
  assert.match(componentSource, /createFormattedNoteParts\(value, handleLinkClick\)/);
  assert.doesNotMatch(componentSource, /dangerouslySetInnerHTML/);
});
