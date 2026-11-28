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
  assert.doesNotMatch(service,/startActivity\(/);
  assert.match(main,/PlanikWakeDispatch.consume\(intent\)/);
  assert.match(home,/quickAiMode=="live"/);
  assert.match(home,/quickAiMode=="voice"/);
  assert.match(manifest,/android:foregroundServiceType="microphone"/);
});
test('Compact live window hides the web workspace without destroying the session',async()=>{
  const [live,home,manifest]=await Promise.all([read(pkg+'planik/PlanikLiveActivity.kt'),read(pkg+'feature/home/HomeScreen.kt'),read('AndroidManifest.xml')]);
  assert.match(live,/#root\{visibility:hidden!important;pointer-events:none!important\}/);
  assert.match(live,/FLAG_NOT_TOUCH_MODAL/);
  assert.match(live,/"ended" -> \{ finish\(\)/);
  assert.match(live,/PlanikWakeMicGate.acquire\(this\)/);
  assert.match(live,/PlanikWakeMicGate.release\(this\)/);
  assert.match(home,/PlanikLiveUpdates.events.collect/);
  assert.match(manifest,/Theme.Planirovych.LiveOverlay/);
});
