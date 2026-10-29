import { posix } from 'node:path';
import { readOoxmlArchive, writeOoxmlArchive, type OoxmlEntry } from './ooxml-archive.js';
import { deleteRowsWithText } from './xlsx-row-deletion.service.js';

export type OfficeFormat = 'docx' | 'xlsx';
export type OfficeEdit = {
  kind: 'replace_text' | 'append_paragraph' | 'delete_paragraph' | 'set_cell' | 'delete_rows_matching';
  target: string;
  value: string;
  sheet: string;
  valueType: 'text' | 'number' | 'formula' | 'boolean' | 'blank';
};
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const unesc = (s: string) => s.replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16)))
  .replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v)))
  .replace(/&(amp|lt|gt|quot|apos);/g,(_,v)=>(({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[String(v)] ?? ''));
const attrs = (xml: string): Record<string,string> => {
  const out: Record<string,string> = {};
  for(const m of xml.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g))out[m[1]]=unesc(m[2]);
  return out;
};
const get = (files: OoxmlEntry[], name: string) => {
  const result=files.find(x=>x.name===name);
  if(!result)throw new TypeError('Не найдена обязательная часть документа: '+name);
  return result;
};
const update = (files: OoxmlEntry[], name: string, xml: string) => {
  const entry=get(files,name); entry.data=Buffer.from(xml,'utf8');
};
const textNodes=(xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>unesc(m[1])).join('');
const paragraphs=(xml: string) => [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m=>textNodes(m[0])).filter(Boolean);
const MAX_EDITS = 20;

function replaceWordParagraph(xml: string, edit: OfficeEdit) {
  const regex=/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  const parts=[...xml.matchAll(regex)];
  const matches=parts.filter(x=>edit.kind==='delete_paragraph' ? textNodes(x[0])===edit.target : textNodes(x[0]).includes(edit.target));
  if(matches.length!==1)throw new TypeError('Фрагмент Word должен встречаться ровно в одном абзаце: '+edit.target.slice(0,60));
  const original=matches[0][0];
  if(edit.kind==='delete_paragraph')return xml.replace(original,'');
  const nodes=[...original.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  const texts=nodes.map(node=>unesc(node[1]));
  const paragraphText=texts.join('');
  const start=paragraphText.indexOf(edit.target);
  if(start<0 || paragraphText.indexOf(edit.target,start+1)!==-1)
    throw new TypeError('Точный фрагмент Word должен встречаться ровно один раз в абзаце.');
  const end=start+edit.target.length;

  let offset=0;
  const affected: Array<{ nodeIndex: number; start: number; end: number }>=[];
  for(let index=0;index<nodes.length;index++){
    const from=offset;
    const to=from+texts[index].length;
    if(from<end && to>start)affected.push({nodeIndex:index,start:from,end:to});
    offset=to;
  }
  if(!affected.length)throw new TypeError('Не удалось найти текстовые элементы Word.');
  // A visible phrase may cross style runs, but must not cross a field, image,
  // hyperlink boundary, tracked change, bookmark or other non-text marker.
  // Keeping those structures in place while changing the text could silently
  // change the meaning of the document, so refuse instead.
  if(affected.length>1){
    const first=nodes[affected[0].nodeIndex];
    const last=nodes[affected[affected.length-1].nodeIndex];
    const between=original.slice((first.index??0)+first[0].length,last.index??0);
    if(/<w:(?:fldChar|instrText|tab|br|cr|drawing|pict|object|delText|sym|footnoteReference|endnoteReference|bookmarkStart|bookmarkEnd|commentReference|lastRenderedPageBreak)\b|<\/?w:(?:hyperlink|ins|del|sdt|fldSimple)\b/i.test(between))
      throw new TypeError('Фрагмент Word пересекает поле или другой нетекстовый элемент; точечная правка небезопасна.');
  }

  // A DOCX paragraph is often a sequence of <w:r> style runs and its visible
  // text does not exist as one <w:t>. Keep ALL run and paragraph markup. Place
  // replacement text into the first affected run (its style wins), clear only
  // the replaced portions of intermediate runs, retain untouched trailing text
  // in its original run and with its original formatting.
  let result=original;
  for(let i=affected.length-1;i>=0;i--){
    const part=affected[i];
    const node=nodes[part.nodeIndex];
    const text=texts[part.nodeIndex];
    const prefix=text.slice(0,Math.max(0,start-part.start));
    const suffix=text.slice(Math.max(0,end-part.start));
    const nextText=(i===0 ? prefix+edit.value : '')+suffix;
    const updated='<w:t xml:space="preserve">'+esc(nextText)+'</w:t>';
    const index=node.index??-1;
    if(index<0)throw new TypeError('Некорректная структура текста Word.');
    result=result.slice(0,index)+updated+result.slice(index+node[0].length);
  }
  return xml.replace(original,result);
}

function editWord(files: OoxmlEntry[], edits: OfficeEdit[]) {
  if(!files.some(e=>e.name==='word/document.xml'))throw new TypeError('Не обнаружен DOCX документ.');
  let xml=get(files,'word/document.xml').data.toString('utf8');
  if(!xml.includes('<w:body'))throw new TypeError('Неподдерживаемая структура Word.');
  for(const edit of edits){
    if(edit.kind==='replace_text' || edit.kind==='delete_paragraph'){
      if(!edit.target || edit.target.length>2000 || edit.value.length>4000)throw new TypeError('Неверный текст правки Word.');
      xml=replaceWordParagraph(xml,edit);
    } else if(edit.kind==='append_paragraph'){
      if(edit.value.length<1 || edit.value.length>4000)throw new TypeError('Неверный новый абзац Word.');
      const insert=xml.indexOf('<w:sectPr');
      const location=insert>=0?insert:xml.indexOf('</w:body>');
      if(location<0)throw new TypeError('Неподдерживаемая структура Word.');
      const paragraph='<w:p><w:r><w:t xml:space="preserve">'+esc(edit.value)+'</w:t></w:r></w:p>';
      xml=xml.slice(0,location)+paragraph+xml.slice(location);
    } else throw new TypeError('Эта операция не поддерживается для Word.');
  }
  update(files,'word/document.xml',xml);
}

function sheetPaths(files: OoxmlEntry[]) {
  const book=get(files,'xl/workbook.xml').data.toString('utf8');
  const rels=get(files,'xl/_rels/workbook.xml.rels').data.toString('utf8');
  const relMap=new Map([...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m=>{
    const a=attrs(m[0]);
    const target=a.Target ?? '';
    const path=target.startsWith('/') ? target.slice(1) : posix.normalize('xl/'+target);
    return [a.Id,path] as const;
  }));
  const sheets=new Map<string,string>();
  for(const m of book.matchAll(/<sheet\b[^>]*\/>/g)){
    const a=attrs(m[0]); const name=a.name, relation=a['r:id'];
    const path=relMap.get(relation);
    if(name && path && path.startsWith('xl/') && files.some(f=>f.name===path))sheets.set(name,path);
  }
  if(!sheets.size)throw new TypeError('Не удалось найти листы XLSX.');
  return sheets;
}

function columnIndex(cell: string) {
  const part=cell.match(/^([A-Z]{1,3})([1-9]\d{0,5})$/);
  if(!part || Number(part[2])>100000)return null;
  let n=0;for(const char of part[1])n=n*26+char.charCodeAt(0)-64;
  return n<=16384?{column:n,row:Number(part[2])}:null;
}

function createCell(edit: OfficeEdit) {
  let payload='';
  let type='';
  switch(edit.valueType){
    case 'text':type=' t="inlineStr"';payload='<is><t>'+esc(edit.value)+'</t></is>';break;
    case 'number':
      if(!edit.value.trim() || !Number.isFinite(Number(edit.value)))throw new TypeError('Некорректное числовое значение.');
      payload='<v>'+String(Number(edit.value))+'</v>';break;
    case 'formula':
      if(!edit.value.startsWith('=') || edit.value.length>500)throw new TypeError('Формула должна начинаться с =.');
      payload='<f>'+esc(edit.value.slice(1))+'</f><v></v>';break;
    case 'boolean':type=' t="b"';payload='<v>'+(/^(true|1)$/i.test(edit.value)?'1':'0')+'</v>';break;
    case 'blank':break;
  }
  return {type,payload};
}

function editCell(xml:string, edit:OfficeEdit){
  const ref=edit.target.toUpperCase();
  const loc=columnIndex(ref);
  if(!loc)throw new TypeError('Неверный адрес ячейки: '+ref);
  const item=createCell(edit);
  const re=new RegExp('<c\\b[^>]*\\br="'+ref+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)','g');
  const cells=[...xml.matchAll(re)];
  if(cells.length>1)throw new TypeError('Повторяющаяся ячейка: '+ref);
  if(cells.length===1){
    const cell=cells[0][0];
    const open=cell.match(/^<c\b[^>]*\/?\s*>/)?.[0];
    if(!open)throw new TypeError('Повреждённая ячейка.');
    const a=attrs(open);
    const style=a.s && /^\d+$/.test(a.s)?' s="'+a.s+'"':'';
    return xml.replace(cell,'<c r="'+ref+'"'+style+item.type+'>'+item.payload+'</c>');
  }
  const rowRe=new RegExp('<row\\b[^>]*\\br="'+loc.row+'"[^>]*>[\\s\\S]*?<\\/row>');
  const row=xml.match(rowRe)?.[0];
  const cell='<c r="'+ref+'"'+item.type+'>'+item.payload+'</c>';
  if(row){
    const existing=[...row.matchAll(/<c\b[^>]*\br="([A-Z]+)([0-9]+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
    const after=existing.find(c=>(columnIndex(c[1]+c[2])?.column ?? 0)>loc.column);
    if(after)return xml.replace(row,row.replace(after[0],cell+after[0]));
    return xml.replace(row,row.replace('</row>',cell+'</row>'));
  }
  if(!xml.includes('</sheetData>'))throw new TypeError('Неверная структура листа Excel.');
  const newRow='<row r="'+loc.row+'">'+cell+'</row>';
  const rows=[...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g)];
  const after=rows.find(m=>Number(m[1])>loc.row);
  if(after)return xml.replace(after[0],newRow+after[0]);
  return xml.replace('</sheetData>',newRow+'</sheetData>');
}

function editExcel(files:OoxmlEntry[],edits:OfficeEdit[]){
  const sheets=sheetPaths(files);
  for(const edit of edits){
    if(edit.kind!=='set_cell' && edit.kind!=='delete_rows_matching') throw new TypeError('Для Excel поддержаны безопасные правки ячеек и удаление строк по значению.');
    const path=sheets.get(edit.sheet);
    if(!path)throw new TypeError('Не найден лист Excel: '+edit.sheet);
    if(edit.kind==='delete_rows_matching') {
      deleteRowsWithText(files,path,edit.target,edit.value);
      continue;
    }
    if(edit.value.length>4000)throw new TypeError('Слишком длинное значение ячейки.');
    const xml=editCell(get(files,path).data.toString('utf8'),edit);
    update(files,path,xml);
  }
}

export function getOfficeDocumentPreview(buffer:Buffer, format:OfficeFormat, options: {
  maxCharacters?: number; maxParagraphs?: number; maxSheetRows?: number;
} = {}){
  // Default UI preview remains short. AI reads may opt into a larger, bounded
  // extraction so sections after paragraph 100 are not falsely reported absent.
  const maxCharacters = Math.max(1, Math.min(100_000, options.maxCharacters ?? 16_000));
  const maxParagraphs = Math.max(1, Math.min(2_000, options.maxParagraphs ?? 100));
  const maxSheetRows = Math.max(1, Math.min(1_000, options.maxSheetRows ?? 35));
  const files=readOoxmlArchive(buffer);
  if(format==='docx'){
    const xml=get(files,'word/document.xml').data.toString('utf8');
    const allParagraphs = paragraphs(xml);
    const selected = allParagraphs.slice(0, maxParagraphs);
    const combined = selected.map((p,i)=>(i+1)+'. '+p).join('\n');
    return { format, text: combined.slice(0, maxCharacters),
      truncated: selected.length < allParagraphs.length || combined.length > maxCharacters };
  }
  const sheets=sheetPaths(files);
  const shared=files.find(e=>e.name==='xl/sharedStrings.xml')?.data.toString('utf8') ?? '';
  const sharedValues=[...shared.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>
    [...m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>unesc(x[1])).join(''));
  const result:string[]=[];
  let truncated = false;
  for(const [name,path] of sheets){
    const xml=get(files,path).data.toString('utf8');
    result.push('Лист: '+name);
    const rows = [...xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)];
    if (rows.length > maxSheetRows) truncated = true;
    for(const row of rows.slice(0,maxSheetRows)){
      const cells=[...row[0].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)];
      const values=cells.slice(0,18).map(c=>{
        const type=attrs(c[0].match(/^<c\b[^>]*>/)?.[0] ?? '').t;
        const raw=c[0].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        const inline=c[0].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1] ?? '';
        const formula=c[0].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
        const value=formula ? '='+unesc(formula) : type==='s' ? sharedValues[Number(raw)] ?? '' : type==='inlineStr' ? unesc(inline) : unesc(raw);
        return c[1]+'='+value;
      });
      if(values.length)result.push(values.join(' | '));
    }
  }
  const combined = result.join('\n');
  return { format, text: combined.slice(0, maxCharacters), truncated: truncated || combined.length > maxCharacters };
}

export function applyOfficeEdits(buffer:Buffer, format:OfficeFormat, edits:OfficeEdit[]):Buffer{
  if(!Array.isArray(edits)||!edits.length||edits.length>MAX_EDITS)throw new TypeError('Требуется от 1 до 20 конкретных изменений.');
  const files=readOoxmlArchive(buffer);
  const valid=edits.every(x=>x && typeof x==='object' && ['replace_text','append_paragraph','delete_paragraph','set_cell','delete_rows_matching'].includes(x.kind) &&
    typeof x.target==='string' && typeof x.value==='string' && typeof x.sheet==='string' &&
    ['text','number','formula','boolean','blank'].includes(x.valueType));
  if(!valid)throw new TypeError('Недопустимые операции редактирования.');
  if(format==='docx')editWord(files,edits);
  else editExcel(files,edits);
  const result=writeOoxmlArchive(files);
  if(result.length>MAX_FILE_BYTES)throw new TypeError('После изменения файл превышает лимит 8 МБ.');
  // Reject incomplete/corrupt outputs instead of handing the user a broken file.
  readOoxmlArchive(result);
  return result;
}
