import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAiPersonalNotesService, aiNoteTextToHtml, requiresNoteCreation, validateAiCreateNoteArgs } from '../src/services/ai-create-note.service.js';

test('explicit note creation is recognized without forcing normal chat or a question', () => {
  for (const command of [
    'Создай заметку: купить молоко и хлеб сегодня',
    'Добавь новую заметку про выставку и маршрутный лист',
    'Запиши в заметки, что нужно подготовить маршрут',
    'Сохрани это как заметку, чтобы не потерять'
  ]) assert.equal(requiresNoteCreation(command), true, command);
  for (const command of [
    'Привет, как дела?',
    'Найди мои заметки про маршрут',
    'Объясни, как создать заметку',
    'Не создавай заметку про выставку',
    'Создай заметку',
    'Создай задачу купить продукты',
    'В чём разница между задачами и заметками?'
  ]) assert.equal(requiresNoteCreation(command), false, command);
});

test('AI note data is bounded and encoded as safe rich editor HTML', () => {
  const spec = validateAiCreateNoteArgs({
    title: '  Моя заметка  ', content: 'Первый пункт\n\n<script>alert(1)</script>',
    groupName: null
  });
  assert.equal(spec.title, 'Моя заметка');
  const html = aiNoteTextToHtml(spec.content);
  assert.match(html, /<p>Первый пункт<\/p>/);
  assert.match(html, /<p><br><\/p>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.throws(() => validateAiCreateNoteArgs({ title: '', content: '', groupName: null }));
  assert.throws(() => validateAiCreateNoteArgs({ title: 'x'.repeat(161), content: '', groupName: null }));
  assert.throws(() => validateAiCreateNoteArgs({ title: 'Тест', content: 'x'.repeat(12001), groupName: null }));
});

test('AI creates an owner-scoped note, only in an existing group belonging to user', async () => {
  const records: Record<string, unknown>[] = [];
  const db = {
    standaloneNoteGroup: { findFirst: async (options: {where:{userId:string;name:{equals:string}}}) =>
      options.where.userId === 'owner' && options.where.name.equals === 'Идеи'
        ? { id: 'group-1', name: 'Идеи' } : null },
    standaloneNote: { create: async (options: { data: Record<string, unknown> }) => {
      records.push(options.data);
      return { id: 'note-1', title: options.data.title, groupId: options.data.groupId,
        createdAt: new Date('2026-10-12T09:00:00Z') };
    } }
  };
  const service = createAiPersonalNotesService(db as unknown as Parameters<typeof createAiPersonalNotesService>[0]);
  const ok = await service.create('owner', { title: 'Мысли', content: '<b>Текст</b>', groupName: 'Идеи' });
  assert.equal(ok.ok, true);
  assert.deepEqual(records[0], { userId: 'owner', title: 'Мысли',
    content: '<p>&lt;b&gt;Текст&lt;/b&gt;</p>', groupId: 'group-1' });
  const failed = await service.create('other-user', { title: 'Чужая', content: 'Текст', groupName: 'Идеи' });
  assert.equal(failed.ok, false);
  assert.equal(records.length, 1, 'No note is created when the group is not owned');
});

test('general AI and Telegram voice share create_note, return confirmation and avoid duplicate writes', async () => {
  const [tools, assistant, voice] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(tools, /name: 'create_note', strict: true/);
  assert.match(tools, /if \(name === 'create_note'\)/);
  assert.match(tools, /if \(noteCreated\)/);
  assert.match(tools, /aiPersonalNotesService\.create\(input\.userId, value\)/);
  assert.match(tools, /actionReports\.push\('Создана заметка/);
  assert.match(assistant, /requiresNoteCreation\(question\) \? 'create_note'/);
  assert.match(assistant, /Для явного создания самостоятельной заметки вызывай create_note/);
  const transcriptHandler = voice.slice(voice.indexOf('const transcript = transcription.text'), voice.indexOf('const nextHistory:', voice.indexOf('const transcript = transcription.text')));
  assert.match(transcriptHandler, /aiAssistantService\.askAiChat/);
  assert.match(transcriptHandler, /question: transcript/);
});

test('board searches title and content together, preserving selected group and themed search styling', async () => {
  const [board, styles] = await Promise.all([
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(board, /searchQuery/);
  assert.match(board, /note\.title \+ ' ' \+ noteHtmlToPlainText\(note\.content\)/);
  assert.match(board, /terms\.every\(term => searchable\.includes\(term\)\)/);
  assert.match(board, /selectedGroup === 'ungrouped'/);
  assert.match(board, /aria-label="Поиск по названию и содержимому заметок"/);
  assert.match(board, /По запросу ничего не найдено/);
  assert.match(styles, /\.standalone-notes-search:focus-within/);
  assert.match(styles, /background: var\(--field-bg\)/);
});


test('notes search sits below the top actions beside the groups without an oversized gap', async () => {
  const [board, styles] = await Promise.all([
    readFile(new URL('../../client/src/components/StandaloneNotesWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  const start = board.indexOf('standalone-notes-board-header flex');
  const end = board.indexOf('{error ? <p role="alert"', start);
  const header = board.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(header, /standalone-notes-board-header flex flex-col gap-2/);
  assert.ok(header.indexOf('Мои заметки') < header.indexOf('standalone-group-filter'));
  assert.ok(header.indexOf('Новая заметка') < header.indexOf('standalone-notes-search'),
    'Search must be on the row below the new-note and close buttons');
  assert.ok(header.indexOf('standalone-group-filter') < header.indexOf('standalone-notes-search'),
    'Group filters must stay on the left, search on the right');
  assert.match(header, /standalone-notes-board-filters flex min-w-0 flex-col gap-2 sm:flex-row/);
  assert.match(header, /standalone-notes-search[^"]*overflow-hidden/);
  const searchStyle = styles.match(/\.standalone-notes-search:focus-within\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(searchStyle, /border-color:\s*var\(--field-border\)/);
  assert.match(searchStyle, /box-shadow:\s*none/);
  assert.doesNotMatch(searchStyle, /var\(--focus-ring\)|var\(--accent\)/);
  assert.match(styles, /\.standalone-notes-search input:focus-visible/);
  assert.match(styles, /--tw-ring-shadow:\s*0 0 #0000 !important/);
  assert.match(styles, /\.standalone-notes-search \{[^}]*overflow:\s*hidden/s);
});

test('latest news describes notes and both theme variants without low-contrast fixed text', async () => {
  const [news, styles] = await Promise.all([
    readFile(new URL('../../client/src/components/UpdatesMenu.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(news, /LATEST_NEWS_ID = '2026-10-12-personal-notes-and-ai'/);
  assert.ok(news.indexOf('12 октября 2026') < news.indexOf('11 октября 2026'));
  for (const phrase of ['Личные заметки', 'Группы, цвета и быстрый поиск',
    'Заметки вместе с ИИ и Telegram', 'Все записи доступны в одном аккаунте']) {
    assert.ok(news.includes(phrase), phrase);
  }
  assert.match(styles, /\.updates-news-notes-feature/);
  assert.match(styles, /body\[data-theme='dark'\] \.updates-news-notes-feature/);
  assert.match(styles, /color: var\(--text-primary\)/);
});
