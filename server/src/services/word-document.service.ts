import { prisma } from '../db/prisma.js';

export const WORD_DOCUMENT_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_DOCUMENT_TEXT_CHARS = 100_000;
const MAX_DOCUMENT_BLOCKS = 120;
const MAX_LIST_ITEMS = 200;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 12;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type WordDocumentBlock = {
  type: 'heading' | 'paragraph' | 'bullets' | 'numbered' | 'table' | 'quote';
  text?: string;
  level?: 1 | 2 | 3;
  items?: string[];
  rows?: string[][];
};

export type WordDocumentSpec = {
  fileName: string;
  title?: string;
  blocks: WordDocumentBlock[];
};

export type GeneratedDocumentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

const stripUnsafeControlChars = (value: string) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const cleanText = (value: unknown, maximum = 8000) =>
  typeof value === 'string' ? stripUnsafeControlChars(value).trim().slice(0, maximum) : '';

const cleanFileName = (value: unknown) => {
  const raw = cleanText(value, 180) || 'document.docx';
  const safe = raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'document.docx';
  return safe.toLowerCase().endsWith('.docx') ? safe : `${safe}.docx`;
};

export function normalizeWordDocumentSpec(raw: unknown): WordDocumentSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Структура Word-документа должна быть объектом.');
  }
  const source = raw as Record<string, unknown>;
  const fileName = cleanFileName(source.fileName);
  const title = cleanText(source.title, 500);
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
  if (rawBlocks.length === 0) throw new TypeError('Документ должен содержать хотя бы один блок.');
  if (rawBlocks.length > MAX_DOCUMENT_BLOCKS) throw new TypeError(`В документе может быть не более ${MAX_DOCUMENT_BLOCKS} блоков.`);

  let totalChars = title.length;
  const blocks: WordDocumentBlock[] = [];
  for (const rawBlock of rawBlocks) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) continue;
    const block = rawBlock as Record<string, unknown>;
    const type = typeof block.type === 'string' ? block.type : '';
    if (!['heading', 'paragraph', 'bullets', 'numbered', 'table', 'quote'].includes(type)) continue;

    if (type === 'heading' || type === 'paragraph' || type === 'quote') {
      const text = cleanText(block.text);
      if (!text) continue;
      totalChars += text.length;
      const levelRaw = Number(block.level);
      const level = ([1, 2, 3].includes(levelRaw) ? levelRaw : 1) as 1 | 2 | 3;
      blocks.push({ type, text, ...(type === 'heading' ? { level } : {}) } as WordDocumentBlock);
      continue;
    }

    if (type === 'bullets' || type === 'numbered') {
      const items = (Array.isArray(block.items) ? block.items : [])
        .map((item) => cleanText(item, 4000))
        .filter(Boolean)
        .slice(0, MAX_LIST_ITEMS);
      if (!items.length) continue;
      totalChars += items.reduce((sum, item) => sum + item.length, 0);
      blocks.push({ type, items });
      continue;
    }

    const rows = (Array.isArray(block.rows) ? block.rows : [])
      .slice(0, MAX_TABLE_ROWS)
      .map((row) => (Array.isArray(row) ? row : [])
        .slice(0, MAX_TABLE_COLUMNS)
        .map((cell) => cleanText(cell, 4000)))
      .filter((row) => row.length > 0);
    if (!rows.length) continue;
    totalChars += rows.flat().reduce((sum, cell) => sum + cell.length, 0);
    blocks.push({ type: 'table', rows });
  }

  if (!blocks.length) throw new TypeError('В структуре документа нет поддерживаемых непустых блоков.');
  if (totalChars > MAX_DOCUMENT_TEXT_CHARS) throw new TypeError(`Документ слишком большой: максимум ${MAX_DOCUMENT_TEXT_CHARS} символов.`);
  return { fileName, ...(title ? { title } : {}), blocks };
}

const xmlEscape = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const textRunXml = (text: string, options?: { bold?: boolean; italic?: boolean; sizeHalfPoints?: number }) => {
  const properties = [
    options?.bold ? '<w:b/>' : '',
    options?.italic ? '<w:i/>' : '',
    options?.sizeHalfPoints ? `<w:sz w:val="${options.sizeHalfPoints}"/><w:szCs w:val="${options.sizeHalfPoints}"/>` : ''
  ].join('');
  const chunks = text.split('\n');
  return chunks.map((chunk, index) =>
    `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(chunk)}</w:t>${index < chunks.length - 1 ? '<w:br/>' : ''}</w:r>`
  ).join('');
};

const paragraphXml = (text: string, options?: { style?: string; bullet?: boolean; quote?: boolean; bold?: boolean; sizeHalfPoints?: number }) => {
  const pPr = [
    options?.style ? `<w:pStyle w:val="${options.style}"/>` : '',
    options?.bullet ? '<w:ind w:left="720" w:hanging="360"/>' : '',
    options?.quote ? '<w:ind w:left="720" w:right="360"/><w:spacing w:before="120" w:after="120"/>' : ''
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${textRunXml(text, { italic: options?.quote, bold: options?.bold, sizeHalfPoints: options?.sizeHalfPoints })}</w:p>`;
};

const tableXml = (rows: string[][]) => {
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  const width = Math.floor(9000 / maxColumns);
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: maxColumns }, (_, columnIndex) => row[columnIndex] ?? '');
    return `<w:tr>${cells.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraphXml(cell, { bold: rowIndex === 0 })}</w:tc>`).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2CC"/><w:left w:val="single" w:sz="4" w:color="B8C2CC"/><w:bottom w:val="single" w:sz="4" w:color="B8C2CC"/><w:right w:val="single" w:sz="4" w:color="B8C2CC"/><w:insideH w:val="single" w:sz="4" w:color="D7DEE5"/><w:insideV w:val="single" w:sz="4" w:color="D7DEE5"/></w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr>${rowXml}</w:tbl>`;
};

const renderDocumentBody = (spec: WordDocumentSpec) => {
  const parts: string[] = [];
  if (spec.title) parts.push(paragraphXml(spec.title, { style: 'Title' }));
  for (const block of spec.blocks) {
    if (block.type === 'heading' && block.text) {
      parts.push(paragraphXml(block.text, { style: `Heading${block.level ?? 1}` }));
    } else if (block.type === 'paragraph' && block.text) {
      parts.push(paragraphXml(block.text));
    } else if (block.type === 'quote' && block.text) {
      parts.push(paragraphXml(block.text, { quote: true }));
    } else if (block.type === 'bullets') {
      for (const item of block.items ?? []) parts.push(paragraphXml(`• ${item}`, { bullet: true }));
    } else if (block.type === 'numbered') {
      (block.items ?? []).forEach((item, index) => parts.push(paragraphXml(`${index + 1}. ${item}`, { bullet: true })));
    } else if (block.type === 'table' && block.rows?.length) {
      parts.push(tableXml(block.rows));
    }
  }
  return parts.join('');
};

const documentXml = (spec: WordDocumentSpec) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${renderDocumentBody(spec)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="280"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const coreXml = (title: string) => {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(title)}</dc:title>
  <dc:creator>Планировыч AI</dc:creator>
  <cp:lastModifiedBy>Планировыч AI</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
};

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Планировыч</Application>
</Properties>`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
};

type ZipEntry = { name: string; data: Buffer };

const buildStoredZip = (entries: ZipEntry[]) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

export function buildWordDocumentBuffer(rawSpec: unknown) {
  const spec = normalizeWordDocumentSpec(rawSpec);
  const title = spec.title || spec.fileName.replace(/\.docx$/i, '');
  const utf8 = (value: string) => Buffer.from(value, 'utf8');
  const buffer = buildStoredZip([
    { name: '[Content_Types].xml', data: utf8(contentTypesXml) },
    { name: '_rels/.rels', data: utf8(rootRelsXml) },
    { name: 'docProps/core.xml', data: utf8(coreXml(title)) },
    { name: 'docProps/app.xml', data: utf8(appXml) },
    { name: 'word/document.xml', data: utf8(documentXml(spec)) },
    { name: 'word/styles.xml', data: utf8(stylesXml) },
    { name: 'word/_rels/document.xml.rels', data: utf8(documentRelsXml) }
  ]);
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new TypeError('Сгенерированный Word-документ превышает лимит 5 МБ.');
  return { spec, buffer };
}

export const wordDocumentService = {
  create: async (input: { userId: string; taskId?: string | null; spec: unknown }): Promise<GeneratedDocumentMeta> => {
    if (input.taskId) {
      const allowedTask = await prisma.task.findFirst({
        where: {
          id: input.taskId,
          OR: [
            { userId: input.userId },
            { collaboration: { members: { some: { userId: input.userId, isHidden: false } } } }
          ]
        },
        select: { id: true }
      });
      if (!allowedTask) throw new Error('Задача для документа недоступна пользователю.');
    }

    const { spec, buffer } = buildWordDocumentBuffer(input.spec);
    const document = await prisma.aiGeneratedDocument.create({
      data: {
        userId: input.userId,
        taskId: input.taskId ?? null,
        fileName: spec.fileName,
        mimeType: WORD_DOCUMENT_MIME,
        size: buffer.length,
        contentBase64: buffer.toString('base64')
      },
      select: { id: true, fileName: true, mimeType: true, size: true }
    });
    return document;
  },

  getForDownload: async (userId: string, id: string) => prisma.aiGeneratedDocument.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { task: { userId } },
        { task: { collaboration: { members: { some: { userId, isHidden: false } } } } }
      ]
    },
    select: { id: true, fileName: true, mimeType: true, size: true, contentBase64: true }
  })
};
