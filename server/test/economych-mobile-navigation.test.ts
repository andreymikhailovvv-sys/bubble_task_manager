import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const mini=read('../../client/src/MiniApp.tsx');
const entry=read('../../client/src/main.tsx');
const economic=read('../../client/src/EconomicApp.tsx');
const economicCss=read('../../client/src/EconomicApp.css');
const miniCss=read('../../client/src/styles.css');
const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
const workspace=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
const android=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicPage.kt');
const native=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicCompose.kt');
const editor=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicEditor.kt');
const financeData=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicData.kt');
const api=read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/PlanirovychApi.kt');
const network=read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/NetworkModule.kt');
const androidVersion=read('../../android-app/app/build.gradle.kts');

test('Mini App and Android have 5 compact icon-only tabs with a warm Economic last tab',()=>{
  assert.equal((mini.match(/<MiniNavigationControl/g)||[]).length,5);
  assert.match(mini,/aria-label="Экономыч AI, финансы"/);
  assert.match(mini,/isEconomicOpen \? 'economic'/);
  for(const text of ['Список','Таймлайн','Чат с ИИ','Заметки'])
    assert.doesNotMatch(mini,new RegExp('<span>'+text+'</span>'));
  assert.match(miniCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(miniCss,/data-active-tab='economic'/);
  assert.match(miniCss,/\.miniapp-economic-screen\{/);
  assert.match(home,/pageCount=\{5\}/);
  assert.match(home,/Triple\("Экономыч",Icons\.Default\.MonetizationOn/);
  assert.match(home,/label=null,/);
  assert.match(home,/alwaysShowLabel=false/);
  assert.match(home,/Modifier\.height\(56\.dp\)/);
  assert.match(home,/Spacer\(Modifier\.windowInsetsBottomHeight\(WindowInsets\.navigationBars\)\)/);
  assert.match(home,/selectedIconColor=if\(index==4\)/);
  assert.match(workspace,/4 -> NativeEconomicPage\(userId=state\.user\?\.id,dark=dark,active=pagerState\.currentPage==4\)/);
  assert.match(androidVersion,/versionCode = 16/);
});

test('both mobile surfaces reuse the actual responsive financial overview and editor',()=>{
  assert.match(mini,/const MobileEconomicApp = lazy\(\(\) => import\('\.\/EconomicApp'\)\)/);
  assert.match(mini,/<MobileEconomicApp mobile embeddedInMiniApp/);
  assert.match(mini,/themeOverride=\{isLightTheme \? 'light' : 'dark'\}/);
  assert.match(entry,/EconomicApp mobile=\{economicParams\.get\('mobile'\) === '1' \|\| isCompactEconomicViewport\}/);
  assert.match(entry,/themeOverride=\{economicThemeOverride\}/);
  assert.match(economic,/function EconomicApp\(\{ mobile = false, embeddedInMiniApp = false/);
  assert.match(economic,/className="econ-mobile-sections"/);
  assert.match(economic,/mobile \? ' econ-mobile-workspace'/);
  assert.match(economic,/!mobile && <ModuleRail active="economic"\/>/);
  assert.match(economic,/section === 'overview'/);
  assert.match(economic,/openDialog\('operation'/);
  assert.match(economic,/openDialog\('account'/);
  assert.match(economic,/openDialog\('loan'/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-modal-backdrop/);
  assert.match(economicCss,/econ-dialog-layer \.econ-modal/);
  assert.match(economicCss,/max-height:100%/);
  assert.match(economicCss,/\.econ-dialog-layer \.econ-form-actions/);
});

test('native Android Economic no longer embeds a browser or owns a second cookie session',()=>{
  assert.match(android,/EconomicComposePage\(userId=userId, dark=dark, active=active\)/);
  assert.doesNotMatch(android,/WebView\(|CookieManager\(|evaluateJavascript\(|loadUrl\(/);
  assert.match(native,/NetworkModule\.api\(context\)/);
  assert.match(network,/PersistentCookieJar\(context\)/);
  assert.match(api,/@GET\("api\/economic\/snapshot"\)/);
  assert.match(api,/@GET\("api\/economic\/operations"\)/);
  assert.match(api,/@POST\("api\/economic\/\{resource\}"\)/);
  assert.match(api,/@PATCH\("api\/economic\/\{resource\}\/\{id\}"\)/);
  assert.match(api,/@DELETE\("api\/economic\/\{resource\}\/\{id\}"\)/);
});

test('all financial sections have native data-driven UI and real CRUD',()=>{
  for (const title of ['Обзор','Счета','Операции','Долги и кредиты','Категории'])
    assert.ok(native.includes(title));
  assert.match(native,/economicSnapshot\(\)/);
  assert.match(native,/economicOperations\(/);
  assert.match(native,/economicCreate\(resource, payload\)/);
  assert.match(native,/economicUpdate\(resource, record\.ecoText\("id"\), payload\)/);
  assert.match(native,/economicDelete\(selection\.resource,selection\.record\.ecoText\("id"\)\)/);
  assert.match(native,/if\(linked!=null\)"debts" else "operations"/);
  assert.match(native,/nextCursor/);
  assert.match(native,/EcoPaymentProgress/);
});

test('Android financial editors are native bottom sheets with keyboard-safe actions',()=>{
  assert.match(editor,/ModalBottomSheet\(/);
  assert.match(editor,/rememberModalBottomSheetState\(skipPartiallyExpanded=true\)/);
  assert.match(editor,/\.imePadding\(\)\.navigationBarsPadding\(\)/);
  assert.match(editor,/\.verticalScroll\(rememberScrollState\(\)\)/);
  assert.match(editor,/Text\("Отмена"/);
  assert.match(editor,/Text\(if\(saving\)"Сохранение…" else "Сохранить"/);
  for (const type of ['accounts','operations','debts','loans','categories'])
    assert.ok(editor.includes('"'+type+'"'));
  assert.match(editor,/DatePickerDialog\(/);
  assert.match(editor,/onCreateCategory/);
  assert.match(editor,/remindersEnabled/);
  assert.match(native,/EconomicSkeleton\(dark\)/);
  assert.match(native,/FloatingActionButton\(/);
});

test('native money is integer kopecks; web Mini App remains intact',()=>{
  assert.match(financeData,/BigDecimal\(clean\)\.movePointRight\(2\)\.toBigIntegerExact\(\)/);
  assert.match(financeData,/BigInteger/);
  assert.match(financeData,/ecoLoanEstimate/);
  assert.match(editor,/ecoParseMoney\(value\("amount"\)\)/);
  assert.match(native,/current\.ecoObject\("totals"\)\.ecoText\("balanceMinor"\)/);
  assert.match(native,/val colors = remember\(dark\) \{ ecoColors\(dark\) \}/);
  assert.match(financeData,/background = Color\(0xFFFFF9F1\)/);
  assert.match(financeData,/background = Color\(0xFF15151C\)/);
  assert.match(mini,/<MobileEconomicApp mobile embeddedInMiniApp/);
  assert.match(economic,/createPortal\(<div/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-modal-backdrop/);
  assert.match(economicCss,/position:sticky;bottom:0/);
});
