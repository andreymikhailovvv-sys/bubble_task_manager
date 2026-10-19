import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { newestFocusSubtaskFirst, urgentFocusSubtaskFirst } from '../../client/src/lib/focusSubtaskSort.js';
import { createAiPersonalNotesService, validateAiUpdateNoteArgs } from '../src/services/ai-create-note.service.js';
import { selectRequiredPersonalLookup } from '../src/services/ai-personal-search-intent.js';

test('web and Mini App focus modes put newer undated subtasks first and retain deadlines first', () => {
  const old = { id: 'old', createdAt: '2026-10-01T10:00:00Z', dueDate: null };
  const recent = { id: 'new', createdAt: '2026-10-19T10:00:00Z', dueDate: null };
  const dueOld = { ...old, id: 'due-old', dueDate: '2026-10-20T10:00:00Z' };
  const dueNew = { ...recent, id: 'due-new', dueDate: '2026-10-20T10:00:00Z' };
  const later = { ...recent, id: 'later', dueDate: '2026-10-21T10:00:00Z' };
  assert.deepEqual([old, recent].sort(newestFocusSubtaskFirst).map(t => t.id), ['new', 'old']);
  assert.deepEqual([old, dueOld, later, recent, dueNew].sort(urgentFocusSubtaskFirst).map(t => t.id),
    ['due-new', 'due-old', 'later', 'new', 'old']);
});

test('note change input is bounded; null values preserve existing fields', () => {
  const input = validateAiUpdateNoteArgs({
    id: 'note1', title: null, content: 'Дополнительный пункт', contentMode: 'append', groupName: null
  });
  assert.equal(input.contentMode, 'append');
  assert.throws(() => validateAiUpdateNoteArgs({ id: 'note1', title: null, content: null, contentMode: null, groupName: null }));
  assert.throws(() => validateAiUpdateNoteArgs({ id: 'note1', title: ' ', content: null, contentMode: null, groupName: null }));
  assert.throws(() => validateAiUpdateNoteArgs({ id: 'note1', title: null, content: 'a', contentMode: null, groupName: null }));
  assert.throws(() => validateAiUpdateNoteArgs({ id: 'note1', title: null, content: 'x'.repeat(24001), contentMode: 'replace', groupName: null }));
  assert.throws(() => validateAiUpdateNoteArgs({ id: 'note1', title: null, content: null, contentMode: null, groupName: 'x'.repeat(51) }));
});

test('AI append preserves original rich HTML, forbids other owner, prevents stale writes and resolves group by owner', async () => {
  const updatedAt = new Date('2026-10-18T10:00:00Z');
  const note = { id: 'note1', userId: 'owner', title: 'Идеи', content: '<ul><li>План</li></ul>', groupId: null as string | null, updatedAt };
  let writes = 0;
  const db = {
    standaloneNote: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === note.id && where.userId === note.userId ? { ...note } : null,
      updateMany: async ({ where, data }: { where: { id: string; userId: string; updatedAt: Date }; data: Record<string, unknown> }) => {
        if (where.id !== note.id || where.userId !== note.userId ||
            where.updatedAt.getTime() !== note.updatedAt.getTime()) return { count: 0 };
        Object.assign(note, data);
        note.updatedAt = new Date(note.updatedAt.getTime() + 1000);
        writes++;
        return { count: 1 };
      }
    },
    standaloneNoteGroup: {
      findFirst: async ({ where }: { where: { userId: string; name: { equals: string } } }) =>
        where.userId === 'owner' && where.name.equals === 'Работа'
          ? { id: 'group1', name: 'Работа' } : null
    }
  };
  const service = createAiPersonalNotesService(db as unknown as Parameters<typeof createAiPersonalNotesService>[0]);
  const input = { id: 'note1', title: null, content: '<script>alert(1)</script>',
    contentMode: 'append', groupName: 'Работа' };
  const result = await service.update('owner', input);
  assert.equal(result.ok, true);
  assert.equal(note.groupId, 'group1');
  assert.match(note.content, /^<ul><li>План<\/li><\/ul><p>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/p>$/);
  assert.equal(writes, 1);
  const other = await service.update('not-owner', input);
  assert.equal(other.ok, false);
  assert.equal(writes, 1);
  const missingGroup = await service.update('owner', { ...input, groupName: 'Чужая' });
  assert.equal(missingGroup.ok, false);
  assert.equal(writes, 1);
  assert.equal(selectRequiredPersonalLookup('Допиши в мою заметку про выставку новый пункт'), 'search_notes');
});

test('tool requires search and read of same owner-scoped note before writing', async () => {
  const [tools, assistant, web, mini, expanded, style] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/ExpandedAiChat.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(tools, /name: 'update_note', strict: true/);
  assert.match(tools, /resolvedNoteIds\.has\(id\) \|\| !readNoteIds\.has\(id\)/);
  assert.match(tools, /preparedTaskActions\.push\(\{ operation: 'update_note', \.\.\.edit, expectedUpdatedAt \}\)/);
  assert.match(tools, /updatedNoteIds\.add\(id\)/);
  assert.match(assistant, /вызови update_note/);
  for (const source of [web, mini]) {
    assert.match(source, /newestFocusSubtaskFirst\(a, b\)/);
    assert.match(source, /urgentFocusSubtaskFirst\(a, b\)/);
  }
  assert.match(web, /quickAiFollowBottomRef\.current = true/);
  assert.match(web, /new ResizeObserver/);
  assert.match(expanded, /nearBottomRef\.current = true;\s*onSend\(value\)/);
  assert.match(expanded, /new ResizeObserver/);
  assert.match(mini, /generalAiChatNearBottomRef\.current = true;\s*updateActiveAiChatMessages/);
  assert.match(style, /body\[data-theme='dark'\] \.focused-task-inline-subtask-button/);
});

test('successful read_note authorizes update_note; failed and unsearched reads do not', async () => {
  const [tools, notes] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/personal-notes-tools.service.ts', import.meta.url), 'utf8')
  ]);
  const updateStart = tools.indexOf("if (name === 'update_note')");
  const updateEnd = tools.indexOf("if (name === 'search_workspace')", updateStart);
  const readStart = tools.indexOf("if (name === 'read_note')");
  const readEnd = tools.indexOf("if (name === 'search_tasks')", readStart);
  assert.ok(updateStart > 0 && updateEnd > updateStart && readStart > 0 && readEnd > readStart);
  const updateBlock = tools.slice(updateStart, updateEnd);
  const readBlock = tools.slice(readStart, readEnd);
  assert.match(updateBlock, /!resolvedNoteIds\.has\(id\) \|\| !readNoteIds\.has\(id\)/);
  assert.match(updateBlock, /aiPersonalNotesService\.update\(input\.userId, value\)/);
  const resolved = readBlock.indexOf("!resolvedNoteIds.has(noteId)");
  const fetched = readBlock.indexOf('personalNotesToolsService.read(input.userId, noteId)');
  const notFound = readBlock.indexOf("if (!note) return { ok: false");
  const authorized = readBlock.indexOf('readNoteIds.add(noteId)');
  const success = readBlock.indexOf('return { ok: true, note }');
  assert.ok(resolved >= 0 && fetched > resolved && notFound > fetched
    && authorized > notFound && success > authorized,
    'Must authorize only after successfully reading an owner-scoped, previously searched note');
  assert.match(notes, /where: \{ id, userId \}/,
    'read_note must scope its lookup to the authenticated note owner');
});
