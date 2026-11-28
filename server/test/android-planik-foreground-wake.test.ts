import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = '../../android-app/app/src/main/';
const read = (path: string) => readFile(new URL(root + path, import.meta.url), 'utf8');
const pkg = 'java/ru/planirovych/app/';

test('Planik foreground activation is opt-in, local and lifecycle bound', async () => {
  const [wake, manifest, home] = await Promise.all([
    read(pkg + 'planik/PlanikForegroundWake.kt'), read('AndroidManifest.xml'),
    read(pkg + 'feature/home/HomeScreen.kt')
  ]);
  assert.match(wake, /getBoolean\("enabled_" \+ accountId, false\)/);
  assert.match(wake, /createOnDeviceSpeechRecognizer\(context\)/);
  assert.doesNotMatch(wake, /SpeechRecognizer\.createSpeechRecognizer\(/);
  assert.match(wake, /EXTRA_LANGUAGE, "ru-RU"/);
  assert.match(wake, /Lifecycle\.Event\.ON_RESUME -> listener\.resume\(\)/);
  assert.match(wake, /Lifecycle\.Event\.ON_PAUSE[\s\S]*?listener\.pause\(\)/);
  assert.match(wake, /expectedUserId = accountId/);
  assert.match(wake, /isKeyguardLocked/);
  assert.match(wake, /generation\+\+/);
  assert.match(manifest, /android\.speech\.RecognitionService/);
  assert.doesNotMatch(manifest, /FOREGROUND_SERVICE_MICROPHONE|BOOT_COMPLETED/);
  assert.match(home, /rememberPlanikWake\(state\.user\?\.id/);
  assert.match(home, /Text\("Эй, Планик"\)/);
});

test('Every native dictation releases wake microphone before MediaRecorder and resumes afterwards', async () => {
  const [voice, wake] = await Promise.all([
    read(pkg + 'feature/home/AiChatVoiceInput.kt'), read(pkg + 'planik/PlanikForegroundWake.kt')
  ]);
  assert.match(voice, /PlanikWakeMicGate\.acquire\(wakeMicOwner\)[\s\S]*?MediaRecorder\(\)/);
  assert.equal((voice.match(/PlanikWakeMicGate\.release\(wakeMicOwner\)/g) || []).length, 3);
  assert.match(wake, /PlanikWakeMicGate\.busy[\s\S]*?release\(\)/);
  assert.match(wake, /old\?\.destroy\(\)/);
});
