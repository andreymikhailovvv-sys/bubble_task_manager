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
  assert.match(home,/PlanikSystemSettingsSheet/);
  assert.match(home,/PlanikVoiceSettingsSheet/);
  assert.match(wake,/"always" -> WAKE_BACKGROUND/);
  assert.match(wake,/systemEnabled && available/);
  assert.match(service,/wakeListeningMode\(prefs,account\)!=WAKE_BACKGROUND/);
  assert.match(home,/Фоновый режим/);
  assert.match(home,/Только в приложении/);
  assert.match(manifest,/android.permission.SYSTEM_ALERT_WINDOW/);
  assert.match(service,/setSound\(null,null\); enableVibration\(false\)/);
  assert.match(main,/PlanikWakeDispatch.consume\(intent\)/);
  assert.match(home,/quickAiMode in listOf\("live","wake_voice","assistant_chat"\)/);
  assert.match(home,/else if\(mode=="live"\)/);
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
  assert.match(assistant,/!systemAssistantEnabled\(prefs,account\)/);
  assert.match(assistant,/return Invocation\(account,action\)/);
  assert.match(assistant,/surface\?\.show\(PlanikSystemAssistant.invocation\(appContext\)\)/);
  assert.match(assistant,/clearFlags\(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND\)/);
  assert.doesNotMatch(assistant,/Открыть Планика/);
  assert.match(assistant,/setDisabledShowContext/);
  assert.doesNotMatch(assistant,/AudioRecord|MediaRecorder|startForegroundService|createAlwaysOnHotwordDetector/);
  assert.match(wake,/DisposableEffect\(accountId,systemEnabled,available,ready\)/);
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

test('System panel has stable insets, gesture expansion, markdown, real progress and direct general chat navigation',async()=>{
  const [panel,session,main,home,chat,workspace,progress]=await Promise.all([
    read(pkg+'planik/PlanikAssistantPanel.kt'),read(pkg+'planik/PlanikSystemAssistant.kt'),
    read(pkg+'MainActivity.kt'),read(pkg+'feature/home/HomeScreen.kt'),read(pkg+'feature/home/NativeGeneralAiChat.kt'),
    read(pkg+'feature/home/ModernWorkspace.kt'),read(pkg+'feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(panel,/WindowInsetsCompat.Type.mandatorySystemGestures/);
  assert.match(panel,/params.bottomMargin=bottomInset/);
  assert.match(panel,/panel.translationY=\(panel.height\+bottomInset\+dp\(24\)\)/);
  assert.match(panel,/setDuration\(560\)/);
  assert.match(panel,/MotionEvent.ACTION_MOVE/);
  assert.match(panel,/settle\(true\)/);
  assert.match(panel,/dismissAnimated\(\)/);
  assert.match(panel,/RippleDrawable/);
  assert.match(panel,/performHapticFeedback/);
  assert.match(panel,/planik_blink.svg/);
  assert.match(panel,/markdown.setMarkdown\(result,/);
  assert.match(panel,/addView\(content,FrameLayout.LayoutParams\(-1,-2\)\)/);
  assert.doesNotMatch(panel,/ScrollView\.LayoutParams/);
  assert.match(panel,/onProgress=\{code->/);
  assert.match(panel,/handler.post \{ if\(valid\(token\)\)updateProgress\(code\)/);
  assert.match(progress,/fun nativeAiProgressLabel/);
  assert.match(panel,/requiresChat\(response\)/);
  assert.match(panel,/Посмотреть в чате/);
  assert.match(session,/ACTION_PLANIK_OPEN_CHAT/);
  assert.match(main,/quickAiMode="assistant_chat"/);
  assert.match(home,/if\(mode=="assistant_chat"\)[\s\S]*?chooseGeneralAiChat\(projectId,QUICK_AI_THREAD_ID\)/);
  assert.match(chat,/quickAiMode=="assistant_chat"/);
  assert.match(workspace,/quickAiMode=="assistant_chat"/);
});

test('System voice result includes inline owner-verified proposal cards',async()=>{
  const [panel,cards]=await Promise.all([read(pkg+'planik/PlanikAssistantPanel.kt'),read(pkg+'planik/PlanikPanelProposalCards.kt')]);
  assert.match(panel,/cards.attach\(content,response\)/);
  assert.match(panel,/if\(cardCount>0\)settle\(true\)/);
  assert.match(cards,/repository.updateTaskAiProposal/);
  assert.match(cards,/repository.editTaskAiProposal/);
  assert.match(cards,/put\("revision",revision\)/);
  assert.match(cards,/repository.economicProposalAction/);
  assert.match(cards,/repository.editEconomicProposal/);
  assert.match(cards,/put\("expectedPayload"/);
  assert.match(cards,/verifyAccount\(\)/);
  assert.match(cards,/"APPLIED"->/);
  assert.match(cards,/confirm\("undo"\)/);
  assert.match(cards,/confirm\("reject"\)/);
});

test('Independent system and phrase opt-ins, smooth waveform and pause endpointer',async()=>{
  const [wake,assistant,home,panel,pause]=await Promise.all([
    read(pkg+'planik/PlanikForegroundWake.kt'),read(pkg+'planik/PlanikSystemAssistant.kt'),
    read(pkg+'feature/home/HomeScreen.kt'),read(pkg+'planik/PlanikAssistantPanel.kt'),
    read(pkg+'planik/PlanikSpeechPause.kt')
  ]);
  assert.match(wake,/putBoolean\("system_enabled_"\+accountId,value\)/);
  assert.match(wake,/putBoolean\("enabled_" \+ accountId, value\)/);
  assert.match(wake,/fun migrateWakeSettings/);
  assert.doesNotMatch(wake,/WAKE_SYSTEM/);
  assert.match(assistant,/systemAssistantAction\(prefs,account\)/);
  assert.match(wake,/prefs.getString\("system_action_"\+accountId,"live"\)/);
  assert.match(wake,/DisposableEffect\(preferences, accountId\) \{[\s\S]*?accountId\?\.let \{ migrateWakeSettings\(preferences,it\) \}/);
  assert.doesNotMatch(wake,/remember\([^)]*\) \{[^\n]*migrateWakeSettings/);
  assert.match(wake,/mutableStateOf\(accountId != null && preferences.getBoolean\("enabled_" \+ accountId, false\) &&\s*preferences.getString\("mode_" \+ accountId,null\)!="system"\)/);
  assert.match(home,/Switch\(checked=planikWake.systemEnabled/);
  assert.match(home,/Switch\(checked=planikWake.enabled/);
  assert.match(home,/Text\("Эй, Планик"\)\s+Text\("›"/);
  assert.match(panel,/panel.doOnPreDraw/);
  assert.match(panel,/launchGlow.animate\(\)/);
  assert.match(panel,/postInvalidateOnAnimation\(\)/);
  assert.match(panel,/silence.sample\(now,amplitude\)/);
  assert.match(panel,/button\("Отправить"\)/);
  assert.match(pause,/speechRun>=240L/);
  assert.match(pause,/hasSpeech && lastSpeech>0L && now-lastSpeech>=1800L/);
});
