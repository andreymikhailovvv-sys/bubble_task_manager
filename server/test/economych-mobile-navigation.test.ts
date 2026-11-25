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
const report=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicReport.kt');
const webReport=read('../../client/src/EconomicReport.tsx');
const webReportCss=read('../../client/src/EconomicReport.css');
const api=read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/PlanirovychApi.kt');
const network=read('../../android-app/app/src/main/java/ru/planirovych/app/core/network/NetworkModule.kt');
const androidVersion=read('../../android-app/app/build.gradle.kts');

test('Android and Mini App have 4 labeled tabs, with the warm Economic tab last',()=>{
  assert.equal((mini.match(/<MiniNavigationControl/g)||[]).length,4);
  assert.match(mini,/aria-label="Экономыч AI, финансы"/);
  assert.match(mini,/isEconomicOpen \? 'economic'/);
  for(const text of ['Общая','Таймлайн','ИИ-чат','Экономыч'])
    assert.match(mini,new RegExp('miniapp-bottom-navigation-label">'+text+'</span>'));
  assert.doesNotMatch(mini,/miniapp-bottom-navigation-icon"><StickyNote/);
  assert.match(miniCss,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(miniCss,/data-active-tab='economic'/);
  assert.match(miniCss,/\.miniapp-economic-screen\{/);
  assert.match(home,/pageCount=\{4\}/);
  assert.match(home,/Triple\("Экономыч",Icons\.Default\.MonetizationOn/);
  assert.match(home,/label=\{Text\(tab\.first,fontSize=10\.sp,maxLines=1\)\}/);
  assert.match(home,/alwaysShowLabel=true/);
  assert.match(home,/Modifier\.height\(66\.dp\)/);
  assert.match(home,/Spacer\(Modifier\.windowInsetsBottomHeight\(WindowInsets\.navigationBars\)\)/);
  assert.match(home,/selectedIconColor=if\(index==3\)/);
  assert.match(workspace,/3 -> NativeEconomicPage\(userId=state\.user\?\.id,dark=dark,active=pagerState\.currentPage==3,/);
  assert.match(androidVersion,/versionCode = 25/);
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
  assert.match(android,/EconomicComposePage\(userId=userId, dark=dark, active=active,/);
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
  assert.match(native,/economicCreate\(resource,payload\)/);
  assert.match(native,/economicUpdate\(resource,record\.ecoText\("id"\),payload\)/);
  assert.match(native,/economicDelete\(selection\.resource,selection\.record\.ecoText\("id"\)\)/);
  assert.match(native,/if\(linked!=null\) onEdit\(linked,"debts"\) else onEdit\(op,"missing-debt"\)/);
  assert.match(native,/nextCursor/);
  assert.match(native,/EcoPaymentProgress/);
});

test('Android financial editors are native bottom sheets with keyboard-safe actions',()=>{
  assert.match(editor,/ModalBottomSheet\(/);
  assert.match(editor,/sheetGesturesEnabled=true/);
  assert.match(editor,/rememberModalBottomSheetState\(/);
  assert.match(editor,/skipPartiallyExpanded=true/);
  assert.match(editor,/confirmValueChange=\{target->target!=SheetValue.Hidden \|\| !savingNow\}/);
  assert.match(editor,/\.imePadding\(\)\.navigationBarsPadding\(\)/);
  assert.match(editor,/\.verticalScroll\(formScroll\)/);
  assert.match(editor,/Text\("Отмена"/);
  assert.match(editor,/Text\(if\(saving\)"Сохранение…" else "Сохранить"/);
  for (const type of ['accounts','operations','debts','loans','categories'])
    assert.ok(editor.includes('"'+type+'"'));
  assert.match(editor,/DatePickerDialog\(/);
  assert.match(editor,/onCreateCategory/);
  assert.match(editor,/remindersEnabled/);
  assert.match(native,/EconomicSkeleton\(dark\)/);
  assert.match(native,/NativeHoldActionButton\(/);
  assert.match(native,/onVoice=onQuickVoice/);
  assert.match(native,/NativeHoldAction\("Добавить операцию"/);
});

test('native money is integer kopecks; web Mini App remains intact',()=>{
  assert.match(financeData,/BigDecimal\(clean\)\.movePointRight\(2\)\.toBigIntegerExact\(\)/);
  assert.match(financeData,/BigInteger/);
  assert.match(financeData,/ecoLoanEstimate/);
  assert.match(editor,/ecoParseMoney\(value\("amount"\)\)/);
  assert.match(native,/current\.ecoObject\("totals"\)\.ecoText\("balanceMinor"\)/);
  assert.match(native,/val colors = remember\(dark\) \{ ecoColors\(dark\) \}/);
  assert.match(financeData,/background = Color\(0xFFF7F8FA\)/);
  assert.match(financeData,/background = Color\(0xFF12131B\)/);
  assert.match(mini,/<MobileEconomicApp mobile embeddedInMiniApp/);
  assert.match(economic,/createPortal\(<div/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-modal-backdrop/);
  assert.match(economicCss,/position:sticky;bottom:0/);
});

test('Economic financial UI has four balanced tiles and stable native sheets',()=>{
  assert.match(economic,/topExpenseCategory/);
  assert.match(economic,/wholeRubles\(snapshot\.totals\.monthExpenseMinor\)/);
  assert.match(economic,/econ-intro-hide/);
  assert.match(economic,/econ-filters-toggle/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(native,/EcoTopCategoryStat/);
  assert.match(native,/detectHorizontalDragGestures/);
  assert.match(native,/ecoWholeRubles\(minor\)/);
  assert.match(editor,/height\(stableSheetHeight\)/);
  assert.match(editor,/Modifier\.weight\(1f\)\.verticalScroll\(formScroll\)/);
  assert.doesNotMatch(editor,/weight\(1f,fill=false\)/);
});

test('Economic mobile polish archives closed obligations and animates tab changes',()=>{
  assert.match(economic,/econ-operations-heading/);
  assert.match(economic,/snapshot\.debts\.filter\(d => !d\.isClosed\)/);
  assert.match(economic,/snapshot\.loans\.filter\(l => !l\.isClosed\)/);
  assert.match(economic,/econ-closed-toggle/);
  assert.match(economic,/hidden=\{!closedOpen\}/);
  assert.match(economicCss,/\.econ-closed-content\[hidden\]\{display:none\}/);
  assert.match(native,/AnimatedContent\(/);
  assert.match(native,/slideInHorizontally\(/);
  assert.match(native,/closedDebts/);
  assert.match(native,/closedLoans/);
  assert.match(native,/height\(IntrinsicSize\.Max\)/);
  assert.match(native,/Arrangement\.spacedBy\(0\.dp\)/);
  assert.match(native,/Text\("Последние операции",fontSize=15\.sp/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('native Economic overview reuses the Accounts tab card contents without actions',()=>{
  const overview=native.slice(native.indexOf('"overview" -> {'),native.indexOf('"report" -> {'));
  const accounts=native.slice(native.indexOf('"accounts" -> {'),native.indexOf('"operations" -> {'));
  const summary=native.slice(native.indexOf('private fun EcoAccountSummary('),native.indexOf('private fun EcoQuickAction('));
  assert.match(overview,/EcoMiniAccountTile\(account,colors\)/);
  assert.match(accounts,/EcoAccountSummary\(account,colors\)/);
  assert.match(accounts,/EcoQuickAction\("Изменить"/);
  assert.doesNotMatch(overview,/EcoQuickAction\("Изменить"/);
  assert.doesNotMatch(native,/private fun EcoAccountTile\(/);
  assert.equal((native.match(/private fun EcoAccountSummary\(/g)||[]).length,1);
  assert.match(summary,/Text\(account\.ecoText\("name"\)/);
  assert.match(summary,/Text\(ecoRubles\(account\.ecoText\("balanceMinor"\)\)/);
  assert.match(summary,/Text\(if\(account\.ecoText\("accountType"\)=="CREDIT_CARD"\)/);
  assert.match(summary,/"Лимит: "\+ecoRubles\(account\.ecoText\("creditLimitMinor"\)\)/);
});
test('native Economic overview tiles are compact and category amount is prominent',()=>{
  assert.doesNotMatch(native,/Column\(modifier\.height\(120\.dp\)/);
  assert.match(native,/Text\("Траты в категориях"/);
  assert.match(native,/Text\(ecoWholeRubles\(minor\),color=colors\.text,fontSize=18\.sp/);
  assert.match(native,/Text\(category\.ifBlank \{ "Нет расходов" \}/);
  assert.doesNotMatch(native,/Больше всего расходов/);
  assert.match(native,/foreground=if\(dark\)Color\(0xFF2B1B08\) else Color\.White/);
  assert.match(report,/if\(!preview\)\s*\{/);
  assert.match(report,/Text\(ecoWholeRubles\(total\.toString\(\)\)/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('Economic preview report follows accounts and starts collapsed on Android and Mini App',()=>{
  const overview=native.slice(native.indexOf('"overview" -> {'),native.indexOf('"report" -> {'));
  const accounts=overview.indexOf('EcoPanelHeader("Мои счета"');
  const reportPosition=overview.indexOf('EcoReportPanel(api,colors,revision,preview=true)');
  assert.ok(accounts>=0 && reportPosition>accounts);
  assert.match(report,/var expanded by remember \{ mutableStateOf\(!preview\) \}/);
  assert.match(report,/if\(preview && !expanded\)/);
  assert.match(report,/EcoReportDonut\(total,selection,colors,130\.dp\)/);
  assert.match(report,/EcoReportDonut\(total,selection,colors,210\.dp\)/);
  assert.match(report,/Text\(ecoWholeRubles\(total\.toString\(\)\)/);
  const mobile=economic.slice(economic.indexOf('<div className="econ-dashboard-grid">'));
  assert.ok(mobile.indexOf('Мои счета')<mobile.indexOf('econ-report-preview-grid-item'));
  assert.ok(mobile.indexOf('econ-report-preview-grid-item')<mobile.indexOf('Долги и кредиты'));
  assert.match(mobile,/<EconomicReport preview collapsedByDefault revision=\{reportRevision\}\/>/);
  assert.match(webReport,/preview && collapsed \?/);
  assert.match(webReport,/econ-report-compact-legend/);
  assert.match(webReport,/formatWholeRub\(selected\?\.totalMinor/);
  assert.match(webReportCss,/\.econ-report-compact-category i/);
});
test('Economych Android summary sizes naturally, bright add button, normal account names and tab icon contrast',()=>{
  const accountSummary=native.slice(native.indexOf('private fun EcoAccountSummary('),native.indexOf('private fun EcoQuickAction('));
  assert.match(native,/height\(IntrinsicSize\.Max\)/);
  assert.doesNotMatch(native,/Column\(modifier\.height\(120\.dp\)/);
  assert.match(native,/verticalArrangement=Arrangement\.spacedBy\(6\.dp\)/);
  assert.match(native,/accent=Color\(0xFFF5A52E\)/);
  assert.match(accountSummary,/fontWeight=FontWeight\.Normal,fontSize=13\.sp/);
  assert.match(home,/selectedIconColor=if\(index==3\) \(if\(dark\) Color\(0xFFF6B95F\) else Color\(0xFF9B5200\)\)/);
  assert.match(report,/fontSize=if\(compact\) 15\.sp else 23\.sp/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('Native finance matches Mini App mobile visual tokens and compact hierarchy',()=>{
  assert.match(financeData,/background = Color\(0xFF12131B\)/);
  assert.match(financeData,/background = Color\(0xFFF7F8FA\)/);
  assert.match(financeData,/panel2 = Color\(0xFFF8F9FB\)/);
  assert.match(financeData,/text = Color\(0xFF202A38\)/);
  assert.match(financeData,/gold = Color\(0xFFDF8B25\)/);
  assert.match(economicCss,/\.econ-mobile-workspace \.econ-main\{/);
  assert.match(native,/Text\("Экономыч AI",fontSize=22\.sp,fontWeight=FontWeight\.Bold/);
  assert.match(native,/verticalArrangement = Arrangement\.spacedBy\(11\.dp\)/);
  assert.match(native,/RoundedCornerShape\(17\.dp\)\)\.padding\(14\.dp\)/);
  assert.match(native,/EcoMiniAccountTile\(account,colors\)/);
  assert.match(native,/EcoMiniAccountTile\(account,colors\) \{/);
  assert.match(native,/editor=EcoEditorRequest\("accounts",account\)/);
  assert.match(native,/private fun EcoMiniAccountTile\(account:JsonObject,colors:EcoColors,onEdit:\(\)->Unit\)/);
  assert.match(native,/\.clickable\(onClickLabel="Изменить счёт"\) \{ onEdit\(\) \}/);
  assert.match(native,/private fun EcoMiniAccountTile\(/);
  assert.match(native,/val tile=if\(light&&primary\)Color\(0xFFFFF9F2\) else colors\.panel2/);
  assert.match(native,/fontWeight=FontWeight\.Normal,fontSize=13\.sp,maxLines=1/);
  assert.match(native,/fontWeight=FontWeight\.Bold,fontSize=18\.sp/);
  assert.match(native,/if\(light\) \{\s*if\(credit\)Color\(0xFFE3F6E9\)/);
  assert.match(native,/if\(credit\)Color\(0xFF23824C\)/);
  assert.match(native,/EcoLoanMetric\("Сумма кредита"/);
  assert.match(native,/EcoLoanMetric\("Всего выплат \(оценка\)"/);
  assert.match(native,/EcoPaymentProgress\(/);
  assert.match(native,/EcoEditorRequest\("accounts",account\)/);
  assert.match(report,/Text\("Финансовый отчёт",color=colors\.text,fontWeight=FontWeight\.SemiBold,fontSize=15\.sp\)/);
  assert.match(editor,/height\(stableSheetHeight\)/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('Mini App native parity also covers editors, loan metrics and loading surfaces',()=>{
  assert.match(editor,/Text\(title,fontSize=20\.sp,fontWeight=FontWeight\.Bold/);
  assert.match(editor,/fontSize=11\.sp,fontWeight=FontWeight\.Normal,color=colors\.muted/);
  assert.match(editor,/\.padding\(vertical=12\.dp\),verticalArrangement=Arrangement\.spacedBy\(11\.dp\)/);
  assert.match(native,/EcoLoanMetric\("Срок"/);
  assert.match(native,/EcoLoanMetric\("Переплата \(оценка\)"/);
  assert.match(native,/fontSize=19\.sp,fontWeight=FontWeight\.SemiBold,color=colors\.text/);
  assert.match(native,/\.background\(if\(light\) \{/);
  assert.match(native,/\.padding\(horizontal=10\.dp,vertical=7\.dp\)/);
  assert.match(financeData,/bannerStart = Color\.White/);
  assert.match(report,/EcoReportDonut\(total,selection,colors,210\.dp\)/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('Android Economic dashboard follows Mini App spatial rhythm and warm summary tiles',()=>{
  const overview=native.slice(native.indexOf('"overview" -> {'),native.indexOf('"report" -> {'));
  const firstCard=native.slice(native.indexOf('private fun EcoStat('),native.indexOf('private fun EcoTopCategoryStat('));
  const categoryCard=native.slice(native.indexOf('private fun EcoTopCategoryStat('),native.indexOf('private fun EcoPanelHeader('));
  assert.match(native,/Brush\.verticalGradient\(if\(dark\) listOf\(colors\.background,colors\.background\)/);
  assert.match(native,/Color\(0xFFF8FBFF\),Color\(0xFFF1F5F9\)/);
  assert.match(overview,/padding\(top=10\.dp\)\.height\(IntrinsicSize\.Max\)/);
  assert.match(overview,/EcoPanel\(colors,Modifier\.padding\(top=8\.dp\)\)/);
  assert.equal((overview.match(/EcoPanel\(colors,Modifier\.padding\(top=8\.dp\)\)/g)||[]).length,3);
  assert.match(overview,/Box\(Modifier\.padding\(top=8\.dp\)\) \{\s*EcoReportPanel/);
  assert.match(overview,/Денежные счета без кредитного лимита/);
  assert.equal((overview.match(/Без переводов между счетами/g)||[]).length,2);
  for(const tile of [firstCard,categoryCard]){
    assert.match(tile,/heightIn\(min=136\.dp\)/);
    assert.match(tile,/Color\(0xFFFFFAF2\)/);
    assert.match(tile,/Color\(0xFFE6DDD1\)/);
    assert.match(tile,/\.padding\(14\.dp\)/);
    assert.match(tile,/Spacer\(Modifier\.weight\(1f\)\)/);
    assert.match(tile,/fontSize=11\.sp/);
  }
  assert.match(native,/val tile=if\(light&&primary\)Color\(0xFFFFF9F2\)/);
  assert.match(native,/val edge=if\(light&&primary\)Color\(0xFFEFD3B1\)/);
  assert.match(native,/internal fun EcoPanel\(colors: EcoColors, modifier: Modifier = Modifier,/);
  assert.match(androidVersion,/versionCode = 25/);
  assert.match(androidVersion,/versionName = "1\.0\.23"/);
});

test('Native Economic CRUD retains server-side origin protection and marks each native write same-origin',()=>{
  const route=read('../../server/src/routes/economic.ts');
  assert.match(route,/telegramChatRequestIsSameOrigin\(req\.get\('origin'\), req\.get\('host'\), req\.get\('sec-fetch-site'\)\)/);
  for (const method of ['POST','PATCH','DELETE']) {
    const expression=new RegExp('@Headers\\("Sec-Fetch-Site: same-origin"\\)\\s+@'+method+'\\("api/economic/');
    assert.match(api,expression);
  }
  assert.match(native,/api\.economicCreate\(resource,payload\)/);
  assert.match(native,/api\.economicUpdate\(resource,record\.ecoText\("id"\),payload\)/);
  assert.match(native,/api\.economicDelete\(selection\.resource,selection\.record\.ecoText\("id"\)\)/);
});

test('Native Economic bottom sheets swipe away without a second dismissal button',()=>{
  assert.match(editor,/sheetGesturesEnabled=true/);
  assert.match(editor,/skipPartiallyExpanded=true/);
  assert.match(editor,/stableSheetHeight/);
  assert.match(editor,/target!=SheetValue.Hidden \|\| !savingNow/);
  assert.doesNotMatch(editor,/IconButton\(enabled=!saving,onClick=onDismiss\)/);
  assert.match(native,/sheetGesturesEnabled=true/);
});

