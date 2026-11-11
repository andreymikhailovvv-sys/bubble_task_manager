import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('Android Realtime must actually mount before the native loader disappears', async () => {
  const [activity, entry, mini, live] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../client/src/main.tsx'),
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.match(entry, /dataset\.planikAndroid = 'boot'/);
  assert.match(mini, /dataset\.planikAndroid = 'workspace-loading'|loading \? 'workspace-loading'/);
  assert.match(mini, /dataset\.planikAndroid = 'voice-starting'/);
  assert.match(mini, /dataset\.planikAndroidReason = 'composer-not-mounted'/);
  assert.match(live, /dataset\.planikAndroid = 'live'/);
  assert.match(activity, /stage == "live"/);
  assert.match(activity, /visible && stage == "live" -> markReady\(\)/);
  assert.doesNotMatch(activity, /text\.length > 60 \? 'ready'/);
  assert.match(activity, /"legacy" -> "Веб-часть Планика на сервере не обновлена/);
  assert.match(activity, /Web stage=\$stage/);
  assert.match(activity, /lastWebDetail/);
});

test('WebView starts navigation once after synchronous session cookie flush', async () => {
  const activity = await read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt');
  assert.match(activity, /manager\.flush\(\)/);
  assert.match(activity, /view\.loadUrl\(targetUrl\)/);
  assert.doesNotMatch(activity, /var pending = cookies\.size/);
  assert.match(activity, /cookies\.none \{ it\.name == "btm_auth" \|\| it\.name == "btm_device" \}/);
  assert.match(activity, /showFailure\("Не удалось передать авторизацию из Android/);
  assert.match(activity, /onReceivedHttpError\(/);
  assert.match(activity, /onReceivedError\(/);
  assert.match(activity, /App bundle asset HTTP/);
  assert.match(activity, /BOOT_TIMEOUT_MS = 40_000L/);
});

test('Android embedded Realtime loads a minimal chat context instead of all inboxes', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  assert.match(mini, /const androidVoice = Boolean\(androidPlanikLaunch\)/);
  assert.match(mini, /androidVoice \? Promise\.resolve\(\[\] as Sphere\[\]\)/);
  assert.match(mini, /androidVoice && !androidPlanikLaunch\?\.taskId/);
  assert.match(mini, /androidVoice \? Promise\.resolve\(null\) : api\.telegramAssistantInbox/);
  assert.match(mini, /androidVoice \? Promise\.resolve\(null\) : api\.mailAssistantInbox/);
});

test('small Planik matches light/dark website palette with tight tap bounds and lower placement', async () => {
  const [native, general, task, idle, blink, light, lightBlink, styles, build] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../android-app/app/src/main/assets/planik_idle.svg'),
    read('../../android-app/app/src/main/assets/planik_blink.svg'),
    read('../../android-app/app/src/main/assets/planik_idle_light.svg'),
    read('../../android-app/app/src/main/assets/planik_blink_light.svg'),
    read('../../client/src/components/PlanikMascot.css'),
    read('../../android-app/app/build.gradle.kts')
  ]);
  assert.match(native, /dark: Boolean/);
  assert.match(native, /remember\(context, dark\)/);
  assert.match(native, /size\(width = 84\.dp, height = 90\.dp\)/);
  assert.match(native, /Bitmap\.createBitmap\(full, 80, 12, 280, 300\)/);
  assert.match(native, /indication = null/);
  assert.match(native, /if \(dark\) "" else "_light"/);
  assert.match(general, /PlanikNativeLauncher\([\s\S]{0,70}dark = dark/);
  assert.match(task, /PlanikNativeLauncher\([\s\S]{0,70}dark = dark/);
  assert.match(general, /bottom = composerHeight \+ 1\.dp/);
  assert.match(task, /bottom = composerHeight \+ 1\.dp/);
  assert.match(idle, /#5e5ca3/);
  assert.match(blink, /#5e5ca3/);
  assert.match(light, /#b8b3ec/);
  assert.match(lightBlink, /#b8b3ec/);
  assert.match(styles, /body\[data-theme='light'\] \.planik-body-stop-start \{ stop-color: #b8b3ec/);
  assert.match(build, /versionCode = 9/);
  assert.match(build, /versionName = "1\.0\.7"/);
});
