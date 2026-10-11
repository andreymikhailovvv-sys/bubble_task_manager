import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateNoteGroupPayload, NOTE_GROUP_COLORS, MAX_NOTE_GROUPS } from '../src/controllers/standalone-note-group.controller.js';
import { validateStandaloneNotePayload, NoteInputError } from '../src/controllers/standalone-note.controller.js';

test('note group names and curated colors are validated', () => {
  assert.deepEqual(validateNoteGroupPayload({ name: '  Идеи  ', color: '#8b5cf6' }),
    { name: 'Идеи', color: '#8b5cf6' });
  assert.equal(validateNoteGroupPayload({ name: 'Работа' }).color, '#8b5cf6');
  assert.ok(NOTE_GROUP_COLORS.length >= 6);
  assert.equal(MAX_NOTE_GROUPS, 40);
  for (const payload of [
    null, [], {}, { name: '' }, { name: ' ' }, { name: 'x'.repeat(51) },
    { name: 'Идеи', color: '#ff0000' }, { name: 'Идеи', color: 'red' },
    { name: 'Идеи', userId: 'someone-else' }
  ]) {
    assert.throws(() => validateNoteGroupPayload(payload), NoteInputError);
  }
});

test('note changes accept only safe group ID or null, reject extra fields', () => {
  assert.deepEqual(validateStandaloneNotePayload({ groupId: 'group_123' }, true), { groupId: 'group_123' });
  assert.deepEqual(validateStandaloneNotePayload({ groupId: null }, true), { groupId: null });
  for (const groupId of [0, undefined, [], '', 'x'.repeat(129)]) {
    assert.throws(() => validateStandaloneNotePayload({ groupId }, true), NoteInputError);
  }
  assert.throws(() => validateStandaloneNotePayload({ groupId: 'id', userId: 'other' }, true), NoteInputError);
});

test('Prisma schema uses optional group membership and preserves notes when a group is deleted', async () => {
  const [schema,migration] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261012022000_add_standalone_note_groups/migration.sql', import.meta.url), 'utf8')
  ]);
  const note = schema.match(/model StandaloneNote \{[\s\S]*?\n\}/)?.[0] ?? '';
  const group = schema.match(/model StandaloneNoteGroup \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(note, /groupId\s+String\?/);
  assert.match(note, /onDelete: SetNull/);
  assert.match(group, /userId\s+String/);
  assert.match(group, /@@unique\(\[userId, name\]\)/);
  assert.match(migration, /ALTER TABLE "StandaloneNote" ADD COLUMN "groupId" TEXT/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
});

test('group endpoints enforce authentication and filter all changes by user ID', async () => {
  const [routes,groups,notes] = await Promise.all([
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/standalone-note-group.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/standalone-note.controller.ts', import.meta.url), 'utf8')
  ]);
  for(const path of [
    "get('/note-groups'", "post('/note-groups'", "patch('/note-groups/:id'", "delete('/note-groups/:id'"
  ]) assert.ok(routes.includes(path + ', requireAuth'), path);
  assert.match(groups, /where: \{ id: req\.params\.id, userId: req\.user!\.id \}/);
  assert.match(groups, /deleteMany/);
  assert.match(groups, /updateMany/);
  assert.match(groups, /sendGroupConflict/);
  assert.match(notes, /verifyGroupAccess\(req\.user!\.id, data\.groupId\)/);
  assert.match(notes, /where: \{ id: groupId, userId \}/);
  assert.match(notes, /groupId: true/);
});

test('board has group filter chips, plus last, group assignment and edit controls', async () => {
  const [board,manager,api,css] = await Promise.all([
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNoteGroupManager.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(board, /selectedGroup === 'ungrouped'/);
  assert.match(board, /notes\.filter\(note => note\.groupId === selectedGroup\)/);
  assert.match(board, /standalone-group-filter/);
  assert.ok(board.indexOf('Редактировать группы') < board.indexOf('Добавить группу'));
  assert.match(board, /aria-label=\{'Выбрать группу заметки/);
  assert.match(board, /api\.updateStandaloneNote\(noteId, \{ groupId \}\)/);
  assert.match(board, /setNotes\(current => current\.map\(note => note\.groupId === group\.id \? \{ \.\.\.note, groupId: null \}/);
  assert.match(manager, /NOTE_GROUP_COLOR_OPTIONS/);
  assert.match(manager, /Группы заметок/);
  assert.match(manager, /onDelete\(group\)/);
  assert.match(api, /getStandaloneNoteGroups/);
  assert.match(api, /deleteStandaloneNoteGroup/);
  assert.match(css, /body\[data-theme='dark'\] \.standalone-group-chip-colored/);
  assert.match(css, /\.standalone-group-swatch-selected/);
});
