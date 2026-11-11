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

test('Android launcher uses real static SVG artwork, animated natively instead of transparent WebView', async () => {
  const [asset, blink, source, styles, launcher, manifest, build] = await Promise.all([
    read('../../android-app/app/src/main/assets/planik_idle.svg'),
    read('../../android-app/app/src/main/assets/planik_blink.svg'),
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
  assert.match(styles, /@keyframes planik-float/);
  assert.match(blink, /ry="1\.4"/);
  assert.doesNotMatch(asset, /planik-notif-static|planik-celebrating|planik-typing/);
  assert.match(launcher, /SVG\.getFromInputStream\(stream\)/);
  assert.match(launcher, /android\.graphics\.Canvas as AndroidCanvas/);
  assert.match(launcher, /renderToPicture\(420, 375\)/);
  assert.match(launcher, /rememberInfiniteTransition/);
  assert.doesNotMatch(launcher, /import android\.webkit\.WebView|AndroidView\(/);
  assert.match(manifest, /\.planik\.PlanikLiveActivity/);
  assert.match(manifest, /android:exported="false"/);
  assert.match(build, /com\.caverock:androidsvg:1\.4/);
  assert.match(build, /versionCode = 9/);
  assert.match(build, /versionName = "1\.0\.7"/);
});

test('Realtime WebView has visible loading, diagnostics, first-party cookies and retry instead of blank', async () => {
  const activity = await read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt');
  assert.match(activity, /loadingLabel\?\.text = message/);
  assert.match(activity, /Web runtime error at line/);
  assert.match(activity, /onReceivedError\(/);
  assert.match(activity, /onRenderProcessGone\(/);
  assert.match(activity, /onReceivedHttpError\(/);
  assert.match(activity, /showFailure\(reason\)/);
  assert.match(activity, /"legacy" -> "Веб-часть Планика на сервере не обновлена/);
  assert.match(activity, /setAcceptThirdPartyCookies\(view, false\)/);
  assert.match(activity, /Persisten[t]CookieJar\(this\)\.loadForRequest\(host\)/);
  assert.match(activity, /querySelector\('\.planik-live-fullscreen, \.planik-live-compact'\)/);
  assert.match(activity, /retryButton = Button\(this\)/);
  assert.match(activity, /allowFileAccess = false/);
});
