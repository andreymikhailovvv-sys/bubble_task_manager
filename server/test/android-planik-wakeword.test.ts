import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p: string) => readFile(new URL(p, import.meta.url), 'utf8');

test('wake-word feature is opt-in, local and foreground-only to start', async () => {
  const [service, manifest, settings, app] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikWakeWordService.kt'),
    read('../../android-app/app/src/main/AndroidManifest.xml'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/PlanirovychApplication.kt')
  ]);
  assert.match(service, /getBoolean\(KEY, false\)/);
  assert.match(service, /createOnDeviceSpeechRecognizer\(this\)/);
  assert.match(service, /EXTRA_PREFER_OFFLINE, true/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MICROPHONE/);
  assert.match(service, /hasWakePhrase\(values: ArrayList<String>\?\)/);
  assert.match(service, /cleaned\.contains\("эй планик"\)/);
  assert.match(service, /cleaned\.contains\("эй планник"\)/);
  assert.match(service, /isKeyguardLocked/);
  assert.match(service, /MainActivity\.isInForeground/);
  assert.match(service, /setContentText\("Нажмите, чтобы открыть живой диалог"\)/);
  assert.match(service, /PlanikWakeWordSettings\.setEnabled\(this, false\)/);
  assert.match(settings, /Text\("Эй, Планик"/);
  assert.match(settings, /PlanikWakeWordService\.enable\(context\)/);
  assert.match(settings, /PlanikWakeWordService\.disable\(context\)/);
  assert.match(settings, /ActivityResultContracts\.RequestPermission\(\)/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_MICROPHONE/);
  assert.match(manifest, /android:foregroundServiceType="microphone"/);
  assert.match(manifest, /android:name="\.planik\.PlanikWakeWordService"/);
  assert.doesNotMatch(manifest, /android\.intent\.action\.BOOT_COMPLETED/);
  assert.doesNotMatch(app, /PlanikWakeWordService\.enable/);
});

test('wake recognizer cannot use microphone concurrently with realtime and does not change Android version', async () => {
  const [activity, service, main, build] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikWakeWordService.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/MainActivity.kt'),
    read('../../android-app/app/build.gradle.kts')
  ]);
  assert.match(activity, /PlanikWakeWordService\.pauseForLiveSession\(\)/);
  assert.match(activity, /PlanikWakeWordService\.resumeAfterLiveSession\(\)/);
  assert.match(service, /conversationActive = true/);
  assert.match(service, /releaseRecognizer\(\)/);
  assert.match(service, /!locked && MainActivity\.isInForeground/);
  assert.match(main, /@Volatile var isInForeground: Boolean = false/);
  assert.match(main, /override fun onResume\(\)/);
  assert.match(main, /override fun onPause\(\)/);
  assert.match(build, /versionCode = 9/);
  assert.match(build, /versionName = "1\.0\.7"/);
});
