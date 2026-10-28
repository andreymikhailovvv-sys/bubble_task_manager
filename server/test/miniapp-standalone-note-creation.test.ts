import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateStandaloneNotePayload } from '../src/controllers/standalone-note.controller.js';

test('new standalone notes are valid without a task or sector', () => {
  assert.deepEqual(validateStandaloneNotePayload({}, false), {});
  assert.deepEqual(validateStandaloneNotePayload({ title: 'Встреча', content: '<h1>План</h1>' }, false),
    { title: 'Встреча', content: '<h1>План</h1>' });
});

test('Mini App quick-create menu orders event, note, task, then creates a new AI thread', async () => {
  const [mini, editor] = await Promise.all([
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/components/MiniAppStandaloneNoteEditor.tsx', import.meta.url), 'utf8')
  ]);
  const quick = mini.slice(mini.indexOf('miniapp-quick-create fixed'), mini.indexOf('miniapp-ai-chat-backdrop', mini.indexOf('miniapp-quick-create fixed')));
  assert.ok(quick.indexOf('Добавить событие') < quick.indexOf('Добавить заметку'));
  assert.ok(quick.indexOf('Добавить заметку') < quick.indexOf('Добавить задачу'));
  assert.ok(quick.indexOf('Добавить задачу') < quick.indexOf('Создать чат с ИИ'));
  assert.match(quick, /onClick=\{createQuickAiChatThread\}/);
  assert.match(mini, /const createQuickAiChatThread = \(\) => \{/);
  assert.match(mini, /setActiveAiChatId\(chat\.id\)/);
  assert.match(quick, /api\.createStandaloneNote\(\)/);
  assert.match(quick, /<MiniAppStandaloneNoteEditor/);
  assert.match(editor, /<NotesEditor/);
  assert.match(editor, /miniAppSheet/);
  assert.match(editor, /api\.updateStandaloneNote/);
  assert.match(editor, /await flush\(\)/);
  assert.match(editor, /Не удалось сохранить заметку/);
  assert.doesNotMatch(editor, /api\.createTask\(/);
});

test('active group chips never cast shadows beyond scroll container', async () => {
  const css = await readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8');
  const group = css.match(/\.standalone-group-chip:hover, \.standalone-group-chip-active \{([^}]+)\}/)?.[1] ?? '';
  assert.match(group, /box-shadow:\s*inset\b/);
  const filter = css.match(/\.standalone-group-filter \{([^}]+)\}/)?.[1] ?? '';
  assert.match(filter, /padding-top:\s*4px/);
});
