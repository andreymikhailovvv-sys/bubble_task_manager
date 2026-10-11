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
  // Keep paragraph, runs and styles untouched except one text node containing
  // the exact snippet. Multi-run replacements would corrupt mixed formatting.
  const nodes=[...original.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  const compatible=nodes.filter(m=>unesc(m[2]).includes(edit.target));
  if(compatible.length!==1)throw new TypeError('Word: текст разбит на несколько фрагментов оформления; автоматическое изменение небезопасно.');
  const m=compatible[0];
  const replacement=unesc(m[2]).replace(edit.target,edit.value);
  const newNode='<w:t xml:space="preserve">'+esc(replacement)+'</w:t>';
  return xml.replace(original,original.replace(m[0],newNode));
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

export function getOfficeDocumentPreview(buffer:Buffer, format:OfficeFormat){
  const files=readOoxmlArchive(buffer);
  if(format==='docx'){
    const xml=get(files,'word/document.xml').data.toString('utf8');
    return {format, text:paragraphs(xml).slice(0,100).map((p,i)=>(i+1)+'. '+p).join('\n').slice(0,16000)};
  }
  const sheets=sheetPaths(files);
  const shared=files.find(e=>e.name==='xl/sharedStrings.xml')?.data.toString('utf8') ?? '';
  const sharedValues=[...shared.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>
    [...m[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>unesc(x[1])).join(''));
  const result:string[]=[];
  for(const [name,path] of sheets){
    const xml=get(files,path).data.toString('utf8');
    result.push('Лист: '+name);
    for(const row of [...xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)].slice(0,35)){
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
  return {format,text:result.join('\n').slice(0,16000)};
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
