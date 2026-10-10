import { prisma } from '../db/prisma.js';
import { buildStoredZip, type GeneratedDocumentMeta } from './word-document.service.js';

export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export type ExcelValue = string | number | boolean | null;
export type ExcelSheetSpec = { name: string; columns: string[]; rows: ExcelValue[][] };
export type ExcelWorkbookSpec = { fileName: string; title?: string; sheets: ExcelSheetSpec[] };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const clean = (value: unknown, max = 4000) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '';
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function normalizeExcelWorkbookSpec(raw: unknown): ExcelWorkbookSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Excel: требуется объект.');
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.sheets) || input.sheets.length === 0 || input.sheets.length > 8)
    throw new TypeError('Excel: от 1 до 8 листов.');
  const names = new Set<string>();
  let cells = 0;
  const sheets = input.sheets.map((rawSheet, index): ExcelSheetSpec => {
    if (!rawSheet || typeof rawSheet !== 'object' || Array.isArray(rawSheet)) throw new TypeError('Некорректный лист.');
    const sheet = rawSheet as Record<string, unknown>;
    const name = (clean(sheet.name, 31).replace(/[\[\]:*?\/\\]/g, '_').replace(/^'+|'+$/g, '') || 'Лист ' + (index + 1)).slice(0, 31);
    if (names.has(name.toLowerCase())) throw new TypeError('Названия листов должны быть уникальными.');
    names.add(name.toLowerCase());
    if (!Array.isArray(sheet.columns) || !sheet.columns.length || sheet.columns.length > 20)
      throw new TypeError('Excel: от 1 до 20 колонок.');
    if (!Array.isArray(sheet.rows) || sheet.rows.length > 1000) throw new TypeError('Excel: максимум 1000 строк данных на лист.');
    const columns = sheet.columns.map((value) => clean(value, 200));
    if (columns.some((value) => !value)) throw new TypeError('Пустой заголовок колонки.');
    const rows = sheet.rows.map((rawRow) => {
      if (!Array.isArray(rawRow) || rawRow.length > columns.length) throw new TypeError('Слишком много ячеек в строке.');
      return columns.map((_, column): ExcelValue => {
        const value: unknown = rawRow[column];
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return clean(value);
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        throw new TypeError('Excel: ячейка должна быть текстом, числом, логическим значением или пустой.');
      });
    });
    cells += (rows.length + 1) * columns.length;
    if (cells > 10000) throw new TypeError('Excel: превышен лимит 10 000 ячеек.');
    return { name, columns, rows };
  });
  const rawFile = clean(input.fileName, 180).replace(/[\\/:*?"<>|]/g, '_') || 'Таблица.xlsx';
  const fileName = /\.xlsx$/i.test(rawFile) ? rawFile : rawFile.replace(/\.xls$/i, '') + '.xlsx';
  return { fileName, title: clean(input.title, 250), sheets };
}
const columnLetter = (column: number) => {
  let n = column + 1;
  let result = '';
  while (n > 0) { n -= 1; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
};
function cellXml(row: number, col: number, value: ExcelValue, style: number) {
  const r = columnLetter(col) + row;
  if (value == null) return '<c r="' + r + '" s="' + style + '"/>';
  if (typeof value === 'number') return '<c r="' + r + '" s="' + style + '"><v>' + value + '</v></c>';
  if (typeof value === 'boolean') return '<c r="' + r + '" s="' + style + '" t="b"><v>' + (value ? 1 : 0) + '</v></c>';
  // All user text, including strings starting with =, is treated as data rather than an executable Excel formula.
  return '<c r="' + r + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';
}
function worksheetXml(sheet: ExcelSheetSpec) {
  const bottomRight = columnLetter(sheet.columns.length - 1) + (sheet.rows.length + 1);
  const widths = sheet.columns.map((header, index) => {
    const longest = Math.max(header.length, ...sheet.rows.slice(0, 120).map((row) => String(row[index] ?? '').length));
    return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + Math.min(40, Math.max(12, longest + 3)) + '" customWidth="1"/>';
  }).join('');
  const header = '<row r="1" ht="25" customHeight="1">' + sheet.columns.map((name, index) => cellXml(1, index, name, 1)).join('') + '</row>';
  const rows = sheet.rows.map((row, index) => '<row r="' + (index + 2) + '">' + row.map((value, col) => cellXml(index + 2, col, value, index % 2 ? 2 : 0)).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<dimension ref="A1:' + bottomRight + '"/>'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="19"/><cols>' + widths + '</cols><sheetData>' + header + rows + '</sheetData>'
    + '<autoFilter ref="A1:' + bottomRight + '"/></worksheet>';
}
const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
  + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF374785"/><bgColor indexed="64"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF3FA"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

export function buildExcelWorkbookBuffer(raw: unknown) {
  const spec = normalizeExcelWorkbookSpec(raw);
  const buf = (value: string) => Buffer.from(value, 'utf8');
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + spec.sheets.map((sheet, index) => '<sheet name="' + escapeXml(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('') + '</sheets></workbook>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + spec.sheets.map((_, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('')
    + '<Relationship Id="rId' + (spec.sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + spec.sheets.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>';
  const files = [
    { name: '[Content_Types].xml', data: buf(types) },
    { name: '_rels/.rels', data: buf(rootRels) },
    { name: 'xl/workbook.xml', data: buf(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: buf(rels) },
    { name: 'xl/styles.xml', data: buf(stylesXml) },
    ...spec.sheets.map((sheet, index) => ({ name: 'xl/worksheets/sheet' + (index + 1) + '.xml', data: buf(worksheetXml(sheet)) }))
  ];
  const buffer = buildStoredZip(files);
  if (buffer.length > MAX_FILE_BYTES) throw new TypeError('Размер Excel-файла больше 5 МБ.');
  return { spec, buffer };
}
export const excelWorkbookService = {
  create: async (input: { userId: string; taskId?: string | null; spec: unknown }): Promise<GeneratedDocumentMeta> => {
    if (input.taskId) {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, OR: [{ userId: input.userId }, { collaboration: { members: { some: { userId: input.userId, isHidden: false } } } }] },
        select: { id: true }
      });
      if (!task) throw new Error('Задача для Excel-файла недоступна пользователю.');
    }
    const { spec, buffer } = buildExcelWorkbookBuffer(input.spec);
    return prisma.aiGeneratedDocument.create({
      data: { userId: input.userId, taskId: input.taskId ?? null, fileName: spec.fileName, mimeType: EXCEL_MIME, size: buffer.length, contentBase64: buffer.toString('base64') },
      select: { id: true, fileName: true, mimeType: true, size: true }
    });
  }
};
