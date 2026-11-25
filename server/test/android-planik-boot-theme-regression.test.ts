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

test('WebView verifies the current account and cookie values before navigation', async () => {
  const [activity, manifest, general, task, jar] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/planik/PlanikLiveActivity.kt'),
    read('../../android-app/app/src/main/AndroidManifest.xml'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/PersistentCookieJar.kt')
  ]);
  assert.match(activity, /repository\.establishSession\(\)/);
  assert.match(activity, /currentUser\.id != expectedUserId/);
  assert.doesNotMatch(activity, /manager\.removeAllCookies/);
  assert.match(activity, /manager\.setCookie\(origin, "\$name=; Max-Age=0; Path=\/"\)/);
  assert.match(activity, /manager\.setCookie\(origin, cookie\.toString\(\)\)/);
  assert.match(activity, /loadIfCookiesMatch\(view, origin, cookies\)/);
  assert.match(activity, /actual\.size != expectedPairs\.size \|\| actual\.toSet\(\) != expectedPairs\.toSet\(\)/);
  assert.match(activity, /CookieManager\.getInstance\(\)\.flush\(\)/);
  assert.match(activity, /view\.loadUrl\(targetUrl\)/);
  assert.match(activity, /COOKIE_READY_TIMEOUT_MS = 4_000L/);
  assert.match(activity, /showFailure\("Не удалось синхронизировать сессию Планика/);
  assert.match(activity, /onReceivedHttpError\(/);
  assert.match(activity, /onReceivedError\(/);
  assert.match(activity, /App bundle asset HTTP/);
  assert.match(activity, /BOOT_TIMEOUT_MS = 40_000L/);
  assert.match(general, /expectedUserId = userId/);
  assert.match(task, /expectedUserId = home\.user\?\.id/);
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /android\.permission\.MODIFY_AUDIO_SETTINGS/);
  // Reads must not persist an old session snapshot over a newer login.
  assert.doesNotMatch(jar, /loadForRequest[\s\S]{0,180}persist\(\)/);
});

test('Android Realtime loads its authenticated planner snapshot but skips unrelated inboxes', async () => {
  const mini = await read('../../client/src/MiniApp.tsx');
  assert.match(mini, /const androidVoice = Boolean\(androidPlanikLaunch\)/);
  assert.match(mini, /api\.getSpheres\(\),\s*api\.getTasks\(\),\s*api\.getHabits\(\)/);
  assert.doesNotMatch(mini, /androidVoice && !androidPlanikLaunch\?\.taskId/);
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
  assert.match(native, /produceState<List<Bitmap\?>>\(emptyList\(\),context,dark,mode,skinId\)/);
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
  assert.match(build, /versionCode = 24/);
  assert.match(build, /versionName = "1\.0\.22"/);
});

test('native mascot only hides its offline fallback after real transparent pixel coverage',async()=>{
  const [art,native,skins,entry,mini,home] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/SharedMascotArtwork.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeMascotSkinSvg.kt'),
    read('../../client/android-mascot.html'),
    read('../../client/src/MiniApp.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt')
  ]);
  assert.match(art,/super\.onDraw\(requireNotNull\(frameCanvas\)\)/);
  assert.match(art,/if\(hasMascotPixels\(bitmap\)\)/);
  assert.match(art,/return visible>=10 && transparent>=10/);
  assert.doesNotMatch(art,/corners\.count/);
  assert.match(art,/canvas\.drawBitmap\(bitmap,0f,0f,null\)[\s\S]*?publish\(true\)/);
  assert.match(art,/if\(!painted\|\|rendererFailed\)NativeMascotFallback/);
  assert.match(art,/Modifier\.fillMaxSize\(\)\.zIndex\(1f\)/);
  assert.doesNotMatch(art,/\balpha\s*=\s*0f/);
  assert.match(art,/onRenderProcessGone/);
  assert.match(native,/nativeMascotSkinSvg\(source, skinId, dark, mode, frame\)/);
  for(const id of ['cat','northern','maestro','zoomer','pirate','wizard','ninja','space']){
    assert.ok(skins.includes('"'+id+'"'),id+' offline artwork missing');
  }
  assert.match(entry,/src="\/src\/android-mascot-main\.tsx"/);
  assert.doesNotMatch(entry,/src="\/src\/main\.tsx"|telegram-web-app|workspace-boot-splash/);
  assert.doesNotMatch(mini,/miniapp-mascot-wardrobe-button/);
  assert.match(mini,/setIsSettingsOpen\(false\); wardrobe\.show\(\);/);
  assert.match(home,/Аксессуары и скины Планика/);
});

test('all skins use the original launcher crop and individually cached animation frames', async () => {
  const [native,motion,art,web,home,live] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/PlanikNativeLauncher.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeMascotMotion.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeMascotSkinSvg.kt'),
    read('../../client/src/components/AndroidMascotSurface.tsx'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.match(native,/Bitmap\.createBitmap\(full, 80, 12, 280, 300\)/);
  assert.doesNotMatch(native,/if\(skinId=="classic"\) Bitmap\.createBitmap/);
  assert.match(native,/withContext\(Dispatchers\.Default\)/);
  assert.match(native,/nativeMascotMotionSvg\(skinId,mode,frame\)/);
  for(const part of ['pirate-map','wizard-cards','space-signal','ninja-notebook','northern-warmth','zoomer-phone','ninja-guard','wizard-orb']){
    assert.ok(motion.includes('native-'+part),part);
  }
  assert.match(art,/sin\(frame\*Math\.PI\/6\)/);
  assert.match(art,/sin\(frame\*Math\.PI\/4\+1\.3\)/);
  assert.match(web,/setAttribute\('viewBox', '100\.7 25\.4 230 246\.4'\)/);
  assert.match(home,/rememberModalBottomSheetState\(skipPartiallyExpanded=true\)/);
  assert.match(home,/sheetState=sheetState/);
  assert.match(live,/api\.getMascotWardrobe\(\)/);
  assert.match(live,/wardrobe\.userId!==user\.id/);
  assert.match(live,/skinId=\{appearance\.skinId\}/);
  assert.match(live,/<strong>\{mascotName\}<\/strong>/);
  assert.match(live,/previewMode=\{phase==='thinking'\?'thinking':'idle'\}/);
});

test('Android uses the server daily remaining percentage and refreshes the same account', async()=>{
  const [models,header,dialog,vm,activity,api,web]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/data/model/Models.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiAccountSheets.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/MainActivity.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/PlanirovychApi.kt'),
    read('../../client/src/components/SubscriptionLimitPanel.tsx')
  ]);
  assert.match(models,/val aiBalanceLabel:[\s\S]*?limit\.daily\?\.let[\s\S]*?remainingPercent/);
  assert.match(models,/val monthlyAiBalanceLabel/);
  assert.match(header,/Остаток дневного лимита ИИ/);
  assert.match(header,/state\.user\?\.aiBalanceLabel/);
  assert.match(dialog,/user\?\.monthlyAiBalanceLabel/);
  assert.match(dialog,/window\.remainingPercent\.coerceIn\(0,100\)/);
  assert.match(dialog,/LaunchedEffect\(user\?\.id\)\{\s*vm\.refreshCreditsBalance\(\)/);
  assert.match(activity,/repeatOnLifecycle\(Lifecycle\.State\.RESUMED\)[\s\S]*?vm\.refreshCreditsBalanceNow\(\)[\s\S]*?delay\(60_000L\)/);
  assert.match(vm,/creditRefreshMutex\.withLock/);
  assert.match(vm,/current\.user\?\.id!=owner/);
  assert.match(vm,/else if\(profile\.id!=owner\)/);
  assert.match(api,/Cache-Control: no-cache, no-store/);
  assert.match(web,/limit\?\.daily\?\.remainingPercent/);
});
