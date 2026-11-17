package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
    EcoTab("overview","Обзор"), EcoTab("accounts","Счета"), EcoTab("operations","Операции"),
    EcoTab("debts","Долги и кредиты"), EcoTab("categories","Категории")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EconomicComposePage(userId: String?, dark: Boolean, active: Boolean) {
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
                if (record == null) api.economicCreate(resource, payload)
                else api.economicUpdate(resource, record.ecoText("id"), payload)
                editor = null
                error = ""
                refresh()
            } catch (cause: Exception) { error = readableEconomicError(cause) }
            finally { busy = false }
        }
    }
    fun remove(resource: String, record: JsonObject) {
        removing = EcoRemoval(resource, record)
    }
    val current = snapshot

    Box(Modifier.fillMaxSize().background(
        Brush.linearGradient(if (dark) listOf(Color(0xFF292219), colors.background, Color(0xFF101117))
            else listOf(Color(0xFFFFF1DB), colors.background, Color(0xFFF8F3EA)))
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
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start=13.dp,end=13.dp,top=12.dp,bottom=90.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                            .padding(vertical=2.dp),
                        horizontalArrangement=Arrangement.spacedBy(6.dp)
                    ) {
                        economicTabs.forEach { tab ->
                            val chosen = section == tab.id
                            val icon = when(tab.id) {
                                "overview" -> Icons.Default.GridView
                                "accounts" -> Icons.Default.AccountBalanceWallet
                                "operations" -> Icons.Default.SwapHoriz
                                "debts" -> Icons.Default.MenuBook
                                else -> Icons.Default.Tune
                            }
                            Row(
                                Modifier.clip(RoundedCornerShape(12.dp))
                                    .background(if(chosen) colors.gold.copy(alpha=.19f) else colors.gold.copy(alpha=.045f))
                                    .border(1.dp,if(chosen)colors.gold.copy(alpha=.4f)
                                        else colors.gold.copy(alpha=.18f), RoundedCornerShape(12.dp))
                                    .clickable { section=tab.id; error="" }
                                    .padding(horizontal=10.dp,vertical=10.dp),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(icon,null,tint=if(chosen)colors.goldSoft else colors.muted,
                                    modifier=Modifier.size(16.dp))
                                Text(tab.title, fontSize=11.sp,fontWeight=FontWeight.SemiBold,
                                    color=if(chosen)colors.goldSoft else colors.muted, maxLines=1)
                            }
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text("ПЛАНИРОВЫЧ / ЭКОНОМЫЧ AI",fontSize=9.sp,
                                fontWeight=FontWeight.ExtraBold,letterSpacing=.8.sp,color=colors.gold)
                            Spacer(Modifier.height(3.dp))
                            Text(economicTabs.first { it.id==section }.title.let {
                                if(section=="overview")"Экономыч AI" else it
                            },fontSize=25.sp,fontWeight=FontWeight.ExtraBold,color=colors.text)
                        }
                        Surface(onClick={editor=EcoEditorRequest("operations")},
                            color=colors.gold, shape=RoundedCornerShape(11.dp)) {
                            Row(Modifier.padding(horizontal=10.dp,vertical=9.dp),
                                verticalAlignment=Alignment.CenterVertically) {
                                Icon(Icons.Default.Add,null,Modifier.size(16.dp),tint=Color(0xFF291400))
                                Text("Новая операция",fontSize=10.sp,fontWeight=FontWeight.Bold,
                                    color=Color(0xFF291400))
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
                when(section) {
                    "overview" -> {
                        item { EcoHero(colors) }
                        item {
                            Row(horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                                EcoStat("Общий баланс",current.ecoObject("totals").ecoText("balanceMinor"),
                                    "Все ваши счета",colors,Modifier.weight(1f),false)
                                EcoStat("Доходы за месяц",current.ecoObject("totals").ecoText("monthIncomeMinor"),
                                    "Без переводов между счетами",colors,Modifier.weight(1f),true)
                            }
                        }
                        item {
                            Row {
                                EcoStat("Расходы за месяц",current.ecoObject("totals").ecoText("monthExpenseMinor"),
                                    "Без переводов между счетами",colors,Modifier.weight(1f),false)
                                Spacer(Modifier.weight(1f))
                            }
                        }
                        item {
                            EcoPanel(colors) {
                                EcoPanelHeader("Мои счета","Остатки с учётом всех операций",
                                    "Все счета",colors,{section="accounts"})
                                current.ecoItems("accounts").take(4).forEach { account ->
                                    Spacer(Modifier.height(9.dp))
                                    EcoAccountTile(account,colors,{editor=EcoEditorRequest("accounts",account)})
                                }
                                Spacer(Modifier.height(10.dp))
                                EcoInlineAction("Добавить счёт",colors){editor=EcoEditorRequest("accounts")}
                            }
                        }
                        item {
                            EcoPanel(colors) {
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
                                Row(horizontalArrangement=Arrangement.spacedBy(17.dp)) {
                                    EcoInlineAction("+ Долг",colors) { editor=EcoEditorRequest("debts") }
                                    EcoInlineAction("+ Кредит",colors) { editor=EcoEditorRequest("loans") }
                                }
                            }
                        }
                        item {
                            EcoPanel(colors) {
                                EcoPanelHeader("Последние операции",
                                    current.ecoObject("totals").ecoNumber("operationCount").toString()+" записей всего",
                                    "Все операции",colors,{section="operations"})
                                val recent=current.ecoItems("recent")
                                if(recent.isEmpty()) EcoEmpty("Пока нет операций. Начните с первой записи.",colors)
                                recent.forEach { op ->
                                    EcoOperationRow(op,current,colors,
                                        onEdit={ record,resource -> editor=EcoEditorRequest(resource,record) },
                                        onDelete={ remove("operations",op) })
                                }
                            }
                        }
                    }
                    "accounts" -> {
                        item { EcoSectionActions("Управляйте счетами и начальными остатками.",colors,
                            listOf("Счёт" to { editor=EcoEditorRequest("accounts") }) ) }
                        items(current.ecoItems("accounts"),key={ "account-"+it.ecoText("id") }) { account ->
                            EcoPanel(colors) {
                                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                                    horizontalArrangement=Arrangement.SpaceBetween) {
                                    Icon(Icons.Default.AccountBalanceWallet,null,tint=colors.gold,
                                        modifier=Modifier.size(32.dp))
                                    if(account.ecoBool("isPrimary"))
                                        Text("Основной",color=colors.goldSoft,fontSize=11.sp)
                                }
                                Spacer(Modifier.height(14.dp))
                                Text(account.ecoText("name"),color=colors.text,fontWeight=FontWeight.Bold,fontSize=18.sp)
                                Spacer(Modifier.height(6.dp))
                                Text(ecoRubles(account.ecoText("balanceMinor")),color=colors.text,
                                    fontWeight=FontWeight.ExtraBold,fontSize=23.sp)
                                Text("Текущий баланс счёта",fontSize=11.sp,color=colors.muted)
                                Row(verticalAlignment=Alignment.CenterVertically) {
                                    EcoInlineAction("Изменить",colors){editor=EcoEditorRequest("accounts",account)}
                                    if(!account.ecoBool("isPrimary")) {
                                        Spacer(Modifier.width(12.dp))
                                        EcoInlineAction("Основным",colors){
                                            mutate("accounts",account,buildJsonObject{put("isPrimary",true)})
                                        }
                                        IconButton(onClick={ remove("accounts",account) }) {
                                            Icon(Icons.Default.Delete,"Удалить",tint=colors.muted)
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
                                EcoSelect("Тип операции",kindFilter,
                                    listOf("" to "Все типы","EXPENSE" to "Расходы","INCOME" to "Доходы",
                                        "TRANSFER" to "Переводы","DEBTS" to "Долговые операции"),
                                    colors){kindFilter=it}
                                Spacer(Modifier.height(10.dp))
                                EcoSelect("Счёт",accountFilter,
                                    listOf("" to "Все счета")+
                                        current.ecoItems("accounts").map { it.ecoText("id") to it.ecoText("name") },
                                    colors){accountFilter=it}
                                Spacer(Modifier.height(10.dp))
                                EcoSelect("Категория",categoryFilter,listOf("" to "Все категории")+
                                    (ecoCategories(current,"EXPENSE")+ecoCategories(current,"INCOME"))
                                        .distinct().map { it to it },colors){categoryFilter=it}
                                if (operationsBusy) LinearProgressIndicator(Modifier.fillMaxWidth(),color=colors.gold)
                                if(operations.isEmpty()&&!operationsBusy)
                                    EcoEmpty("Нет операций по выбранным фильтрам",colors)
                                operations.forEach { op ->
                                    EcoOperationRow(op,current,colors,
                                        onEdit={ record,resource -> editor=EcoEditorRequest(resource,record) },
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
                            EcoSectionActions("Кому вы должны, кто должен вам и платежи по кредитам.",colors,
                                listOf("Долг" to {editor=EcoEditorRequest("debts")},
                                    "Кредит" to {editor=EcoEditorRequest("loans")}))
                            Text("Долги · "+current.ecoItems("debts").size,modifier=Modifier.padding(top=16.dp),
                                color=colors.goldSoft,fontWeight=FontWeight.Bold,fontSize=16.sp)
                        }
                        if(current.ecoItems("debts").isEmpty()) item {EcoEmpty("Долгов пока нет",colors)}
                        items(current.ecoItems("debts"),key={"debt-"+it.ecoText("id")}){debt->
                            EcoObligationCard("debts",debt,colors,
                                onEdit={editor=EcoEditorRequest("debts",debt)},
                                onDelete={remove("debts",debt)})
                        }
                        item {
                            Text("Кредиты · "+current.ecoItems("loans").size,
                                color=colors.goldSoft,fontWeight=FontWeight.Bold,fontSize=16.sp)
                        }
                        if(current.ecoItems("loans").isEmpty()) item {EcoEmpty("Кредитов пока нет",colors)}
                        items(current.ecoItems("loans"),key={"loan-"+it.ecoText("id")}){loan->
                            EcoObligationCard("loans",loan,colors,
                                onEdit={editor=EcoEditorRequest("loans",loan)},
                                onDelete={remove("loans",loan)})
                        }
                    }
                    "categories" -> {
                        item {EcoSectionActions("Создавайте свои категории доходов и расходов.",colors,
                            listOf("Категория" to {editor=EcoEditorRequest("categories")}))}
                        listOf("EXPENSE","INCOME").forEach { kind ->
                            item {
                                EcoPanel(colors) {
                                    Text(if(kind=="EXPENSE")"Категории расходов" else "Категории доходов",
                                        fontSize=16.sp,color=colors.text,fontWeight=FontWeight.Bold)
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
            if(editor==null) {
                FloatingActionButton(
                    onClick={editor=EcoEditorRequest("operations")},
                    modifier=Modifier.align(Alignment.BottomEnd).padding(end=18.dp,bottom=18.dp),
                    shape=CircleShape,containerColor=Color(0xFFF5A52E),
                    contentColor=Color(0xFF2B1B08)
                ) { Icon(Icons.Default.Add,"Новая операция",Modifier.size(28.dp)) }
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
internal fun EcoPanel(colors: EcoColors, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(colors.panel)
        .border(1.dp,colors.outline,RoundedCornerShape(17.dp)).padding(15.dp),
        content=content)
}
@Composable
private fun EcoHero(colors: EcoColors) {
    Box(Modifier.fillMaxWidth().heightIn(min=180.dp)
        .clip(RoundedCornerShape(20.dp))
        .background(Brush.horizontalGradient(listOf(colors.bannerStart,colors.bannerEnd)))
        .border(1.dp,Color(0x665F4429),RoundedCornerShape(20.dp))) {
        Box(Modifier.align(Alignment.CenterEnd).offset(x=54.dp,y=6.dp).size(178.dp)
            .alpha(.40f).clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFFFFDF9F),Color(0xFFE5A039),Color(0xFF995A17))))
            .border(7.dp,Color(0xFFFFCE8C).copy(alpha=.6f),CircleShape),
            contentAlignment=Alignment.Center) {
            Text("₽",fontWeight=FontWeight.Black,fontSize=112.sp,color=Color(0xFF784405))
        }
        Column(Modifier.fillMaxWidth(.82f).padding(19.dp)) {
            Text("✦  Личные финансы без хаоса",color=Color(0xFFFFDCA8),
                fontSize=12.sp,fontWeight=FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            Text("Держите деньги",color=Color(0xFFFFF5E7),fontWeight=FontWeight.ExtraBold,
                fontSize=25.sp,lineHeight=28.sp)
            Text("под контролем.",color=Color(0xFFFFBF73),fontWeight=FontWeight.ExtraBold,
                fontSize=25.sp,lineHeight=28.sp)
            Spacer(Modifier.height(11.dp))
            Text("Баланс, повседневные траты, долги и кредиты в одном спокойном пространстве.",
                color=Color(0xFFD6C4AE),fontSize=12.sp,lineHeight=18.sp)
        }
    }
}
@Composable
private fun EcoStat(title:String,minor:String,subtitle:String,colors:EcoColors,
    modifier:Modifier,positive:Boolean) {
    Column(modifier.clip(RoundedCornerShape(15.dp)).background(colors.panel)
        .border(1.dp,colors.outline,RoundedCornerShape(15.dp)).padding(14.dp),
        verticalArrangement=Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(when {title.startsWith("Доходы")->Icons.Default.SouthWest
                title.startsWith("Расходы")->Icons.Default.NorthEast
                else->Icons.Default.AccountBalanceWallet},null,tint=colors.gold,
                modifier=Modifier.size(19.dp))
            Spacer(Modifier.width(8.dp))
            Text(title,color=colors.muted,fontSize=12.sp,lineHeight=16.sp)
        }
        Text(ecoRubles(minor),fontWeight=FontWeight.ExtraBold,fontSize=19.sp,
            maxLines=1,overflow=TextOverflow.Ellipsis,
            color=if(positive)colors.green else colors.text)
        Text(subtitle,fontSize=10.sp,lineHeight=15.sp,color=colors.muted,minLines=2)
    }
}
@Composable
private fun EcoPanelHeader(title:String,subtitle:String,action:String,colors:EcoColors,onAction:()->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(title,color=colors.text,fontSize=17.sp,fontWeight=FontWeight.Bold)
            Text(subtitle,fontSize=11.sp,color=colors.muted)
        }
        TextButton(onClick=onAction,contentPadding=PaddingValues(0.dp)) {
            Text(action,fontSize=11.sp,color=colors.goldSoft)
            Icon(Icons.Default.ChevronRight,null,tint=colors.goldSoft,modifier=Modifier.size(16.dp))
        }
    }
}
@Composable
private fun EcoAccountTile(account:JsonObject,colors:EcoColors,onClick:()->Unit) {
    val primary=account.ecoBool("isPrimary")
    val dark=colors.background==Color(0xFF15151C)
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp))
        .background(if(primary && dark)
            Brush.linearGradient(listOf(Color(0xFF3F3128),Color(0xFF292831)))
            else if(primary)Brush.linearGradient(listOf(Color(0xFFFFECD2),Color(0xFFFFF5E9)))
            else Brush.linearGradient(listOf(colors.panel2,colors.panel2)))
        .border(1.dp,if(account.ecoBool("isPrimary"))colors.gold.copy(alpha=.35f)
            else colors.outline,RoundedCornerShape(13.dp))
        .clickable(onClick=onClick).padding(13.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Default.AccountBalanceWallet,null,tint=Color(0xFFFFC881),modifier=Modifier.size(21.dp))
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            Text(account.ecoText("name"),Modifier.weight(1f),color=if(primary && dark)
                Color(0xFFF4EFE8) else colors.text,fontSize=14.sp)
            if(account.ecoBool("isPrimary"))Text("Основной",color=Color(0xFFF4B760),fontSize=10.sp)
        }
        Text(ecoRubles(account.ecoText("balanceMinor")),fontSize=19.sp,
            fontWeight=FontWeight.ExtraBold,color=if(primary && dark)
                Color.White else colors.text)
    }
}
@Composable
internal fun EcoInlineAction(text:String,colors:EcoColors,onClick:()->Unit) {
    TextButton(onClick=onClick,contentPadding=PaddingValues(horizontal=2.dp,vertical=5.dp)) {
        Text(text,color=colors.goldSoft,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
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
    val amountColor=if(credit)colors.green else if(debit)Color(0xFFE9AD8E) else colors.text
    Row(Modifier.fillMaxWidth().clickable {
        onEdit(linked ?: op,if(linked!=null)"debts" else "operations")
    }.padding(vertical=13.dp),verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
            .background(if(credit)Color(0xFF263B34) else if(debit)Color(0xFF383038) else Color(0xFF353747)),
            contentAlignment=Alignment.Center) {
            Icon(if(credit)Icons.Default.SouthWest else if(debit)Icons.Default.NorthEast
                else Icons.Default.SwapHoriz,null,tint=if(credit)Color(0xFF9CE0B0)
                    else if(debit)Color(0xFFF4B58B) else Color(0xFFB3BDFA),
                modifier=Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(op.ecoText("title"),maxLines=1,overflow=TextOverflow.Ellipsis,
                color=colors.text,fontWeight=FontWeight.Bold,fontSize=12.sp)
            Text(ecoDateLabel(op.ecoText("occurredAt"))+" · "+
                (if(kind=="TRANSFER")source+" → "+target else ecoKindLabel(kind)+" · "+
                    (if(op.ecoText("debtId").isNotBlank())"Долги · " else
                        op.ecoText("category").takeIf{it.isNotBlank()}?.plus(" · ").orEmpty())+source),
                maxLines=2,overflow=TextOverflow.Ellipsis,fontSize=10.sp,color=colors.muted)
        }
        Text((if(credit)"+" else if(debit)"−" else "")+ecoRubles(op.ecoText("amountMinor")),
            fontSize=12.sp,color=amountColor,fontWeight=FontWeight.Bold,maxLines=1)
        if(linked==null && op.ecoText("debtId").isBlank()) {
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
        .clickable(onClick=onClick).padding(13.dp),verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Icon(if(debt)Icons.Default.MenuBook else Icons.Default.CreditCard,null,
                modifier=Modifier.size(16.dp),tint=colors.gold)
            Spacer(Modifier.width(6.dp))
            Text(if(debt){if(record.ecoText("direction")=="OWE")"Я должен" else "Мне должны"}
                else "Кредит",color=colors.goldSoft,fontSize=11.sp)
        }
        Text(record.ecoText(if(debt)"counterparty" else "name"),fontSize=13.sp,
            color=colors.text,fontWeight=FontWeight.Bold)
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
    LinearProgressIndicator(progress={progress},modifier=Modifier.fillMaxWidth().height(5.dp)
        .clip(CircleShape),color=colors.gold,trackColor=colors.outline)
}
@Composable
private fun EcoObligationCard(resource:String,record:JsonObject,colors:EcoColors,
    onEdit:()->Unit,onDelete:()->Unit) {
    val debt=resource=="debts"
    val estimate=if(debt)null else ecoLoanEstimate(record)
    EcoPanel(colors) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(if(debt){if(record.ecoText("direction")=="OWE")"Я должен" else "Мне должны"}
                else "Кредит",fontSize=12.sp,fontWeight=FontWeight.Bold,color=colors.goldSoft)
            if(record.ecoBool("isClosed"))Text("Закрыт",color=colors.muted,fontSize=11.sp)
        }
        Spacer(Modifier.height(10.dp))
        Text(record.ecoText(if(debt)"counterparty" else "name"),fontWeight=FontWeight.Bold,
            fontSize=17.sp,color=colors.text)
        Spacer(Modifier.height(8.dp))
        Text(if(debt)ecoRubles(record.ecoText("amountMinor"))
            else ecoRubles(record.ecoText("monthlyPaymentOverrideMinor").ifBlank{estimate!!.monthly.toString()})+
                " / мес.",fontSize=22.sp,fontWeight=FontWeight.Bold,color=colors.text)
        Spacer(Modifier.height(7.dp))
        if(debt) {
            Text(if(record.ecoText("dueAt").isNotBlank())"Вернуть до "+ecoDateLabel(record.ecoText("dueAt"))
                else "Срок не указан",fontSize=11.sp,color=colors.muted)
            Text(if(record.ecoBool("postedToAccount"))"Учтён на счёте" else "Без движения по счёту",
                fontSize=11.sp,color=colors.muted)
        } else {
            Text("Сумма: "+ecoRubles(record.ecoText("principalMinor"))+
                "  ·  "+record.ecoNumber("termMonths")+" мес.",fontSize=11.sp,color=colors.muted)
            Text("Ставка: "+(record.ecoNumber("annualRateBps")/100.0).toString()+"% годовых",
                fontSize=11.sp,color=colors.muted)
            Text("Переплата (оценка): "+ecoRubles(estimate!!.overpay.toString()),
                fontSize=11.sp,color=colors.muted)
            Text("Всего выплат (оценка): "+ecoRubles(estimate.total.toString()),
                fontSize=11.sp,color=colors.muted)
            Text("Начало: "+ecoDateLabel(record.ecoText("startDate"))+
                " · "+if(record.ecoText("paymentDate").isNotBlank())
                    "Платёж: "+ecoDay(record.ecoText("paymentDate")).takeLast(2)+"-го числа"
                else "Дата платежа не задана",fontSize=11.sp,color=colors.muted)
            Text("Без комиссий, страховок и досрочного погашения.",
                fontSize=10.sp,color=colors.muted)
        }
        if(record.ecoText("note").isNotBlank())Text(record.ecoText("note"),fontSize=11.sp,color=colors.muted)
        Spacer(Modifier.height(14.dp))
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
