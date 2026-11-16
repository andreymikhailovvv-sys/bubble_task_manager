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
  assert.match(androidVersion,/versionCode = 14/);
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

test('Android WebView never silently takes over a different account',()=>{
  assert.match(android,/PersistentCookieJar\(context\)\.loadForRequest\(host\)/);
  assert.match(android,/previous\.toSet\(\)!=expected\.toSet\(\)/);
  assert.match(android,/if\(!allowReplacement/);
  assert.match(android,/conflict=true/);
  assert.match(android,/syncSession\(true\)/);
  assert.match(android,/manager\.setCookie/);
  assert.match(android,/current\.toSet\(\)!=expected\.toSet\(\)/);
  assert.doesNotMatch(android,/removeAllCookies/);
  assert.match(android,/target\.scheme=="https"/);
  assert.match(android,/target\.path\?\.startsWith\("\/economic"\)/);
  assert.match(android,/MIXED_CONTENT_NEVER_ALLOW/);
});

test('financial dialogs escape the tab scroller and expose the actions on small screens',()=>{
  assert.match(economic,/createPortal\(<div/);
  assert.match(economic,/document\.body\)/);
  assert.match(economic,/econ-miniapp-dialog-layer/);
  assert.match(economicCss,/econ-miniapp-dialog-layer/);
  assert.match(economicCss,/--econ-mobile-safe-bottom/);
  assert.match(mini,/mobileSafeBottom=\{isTelegramRuntime \? telegramViewport\.bottom : 0\}/);
  assert.match(economicCss,/position:sticky;bottom:0/);
  assert.match(economicCss,/overflow-y:auto;overscroll-behavior:contain/);
  assert.match(economicCss,/\.econ-dialog-layer \.econ-form-actions button/);
  assert.match(android,/document\.querySelector\('\.econ-root \.econ-main'\)/);
  assert.doesNotMatch(android,/querySelector\('\.econ-mobile-workspace \.econ-main'\)/);
  assert.match(android,/EconomicSkeleton\(dark\)/);
  assert.match(android,/addQueryParameter\("mobileTheme",if\(dark\)/);
  assert.match(home,/pagerState\.currentPage!=4/);
});

test('native economic route reads Android theme and uses the shared operation form',()=>{
  const androidEntry=read('../../client/src/economic-main.tsx');
  assert.match(androidEntry,/economicParams\.get\('mobile'\) === '1'/);
  assert.match(androidEntry,/mobile=\{isMobileEconomic\} themeOverride=\{economicThemeOverride\}/);
  assert.match(economic,/data-economic-create-operation/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-top-actions\{display:none\}/);
  assert.match(android,/document\.querySelector\('\[data-economic-create-operation\]'\)/);
  assert.match(android,/FloatingActionButton\(/);
  assert.match(economic,/embeddedInMiniApp && !dialog/);
  assert.match(economicCss,/\.econ-mobile-add-fab\{/);
});

test('finance light mode uses neutral surfaces and a matching light editor',()=>{
  assert.match(economicCss,/\.econ-root\.econ-light\{[\s\S]*?--ec-bg:#f7f8fa/);
  assert.match(economicCss,/\.econ-dialog-layer\.econ-light \.econ-modal\{[\s\S]*?background:#fff/);
  assert.match(economicCss,/\.econ-dialog-layer\.econ-light \.econ-form-actions\{background:#fff/);
  assert.match(android,/android\.graphics\.Color\.WHITE/);
  assert.match(miniCss,/\.miniapp-light \.miniapp-economic-screen\{background:#f7f8fa\}/);
});
