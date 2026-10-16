import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTelegramManagedMessages } from './ai-chat-reconciliation';
import { persistAiChatProjectsCache } from './ai-chat-storage';

test('Telegram summary polling leaves pending read-consent card and user replies intact', () => {
  const draft = { requestId: 'read-1', requestedChat: 'Работа', chatId: 'group:chat:1', chatName: 'Работа' };
  const summary = { id: 'summary-1', role: 'assistant' as const, content: 'Сводка', taskProposal: { id: 'task-1', status: 'PENDING' } };
  const user = { id: 'user-1', role: 'user' as const, content: 'Прочитай переписку' };
  const chip = { id: 'chip-1', role: 'assistant' as const, content: 'Доступ требуется', telegramReadDraft: draft };
  const local = [summary, user, chip];
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
    telegramReadDraft: i === 99 ? { requestId: 'last', requestedChat: 'Работа', chatId: 'chat-1', chatName: 'Работа' } : undefined
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
