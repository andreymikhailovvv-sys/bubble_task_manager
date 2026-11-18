package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.*
import java.time.LocalDate
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EcoEditorSheet(
    request: EcoEditorRequest,
    snapshot: JsonObject,
    user: JsonObject?,
    colors: EcoColors,
    saving: Boolean,
    externalError: String,
    onDismiss: () -> Unit,
    onSubmit: (JsonObject) -> Unit,
    onCreateCategory: (String,String,(String?,String?)->Unit)->Unit
) {
    val item = request.record
    val editing = item.ecoText("id").isNotBlank()
    val type = request.resource
    val form = remember(type, item.ecoText("id")) {
        mutableStateMapOf<String,String>().apply {
            val primary = snapshot.ecoItems("accounts").firstOrNull { it.ecoBool("isPrimary") }
                ?: snapshot.ecoItems("accounts").firstOrNull()
            val account = primary.ecoText("id")
            when(type) {
                "accounts" -> {
                    put("name",item.ecoText("name"))
                    put("balance",if(editing)ecoInput(item.ecoText("balanceMinor")) else "0")
                    put("isPrimary",if(item.ecoBool("isPrimary"))"yes" else "no")
                }
                "operations" -> {
                    put("kind",item.ecoText("kind").ifBlank{"EXPENSE"})
                    put("title",item.ecoText("title"))
                    put("amount",if(editing)ecoInput(item.ecoText("amountMinor")) else "")
                    put("sourceAccountId",item.ecoText("sourceAccountId").ifBlank{account})
                    put("targetAccountId",item.ecoText("targetAccountId"))
                    put("category",item.ecoText("category"))
                    put("date",ecoDay(item.ecoText("occurredAt")).ifBlank{LocalDate.now().toString()})
                    put("note",item.ecoText("note"))
                }
                "debts" -> {
                    put("direction",item.ecoText("direction").ifBlank{"OWE"})
                    put("counterparty",item.ecoText("counterparty"))
                    put("amount",if(editing)ecoInput(item.ecoText("amountMinor")) else "")
                    put("paid",if(editing)ecoInput(item.ecoText("paidMinor")) else "0")
                    put("postedToAccount",if(!editing||item.ecoBool("postedToAccount"))"yes" else "no")
                    put("accountId",item.ecoText("accountId").ifBlank{account})
                    put("date",ecoDay(item.ecoText("dueAt")))
                    put("note",item.ecoText("note"))
                    put("isClosed",if(item.ecoBool("isClosed"))"yes" else "no")
                }
                "loans" -> {
                    put("name",item.ecoText("name"))
                    put("lender",item.ecoText("lender"))
                    put("amount",if(editing)ecoInput(item.ecoText("principalMinor")) else "")
                    put("paid",if(editing)ecoInput(item.ecoText("paidMinor")) else "0")
                    put("rate",if(editing)(item.ecoNumber("annualRateBps")/100.0)
                        .toString().replace('.',',') else "")
                    put("months",if(editing)item.ecoText("termMonths") else "12")
                    put("monthlyOverride",if(item.ecoText("monthlyPaymentOverrideMinor").isNotBlank())
                        ecoInput(item.ecoText("monthlyPaymentOverrideMinor")) else "")
                    put("date",ecoDay(item.ecoText("startDate")).ifBlank{LocalDate.now().toString()})
                    put("paymentDate",ecoDay(item.ecoText("paymentDate")))
                    put("remindersEnabled",if(item.ecoBool("remindersEnabled"))"yes" else "no")
                    put("isClosed",if(item.ecoBool("isClosed"))"yes" else "no")
                }
                "categories" -> {
                    put("kind",item.ecoText("kind").ifBlank{"EXPENSE"})
                    put("name",item.ecoText("name"))
                }
            }
        }
    }
    fun value(key:String)=form[key].orEmpty()
    fun change(key:String,new:String){ form[key]=new }
    val accountOptions = snapshot.ecoItems("accounts").map {
        it.ecoText("id") to it.ecoText("name")
    }
    var localError by remember(request) { mutableStateOf("") }
    var newCategoryOpen by remember(request) { mutableStateOf(false) }
    var newCategoryName by remember(request) { mutableStateOf("") }
    var newCategoryBusy by remember(request) { mutableStateOf(false) }
    var extraCategory by remember(request) { mutableStateOf("") }

    fun submit() {
        try {
            val payload=buildJsonObject {
                when(type) {
                    "accounts" -> {
                        val name=value("name").trim()
                        require(name.isNotBlank()&&name.length<=60){"Введите название счёта (до 60 символов)"}
                        put("name",name)
                        put("balanceMinor",ecoParseMoney(value("balance"),true))
                        if(editing && value("isPrimary")=="yes")put("isPrimary",true)
                    }
                    "operations" -> {
                        val kind=value("kind")
                        require(kind in listOf("INCOME","EXPENSE","TRANSFER")){"Выберите тип операции"}
                        require(value("title").trim().isNotBlank() && value("title").length<=160) {
                            "Укажите название операции (до 160 символов)"
                        }
                        require(value("sourceAccountId").isNotBlank()){"Выберите счёт"}
                        if(kind=="TRANSFER")require(value("targetAccountId").isNotBlank() &&
                            value("targetAccountId")!=value("sourceAccountId")) {
                            "Укажите другой счёт для перевода"
                        }
                        put("kind",kind); put("title",value("title").trim())
                        put("amountMinor",ecoParseMoney(value("amount")))
                        put("sourceAccountId",value("sourceAccountId"))
                        put("targetAccountId",if(kind=="TRANSFER")
                            JsonPrimitive(value("targetAccountId")) else JsonNull)
                        put("category",if(kind=="TRANSFER"||value("category").isBlank())
                            JsonNull else JsonPrimitive(value("category")))
                        put("note",if(value("note").isBlank())JsonNull else JsonPrimitive(value("note")))
                        put("occurredAt",ecoIsoDate(value("date")))
                    }
                    "debts" -> {
                        require(value("counterparty").trim().isNotBlank() &&
                            value("counterparty").length<=100){"Укажите человека или организацию"}
                        val amount=ecoParseMoney(value("amount"))
                        val paid=ecoParseMoney(value("paid").ifBlank{"0"})
                        require(paid.toBigInteger()<=amount.toBigInteger()){
                            "Погашение не может превышать сумму долга"
                        }
                        if(value("postedToAccount")=="yes")
                            require(value("accountId").isNotBlank()){"Выберите счёт для учёта долга"}
                        put("direction",value("direction"))
                        put("counterparty",value("counterparty").trim())
                        put("amountMinor",amount); put("paidMinor",paid)
                        put("postedToAccount",value("postedToAccount")=="yes")
                        put("accountId",if(value("postedToAccount")=="yes")
                            JsonPrimitive(value("accountId")) else JsonNull)
                        put("dueAt",if(value("date").isBlank())JsonNull
                            else JsonPrimitive(ecoIsoDate(value("date"))))
                        put("note",if(value("note").isBlank())JsonNull else JsonPrimitive(value("note")))
                        if(editing)put("isClosed",value("isClosed")=="yes")
                    }
                    "loans" -> {
                        require(value("name").trim().isNotBlank()&&value("name").length<=100) {
                            "Введите название кредита"
                        }
                        val rateText=value("rate").trim().replace(',','.')
                        require(Regex("\\d+(\\.\\d{1,2})?").matches(rateText)) {
                            "Ставка должна быть в процентах, максимум два знака после запятой"
                        }
                        val rate=rateText.toDouble()
                        require(rate in 0.0..1000.0){"Ставка должна быть от 0 до 1000%"}
                        val months=value("months").toIntOrNull()
                        require(months!=null&&months in 1..600){"Укажите срок от 1 до 600 месяцев"}
                        require(value("remindersEnabled")!="yes"||value("paymentDate").isNotBlank()) {
                            "Укажите дату платежа для напоминаний"
                        }
                        require(value("remindersEnabled")!="yes"||user.ecoBool("telegramLinked")) {
                            "Подключите Telegram-бот Планировыч AI для напоминаний"
                        }
                        put("name",value("name").trim())
                        put("lender",if(value("lender").isBlank())JsonNull else JsonPrimitive(value("lender")))
                        put("principalMinor",ecoParseMoney(value("amount")))
                        put("paidMinor",ecoParseMoney(value("paid").ifBlank{"0"}))
                        put("annualRateBps",(rate*100).roundToInt())
                        put("termMonths",months)
                        put("monthlyPaymentOverrideMinor",if(value("monthlyOverride").isBlank())
                            JsonNull else JsonPrimitive(ecoParseMoney(value("monthlyOverride"))))
                        put("startDate",ecoIsoDate(value("date")))
                        put("paymentDate",if(value("paymentDate").isBlank())JsonNull
                            else JsonPrimitive(ecoIsoDate(value("paymentDate"),true)))
                        put("remindersEnabled",value("remindersEnabled")=="yes")
                        if(editing)put("isClosed",value("isClosed")=="yes")
                    }
                    "categories" -> {
                        require(value("name").trim().isNotBlank()&&value("name").length<=60){
                            "Укажите название категории (до 60 символов)"
                        }
                        put("kind",value("kind")); put("name",value("name").trim())
                    }
                }
            }
            localError=""
            onSubmit(payload)
        } catch (cause: Exception) {
            localError=cause.localizedMessage ?: "Проверьте данные формы"
        }
    }

    val title=when(type){
        "accounts"->"Счёт";"operations"->"Операция";"debts"->"Долг"
        "loans"->"Кредит";else->"Категория"
    }
    val height=(LocalConfiguration.current.screenHeightDp*.85f).dp
    ModalBottomSheet(
        onDismissRequest={if(!saving)onDismiss()},
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        containerColor=colors.panel,
        contentColor=colors.text,
        dragHandle={BottomSheetDefaults.DragHandle(color=colors.muted)}
    ){
        Column(Modifier.fillMaxWidth().heightIn(max=height)
            .imePadding().navigationBarsPadding().padding(horizontal=18.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.SpaceBetween) {
                Column {
                    Text(if(editing)"РЕДАКТИРОВАНИЕ" else "НОВАЯ ЗАПИСЬ",
                        fontSize=10.sp,letterSpacing=1.sp,fontWeight=FontWeight.Bold,color=colors.gold)
                    Text(title,fontSize=22.sp,fontWeight=FontWeight.ExtraBold,color=colors.text)
                }
                IconButton(enabled=!saving,onClick=onDismiss) {
                    Icon(Icons.Default.Close,"Закрыть",tint=colors.muted)
                }
            }
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color=colors.outline)
            Column(Modifier.weight(1f,fill=false).verticalScroll(rememberScrollState())
                .padding(vertical=14.dp),verticalArrangement=Arrangement.spacedBy(13.dp)) {
                when(type) {
                    "operations" -> {
                        EcoSelect("Тип операции",value("kind"),
                            listOf("EXPENSE" to "Расход","INCOME" to "Доход",
                                "TRANSFER" to "Перевод между счетами"),colors) {
                            change("kind",it);change("category","");newCategoryOpen=false
                        }
                        EcoInput("Название",value("title"),colors,160,
                            placeholder="Что купили или получили") {change("title",it)}
                        EcoInput("Сумма, ₽",value("amount"),colors,40,decimal=true,
                            placeholder="0,00"){change("amount",it)}
                        EcoSelect(if(value("kind")=="TRANSFER")"Счёт списания" else "Счёт",
                            value("sourceAccountId"),accountOptions,colors){
                            change("sourceAccountId",it)
                        }
                        if(value("kind")=="TRANSFER"){
                            EcoSelect("Счёт зачисления",value("targetAccountId"),
                                listOf("" to "Выберите счёт")+accountOptions.filter {
                                    it.first!=value("sourceAccountId") },colors){
                                change("targetAccountId",it)
                            }
                        } else {
                            val options=ecoCategories(snapshot,value("kind"))+
                                listOf(extraCategory).filter {it.isNotBlank()}
                            EcoSelect("Категория",value("category"),
                                listOf("" to "Без категории")+options.distinct().map{it to it},colors) {
                                change("category",it)
                            }
                            EcoInlineAction("+ Новая категория",colors){
                                newCategoryOpen=!newCategoryOpen
                            }
                            if(newCategoryOpen){
                                EcoInput("Название новой категории",newCategoryName,colors,60) {
                                    newCategoryName=it
                                }
                                Button(enabled=!newCategoryBusy&&newCategoryName.trim().isNotBlank(),
                                    onClick={
                                        newCategoryBusy=true
                                        onCreateCategory(value("kind"),newCategoryName.trim()) { added,cause ->
                                            newCategoryBusy=false
                                            if(added!=null) {
                                                extraCategory=added
                                                change("category",added)
                                                newCategoryName=""
                                                newCategoryOpen=false
                                                localError=""
                                            } else localError=cause ?: "Не удалось добавить категорию"
                                        }
                                    },colors=ButtonDefaults.buttonColors(containerColor=colors.gold)){
                                    Text("Добавить категорию",color=Color(0xFF291400))
                                }
                            }
                        }
                        EcoDate("Дата",value("date"),colors){change("date",it)}
                        EcoInput("Примечание",value("note"),colors,500,placeholder="Необязательно") {
                            change("note",it)
                        }
                    }
                    "accounts" -> {
                        EcoInput("Название счёта",value("name"),colors,60,
                            placeholder="Наличные, карта, накопления"){change("name",it)}
                        EcoInput("Баланс, ₽",value("balance"),colors,40,decimal=true){change("balance",it)}
                        if(editing&&value("isPrimary")!="yes") {
                            EcoSelect("Статус",value("isPrimary"),listOf(
                                "no" to "Дополнительный","yes" to "Сделать основным"),colors) {
                                change("isPrimary",it)
                            }
                        }
                        EcoHint("Укажите текущую сумму на счёте. Корректировка баланса сохраняет историю операций и не считается доходом или расходом.",colors)
                    }
                    "debts" -> {
                        EcoSelect("Направление",value("direction"),listOf(
                            "OWE" to "Я получил деньги в долг",
                            "OWED_TO_ME" to "Я дал деньги в долг"),colors){change("direction",it)}
                        EcoInput("Кому или кто",value("counterparty"),colors,100,
                            placeholder="Имя человека или организация"){change("counterparty",it)}
                        val counterparties=snapshot.ecoItems("debts").map{it.ecoText("counterparty")}
                            .filter{it.isNotBlank()}.distinct()
                        if(counterparties.isNotEmpty()) {
                            EcoSelect("Из существующих",value("counterparty"),
                                listOf("" to "Выберите")+
                                    counterparties.map{it to it},colors){if(it.isNotBlank())change("counterparty",it)}
                        }
                        EcoInput("Сумма долга, ₽",value("amount"),colors,40,decimal=true){change("amount",it)}
                        EcoCheck("Зачислить долг на счёт"+if(value("direction")=="OWED_TO_ME")
                            " (списать при выдаче)" else "",value("postedToAccount")=="yes",colors){
                            change("postedToAccount",if(it)"yes" else "no")
                        }
                        if(value("postedToAccount")=="yes"){
                            EcoSelect("Счёт для учёта долга",value("accountId"),accountOptions,colors){
                                change("accountId",it)
                            }
                        }
                        EcoInput("Сколько уже возвращено, ₽",value("paid"),colors,40,decimal=true){
                            change("paid",it)
                        }
                        EcoDate("Срок возврата (необязательно)",value("date"),colors,true) {
                            change("date",it)
                        }
                        EcoInput("Примечание",value("note"),colors,500){change("note",it)}
                        if(editing){
                            EcoSelect("Состояние",value("isClosed"),listOf(
                                "no" to "Активный долг","yes" to "Долг погашен полностью"),colors){
                                change("isClosed",it)
                                if(it=="yes")change("paid",value("amount"))
                            }
                        }
                        EcoHint("При активном учёте долг изменяет выбранный счёт. Возвраты учитываются отдельно и не являются доходом или расходом.",colors)
                    }
                    "loans" -> {
                        EcoInput("Название кредита",value("name"),colors,100,
                            placeholder="Автокредит, ипотека…"){change("name",it)}
                        EcoInput("Банк / кредитор",value("lender"),colors,100){change("lender",it)}
                        EcoInput("Сумма кредита, ₽",value("amount"),colors,40,decimal=true) {
                            change("amount",it)
                        }
                        EcoInput("Сколько уже внесено, ₽",value("paid"),colors,40,decimal=true) {
                            change("paid",it)
                        }
                        EcoInput("Ставка, % годовых",value("rate"),colors,20,decimal=true,
                            placeholder="12,5"){change("rate",it)}
                        EcoInput("Срок, месяцев",value("months"),colors,3,integer=true){
                            change("months",it)
                        }
                        EcoInput("Ежемесячный платёж, ₽ (необязательно)",
                            value("monthlyOverride"),colors,40,decimal=true,
                            placeholder="Автоматический расчёт"){change("monthlyOverride",it)}
                        EcoHint("Оставьте поле пустым, чтобы использовать расчёт Экономыча AI.",colors)
                        EcoDate("Начало кредита",value("date"),colors){change("date",it)}
                        EcoDate("Дата платежа (необязательно)",value("paymentDate"),colors,true){
                            change("paymentDate",it)
                        }
                        EcoCheck("Напоминания о платеже",value("remindersEnabled")=="yes",colors){
                            change("remindersEnabled",if(it)"yes" else "no")
                        }
                        EcoHint("В дату платежа придёт уведомление в телеграм-бот «Планировыч AI». Статус подключения: "+
                            if(user.ecoBool("telegramLinked"))"Подключен" else "Не подключен",colors)
                        if(value("remindersEnabled")=="yes"&&value("paymentDate").isBlank()) {
                            EcoHint("Укажите дату платежа, чтобы включить уведомления.",colors)
                        }
                        if(editing)EcoSelect("Статус",value("isClosed"),listOf(
                            "no" to "Активен","yes" to "Закрыт"),colors){change("isClosed",it)}
                        EcoHint("В прогрессе учитывается плановая сумма выплат с процентами. Расчёт аннуитетный, ориентировочный, без комиссий, страховок и досрочного погашения.",colors)
                    }
                    "categories" -> {
                        EcoSelect("Тип",value("kind"),listOf(
                            "EXPENSE" to "Расходы","INCOME" to "Доходы"),colors){
                            change("kind",it)
                        }
                        EcoInput("Название",value("name"),colors,60,
                            placeholder="Например, питомцы"){change("name",it)}
                    }
                }
                if(localError.isNotBlank())Text(localError,color=Color(0xFFF0907E),fontSize=12.sp)
                if(externalError.isNotBlank())Text(externalError,color=Color(0xFFF0907E),fontSize=12.sp)
            }
            HorizontalDivider(color=colors.outline)
            Row(Modifier.fillMaxWidth().padding(vertical=12.dp),
                horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick=onDismiss,enabled=!saving,modifier=Modifier.weight(1f),
                    border=BorderStroke(1.dp,colors.outline)) {
                    Text("Отмена",color=colors.text)
                }
                Button(onClick={submit()},enabled=!saving,modifier=Modifier.weight(1f),
                    colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFF0A84C))) {
                    Icon(Icons.Default.Check,null,modifier=Modifier.size(17.dp),
                        tint=Color(0xFF291400))
                    Spacer(Modifier.width(4.dp))
                    Text(if(saving)"Сохранение…" else "Сохранить",
                        color=Color(0xFF291400),fontWeight=FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
internal fun EcoSelect(label:String,value:String,options:List<Pair<String,String>>,
    colors:EcoColors,onChange:(String)->Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label,fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=colors.muted)
        Spacer(Modifier.height(5.dp))
        Box {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                .background(colors.field).border(1.dp,colors.outline,RoundedCornerShape(10.dp))
                .clickable { expanded=true }.padding(horizontal=12.dp,vertical=13.dp),
                verticalAlignment=Alignment.CenterVertically) {
                Text(options.firstOrNull{it.first==value}?.second ?: value,
                    Modifier.weight(1f),fontSize=13.sp,color=colors.text)
                Icon(Icons.Default.KeyboardArrowDown,null,Modifier.size(18.dp),tint=colors.muted)
            }
            DropdownMenu(expanded=expanded,onDismissRequest={expanded=false},
                modifier=Modifier.background(colors.panel)) {
                options.forEach { (id,title) ->
                    DropdownMenuItem(
                        text={Text(title,color=colors.text,fontSize=13.sp)},
                        onClick={expanded=false;onChange(id)}
                    )
                }
            }
        }
    }
}
@Composable
private fun EcoInput(label:String,value:String,colors:EcoColors,maxChars:Int,
    decimal:Boolean=false,integer:Boolean=false,placeholder:String="",onChange:(String)->Unit){
    Column {
        Text(label,color=colors.muted,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
        Spacer(Modifier.height(5.dp))
        OutlinedTextField(
            value=value,onValueChange={onChange(it.take(maxChars))},
            modifier=Modifier.fillMaxWidth(),singleLine=true,
            placeholder={if(placeholder.isNotBlank())Text(placeholder,color=colors.muted,fontSize=12.sp)},
            textStyle=androidx.compose.ui.text.TextStyle(fontSize=14.sp,color=colors.text),
            keyboardOptions=KeyboardOptions(keyboardType=
                if(decimal)KeyboardType.Decimal else if(integer)KeyboardType.Number else KeyboardType.Text),
            shape=RoundedCornerShape(10.dp),
            colors=OutlinedTextFieldDefaults.colors(
                focusedTextColor=colors.text,unfocusedTextColor=colors.text,
                focusedContainerColor=colors.field,unfocusedContainerColor=colors.field,
                focusedBorderColor=colors.gold,unfocusedBorderColor=colors.outline,
                cursorColor=colors.gold
            )
        )
    }
}
@Composable
private fun EcoDate(label:String,value:String,colors:EcoColors,optional:Boolean=false,onChange:(String)->Unit) {
    val context=LocalContext.current
    val selected=runCatching {LocalDate.parse(value)}.getOrElse{LocalDate.now()}
    Column {
        Text(label,fontSize=12.sp,color=colors.muted,fontWeight=FontWeight.SemiBold)
        Spacer(Modifier.height(5.dp))
        Row(verticalAlignment=Alignment.CenterVertically) {
            Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                .background(colors.field).border(1.dp,colors.outline,RoundedCornerShape(10.dp))
                .clickable {
                    DatePickerDialog(context,{_,year,month,day->
                        onChange("%04d-%02d-%02d".format(year,month+1,day))
                    },selected.year,selected.monthValue-1,selected.dayOfMonth).show()
                }.padding(horizontal=12.dp,vertical=13.dp),verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.CalendarToday,null,Modifier.size(17.dp),tint=colors.gold)
                Spacer(Modifier.width(8.dp))
                Text(if(value.isBlank())"Выберите дату" else ecoDateLabel(value),
                    Modifier.weight(1f),fontSize=13.sp,color=colors.text)
            }
            if(optional&&value.isNotBlank()){
                IconButton(onClick={onChange("")}) {Icon(Icons.Default.Close,"Очистить дату",
                    modifier=Modifier.size(18.dp),tint=colors.muted)}
            }
        }
    }
}
@Composable
private fun EcoCheck(text:String,checked:Boolean,colors:EcoColors,onChange:(Boolean)->Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) },
        verticalAlignment=Alignment.CenterVertically) {
        Checkbox(checked=checked,onCheckedChange=onChange,
            colors=CheckboxDefaults.colors(checkedColor=colors.gold,uncheckedColor=colors.muted))
        Text(text,fontSize=12.sp,color=colors.text)
    }
}
@Composable
private fun EcoHint(text:String,colors:EcoColors) {
    Text(text,fontSize=11.sp,lineHeight=16.sp,color=colors.muted)
}
