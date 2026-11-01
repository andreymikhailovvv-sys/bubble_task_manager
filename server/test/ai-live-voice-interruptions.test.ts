import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('realtime barge-in checks microphone while outgoing speech is still playing', async () => {
  const [client, detector] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../../client/src/lib/voice-barge-in.ts')
  ]);
  assert.match(client, /if \(uplinkPausedRef\.current\) \{/);
  assert.match(client, /estimateEchoCorrelation\(samples/);
  assert.match(client, /bargeInRef\.current\.observe/);
  assert.match(client, /type: 'interrupt'/);
  assert.match(client, /clearPlayback\(\);\s*uplinkPausedRef\.current = false/);
  assert.match(detector, /echoCorrelationFloor/);
  assert.match(detector, /candidateSince/);
});

test('interruption cancels the provider and truncates unheard audio on WebSocket transport', async () => {
  const server = await read('../src/services/ai-live-voice.service.ts');
  assert.match(server, /packet\.type === 'interrupt'/);
  assert.match(server, /type: 'response\.cancel'/);
  assert.match(server, /type: 'conversation\.item\.truncate'/);
  assert.match(server, /responseId: value\.response_id, itemId: value\.item_id/);
  assert.match(server, /interruptedResponses\.has\(value\.response_id\)/);
  assert.doesNotMatch(server, /suppressDelegatedAudioTranscript/);
  assert.match(server, /type: 'assistant_message'/);
});

test('mini-app preserves local voice speech and action cards when history polls', async () => {
  const [mini, shared] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/lib/voice-chat-messages.ts')
  ]);
  assert.match(mini, /voiceChatMessagesRef/);
  assert.match(mini, /voiceTaskMessagesRef/);
  assert.match(mini, /preserveLiveVoiceMessages\(reconcileActiveAiChatMessages/);
  assert.match(mini, /preserveLiveVoiceMessages\(hasPendingOptimisticMessages/);
  assert.match(mini, /onLiveStatus=\{status =>/);
  assert.match(shared, /export function preserveLiveVoiceMessages/);
});
