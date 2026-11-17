package ru.planirovych.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.RotateLeft
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.math.BigDecimal

/** Same owner-scoped server proposal and transaction as the browser chip.
 * A corrected auto-applied proposal updates its original record, not a copy. */
private val ECON_FIELDS=mapOf(
    "name" to "Название","title" to "Название","counterparty" to "Контрагент",
    "kind" to "Тип","direction" to "Направление","balanceMinor" to "Баланс, ₽",
    "openingBalanceMinor" to "Баланс, ₽","amountMinor" to "Сумма, ₽",
    "principalMinor" to "Сумма кредита, ₽","paidMinor" to "Выплачено, ₽",
    "sourceAccountId" to "Счёт","targetAccountId" to "Счёт зачисления",
    "accountId" to "Счёт долга","category" to "Категория","note" to "Примечание",
    "dueAt" to "Срок возврата","annualRateBps" to "Ставка (б.п.)",
    "termMonths" to "Срок (мес.)","startDate" to "Дата начала",
    "occurredAt" to "Дата операции","lender" to "Кредитор",
    "paymentDate" to "Дата платежа","postedToAccount" to "Проводка по счёту",
    "remindersEnabled" to "Напоминания","isClosed" to "Закрыт"
)
private val ECON_EXPENSE_CATEGORIES=listOf(
    "Продукты","Кафе и рестораны","Транспорт","Жильё","Покупки",
    "Здоровье","Развлечения","Путешествия","Образование","Другое")
private val ECON_INCOME_CATEGORIES=listOf(
    "Зарплата","Подработка","Бизнес","Подарки","Проценты","Другое")

private fun economicDraft(p:JsonObject):Map<String,String>{
    val source=p["payload"] as? JsonObject ?:return emptyMap()
    val before=p["before"] as? JsonObject
    val operation=(p["entity"] as? JsonPrimitive)?.contentOrNull=="operation"
    val update=(p["action"] as? JsonPrimitive)?.contentOrNull=="update"
    val values=linkedMapOf<String,JsonElement>()
    if(operation&&update){
        listOf("kind","title","amountMinor","sourceAccountId","targetAccountId",
            "category","note","occurredAt").forEach{key->
            (source[key]?:before?.get(key))?.let{values[key]=it}
        }
    }else source.forEach{(key,v)->values[key]=v}
    if(operation&&values["category"]==null &&
        (values["kind"] as? JsonPrimitive)?.contentOrNull!="TRANSFER")
        values["category"]=JsonNull
    return values.filterKeys{it in ECON_FIELDS}.mapValues{(key,value)->
        val raw=(value as? JsonPrimitive)?.contentOrNull.orEmpty()
        when{
            key.endsWith("Minor")&&raw.isNotBlank() ->
                runCatching{BigDecimal(raw).movePointLeft(2).toPlainString()}.getOrDefault(raw)
            key in listOf("dueAt","occurredAt","startDate","paymentDate")&&raw.length>=10 ->
                raw.take(10)
            else->raw
        }
    }
}
private fun economicEditedPayload(draft:Map<String,String>,proposal:JsonObject):JsonObject=buildJsonObject{
    val source=proposal["payload"] as? JsonObject
    val before=proposal["before"] as? JsonObject
    for((key,raw) in draft){
        if(key !in ECON_FIELDS)continue
        val value=raw.trim()
        when{
            key.endsWith("Minor")->{
                require(Regex("^-?\\d{1,12}(?:[.,]\\d{1,2})?$").matches(value)){
                    "Сумма в рублях: не более двух знаков после запятой"
                }
                val amount=BigDecimal(value.replace(',','.')).movePointRight(2).toBigIntegerExact()
                require(amount.abs()<=java.math.BigInteger("999999999999999")){
                    "Слишком большая сумма"
                }
                put(key,amount.toString())
            }
            key in listOf("dueAt","occurredAt","startDate","paymentDate")->
                if(value.isEmpty())put(key,JsonNull)else{
                    require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)){"Неверная дата"}
                    val original=((source?.get(key)?:before?.get(key)) as? JsonPrimitive)
                        ?.contentOrNull
                    // Do not shift the time of an unchanged existing operation.
                    put(key,if(original?.take(10)==value && original.contains("T"))
                        original else value+"T12:00:00.000Z")
                }
            key in listOf("annualRateBps","termMonths")->{
                val n=value.toIntOrNull()?:throw IllegalArgumentException("Введите целое число")
                put(key,n)
            }
            key in listOf("isClosed","postedToAccount","remindersEnabled")->
                put(key,value=="true")
            value.isEmpty()&&key in listOf("category","note","lender",
                "targetAccountId","accountId")->put(key,JsonNull)
            else->put(key,value)
        }
    }
}

@Composable
private fun EconomicChipSelect(
    value:String,items:List<Pair<String,String>>,enabled:Boolean,
    light:Boolean,modifier:Modifier=Modifier,onChoose:(String)->Unit
){
    var expanded by remember{mutableStateOf(false)}
    val bg=if(light)Color(0xFFF8FAFC) else Color(0xFF43372B)
    val ink=if(light)Color(0xFF253449) else Color(0xFFFFE7C4)
    val text=items.firstOrNull{it.first==value}?.second
        ?:(if(value.isBlank())"Выбрать" else value)
    Box(modifier){
        Box(Modifier.fillMaxWidth().heightIn(min=31.dp)
            .border(1.dp,Color(0xFFB78E5C).copy(alpha=.5f),RoundedCornerShape(7.dp))
            .background(bg,RoundedCornerShape(7.dp))
            .clickable(enabled=enabled){expanded=true}
            .padding(horizontal=7.dp,vertical=7.dp)){
            Text(text,maxLines=1,overflow=TextOverflow.Ellipsis,color=ink,fontSize=11.sp)
        }
        DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}){
            items.forEach{(code,label)->
                DropdownMenuItem(text={Text(label,fontSize=12.sp)},
                    onClick={expanded=false;onChoose(code)})
            }
        }
    }
}

@Composable
internal fun NativeEconomicAiProposalCard(
    initial:JsonObject,c:TaskChatColors,vm:HomeViewModel
){
    val id=(initial["id"] as? JsonPrimitive)?.contentOrNull?:return
    var proposal by remember(id){mutableStateOf(initial)}
    var options by remember(id){mutableStateOf<JsonObject?>(null)}
    val draft=remember(id){mutableStateMapOf<String,String>()}
    var autoApply by remember(id){mutableStateOf(false)}
    var busy by remember(id){mutableStateOf(false)}
    var error by remember(id){mutableStateOf<String?>(null)}
    val scope=rememberCoroutineScope()
    val light=c.assistantText.red < .5f
    val bg=if(light)Color.White else Color(0xFF30251D)
    val ink=if(light)Color(0xFF263141) else Color(0xFFFFE8CE)
    val muted=if(light)Color(0xFF627184) else Color(0xFFD4AE84)
    val frame=RoundedCornerShape(14.dp)
    val amber=Color(0xFFF2A746)
    val status=(proposal["status"] as? JsonPrimitive)?.contentOrNull.orEmpty()
    val statusLabel=when(status){
        "PENDING"->"Ожидает подтверждения"
        "APPLYING"->"Применяется"
        "APPLIED"->"Применено"
        "REJECTED"->"Отклонено"
        "UNDONE"->"Отменено"
        "UNDOING"->"Отменяется"
        else->status
    }
    val editable=status=="PENDING"||status=="APPLIED"
    val accountChoices=((options?.get("accounts") as? JsonArray).orEmpty())
        .mapNotNull{item->
            val row=item as? JsonObject ?:return@mapNotNull null
            val key=(row["id"] as? JsonPrimitive)?.contentOrNull?:return@mapNotNull null
            key to ((row["name"] as? JsonPrimitive)?.contentOrNull?:key)
        }
    val kind=draft["kind"]?:"EXPENSE"
    val categoryChoices=(listOf("" to "Без категории")+
        (if(kind=="INCOME")ECON_INCOME_CATEGORIES else ECON_EXPENSE_CATEGORIES).map{it to it}+
        ((options?.get("categories") as? JsonArray).orEmpty()).mapNotNull{item->
            val obj=item as? JsonObject ?:return@mapNotNull null
            if((obj["kind"] as? JsonPrimitive)?.contentOrNull!=kind)return@mapNotNull null
            val name=(obj["name"] as? JsonPrimitive)?.contentOrNull?:return@mapNotNull null
            name to name
        }+(draft["category"]?.takeIf{it.isNotBlank()}?.let{listOf(it to it)}?:emptyList()))
        .distinctBy{it.first}
    LaunchedEffect(id){
        draft.clear();draft.putAll(economicDraft(initial))
        try{
            proposal=vm.economicProposalDetails(id)
            draft.clear();draft.putAll(economicDraft(proposal))
            autoApply=vm.economicAutoApply()
            options=vm.economicProposalOptions()
            error=null
        }catch(t:Throwable){
            error="Не удалось обновить карточку: "+(t.message?:"ошибка соединения")
        }
    }
    fun action(action:String){
        if(busy)return
        busy=true;error=null
        scope.launch{
            try{
                if(action=="approve"||action=="revise"){
                    val edited=economicEditedPayload(draft,proposal)
                    proposal=vm.economicProposalEdit(id,buildJsonObject{
                        put("payload",edited)
                        put("expectedPayload",proposal["payload"]?:buildJsonObject{})
                    })
                }
                if(action!="revise")proposal=vm.economicProposalAction(id,action)
                draft.clear();draft.putAll(economicDraft(proposal))
            }catch(t:Throwable){
                val latest=runCatching{vm.economicProposalDetails(id)}.getOrNull()
                if(latest!=null){proposal=latest;draft.clear();draft.putAll(economicDraft(latest))}
                error=t.message?:"Не удалось выполнить действие. Обновите чат."
            }finally{busy=false}
        }
    }
    Column(
        Modifier.fillMaxWidth().border(1.dp,Color(0xFFC98C3E).copy(alpha=.55f),frame)
            .background(bg,frame).padding(12.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)
    ){
        Text("◉  "+((proposal["title"] as? JsonPrimitive)?.contentOrNull
            ?:"Финансовое действие"),color=ink,fontSize=12.sp,fontWeight=FontWeight.Bold)
        Text(if(status=="APPLIED"&&(proposal["autoApplied"] as? JsonPrimitive)?.booleanOrNull==true)
            "Применено автоматически" else statusLabel,color=muted,fontSize=10.sp)
        (proposal["description"] as? JsonPrimitive)?.contentOrNull
            ?.takeIf{it.isNotBlank()}?.let{
                Text(it,color=ink,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
            }
        if(draft.isNotEmpty()){
            Column(Modifier.fillMaxWidth().heightIn(max=175.dp)
                .background(if(light)Color(0xFFF7F8FA) else Color(0xFF382F29),
                    RoundedCornerShape(9.dp))
                .verticalScroll(rememberScrollState()).padding(8.dp),
                verticalArrangement=Arrangement.spacedBy(5.dp)){
                draft.keys.take(15).forEach{key->
                    val label=ECON_FIELDS[key]?:key
                    val value=draft[key].orEmpty()
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        Text(label,Modifier.weight(.39f),color=muted,fontSize=10.sp,lineHeight=12.sp)
                        val selections:List<Pair<String,String>>?=when(key){
                            "kind"->if((proposal["entity"] as? JsonPrimitive)?.contentOrNull=="category")
                                listOf("EXPENSE" to "Расход","INCOME" to "Доход")
                                else listOf("EXPENSE" to "Расход","INCOME" to "Доход","TRANSFER" to "Перевод")
                            "direction"->listOf("OWE" to "Я должен","OWED_TO_ME" to "Мне должны")
                            "sourceAccountId","targetAccountId","accountId"->
                                listOf("" to "Выбрать счёт")+accountChoices
                            "category"->categoryChoices
                            "isClosed","postedToAccount","remindersEnabled"->
                                listOf("true" to "Да","false" to "Нет")
                            else->null
                        }
                        if(selections!=null)EconomicChipSelect(
                            value,selections,editable&&!busy&&
                                (key !in listOf("sourceAccountId","targetAccountId","accountId")||options!=null)&&
                                !(key=="category"&&kind=="TRANSFER"),
                            light,Modifier.weight(.61f)){chosen->
                            draft[key]=chosen
                            if(key=="kind"&&(proposal["entity"] as? JsonPrimitive)
                                ?.contentOrNull=="operation"){
                                draft["category"]=""
                                if(chosen=="TRANSFER"&&!draft.containsKey("targetAccountId"))
                                    draft["targetAccountId"]=""
                            }
                        }
                        else BasicTextField(value=value,
                            onValueChange={draft[key]=it},
                            enabled=editable&&!busy,
                            singleLine=true,textStyle=TextStyle(color=ink,fontSize=11.sp),
                            keyboardOptions=KeyboardOptions(keyboardType=
                                if(key.endsWith("Minor"))KeyboardType.Decimal else KeyboardType.Text),
                            modifier=Modifier.weight(.61f)
                                .border(1.dp,Color(0xFFC99B61).copy(alpha=.35f),
                                    RoundedCornerShape(7.dp))
                                .background(if(light)Color.White else Color(0xFF43372B),
                                    RoundedCornerShape(7.dp))
                                .padding(horizontal=7.dp,vertical=7.dp))
                    }
                }
            }
        }else{
            (proposal["details"] as? JsonArray).orEmpty().take(8).forEach{entry->
                (entry as? JsonPrimitive)?.contentOrNull?.let{
                    Text(it,color=muted,fontSize=11.sp)
                }
            }
        }
        val err=error?:(proposal["error"] as? JsonPrimitive)?.contentOrNull
        if(!err.isNullOrBlank())Text(err,color=Color(0xFFD65B47),fontSize=10.sp)
        if(status=="PENDING"){
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                Button(onClick={action("approve")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    colors=ButtonDefaults.buttonColors(containerColor=amber,
                        contentColor=Color(0xFF2B1B08)),
                    contentPadding=PaddingValues(horizontal=8.dp)){
                    Icon(Icons.Default.Check,null,modifier=Modifier.size(15.dp))
                    Spacer(Modifier.width(3.dp))
                    Text("Применить",fontSize=11.sp)
                }
                OutlinedButton(onClick={action("reject")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    contentPadding=PaddingValues(horizontal=7.dp)){
                    Icon(Icons.Default.Close,null,modifier=Modifier.size(14.dp),tint=muted)
                    Spacer(Modifier.width(3.dp))
                    Text("Отклонить",color=ink,fontSize=11.sp)
                }
            }
        }
        if(status=="APPLIED"){
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                Button(onClick={action("revise")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    colors=ButtonDefaults.buttonColors(containerColor=amber,
                        contentColor=Color(0xFF2B1B08)),
                    contentPadding=PaddingValues(horizontal=7.dp)){
                    Icon(Icons.Default.Check,null,modifier=Modifier.size(14.dp))
                    Spacer(Modifier.width(3.dp))
                    Text("Изменить",fontSize=11.sp)
                }
                OutlinedButton(onClick={action("undo")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    contentPadding=PaddingValues(horizontal=7.dp)){
                    Icon(Icons.Default.RotateLeft,null,modifier=Modifier.size(14.dp),tint=muted)
                    Spacer(Modifier.width(3.dp))
                    Text("Отменить",color=ink,fontSize=11.sp)
                }
            }
        }
        Row(verticalAlignment=Alignment.CenterVertically){
            Checkbox(checked=autoApply,enabled=!busy,
                onCheckedChange={enabled->
                    busy=true;error=null
                    scope.launch{
                        try{autoApply=vm.setEconomicAutoApply(enabled)}
                        catch(t:Throwable){error=t.message?:"Ошибка настройки"}
                        finally{busy=false}
                    }
                },
                modifier=Modifier.size(36.dp),
                colors=CheckboxDefaults.colors(checkedColor=amber))
            Spacer(Modifier.width(4.dp))
            Text("Автоматически применять новые изменения",color=muted,
                fontSize=10.sp,lineHeight=14.sp)
        }
    }
}
