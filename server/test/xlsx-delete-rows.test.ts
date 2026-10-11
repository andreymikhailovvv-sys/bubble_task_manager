import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildExcelWorkbookBuffer } from '../src/services/excel-workbook.service.js';
import { applyOfficeEdits, getOfficeDocumentPreview, type OfficeEdit } from '../src/services/ooxml-document-editor.js';
import { readOoxmlArchive, writeOoxmlArchive } from '../src/services/ooxml-archive.js';

const remove = (target: string, sheet='Товары', column=''): OfficeEdit => ({
  kind: 'delete_rows_matching', target, value: column, sheet, valueType: 'text'
});
const sample=()=>buildExcelWorkbookBuffer({fileName:'products.xlsx',sheets:[
  {name:'Товары',columns:['Бренд','Название','Цена'],rows:[
    ['BRAND X','Модель A',100],
    ['SEBERO','SEBERO Red',200],
    ['OTHER','Модель B',300],
    ['SEBERO','SEBERO Blue',400],
    ['SEBERON','Сходное имя',500],
    ['sebero','Линейка SEBERO Pro',600],
    ['BRAND Y','Модель C',700]
  ]},
  {name:'Справочник',columns:['Название'],rows:[['SEBERO'],['Другая позиция']]}
]}).buffer;

test('delete all matching SEBERO rows, shift other rows and preserve original, styles and other sheets',()=>{
  const source=sample(), copy=Buffer.from(source);
  const result=applyOfficeEdits(source,'xlsx',[remove('SEBERO','Товары','A')]);
  const preview=getOfficeDocumentPreview(result,'xlsx').text;
  assert.ok(source.equals(copy), 'Original document must not mutate');
  assert.match(preview,/A2=BRAND X/);
  assert.match(preview,/A3=OTHER/);
  assert.match(preview,/A4=SEBERON/);
  assert.match(preview,/A5=BRAND Y/);
  assert.doesNotMatch(preview,/SEBERO Red|SEBERO Blue|SEBERO Pro/);
  assert.match(preview,/Лист: Справочник/);
  assert.match(preview,/SEBERO/); // same brand on another sheet is untouched
  const modified=readOoxmlArchive(result), original=readOoxmlArchive(source);
  assert.deepEqual(original.map(x=>x.name),modified.map(x=>x.name));
  for(const p of original.filter(x=>x.name!=='xl/worksheets/sheet1.xml')){
    assert.ok(p.data.equals(modified.find(x=>x.name===p.name)!.data), p.name);
  }
  const xml=modified.find(x=>x.name==='xl/worksheets/sheet1.xml')!.data.toString('utf8');
  assert.match(xml,/<dimension ref="A1:C5"/);
  assert.match(xml,/<autoFilter ref="A1:C5"/);
  assert.match(xml,/<row r="5">/);
  assert.match(xml,/<c r="C5"/);
});

test('do not remove headers or related but different brand names',()=>{
  const buffer=buildExcelWorkbookBuffer({fileName:'names.xlsx',sheets:[
    {name:'Товары',columns:['SEBERO','Цена'],rows:[['SEBERON',10],['OTHER',20]]}
  ]}).buffer;
  assert.throws(()=>applyOfficeEdits(buffer,'xlsx',[remove('SEBERO')]),/не найдены/);
});

test('search all cells when no column specified and all rows past the first 35',()=>{
  const values=Array.from({length:60},(_,i)=>['Нейтральный бренд',i===57?'Позиция SEBERO Classic':'Обычная модель',i]);
  const original=buildExcelWorkbookBuffer({fileName:'catalog.xlsx',sheets:[
    {name:'Товары',columns:['Бренд','Товар','Цена'],rows:values}
  ]}).buffer;
  const result=applyOfficeEdits(original,'xlsx',[remove('SEBERO')]);
  const xml=readOoxmlArchive(result).find(p=>p.name==='xl/worksheets/sheet1.xml')!.data.toString();
  assert.match(xml,/<dimension ref="A1:C60"/);
  assert.doesNotMatch(xml,/Позиция SEBERO Classic/);
  assert.match(xml,/<row r="60">/);
});

test('empty matches, unsafe column names and too broad searches refuse edits',()=>{
  const source=sample();
  assert.throws(()=>applyOfficeEdits(source,'xlsx',[remove('Отсутствует')]),/не найдены/);
  assert.throws(()=>applyOfficeEdits(source,'xlsx',[remove('SEBERO','Товары','A1')]),/Столбец/);
  assert.throws(()=>applyOfficeEdits(source,'xlsx',[remove('S')]),/2–160/);
  assert.throws(()=>applyOfficeEdits(source,'xlsx',[remove('SEBERO','Несуществующий лист')]),/Не найден лист/);
});

test('formulas on any worksheet block physical row deletion to protect links',()=>{
  const source=sample();
  const parts=readOoxmlArchive(source);
  const second=parts.find(p=>p.name==='xl/worksheets/sheet2.xml')!;
  second.data=Buffer.from(second.data.toString('utf8').replace(
    '<sheetData>', '<sheetData><row r="100"><c r="A100"><f>SUM(B2:B8)</f><v>50</v></c></row>'));
  const enriched=writeOoxmlArchive(parts);
  assert.throws(()=>applyOfficeEdits(enriched,'xlsx',[remove('SEBERO')]),/формулы/);
});

test('merged cells and structured table parts refuse physical deletion',()=>{
  const source=sample();
  const merged=readOoxmlArchive(source);
  const first=merged.find(p=>p.name==='xl/worksheets/sheet1.xml')!;
  first.data=Buffer.from(first.data.toString('utf8').replace('</worksheet>',
    '<mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells></worksheet>'));
  assert.throws(()=>applyOfficeEdits(writeOoxmlArchive(merged),'xlsx',[remove('SEBERO')]),/содержит/);
  const structured=readOoxmlArchive(source);
  structured.push({name:'xl/tables/table1.xml',data:Buffer.from('<table/>')});
  assert.throws(()=>applyOfficeEdits(writeOoxmlArchive(structured),'xlsx',[remove('SEBERO')]),/таблицы Excel/);
});

test('new action is recognized by AI edit schema, and existing cell edits remain supported',async()=>{
  const [planner,editor]=await Promise.all([
    readFile(new URL('../src/services/ai-user-document-edit.service.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/services/ooxml-document-editor.ts',import.meta.url),'utf8')
  ]);
  assert.match(planner,/delete_rows_matching/);
  assert.match(planner,/SEBERO/);
  assert.match(editor,/deleteRowsWithText/);
  const source=sample();
  const modified=applyOfficeEdits(source,'xlsx',[
    {kind:'set_cell',target:'C2',value:'150',sheet:'Товары',valueType:'number'}
  ]);
  assert.match(getOfficeDocumentPreview(modified,'xlsx').text,/C2=150/);
});
