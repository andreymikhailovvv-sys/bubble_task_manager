import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildWordDocumentBuffer, WORD_DOCUMENT_MIME } from '../src/services/word-document.service.js';
import { buildAiFileCatalog } from '../src/services/ai-file-catalog.service.js';
import { executeAiFileTool, validateFileToolRequest, AI_READ_FILE_TOOL, AI_EDIT_FILE_TOOL } from '../src/services/ai-file-operations.service.js';
import { validateConversationUploads } from '../src/services/ai-conversation-attachments.service.js';
import { runAiChatToolLoop } from '../src/services/ai-chat-tools.service.js';

const word = buildWordDocumentBuffer({
  fileName: 'Контракт.docx', blocks: [
    { type: 'paragraph', text: 'Первый абзац' },
    { type: 'paragraph', text: 'Второй абзац: дата 14 октября' }
  ]
}).buffer;
const document = { name: 'Контракт.docx', mimeType: WORD_DOCUMENT_MIME, contentBase64: word.toString('base64'), size: word.length };
const catalog = buildAiFileCatalog({ currentUploads: [document] });
const context = { userId: 'test-user', model: 'gpt-5.4-mini', apiKey: 'unused', actionId: 'test-action', dynamicBilling: false, catalog, uploads: [document] };

test('read_file читает точный фрагмент выбранного Word, не запуская генерацию или редактирование', async () => {
  const result = await executeAiFileTool(context, 'read', { fileId: 'current:0' });
  assert.equal(result.response.ok, true);
  assert.match(result.response.text ?? '', /Второй абзац: дата 14 октября/);
  assert.equal(result.response.fileId, 'current:0');
  assert.equal(result.document, undefined);
  assert.equal(result.modelAttachment, undefined);
});

test('read_file не угадывает последний файл или ID, которого нет в каталоге', async () => {
  const result = await executeAiFileTool(context, 'read', { fileId: 'generated_document:some-old-id' });
  assert.deepEqual(result.response.code, 'FILE_NOT_IN_CATALOG');
  assert.equal(result.document, undefined);
  const invalid = await executeAiFileTool(context, 'edit', { fileId: 'current:0', instruction: '' });
  assert.equal(invalid.response.code, 'INVALID_ARGUMENTS');
});

test('операции доступны только через строго заданные model tools с explicit ID', () => {
  assert.equal(AI_READ_FILE_TOOL.name, 'read_file');
  assert.equal(AI_EDIT_FILE_TOOL.name, 'edit_file');
  assert.equal(AI_READ_FILE_TOOL.strict, true);
  assert.equal(AI_EDIT_FILE_TOOL.strict, true);
  assert.equal(validateFileToolRequest({ fileId: 'task_attachment:abc' }, 'read')?.fileId, 'task_attachment:abc');
  assert.equal(validateFileToolRequest({ fileId: 'task_attachment:abc', instruction: 'Замени дату' }, 'edit')?.instruction, 'Замени дату');
  assert.equal(validateFileToolRequest({ fileId: 'current:0' }, 'edit'), null);
  assert.equal(validateFileToolRequest({ fileId: 'current:0', instruction: 'X'.repeat(5001) }, 'edit'), null);
});

test('вложения для долговременного хранения проверяются по фактическим байтам до записи в БД', () => {
  assert.equal(validateConversationUploads([document]).length, 1);
  assert.throws(() => validateConversationUploads([{ ...document, size: 50 }]), /Размер/);
  assert.throws(() => validateConversationUploads([{ ...document, contentBase64: '!invalid!' }]), /Некорректное/);
  assert.throws(() => validateConversationUploads(Array(4).fill(document)), /не более трёх/);
});

test('tool loop отправляет выбранное содержимое модели только после read_file, а не при простом перечислении', async () => {
  const requests: unknown[][] = [];
  const extra: unknown[] = [];
  let calls = 0;
  const response = await runAiChatToolLoop({
    initialInput: [{ role: 'user', content: 'Прочитай старое вложение' }],
    request: async (messages) => {
      requests.push([...messages]);
      calls += 1;
      if (calls === 1) return { output: [{ type: 'function_call', call_id: 'one', name: 'read_file', arguments: '{"fileId":"current:0"}' }] };
      return { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Файл прочитан' }] }] };
    },
    executeTool: async () => {
      extra.push({ role: 'user', content: [{ type: 'input_text', text: 'Данные файла' }] });
      return { ok: true, fileId: 'current:0' };
    },
    consumeAdditionalInput: () => extra.splice(0)
  });
  assert.equal(response.answer, 'Файл прочитан');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].length, 1);
  assert.equal((requests[1][requests[1].length - 1] as {role?: string}).role, 'user');
  assert.ok(requests[1].some((m) => (m as { type?: string }).type === 'function_call_output'));
});

test('сервер больше не запускает прямой редактор до решения модели', async () => {
  const [controller, general, task, operations, catalogService, prismaSchema, migration] = await Promise.all([
    readFile(new URL('../src/controllers/ai.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-file-operations.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-file-catalog.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261014190000_ai_conversation_attachment/migration.sql', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(controller, /directDocumentEdit|directImageEdit/);
  assert.match(controller, /saveConversationUploads\(/);
  assert.match(general, /executeAiFileTool/);
  assert.match(task, /call\.name === 'read_file' \|\| call\.name === 'edit_file'/);
  assert.match(task, /AI_READ_FILE_TOOL, AI_EDIT_FILE_TOOL/);
  assert.match(operations, /input\.catalog\.items\.some\(\(entry\) => entry\.fileId === fileId\)/);
  assert.match(operations, /taskAccessWhere\(input\.userId\)/);
  assert.match(operations, /id: key, taskId: input\.taskId, userId: input\.userId/);
  assert.match(operations, /id: key, userId: input\.userId, taskId: input\.taskId \?\? null/);
  assert.match(catalogService, /messageId: \{ in: historyMessageIds/);
  assert.match(prismaSchema, /model AiConversationAttachment/);
  assert.match(migration, /FOREIGN KEY \("userId"\)/);
  assert.match(migration, /FOREIGN KEY \("taskId"\)/);
});
