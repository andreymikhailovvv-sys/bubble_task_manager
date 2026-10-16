import type { ChatMessage } from './types';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTelegramManagedMessages, reconcileAiChatMessagesWithChips, reconcileActiveAiChatMessages } from './ai-chat-reconciliation';
import { persistAiChatProjectsCache } from './ai-chat-storage';

test('Telegram summary polling leaves pending read-consent card and user replies intact', () => {
  const draft = { requestId: 'read-1', requestedChat: 'Работа', chatId: 'group:chat:1', chatName: 'Работа', match: 'exact' as const };
  const summary: ChatMessage & { id: string } = { id: 'summary-1', role: 'assistant', content: 'Сводка', taskProposal: { id: 'task-1', status: 'PENDING', source: 'telegram_assistant', autoApplied: false, operations: [], result: null, error: null } };
  const user = { id: 'user-1', role: 'user' as const, content: 'Прочитай переписку' };
  const chip = { id: 'chip-1', role: 'assistant' as const, content: 'Доступ требуется', telegramReadDraft: draft };
  const local: Array<ChatMessage & { id: string }> = [summary, user, chip];
  const feed = [{ ...summary }];
  assert.strictEqual(mergeTelegramManagedMessages(local, feed), local);
  const next = mergeTelegramManagedMessages(local, [{ ...summary, taskProposal: { id: 'task-1', status: 'APPLIED' } },
    { id: 'summary-2', role: 'assistant' as const, content: 'Новая сводка' }]);
  assert.deepEqual(next.map(message => message.id), ['summary-1', 'user-1', 'chip-1', 'summary-2']);
  assert.strictEqual(next[2], chip);
  assert.deepEqual(next[2].telegramReadDraft, draft);
  assert.equal(next[0].taskProposal?.status, 'APPLIED');
});

test('a large chat is compacted for browser storage without changing its in-memory contents', () => {
  const large = Array.from({ length: 100 }, (_, i) => ({
    id: String(i), role: 'assistant' as const, content: 'x'.repeat(9_000),
    telegramReadDraft: i === 99 ? { requestId: 'last', requestedChat: 'Работа', chatId: 'chat-1', chatName: 'Работа', match: 'exact' as const } : undefined
  }));
  const projects = [{ id: 'p', title: 'Проект', color: '#fff', icon: '✈️',
    chats: [{ id: 'c', title: 'Чат', messages: large }] }];
  const stored = new Map<string, string>();
  const storage = { setItem(key: string, value: string) { stored.set(key, value); } };
  persistAiChatProjectsCache(storage, 'ai', projects);
  const cached = JSON.parse(stored.get('ai')!);
  assert.equal(cached[0].chats[0].messages.length, 12);
  assert.equal(cached[0].chats[0].messages[0].id, '88');
  assert.equal(cached[0].chats[0].messages[11].telegramReadDraft.requestId, 'last');
  assert.ok(stored.get('ai')!.length < 55_000);
  assert.equal(projects[0].chats[0].messages.length, 100);
  assert.equal(projects[0].chats[0].messages[99].content.length, 9_000);
});

test('quota error falls back to metadata-only cache without an exception', () => {
  const projects = [{ id: 'p', title: 'Проект', color: '#fff', icon: '✈️',
    chats: [{ id: 'c', title: 'Чат', messages: [{ id: 'm', role: 'user' as const, content: 'x'.repeat(5_000) }] }] }];
  let saved = '';
  persistAiChatProjectsCache({ setItem(_key, data) {
    if (data.length > 200) throw new Error('QuotaExceededError');
    saved = data;
  } }, 'ai', projects);
  const data = JSON.parse(saved);
  assert.equal(data[0].chats[0].messages.length, 0);
  assert.equal(data[0].chats[0].title, 'Чат');
  assert.doesNotThrow(() => persistAiChatProjectsCache({ setItem() {
    throw new Error('Storage disabled');
  } }, 'ai', projects));
});

test('quick chat polling preserves an approved consent chip when server history lacks metadata', () => {
  const chip = { requestId: 'approval-1', requestedChat: 'Работа', chatName: 'Работа',
    chatId: 'group:chat:1', match: 'exact' as const };
  const original: Array<ChatMessage & { id: string }> = [
    { id: 'client-user', role: 'user', content: 'Прочитай мой чат' },
    { id: 'client-ai', role: 'assistant', content: 'Разрешите чтение',
      telegramReadDraft: chip },
    { id: 'client-new', role: 'assistant', content: 'Вот итог чтения' }
  ];
  // GeneralAiMessage rows have different IDs and no telegramReadDraft.
  const fromServer: Array<ChatMessage & { id: string }> = [
    { id: 'db-user', role: 'user', content: 'Прочитай мой чат' },
    { id: 'db-ai', role: 'assistant', content: 'Разрешите чтение' },
    { id: 'db-continuation', role: 'assistant', content: 'Вот итог чтения' }
  ];
  const merged = reconcileAiChatMessagesWithChips(original, fromServer);
  assert.strictEqual(merged, original);
  assert.strictEqual(merged[1], original[1]);
  assert.strictEqual(merged[1].telegramReadDraft, chip);
  assert.deepEqual(merged.map(m => m.id), ['client-user', 'client-ai', 'client-new']);
  assert.strictEqual(reconcileActiveAiChatMessages(original, merged, false), original);
  assert.strictEqual(reconcileAiChatMessagesWithChips(merged, fromServer), merged);
});

test('new remote messages append after old interactive cards without moving them', () => {
  const draft = { requestId: 'approval-2', requestedChat: 'Семья', chatName: null, chatId: null,
    match: 'not_found' as const };
  const initial: Array<ChatMessage & { id: string }> = [
    { id: 'a', role: 'assistant', content: 'Сначала подтвердите доступ', telegramReadDraft: draft },
    { id: 'b', role: 'assistant', content: 'Документ готов',
      generatedDocument: { id: 'document-1', fileName: 'result.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 } }
  ];
  const remote: Array<ChatMessage & { id: string }> = [
    { id: 'remote-old', role: 'assistant', content: 'Сначала подтвердите доступ' },
    { id: 'remote-document', role: 'assistant', content: 'Документ готов' },
    { id: 'new-answer', role: 'assistant', content: 'Проверил переписку' }
  ];
  const merged = reconcileAiChatMessagesWithChips(initial, remote);
  assert.deepEqual(merged.map(m => m.id), ['a', 'b', 'new-answer']);
  assert.strictEqual(merged[0], initial[0]);
  assert.strictEqual(merged[1], initial[1]);
  assert.strictEqual(merged[0].telegramReadDraft, draft);
  assert.strictEqual(merged[1].generatedDocument, initial[1].generatedDocument);
});

test('duplicate remote rows match local messages by occurrence without losing chips', () => {
  const chip = { requestId: 'keep-me', requestedChat: 'Чат', chatId: null, chatName: null, match: 'not_found' as const };
  const local: Array<ChatMessage & { id: string }> = [
    { id: 'a', role: 'assistant', content: 'Повтор', telegramReadDraft: chip },
    { id: 'b', role: 'assistant', content: 'Повтор' },
    { id: 'c', role: 'user', content: 'Повтор' }
  ];
  const remote: Array<ChatMessage & { id: string }> = [
    { id: 'server-one', role: 'assistant', content: 'Повтор' },
    { id: 'server-two', role: 'assistant', content: 'Повтор' },
    { id: 'server-three', role: 'user', content: 'Повтор' }
  ];
  assert.strictEqual(reconcileAiChatMessagesWithChips(local, remote), local);
  const next = reconcileAiChatMessagesWithChips(local, [...remote,
    { id: 'server-four', role: 'assistant', content: 'Новый ответ' }]);
  assert.deepEqual(next.map(message => message.id), ['a', 'b', 'c', 'server-four']);
  assert.strictEqual(next[0], local[0]);
  assert.strictEqual(next[0].telegramReadDraft, chip);
});

test('large unchanged chat reconciliation keeps original array and message references', () => {
  const local: Array<ChatMessage & { id: string }> = Array.from({ length: 600 }, (_, i) => ({
    id: `local-${i}`, role: i % 2 ? 'assistant' : 'user', content: `Сообщение ${i}`
  }));
  const remote = local.map((message, i) => ({ ...message, id: `remote-${i}` }));
  const next = reconcileAiChatMessagesWithChips(local, remote);
  assert.strictEqual(next, local);
  assert.strictEqual(next[300], local[300]);
});
