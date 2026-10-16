import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeChatProjectSnapshots } from '../src/lib/ai-chat-project-sync.js';
import { formatTelegramTaskChanges } from '../src/lib/telegram-task-change-receipt.js';
import { reconcileActiveAiChatMessages, reconcileAiChatProjectOutline } from '../../client/src/lib/ai-chat-reconciliation.js';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('two devices can append messages to the same AI chat without overwriting either message', () => {
  const initial = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [{ id: 'm1', role: 'user', content: 'Привет' }] }
  ] }];
  const deviceA = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [
      { id: 'm1', role: 'user', content: 'Привет' },
      { id: 'm2', role: 'assistant', content: 'Ответ A' }
    ] }
  ] }];
  const deviceB = [{ id: 'personal', chats: [
    { id: 'work-chat', title: 'Работа', messages: [
      { id: 'm1', role: 'user', content: 'Привет' },
      { id: 'm3', role: 'assistant', content: 'Ответ B' }
    ] }
  ] }];
  const afterA = mergeChatProjectSnapshots(initial, deviceA);
  const afterB = mergeChatProjectSnapshots(afterA, deviceB);
  const saved = afterB[0].chats![0].messages!;
  assert.deepEqual(saved.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.equal(saved.filter(m => m.id === 'm1').length, 1);
  assert.equal(saved[0].content, 'Привет');
});

test('updating project names does not remove existing chat text and stays within history bounds', () => {
  const original = [{ id: 'p', title: 'Было', chats: [{ id: 'chat', messages: [
    { id: 'a', role: 'user', content: 'Старое сообщение' }
  ] }] }];
  const revised = mergeChatProjectSnapshots(original, [{ id: 'p', title: 'Стало',
    chats: [{ id: 'chat', messages: [{ id: 'b', role: 'assistant', content: 'Новое сообщение' }] }]
  }]);
  assert.equal(revised[0].title, 'Стало');
  assert.deepEqual(revised[0].chats![0].messages!.map(m => m.content), ['Старое сообщение', 'Новое сообщение']);
});

test('Telegram bot reports actual applied task changes and not just a generic chip message', () => {
  assert.deepEqual(formatTelegramTaskChanges({
    status: 'APPLIED', operations: [
      { type: 'create_task', title: 'Позвонить врачу', dueDate: '2026-10-19T12:30:00Z' },
      { type: 'complete', title: 'Отправить договор' },
      { type: 'rename', title: 'Старое название', after: 'title: Новое название' }
    ]
  }, 'Europe/Riga').map(v => v.split(' «')[0]), [
    'Создал задачу', 'Отметил выполненным', 'Переименовал'
  ]);
  assert.match(formatTelegramTaskChanges({
    status: 'APPLIED', operations: [{ type: 'reschedule', title: 'Задача', dueDate: '2026-10-19T12:30:00Z' }]
  }, 'Europe/Riga')[0], /19 октября 2026/);
  assert.deepEqual(formatTelegramTaskChanges({ status: 'PENDING', operations: [] }), []);
  assert.match(formatTelegramTaskChanges({ status: 'FAILED', error: 'Нет доступа', operations: [] })[0], /не применены/);
});

test('both clients update only the open conversation, like task chat, and never poll entire projects', () => {
  const site = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  for (const script of [site, mini]) {
    assert.match(script, /api\.getAiChatThreadMessages\(projectId, chatId\)/);
    assert.match(script, /reconcileActiveAiChatMessages\(/);
    assert.match(script, /reconcileAiChatProjectOutline\(/);
    assert.match(script, /2[_,]?500/);
    assert.doesNotMatch(script, /12_000/);
    assert.match(script, /aiChatProjectsRemoteSnapshotRef\.current = JSON\.stringify\(updated\)/);
  }
  const activeApi = source('../src/routes/api.ts');
  assert.match(activeApi, /ai-chat\/projects\/:projectId\/chats\/:chatId\/messages/);
  assert.match(activeApi, /projectsOutline: outline/);
  const assistant = source('../src/services/ai-assistant.service.ts');
  const controller = source('../src/controllers/ai.controller.ts');
  assert.match(assistant, /createdAt: message\.createdAt\.toISOString\(\)/);
  assert.match(assistant, /id: message\.id/);
  assert.doesNotMatch(controller.slice(controller.indexOf('getGeneralAssistantHistory:'), controller.indexOf('askGeneralAssistant:')), /todayUtc/);
  const bot = source('../src/services/telegram.service.ts');
  assert.ok((bot.match(/listGeneralDialog\(\{ userId: session\.userId \}\)/g) ?? []).length >= 2);
});

test('chat reconciliation does not rerender identical messages or replace unsent optimistic tail', () => {
  const local = [{ id: 'a', role: 'user' as const, content: 'Текст' },
    { id: 'b', role: 'assistant' as const, content: 'Ответ' }];
  assert.strictEqual(reconcileActiveAiChatMessages(local, local.map(m => ({ ...m })), false), local);
  assert.strictEqual(reconcileActiveAiChatMessages(local, [local[0]], false), local);
  const changed = [{ ...local[0] }, { ...local[1], content: 'Новый ответ' }];
  assert.deepEqual(reconcileActiveAiChatMessages(local, changed, false), changed);
  assert.strictEqual(reconcileActiveAiChatMessages(local, changed, true), local);
});

test('project index reconciliation preserves every unchanged conversation and selected message object', () => {
  const messages = [{ id: 'a', role: 'user' as const, content: 'Отправлено' }];
  const local = [{ id: 'p', title: 'Личный проект', color: '#fff', icon: '✨',
    chats: [{ id: 'c', title: 'Тема', messages }] }];
  const sameOutline = [{ id: 'p', title: 'Личный проект', color: '#fff', icon: '✨',
    chats: [{ id: 'c', title: 'Тема' }] }];
  assert.strictEqual(reconcileAiChatProjectOutline(local, sameOutline), local);
  const renamed = reconcileAiChatProjectOutline(local, [{ ...sameOutline[0], chats: [{ id: 'c', title: 'Новая тема' }] }]);
  assert.notStrictEqual(renamed, local);
  assert.strictEqual(renamed[0].chats[0].messages, messages);
  assert.strictEqual(renamed[0].chats[0].title, 'Новая тема');
});
