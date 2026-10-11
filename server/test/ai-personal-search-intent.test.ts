import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selectRequiredPersonalLookup } from '../src/services/ai-personal-search-intent.js';

test('note-specific retrieval always chooses personal note search', () => {
  for (const query of [
    'Найди мою заметку про выставку',
    'Найди в заметках про SEBERO',
    'Поищи в заметках информацию об Афине',
    'Прочитай заметку про встречу',
    'Что у меня в моих заметках про проект?',
    'Покажи содержимое заметки'
  ]) assert.equal(selectRequiredPersonalLookup(query), 'search_notes', query);
});

test('uncertain stored data source always searches notes and tasks together', () => {
  for (const query of [
    'Я где-то писал про Афину, найди',
    'Где я записал идеи выставки?',
    'Что у меня было про маршрутный лист?',
    'Найди в задачах и заметках всё про ВДНХ',
    'Я где-то упоминал этот проект, напомни что писал'
  ]) assert.equal(selectRequiredPersonalLookup(query), 'search_workspace', query);
});

test('ordinary questions and modifications are not forced to search notes', () => {
  for (const query of [
    'Привет',
    'Расскажи про космос',
    'Добавь новую заметку',
    'Создай задачу позвонить Андрею',
    'Объясни, как работает поиск заметок',
    'Я записал название выставки'
  ]) assert.equal(selectRequiredPersonalLookup(query), null, query);
});

test('explicit note lookups require first tool call, not only an optional prompt', async () => {
  const [chat, assistant] = await Promise.all([
    readFile(new URL('../src/services/ai-chat-tools.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8')
  ]);
  assert.match(chat, /providerCallIndex === 1 && input\.requiredLookupTool/);
  assert.match(chat, /\{ type: 'function' as const, name: requiredLookup \}/);
  assert.match(chat, /tool_choice: toolChoice/);
  // Creation uses create_note; retrieval still uses search_notes/search_workspace.
  assert.match(assistant, /requiredLookupTool: requiresNoteCreation\\(question\\) \\? 'create_note' : selectRequiredPersonalLookup\\(question\\)/);
  assert.match(chat, /requiredLookupTool\\?: 'search_workspace' \\| 'search_notes' \\| 'create_note'/);
});
