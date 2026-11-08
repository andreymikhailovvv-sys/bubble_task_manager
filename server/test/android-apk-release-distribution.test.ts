import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {selectAndroidRelease} from '../src/services/android-release-catalog.service.js';

const repo='andreymikhailovvv-sys/bubble_task_manager';
const asset=(tag:string)=>({
  name:'planirovych-android.apk',size:32_000_000,
  browser_download_url:`https://github.com/${repo}/releases/download/${tag}/planirovych-android.apk`
});
const item=(tag:string,versionName:string,options:Record<string,unknown>={})=>({
  tag_name:tag,name:`Планировыч ${versionName}`,body:'Исправлена работа чатов',
  draft:false,prerelease:false,published_at:'2026-11-07T12:00:00Z',
  assets:[asset(tag)],...options
});
const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('catalog publishes only the highest valid signed-release tag and actual APK asset',()=>{
  const result=selectAndroidRelease([
    item('android-v2','1.0.0'),
    item('android-v4','1.0.2',{draft:true}),
    item('web-v20','20.0.0'),
    item('android-v3','1.0.1'),
    item('android-v5','1.0.3',{prerelease:true})
  ]);
  assert.equal(result?.public.versionCode,3);
  assert.equal(result?.public.versionName,'1.0.1');
  assert.equal(result?.public.downloadPath,'/api/android/download');
  assert.equal(result?.assetUrl,`https://github.com/${repo}/releases/download/android-v3/planirovych-android.apk`);
});

test('catalog denies non-GitHub arbitrary APK hosts, absent assets and invalid tag names',()=>{
  assert.equal(selectAndroidRelease([
    item('android-v5','1.0.5',{assets:[{name:'planirovych-android.apk',size:50, browser_download_url:'https://example.com/malware.apk'}]}),
    item('android-v6','1.0.6',{assets:[{name:'other.apk',size:999,browser_download_url:'https://github.com/invalid'}]}),
    item('android-v007','1.0.7'),
  ]),null);
  assert.equal(selectAndroidRelease([]),null);
  assert.throws(()=>selectAndroidRelease(null));
});

test('website uses a public Android page and always resolves its download from server',async()=>{
  const [page,routing,integrations,api]=await Promise.all([
    read('../../client/src/AndroidDownloadPage.tsx'),
    read('../../client/src/main.tsx'),
    read('../../client/src/components/TelegramIntegrationsMenu.tsx'),
    read('../src/routes/api.ts')
  ]);
  assert.match(page,/fetch\('\/api\/android\/latest'/);
  assert.match(page,/href=\{download\}/);
  assert.match(page,/APK готовится к публикации/);
  assert.match(routing,/window\.location\.pathname === '\/android'/);
  assert.match(integrations,/\['bot', 'android', 'messages'/);
  assert.match(integrations,/Скачать для Android/);
  assert.match(api,/apiRouter\.get\('\/android\/latest'/);
  assert.match(api,/apiRouter\.get\('\/android\/download'/);
  assert.match(api,/res\.redirect\(302, release\.assetUrl\)/);
});

test('Android shows updates only for signed release build and opens official site',async()=>{
  const [updater,activity,gradle]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/updates/AndroidAppUpdates.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/MainActivity.kt'),
    read('../../android-app/app/build.gradle.kts')
  ]);
  assert.match(updater,/if\(BuildConfig\.DEBUG\)/);
  assert.match(updater,/if\(code<=BuildConfig\.VERSION_CODE\)/);
  assert.match(updater,/AndroidAppUpdateWorker/);
  assert.match(updater,/UPDATE_MANIFEST = "https:\/\/planirovych\.ru\/api\/android\/latest"/);
  assert.match(activity,/AndroidAppUpdateDialog/);
  assert.match(activity,/https:\/\/planirovych\.ru\/android/);
  // Version numbers change with each release. Never hardcode v2 in CI.
  const code = Number(gradle.match(/versionCode\s*=\s*(\d+)/)?.[1]);
  const version = gradle.match(/versionName\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(Number.isSafeInteger(code) && code >= 2);
  assert.ok(version, 'release versionName must use x.y.z format');
  assert.match(gradle,/PLANIROVYCH_RELEASE_STORE_PASSWORD/);
});

test('Android update Later snoozes the current release for 24 hours, not forever',async()=>{
  const [updater,activity]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/updates/AndroidAppUpdates.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/MainActivity.kt')
  ]);
  assert.match(updater,/REMINDER_INTERVAL_MS = TimeUnit\.HOURS\.toMillis\(24\)/);
  assert.match(updater,/private const val SNOOZED_CODE/);
  assert.match(updater,/prefs\.getInt\(SNOOZED_CODE,0\)==code/);
  assert.match(updater,/nowMs < prefs\.getLong\(SNOOZED_UNTIL,0L\)/);
  assert.match(updater,/\.putLong\(SNOOZED_UNTIL,nowMs\+REMINDER_INTERVAL_MS\)/);
  assert.match(updater,/AndroidAppUpdateChecker\.snoozed\(applicationContext,release\.versionCode,now\)/);
  assert.doesNotMatch(updater,/dismissed_version|fun dismissed\(|fun dismiss\(/);
  assert.match(activity,/onLater=\{[\s\S]*?AndroidAppUpdateChecker\.snooze\(this@MainActivity,release\.versionCode\)/);
  const onUpdate=activity.slice(activity.indexOf('onUpdate={'),activity.indexOf('onUpdate={')+580);
  assert.match(onUpdate,/startActivity\(Intent\(Intent\.ACTION_VIEW/);
  assert.doesNotMatch(onUpdate,/AndroidAppUpdateChecker\.snooze\(/);
  assert.match(activity,/updatePageOpenedAtMs=System\.currentTimeMillis\(\)/);
});

test('background update notifications may reappear after a day, never during snooze',async()=>{
  const updater=await read('../../android-app/app/src/main/java/ru/planirovych/app/updates/AndroidAppUpdates.kt');
  assert.match(updater,/lastCode==release\.versionCode && lastSentAt>0L/);
  assert.match(updater,/now-lastSentAt<REMINDER_INTERVAL_MS/);
  assert.match(updater,/\.putLong\(LAST_NOTIFIED_AT,now\)/);
  assert.match(updater,/\.cancel\(UPDATE_NOTIFICATION_ID\)/);
});
