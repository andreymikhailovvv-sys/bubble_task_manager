import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Android Planik HTML does not load the third-party Telegram SDK and marks boot before React', async () => {
  const html = await read('../../client/index.html');
  const match = html.match(/<!-- The Android Realtime page[\s\S]*?<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'Android bootstrap must be an inline script in HTML head');
  const code = match[1];
  assert.doesNotMatch(html, /^\s*<script\s+defer\s+src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"/m);
  const makeContext = (pathname: string) => {
    const written: string[] = [];
    const listeners: Array<{ name: string; callback: (event: any) => void }> = [];
    const dataset: Record<string, string> = {};
    runInNewContext(code, {
      location: { pathname },
      document: {
        documentElement: { dataset },
        write: (value: string) => written.push(value)
      },
      window: {
        addEventListener: (name: string, callback: (event: any) => void) =>
          listeners.push({ name, callback })
      }
    }, { timeout: 500 });
    return { written, dataset, listeners };
  };
  const android = makeContext('/android-planik');
  assert.equal(android.dataset.planikAndroid, 'html');
  assert.equal(android.written.length, 0, 'No Telegram SDK should be requested in Android');
  const telegram = makeContext('/miniapp');
  assert.equal(telegram.written.length, 1);
  assert.equal(telegram.written[0],
    '<script defer src="https://telegram.org/js/telegram-web-app.js"></script>',
    'Mini App must retain the same deferred Telegram SDK behavior');
  assert.equal(makeContext('/').written.length, 1);
  android.listeners[0].callback({ target: { tagName: 'SCRIPT' } });
  assert.equal(android.dataset.planikAndroid, 'error');
  assert.equal(android.dataset.planikAndroidReason, 'script-load-failed');
});

test('Native Planik rests without arms; activity artwork appears only during work', async () => {
  const [source, launcher, idle, blink, light, lightBlink, activity] = await Promise.all([
    read('../../client/src/components/PlanikMascot.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
    read('../../android-app/app/src/main/assets/planik_idle.svg'),
    read('../../android-app/app/src/main/assets/planik_blink.svg'),
    read('../../android-app/app/src/main/assets/planik_idle_light.svg'),
    read('../../android-app/app/src/main/assets/planik_blink_light.svg'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt')
  ]);
  for (const asset of [idle, blink, light, lightBlink]) {
    assert.doesNotMatch(asset, /planik-resting-arms|M129 194Q141 219 170 224/);
    assert.match(asset, /planik-faceplate/);
  }
  assert.match(launcher, /planikActionSvg\\(mode, alternate\\)/);
  assert.match(source, /M129 194Q141 219 170 224/);
  assert.match(source, /M303 194Q283 218 254 225/);
  assert.match(launcher, /Bitmap\.createBitmap\(full, 80, 12, 280, 300\)/);
  assert.match(launcher, /size\(width = 84\.dp, height = 90\.dp\)/);
  assert.match(activity, /"html" -> "HTML Планика получен, но JavaScript не запустился/);
  assert.match(activity, /"script-load-failed" -> "Не удалось загрузить основной JavaScript/);
});
