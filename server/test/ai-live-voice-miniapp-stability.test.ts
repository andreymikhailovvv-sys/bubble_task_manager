import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('mini-app live voice pauses stale thread snapshots, including in-flight responses', async () => {
  const mini = await load('../../client/src/MiniApp.tsx');
  assert.match(mini, /liveVoiceChatSessionsRef\.current\.has\(`\$\{projectId\}:\$\{chatId\}`\)/);
  assert.match(mini, /liveVoiceTaskSessionsRef\.current\.has\(openedTaskId\)/);
  assert.match(mini, /onLiveSessionChange=\{onMiniLiveVoiceSessionChange\}/);
  assert.match(mini, /const spoken = voiceChatMessagesRef\.current/);
  assert.match(mini, /spoken\.length\s*\? reconcileAiChatMessagesWithChips\(chat\.messages, remote\)/);
});

test('live conversation no longer forces scroll on each transient AI status', async () => {
  const mini = await load('../../client/src/MiniApp.tsx');
  const scrollStart = mini.indexOf('if (previousGeneralAiChatIdRef.current !== activeAiChatId)');
  const scrollEnd = mini.indexOf('  useLayoutEffect(', scrollStart);
  const scrollBlock = mini.slice(scrollStart, scrollEnd);
  assert.match(scrollBlock, /if \(liveVoiceChatSessionsRef\.current\.has/);
  assert.doesNotMatch(scrollBlock, /\[visibleAiChatMessages\.length[^\]]*activeLiveVoiceStatus/);
  assert.match(mini, /if \(openedTaskId && liveVoiceTaskSessionsRef\.current\.has\(openedTaskId\)\) return;/);
  assert.match(mini, /\.slice\(chatId === QUICK_AI_CHAT_ID \? -100 : -300\)/);
});

test('microphone start and hangup both notify the exact thread', async () => {
  const [button, composer] = await Promise.all([
    load('../../client/src/components/VoiceInputButton.tsx'),
    load('../../client/src/components/MiniAiChatComposer.tsx')
  ]);
  assert.match(button, /setLiveSessionActive\(true\)/);
  assert.match(button, /setLiveSessionActive\(false\)/);
  assert.match(button, /activeLiveContextRef\.current/);
  assert.match(composer, /onLiveSessionChange=\{onLiveSessionChange\}/);
});

test('Telegram playback is moderately boosted and limited, without changing mic/VAD', async () => {
  const voice = await load('../../client/src/components/LiveVoiceDialog.tsx');
  assert.match(voice, /if \(telegramMiniApp\)/);
  assert.match(voice, /boost\.gain\.value = 1\.5/);
  assert.match(voice, /context\.createDynamicsCompressor\(\)/);
  assert.match(voice, /source\.connect\(playbackBoostRef\.current \?\? context\.destination\)/);
  assert.match(voice, /echoCancellation: true, noiseSuppression: true, autoGainControl: true/);
  assert.match(voice, /bargeInRef\.current\.observe/);
});
