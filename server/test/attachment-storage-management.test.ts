import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { taskAttachmentLimitBytes, TASK_ATTACHMENT_STORAGE_LIMIT_MIB } from '../src/services/task-attachment.service.js';
import { AI_CHAT_ATTACHMENT_RETENTION_BYTES, getExpiredAiChatUploadIds } from '../src/services/ai-conversation-attachments.service.js';

test('плановые квоты в байтах: free 50, start 100, pro 150, max 250 MiB', () => {
  for (const [plan, size] of Object.entries(TASK_ATTACHMENT_STORAGE_LIMIT_MIB)) {
    assert.equal(taskAttachmentLimitBytes(plan), size * 1024 * 1024);
  }
  assert.equal(taskAttachmentLimitBytes(null), 50 * 1024 * 1024);
  assert.equal(taskAttachmentLimitBytes('unknown'), 50 * 1024 * 1024);
});

test('удаляются только старые AI chat файлы, сумма последних не выше 10 MiB', () => {
  const M = 1024 * 1024;
  assert.equal(AI_CHAT_ATTACHMENT_RETENTION_BYTES, 10 * M);
  assert.deepEqual(getExpiredAiChatUploadIds([
    { id: 'new4', size: 4 * M },
    { id: 'new5', size: 5 * M },
    { id: 'old3', size: 3 * M },
    { id: 'old2', size: 2 * M }
  ]), ['old3', 'old2']);
  assert.deepEqual(getExpiredAiChatUploadIds([
    { id: 'new8', size: 8 * M }, { id: 'old8', size: 8 * M }
  ]), ['old8']);
  assert.deepEqual(getExpiredAiChatUploadIds([]), []);
});

test('новая квота применяется в serializable транзакции, старые вложения не трогает', async () => {
  const source = await readFile(new URL('../src/services/task-attachment.service.ts', import.meta.url), 'utf8');
  assert.match(source, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /usedBytes \+ size > limitBytes/);
  assert.match(source, /throw new TaskAttachmentQuotaError/);
  assert.match(source, /taskAttachment\.aggregate/);
  assert.doesNotMatch(source.slice(source.indexOf('  create: async'), source.indexOf('  remove: async')), /deleteMany|updateMany/);
  assert.match(source, /listOwned: async/);
  assert.match(source, /where: \{ id: attachmentId, userId \}/);
  assert.match(source, /parentTask: \{ select: \{ title: true, id: true \} \}/);
});

test('переполнение квоты сообщает 413 и системное уведомление, не запускает загрузку', async () => {
  const [controller, routes, clientApi] = await Promise.all([
    readFile(new URL('../src/controllers/task-attachment.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8')
  ]);
  assert.match(controller, /res\.status\(413\)\.json\(\{ error: error\.message, code: error\.code/);
  assert.match(controller, /systemNotification\.upsert/);
  assert.match(routes, /\/user\/attachments\/storage/);
  assert.match(routes, /\/user\/attachments\/:attachmentId/);
  assert.match(clientApi, /ATTACHMENT_STORAGE_LIMIT_EVENT/);
});

test('все поверхности отмечают вложения подзадач и принимают TXT', async () => {
  const [web, mini, editor, assistant, operations, taskService] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-file-operations.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/task.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(taskService, /attachmentsByTaskId\.get\(task\.id\)/);
  assert.match(web, /renderWorkspaceAttachmentIndicator\(subtask\)/);
  assert.match(web, /const total = task\.attachmentCount \?\? 0/);
  assert.match(mini, /subtask\.attachmentCount/);
  assert.match(editor, /chunkSize = 0x8000/);
  assert.doesNotMatch(editor, /btoa\(String\.fromCharCode\(\.\.\.new Uint8Array/);
  assert.match(web, /\.txt/);
  assert.match(mini, /\.txt/);
  assert.match(assistant, /TXT-файла/);
  assert.match(operations, /format: 'txt'/);
});

test('старые chat uploads очищаются отдельно от постоянных task attachments', async () => {
  const migration = await readFile(new URL('../prisma/migrations/20261019160000_prune_old_ai_chat_uploads/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /PARTITION BY "userId"/);
  assert.match(migration, /DELETE FROM "AiConversationAttachment"/);
  assert.match(migration, /10485760/);
  assert.doesNotMatch(migration, /DELETE FROM "TaskAttachment"/);
});

test('события прикрепляют файлы через существующий task attachment API на всех экранах', async () => {
  const [web, editor, mini, service] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/TaskEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/task-attachment.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(editor, /!task.parentTaskId && !isEventEditor/);
  assert.match(editor, /isSubtask \|\| isEventEditor/);
  assert.match(editor, /setPendingEventFiles/);
  assert.match(editor, /onSave\(form, draftSubtasks, eventAttachments\)/);
  assert.match(web, /api\.createTaskAttachment\(createdTask\.id, file\)/);
  assert.match(mini, /createTaskPendingFiles/);
  assert.match(mini, /api\.createTaskAttachment\(createdTask\.id, await fileToAttachmentPayload\(file\)\)/);
  assert.match(service, /taskAccessWhere\(userId\)/);
});

test('profile storage is calm and attachment filenames are teal; upcoming cards match list mode without sector stripes', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(app, /profile-attachment-storage rounded-xl border/);
  assert.match(app, /profile-attachment-file-link mt-1/);
  assert.match(css, /\.profile-attachment-storage \{/);
  assert.match(css, /\.profile-attachment-file-link \{ color: #0891b2; \}/);
  assert.match(css, /body\[data-theme='dark'\] \.profile-attachment-file-link \{ color: #67e8f9; \}/);
  assert.doesNotMatch(app, /border-violet-400\/20 bg-violet-500\/5 p-3" aria-label="Хранилище вложений"/);
  assert.doesNotMatch(app, /upcoming-subtask-row-sector/);
  assert.doesNotMatch(css, /\.upcoming-subtask-row-sector/);
  assert.match(css, /\.upcoming-subtasks-list \.upcoming-subtask-row \{[\s\S]*?border-radius: 1\.25rem;[\s\S]*?box-shadow:/);
  assert.match(css, /body\[data-theme='light'\] \.upcoming-subtasks-list \.upcoming-subtask-row/);
});
