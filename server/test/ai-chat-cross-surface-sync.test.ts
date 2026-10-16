import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeChatProjectSnapshots } from '../src/lib/ai-chat-project-sync.js';
import { formatTelegramTaskChanges } from '../src/lib/telegram-task-change-receipt.js';

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

test('both clients poll shared AI projects and canonical quick history', () => {
  const site = source('../../client/src/App.tsx');
  const mini = source('../../client/src/MiniApp.tsx');
  for (const script of [site, mini]) {
    assert.match(script, /api\.getGeneralAssistantHistory\(\)/);
    assert.match(script, /api\.getAiChatProjects</);
    assert.match(script, /aiChatProjectsRemoteSnapshotRef\.current = nextHash/);
    assert.match(script, /visibilitychange/);
    assert.match(script, /12_000/);
  }
  const assistant = source('../src/services/ai-assistant.service.ts');
  const controller = source('../src/controllers/ai.controller.ts');
  assert.match(assistant, /createdAt: message\.createdAt\.toISOString\(\)/);
  assert.match(assistant, /id: message\.id/);
  assert.doesNotMatch(controller.slice(controller.indexOf('getGeneralAssistantHistory:'), controller.indexOf('askGeneralAssistant:')), /todayUtc/);
  const bot = source('../src/services/telegram.service.ts');
  assert.ok((bot.match(/listGeneralDialog\(\{ userId: session\.userId \}\)/g) ?? []).length >= 2);
});
