import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const base='../../android-app/app/src/main/';
const read=(p:string)=>readFile(new URL(base+p,import.meta.url),'utf8');
const pkg='java/ru/planirovych/app/';
test('Wake action and foreground service remain explicit and account-bound',async()=>{
  const [wake, service, home, main, manifest]=await Promise.all([
    read(pkg+'planik/PlanikForegroundWake.kt'),read(pkg+'planik/PlanikWakeBackgroundService.kt'),
    read(pkg+'feature/home/HomeScreen.kt'),read(pkg+'MainActivity.kt'),read('AndroidManifest.xml')
  ]);
  assert.match(wake,/getBoolean\("background_" \+ accountId, false\)/);
  assert.match(wake,/putString\("action_" \+ accountId, value\)/);
  assert.match(service,/startForeground\(ONGOING_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE\)/);
  assert.match(service,/START_NOT_STICKY/);
  assert.match(service,/PendingIntent.getActivity/);
  assert.match(service,/Settings.canDrawOverlays\(this\)/);
  assert.match(service,/startActivity\(wakeIntent\)/);
  assert.match(service,/PlanikWakeDispatch.pending\(wakeIntent\)/);
  assert.match(service,/current.recoverListening\(\)/);
  assert.match(service,/unlocked && Settings.canDrawOverlays\(this\)/);
  assert.match(service,/Intent.ACTION_USER_PRESENT/);
  assert.doesNotMatch(service,/WAKE_ALWAYS|PARTIAL_WAKE_LOCK|pendingLockedWake/);
  assert.doesNotMatch(manifest,/android.permission.WAKE_LOCK/);
  assert.match(home,/Системный ассистент · эксперимент/);
  assert.match(home,/PlanikVoiceSettingsSheet/);
  assert.match(wake,/"always" -> WAKE_BACKGROUND/);
  assert.match(wake,/listeningMode==WAKE_SYSTEM/);
  assert.match(service,/wakeListeningMode\(prefs,account\)!=WAKE_BACKGROUND/);
  assert.match(home,/Фоновый режим/);
  assert.match(home,/Только в приложении/);
  assert.match(manifest,/android.permission.SYSTEM_ALERT_WINDOW/);
  assert.match(service,/setSound\(null,null\); enableVibration\(false\)/);
  assert.match(main,/PlanikWakeDispatch.consume\(intent\)/);
  assert.match(home,/quickAiMode=="live"/);
  assert.match(home,/quickAiMode=="voice"/);
  assert.match(main,/quickAiMode=if\(mode=="voice"\)"wake_voice" else "live"/);
  assert.match(manifest,/android:foregroundServiceType="microphone"/);
});
test('Compact live window hides the web workspace without destroying the session',async()=>{
  const [live,home,manifest]=await Promise.all([read(pkg+'planik/PlanikLiveActivity.kt'),read(pkg+'feature/home/HomeScreen.kt'),read('AndroidManifest.xml')]);
  assert.match(live,/#root\{visibility:hidden!important;pointer-events:none!important\}/);
  assert.match(live,/body \*\{visibility:hidden!important;pointer-events:none!important\}/);
  assert.match(live,/\.planik-live-compact \*\{visibility:visible!important\}/);
  assert.match(live,/FLAG_NOT_TOUCH_MODAL/);
  assert.match(live,/"ended" -> \{ finish\(\)/);
  assert.match(live,/PlanikWakeMicGate.acquire\(this\)/);
  assert.match(live,/PlanikWakeMicGate.release\(this\)/);
  assert.match(home,/PlanikLiveUpdates.events.collect/);
  assert.match(manifest,/Theme.Planirovych.LiveOverlay/);
});

test('System assistant has a distinct opt-in route without persistent capture',async()=>{
  const [wake, service, assistant, metadata, recognition, manifest, home, voice, general, task]=await Promise.all([
    read(pkg+'planik/PlanikForegroundWake.kt'),read(pkg+'planik/PlanikWakeBackgroundService.kt'),
    read(pkg+'planik/PlanikSystemAssistant.kt'),read('res/xml/planik_voice_interaction.xml'),
    read('res/xml/planik_recognition_service.xml'),read('AndroidManifest.xml'),
    read(pkg+'feature/home/HomeScreen.kt'),read(pkg+'feature/home/AiChatVoiceInput.kt'),
    read(pkg+'feature/home/NativeGeneralAiChat.kt'),read(pkg+'feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(manifest,/android.permission.BIND_VOICE_INTERACTION/);
  assert.match(metadata,/android:supportsAssist="true"/);
  assert.match(metadata,/android:supportsLaunchVoiceAssistFromKeyguard="false"/);
  assert.match(recognition,/android:selectableAsDefault="false"/);
  assert.match(assistant,/VoiceInteractionService.isActiveService/);
  assert.match(assistant,/wakeListeningMode\(prefs,account\)!=WAKE_SYSTEM/);
  assert.match(assistant,/return Invocation\(account,action\)/);
  assert.match(assistant,/surface\?\.show\(PlanikSystemAssistant.invocation\(appContext\)\)/);
  assert.match(assistant,/clearFlags\(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND\)/);
  assert.doesNotMatch(assistant,/Открыть Планика/);
  assert.match(assistant,/setDisabledShowContext/);
  assert.doesNotMatch(assistant,/AudioRecord|MediaRecorder|startForegroundService|createAlwaysOnHotwordDetector/);
  assert.match(wake,/listeningMode==WAKE_SYSTEM\) \{/);
  assert.match(home,/clickable \{ planikSettings=true \}/);
  assert.match(home,/Назначить Планировыч ассистентом/);
  assert.match(voice,/native.start\(\)[\s\S]*?stage=VoiceRecordingStage.RECORDING\s+[\s\S]*?playVoiceInputStarted\(context\)/);
  assert.match(voice,/TONE_PROP_BEEP,110/);
  assert.match(voice,/RINGER_MODE_NORMAL/);
  for(const chat of [general,task])assert.match(chat,/end = 0\.dp, bottom = \(composerHeight - 29\.dp\)/);
});

test('System invocation uses a bottom overlay and tears down audio on dismissal',async()=>{
  const [session,panel]=await Promise.all([read(pkg+'planik/PlanikSystemAssistant.kt'),read(pkg+'planik/PlanikAssistantPanel.kt')]);
  assert.match(session,/override fun onHide\(\) \{\s*surface\?\.close\(\)/);
  assert.match(panel,/Gravity.BOTTOM/);
  assert.match(panel,/translationY\(0f\)/);
  assert.match(panel,/PlanikWakeMicGate.acquire\(this\)/);
  assert.match(panel,/PlanikWakeMicGate.release\(this\)/);
  assert.match(panel,/repository.transcribeVoice/);
  assert.match(panel,/repository.askGeneralAi/);
  assert.match(panel,/encodedPath\("\/android-planik"\)/);
  assert.match(panel,/CookieManager.getInstance\(\)/);
  assert.match(panel,/previous.isNotEmpty\(\) && previous!=expected/);
  assert.match(panel,/current.id!=request.account/);
  assert.match(panel,/view.destroy\(\)/);
  assert.doesNotMatch(panel,/startActivity\(/);
});
