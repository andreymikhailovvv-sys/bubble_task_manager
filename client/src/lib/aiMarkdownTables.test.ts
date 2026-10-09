import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAiMarkdownTables } from './aiMarkdownTables';

test('parses a table with alignments and surrounding text', () => {
  const result = parseAiMarkdownTables('Итоги:\n| Задача | Сумма |\n| :--- | ---: |\n| Реклама | 500 |\n| Дизайн | 250 |\nВывод');
  assert.deepEqual(result, [
    { type: 'text', text: 'Итоги:' },
    { type: 'table', table: { headers: ['Задача', 'Сумма'], alignments: ['left', 'right'], rows: [['Реклама', '500'], ['Дизайн', '250']] } },
    { type: 'text', text: 'Вывод' }
  ]);
});

test('retains escaped and inline-code pipes', () => {
  const tick = String.fromCharCode(96);
  const result = parseAiMarkdownTables('| A | B |\n| --- | --- |\n| A \\| B | ' + tick + 'x|y' + tick + ' |');
  assert.equal(result[0].type, 'table');
  if (result[0].type === 'table') {
    assert.deepEqual(result[0].table.rows, [['A | B', tick + 'x|y' + tick]]);
  }
});

test('does not turn normal lines with pipes into tables', () => {
  const text = 'a | b\nnot a divider\nc | d';
  assert.deepEqual(parseAiMarkdownTables(text), [{ type: 'text', text }]);
});

test('rejects uneven columns and table headers without rows', () => {
  const text = '| A | B |\n| --- | --- |\n| just one |';
  assert.deepEqual(parseAiMarkdownTables(text), [{ type: 'text', text }]);
});
