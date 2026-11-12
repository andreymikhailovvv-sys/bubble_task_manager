import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('Realtime is rooted above chat composers so navigating tabs cannot end the live conversation', async () => {
  const [host, button, dialog] = await Promise.all([
    read('../../client/src/lib/persistent-planik-live-session.tsx'),
    read('../../client/src/components/VoiceInputButton.tsx'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.match(host, /createRoot\(node\)/);
  assert.match(host, /document\.body\.appendChild\(node\)/);
  assert.match(host, /root\.render\(<LiveVoiceDialog/);
  assert.match(host, /if \(active\) \{ expandPersistentPlanikLiveSession\(\)/);
  assert.match(host, /queueMicrotask\(\(\) => \{/);
  assert.match(button, /startPersistentPlanikLiveSession\(/);
  assert.doesNotMatch(button, /\{liveOpen \? <LiveVoiceDialog/);
  assert.match(button, /Navigating away unmounts the button but must not hang up Realtime/);
  assert.match(dialog, /addEventListener\('planik-live-expand', expand\)/);
});

test('waiting voice acknowledgements do not overlap with the resumed main answer', async () => {
  const [server, client] = await Promise.all([
    read('../src/services/ai-live-voice.service.ts'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.match(server, /\}, 5_000\)/);
  assert.match(server, /'Секундочку\.'/);
  assert.match(server, /'Ищу\.'/);
  assert.match(server, /'Проверяю\.'/);
  assert.match(server, /type: 'waiting_response_done'/);
  assert.match(server, /packet\.type === 'waiting_played'/);
  assert.match(server, /waitingAudioAwaitingAck = true/);
  assert.match(server, /if \(waitingResponseInFlight\) resumeAfterWaiting = true/);
  assert.match(client, /acknowledgeWaitingAfterPlayback\(\)/);
  assert.match(client, /sourcesRef\.current\.size > 0/);
  assert.match(client, /type: 'waiting_played'/);
});

test('AI toolbar stays restored in Android and embedded WebView while talking', async () => {
  const [native, mini] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../client/src/MiniApp.tsx')
  ]);
  assert.match(native, /LifecycleEventObserver/);
  assert.match(native, /Lifecycle\.Event\.ON_RESUME\) headerCollapsed = false/);
  assert.match(mini, /setMiniLiveVoiceActive\(active\)/);
  assert.match(mini, /if \(miniLiveVoiceActive \|\| androidPlanikLaunch\)/);
  assert.match(mini, /setIsGeneralAiChatHeaderHidden\(false\)/);
});

test('the APK updater verifies downloaded APK identity and signer before requesting installation', async () => {
  const [manifest, installer] = await Promise.all([
    read('../../android-app/app/src/main/AndroidManifest.xml'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/updates/AndroidApkInstaller.kt')
  ]);
  assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(installer, /verifyOfficialUpdate\(context, destination, release\.versionCode\)/);
  assert.match(installer, /signatures\(archive\) != signatures\(installed\)/);
  assert.match(installer, /archive\.packageName != BuildConfig\.APPLICATION_ID/);
  assert.match(installer, /host != "github\.com"/);
});
