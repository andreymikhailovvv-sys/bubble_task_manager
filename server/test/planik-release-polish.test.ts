import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('live speech is only transcribed in the expanded Planik dialog, not duplicated in history', async () => {
  const voice = await read('../../client/src/components/LiveVoiceDialog.tsx');
  const mini = await read('../../client/src/MiniApp.tsx');
  assert.match(voice, /className="planik-live-transcript"/);
  assert.match(voice, /setLiveMessages\(previous =>/);
  assert.doesNotMatch(voice, /onLiveMessageRef\.current\?\.\(/);
  assert.match(voice, /onLiveToolResultRef\.current\?\.\(/);
  assert.match(mini, /appendLiveProjectMessage/);
});

test('both chat surfaces animate the mascot from real request progress', async () => {
  const [mascot, mini, native, task, styles, launcher] = await Promise.all([
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
  ]);
  assert.match(mascot, /busy \? \(isPainting \? 'painting' : isSearching \? 'searching' : 'typing'\)/);
  assert.match(mascot, /planik-painting/);
  assert.doesNotMatch(mascot, /setTyping\(true\)/);
  assert.match(mini, /responding=\{Boolean\(aiChatStreamingText\)\}/);
  assert.match(mini, /responding=\{Boolean\(taskAiStreamingText\[openedTask\.id\]\)\}/);
  assert.match(native, /state\.progressStatus\.orEmpty\(\)\.startsWith\("searching_"\)/);
  assert.match(task, /ui\.streamText\.isNotBlank\(\)/);
  assert.match(launcher, /"typing" ->/);
  assert.match(launcher, /"thinking" ->/);
  assert.match(launcher, /"searching" ->/);
  assert.match(styles, /\.planik-body-surface \{ pointer-events: visiblePainted/);
  assert.match(styles, /planik-paint-sweep/);
});

test('Android shows a skeleton preview and uses a monotonic release version', async () => {
  const [activity, build, launcher] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../android-app/app/build.gradle.kts'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
  ]);
  assert.match(activity, /AlphaAnimation\(\.52f, 1f\)/);
  assert.match(activity, /loadingIndicator = preview/);
  assert.doesNotMatch(activity, /ProgressBar/);
  assert.match(launcher, /size\(width = 58\.dp, height = 56\.dp\)/);
  assert.match(build, /versionCode = 10/);
  assert.match(build, /versionName = "1\.0\.8"/);
});

test('quick chat is visibly starred in web, mini app and Android and audio loader has an active wrapper', async () => {
  const [web, miniHeader, native, speech, styles] = await Promise.all([
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/components/MiniGeneralAiChatHeader.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../client/src/components/AiReadAloudAction.tsx'),
    read('../../client/src/styles.css'),
  ]);
  assert.match(web, /chat\.id === quickChatId \? <Star/);
  assert.match(miniHeader, /item\.id === 'quick-ai-requests' \? <Star/);
  assert.match(native, /item\.id==QUICK_AI_THREAD_ID/);
  assert.match(speech, /<span className="ai-speech-loading-spin" role="status">/);
  assert.match(styles, /\.ai-speech-loading-spin \{/);
});

test('request-scoped streaming resets old text before loading and keeps the preview until primary text arrives', async () => {
  const [web, mini] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/MiniApp.tsx'),
  ]);
  for (const source of [web, mini]) {
    assert.match(source, /setTaskAiStreamingText\(prev => \(\{ \.\.\.prev, \[taskId\]: '' \}\)\)/);
    assert.match(source, /onTextReset: \(\) => \{ started = false; \}/);
    assert.match(source, /\.\.\.textStreamForGeneral\(\)/);
  }
  assert.match(web, /chat-message-assistant w-full rounded-2xl/);
  assert.match(mini, /miniapp-ai-chat-message-task miniapp-ai-chat-message-assistant/);
});
