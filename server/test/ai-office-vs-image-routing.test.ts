import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildWordDocumentBuffer, WORD_DOCUMENT_MIME } from '../src/services/word-document.service.js';
import { buildExcelWorkbookBuffer, EXCEL_MIME } from '../src/services/excel-workbook.service.js';
import { getOfficeDocumentPreview } from '../src/services/ooxml-document-editor.js';
import { selectUploadedImageForEdit, validateUploadedImage } from '../src/services/ai-user-image-input.js';
import { editUserImageIfRequested } from '../src/services/ai-user-image-edit.service.js';
import { sourceFormat, isDocumentEditRequest, editUserDocumentIfRequested } from '../src/services/ai-user-document-edit.service.js';
import { isGeneratedImageEditRequest } from '../src/services/ai-image-edit-intent.js';

const word = buildWordDocumentBuffer({
  fileName: 'Текст.docx', blocks: [{ type: 'paragraph', text: 'Исправь старую формулировку' }]
}).buffer;
const excel = buildExcelWorkbookBuffer({
  fileName: 'Данные.xlsx', sheets: [{ name:'Лист 1', columns:['Тема'], rows:[['Встреча']] }]
}).buffer;
const file = (name:string, mimeType:string, buffer:Buffer) => ({
  name, mimeType, size:buffer.length, contentBase64:buffer.toString('base64')
});

test('DOCX never enters the image editor, even with a misleading image MIME', () => {
  const upload = file('Письмо.docx', 'image/png', word);
  assert.equal(selectUploadedImageForEdit([upload], true), null);
  assert.equal(sourceFormat(upload.name,upload.mimeType),'docx');
  assert.match(getOfficeDocumentPreview(word,'docx').text,/Исправь старую формулировку/);
  assert.equal(isDocumentEditRequest('Измени её, пожалуйста',true),true);
  assert.equal(isGeneratedImageEditRequest('Измени её, пожалуйста'),false);
});

test('XLSX is routed to Office editing despite an incorrect image MIME', () => {
  const upload = file('Список.xlsx', 'image/png', excel);
  assert.equal(selectUploadedImageForEdit([upload], true),null);
  assert.equal(sourceFormat(upload.name,upload.mimeType),'xlsx');
  assert.match(getOfficeDocumentPreview(excel,'xlsx').text,/Встреча/);
});

test('DOCX attachment blocks accidental edits of an older generated PNG',async()=>{
  const result = await editUserImageIfRequested({
    userId:'owner', taskId:'task', sourceImageId:'older-image',
    question:'Измени её, пожалуйста', attachments:[file('Договор.docx',WORD_DOCUMENT_MIME,word)],
    apiKey:'not-needed', model:'gpt-5.4-mini', dynamicBilling:false
  });
  assert.equal(result,null);
});

test('correctly labelled PNG remains eligible, and wrong pixels are still rejected',()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  assert.equal(selectUploadedImageForEdit([file('picture.png','image/png',png)],true)?.mimeType,'image/png');
  assert.throws(()=>validateUploadedImage(file('picture.png','image/png',word)),
    /Прикреплённый файл не распознан как PNG, JPEG или WebP/);
});

test('the controller routes document edits before image edits on both endpoints',async()=>{
  const source=await readFile(new URL('../src/controllers/ai.controller.ts',import.meta.url),'utf8');
  const general=source.slice(source.indexOf('  askAiChat: async'),source.indexOf('  getGeneralAssistantHistory: async'));
  const task=source.slice(source.indexOf('  askTaskAssistant: async'),source.indexOf('  appendTaskAssistant'));
  for(const endpoint of [general,task]){
    assert.ok(endpoint.indexOf('const directDocumentEdit = await editUserDocumentIfRequested(') <
      endpoint.indexOf('const directImageEdit = directDocumentEdit ? null : await editUserImageIfRequested('),
      'Office edit must run before any image edit');
    assert.match(endpoint,/directImageEdit \?\? directDocumentEdit \?\?/);
    assert.match(endpoint,/writeStreamEvent\(\{ type: 'error', message/);
  }
});

test('Office classification remains strict about file type and validates actual contents',()=>{
  assert.equal(sourceFormat('invoice.docx',WORD_DOCUMENT_MIME),'docx');
  assert.equal(sourceFormat('invoice.xlsx',EXCEL_MIME),'xlsx');
  assert.equal(sourceFormat('scanned.pdf','application/pdf'),null);
  assert.equal(sourceFormat('fake.png','image/png'),null);
  assert.throws(()=>getOfficeDocumentPreview(Buffer.from('not an OOXML archive'),'docx'));
});

test('an older task image is never chosen as source when no image is attached now', async () => {
  const legacyClientArguments = {
    userId: 'owner',
    taskId: 'task',
    sourceImageId: 'older-image',
    question: 'Измени картинку и добавь луну',
    attachments: [],
    apiKey: 'not-needed',
    model: 'gpt-5.4-mini',
    dynamicBilling: false
  };
  // Even if an outdated client sends sourceImageId, the service ignores it.
  const result = await editUserImageIfRequested(legacyClientArguments);
  assert.equal(result, null);
});

test('an older Office file is never edited without attachment in current message', async () => {
  const oldDocumentRequest = {
    userId: 'owner',
    taskId: 'task',
    sourceDocumentId: 'old-word-doc',
    question: 'Исправь текст в документе',
    attachments: [],
    apiKey: 'not-needed',
    model: 'gpt-5.4-mini'
  };
  // No database lookup, OpenAI call or wallet reservation may occur.
  const result = await editUserDocumentIfRequested(oldDocumentRequest);
  assert.equal(result, null);
});

test('an ambiguous edit with an old image and a fresh document never invokes image editing', async () => {
  const result = await editUserImageIfRequested({
    userId: 'owner',
    taskId: 'task',
    sourceImageId: 'older-image',
    question: 'Исправь её и покажи результат',
    attachments: [file('Договор.docx', WORD_DOCUMENT_MIME, word)],
    apiKey: 'not-needed',
    model: 'gpt-5.4-mini',
    dynamicBilling: false
  });
  assert.equal(result, null);
});
