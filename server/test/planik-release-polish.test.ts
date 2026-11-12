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
  assert.match(mascot, /responding \? 'typing' : 'thinking'/);
  assert.match(mini, /responding=\{Boolean\(aiChatStreamingText\)\}/);
  assert.match(mini, /responding=\{Boolean\(taskAiStreamingText\[openedTask\.id\]\)\}/);
  assert.match(native, /state\.progressStatus\.orEmpty\(\)\.startsWith\("searching_"\)/);
  assert.match(task, /ui\.streamText\.isNotBlank\(\)/);
  assert.match(launcher, /"typing" ->/);
  assert.match(launcher, /"thinking" ->/);
  assert.match(launcher, /"searching" ->/);
  assert.match(styles, /\.planik-body-surface \{ pointer-events: visiblePainted/);
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
