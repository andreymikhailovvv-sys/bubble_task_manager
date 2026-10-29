import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectExplicitTaskReferenceFile, type AiFileCatalog } from '../src/services/ai-file-catalog.service.js';
import { searchTaskChatHistory, TASK_CHAT_HISTORY_LOOKUP_TOOL } from '../src/services/task-chat-history-lookup.service.js';

const taskFile = (fileName: string, fileId: string, source: 'task_attachment' | 'chat_upload' | 'current_upload' = 'task_attachment') => ({
  fileId, source, fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 2000, contentAccess: 'tool_readable' as const
});

test('a named thematic plan is selected for owner-scoped pre-read instead of guessing its sections', () => {
  const catalog: AiFileCatalog = { version: 1, truncated: false, items: [
    taskFile('00_Тематический план Октябрь 2026 Космос (4).docx', 'task_attachment:a'),
    taskFile('Готовые программы VR.docx', 'task_attachment:b')
  ] };
  assert.equal(selectExplicitTaskReferenceFile('Посмотри в тематическом плане и составь связки VR с экскурсиями-лекциями', catalog)?.fileId, 'task_attachment:a');
  assert.equal(selectExplicitTaskReferenceFile('Обсудим совсем другую задачу', catalog), null);
});

test('a newly uploaded single document is read, but two ambiguous old documents are not guessed', () => {
  const current: AiFileCatalog = { version: 1, truncated: false, items: [
    taskFile('План экскурсионных программ.docx', 'current:0', 'current_upload')
  ] };
  assert.equal(selectExplicitTaskReferenceFile('В прикреплённом файле есть нужные данные', current)?.fileId, 'current:0');
  const ambiguous: AiFileCatalog = { version: 1, truncated: false, items: [
    taskFile('Тематический план Центр А.docx', 'task_attachment:a'),
    taskFile('Тематический план Центр Б.docx', 'task_attachment:b')
  ] };
  assert.equal(selectExplicitTaskReferenceFile('Посмотри в тематическом плане', ambiguous), null);
});

test('history lookup can recover rejected options and previously supplied VR constraints', () => {
  const history = Array.from({ length: 80 }, (_, index) => ({
    role: (index % 2 ? 'assistant' : 'user') as 'assistant' | 'user',
    content: index === 5
      ? 'У нас готовые VR-программы: ВДНХ, запуск ракеты, выход Леонова. Новые не придумывать.'
      : index === 7
        ? 'Экскурсии-лекции отличаются от тематических экскурсий, не путай их.'
        : 'Рабочий статус задачи № ' + index
  }));
  const found = searchTaskChatHistory(history, { query: 'экскурсии лекции', limit: 5 });
  assert.equal(found.ok, true);
  assert.equal(found.ok && found.results[0].index, 7);
  const vr = searchTaskChatHistory(history, { query: 'готовые VR-программы', limit: 5 });
  assert.equal(vr.ok, true);
  assert.equal(vr.ok && vr.results[0].index, 5);
  assert.equal(TASK_CHAT_HISTORY_LOOKUP_TOOL.name, 'task_history_lookup');
  assert.equal(searchTaskChatHistory(history, { query: '', limit: 5 }).ok, false);
});

test('task chat injects named document evidence and exposes task-scoped history retrieval', () => {
  const source = readFileSync(new URL('../src/services/ai-assistant.service.ts', import.meta.url), 'utf8');
  assert.match(source, /selectExplicitTaskReferenceFile\(question, fileCatalog\)/);
  assert.match(source, /executeAiFileTool\(\{/);
  assert.match(source, /referenceEvidence \? \[\{/);
  assert.match(source, /TASK_CHAT_HISTORY_LOOKUP_TOOL/);
  assert.match(source, /searchTaskChatHistory\(input.history, args\)/);
  assert.match(source, /reading_file:\$\{explicitReference.fileName\}/);
  assert.match(readFileSync(new URL('../../client/src/components/AiProgress.tsx', import.meta.url), 'utf8'), /Ищу в документе/);
});
