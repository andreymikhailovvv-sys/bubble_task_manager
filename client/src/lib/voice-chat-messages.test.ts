import test from 'node:test';
import assert from 'node:assert/strict';
import { updateLiveVoiceProgress, preserveLiveVoiceMessages } from './voice-chat-messages';

test('live voice progress stays isolated by task and chat key', () => {
  const initial = { 'task-1': 'searching_tasks', 'project-1:chat-2': 'forming_answer' };
  const updated = updateLiveVoiceProgress(initial, 'task-1', 'reading_task');
  assert.equal(updated['task-1'], 'reading_task');
  assert.equal(updated['project-1:chat-2'], 'forming_answer');
  assert.equal(initial['task-1'], 'searching_tasks');
});

test('ending a call removes only its own progress', () => {
  const initial = { 'task-1': 'searching_tasks', 'task-2': 'forming_answer' };
  const updated = updateLiveVoiceProgress(initial, 'task-1', null);
  assert.deepEqual(updated, { 'task-2': 'forming_answer' });
  assert.equal(updateLiveVoiceProgress(updated, 'task-1', null), updated);
  assert.equal(updateLiveVoiceProgress(updated, 'task-2', 'forming_answer'), updated);
});

test('mini-app polling cannot erase spoken AI and voice action cards', () => {
  const local = [
    { id: 'spoke-1', role: 'assistant', content: 'Сейчас посмотрю', createdAt: '2026-11-01T10:01:00Z' },
    { id: 'card-1', role: 'assistant', content: 'Нашёл три задачи', createdAt: '2026-11-01T10:01:03Z', taskProposal: { id: 'proposal-1' } }
  ];
  const remote = [{ id: 'server-1', role: 'user', content: 'Найди задачи', createdAt: '2026-11-01T10:00:58Z' }];
  const merged = preserveLiveVoiceMessages(remote, local);
  assert.deepEqual(merged.map(message => message.content), ['Найди задачи', 'Сейчас посмотрю', 'Нашёл три задачи']);
  assert.equal((merged[2] as typeof local[number]).taskProposal?.id, 'proposal-1');
});

test('server-confirmed voice entries are not duplicated on subsequent refresh', () => {
  const spoken = { id: 'local', role: 'assistant', content: 'Задачи найдены' };
  const remote = [{ id: 'server', role: 'assistant', content: 'Задачи найдены' }];
  assert.equal(preserveLiveVoiceMessages(remote, [spoken]), remote);
});
