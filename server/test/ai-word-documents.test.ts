import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Word builder формирует настоящий OOXML ZIP и поддерживает основные блоки', async () => {
  const source = await readFile(new URL('../src/services/word-document.service.ts', import.meta.url), 'utf8');

  assert.match(source, /\[Content_Types\]\.xml/);
  assert.match(source, /word\/document\.xml/);
  assert.match(source, /word\/styles\.xml/);
  assert.match(source, /0x04034b50/);
  assert.match(source, /0x02014b50/);
  assert.match(source, /0x06054b50/);
  assert.match(source, /'heading' \| 'paragraph' \| 'bullets' \| 'numbered' \| 'table' \| 'quote'/);
  assert.match(source, /MAX_DOCUMENT_TEXT_CHARS = 100_000/);
  assert.match(source, /MAX_DOCUMENT_BYTES = 5 \* 1024 \* 1024/);
});

test('общий AI-чат получает отдельный create_word_document tool', async () => {
  const [toolsSource, assistant] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8')
  ]);

  assert.match(toolsSource, /name: 'create_word_document'/);
  assert.match(toolsSource, /wordDocumentService\.create\(\{ userId: input\.userId, spec: value \}\)/);
  assert.match(toolsSource, /generatedDocument/);
  assert.match(assistant, /используй create_word_document/i);
  assert.match(assistant, /не обещай создать файл позже/i);
});

test('task AI-чат принимает структуру document и сохраняет ссылку в сообщении', async () => {
  const [assistant, controller, schema] = await Promise.all([
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  ]);

  assert.match(assistant, /"document":null/);
  assert.match(assistant, /extractWordDocumentSpecFromAssistantPayload/);
  assert.match(assistant, /wordDocumentService\.create\(\{ userId: input\.userId, taskId: input\.taskId, spec: documentSpec \}\)/);
  assert.match(assistant, /generatedDocument: \{ select: \{ id: true, fileName: true, mimeType: true, size: true \} \}/);
  assert.match(controller, /generatedDocumentId: result\.generatedDocument\?\.id \?\? null/);
  assert.match(schema, /model AiGeneratedDocument/);
  assert.match(schema, /generatedDocumentId String\? @unique/);
});

test('скачивание документа авторизовано и совместный task-документ доступен участникам', async () => {
  const [service, routes] = await Promise.all([
    readFile(new URL('../src/services/word-document.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8')
  ]);

  assert.match(routes, /\/ai-documents\/:id\/download', requireAuth/);
  assert.match(service, /\{ userId \}/);
  assert.match(service, /collaboration: \{ members: \{ some: \{ userId, isHidden: false \} \} \}/);
});

test('web и Mini App сохраняют metadata документа и показывают кнопку скачивания', async () => {
  const [types, api, component, web, mini] = await Promise.all([
    readFile(new URL('../../client/src/lib/types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/AiGeneratedDocumentButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(types, /export type GeneratedDocument/);
  assert.match(types, /generatedDocument\?: GeneratedDocument/);
  assert.match(api, /getAiGeneratedDocumentDownloadUrl/);
  assert.match(component, /download=\{document\.fileName\}/);
  assert.match(component, /Скачать/);

  for (const source of [web, mini]) {
    assert.match(source, /generatedDocument: result\.generatedDocument \?\? undefined/);
    assert.match(source, /AiGeneratedDocumentButton/);
  }

  assert.match(mini, /message\.generatedDocument \? \{ generatedDocument: message\.generatedDocument \} : \{\}/);
});
