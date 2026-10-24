package ru.planirovych.app.feature.home

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.text.Html
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.util.Locale
import java.util.UUID
import ru.planirovych.app.data.model.*

private data class TaskChatColors(val bg:Color,val panel:Color,val text:Color,
    val secondary:Color,val border:Color,val user:Color,val assistant:Color,val accent:Color)
private fun chatColors(dark:Boolean)=if(dark)TaskChatColors(
    Color(0xFF0E1728),Color(0xFF152239),Color(0xFFF1F5F9),Color(0xFFA7B7CC),
    Color(0xFF39465F),Color(0xFF4C1D95),Color(0xFF1D2B42),Color(0xFFC4B5FD))
else TaskChatColors(Color(0xFFF7F8FC),Color.White,Color(0xFF111827),
    Color(0xFF64748B),Color(0xFFDDE3EC),Color(0xFFEDE0FF),
    Color.White,Color(0xFF6D28D9))

private data class ReplyTarget(val id:String,val role:String,val content:String)

private fun serializeTaskAiReply(question:String,target:ReplyTarget?):String{
    if(target==null)return question
    val payload=buildJsonObject{
        put("messageId",target.id)
        put("role",target.role)
        put("quotedText",target.content.take(12000))
        put("attachmentMessageId",target.id.ifBlank{null}?.let{JsonPrimitive(it)} ?: JsonNull)
        put("attachmentNames",JsonArray(emptyList()))
        put("generatedDocumentId",JsonNull)
    }
    return "[[PLANNER_AI_REPLY_BEGIN]]\n"+payload.toString()+
        "\n[[PLANNER_AI_REPLY_END]]\n"+question
}
private fun messageDisplayContent(text:String):String {
    val end="\n[[PLANNER_AI_REPLY_END]]\n"
    if(text.startsWith("[[PLANNER_AI_REPLY_BEGIN]]\n")&&text.contains(end))
        return text.substringAfter(end)
    return text
}
private fun isChatAttachmentAllowed(name:String):Boolean =
    Regex("(?i)\\.(pdf|docx|xls|xlsx|png|jpe?g|webp|gif|txt)$").containsMatchIn(name)

@Composable
fun NativeTaskAiChat(task:Task,vm:HomeViewModel,dark:Boolean,onClose:()->Unit){
    val c=remember(dark){chatColors(dark)}
    val ctx=LocalContext.current
    val ui by vm.taskAi.collectAsStateWithLifecycle()
    val home by vm.state.collectAsStateWithLifecycle()
    val scope=rememberCoroutineScope()
    val listState= rememberLazyListState()
    var draft by remember(task.id){mutableStateOf("")}
    var model by rememberSaveable(task.id){mutableStateOf("gpt-6-luna")}
    var modelMenu by remember{mutableStateOf(false)}
    var reply by remember{mutableStateOf<ReplyTarget?>(null)}
    val files=remember(task.id){mutableStateListOf<TaskAiFile>()}
    var attaching by remember{mutableStateOf(false)}
    var sendingId by remember(task.id){mutableStateOf<String?>(null)}
    var sendingQuestion by remember(task.id){mutableStateOf<String?>(null)}
    var sendingDisplay by remember(task.id){mutableStateOf<String?>(null)}
    var attachmentError by remember(task.id){mutableStateOf<String?>(null)}
    var pendingRetry by remember(task.id){mutableStateOf(false)}
    val busy=ui.taskId==task.id && ui.busy
    val messages=if(ui.taskId==task.id)ui.messages else emptyList()
    val error=if(ui.taskId==task.id)ui.error else null
    val modelOptions=listOf(
        "gpt-6-luna" to "GPT-6 Luna",
        "gpt-5.4-mini" to "GPT-5.4 mini",
        "gpt-6.1-sol" to "GPT-6.1 Sol"
    )
    LaunchedEffect(task.id){
        vm.openTaskAi(task.id)
        while(isActive){
            delay(4000)
            vm.syncTaskAiHistory(task.id)
        }
    }
    DisposableEffect(task.id){onDispose{vm.closeTaskAi()}}
    val picker=rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ){uris->
        if(uris.isNotEmpty())scope.launch{
            attaching=true
            attachmentError=null
            try {
                val loaded=withContext(Dispatchers.IO) {
                    uris.map{uri->
                        val name=ctx.contentResolver.query(
                            uri,arrayOf(OpenableColumns.DISPLAY_NAME),
                            null,null,null)?.use{
                                if(it.moveToFirst())it.getString(0) else null
                            } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Файл"
                        if(!isChatAttachmentAllowed(name))
                            throw IllegalArgumentException("Поддерживаются PDF, DOCX, XLS/XLSX, TXT и изображения.")
                        val bytes=ctx.contentResolver.openInputStream(uri)?.use{it.readBytes()}
                            ?: throw IllegalStateException("Файл недоступен")
                        if(bytes.isEmpty()||bytes.size>8*1024*1024)
                            throw IllegalArgumentException("Размер каждого файла: от 1 байта до 8 МБ.")
                        TaskAiFile(name,ctx.contentResolver.getType(uri)
                            ?: "application/octet-stream",bytes)
                    }
                }
                if(files.size+loaded.size>3)
                    attachmentError="Можно прикрепить не более трёх файлов."
                else files.addAll(loaded)
            }catch(e:Throwable){
                attachmentError=e.message?:"Не удалось прикрепить файл"
            }finally{attaching=false}
        }
    }
    fun sendMessage(){
        if(busy||attaching||(draft.isBlank()&&files.isEmpty()))return
        val question=draft.trim().ifBlank{
            "Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов."
        }
        val outgoing=serializeTaskAiReply(question,reply)
        val fileNames=files.map{it.name}
        val display=serializeTaskAiReply(if(fileNames.isEmpty())question else
            question+"\n\n📎 Файлы: "+fileNames.joinToString(", "),reply)
        val id=if(pendingRetry&&sendingQuestion==outgoing) sendingId
            ?:UUID.randomUUID().toString() else UUID.randomUUID().toString()
        sendingId=id
        sendingQuestion=outgoing
        sendingDisplay=display
        pendingRetry=false
        vm.sendTaskAi(task.id,id,outgoing,model,files.toList(),
            userMessage=display){
            draft=""
            files.clear()
            reply=null
            sendingId=null
            sendingQuestion=null
            sendingDisplay=null
            pendingRetry=false
        }
    }
    LaunchedEffect(ui.busy,ui.error,ui.taskId){
        if(!ui.busy&&ui.error!=null&&ui.taskId==task.id)pendingRetry=true
    }
    LaunchedEffect(messages.size,busy,sendingDisplay){
        val size=messages.size+if(busy&&sendingDisplay!=null)1 else 0
        if(size>0)listState.animateScrollToItem(size-1)
    }

    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxSize().padding(top=12.dp)
            .imePadding(),color=c.bg,
            shape=RoundedCornerShape(topStart=24.dp,topEnd=24.dp),
            border=BorderStroke(1.dp,c.accent.copy(alpha=.32f))){
            Column(Modifier.fillMaxSize()){
                Row(Modifier.fillMaxWidth().background(c.panel)
                    .padding(horizontal=13.dp,vertical=11.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(9.dp)){
                    Box(Modifier.size(39.dp).clip(CircleShape)
                        .background(c.accent.copy(alpha=.16f)),
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.SmartToy,null,tint=c.accent,
                            modifier=Modifier.size(23.dp))
                    }
                    Column(Modifier.weight(1f)){
                        Text("Помощь ИИ",fontWeight=FontWeight.Bold,
                            color=c.text,fontSize=17.sp)
                        Text(task.title,color=c.secondary,fontSize=11.sp,
                            maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                    IconButton(onClick={vm.syncTaskAiHistory(task.id)},
                        modifier=Modifier.size(34.dp)){
                        Icon(Icons.Default.Refresh,"Обновить чат",tint=c.secondary,
                            modifier=Modifier.size(19.dp))
                    }
                    IconButton(onClick=onClose,modifier=Modifier.size(34.dp)){
                        Icon(Icons.Default.Close,"Закрыть чат",tint=c.text,
                            modifier=Modifier.size(21.dp))
                    }
                }
                Box(Modifier.fillMaxWidth().background(c.panel)
                    .padding(start=62.dp,end=14.dp,bottom=10.dp)){
                    Row(Modifier.clip(RoundedCornerShape(10.dp))
                        .background(c.bg).border(1.dp,c.border,RoundedCornerShape(10.dp))
                        .clickable {modelMenu=true}
                        .padding(horizontal=10.dp,vertical=7.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        Text(modelOptions.firstOrNull{it.first==model}?.second?:model,
                            color=c.text,fontSize=11.sp,fontWeight=FontWeight.SemiBold)
                        Spacer(Modifier.width(5.dp))
                        Icon(Icons.Default.ExpandMore,null,
                            modifier=Modifier.size(16.dp),tint=c.secondary)
                    }
                    DropdownMenu(expanded=modelMenu,onDismissRequest={modelMenu=false}){
                        modelOptions.forEach{(key,title)->
                            DropdownMenuItem(
                                text={Text(title)},
                                onClick={model=key;modelMenu=false},
                                trailingIcon=if(model==key){{Icon(Icons.Default.Check,null)}}
                                    else null
                            )
                        }
                    }
                }
                HorizontalDivider(color=c.border)
                Box(Modifier.weight(1f)){
                    if(ui.taskId==task.id && ui.loading){
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }else if(messages.isEmpty()&&!busy){
                        Column(Modifier.align(Alignment.Center).padding(25.dp),
                            horizontalAlignment=Alignment.CenterHorizontally,
                            verticalArrangement=Arrangement.spacedBy(12.dp)){
                            Icon(Icons.Default.AutoAwesome,null,tint=c.accent,
                                modifier=Modifier.size(42.dp))
                            Text("Начните разговор о задаче",
                                color=c.text,fontWeight=FontWeight.Bold)
                            Text("ИИ видит контекст задачи и может помогать с её выполнением.",
                                color=c.secondary,fontSize=12.sp,
                                textAlign=androidx.compose.ui.text.style.TextAlign.Center)
                        }
                    }
                    LazyColumn(state=listState,modifier=Modifier.fillMaxSize(),
                        contentPadding=PaddingValues(horizontal=12.dp,vertical=12.dp),
                        verticalArrangement=Arrangement.spacedBy(12.dp)){
                        items(messages,key={m->m.id?:"\${m.role}-\${messages.indexOf(m)}"}){
                            message-> TaskChatBubble(message,c,ctx,
                                onReply={reply=ReplyTarget(message.id.orEmpty(),
                                    message.role,message.content)})
                        }
                        if(busy&&sendingDisplay!=null)item(key="pending-user"){
                            TaskChatBubble(TaskAiChatMessage(role="user",
                                content=sendingDisplay.orEmpty()),c,ctx,
                                onReply={},pending=true)
                        }
                        if(busy)item(key="assistant-thinking"){
                            Row(verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                CircularProgressIndicator(
                                    modifier=Modifier.size(17.dp),strokeWidth=2.dp,
                                    color=c.accent)
                                Text("ИИ обрабатывает запрос…",color=c.secondary,
                                    fontSize=12.sp)
                            }
                        }
                    }
                }
                HorizontalDivider(color=c.border)
                Column(Modifier.fillMaxWidth().background(c.panel)
                    .padding(start=12.dp,end=12.dp,top=8.dp,bottom=10.dp),
                    verticalArrangement=Arrangement.spacedBy(7.dp)){
                    if(reply!=null){
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp))
                            .background(c.accent.copy(alpha=.11f)).padding(9.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.Reply,null,tint=c.accent,
                                modifier=Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(messageDisplayContent(reply!!.content),
                                Modifier.weight(1f),color=c.secondary,maxLines=2,
                                overflow=TextOverflow.Ellipsis,fontSize=11.sp)
                            IconButton(onClick={reply=null},
                                modifier=Modifier.size(25.dp)){
                                Icon(Icons.Default.Close,"Отменить ответ",
                                    tint=c.secondary,modifier=Modifier.size(15.dp))
                            }
                        }
                    }
                    if(files.isNotEmpty()){
                        Row(Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            files.toList().forEach{file->
                                Row(Modifier.clip(CircleShape)
                                    .background(c.accent.copy(alpha=.12f))
                                    .padding(start=9.dp,end=3.dp,top=3.dp,bottom=3.dp),
                                    verticalAlignment=Alignment.CenterVertically){
                                    Icon(Icons.Default.AttachFile,null,
                                        modifier=Modifier.size(14.dp),tint=c.accent)
                                    Text(file.name,color=c.text,fontSize=10.sp,maxLines=1,
                                        modifier=Modifier.widthIn(max=110.dp))
                                    IconButton(onClick={files.remove(file)},
                                        enabled=!busy,modifier=Modifier.size(23.dp)){
                                        Icon(Icons.Default.Close,"Убрать файл",
                                            modifier=Modifier.size(12.dp),tint=c.secondary)
                                    }
                                }
                            }
                        }
                    }
                    (attachmentError?:error)?.let{message->
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Text(message,Modifier.weight(1f),fontSize=11.sp,
                                color=Color(0xFFFB7185),maxLines=4)
                            IconButton(onClick={
                                attachmentError=null;vm.clearTaskAiError()
                            },modifier=Modifier.size(26.dp)){
                                Icon(Icons.Default.Close,null,tint=c.secondary,
                                    modifier=Modifier.size(14.dp))
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
                        .background(c.bg).border(1.dp,c.border,RoundedCornerShape(20.dp))
                        .padding(start=5.dp,end=7.dp,top=5.dp,bottom=5.dp),
                        verticalAlignment=Alignment.Bottom,
                        horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        IconButton(onClick={picker.launch(arrayOf("*/*"))},
                            enabled=!busy&&!attaching,modifier=Modifier.size(38.dp)){
                            Icon(Icons.Default.AttachFile,"Прикрепить файл",
                                tint=c.accent,modifier=Modifier.size(21.dp))
                        }
                        BasicTextField(value=draft,onValueChange={
                            draft=it;pendingRetry=false
                        },modifier=Modifier.weight(1f).heightIn(min=38.dp,max=142.dp)
                            .padding(vertical=9.dp),
                            textStyle=TextStyle(color=c.text,fontSize=14.sp,lineHeight=20.sp),
                            maxLines=6,enabled=!busy,cursorBrush=SolidColor(c.accent),
                            decorationBox={inner->
                                Box{
                                    if(draft.isEmpty())Text("Сообщение ИИ…",
                                        color=c.secondary,fontSize=14.sp)
                                    inner()
                                }
                            })
                        Box(Modifier.size(38.dp).clip(CircleShape)
                            .background(if(!busy&&(draft.isNotBlank()||files.isNotEmpty()))
                                c.accent else c.border)
                            .clickable(enabled=!busy&&!attaching&&
                                (draft.isNotBlank()||files.isNotEmpty())){sendMessage()},
                            contentAlignment=Alignment.Center){
                            if(busy)CircularProgressIndicator(Modifier.size(18.dp),
                                strokeWidth=2.dp,color=c.text)
                            else Icon(Icons.Default.ArrowUpward,"Отправить",
                                tint=if(dark)Color(0xFF1A1633) else Color.White,
                                modifier=Modifier.size(20.dp))
                        }
                    }
                    if(pendingRetry && !busy){
                        Text("Ответ мог сохраниться на сервере. При повторе используется тот же ID запроса.",
                            color=c.secondary,fontSize=10.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun TaskChatBubble(message:TaskAiChatMessage,c:TaskChatColors,
    context:Context,onReply:()->Unit,pending:Boolean=false){
    val isUser=message.role=="user"
    val content=messageDisplayContent(message.content)
    Row(Modifier.fillMaxWidth(),
        horizontalArrangement=if(isUser)Arrangement.End else Arrangement.Start){
        Column(Modifier.widthIn(max=330.dp).fillMaxWidth(.89f),
            horizontalAlignment=if(isUser)Alignment.End else Alignment.Start,
            verticalArrangement=Arrangement.spacedBy(3.dp)){
            Surface(shape=RoundedCornerShape(
                topStart=19.dp,topEnd=19.dp,
                bottomEnd=if(isUser)7.dp else 19.dp,
                bottomStart=if(isUser)19.dp else 7.dp),
                color=if(isUser)c.user else c.assistant,
                border=BorderStroke(1.dp,
                    if(isUser)c.accent.copy(alpha=.36f)else c.border)){
                Column(Modifier.padding(12.dp),
                    verticalArrangement=Arrangement.spacedBy(7.dp)){
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                        verticalAlignment=Alignment.CenterVertically){
                        Text(message.authorName ?: if(isUser)"Вы" else "ИИ",
                            color=if(isUser && !c.user.isDarkColor())Color(0xFF5B21B6)
                                else c.accent,
                            fontSize=10.sp,fontWeight=FontWeight.Bold)
                        if(pending)Text("Отправляется…",color=c.secondary,fontSize=9.sp)
                        else IconButton(onClick={
                            val clipboard=context.getSystemService(
                                Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Чат Планировыч",content))
                            Toast.makeText(context,"Скопировано",Toast.LENGTH_SHORT).show()
                        },modifier=Modifier.size(25.dp)){
                            Icon(Icons.Default.ContentCopy,"Копировать",
                                tint=c.secondary,modifier=Modifier.size(14.dp))
                        }
                    }
                    Text(content,color=c.text,fontSize=13.sp,lineHeight=20.sp)
                    if(message.messageKind=="MONITOR_ACTION"){
                        Text("Действие автомониторинга",color=c.secondary,fontSize=10.sp)
                    }
                    message.webSources.take(5).forEach{(title,url)->
                        Row(Modifier.fillMaxWidth().clickable{
                            runCatching{context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
                        },verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.OpenInNew,null,tint=c.accent,
                                modifier=Modifier.size(12.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(title,color=c.accent,maxLines=1,
                                overflow=TextOverflow.Ellipsis,fontSize=11.sp)
                        }
                    }
                    if(message.taskProposal!=null)
                        Text("ИИ предложил изменения задачи. Для подтверждения откройте чат на сайте.",
                            fontSize=11.sp,color=c.secondary)
                    if(message.generatedDocument!=null)
                        Text("ИИ создал документ, доступный в чате на сайте.",
                            fontSize=11.sp,color=c.secondary)
                    if(message.telegramSendDraft!=null||message.telegramReadDraft!=null)
                        Text("Подтверждение действий Telegram доступно в Mini App.",
                            fontSize=11.sp,color=c.secondary)
                    message.creditsSpentMilli?.takeIf{it>0}?.let{
                        Text("ИИ-кредиты: "+String.format(Locale.US,"%.3f",it/1000.0),
                            color=c.secondary,fontSize=9.sp)
                    }
                }
            }
            if(!pending)IconButton(onClick=onReply,modifier=Modifier.size(28.dp)){
                Icon(Icons.Default.Reply,"Ответить на сообщение",
                    tint=c.secondary,modifier=Modifier.size(16.dp))
            }
        }
    }
}
private fun Color.isDarkColor():Boolean =
    (red*.299f+green*.587f+blue*.114f)<.52f
