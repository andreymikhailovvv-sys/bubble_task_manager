package ru.planirovych.app.feature.home

import android.content.Context
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*

/** Explicit, one-time consent for reading specific messages in a Telegram chat. */
@Composable
internal fun NativeTelegramReadCard(
    vm:HomeViewModel,draft:JsonObject,c:TaskChatColors,
    taskId:String?,taskModel:String
) {
    val requestId=draft.cardString("requestId")
    val context=LocalContext.current
    val prefs=remember{context.getSharedPreferences("telegram_read_approvals",Context.MODE_PRIVATE)}
    var accepted by rememberSaveable(requestId) {
        mutableStateOf(prefs.getBoolean(requestId,false))
    }
    var chatId by rememberSaveable(requestId){mutableStateOf(draft.cardString("chatId"))}
    var chatName by rememberSaveable(requestId){mutableStateOf(draft.cardString("chatName"))}
    var count by rememberSaveable(requestId){mutableIntStateOf(20)}
    var countMenu by remember{mutableStateOf(false)}
    var pickerOpen by remember{mutableStateOf(false)}
    var search by remember{mutableStateOf("")}
    var targets by remember{mutableStateOf<List<JsonObject>>(emptyList())}
    var fetching by remember{mutableStateOf(false)}
    var working by remember{mutableStateOf(false)}
    var uncertain by rememberSaveable(requestId){mutableStateOf(false)}
    var error by remember{mutableStateOf("")}
    val scope=rememberCoroutineScope()
    val disabled=accepted||working||uncertain
    ActionPanel("Доступ к переписке Telegram",Icons.Default.MenuBook,c){
        ActionCaption("ИИ запрашивает доступ к переписке",c)
        OutlinedButton(onClick={
            if(!disabled){
                pickerOpen=!pickerOpen
                if(pickerOpen && targets.isEmpty()){
                    fetching=true;error=""
                    scope.launch {
                        try{targets=vm.telegramSendTargets().cardArray("dialogs")}
                        catch(e:Throwable){error=e.message?:"Не удалось загрузить Telegram-чаты"}
                        finally{fetching=false}
                    }
                }
            }
        },enabled=!disabled,modifier=Modifier.fillMaxWidth(),
            shape=RoundedCornerShape(11.dp)) {
            Text(chatName.ifBlank{"Выбрать: "+draft.cardString("requestedChat")},
                Modifier.weight(1f),fontSize=12.sp,maxLines=1,
                overflow=TextOverflow.Ellipsis)
            Icon(Icons.Default.ExpandMore,null,Modifier.size(18.dp))
        }
        if(pickerOpen && !disabled){
            OutlinedTextField(value=search,onValueChange={search=it},
                modifier=Modifier.fillMaxWidth(),singleLine=true,
                textStyle=androidx.compose.ui.text.TextStyle(fontSize=12.sp),
                placeholder={Text("Поиск человека или группы",fontSize=12.sp)})
            val query=search.trim().lowercase()
            LazyColumn(Modifier.fillMaxWidth().heightIn(max=172.dp)){
                items(targets.filter{t->
                    query.isEmpty() || t.cardString("name").lowercase().contains(query) ||
                    t.cardString("username").lowercase().contains(query)
                },key={it.cardString("id")}){target->
                    Column(Modifier.fillMaxWidth().clickable{
                        chatId=target.cardString("id")
                        chatName=target.cardString("name")
                        pickerOpen=false;error=""
                    }.padding(horizontal=12.dp,vertical=9.dp)) {
                        Text(target.cardString("name"),fontSize=12.sp,
                            fontWeight=FontWeight.SemiBold,color=actionInk(c))
                        ActionCaption(
                            if(target.cardString("kind")=="user")"Личная переписка"
                            else "Группа",c)
                    }
                }
            }
        }
        ActionCaption("Сколько последних сообщений разрешить ИИ?",c)
        Box {
            OutlinedButton(onClick={countMenu=true},enabled=!disabled,
                modifier=Modifier.fillMaxWidth(),
                shape=RoundedCornerShape(11.dp)){
                Text("$count сообщений",Modifier.weight(1f),
                    fontSize=12.sp)
                Icon(Icons.Default.ExpandMore,null,Modifier.size(16.dp))
            }
            DropdownMenu(expanded=countMenu,onDismissRequest={countMenu=false}){
                listOf(10,20,30,50,100).forEach{option->
                    DropdownMenuItem(text={Text("$option сообщений")},
                        onClick={count=option;countMenu=false})
                }
            }
        }
        ActionCaption("Только после вашего разрешения выбранные сообщения "+
            "этого чата будут переданы в OpenAI для продолжения текущего запроса. "+
            "Без файлов и вложений. В группах могут быть сообщения других участников.",c)
        ActionError(error,c)
        if(accepted)ActionCaption(
            "Доступ предоставлен однократно. ИИ продолжил выполнение запроса.",c)
        if(uncertain)ActionError(
            "Результат запроса неизвестен. Проверьте историю чата перед повтором.",c)
        if(!accepted){
            ActionButton("Разрешить и продолжить",
                enabled=!disabled && !fetching && chatId.isNotBlank() && requestId.isNotBlank(),
                busy=working){
                if(disabled || chatId.isBlank())return@ActionButton
                working=true;error=""
                val approval=buildJsonObject{
                    put("requestId",requestId)
                    put("chatId",chatId)
                    put("count",count)
                }
                val finished:(String?)->Unit={problem->
                    working=false
                    if(problem==null){
                        accepted=true
                        prefs.edit().putBoolean(requestId,true).apply()
                        pickerOpen=false
                    }else {
                        // One-time read approval might already have been consumed
                        // before an interrupted response. Do not auto-repeat.
                        uncertain=true
                        error=problem
                    }
                }
                if(taskId==null)vm.continueGeneralAiTelegramRead(approval,finished)
                else vm.continueTaskAiTelegramRead(taskId,taskModel,approval,finished)
            }
        }
    }
}
