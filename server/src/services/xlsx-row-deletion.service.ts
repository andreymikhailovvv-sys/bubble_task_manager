import type { OoxmlEntry } from './ooxml-archive.js';

/** Physical row deletion for simple sheets. Never guess how to repair formulas or rich Excel metadata. */
const ROW = /<row\b[^>]*>[\s\S]*?<\/row>/g;
const CELL = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g;
const deXml = (s: string) => s.replace(/&#x([\da-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, v: 'amp'|'lt'|'gt'|'quot'|'apos') =>
    ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[v]));
const a = (tag: string, name: string) => tag.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'))?.[1] ?? '';
const head = (xml: string) => xml.slice(0, xml.indexOf('>') + 1);
const norm = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase('ru-RU');

function rejectLinkedWorkbook(parts: OoxmlEntry[], sheet: string) {
  const invalidPaths = /xl\/(?:tables|pivotTables|pivotCache|drawings|charts|comments|threadedComments|externalLinks|slicers|vmlDrawings|calcChain|queryTables)\b/i;
  if (parts.some(p => invalidPaths.test(p.name))) {
    throw new TypeError('В книге есть таблицы Excel, диаграммы или связанные объекты. Удалять строки небезопасно.');
  }
  const book = parts.find(p => p.name === 'xl/workbook.xml')?.data.toString('utf8') ?? '';
  if (/<(?:definedNames|externalReferences|pivotCaches|connections|extLst)\b/i.test(book)) {
    throw new TypeError('В книге есть именованные диапазоны или внешние ссылки. Удаление строк не поддерживается.');
  }
  if (parts.some(p => /^xl\/worksheets\/[^/]+\.xml$/.test(p.name) && /<f(?:\s|>)/i.test(p.data.toString('utf8')))) {
    throw new TypeError('В книге есть формулы. Чтобы не нарушить ссылки, строки не удалены.');
  }
  if (/<(?:mergeCells|conditionalFormatting|dataValidations|hyperlinks|drawing|legacyDrawing|tableParts|extLst|rowBreaks|sortState|sheetProtection|oleObjects)\b/i.test(sheet)) {
    throw new TypeError('Лист содержит объединения, правила или связи, для которых удаление строк пока не поддерживается.');
  }
  if (/<autoFilter\b[^>]*>[\s\S]*?<\/autoFilter>/i.test(sheet)) {
    throw new TypeError('Лист использует сложный автофильтр. Удаление строк не поддерживается.');
  }
}

function sharedStrings(parts: OoxmlEntry[]) {
  const xml = parts.find(p => p.name === 'xl/sharedStrings.xml')?.data.toString('utf8') ?? '';
  return [...xml.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)]
    .map(m => [...m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => deXml(t[1])).join(''));
}

function cellText(xml: string, shared: string[]) {
  const type = a(head(xml), 't');
  if (type === 'inlineStr') return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map(m => deXml(m[1])).join('');
  const raw = xml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (type !== 's') return deXml(raw);
  const index = Number(raw);
  if (!Number.isSafeInteger(index) || index < 0 || index >= shared.length) {
    throw new TypeError('Неверная ссылка на общую строку в Excel.');
  }
  return shared[index];
}

function shiftRanges(xml: string, tagName: 'dimension' | 'autoFilter', removed: number[]) {
  const pattern = new RegExp('<' + tagName + '\\b[^>]*\\/?>', 'g');
  return xml.replace(pattern, tag => {
    const ref = a(tag,'ref');
    const m = /^(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)$/.exec(ref);
    if (!m) throw new TypeError('Неподдерживаемый диапазон ' + tagName + ': ' + ref);
    const first = Number(m[2]), last = Number(m[4]);
    if (tagName === 'autoFilter' && removed.some(n=>n<=first)) throw new TypeError('Нельзя удалить строку заголовка фильтра.');
    const newFirst = first - removed.filter(n=>n<first).length;
    const newLast = Math.max(newFirst, last - removed.filter(n=>n<=last).length);
    return tag.replace('ref="'+ref+'"', 'ref="'+m[1]+newFirst+':'+m[3]+newLast+'"');
  });
}

export function deleteRowsWithText(parts: OoxmlEntry[], sheetPath: string, phrase: string, columnInput: string) {
  const search = norm(phrase);
  if (search.length < 2 || search.length > 160) throw new TypeError('Для удаления укажите значение длиной 2–160 символов.');
  const column = columnInput.trim().toUpperCase();
  if (column && !/^[A-Z]{1,3}$/.test(column)) throw new TypeError('Столбец должен быть указан одной, двумя или тремя буквами.');
  const part = parts.find(p=>p.name===sheetPath);
  if (!part) throw new TypeError('Лист не найден.');
  let xml = part.data.toString('utf8');
  rejectLinkedWorkbook(parts,xml);
  const data = xml.match(/<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>/);
  if (!data) throw new TypeError('На листе не найден блок строк.');
  const rows = [...data[1].matchAll(ROW)];
  if (!rows.length || data[1].replace(ROW,'').trim()) throw new TypeError('Нестандартная структура строк. Файл не изменён.');
  const rowNumbers = rows.map(m => Number(a(head(m[0]),'r')));
  if (rowNumbers.some((n,i) => !Number.isSafeInteger(n)||n<1||n>1048576||
    (i>0&&n<=rowNumbers[i-1]))) throw new TypeError('Нестандартные номера строк.');
  const protectedRow = Number(xml.match(/<autoFilter\b[^>]*\bref="\$?[A-Z]+\$?(\d+)/)?.[1] ?? rowNumbers[0]);
  const shared = sharedStrings(parts);
  const toRemove = rows.flatMap((m,i) => {
    if (rowNumbers[i]<=protectedRow) return [];
    const matches = [...m[0].matchAll(CELL)].some(c => {
      const ref = a(head(c[0]),'r');
      if (column && !new RegExp('^'+column+'\\d+$').test(ref)) return false;
      const value = norm(cellText(c[0],shared));
      const index = value.indexOf(search);
      if (index<0) return false;
      const left=value[index-1]??'',right=value[index+search.length]??'';
      return !/[a-zа-яё0-9]/i.test(left) && !/[a-zа-яё0-9]/i.test(right);
    });
    return matches ? [rowNumbers[i]] : [];
  });
  if (!toRemove.length) throw new TypeError('Строки с указанным текстом не найдены. Файл не изменён.');
  if (toRemove.length>500) throw new TypeError('Найдено более 500 строк. Уточните запрос.');
  const removed = new Set(toRemove);
  const updated = rows.flatMap((row,i) => {
    const n=rowNumbers[i];
    if(removed.has(n))return [];
    const moved=n-toRemove.filter(x=>x<n).length;
    if(moved===n)return [row[0]];
    let result=row[0].replace(/^<row\b[^>]*>/, opening=>opening.replace(/\br="\d+"/, 'r="'+moved+'"'));
    result=result.replace(CELL,cell=>cell.replace(/^<c\b[^>]*\/?>/,opening=>
      opening.replace(/\br="([A-Z]{1,3})\d+"/,(_,letters:string)=>'r="'+letters+moved+'"')));
    return [result];
  });
  xml=xml.replace(data[0],data[0].replace(data[1],updated.join('')));
  xml=shiftRanges(xml,'dimension',toRemove);
  xml=shiftRanges(xml,'autoFilter',toRemove);
  part.data=Buffer.from(xml,'utf8');
  return toRemove.length;
}
