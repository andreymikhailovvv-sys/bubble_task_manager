import { deflateRawSync, inflateRawSync } from 'node:zlib';

export type OoxmlEntry = { name: string; data: Buffer };
const MAX_ENTRIES = 1500;
const MAX_EXPANDED_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function readOoxmlArchive(zip: Buffer): OoxmlEntry[] {
  if (zip.length < 22 || zip.length > MAX_SOURCE_BYTES) throw new TypeError('Файл должен быть не больше 8 МБ.');
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) {
      eocd = i; break;
    }
  }
  if (eocd < 0) throw new TypeError('Неверная структура ZIP/OOXML.');
  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdStart = zip.readUInt32LE(eocd + 16);
  if (count === 0 || count > MAX_ENTRIES || zip.readUInt16LE(eocd + 8) !== count ||
      cdStart + cdSize > eocd || zip.readUInt16LE(eocd + 4) !== 0 ||
      zip.readUInt16LE(eocd + 6) !== 0) throw new TypeError('Неподдерживаемый ZIP-архив.');
  let cursor = cdStart;
  let expanded = 0;
  const entries: OoxmlEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) throw new TypeError('Повреждённый ZIP-каталог.');
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10);
    const crc = zip.readUInt32LE(cursor + 16), compressed = zip.readUInt32LE(cursor + 20);
    const uncompressed = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28), extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32), localOffset = zip.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > cdStart + cdSize || nameLength < 1 || nameLength > 240 || (flags & 1) || ![0, 8].includes(method)) throw new TypeError('Неподдерживаемые элементы ZIP.');
    const name = zip.toString('utf8',cursor + 46,cursor + 46 + nameLength);
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || seen.has(name)) throw new TypeError('Недопустимое имя части OOXML.');
    seen.add(name); cursor = next;
    if (name.endsWith('/')) continue;
    expanded += uncompressed;
    if (expanded > MAX_EXPANDED_BYTES || uncompressed > MAX_EXPANDED_BYTES ||
        localOffset + 30 > cdStart || zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new TypeError('Архив повреждён или слишком велик после распаковки.');
    }
    const localNameLen = zip.readUInt16LE(localOffset + 26);
    const localExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressed > cdStart) throw new TypeError('Повреждённые ZIP-данные.');
    const raw = zip.subarray(dataStart, dataStart + compressed);
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: MAX_EXPANDED_BYTES });
    if (data.length !== uncompressed || crc32(data) !== crc) throw new TypeError('Контрольная сумма ZIP не совпадает.');
    entries.push({ name, data });
  }
  if (cursor !== cdStart + cdSize || !seen.has('[Content_Types].xml')) throw new TypeError('Файл не является корректным OOXML-документом.');
  return entries;
}

export function writeOoxmlArchive(entries: OoxmlEntry[]): Buffer {
  if (!entries.length || entries.length > MAX_ENTRIES) throw new TypeError('Слишком много частей в документе.');
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    if (nameBuffer.length > 240 || data.length > MAX_EXPANDED_BYTES) throw new TypeError('Недопустимая часть документа.');
    const compressed = deflateRawSync(data, { level: 6 });
    const checksum = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50,0);
    header.writeUInt16LE(20,4); header.writeUInt16LE(0x0800,6); header.writeUInt16LE(8,8);
    header.writeUInt32LE(checksum,14); header.writeUInt32LE(compressed.length,18);
    header.writeUInt32LE(data.length,22); header.writeUInt16LE(nameBuffer.length,26);
    local.push(header,nameBuffer,compressed);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50,0);
    directory.writeUInt16LE(20,4); directory.writeUInt16LE(20,6); directory.writeUInt16LE(0x0800,8);
    directory.writeUInt16LE(8,10); directory.writeUInt32LE(checksum,16);
    directory.writeUInt32LE(compressed.length,20); directory.writeUInt32LE(data.length,24);
    directory.writeUInt16LE(nameBuffer.length,28); directory.writeUInt32LE(offset,42);
    central.push(directory,nameBuffer);
    offset += header.length + nameBuffer.length + compressed.length;
  }
  const directorySize = central.reduce((n,x)=>n+x.length,0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directorySize,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
}
