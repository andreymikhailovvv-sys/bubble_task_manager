import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiInlineLinks } from './aiInlineLinks';

test('links a plain HTTPS URL, keeping sentence punctuation outside', () => {
  assert.deepEqual(parseAiInlineLinks('Открой https://example.org/path?q=1.')[1], { type: 'link', text: 'https://example.org/path?q=1', href: 'https://example.org/path?q=1' });
  assert.deepEqual(parseAiInlineLinks('https://example.org/path.').at(-1), { type: 'text', text: '.' });
});

test('renders a markdown reference link without markdown delimiters', () => {
  assert.deepEqual(parseAiInlineLinks('См. [исследование](https://example.org/report).'), [
    { type: 'text', text: 'См. ' },
    { type: 'link', text: 'исследование', href: 'https://example.org/report' },
    { type: 'text', text: '.' }
  ]);
});

test('does not make non-HTTP or incomplete URLs clickable', () => {
  assert.deepEqual(parseAiInlineLinks('[danger](javascript:alert(1))'), [{ type: 'text', text: '[danger](javascript:alert(1))' }]);
  assert.deepEqual(parseAiInlineLinks('https://'), [{ type: 'text', text: 'https://' }]);
});

test('plain URL keeps balanced parentheses in its path', () => {
  const parts = parseAiInlineLinks('https://example.org/path_(one).');
  assert.deepEqual(parts[0], { type: 'link', href: 'https://example.org/path_(one)', text: 'https://example.org/path_(one)' });
});
