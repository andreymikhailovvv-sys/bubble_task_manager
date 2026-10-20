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
  assert.match(notes, /content: data\.content \?\? '', groupId: data\.groupId \?\? null/);
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

test('group assignment is included in server responses and reflected immediately', async () => {
  const [controller, board] = await Promise.all([
    readFile(new URL('../src/controllers/standalone-note.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8')
  ]);
  // GET, POST and PATCH must all return groupId. Without it, the frontend
  // replaces a correctly saved note with a response lacking its group.
  const projections = controller.match(/select: \{ id: true, title: true, content: true, groupId: true, createdAt: true, updatedAt: true \}/g) ?? [];
  assert.equal(projections.length, 3, 'List, create and update must select groupId');
  assert.match(controller, /updateMany\(\{\s*where: \{ id: req\.params\.id, userId: req\.user!\.id \}, data/);
  assert.match(board, /api\.updateStandaloneNote\(noteId, \{ groupId \}\)/);
  assert.match(board, /saved\.groupId !== groupId/);
  assert.match(board, /groupId: original\.groupId/);
  assert.match(board, /Не удалось присвоить группу/);
});

test('notes window orders header, groups, and card actions correctly', async () => {
  const board = await readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8');
  const boardStart = board.indexOf('className="standalone-notes-board-header');
  const boardEnd = board.indexOf('{error ? <p role="alert"', boardStart);
  const header = board.slice(boardStart, boardEnd);
  assert.ok(boardStart > 0 && boardEnd > boardStart);
  assert.ok(header.indexOf('Личные записи') < header.indexOf('standalone-group-filter'),
    'Heading should be above group chips');
  assert.ok(header.indexOf('Мои заметки') < header.indexOf('standalone-group-filter'));
  assert.ok(header.indexOf('standalone-group-manage') < header.indexOf("selectedGroup === 'all'"),
    'Group manager should be leftmost control');
  assert.ok(header.indexOf('standalone-group-add') > header.indexOf('groups.map(group'),
    'Add group must be last after all group tags');
  assert.doesNotMatch(board, /Редактировать заметку «/);
  assert.doesNotMatch(board, /FilePenLine/);
  assert.match(board, /onClick=\{\(\) => openEditor\(note\)\}/,
    'Click on the card itself must continue opening the editor');
});


test('sector-backed groups are linked to the owner sphere; custom groups remain independent', async () => {
  const [schema, migration, sync, controller, board, manager, api] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../prisma/migrations/20261020095000_link_note_groups_to_spheres/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/sector-note-groups.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/standalone-note-group.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/StandaloneNoteGroupManager.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8')
  ]);
  const noteGroup = schema.match(/model StandaloneNoteGroup \{[\s\S]*?\n\}/)?.[0] ?? '';
  const sphere = schema.match(/model Sphere \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(noteGroup, /sphereId\s+String\?\s+@unique/);
  assert.match(noteGroup, /sphere\s+Sphere\?\s+@relation\(fields: \[sphereId\], references: \[id\], onDelete: SetNull\)/);
  assert.match(sphere, /noteGroup\s+StandaloneNoteGroup\?/);
  assert.match(migration, /ADD COLUMN "sphereId" TEXT/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(sync, /prisma\.sphere\.findMany\(\{ where: \{ userId \}/);
  assert.match(sync, /prisma\.standaloneNoteGroup\.findMany\(\{ where: \{ userId \}/);
  assert.match(sync, /prisma\.standaloneNoteGroup\.createMany/);
  assert.match(sync, /prisma\.standaloneNoteGroup\.updateMany/);
  assert.match(sync, /skipDuplicates: true/);
  assert.match(controller, /await syncSectorNoteGroups\(req\.user!\.id\)/);
  assert.match(controller, /select = \{ id: true, name: true, color: true, sphereId: true/);
  assert.match(controller, /if \(linked\?\.sphereId\)/);
  assert.match(board, /Boolean\(b\.sphereId\)/);
  assert.match(manager, /group\.sphereId \?/);
  assert.match(api, /sphereId: string \| null/);
});

test('mobile note cards are compact and both scrollbars hidden without blocking scrolling', async () => {
  const [board, css, mini] = await Promise.all([
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(board, /standalone-notes-scroll-area min-h-0 flex-1 overflow-y-auto/);
  assert.match(board, /standalone-group-filter flex[^"]*overflow-x-auto/);
  assert.match(css, /\.standalone-notes-mobile \.standalone-group-filter::\-webkit-scrollbar/);
  assert.match(css, /\.standalone-notes-mobile \.standalone-notes-scroll-area::\-webkit-scrollbar/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /\.standalone-notes-mobile \.standalone-note-card \{\s*min-height: 8\.5rem;/);
  assert.match(css, /\-webkit-line-clamp: 3;/);
  assert.match(mini, /mode="mobile" onClose/);
});

test('Telegram deep-link chat header remains visible during auto scroll then follows user swipes', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(mini, /launchParams\.openTelegramAiChat/);
  assert.match(mini, /launchParams\.openQuickAi/);
  assert.match(mini, /generalAiChatUserScrollEnabledRef = useRef\(false\)/);
  assert.match(mini, /generalAiChatUserScrollEnabledRef\.current = false;\s*setIsGeneralAiChatHeaderHidden\(false\)/);
  assert.match(mini, /if \(!generalAiChatUserScrollEnabledRef\.current\) \{[\s\S]*?return;\s*\}\s*updateAiChatHeaderVisibility/);
  assert.match(mini, /onWheel=\{\(\) => \{ generalAiChatUserScrollEnabledRef\.current = true; \}\}/);
  assert.match(mini, /onTouchMove=\{\(\) => \{ generalAiChatUserScrollEnabledRef\.current = true; \}\}/);
  assert.match(mini, /setIsHidden\(delta > 0\)/);
});
