import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { taskAccessWhere } from '../src/lib/task-access.js';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('task access grants private authors and active visible collaborative members, never former authors', () => {
  assert.deepEqual(taskAccessWhere('person'), {
    OR: [
      { userId: 'person', collaborationId: null },
      { collaborationId: { not: null }, collaboration: { members: { some: { userId: 'person', isHidden: false } } } }
    ]
  });
  assert.notDeepEqual(taskAccessWhere('person'), taskAccessWhere('another'));
});

test('task list, create-child, update, delete and invitation routes require current authorization', async () => {
  const src = await read('../src/services/task.service.ts');
  assert.match(src, /where: taskAccessWhere\(userId\)/);
  assert.match(src, /id: input\.parentTaskId, AND: \[taskAccessWhere\(userId\)\]/);
  assert.match(src, /id, parentTaskId: null, AND: \[taskAccessWhere\(userId\)\]/);
  const remove = src.slice(src.indexOf('  remove: async ('), src.indexOf('  createShareLink: async ('));
  assert.match(remove, /where: \{ id, AND: \[taskAccessWhere\(userId\)\] \}/);
  assert.doesNotMatch(remove, /OR: \[\{ userId \}/);
  const creation = src.slice(src.indexOf('  create: async ('), src.indexOf('  update: async ('));
  assert.match(creation, /collaboration: parent\?\.collaborationId/);
});

test('AI assistant and task chat history use current membership for all task lookups', async () => {
  const src = await read('../src/services/ai-assistant.service.ts');
  assert.equal((src.match(/where: \{ id: input\.taskId, AND: \[taskAccessWhere\(input\.userId\)\] \}/g) || []).length, 6);
  assert.doesNotMatch(src, /OR: \[\{ userId: input\.userId \}, \{ collaboration: \{ members:/);
});

test('attachments recheck access, including signed download links', async () => {
  const [service,controller] = await Promise.all([
    read('../src/services/task-attachment.service.ts'),
    read('../src/controllers/task-attachment.controller.ts')
  ]);
  assert.match(service, /AND: \[taskAccessWhere\(userId\)\]/);
  assert.match(service, /await ensureTaskAccess\(taskId, userId\)/);
  assert.match(controller, /getContent\(payload\.taskId, payload\.attachmentId, payload\.userId\)/);
});

test('a hidden or excluded subtask creator is not notified of collaborative activity', async () => {
  const src = await read('../src/services/collaboration-subtask-notification.service.ts');
  assert.match(src, /if \(!recipientMembership \|\| recipientMembership\.isHidden\) return/);
});
