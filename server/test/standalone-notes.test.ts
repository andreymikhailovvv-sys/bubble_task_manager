import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NoteInputError, validateStandaloneNotePayload } from '../src/controllers/standalone-note.controller.js';

test('notes input accepts plain or rich text with independent title', () => {
  assert.deepEqual(validateStandaloneNotePayload({}, false), {});
  const rich = '<h1>План</h1><ul><li>Подготовить письмо</li></ul><p><strong>Важно</strong></p>';
  assert.deepEqual(validateStandaloneNotePayload({ title: '  Планы  ', content: rich }, false), {
    title: 'Планы', content: rich
  });
  assert.deepEqual(validateStandaloneNotePayload({ content: '<ol><li>1</li></ol>' }, true), {
    content: '<ol><li>1</li></ol>'
  });
});

test('notes validation rejects oversized, unknown and malformed fields', () => {
  const invalid = [
    [null, false],
    [[], false],
    [{ title: 42 }, false],
    [{ title: 'x'.repeat(161) }, false],
    [{ content: 'x'.repeat(120001) }, false],
    [{ userId: 'another-user' }, false],
    [{}, true],
    [{ content: null }, true]
  ] as Array<[unknown,boolean]>;
  for (const [value, partial] of invalid) {
    assert.throws(() => validateStandaloneNotePayload(value, partial), NoteInputError);
  }
});

test('notes model is separate from tasks and belongs to one user', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../prisma/migrations/20261012010000_add_standalone_notes/migration.sql', import.meta.url), 'utf8');
  const model = schema.match(/model StandaloneNote \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(model, /userId\s+String/);
  assert.match(model, /user\s+User\s+@relation\(fields: \[userId\]/);
  assert.match(model, /@@index\(\[userId, updatedAt\]\)/);
  assert.doesNotMatch(model, /taskId|sphereId/);
  assert.match(migration, /CREATE TABLE "StandaloneNote"/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test('all note endpoints are authenticated and mutations scoped to current user', async () => {
  const [routes, controller] = await Promise.all([
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/standalone-note.controller.ts', import.meta.url), 'utf8')
  ]);
  for (const endpoint of [
    "get('/notes'", "post('/notes'", "patch('/notes/:id'", "delete('/notes/:id'"
  ]) {
    assert.ok(routes.includes(endpoint + ', requireAuth'), endpoint);
  }
  assert.match(controller, /where: \{ userId: req\.user!\.id \}/);
  const mutationGuards = controller.match(/where: \{ id: req\.params\.id, userId: req\.user!\.id \}/g) ?? [];
  assert.ok(mutationGuards.length >= 3, 'Update, fetch-after-update and delete must filter userId');
  assert.match(controller, /deleteMany/);
  assert.match(controller, /updateMany/);
  assert.match(controller, /orderBy: \[\{ updatedAt: 'desc' \}/);
});

test('sidebar list opens rich editor and renders safely formatted board cards', async () => {
  const [component, editor, app, notesLib, css] = await Promise.all([
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/NotesEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/notes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const widget = app.indexOf('<StandaloneNotesWorkspace');
  assert.ok(widget > app.indexOf('Управление секторами'));
  assert.ok(widget < app.indexOf('</aside>', widget));
  assert.match(component, /notes\.slice\(0, 3\)/);
  assert.match(component, /standalone-notes-grid/);
  assert.match(component, /noteValueToEditorHtml\(note\.content\)/);
  assert.match(component, /<NotesEditor/);
  assert.match(component, /onClose=\{\(\) => \{ void closeEditor\(\); \}\}/);
  assert.match(component, /api\.updateStandaloneNote/);
  assert.match(component, /api\.deleteStandaloneNote/);
  assert.match(notesLib, /sanitizeNoteHtml/);
  assert.match(editor, /titleEditor\?: ReactNode/);
  assert.match(css, /body\[data-theme='dark'\] \.standalone-note-accent/);
  assert.match(css, /\.standalone-note-preview h1/);
  assert.match(css, /\.standalone-note-preview ol/);
});
