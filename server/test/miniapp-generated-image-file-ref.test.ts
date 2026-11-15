import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generatedFileReferenceId, stripGeneratedFileReferences } from '../../client/src/lib/ai-generated-file-references';
import { reconcileActiveAiChatMessages, reconcileQuickAiChatMessages } from '../../client/src/lib/ai-chat-reconciliation';
import type { ChatMessage, GeneratedDocument } from '../../client/src/lib/types';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const document: GeneratedDocument = {
  id: 'cmwhwh1e9003lp62mpxocmq51',
  fileName: 'flying-car.png',
  mimeType: 'image/png',
  size: 201234
};

test('legacy file_ref can recover the original image without another generation request', () => {
  const message = 'Готово — летающий автомобиль будущего. [[file_ref=cmwhwh1e9003lp62mpxocmq51]]';
  assert.equal(generatedFileReferenceId(message), document.id);
  assert.equal(stripGeneratedFileReferences(message), 'Готово — летающий автомобиль будущего.');
  // References are IDs only, not client-trusted download URLs or arbitrary HTML.
  assert.equal(generatedFileReferenceId('[[file_ref=https://evil.example/image.png]]'), null);
  assert.equal(generatedFileReferenceId('[[file_ref=../../private]]'), null);
  assert.equal(stripGeneratedFileReferences('Обычный ответ без файла.'), 'Обычный ответ без файла.');
});

test('remote image metadata replaces an older text-only copy during quick/general synchronization', () => {
  const local: Array<ChatMessage & { id: string }> = [
    { id: 'answer-1', role: 'assistant', content: 'Готово', createdAt: '2026-11-15T12:00:00.000Z' }
  ];
  const remote: Array<ChatMessage & { id: string }> = [
    { ...local[0], generatedDocument: document }
  ];
  assert.equal(reconcileActiveAiChatMessages(local, remote, false)[0].generatedDocument?.id, document.id);
  assert.equal(reconcileQuickAiChatMessages(local, remote, false, 100)[0].generatedDocument?.id, document.id);
  assert.equal(reconcileActiveAiChatMessages(remote, remote, false), remote);
});

test('quick chat persists generatedDocument metadata and returns it in history', async () => {
  const [schema, migration, controller, assistant, routes] = await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261115143000_general_ai_generated_document/migration.sql'),
    read('../src/controllers/ai.controller.ts'),
    read('../src/services/ai-assistant.service.ts'),
    read('../src/routes/api.ts')
  ]);
  assert.match(schema, /model GeneralAiMessage \{[\s\S]*?generatedDocument Json\?/);
  assert.match(migration, /ALTER TABLE "GeneralAiMessage" ADD COLUMN "generatedDocument" JSONB/);
  assert.match(controller, /generatedDocument: result\.generatedDocument \?\? null/);
  assert.match(assistant, /generatedDocument: true/);
  assert.match(assistant, /input\.generatedDocument\.mimeType/);
  assert.match(assistant, /message\.generatedDocument as unknown as GeneratedDocumentMeta/);
  assert.match(routes, /if \(chatId === 'quick-ai-requests'\) \{\s*const messages = await aiAssistantService\.listGeneralDialog/);
});

test('Mini App renders existing/new image cards, and old file_ref is resolved using owner-scoped metadata', async () => {
  const [mini, card, resolver, api, controller, service, routes] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/AiGeneratedImageCard.tsx'),
    read('../../client/src/components/AiResolvedGeneratedDocument.tsx'),
    read('../../client/src/lib/api.ts'),
    read('../src/controllers/ai-generated-document.controller.ts'),
    read('../src/services/word-document.service.ts'),
    read('../src/routes/api.ts')
  ]);
  assert.equal((mini.match(/AiResolvedGeneratedDocument content=\{message\.content\}/g) ?? []).length, 2);
  assert.equal((mini.match(/stripGeneratedFileReferences\(message\.content\)/g) ?? []).length, 2);
  assert.match(mini, /AiGeneratedDocumentButton document=\{message\.generatedDocument\}/);
  assert.match(resolver, /getAiGeneratedDocumentMetadata\(reference\)/);
  assert.match(resolver, /<AiGeneratedDocumentButton document=\{resolved\}/);
  assert.match(api, /\/api\/ai-documents\/\$\{encodeURIComponent\(id\)\}\/metadata/);
  assert.match(controller, /getMetadataForDownload\(req\.user!\.id, req\.params\.id\)/);
  assert.match(service, /getMetadataForDownload:[\s\S]*?task: \{ collaboration: \{ members: \{ some: \{ userId, isHidden: false \}/);
  assert.match(service, /select: \{ id: true, fileName: true, mimeType: true, size: true \}/);
  assert.match(routes, /\/ai-documents\/:id\/metadata', requireAuth/);
  assert.match(card, /searchParams\.set\('preview', '1'\)/);
  assert.match(card, /createAiGeneratedDocumentDownloadLink\(document\.id\)/);
});
