import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWordDocumentBuffer } from '../src/services/word-document.service.js';
import { buildExcelWorkbookBuffer } from '../src/services/excel-workbook.service.js';
import { readOoxmlArchive, writeOoxmlArchive } from '../src/services/ooxml-archive.js';
import { applyOfficeEdits, getOfficeDocumentPreview, type OfficeEdit } from '../src/services/ooxml-document-editor.js';
import { isDocumentEditRequest, interpretEmptyOfficeEditPlan } from '../src/services/ai-user-document-edit.service.js';

const edit = (kind:OfficeEdit['kind'],target:string,value:string,sheet='',valueType:OfficeEdit['valueType']='text'):OfficeEdit=>
  ({kind,target,value,sheet,valueType});

test('DOCX targeted paragraph changes preserve other OOXML parts and original source',()=>{
  const source=buildWordDocumentBuffer({fileName:'contract.docx',blocks:[
    {type:'paragraph',text:'Срок исполнения 20 дней'},
    {type:'paragraph',text:'Остальные условия неизменны'}
  ]}).buffer;
  const sourceCopy=Buffer.from(source);
  const edited=applyOfficeEdits(source,'docx',[
    edit('replace_text','20 дней','30 дней'),
    edit('append_paragraph','','Дополнительное соглашение')
  ]);
  const preview=getOfficeDocumentPreview(edited,'docx').text;
  assert.match(preview,/Срок исполнения 30 дней/);
  assert.match(preview,/Остальные условия неизменны/);
  assert.match(preview,/Дополнительное соглашение/);
  assert.ok(source.equals(sourceCopy));
  const originalParts=readOoxmlArchive(source),modifiedParts=readOoxmlArchive(edited);
  assert.deepEqual(originalParts.map(x=>x.name),modifiedParts.map(x=>x.name));
  for(const part of originalParts.filter(x=>x.name!=='word/document.xml')){
    assert.ok(part.data.equals(modifiedParts.find(x=>x.name===part.name)!.data),part.name);
  }
});

test('DOCX refuses ambiguous or missing references without modifying source',()=>{
  const buffer=buildWordDocumentBuffer({fileName:'note.docx',blocks:[
    {type:'paragraph',text:'Два'}, {type:'paragraph',text:'Два'}
  ]}).buffer;
  assert.throws(()=>applyOfficeEdits(buffer,'docx',[edit('replace_text','Два','Один')]),/ровно в одном/);
  assert.throws(()=>applyOfficeEdits(buffer,'docx',[edit('replace_text','Нету','Один')]));
  assert.throws(()=>applyOfficeEdits(buffer,'docx',[edit('set_cell','A1','2','Лист 1')]));
});

test('XLSX edits values and formulas while preserving untouched sheets and formatting',()=>{
  const original=buildExcelWorkbookBuffer({fileName:'budget.xlsx',sheets:[
    {name:'Расходы',columns:['Наименование','Стоимость'],rows:[['Реклама',1200],['Печать',400]]},
    {name:'Справочник',columns:['Название'],rows:[['Тест']]}
  ]}).buffer;
  const updated=applyOfficeEdits(original,'xlsx',[
    edit('set_cell','C1','С НДС','Расходы','text'),
    edit('set_cell','C2','=B2*1.2','Расходы','formula'),
    edit('set_cell','B3','500','Расходы','number')
  ]);
  const preview=getOfficeDocumentPreview(updated,'xlsx').text;
  assert.match(preview,/Лист: Расходы/);
  assert.match(preview,/C1=С НДС/);
  assert.match(preview,/C2==B2\*1\.2/);
  assert.match(preview,/B3=500/);
  const parts=readOoxmlArchive(updated);
  const originalParts=readOoxmlArchive(original);
  const originalSecondary=originalParts.find(p=>p.name==='xl/worksheets/sheet2.xml')!;
  assert.ok(originalSecondary.data.equals(parts.find(p=>p.name===originalSecondary.name)!.data));
  assert.throws(()=>applyOfficeEdits(original,'xlsx',[edit('delete_paragraph','foo','bar')]));
});

test('malformed OOXML is rejected, no archive path injection',()=>{
  assert.throws(()=>getOfficeDocumentPreview(Buffer.from('not zip'),'docx'));
  assert.throws(()=>applyOfficeEdits(Buffer.alloc(400),'xlsx',[edit('set_cell','A1','3','Sheet1','number')]));
});

test('document edit intent excludes unrelated task commands',()=>{
  assert.equal(isDocumentEditRequest('Исправь опечатку в третьем абзаце Word'),true);
  assert.equal(isDocumentEditRequest('Добавь столбец в Excel'),true);
  assert.equal(isDocumentEditRequest('Переименуй задачу'),false);
  assert.equal(isDocumentEditRequest('Создай новый Word документ'),false);
});

test('document edit route reuses signed generated-document downloads and billing', async()=>{
  const [controller,handler,preview]=await Promise.all([
    readFile(new URL('../src/controllers/ai.controller.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/services/ai-user-document-edit.service.ts',import.meta.url),'utf8'),
    readFile(new URL('../../client/src/components/AiProgress.tsx',import.meta.url),'utf8')
  ]);
  assert.match(controller, /const result = await aiAssistantService\.askAiChat/);
  assert.match(controller, /const result = await aiAssistantService\.askTaskAssistant/);
  assert.match(handler,/settleDynamicResponsesCall/);
  assert.match(handler,/refundDynamicResponsesCall/);
  assert.match(handler,/userId:input.userId/);
  assert.match(preview,/Редактирую документ/);
});

test('text-only request never becomes JSON edits when a DOCX or XLSX exists in chat history', () => {
  const textRequests = [
    'Подготовь структуру презентации только текстом, без правок документа',
    'Просто напиши план презентации в виде текста',
    'Составь структуру презентации и добавь несколько разделов, но только текстом',
    'Исправь формулировку тезисов и покажи результат только текстом',
    'Напиши обычный текст без изменения файла',
    'Добавь идеи к концепции и напиши их текстом, не меняй документ',
    'Предложи, как улучшить содержание документа, без редактирования файла',
    'Проанализируй приложенный Excel и расскажи, что улучшить',
    'Сделай описание структуры презентации',
    'Добавь заметку о предстоящей выставке',
    'Создай заметку с названием «Идеи»',
    'Переименуй задачу',
  ];
  for (const question of textRequests) {
    assert.equal(isDocumentEditRequest(question), false, question);
    assert.equal(isDocumentEditRequest(question, true), false, question + ' + attachment');
  }
});

test('genuine requests to modify existing Office documents still use structured editing', () => {
  const edits = [
    'Исправь опечатку в третьем абзаце Word',
    'Добавь столбец в Excel',
    'Удали строки с SEBERO в приложенной таблице',
    'Замени слово "Париж" на "Москва" в документе',
    'Перепиши текст в этом файле',
    'Исправь таблицу в существующем XLSX',
  ];
  for (const question of edits) {
    assert.equal(isDocumentEditRequest(question), true, question);
  }
  assert.equal(isDocumentEditRequest('Удали позиции SEBERO', true), true);
  assert.equal(isDocumentEditRequest('Исправь опечатки', true), true);
  assert.equal(isDocumentEditRequest('Удали позиции SEBERO'), false, 'no attached document or explicit file target');
  assert.equal(isDocumentEditRequest('Создай новый Word документ'), false);
  assert.equal(isDocumentEditRequest('Подготовь новый Excel с данными'), false);
});

test('document edit router does not intercept natural language text answers', async () => {
  const [editor, controller] = await Promise.all([
    readFile(new URL('../src/services/ai-user-document-edit.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(editor, /explicitFileToolSelection/);
  assert.match(controller, /const result = await aiAssistantService\.askAiChat/);
  assert.match(controller, /const result = await aiAssistantService\.askTaskAssistant/);
});


test('Office JSON planner no-op becomes ordinary answer, not duplicated HTTP error', () => {
  const summary = 'Файл не изменён: Файл не изменён. Не поддерживается перенос объединённых ячеек.';
  const result = interpretEmptyOfficeEditPlan(summary);
  assert.equal(result.fallbackToText, false);
  assert.match(result.answer, /Файл остался без изменений/);
  assert.doesNotMatch(result.answer, /Файл не изменён: Файл не изменён/);
  assert.match(result.answer, /объединённых ячеек/);
});

test('Office planner accidentally receiving a plain-text request falls back to regular chat', () => {
  const summary = 'Файл не изменён. Вы запросили структуру презентации только текстом, без правок документа. В этом режиме доступны только JSON-инструкции.';
  const result = interpretEmptyOfficeEditPlan(summary);
  assert.equal(result.fallbackToText, true);
  const general = interpretEmptyOfficeEditPlan('');
  assert.equal(general.fallbackToText, false);
  assert.match(general.answer, /Не удалось безопасно/);
});


const styledWordFile = (runs: string, secondParagraph = 'Другой абзац не изменять') => {
  const buffer = buildWordDocumentBuffer({ fileName: 'rich-text.docx', blocks: [
    { type: 'paragraph', text: 'RUN_PLACEHOLDER' },
    { type: 'paragraph', text: secondParagraph }
  ] }).buffer;
  const archive = readOoxmlArchive(buffer);
  const word = archive.find(part => part.name === 'word/document.xml')!;
  const xml = word.data.toString('utf8');
  const placeholder = '<w:r><w:t xml:space="preserve">RUN_PLACEHOLDER</w:t></w:r>';
  assert.ok(xml.includes(placeholder));
  word.data = Buffer.from(xml.replace(placeholder, runs));
  return writeOoxmlArchive(archive);
};

test('DOCX заменяет фразу через 4 стильных Word runs, сохраняя форматирование окружающего текста', () => {
  const source = styledWordFile(
    '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">До сро</w:t></w:r>' +
    '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">к </w:t></w:r>' +
    '<w:r><w:t>оп</w:t></w:r>' +
    '<w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t xml:space="preserve">латы после</w:t></w:r>'
  );
  const preview = getOfficeDocumentPreview(source, 'docx').text;
  assert.match(preview, /До срок оплаты после/);
  const updated = applyOfficeEdits(source, 'docx', [edit('replace_text', 'срок оплаты', 'дата платежа')]);
  const result = getOfficeDocumentPreview(updated, 'docx').text;
  assert.match(result, /До дата платежа после/);
  assert.match(result, /Другой абзац не изменять/);
  assert.ok(!result.includes('срок оплаты'));
  const before = readOoxmlArchive(source);
  const after = readOoxmlArchive(updated);
  assert.deepEqual(before.map(x=>x.name), after.map(x=>x.name));
  for(const part of before.filter(x=>x.name!=='word/document.xml')) {
    assert.ok(part.data.equals(after.find(x=>x.name===part.name)!.data), part.name);
  }
  const xml = after.find(x=>x.name==='word/document.xml')!.data.toString('utf8');
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /<w:i\/>/);
  assert.match(xml, /<w:color w:val="FF0000"\/>/);
  assert.match(xml, /<w:t xml:space="preserve"> после<\/w:t>/);
  assert.ok(readOoxmlArchive(source).find(x=>x.name==='word/document.xml')!.data.toString('utf8').includes('сро'), 'source unchanged');
});

test('DOCX сохраняет спецсимволы и хвост исходного стиля при замене через границы w:t', () => {
  const source = styledWordFile(
    '<w:r><w:t>Текст &amp; </w:t></w:r>' +
    '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">по</w:t></w:r>' +
    '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">сле</w:t></w:r>'
  );
  const updated = applyOfficeEdits(source, 'docx', [edit('replace_text', '& после', '<новый> & текст')]);
  assert.match(getOfficeDocumentPreview(updated,'docx').text, /Текст <новый> & текст/);
  const xml = readOoxmlArchive(updated).find(x=>x.name==='word/document.xml')!.data.toString('utf8');
  assert.match(xml, /&lt;новый&gt; &amp; текст/);
  assert.match(xml, /<w:i\/>/);
});

test('DOCX запрещает неоднозначную замену в пределах одного абзаца', () => {
  const source = styledWordFile(
    '<w:r><w:t>Дважды</w:t></w:r><w:r><w:t xml:space="preserve"> и Дважды</w:t></w:r>'
  );
  assert.throws(
    () => applyOfficeEdits(source, 'docx', [edit('replace_text', 'Дважды', 'Один раз')]),
    /ровно один раз/
  );
});

test('DOCX не заменяет видимый текст через поля Word, разрывы и служебные метки', () => {
  for(const marker of ['<w:br/>', '<w:fldChar w:fldCharType="begin"/>', '<w:bookmarkStart w:id="0" w:name="point"/>']) {
    const source = styledWordFile(
      '<w:r><w:t>Первая </w:t></w:r><w:r>' + marker + '</w:r><w:r><w:t>часть</w:t></w:r>'
    );
    assert.throws(
      () => applyOfficeEdits(source, 'docx', [edit('replace_text', 'Первая часть', 'Замена')]),
      /нетекстовый элемент/
    );
  }
});
