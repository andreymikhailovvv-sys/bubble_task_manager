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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/** Same server-owned mail draft lifecycle as the Telegram Mini App. */
@Composable
internal fun NativeMailSendCard(vm:HomeViewModel,draft:JsonObject,c:TaskChatColors) {
    val draftId=draft.cardString("id")
    var mailboxId by rememberSaveable(draftId){mutableStateOf(draft.cardString("mailboxId"))}
    var sender by rememberSaveable(draftId){mutableStateOf(draft.cardString("sender"))}
    var recipient by rememberSaveable(draftId){mutableStateOf(draft.cardString("recipient"))}
    var subject by rememberSaveable(draftId){mutableStateOf(draft.cardString("subject"))}
    var body by rememberSaveable(draftId){mutableStateOf(draft.cardString("text"))}
    var status by rememberSaveable(draftId){mutableStateOf("PENDING")}
    var accounts by remember{mutableStateOf<List<JsonObject>>(emptyList())}
    var recentRecipients by remember{mutableStateOf<List<String>>(emptyList())}
    var mailboxMenu by remember{mutableStateOf(false)}
    var recipientsMenu by remember{mutableStateOf(false)}
    var busy by remember{mutableStateOf(false)}
    var rewriting by remember{mutableStateOf(false)}
    var loading by remember{mutableStateOf(true)}
    var rewriteOpen by remember{mutableStateOf(false)}
    var rewriteInstruction by remember{mutableStateOf("")}
    var rewriteCredits by remember{mutableLongStateOf(0L)}
    var error by remember{mutableStateOf("")}
    val scope=rememberCoroutineScope()
    LaunchedEffect(draftId){
        if(draftId.isBlank()){loading=false;return@LaunchedEffect}
        // A previously sent/unknown draft may be displayed in a newly mounted
        // chat card. Query durable server state before enabling the Send button.
        loading=true
        try{
            val remote=vm.mailDraftStatus(draftId).cardObject("draft")
                ?:throw IllegalStateException("Статус черновика недоступен")
            status=remote.cardString("status").ifBlank{"UNKNOWN"}
            if(status!="PENDING"){
                mailboxId=remote.cardString("mailboxId")
                recipient=remote.cardString("recipient")
                subject=remote.cardString("subject")
                body=remote.cardString("text")
            }
            accounts=runCatching{vm.mailAccounts().cardArray("accounts")}
                .getOrDefault(emptyList())
            recentRecipients=runCatching{
                (vm.mailRecentRecipients()["addresses"] as? JsonArray).orEmpty()
                    .mapNotNull{(it as? JsonPrimitive)?.contentOrNull}
            }.getOrDefault(emptyList())
        }catch(t:Throwable){
            status="UNKNOWN"
            error="Не удалось проверить статус письма: "+
                (t.message?:"нет связи с сервером")
        }finally{loading=false}
    }
    val locked=loading||busy||rewriting||(status!="PENDING"&&status!="FAILED")
    val editableStyle=TextStyle(fontSize=12.sp,color=actionInk(c),lineHeight=18.sp)
    ActionPanel("Новое письмо",Icons.Default.Mail,c) {
        ActionCaption("От кого",c)
        Box {
            OutlinedButton(onClick={mailboxMenu=true},enabled=!locked,
                modifier=Modifier.fillMaxWidth(),
                shape=RoundedCornerShape(11.dp)){
                Text(accounts.firstOrNull{it.cardString("id")==mailboxId}
                    ?.cardString("email")?.ifBlank{sender} ?: sender,
                    Modifier.weight(1f),fontSize=12.sp,maxLines=1)
                Icon(Icons.Default.ExpandMore,null,Modifier.size(17.dp))
            }
            DropdownMenu(expanded=mailboxMenu,onDismissRequest={mailboxMenu=false}){
                accounts.forEach{account->
                    DropdownMenuItem(text={Text(account.cardString("email"),fontSize=12.sp)},
                        onClick={
                            mailboxId=account.cardString("id")
                            sender=account.cardString("email")
                            mailboxMenu=false
                        })
                }
            }
        }
        ActionCaption("Кому",c)
        OutlinedTextField(value=recipient,onValueChange={recipient=it.take(500)},
            modifier=Modifier.fillMaxWidth(),enabled=!locked,
            textStyle=editableStyle,singleLine=true,
            placeholder={Text("Адрес электронной почты",fontSize=11.sp)},
            shape=RoundedCornerShape(11.dp))
        if(!locked && recentRecipients.isNotEmpty()){
            TextButton(onClick={recipientsMenu=!recipientsMenu}){
                Text("Недавние получатели",fontSize=11.sp)
                Icon(Icons.Default.ExpandMore,null,Modifier.size(15.dp))
            }
            if(recipientsMenu) {
                LazyColumn(Modifier.fillMaxWidth().heightIn(max=160.dp)){
                    items(recentRecipients.take(30)){email->
                        Text(email,Modifier.fillMaxWidth().clickable{
                            recipient=email;recipientsMenu=false
                        }.padding(horizontal=12.dp,vertical=8.dp),
                            color=actionInk(c),fontSize=12.sp)
                    }
                }
            }
        }
        ActionCaption("Тема",c)
        OutlinedTextField(value=subject,onValueChange={subject=it.take(200)},
            modifier=Modifier.fillMaxWidth(),enabled=!locked,
            textStyle=editableStyle,singleLine=true,
            placeholder={Text("Тема письма",fontSize=11.sp)},
            shape=RoundedCornerShape(11.dp))
        ActionCaption("Текст письма",c)
        OutlinedTextField(value=body,onValueChange={body=it.take(6000)},
            modifier=Modifier.fillMaxWidth().heightIn(min=120.dp,max=180.dp),
            enabled=!locked,textStyle=editableStyle,maxLines=7,
            shape=RoundedCornerShape(11.dp))
        if(status=="PENDING"||status=="FAILED") {
            OutlinedButton(onClick={rewriteOpen=!rewriteOpen},enabled=!locked,
                shape=RoundedCornerShape(11.dp)){
                Icon(Icons.Default.AutoAwesome,null,Modifier.size(15.dp))
                Spacer(Modifier.width(6.dp))
                Text("Изменить с ИИ",fontSize=12.sp)
            }
            if(rewriteOpen) {
                OutlinedTextField(value=rewriteInstruction,
                    onValueChange={rewriteInstruction=it.take(500)},
                    enabled=!locked,modifier=Modifier.fillMaxWidth(),
                    textStyle=editableStyle,maxLines=3,
                    placeholder={Text("Например: сделай короче и официальнее",
                        fontSize=11.sp)})
                ActionButton("Применить",enabled=!locked &&
                    rewriteInstruction.isNotBlank() && body.isNotBlank(),
                    busy=rewriting) {
                    rewriting=true;error=""
                    scope.launch{
                        try{
                            val response=vm.mailRewriteText(body,rewriteInstruction)
                            body=response.cardString("text").ifBlank{body}
                            rewriteCredits+=
                                (response["creditsSpentMilli"] as? JsonPrimitive)
                                    ?.longOrNull ?: 0L
                            rewriteOpen=false
                        }catch(t:Throwable){
                            error=t.message?:"Не удалось изменить письмо с ИИ"
                        }finally{rewriting=false}
                    }
                }
            }
        }
        if(rewriteCredits>0L)ActionCaption(
            "Редактирование с ИИ: "+
                String.format(java.util.Locale("ru"),"%.3f",rewriteCredits/1000.0)+
                " кредитов.",c)
        ActionError(error,c)
        if(status=="SENT")ActionCaption("Письмо отправлено.",c)
        if(status=="UNKNOWN")ActionError(
            "Результат отправки не подтверждён. Проверьте «Отправленные». "+
            "Повтор заблокирован, чтобы избежать дубликата.",c)
        ActionButton(when(status){
                "SENT"->"Отправлено"
                "FAILED"->"Повторить отправку"
                "PENDING"->"Отправить письмо"
                else->"Отправка недоступна"
            },
            enabled=!locked && mailboxId.isNotBlank() &&
                recipient.isNotBlank() && body.isNotBlank() && draftId.isNotBlank(),
            busy=busy
        ){
            if(locked)return@ActionButton
            busy=true;error=""
            scope.launch{
                try{
                    val response=vm.mailSendDraft(draftId,buildJsonObject{
                        put("mailboxId",mailboxId)
                        put("recipient",recipient.trim())
                        put("subject",subject)
                        put("text",body)
                    })
                    status=response.cardString("status").ifBlank{"UNKNOWN"}
                    if(response["ok"]?.jsonPrimitive?.booleanOrNull!=true)
                        error=response.cardString("message").ifBlank{
                            "Отправка не подтверждена"
                        }
                }catch(t:Throwable){
                    // An SMTP response can be lost after delivery. Never
                    // assume a failed HTTP response means no message was sent.
                    val remote=runCatching{
                        vm.mailDraftStatus(draftId).cardObject("draft")
                    }.getOrNull()
                    status=remote?.cardString("status").takeUnless{it.isNullOrBlank()}
                        ?:"UNKNOWN"
                    error=if(status=="PENDING")
                        (t.message?:"Ошибка отправки")
                    else "Проверьте папку «Отправленные» перед повтором."
                }finally{busy=false}
            }
        }
        ActionCaption("Письмо уйдёт только после нажатия кнопки. "+
            "Проверьте адресата перед отправкой.",c)
    }
}
