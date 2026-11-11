import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), 'utf8');

test('Android reuses exact Mini App React/SVG/Markdown realtime renderer', async () => {
  const [entry, mini, activity, general, task] = await Promise.all([
    read('../../client/src/main.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(entry, /isAndroidPlanikRoute/);
  assert.match(entry, /<MiniApp runtime="web" \/>/);
  assert.match(mini, /window\.location\.pathname !== '\/android-planik'/);
  assert.match(mini, /composer\?\.startLive\(\)/);
  assert.match(activity, /\.encodedPath\("\/android-planik"\)/);
  assert.match(activity, /PersistentCookieJar\(this\)\.loadForRequest\(host\)/);
  assert.match(activity, /request\.resources\.contentEquals\(arrayOf\(PermissionRequest\.RESOURCE_AUDIO_CAPTURE\)\)/);
  assert.match(activity, /allowFileAccess = false/);
  assert.match(activity, /onBackPressedDispatcher\.addCallback/);
  assert.match(general, /PlanikNativeLauncher\(/);
  assert.match(task, /PlanikNativeLauncher\(/);
  assert.match(general, /projectId = project\?\.id, chatId = thread\.id/);
  assert.match(task, /taskId = task\.id/);
});

test('native launcher bundles exact website mascot paths and animations, not a substitute icon', async () => {
  const [asset, source, styles, launcher, manifest, build] = await Promise.all([
    read('../../android-app/app/src/main/assets/planik_mascot.html'),
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
    read('../../android-app/app/src/main/AndroidManifest.xml'),
    read('../../android-app/app/build.gradle.kts')
  ]);
  assert.match(source, /viewBox="35 32 345 275"/);
  assert.match(asset, /viewBox="35 32 345 275"/);
  assert.match(asset, /planik-body-native/);
  assert.match(asset, /planik-screen-native/);
  assert.match(asset, /planik-faceplate/);
  assert.match(asset, /planik-notif-static/);
  assert.match(asset, /@keyframes planik-float/);
  assert.match(styles, /@keyframes planik-float/);
  assert.match(launcher, /file:\/\/\/android_asset\/planik_mascot\.html/);
  assert.match(launcher, /settings\.javaScriptEnabled = false/);
  assert.match(manifest, /\.planik\.PlanikLiveActivity/);
  assert.match(manifest, /android:exported="false"/);
  assert.match(build, /versionCode = 9/);
  assert.match(build, /versionName = "1\.0\.7"/);
});
