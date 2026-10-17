import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getAiAttachmentKind, splitAiMessageAttachments } from '../../client/src/components/AiAttachmentTiles.js';

test('AI attachment tiles distinguish image, Word, Excel, PDF and unknown formats', () => {
  assert.equal(getAiAttachmentKind('Фото.webp'), 'image');
  assert.equal(getAiAttachmentKind('Фото.jpeg'), 'image');
  assert.equal(getAiAttachmentKind('Документ.docx'), 'word');
  assert.equal(getAiAttachmentKind('Таблица.xlsx'), 'excel');
  assert.equal(getAiAttachmentKind('Отчёт.pdf'), 'pdf');
  assert.equal(getAiAttachmentKind('archive.bin'), 'file');
});

test('stored conversation file list renders visually without changing the question', () => {
  assert.deepEqual(splitAiMessageAttachments('Измени фон\n\n📎 Файлы: фото.png, стиль.webp, договор.docx'), {
    text: 'Измени фон', names: ['фото.png','стиль.webp','договор.docx']
  });
  assert.deepEqual(splitAiMessageAttachments('Обычный вопрос без файла'), {
    text: 'Обычный вопрос без файла', names: []
  });
});

test('both AI chat servers emit image-edit stage for edits but not for DOCX or reading', async () => {
  const [general, task, progress, ui] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/AiProgress.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(general, /edit_file: input\.fileTools\?\.catalog\.items\.some/);
  assert.match(general, /\? 'editing_image' : 'editing_document'/);
  assert.match(task, /editingImage \? 'editing_image' : 'editing_document'/);
  assert.match(task, /if \(call\.name === 'edit_file'\) input\.onProgress\?\.\('forming_answer'\)/);
  assert.match(ui, /status === 'generating_image' \|\| status === 'editing_image'/);
  assert.match(progress, /streamAiRequestWithUploadProgress/);
  assert.match(progress, /xhr\.upload\.onprogress/);
  assert.match(progress, /stripAiChatDisplayPreviews\(payload\.history\)/);
});

test('every chat surface uses shared attachment tiles and sender progress', async () => {
  const [web, mini, expanded, editor] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/ExpandedAiChat.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8')
  ]);
  for (const content of [web, mini, expanded, editor]) assert.match(content, /AiAttachmentTiles/);
  assert.match(web, /focusAiUploadProgress/);
  assert.match(web, /taskAiUploadProgress/);
  assert.match(web, /aiChatUploadProgress/);
  assert.match(mini, /taskAiUploadProgress/);
  assert.match(mini, /aiChatUploadProgress/);
  assert.match(expanded, /uploadProgress=\{uploadProgress\}/);
});
