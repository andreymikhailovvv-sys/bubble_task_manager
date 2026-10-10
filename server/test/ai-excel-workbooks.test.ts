import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildExcelWorkbookBuffer, EXCEL_MIME, normalizeExcelWorkbookSpec } from '../src/services/excel-workbook.service.js';

const example = {
  fileName: 'Расходы.xlsx', title: 'Отчёт',
  sheets: [
    { name: 'Бюджет', columns: ['Статья', 'Сумма', 'Оплачено'], rows: [['Разработка', 3500.5, true], ['Дизайн', 900, false]] },
    { name: 'Контакты', columns: ['Имя', 'Примечание'], rows: [['Иван', '=HYPERLINK("https://example.com","click")']] }
  ]
};

const unzipStored = (archive: Buffer) => {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const filenameLen = archive.readUInt16LE(offset + 26);
    const extraLen = archive.readUInt16LE(offset + 28);
    const size = archive.readUInt32LE(offset + 18);
    const name = archive.toString('utf8', offset + 30, offset + 30 + filenameLen);
    const start = offset + 30 + filenameLen + extraLen;
    entries.set(name, archive.toString('utf8', start, start + size));
    offset = start + size;
  }
  return entries;
};

test('server creates genuine multi-sheet XLSX with numeric/boolean cells and styled headers', () => {
  const { spec, buffer } = buildExcelWorkbookBuffer(example);
  assert.equal(EXCEL_MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(spec.fileName, 'Расходы.xlsx');
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  const entries = unzipStored(buffer);
  for (const path of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(entries.has(path), path);
  }
  assert.match(entries.get('xl/workbook.xml') ?? '', /sheet name="Бюджет"/);
  assert.match(entries.get('xl/workbook.xml') ?? '', /sheet name="Контакты"/);
  assert.match(entries.get('xl/worksheets/sheet1.xml') ?? '', /<c r="B2" s="0"><v>3500\.5<\/v><\/c>/);
  assert.match(entries.get('xl/worksheets/sheet1.xml') ?? '', /<c r="C2" s="0" t="b"><v>1<\/v><\/c>/);
  assert.match(entries.get('xl/worksheets/sheet1.xml') ?? '', /<autoFilter ref="A1:C3"/);
  assert.match(entries.get('xl/styles.xml') ?? '', /<cellXfs count="3">/);
  const secondSheet = entries.get('xl/worksheets/sheet2.xml') ?? '';
  assert.match(secondSheet, /t="inlineStr"/);
  assert.doesNotMatch(secondSheet, /<f>/); // user strings are never executed as formulas
});

test('server rejects malformed and excessively large sheets', () => {
  assert.throws(() => normalizeExcelWorkbookSpec({ sheets: [] }), /от 1 до 8/);
  assert.throws(() => normalizeExcelWorkbookSpec({ fileName: 'a', sheets: [{ name: 'x', columns: ['A'], rows: [[{}, 7]] }] }), /колонок|много/);
  assert.throws(() => normalizeExcelWorkbookSpec({ fileName: 'a', sheets: Array.from({ length: 9 }, () => ({ name: 'x', columns: ['a'], rows: [] })) }), /от 1 до 8/);
  assert.throws(() => normalizeExcelWorkbookSpec({ fileName: 'a', sheets: [
    { name: 'Same', columns: ['A'], rows: [] }, { name: 'same', columns: ['B'], rows: [] }
  ] }), /уникальными/);
});

test('Excel tool is available in general and task AI chats via shared download pipeline', async () => {
  const [tools, ai, button, word] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/AiGeneratedDocumentButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/word-document.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(tools, /name: 'create_excel_workbook'/);
  assert.match(tools, /excelWorkbookService\.create\(\{ userId: input\.userId, spec: value \}\)/);
  assert.match(ai, /extractExcelWorkbookSpecFromAssistantPayload/);
  assert.match(ai, /excelWorkbookService\.create\(\{ userId: input\.userId, taskId: input\.taskId, spec: excelSpec \}\)/);
  assert.match(ai, /'spreadsheet'/);
  assert.match(button, /FileSpreadsheet/);
  assert.match(word, /export const buildStoredZip/);
});
