package ru.planirovych.app.feature.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.input.pointer.pointerInput
import kotlin.math.abs
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import retrofit2.HttpException
import ru.planirovych.app.core.network.NetworkModule

internal data class EcoEditorRequest(val resource: String, val record: JsonObject? = null)
private data class EcoRemoval(val resource: String, val record: JsonObject)

private fun readableEconomicError(cause: Throwable): String {
    if (cause is HttpException) {
        val server = runCatching {
            Json.parseToJsonElement(cause.response()?.errorBody()?.string().orEmpty()) as? JsonObject
        }.getOrNull()
        return server.ecoText("error").ifBlank { "Ошибка сервера (" + cause.code() + ")" }
    }
    return cause.localizedMessage ?: "Не удалось загрузить финансовые данные"
}

private data class EcoTab(val id: String, val title: String)
private val economicTabs = listOf(
    EcoTab("overview","Обзор"), EcoTab("report","Отчёт"), EcoTab("accounts","Счета"),
    EcoTab("operations","Операции"), EcoTab("debts","Долги и кредиты"), EcoTab("categories","Категории")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EconomicComposePage(userId: String?, dark: Boolean, active: Boolean,
    onQuickVoice:()->Unit={},voiceAwaiting:Boolean=false) {
    val colors = remember(dark) { ecoColors(dark) }
    val context = LocalContext.current
    val api = remember(context) { NetworkModule.api(context) }
    val scope = rememberCoroutineScope()
    var snapshot by remember(userId) { mutableStateOf<JsonObject?>(null) }
    var economicUser by remember(userId) { mutableStateOf<JsonObject?>(null) }
    var loading by remember(userId) { mutableStateOf(true) }
    var error by remember(userId) { mutableStateOf("") }
    var revision by remember(userId) { mutableIntStateOf(0) }
    var section by remember(userId) { mutableStateOf("overview") }
    var editor by remember(userId) { mutableStateOf<EcoEditorRequest?>(null) }
    var economicMenuOpen by remember { mutableStateOf(false) }
    val economicScrimAlpha by animateFloatAsState(
        targetValue=if(economicMenuOpen)if(dark).29f else .21f else 0f,
        animationSpec=tween(155),label="economych-action-scrim"
    )
    var filtersOpen by remember(userId) { mutableStateOf(false) }
    var closedOpen by remember(userId) { mutableStateOf(false) }
    val economicPreferences = remember(context) { context.getSharedPreferences("economic_ui",android.content.Context.MODE_PRIVATE) }
    var bannerHidden by remember(userId) {
        mutableStateOf(economicPreferences.getBoolean("hidden_banner_"+userId.orEmpty(),false))
    }
    var removing by remember(userId) { mutableStateOf<EcoRemoval?>(null) }
    var busy by remember { mutableStateOf(false) }
    var kindFilter by remember { mutableStateOf("") }
    var accountFilter by remember { mutableStateOf("") }
    var categoryFilter by remember { mutableStateOf("") }
    var operations by remember(userId) { mutableStateOf<List<JsonObject>>(emptyList()) }
    var nextCursor by remember(userId) { mutableStateOf("") }
    var operationsBusy by remember { mutableStateOf(false) }

    LaunchedEffect(userId, active, revision) {
        if (!active) return@LaunchedEffect
        if (userId.isNullOrBlank()) {
            error = "Войдите в аккаунт Планировыча."
            loading = false
            snapshot = null
            return@LaunchedEffect
        }
        try {
            // Same first-party OkHttp cookie jar as all other native screens.
            val result = api.economicSnapshot()
            snapshot = result
            economicUser = runCatching { api.economicSession().ecoObject("user") }.getOrNull()
            error = ""
        } catch (cause: Exception) {
            error = readableEconomicError(cause)
        } finally { loading = false }
    }
    LaunchedEffect(userId, active, revision, section, kindFilter, accountFilter, categoryFilter) {
        if (!active || userId.isNullOrBlank() || section != "operations") return@LaunchedEffect
        operationsBusy = true
        try {
            val result = api.economicOperations(
                kindFilter.ifBlank { null }, accountFilter.ifBlank { null },
                categoryFilter.ifBlank { null })
            operations = result.ecoItems("operations")
            nextCursor = result.ecoText("nextCursor")
        } catch (cause: Exception) { error = readableEconomicError(cause) }
        finally { operationsBusy = false }
    }
    fun refresh() { revision++ }
    fun mutate(resource: String, record: JsonObject?, payload: JsonObject) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                // PATCH returns {ok:true}, not an updated entity. Check it,
                // then fetch the authoritative records before closing.
                val result=if(record==null)api.economicCreate(resource,payload)
                    else api.economicUpdate(resource,record.ecoText("id"),payload)
                if(record!=null && !result.ecoBool("ok"))
                    throw IllegalStateException("Сервер не подтвердил сохранение изменений")
                // The server has committed. Do not leave an editable form
                // open just because the follow-up GET failed: retrying POST
                // would otherwise duplicate a financial record.
                editor=null
                error=""
                // A changed account may remove an operation from the currently
                // filtered list. Show all operations after updating.
                if(resource=="operations"){
                    kindFilter=""
                    accountFilter=""
                    categoryFilter=""
                    runCatching{api.economicOperations(null,null,null)}.onSuccess{updated->
                        operations=updated.ecoItems("operations")
                        nextCursor=updated.ecoText("nextCursor")
                    }.onFailure{error="Изменения сохранены, но список операций ещё не обновился."}
                }
                runCatching{api.economicSnapshot()}.onSuccess{snapshot=it}
                    .onFailure{error="Изменения сохранены, но финансовый обзор пока не обновился."}
                refresh()
            } catch (cause: Exception) {
                error=readableEconomicError(cause)
            } finally { busy=false }
        }
    }
    fun remove(resource: String, record: JsonObject) {
        removing = EcoRemoval(resource, record)
    }
    val current = snapshot
    val activeDebts = current?.ecoItems("debts").orEmpty().filterNot { it.ecoBool("isClosed") }
    val activeLoans = current?.ecoItems("loans").orEmpty().filterNot { it.ecoBool("isClosed") }
    val closedDebts = current?.ecoItems("debts").orEmpty().filter { it.ecoBool("isClosed") }
    val closedLoans = current?.ecoItems("loans").orEmpty().filter { it.ecoBool("isClosed") }

    // The Mini App's pale blue gradient gives the light workspace subtle depth.
    // Dark mode keeps its existing neutral canvas.
    Box(Modifier.fillMaxSize().background(
        Brush.verticalGradient(if(dark) listOf(colors.background,colors.background)
            else listOf(Color(0xFFF8FBFF),Color(0xFFF1F5F9)))
    )) {
        if (current == null && loading) {
            EconomicSkeleton(dark)
        } else if (current == null) {
            Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement=Arrangement.Center,
                horizontalAlignment=Alignment.CenterHorizontally) {
                Icon(Icons.Default.AccountBalanceWallet, null, tint=colors.gold)
                Spacer(Modifier.height(12.dp))
                Text(error, color=colors.text, textAlign=TextAlign.Center)
                TextButton(onClick={ refresh() }) { Icon(Icons.Default.Refresh,null); Text("Повторить") }
            }
        } else {
            AnimatedContent(
                targetState=section,
                modifier=Modifier.fillMaxSize(),
                transitionSpec={
                    val from=economicTabs.indexOfFirst { it.id==initialState }
                    val to=economicTabs.indexOfFirst { it.id==targetState }
                    val direction=if(to>=from) 1 else -1
                    (slideInHorizontally(animationSpec=tween(260)) { width -> direction*width/2 } +
                        fadeIn(animationSpec=tween(220))) togetherWith
                        (slideOutHorizontally(animationSpec=tween(220)) { width -> -direction*width/2 } +
                            fadeOut(animationSpec=tween(180)))
                },
                label="Economic tab transition"
            ) { visibleSection ->
            LazyColumn(
                modifier = Modifier.fillMaxSize().pointerInput(visibleSection) {
                    // Horizontal drags switch tabs; vertical drags remain with LazyColumn.
                    var dragged=0f
                    detectHorizontalDragGestures(
                        onDragStart={dragged=0f},
                        onHorizontalDrag={change,amount->dragged+=amount;change.consume()},
                        onDragEnd={
                            if(abs(dragged)>85.dp.toPx() && visibleSection==section) {
                                val index=economicTabs.indexOfFirst{it.id==visibleSection}
                                val next=(index+if(dragged<0f)1 else -1)
                                    .coerceIn(0,economicTabs.lastIndex)
                                section=economicTabs[next].id
                                error=""
                            }
                        }
                    )
                },
                contentPadding = PaddingValues(start=13.dp,end=13.dp,top=10.dp,bottom=90.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text("ФИНАНСОВЫЙ ПОМОЩНИК",fontSize=9.sp,
                                fontWeight=FontWeight.ExtraBold,letterSpacing=.8.sp,color=colors.gold)
                            Spacer(Modifier.height(3.dp))
                            Text("Экономыч AI",fontSize=22.sp,fontWeight=FontWeight.Bold,color=colors.text)
                        }
                    }
                }
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                            .padding(vertical=2.dp),
                        horizontalArrangement=Arrangement.spacedBy(6.dp)
                    ) {
                        economicTabs.forEach { tab ->
                            val chosen = visibleSection == tab.id
                            val icon = when(tab.id) {
                                "overview" -> Icons.Default.GridView
                                "accounts" -> Icons.Default.AccountBalanceWallet
                                "operations" -> Icons.Default.SwapHoriz
                                "debts" -> Icons.Default.MenuBook
                                "report" -> Icons.Default.PieChart
                                else -> Icons.Default.Tune
                            }
                            Row(
                                Modifier.clip(RoundedCornerShape(12.dp))
                                    .background(if(chosen) colors.gold.copy(alpha=if(dark) .17f else .13f)
                                         else if(dark) colors.gold.copy(alpha=.04f) else colors.panel2)
                                    .border(1.dp,if(chosen)colors.gold.copy(alpha=.4f)
                                        else colors.gold.copy(alpha=.18f), RoundedCornerShape(12.dp))
                                    .clickable { section=tab.id; error="" }
                                    .padding(horizontal=10.dp,vertical=7.dp),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(icon,null,tint=if(chosen)colors.goldSoft else colors.muted,
                                    modifier=Modifier.size(16.dp))
                                Text(tab.title, fontSize=11.sp,fontWeight=if(chosen) FontWeight.SemiBold else FontWeight.Normal,
                                    color=if(chosen)colors.goldSoft else colors.muted, maxLines=1)
                            }
                        }
                    }
                }
                if (error.isNotBlank()) item {
                    EcoPanel(colors) {
                        Row(verticalAlignment=Alignment.CenterVertically) {
                            Text(error,Modifier.weight(1f),color=Color(0xFFE99D75),fontSize=12.sp)
                            IconButton(onClick={error=""}){ Icon(Icons.Default.Close,"Скрыть",tint=colors.muted) }
                        }
                    }
                }
                when(visibleSection) {
                    "overview" -> {
                        if(!bannerHidden) item {
                            Box {
                                EcoHero(colors)
                                TextButton(onClick={
                                    bannerHidden=true
                                    economicPreferences.edit().putBoolean(
                                        "hidden_banner_"+userId.orEmpty(),true).apply()
                                },modifier=Modifier.align(Alignment.BottomEnd).padding(end=10.dp,bottom=6.dp)) {
                                    Text("Скрыть",fontSize=11.sp,color=Color(0xFFFFE7CB))
                                }
                            }
                        }
                        item {
                            Row(Modifier.fillMaxWidth().padding(top=10.dp).height(IntrinsicSize.Max),
                                horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                                EcoStat("Общий баланс",current.ecoObject("totals").ecoText("balanceMinor"),
                                    "Денежные счета без кредитного лимита",colors,Modifier.weight(1f).fillMaxHeight(),false)
                                EcoStat("Доходы за месяц",current.ecoObject("totals").ecoText("monthIncomeMinor"),
                                    "Без переводов между счетами",colors,Modifier.weight(1f).fillMaxHeight(),true)
                            }
                        }
                        item {
                            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max),horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                                EcoStat("Расходы за месяц",current.ecoObject("totals").ecoText("monthExpenseMinor"),
                                    "Без переводов между счетами",colors,Modifier.weight(1f).fillMaxHeight(),false)
                                EcoTopCategoryStat(current.ecoObject("totals").ecoText("topExpenseCategory"),
                                    current.ecoObject("totals").ecoText("topExpenseCategoryMinor"),
                                    colors,Modifier.weight(1f).fillMaxHeight())
                            }
                        }
                        item {
                            EcoPanel(colors,Modifier.padding(top=8.dp)) {
                                EcoPanelHeader("Мои счета","Остатки с учётом всех операций",
                                    "Все счета",colors,{section="accounts"})
                                current.ecoItems("accounts").take(4).forEach { account ->
                                    Spacer(Modifier.height(9.dp))
                                    EcoMiniAccountTile(account,colors)
                                }
                                Spacer(Modifier.height(10.dp))
                                EcoInlineAction("Добавить счёт",colors){editor=EcoEditorRequest("accounts")}
                            }
                        }
                        item {
                            Box(Modifier.padding(top=8.dp)) {
                                EcoReportPanel(api,colors,revision,preview=true)
                            }
                        }
                        item {
                            EcoPanel(colors,Modifier.padding(top=8.dp)) {
                                EcoPanelHeader("Долги и кредиты","Платежи и прогресс погашения",
                                    "Все записи",colors,{section="debts"})
                                val debts=current.ecoItems("debts").filterNot { it.ecoBool("isClosed") }
                                val loans=current.ecoItems("loans").filterNot { it.ecoBool("isClosed") }
                                if (debts.isEmpty()&&loans.isEmpty()) {
                                    EcoEmpty("Активных долгов и кредитов пока нет",colors)
                                }
                                debts.forEach { record ->
                                    EcoObligationPreview("debts",record,colors) { editor=EcoEditorRequest("debts",record) }
                                    Spacer(Modifier.height(8.dp))
                                }
                                loans.forEach { record ->
                                    EcoObligationPreview("loans",record,colors) { editor=EcoEditorRequest("loans",record) }
                                    Spacer(Modifier.height(8.dp))
                                }
                                Row(horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                                    EcoQuickAction("Долг",colors){editor=EcoEditorRequest("debts")}
                                    EcoQuickAction("Кредит",colors){editor=EcoEditorRequest("loans")}
                                }
                            }
                        }
                        item {
                            EcoPanel(colors,Modifier.padding(top=8.dp)) {
                                EcoPanelHeader("Последние операции",
                                    current.ecoObject("totals").ecoNumber("operationCount").toString()+" записей всего",
                                    "Все операции",colors,{section="operations"})
                                val recent=current.ecoItems("recent")
                                if(recent.isEmpty()) EcoEmpty("Пока нет операций. Начните с первой записи.",colors)
                                recent.forEach { op ->
                                    EcoOperationRow(op,current,colors,
                                        onEdit={ record,resource -> if(resource=="missing-debt")section="debts" else editor=EcoEditorRequest(resource,record) },
                                        onDelete={ remove("operations",op) })
                                }
                            }
                        }
                    }
                    "report" -> {
                        item { EcoReportPanel(api,colors,revision) }
                    }
                    "accounts" -> {
                        item {
                            Column(verticalArrangement=Arrangement.spacedBy(10.dp)) {
                                Text("Управляйте счетами и остатками.",fontSize=12.sp,color=colors.muted)
                                EcoQuickAction("Счёт",colors){editor=EcoEditorRequest("accounts")}
                            }
                        }
                        items(current.ecoItems("accounts"),key={ "account-"+it.ecoText("id") }) { account ->
                            EcoPanel(colors) {
                                EcoAccountSummary(account,colors)
                                Spacer(Modifier.height(4.dp))
                                Row(verticalAlignment=Alignment.CenterVertically) {
                                    EcoQuickAction("Изменить",colors,false){editor=EcoEditorRequest("accounts",account)}
                                    if(!account.ecoBool("isPrimary")) {
                                        Spacer(Modifier.width(8.dp))
                                        if(account.ecoText("accountType")!="CREDIT_CARD")
                                            EcoInlineAction("Основным",colors){
                                                mutate("accounts",account,buildJsonObject{put("isPrimary",true)})
                                            }
                                        IconButton(onClick={ remove("accounts",account) },modifier=Modifier.size(36.dp)) {
                                            Icon(Icons.Default.Delete,"Удалить",tint=colors.muted,
                                                modifier=Modifier.size(18.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "operations" -> {
                        item {
                            EcoSectionActions("История доходов, расходов, переводов и долговых движений.",
                                colors,emptyList())
                            EcoPanel(colors) {
                                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                                    horizontalArrangement=Arrangement.SpaceBetween) {
                                    Text("Последние операции",fontSize=15.sp,fontWeight=FontWeight.SemiBold,color=colors.text)
                                    IconButton(onClick={filtersOpen=true}) {
                                        Icon(Icons.Default.FilterList,"Фильтры операций",
                                            tint=if(kindFilter.isNotBlank()||accountFilter.isNotBlank()||
                                                categoryFilter.isNotBlank()) colors.gold else colors.goldSoft)
                                    }
                                }
                                if (operationsBusy) LinearProgressIndicator(Modifier.fillMaxWidth(),color=colors.gold)
                                if(operations.isEmpty()&&!operationsBusy)
                                    EcoEmpty("Нет операций по выбранным фильтрам",colors)
                                operations.forEach { op ->
                                    EcoOperationRow(op,current,colors,
                                        onEdit={ record,resource -> if(resource=="missing-debt")section="debts" else editor=EcoEditorRequest(resource,record) },
                                        onDelete={remove("operations",op)})
                                }
                                if(nextCursor.isNotBlank()) {
                                    Spacer(Modifier.height(10.dp))
                                    EcoInlineAction("Показать ещё 50 операций",colors) {
                                        if(!operationsBusy) {
                                            operationsBusy=true
                                            scope.launch {
                                                try {
                                                    val result=api.economicOperations(
                                                        kindFilter.ifBlank{null},accountFilter.ifBlank{null},
                                                        categoryFilter.ifBlank{null},nextCursor)
                                                    operations=operations+result.ecoItems("operations")
                                                    nextCursor=result.ecoText("nextCursor")
                                                } catch(cause:Exception){error=readableEconomicError(cause)}
                                                finally { operationsBusy=false }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "debts" -> {
                        item {
                            Text("Кому вы должны, кто должен вам и платежи по кредитам.",
                                fontSize=12.sp,color=colors.muted)
                            Row(Modifier.fillMaxWidth().padding(top=10.dp),
                                horizontalArrangement=Arrangement.spacedBy(9.dp)){
                                EcoQuickAction("Долг",colors){editor=EcoEditorRequest("debts")}
                                EcoQuickAction("Кредит",colors){editor=EcoEditorRequest("loans")}
                            }
                            Text("Долги · "+activeDebts.size,modifier=Modifier.padding(top=16.dp),
                                color=colors.goldSoft,fontWeight=FontWeight.Bold,fontSize=16.sp)
                        }
                        if(activeDebts.isEmpty()) item {EcoEmpty("Активных долгов пока нет",colors)}
                        items(activeDebts,key={"debt-"+it.ecoText("id")}){debt->
                            EcoObligationCard("debts",debt,colors,
                                onEdit={editor=EcoEditorRequest("debts",debt)},
                                onDelete={remove("debts",debt)})
                        }
                        item {
                            Text("Кредиты · "+activeLoans.size,
                                color=colors.goldSoft,fontWeight=FontWeight.Bold,fontSize=16.sp)
                        }
                        if(activeLoans.isEmpty()) item {EcoEmpty("Активных кредитов пока нет",colors)}
                        items(activeLoans,key={"loan-"+it.ecoText("id")}){loan->
                            EcoObligationCard("loans",loan,colors,
                                onEdit={editor=EcoEditorRequest("loans",loan)},
                                onDelete={remove("loans",loan)})
                        }
                        if(closedDebts.isNotEmpty()||closedLoans.isNotEmpty()) {
                            item(key="closed-obligations") {
                                EcoPanel(colors) {
                                    Row(Modifier.fillMaxWidth().clickable { closedOpen=!closedOpen }
                                        .padding(vertical=3.dp),
                                        verticalAlignment=Alignment.CenterVertically) {
                                        Icon(Icons.Default.Inventory2,null,tint=colors.gold,
                                            modifier=Modifier.size(19.dp))
                                        Spacer(Modifier.width(10.dp))
                                        Text("Закрытые",Modifier.weight(1f),
                                            fontSize=15.sp,fontWeight=FontWeight.SemiBold,color=colors.text)
                                        Text((closedDebts.size+closedLoans.size).toString(),
                                            fontSize=12.sp,color=colors.muted)
                                        Spacer(Modifier.width(7.dp))
                                        Icon(if(closedOpen)Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                            "Свернуть или раскрыть закрытые записи",tint=colors.muted)
                                    }
                                }
                            }
                            if(closedOpen) {
                                if(closedDebts.isNotEmpty()) {
                                    item {Text("Закрытые долги",fontSize=14.sp,color=colors.muted,
                                        fontWeight=FontWeight.SemiBold)}
                                    items(closedDebts,key={"closed-debt-"+it.ecoText("id")}){debt->
                                        EcoObligationCard("debts",debt,colors,
                                            onEdit={editor=EcoEditorRequest("debts",debt)},
                                            onDelete={remove("debts",debt)})
                                    }
                                }
                                if(closedLoans.isNotEmpty()) {
                                    item {Text("Закрытые кредиты",fontSize=14.sp,color=colors.muted,
                                        fontWeight=FontWeight.SemiBold)}
                                    items(closedLoans,key={"closed-loan-"+it.ecoText("id")}){loan->
                                        EcoObligationCard("loans",loan,colors,
                                            onEdit={editor=EcoEditorRequest("loans",loan)},
                                            onDelete={remove("loans",loan)})
                                    }
                                }
                            }
                        }
                    }
                    "categories" -> {
                        item {EcoSectionActions("Создавайте свои категории доходов и расходов.",colors,
                            listOf("Категория" to {editor=EcoEditorRequest("categories")}))}
                        listOf("EXPENSE","INCOME").forEach { kind ->
                            item {
                                EcoPanel(colors) {
                                    Text(if(kind=="EXPENSE")"Категории расходов" else "Категории доходов",
                                        fontSize=15.sp,color=colors.text,fontWeight=FontWeight.SemiBold)
                                    ecoCategories(current,kind).forEach { name ->
                                        val custom=current.ecoItems("categories").firstOrNull {
                                            it.ecoText("kind")==kind && it.ecoText("name")==name
                                        }
                                        Row(Modifier.fillMaxWidth().padding(vertical=5.dp),
                                            verticalAlignment=Alignment.CenterVertically) {
                                            Text(name,Modifier.weight(1f),fontSize=13.sp,color=colors.text)
                                            if(custom==null)Text("Базовая",fontSize=10.sp,color=colors.muted)
                                            else IconButton(onClick={remove("categories",custom)}) {
                                                Icon(Icons.Default.Delete,"Удалить категорию",
                                                    Modifier.size(17.dp),tint=colors.muted)
                                            }
                                        }
                                        HorizontalDivider(color=colors.outline,thickness=.5.dp)
                                    }
                                    EcoInlineAction("+ Своя категория",colors) {
                                        editor=EcoEditorRequest("categories",buildJsonObject{put("kind",kind)})
                                    }
                                }
                            }
                        }
                    }
                }
                item {
                    Text("Экономыч AI · Персональные данные видны только владельцу аккаунта. RUB · Учёт вручную.",
                        Modifier.fillMaxWidth().padding(top=8.dp),textAlign=TextAlign.Center,
                        fontSize=10.sp,color=colors.muted)
                }
            }
            }
            if(economicScrimAlpha>0.001f && editor==null){
                Box(Modifier.matchParentSize().background(
                    Color.Black.copy(alpha=economicScrimAlpha)))
            }
            if(editor==null) {
                Box(Modifier.align(Alignment.BottomEnd).padding(end=18.dp,bottom=18.dp)) {
                    NativeHoldActionButton(
                        accent=Color(0xFFF5A52E),foreground=if(dark)Color(0xFF2B1B08) else Color.White,
                        waiting=voiceAwaiting,onVoice=onQuickVoice,
                        onMenuVisibilityChange={economicMenuOpen=it},
                        actions=listOf(
                            NativeHoldAction("Добавить операцию",Icons.Default.SwapHoriz){editor=EcoEditorRequest("operations")},
                            NativeHoldAction("Добавить счёт",Icons.Default.AccountBalanceWallet){editor=EcoEditorRequest("accounts")},
                            NativeHoldAction("Добавить кредит",Icons.Default.CreditCard){editor=EcoEditorRequest("loans")},
                            NativeHoldAction("Добавить долг",Icons.Default.MenuBook){editor=EcoEditorRequest("debts")}
                        )
                    )
                }
            }
        }
        if(filtersOpen && current!=null) {
            // Separate anchored sheet: filter controls do not alter the operations list height.
            ModalBottomSheet(
                onDismissRequest={filtersOpen=false},
                sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
                sheetGesturesEnabled=false,
                containerColor=colors.panel,contentColor=colors.text,
                dragHandle={BottomSheetDefaults.DragHandle(color=colors.muted)}
            ) {
                Column(Modifier.fillMaxWidth().height(370.dp).navigationBarsPadding()
                    .padding(horizontal=18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween) {
                        Text("Фильтры операций",color=colors.text,fontWeight=FontWeight.Bold,fontSize=20.sp)
                        IconButton(onClick={filtersOpen=false}){
                            Icon(Icons.Default.Close,"Закрыть фильтры",tint=colors.muted)
                        }
                    }
                    EcoSelect("Тип операции",kindFilter,
                        listOf("" to "Все типы","EXPENSE" to "Расходы","INCOME" to "Доходы",
                            "TRANSFER" to "Переводы","DEBTS" to "Долговые операции"),colors){kindFilter=it}
                    EcoSelect("Счёт",accountFilter,
                        listOf("" to "Все счета")+
                            current.ecoItems("accounts").map { it.ecoText("id") to it.ecoText("name") },
                        colors){accountFilter=it}
                    EcoSelect("Категория",categoryFilter,listOf("" to "Все категории")+
                        (ecoCategories(current,"EXPENSE")+ecoCategories(current,"INCOME"))
                            .distinct().map { it to it },colors){categoryFilter=it}
                    Button(onClick={filtersOpen=false},modifier=Modifier.fillMaxWidth(),
                        colors=ButtonDefaults.buttonColors(
                            containerColor=if(dark) colors.gold else colors.goldSoft)){
                        Text("Готово",color=if(dark) Color(0xFF281703) else Color.White)
                    }
                }
            }
        }
        if(editor!=null && current!=null) {
            val request=editor!!
            EcoEditorSheet(
                request=request,snapshot=current,user=economicUser,colors=colors,
                saving=busy,externalError=error,
                onDismiss={if(!busy){editor=null;error=""}},
                onSubmit={body->mutate(request.resource,request.record?.takeIf { it.ecoText("id").isNotBlank() },body)},
                onCreateCategory={kind,name,done->
                    scope.launch {
                        try {
                            val result=api.economicCreate("categories",
                                buildJsonObject{put("kind",kind);put("name",name)})
                            done(result.ecoObject("category").ecoText("name"),null)
                            refresh()
                        }catch(cause:Exception){done(null,readableEconomicError(cause))}
                    }
                }
            )
        }
        removing?.let { selection ->
            AlertDialog(
                onDismissRequest={removing=null},
                title={Text("Удалить запись?",color=colors.text)},
                text={Text("Это действие нельзя отменить.",color=colors.muted)},
                confirmButton={
                    TextButton(enabled=!busy,onClick={
                        if(busy)return@TextButton
                        busy=true
                        scope.launch {
                            try {
                                api.economicDelete(selection.resource,selection.record.ecoText("id"))
                                removing=null;error="";refresh()
                            }catch(cause:Exception){error=readableEconomicError(cause);removing=null}
                            finally{busy=false}
                        }
                    }) { Text("Удалить",color=Color(0xFFE58467)) }
                },
                dismissButton={TextButton(onClick={removing=null}){Text("Отмена",color=colors.goldSoft)}},
                containerColor=colors.panel
            )
        }
    }
}

@Composable
internal fun EcoPanel(colors: EcoColors, modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(colors.panel)
        .border(1.dp,colors.outline,RoundedCornerShape(17.dp)).padding(14.dp),
        content=content)
}
@Composable
private fun EcoHero(colors: EcoColors) {
    val light=colors.background==Color(0xFFF7F8FA)
    Box(Modifier.fillMaxWidth().heightIn(min=160.dp)
        .clip(RoundedCornerShape(20.dp))
        .background(Brush.horizontalGradient(listOf(colors.bannerStart,colors.bannerEnd)))
        .border(1.dp,if(light)colors.gold.copy(alpha=.22f) else Color(0x665F4429),RoundedCornerShape(20.dp))) {
        Box(Modifier.align(Alignment.CenterEnd).offset(x=50.dp,y=6.dp).size(168.dp)
            .alpha(if(light).18f else .32f).clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFFFFDF9F),Color(0xFFE5A039),Color(0xFF995A17))))
            .border(7.dp,Color(0xFFFFCE8C).copy(alpha=.6f),CircleShape),
            contentAlignment=Alignment.Center) {
            Text("₽",fontWeight=FontWeight.Black,fontSize=112.sp,color=Color(0xFF784405))
        }
        Column(Modifier.fillMaxWidth(.82f).padding(17.dp)) {
            Text("✦  Личные финансы без хаоса",color=if(light)colors.goldSoft else Color(0xFFFFDCA8),
                fontSize=10.sp,fontWeight=FontWeight.Medium)
            Spacer(Modifier.height(9.dp))
            Text("Держите деньги",color=if(light)colors.text else Color(0xFFFFF5E7),
                fontWeight=FontWeight.Bold,fontSize=23.sp,lineHeight=25.sp)
            Text("под контролем.",color=if(light)colors.goldSoft else Color(0xFFFFBF73),
                fontWeight=FontWeight.Bold,fontSize=23.sp,lineHeight=25.sp)
            Spacer(Modifier.height(8.dp))
            Text("Баланс, повседневные траты, долги и кредиты в одном спокойном пространстве.",
                color=if(light)colors.muted else Color(0xFFD6C4AE),fontSize=11.sp,lineHeight=16.sp)
        }
    }
}
@Composable
private fun EcoStat(title:String,minor:String,subtitle:String,colors:EcoColors,
    modifier:Modifier,positive:Boolean) {
    val light=colors.background==Color(0xFFF7F8FA)
    val tile=if(light) Color(0xFFFFFAF2) else colors.panel
    val edge=if(light) Color(0xFFE6DDD1) else colors.outline
    Column(modifier.heightIn(min=136.dp).clip(RoundedCornerShape(15.dp)).background(tile)
        .border(1.dp,edge,RoundedCornerShape(15.dp)).padding(14.dp),
        verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(when {title.startsWith("Доходы")->Icons.Default.SouthWest
                title.startsWith("Расходы")->Icons.Default.NorthEast
                else->Icons.Default.AccountBalanceWallet},null,
                tint=if(light)Color(0xFFB96C14) else colors.gold,
                modifier=Modifier.size(19.dp))
            Spacer(Modifier.width(8.dp))
            Text(title,color=colors.muted,fontSize=11.sp,lineHeight=16.sp,maxLines=2,
                overflow=TextOverflow.Ellipsis)
        }
        Text(ecoWholeRubles(minor),fontWeight=FontWeight.Bold,fontSize=18.sp,
            maxLines=1,overflow=TextOverflow.Ellipsis,
            color=if(positive)colors.green else colors.text)
        Spacer(Modifier.weight(1f))
        Text(subtitle,fontSize=11.sp,lineHeight=16.sp,color=colors.muted,maxLines=2,
            overflow=TextOverflow.Ellipsis)
    }
}
@Composable
private fun EcoTopCategoryStat(category:String,minor:String,colors:EcoColors,modifier:Modifier) {
    val light=colors.background==Color(0xFFF7F8FA)
    val tile=if(light) Color(0xFFFFFAF2) else colors.panel
    val edge=if(light) Color(0xFFE6DDD1) else colors.outline
    Column(modifier.heightIn(min=136.dp).clip(RoundedCornerShape(15.dp))
        .background(tile).border(1.dp,edge,RoundedCornerShape(15.dp))
        .padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(Icons.Default.PieChart,null,tint=if(light)Color(0xFFB96C14) else colors.gold,
                modifier=Modifier.size(19.dp))
            Spacer(Modifier.width(8.dp))
            Text("Траты в категориях",color=colors.muted,fontSize=11.sp,
                lineHeight=16.sp,maxLines=2)
        }
        Text(ecoWholeRubles(minor),color=colors.text,fontSize=18.sp,
            fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
        Spacer(Modifier.weight(1f))
        Text(category.ifBlank { "Нет расходов" },fontSize=11.sp,
            lineHeight=16.sp,color=colors.muted,maxLines=2,overflow=TextOverflow.Ellipsis)
    }
}
@Composable
private fun EcoPanelHeader(title:String,subtitle:String,action:String,colors:EcoColors,onAction:()->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(title,color=colors.text,fontSize=15.sp,fontWeight=FontWeight.SemiBold)
            Text(subtitle,fontSize=10.sp,color=colors.muted)
        }
        TextButton(onClick=onAction,contentPadding=PaddingValues(0.dp)) {
            Text(action,fontSize=11.sp,color=colors.goldSoft)
            Icon(Icons.Default.ChevronRight,null,tint=colors.goldSoft,modifier=Modifier.size(16.dp))
        }
    }
}
@Composable
private fun EcoAccountSummary(account:JsonObject,colors:EcoColors) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
        Icon(if(account.ecoText("accountType")=="CREDIT_CARD")
            Icons.Default.CreditCard else Icons.Default.AccountBalanceWallet,
            null,tint=colors.gold,modifier=Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Text(account.ecoText("name"),Modifier.weight(1f),color=colors.text,
            fontWeight=FontWeight.Normal,fontSize=13.sp,maxLines=1,
            overflow=TextOverflow.Ellipsis)
        Text(when {
            account.ecoText("accountType")=="CREDIT_CARD" -> "Кредитная карта"
            account.ecoBool("isPrimary") -> "Основной"
            else -> ""
        },color=colors.goldSoft,fontSize=10.sp)
    }
    Spacer(Modifier.height(6.dp))
    Text(ecoRubles(account.ecoText("balanceMinor")),color=colors.text,
        fontWeight=FontWeight.Bold,fontSize=18.sp)
    Text(if(account.ecoText("accountType")=="CREDIT_CARD")
        "Лимит: "+ecoRubles(account.ecoText("creditLimitMinor"))
        else "Текущий баланс",fontSize=10.sp,color=colors.muted)
}
/** Mini App style: subtle account tiles nested in the Overview card, no double white border. */
@Composable
private fun EcoMiniAccountTile(account:JsonObject,colors:EcoColors) {
    val light=colors.background==Color(0xFFF7F8FA)
    val primary=account.ecoBool("isPrimary")
    val tile=if(light&&primary)Color(0xFFFFF9F2) else colors.panel2
    val edge=if(light&&primary)Color(0xFFEFD3B1) else colors.outline.copy(alpha=.65f)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
        .background(tile).border(1.dp,edge,RoundedCornerShape(13.dp))
        .padding(12.dp)) {
        EcoAccountSummary(account,colors)
    }
}
@Composable
private fun EcoQuickAction(label:String,colors:EcoColors,add:Boolean=true,onClick:()->Unit) {
    OutlinedButton(onClick=onClick,border=BorderStroke(1.dp,colors.gold.copy(alpha=.25f)),
        contentPadding=PaddingValues(horizontal=12.dp,vertical=7.dp)) {
        if(add) {
            Icon(Icons.Default.Add,null,tint=colors.goldSoft,modifier=Modifier.size(17.dp))
            Spacer(Modifier.width(5.dp))
        }
        Text(label,color=colors.goldSoft,fontSize=11.sp,fontWeight=FontWeight.Medium)
    }
}
@Composable
internal fun EcoInlineAction(text:String,colors:EcoColors,onClick:()->Unit) {
    TextButton(onClick=onClick,contentPadding=PaddingValues(horizontal=2.dp,vertical=5.dp)) {
        Text(text,color=colors.goldSoft,fontSize=11.sp,fontWeight=FontWeight.Medium)
    }
}
@Composable
private fun EcoEmpty(text:String,colors:EcoColors){
    Text(text,Modifier.fillMaxWidth().padding(vertical=23.dp),textAlign=TextAlign.Center,
        color=colors.muted,fontSize=12.sp)
}
@Composable
private fun EcoSectionActions(subtitle:String,colors:EcoColors,buttons:List<Pair<String,()->Unit>>) {
    Column {
        Text(subtitle,fontSize=12.sp,color=colors.muted)
        if(buttons.isNotEmpty()) Row(horizontalArrangement=Arrangement.spacedBy(13.dp)) {
            buttons.forEach { (label,click) ->
                EcoInlineAction("+ "+label,colors,click)
            }
        }
    }
}
@Composable
private fun EcoOperationRow(op:JsonObject,snapshot:JsonObject,colors:EcoColors,
    onEdit:(JsonObject,String)->Unit,onDelete:()->Unit) {
    val kind=op.ecoText("kind")
    val credit=kind in listOf("INCOME","DEBT_BORROWED","DEBT_RETURNED")
    val debit=kind in listOf("EXPENSE","DEBT_LENT","DEBT_REPAID")
    val source=snapshot.ecoItems("accounts").firstOrNull { it.ecoText("id")==op.ecoText("sourceAccountId") }
        .ecoText("name").ifBlank{"Счёт"}
    val target=snapshot.ecoItems("accounts").firstOrNull { it.ecoText("id")==op.ecoText("targetAccountId") }
        .ecoText("name").ifBlank{"Счёт"}
    val linked=snapshot.ecoItems("debts").firstOrNull{it.ecoText("id")==op.ecoText("debtId")}
    val light=colors.background==Color(0xFFF7F8FA)
    val amountColor=if(credit)colors.green else if(debit)
        (if(light)Color(0xFFAE542F) else Color(0xFFE9AD8E)) else colors.text
    Row(Modifier.fillMaxWidth().clickable {
        if(op.ecoText("debtId").isNotBlank()) {
            if(linked!=null) onEdit(linked,"debts") else onEdit(op,"missing-debt")
        } else if(!op.ecoBool("isAdjustment")) onEdit(op,"operations")
    }.padding(vertical=9.dp),verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp))
            .background(if(light) {
                if(credit)Color(0xFFE3F6E9) else if(debit)Color(0xFFFFF0DF)
                else Color(0xFFE9ECF8)
            } else {
                if(credit)Color(0xFF263B34) else if(debit)Color(0xFF383038) else Color(0xFF353747)
            }),
            contentAlignment=Alignment.Center) {
            Icon(if(credit)Icons.Default.SouthWest else if(debit)Icons.Default.NorthEast
                else Icons.Default.SwapHoriz,null,tint=if(light) {
                    if(credit)Color(0xFF23824C) else if(debit)Color(0xFFB16D22)
                    else Color(0xFF5755A0)
                } else if(credit)Color(0xFF9CE0B0)
                    else if(debit)Color(0xFFF4B58B) else Color(0xFFB3BDFA),
                modifier=Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(0.dp)) {
            Text(op.ecoText("title"),maxLines=1,overflow=TextOverflow.Ellipsis,
                color=colors.text,fontWeight=FontWeight.SemiBold,fontSize=12.sp,lineHeight=12.sp)
            Text(ecoDateLabel(op.ecoText("occurredAt"))+" · "+
                (if(kind=="TRANSFER")source+" → "+target else (if(op.ecoBool("isAdjustment"))"Корректировка" else ecoKindLabel(kind))+" · "+
                    (if(op.ecoText("debtId").isNotBlank())"Долги · " else
                        op.ecoText("category").takeIf{it.isNotBlank()}?.plus(" · ").orEmpty())+source),
                maxLines=1,overflow=TextOverflow.Ellipsis,fontSize=10.sp,lineHeight=10.sp,color=colors.muted)
        }
        Text((if(credit)"+" else if(debit)"−" else "")+ecoRubles(op.ecoText("amountMinor")),
            fontSize=12.sp,color=amountColor,fontWeight=FontWeight.SemiBold,maxLines=1)
        if(linked==null && op.ecoText("debtId").isBlank() && !op.ecoBool("isAdjustment")) {
            IconButton(onClick=onDelete,modifier=Modifier.size(27.dp)) {
                Icon(Icons.Default.Delete,"Удалить",Modifier.size(16.dp),tint=colors.muted)
            }
        }
    }
    HorizontalDivider(color=colors.outline,thickness=.5.dp)
}
@Composable
private fun EcoObligationPreview(resource:String,record:JsonObject,colors:EcoColors,onClick:()->Unit) {
    val debt=resource=="debts"
    val estimate=if(debt)null else ecoLoanEstimate(record)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
        .background(colors.panel2).border(1.dp,colors.outline,RoundedCornerShape(13.dp))
        .clickable(onClick=onClick).padding(12.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(if(debt)Icons.Default.MenuBook else Icons.Default.CreditCard,null,
                modifier=Modifier.size(16.dp),tint=colors.gold)
            Spacer(Modifier.width(6.dp))
            Text(if(debt){if(record.ecoText("direction")=="OWE")"Я должен" else "Мне должны"}
                else "Кредит",color=colors.goldSoft,fontSize=11.sp)
        }
        Text(record.ecoText(if(debt)"counterparty" else "name"),fontSize=13.sp,
            color=colors.text,fontWeight=FontWeight.SemiBold)
        Text(if(debt)ecoRubles(record.ecoText("amountMinor"))
            else ecoRubles((record.ecoText("monthlyPaymentOverrideMinor").ifBlank {
                estimate?.monthly.toString()
            }))+" / мес.",fontSize=12.sp,color=colors.text)
        EcoPaymentProgress(record.ecoText("paidMinor"),
            if(debt)record.ecoText("amountMinor") else estimate!!.total.toString(),colors)
    }
}
@Composable
private fun EcoPaymentProgress(paid:String,total:String,colors:EcoColors) {
    val progress=ecoProgress(paid,total)
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
        Text("Внесено "+ecoRubles(paid)+" из "+ecoRubles(total),
            fontSize=10.sp,color=colors.muted,maxLines=1)
        Text((progress*100).toInt().toString()+"%",fontSize=10.sp,color=colors.goldSoft)
    }
    // Simple filled track instead of Material3's built-in trailing stop-indicator dot.
    Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(colors.outline)) {
        Box(Modifier.fillMaxWidth(progress).fillMaxHeight().background(colors.gold))
    }
}
@Composable
private fun EcoObligationCard(resource:String,record:JsonObject,colors:EcoColors,
    onEdit:()->Unit,onDelete:()->Unit) {
    val debt=resource=="debts"
    val estimate=if(debt)null else ecoLoanEstimate(record)
    EcoPanel(colors) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(if(debt){if(record.ecoText("direction")=="OWE")"Я должен" else "Мне должны"}
                else "Кредит",fontSize=11.sp,fontWeight=FontWeight.SemiBold,color=colors.goldSoft)
            if(record.ecoBool("isClosed"))Text("Закрыт",color=colors.muted,fontSize=11.sp)
        }
        Spacer(Modifier.height(10.dp))
        Text(record.ecoText(if(debt)"counterparty" else "name"),fontWeight=FontWeight.SemiBold,
            fontSize=15.sp,color=colors.text)
        Spacer(Modifier.height(6.dp))
        Text(if(debt)ecoRubles(record.ecoText("amountMinor"))
            else ecoRubles(record.ecoText("monthlyPaymentOverrideMinor").ifBlank{estimate!!.monthly.toString()})+
                " / мес.",fontSize=19.sp,fontWeight=FontWeight.SemiBold,color=colors.text)
        Spacer(Modifier.height(7.dp))
        if(debt) {
            Text(if(record.ecoText("dueAt").isNotBlank())"Вернуть до "+ecoDateLabel(record.ecoText("dueAt"))
                else "Срок не указан",fontSize=11.sp,color=colors.muted)
            Text(if(record.ecoBool("postedToAccount"))"Учтён на счёте" else "Без движения по счёту",
                fontSize=11.sp,color=colors.muted)
        } else {
            // Match the Mini App's calm two-column loan figures, without hiding any data.
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp))
                .background(colors.panel2).padding(11.dp),
                verticalArrangement=Arrangement.spacedBy(9.dp)) {
                Row(horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                    EcoLoanMetric("Сумма кредита",ecoRubles(record.ecoText("principalMinor")),
                        colors,Modifier.weight(1f))
                    EcoLoanMetric("Ставка",
                        (record.ecoNumber("annualRateBps")/100.0).toString()+"% годовых",
                        colors,Modifier.weight(1f))
                }
                Row(horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                    EcoLoanMetric("Срок",record.ecoNumber("termMonths").toString()+" мес.",
                        colors,Modifier.weight(1f))
                    EcoLoanMetric("Переплата (оценка)",ecoRubles(estimate!!.overpay.toString()),
                        colors,Modifier.weight(1f))
                }
                EcoLoanMetric("Всего выплат (оценка)",ecoRubles(estimate!!.total.toString()),colors)
            }
            Text("Начало: "+ecoDateLabel(record.ecoText("startDate"))+
                " · "+if(record.ecoText("paymentDate").isNotBlank())
                    "Платёж: "+ecoDay(record.ecoText("paymentDate")).takeLast(2)+"-го числа"
                else "Дата платежа не задана",fontSize=10.sp,color=colors.muted)
            Text("Без комиссий, страховок и досрочного погашения.",
                fontSize=10.sp,color=colors.muted)
        }
        if(record.ecoText("note").isNotBlank())Text(record.ecoText("note"),fontSize=11.sp,color=colors.muted)
        Spacer(Modifier.height(10.dp))
        EcoPaymentProgress(record.ecoText("paidMinor"),
            if(debt)record.ecoText("amountMinor") else estimate!!.total.toString(),colors)
        Row(verticalAlignment=Alignment.CenterVertically) {
            EcoInlineAction("Изменить",colors,onEdit)
            IconButton(onClick=onDelete) {
                Icon(Icons.Default.Delete,"Удалить",tint=colors.muted,modifier=Modifier.size(19.dp))
            }
        }
    }
}

@Composable
private fun EcoLoanMetric(label:String,value:String,colors:EcoColors,modifier:Modifier=Modifier) {
    Column(modifier,verticalArrangement=Arrangement.spacedBy(2.dp)) {
        Text(label,fontSize=10.sp,color=colors.muted,lineHeight=13.sp)
        Text(value,fontSize=12.sp,color=colors.text,fontWeight=FontWeight.Medium,
            maxLines=2,overflow=TextOverflow.Ellipsis,lineHeight=15.sp)
    }
}
