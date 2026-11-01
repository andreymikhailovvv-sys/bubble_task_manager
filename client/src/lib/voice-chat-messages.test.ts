import test from 'node:test';
import assert from 'node:assert/strict';
import { updateLiveVoiceProgress } from './voice-chat-messages';

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
