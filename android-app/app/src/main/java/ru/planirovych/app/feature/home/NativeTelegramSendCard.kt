package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*
import java.util.Locale

/**
 * Native versions of MiniApp's TelegramInlineSendCard, TelegramReadConsentCard
 * and MailInlineSendCard. None of these cards execute an action until the user
 * selects recipients and presses an explicit confirmation button.
 */
private val actionPurple=Color(0xFF8963DF)
private val actionCyan=Color(0xFF1AAED0)

internal fun JsonObject.cardString(key:String):String =
    (this[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
internal fun JsonObject.cardObject(key:String):JsonObject?=this[key] as? JsonObject
internal fun JsonObject.cardArray(key:String):List<JsonObject> =
    (this[key] as? JsonArray).orEmpty().mapNotNull{it as? JsonObject}
internal fun actionInk(c:TaskChatColors):Color=c.assistantText
internal fun actionMuted(c:TaskChatColors):Color=c.secondary

@Composable
internal fun ActionPanel(
    title:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    c:TaskChatColors,body:@Composable ColumnScope.()->Unit
) {
    val dark=c.bg.red<.35f
    Surface(shape=RoundedCornerShape(17.dp),
        color=if(dark)Color(0xFF1A2B43) else Color(0xFFF9FAFF),
        border=BorderStroke(1.dp,if(dark)Color(0xFF34465F) else Color(0xFFD9E4F4)),
        modifier=Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement=Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(8.dp)){
                Box(Modifier.size(32.dp),
                    contentAlignment=Alignment.Center){
                    Icon(icon,null,tint=actionCyan,modifier=Modifier.size(20.dp))
                }
                Text(title,modifier=Modifier.weight(1f),
                    color=actionInk(c),fontSize=14.sp,
                    fontWeight=FontWeight.Bold,lineHeight=18.sp)
            }
            body()
        }
    }
}
@Composable
internal fun ActionCaption(text:String,c:TaskChatColors) {
    Text(text,color=actionMuted(c),fontSize=11.sp,lineHeight=15.sp)
}
@Composable
internal fun ActionError(text:String,c:TaskChatColors) {
    if(text.isNotBlank())Text(text,color=Color(0xFFEF6488),
        fontSize=11.sp,lineHeight=16.sp)
}
@Composable
internal fun ActionButton(label:String,enabled:Boolean=true,busy:Boolean=false,
    onClick:()->Unit) {
    Button(onClick=onClick,enabled=enabled&&!busy,
        modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(12.dp),
        contentPadding=PaddingValues(horizontal=12.dp,vertical=8.dp),
        colors=ButtonDefaults.buttonColors(containerColor=Color(0xFF8E5DE6))) {
        if(busy){
            CircularProgressIndicator(Modifier.size(16.dp),strokeWidth=2.dp,
                color=Color.White)
            Spacer(Modifier.width(7.dp))
        }
        Text(label,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
    }
}
private fun telegramStatusLabel(job:JsonObject):String {
    val state=job.cardString("state")
    return when(state) {
        "QUEUED","PROCESSING" -> "Отправка поставлена в очередь…"
        "DONE" -> when {
            ((job["sentCount"] as? JsonPrimitive)?.intOrNull ?: 0) > 0 ->
                "Отправлено в Telegram"
            ((job["unknownCount"] as? JsonPrimitive)?.intOrNull ?: 0) > 0 ->
                "Результат неизвестен. Проверьте Telegram."
            else -> "Сообщение не отправлено"
        }
        "FAILED" -> "Отправку выполнить не удалось. Проверьте Telegram."
        else -> "Статус отправки проверяется"
    }
}

@Composable
internal fun NativeTelegramSendCard(vm:HomeViewModel,draft:JsonObject,c:TaskChatColors) {
    val requestId=draft.cardString("requestId")
    var selectedId by rememberSaveable(requestId) {
        mutableStateOf(draft.cardString("recipientId"))
    }
    var selectedName by rememberSaveable(requestId) {
        mutableStateOf(draft.cardString("recipientName"))
    }
    var search by remember {mutableStateOf("")}
    var pickerOpen by remember {mutableStateOf(false)}
    var targets by remember {mutableStateOf<List<JsonObject>>(emptyList())}
    var fetching by remember {mutableStateOf(false)}
    var sending by remember {mutableStateOf(false)}
    var uncertain by remember {mutableStateOf(false)}
    var job by remember {mutableStateOf<JsonObject?>(null)}
    var error by remember {mutableStateOf("")}
    val scope=rememberCoroutineScope()
    LaunchedEffect(requestId){
        if(requestId.isNotBlank())runCatching{vm.telegramQuickSendStatus(requestId)}
            .onSuccess{job=it}
    }
    LaunchedEffect(job?.cardString("state"),requestId) {
        while(isActive && job?.cardString("state") in listOf("QUEUED","PROCESSING")) {
            delay(2500)
            runCatching{vm.telegramQuickSendStatus(requestId)}.onSuccess{job=it}
        }
    }
    val busy=sending||fetching
    val locked=busy||job!=null||uncertain
    val recipientTitle=selectedName.ifBlank {
        "Выбрать: "+draft.cardString("requestedRecipient")
    }
    ActionPanel("Сообщение в Telegram",Icons.Default.Send,c) {
        ActionCaption("Получатель",c)
        OutlinedButton(
            onClick={
                if(!locked){
                    pickerOpen=!pickerOpen
                    if(pickerOpen && targets.isEmpty()){
                        fetching=true;error=""
                        scope.launch{
                            try{targets=vm.telegramSendTargets().cardArray("dialogs")}
                            catch(t:Throwable){error=t.message?:"Не удалось загрузить чаты"}
                            finally{fetching=false}
                        }
                    }
                }
            },enabled=!locked,
            modifier=Modifier.fillMaxWidth(),
            shape=RoundedCornerShape(12.dp)) {
            Text(recipientTitle,Modifier.weight(1f),
                maxLines=1,overflow=TextOverflow.Ellipsis,fontSize=12.sp)
            Icon(Icons.Default.ExpandMore,null,modifier=Modifier.size(17.dp))
        }
        if(pickerOpen && !locked) {
            OutlinedTextField(value=search,onValueChange={search=it},
                modifier=Modifier.fillMaxWidth(),singleLine=true,
                placeholder={Text("Поиск человека или беседы",fontSize=11.sp)},
                textStyle=androidx.compose.ui.text.TextStyle(fontSize=12.sp),
                shape=RoundedCornerShape(11.dp))
            val needle=search.trim().lowercase(Locale.ROOT)
            val candidates=listOf(buildJsonObject{
                put("id","saved");put("name","Избранное");put("kind","user")
            })+targets
            LazyColumn(Modifier.fillMaxWidth().heightIn(max=185.dp)) {
                items(candidates.filter{target->
                    target.cardString("id")=="saved" || needle.isEmpty() ||
                        target.cardString("name").lowercase(Locale.ROOT).contains(needle) ||
                        target.cardString("username").lowercase(Locale.ROOT).contains(needle)
                },key={it.cardString("id")}){target->
                    Column(Modifier.fillMaxWidth().clickable {
                        selectedId=target.cardString("id")
                        selectedName=target.cardString("name")
                        pickerOpen=false;error=""
                    }.padding(horizontal=12.dp,vertical=9.dp)) {
                        Text(target.cardString("name"),color=actionInk(c),
                            fontSize=12.sp,fontWeight=FontWeight.Medium)
                        ActionCaption(when(target.cardString("kind")){
                            "group"->"Группа";"supergroup"->"Супергруппа"
                            else->if(target.cardString("id")=="saved")
                                "Сохранённые сообщения" else "Личный чат"
                        },c)
                    }
                }
            }
        }
        ActionCaption("Текст сообщения",c)
        Surface(shape=RoundedCornerShape(12.dp),
            color=c.panel,border=BorderStroke(1.dp,c.border)) {
            Text(draft.cardString("text"),modifier=Modifier.fillMaxWidth()
                .heightIn(max=190.dp).verticalScroll(rememberScrollState())
                .padding(11.dp),
                color=actionInk(c),fontSize=12.sp,lineHeight=18.sp)
        }
        ActionError(error,c)
        if(job!=null)ActionCaption(telegramStatusLabel(job!!),c)
        if(uncertain)ActionError(
            "Результат отправки неизвестен. Проверьте Telegram перед повтором.",c)
        ActionButton(if(job!=null)"Отправка оформлена" else "Отправить",
            enabled=requestId.isNotBlank() && selectedId.isNotBlank() && !locked,
            busy=sending) {
            if(locked)return@ActionButton
            sending=true;error=""
            scope.launch {
                try{
                    val result=vm.telegramQuickSend(buildJsonObject{
                        put("requestId",requestId)
                        put("recipientIds",JsonArray(listOf(JsonPrimitive(selectedId))))
                        put("text",draft.cardString("text"))
                        put("mode","DIRECT")
                    })
                    job=result
                    pickerOpen=false
                }catch(t:Throwable){
                    // POST may have succeeded before its response was lost.
                    // Query the same durable requestId; never send a new ID.
                    val old=runCatching{vm.telegramQuickSendStatus(requestId)}.getOrNull()
                    if(old!=null)job=old
                    else {
                        uncertain=true
                        error=t.message?:"Нет подтверждения отправки"
                    }
                }finally{sending=false}
            }
        }
    }
}
