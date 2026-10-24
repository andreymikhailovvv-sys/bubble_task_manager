import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeChatProjectSnapshots, chronologicalChatMessages } from '../src/lib/ai-chat-project-sync.js';
import { orderAiChatMessagesChronologically } from '../../client/src/lib/ai-chat-reconciliation.js';
import { prisma } from '../src/db/prisma.js';
import { aiAssistantService } from '../src/services/ai-assistant.service.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 12, minute)).toISOString();

test('quick chat keeps chronological last 20 after an outdated device reuploads older messages', () => {
  const latest = Array.from({ length: 24 }, (_, i) => ({
    id: 'm-' + i,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'message ' + i,
    createdAt: at(i)
  }));
  const initial = [{ id: 'personal', chats: [{
    id: 'quick-ai-requests', title: 'Быстрые запросы', messages: latest
  }] }];
  // Device B was offline and now appends a 12:03 message after messages at 12:23.
  const stale = [{ id: 'personal', chats: [{
    id: 'quick-ai-requests', title: 'Быстрые запросы',
    messages: [{ id: 'old-from-device', role: 'user', content: 'older', createdAt: at(3) }]
  }] }];
  const after = mergeChatProjectSnapshots(initial, stale);
  const messages = after[0].chats?.[0].messages ?? [];
  assert.equal(messages.length, 25);
  assert.equal(messages[0].id, 'm-0');
  assert.equal(messages[4].id, 'old-from-device');
  assert.equal(messages.at(-1)?.id, 'm-23');

  const last20 = chronologicalChatMessages(messages).slice(-20);
  assert.deepEqual(last20.map(m => m.id), latest.slice(-20).map(m => m.id));
  assert.deepEqual(orderAiChatMessagesChronologically(messages).slice(-20).map(m => m.id),
    latest.slice(-20).map(m => m.id));
});

test('the last question and response remain adjacent to the next question even with a stale tail', () => {
  const scrambled = [
    { id: 'u1', role: 'user', content: 'Гарнир к щучьим котлетам?', createdAt: at(10) },
    { id: 'a1', role: 'assistant', content: 'Пюре', createdAt: at(11) },
    { id: 'u2', role: 'user', content: 'Кроме картошки?', createdAt: at(12) },
    { id: 'old', role: 'assistant', content: 'Старый ответ', createdAt: at(1) }
  ];
  const sorted = orderAiChatMessagesChronologically(scrambled);
  assert.deepEqual(sorted.slice(-3).map(x => x.id), ['u1', 'a1', 'u2']);
});

test('legacy messages without timestamps remain in stable order and do not replace dated latest turns', () => {
  const legacy = [{ id: 'old1', content: 'old 1' }, { id: 'old2', content: 'old 2' }];
  const recent = [{ id: 'new1', content: 'new 1', createdAt: at(10) },
    { id: 'new2', content: 'new 2', createdAt: at(11) }];
  assert.deepEqual(orderAiChatMessagesChronologically([...recent, ...legacy]),
    [...legacy, ...recent]);
});

test('server routes quick model prompts from persisted DB history, not stale browser transcript', () => {
  const controller = read('../src/controllers/ai.controller.ts');
  const quick = controller.slice(controller.indexOf('  askAiChat: async'), controller.indexOf('  getGeneralAssistantHistory:'));
  assert.match(quick, /const serverQuickHistory = isQuickChat/);
  assert.match(quick, /excludeMonitoringMessages: true/);
  assert.match(quick, /const promptHistory = isQuickChat && serverQuickHistory\.length > 0/);
  assert.match(quick, /history: promptHistory/);
  assert.match(quick, /if \(isQuickChat\)/);
});

test('both web and miniapp always send chronological quick context', () => {
  const web = read('../../client/src/App.tsx');
  const mini = read('../../client/src/MiniApp.tsx');
  assert.ok(web.includes('quickAiChatMessages.filter(message => !message.monitoringTaskId)'));
  assert.ok(mini.includes('activeAiChat.messages.filter(message => !message.monitoringTaskId)'));
  assert.match(mini, /role: 'user', content: userMessageContent, createdAt:/);
  assert.match(mini, /role: 'assistant', createdAt:/);
});

test('the quick prompt excludes monitoring broadcasts without hiding them from the UI feed', async () => {
  const original = prisma.generalAiMessage.findMany;
  const queries: Array<Record<string, any>> = [];
  (prisma.generalAiMessage.findMany as any) = async (query: any) => {
    queries.push(query);
    return [];
  };
  try {
    await aiAssistantService.listGeneralDialog({ userId: 'owner', excludeMonitoringMessages: true });
    await aiAssistantService.listGeneralDialog({ userId: 'owner' });
    assert.equal(queries.length, 2);
    assert.equal(queries[0].where.monitoringTaskId, null);
    assert.equal(queries[0].take, 100);
    assert.equal(queries[1].where.monitoringTaskId, undefined,
      'visible Quick AI history must continue to include monitoring messages');
  } finally {
    (prisma.generalAiMessage.findMany as any) = original;
  }
});
