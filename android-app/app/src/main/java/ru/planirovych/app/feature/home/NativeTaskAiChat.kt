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
import androidx.compose.ui.geometry.Offset
import androidx.compose.foundation.Canvas
import androidx.compose.ui.graphics.StrokeCap
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

private data class TaskChatColors(
    val bg:Color,val panel:Color,val text:Color,val secondary:Color,
    val border:Color,val user:Color,val userEnd:Color,val userText:Color,
    val assistant:Color,val assistantText:Color,val accent:Color
)
private fun chatColors(dark:Boolean)=if(dark)TaskChatColors(
    // Mini App: dark slate thread, dark header, indigo-blue user messages
    Color(0xFF0D1628),Color(0xFF0B1222),Color(0xFFE2E8F0),
    Color(0xFF94A3B8),Color(0xFF364358),
    Color(0xFF1E3A8A),Color(0xFF312E81),Color(0xFFF8FAFC),
    Color(0xFF1E293B),Color(0xFFF1F5F9),Color(0xFFC4B5FD)
) else TaskChatColors(
    // Mini App: white header, pale thread, blue user, cyan AI responses
    Color(0xFFF8FAFC),Color.White,Color(0xFF172033),
    Color(0xFF64748B),Color(0xFFDBE3EF),
    Color(0xFF2563EB),Color(0xFF4F46E5),Color.White,
    Color(0xFFCFFAFE),Color(0xFF164E63),Color(0xFF6D28D9)
)

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
    val triggers=if(ui.taskId==task.id && task.aiMonitoringEnabled)
        ui.monitoringTriggers else emptyList()
    val monitoringStatuses=if(ui.taskId==task.id)
        ui.monitoringStatuses else emptyList()
    var monitoringPanelOpen by remember(task.id){mutableStateOf(false)}
    var currentTime by remember(task.id){mutableLongStateOf(System.currentTimeMillis())}
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
    LaunchedEffect(task.id){
        while(isActive){
            vm.refreshTaskAiMonitoring(task.id)
            currentTime=System.currentTimeMillis()
            delay(30_000)
        }
    }
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
    // The existing history must appear at its last message immediately.
    // Do not animate through the entire transcript on first opening.
    var historyPositioned by remember(task.id){mutableStateOf(false)}
    var lastItemCount by remember(task.id){mutableIntStateOf(0)}
    LaunchedEffect(task.id,ui.taskId,ui.loading,messages.size,busy,sendingDisplay,
        monitoringStatuses.size,triggers.size,ui.lastActionReports.size){
        if(ui.taskId!=task.id || ui.loading)return@LaunchedEffect
        val currentCount=messages.size+
            (if(ui.lastActionReports.isNotEmpty())1 else 0)+
            (if(monitoringStatuses.isNotEmpty())1 else 0)+
            (if(triggers.isNotEmpty())1 else 0)+
            (if(busy&&sendingDisplay!=null)1 else 0)+(if(busy)1 else 0)
        if(!historyPositioned){
            if(currentCount>0)listState.scrollToItem(currentCount-1)
            historyPositioned=true
        }else if(currentCount>lastItemCount && currentCount>0){
            val lastVisible=listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
            val nearBottom=lastVisible >= (lastItemCount-2).coerceAtLeast(0)
            if(busy || nearBottom)listState.scrollToItem(currentCount-1)
        }
        lastItemCount=currentCount
    }

    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxSize().imePadding(),color=c.bg,
            shape=RoundedCornerShape(0.dp)){
            Column(Modifier.fillMaxSize()){
                Row(Modifier.fillMaxWidth().background(c.panel)
                    .heightIn(min=58.dp)
                    .padding(horizontal=11.dp,vertical=8.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    Box(Modifier.size(32.dp).clip(CircleShape)
                        .background(c.accent.copy(alpha=.12f)),
                        contentAlignment=Alignment.Center){
                        Icon(Icons.Default.SmartToy,null,tint=c.accent,
                            modifier=Modifier.size(19.dp))
                    }
                    Column(Modifier.weight(1f),
                        verticalArrangement=Arrangement.spacedBy(1.dp)){
                        Text("Помощь ИИ",fontWeight=FontWeight.Bold,
                            color=c.text,fontSize=16.sp,maxLines=1)
                        Text(task.title,color=c.secondary,fontSize=10.sp,
                            maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                    Box {
                        Row(Modifier.clip(RoundedCornerShape(11.dp))
                            .background(c.bg)
                            .border(1.dp,c.border,RoundedCornerShape(11.dp))
                            .clickable {modelMenu=true}
                            .padding(horizontal=8.dp,vertical=8.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(3.dp)){
                            Text(when(model){
                                "gpt-6-luna" -> "Luna"
                                "gpt-5.4-mini" -> "Mini"
                                else -> "Sol"
                            },color=c.text,fontSize=11.sp,fontWeight=FontWeight.SemiBold)
                            Icon(Icons.Default.ExpandMore,null,
                                modifier=Modifier.size(15.dp),tint=c.secondary)
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
                    if(task.taskType==TaskType.TASK && task.parentTaskId==null){
                        IconButton(onClick={
                            vm.refreshTaskAiMonitoring(task.id)
                            monitoringPanelOpen=true
                        },modifier=Modifier.size(29.dp)){
                            Icon(Icons.Default.Radar,"Автомониторинг и статусы",
                                tint=if(task.aiMonitoringEnabled)c.accent else c.secondary,
                                modifier=Modifier.size(17.dp))
                        }
                    }
                    IconButton(onClick={vm.syncTaskAiHistory(task.id)},
                        modifier=Modifier.size(30.dp)){
                        Icon(Icons.Default.Refresh,"Обновить чат",tint=c.secondary,
                            modifier=Modifier.size(17.dp))
                    }
                    IconButton(onClick=onClose,modifier=Modifier.size(30.dp)){
                        Icon(Icons.Default.Close,"Закрыть чат",tint=c.text,
                            modifier=Modifier.size(20.dp))
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
                    LazyColumn(state=listState,
                        modifier=Modifier.fillMaxSize().alpha(if(historyPositioned)1f else 0f),
                        contentPadding=PaddingValues(horizontal=12.dp,vertical=12.dp),
                        verticalArrangement=Arrangement.spacedBy(12.dp)){
                        items(messages,key={m->m.id?:m.role+"-"+messages.indexOf(m)}){
                            message->
                            if(message.messageKind=="MONITOR_ACTION"){
                                NativeMonitoringActionPill(message.content,c)
                            }else TaskChatBubble(message,c,ctx,
                                onReply={reply=ReplyTarget(message.id.orEmpty(),
                                    message.role,message.content)},
                                onProposalAction={id,action->
                                    vm.applyTaskAiProposal(task.id,id,action)
                                },
                                actionBusy=ui.actionBusy,
                                onOpenDocument={id->vm.getTaskAiDocumentLink(id){url->
                                    val parsed=Uri.parse(url)
                                    if(parsed.scheme=="https"||parsed.scheme=="http")
                                        runCatching{ctx.startActivity(
                                            Intent(Intent.ACTION_VIEW,parsed))}
                                }})
                        }
                        if(ui.lastActionReports.isNotEmpty())item(key="ai-last-actions"){
                            Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
                                ui.lastActionReports.forEach{report->
                                    NativeMonitoringActionPill(report,c)
                                }
                            }
                        }
                        if(monitoringStatuses.isNotEmpty())item(key="monitoring-status-cards"){
                            NativeMonitoringStatusChips(monitoringStatuses,c)
                        }
                        if(triggers.isNotEmpty())item(key="monitoring-active-triggers"){
                            NativeMonitoringTriggerChips(triggers,currentTime,c)
                        }
                        if(busy&&sendingDisplay!=null)item(key="pending-user"){
                            TaskChatBubble(TaskAiChatMessage(role="user",
                                content=sendingDisplay.orEmpty()),c,ctx,
                                onReply={},pending=true)
                        }
                        if(busy)item(key="assistant-thinking"){
                            NativeTaskAiProgressChip(ui.progressStatus?:"analyzing_request",c)
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
                        BasicTextField(value=draft,onValueChange={
                            draft=it;pendingRetry=false
                        },modifier=Modifier.weight(1f).heightIn(min=42.dp,max=142.dp),
                            textStyle=TextStyle(color=c.text,fontSize=14.sp,lineHeight=20.sp),
                            maxLines=6,enabled=!busy,cursorBrush=SolidColor(c.accent),
                            decorationBox={inner->
                                Box(Modifier.fillMaxWidth()
                                    .defaultMinSize(minHeight=42.dp)
                                    .padding(horizontal=11.dp,vertical=8.dp),
                                    contentAlignment=Alignment.CenterStart){
                                    if(draft.isEmpty())Text("Сообщение ИИ…",
                                        color=c.secondary,fontSize=14.sp,lineHeight=20.sp)
                                    inner()
                                }
                            })
                        IconButton(onClick={picker.launch(arrayOf("*/*"))},
                            enabled=!busy&&!attaching,
                            modifier=Modifier.size(38.dp).clip(CircleShape)
                                .background(c.accent.copy(alpha=.11f))){
                            Icon(Icons.Default.AttachFile,"Прикрепить файл",
                                tint=c.accent,modifier=Modifier.size(19.dp))
                        }
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
    if(monitoringPanelOpen){
        AlertDialog(onDismissRequest={monitoringPanelOpen=false},
            containerColor=c.panel,
            title={Text("Автомониторинг",color=c.text,fontWeight=FontWeight.Bold)},
            text={
                Column(Modifier.heightIn(max=430.dp)
                    .verticalScroll(rememberScrollState()),
                    verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Text(if(task.aiMonitoringEnabled)
                        "Автомониторинг задачи включён"
                        else "Автомониторинг задачи выключен",
                        color=c.secondary,fontSize=12.sp)
                    if(monitoringStatuses.isEmpty())Text("Пока нет статусов.",
                        color=c.secondary,fontSize=12.sp)
                    monitoringStatuses.forEach{status->
                        Column(Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(c.bg).padding(11.dp)){
                            Text(status.label,color=c.text,
                                fontSize=12.sp,fontWeight=FontWeight.SemiBold)
                            status.detail?.takeIf{it.isNotBlank()}?.let{
                                Text(it,color=c.secondary,fontSize=11.sp)
                            }
                            status.createdAt?.let{
                                Text(it.take(16).replace('T',' '),
                                    color=c.secondary,fontSize=10.sp)
                            }
                        }
                    }
                }
            },
            confirmButton={TextButton(onClick={monitoringPanelOpen=false}){
                Text("Закрыть")
            }})
    }
}

@Composable
private fun TaskChatBubble(message:TaskAiChatMessage,c:TaskChatColors,
    context:Context,onReply:()->Unit,pending:Boolean=false,
    onProposalAction:(String,String)->Unit={_,_->},
    actionBusy:Boolean=false,
    onOpenDocument:(String)->Unit={}){
    val isUser=message.role=="user"
    val content=messageDisplayContent(message.content)
    Row(Modifier.fillMaxWidth(),
        horizontalArrangement=if(isUser)Arrangement.End else Arrangement.Start){
        Column(Modifier.widthIn(max=330.dp).fillMaxWidth(.89f),
            horizontalAlignment=if(isUser)Alignment.End else Alignment.Start,
            verticalArrangement=Arrangement.spacedBy(3.dp)){
            val bubbleShape=RoundedCornerShape(
                topStart=22.dp,topEnd=22.dp,
                bottomEnd=if(isUser)8.dp else 22.dp,
                bottomStart=if(isUser)22.dp else 8.dp)
            // Mini App has filled bubbles; neither messages nor the dialog
            // have violet outlines. Only action/monitor chips keep soft edges.
            Column(Modifier.fillMaxWidth().clip(bubbleShape).background(
                    brush=if(isUser)Brush.linearGradient(listOf(c.user,c.userEnd))
                        else Brush.linearGradient(listOf(c.assistant,c.assistant))
                ).padding(horizontal=14.dp,vertical=12.dp),
                verticalArrangement=Arrangement.spacedBy(7.dp)){
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                        verticalAlignment=Alignment.CenterVertically){
                        Text(message.authorName ?: if(isUser)"Вы" else "ИИ",
                            color=if(isUser)c.userText.copy(alpha=.93f)
                                else c.assistantText.copy(alpha=.88f),
                            fontSize=12.sp,fontWeight=FontWeight.Bold)
                        if(pending)Text("Отправляется…",
                            color=if(isUser)c.userText.copy(alpha=.7f)else c.secondary,
                            fontSize=9.sp)
                        else IconButton(onClick={
                            val clipboard=context.getSystemService(
                                Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Чат Планировыч",content))
                            Toast.makeText(context,"Скопировано",Toast.LENGTH_SHORT).show()
                        },modifier=Modifier.size(25.dp)){
                            Icon(Icons.Default.ContentCopy,"Копировать",
                                tint=if(isUser)c.userText.copy(alpha=.76f)
                                    else c.secondary,modifier=Modifier.size(14.dp))
                        }
                    }
                    if(!isUser) NativeAiFormattedMessage(
                        text=content,textColor=c.assistantText,
                        linkColor=if(c.bg.red>.5f)Color(0xFF0369A1) else Color(0xFF67E8F9))
                    else Text(content,color=c.userText,fontSize=13.sp,lineHeight=20.sp)
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
                    message.taskProposal?.let{proposal->
                        NativeAiProposalReview(proposal,c,actionBusy,onProposalAction)
                    }
                    message.generatedDocument?.let{doc->
                        val id=(doc["id"] as? JsonPrimitive)?.contentOrNull
                        val fileName=(doc["fileName"] as? JsonPrimitive)?.contentOrNull
                            ?: "Документ ИИ"
                        if(id!=null){
                            OutlinedButton(onClick={onOpenDocument(id)},
                                shape=RoundedCornerShape(10.dp)){
                                Icon(Icons.Default.FileDownload,null,
                                    modifier=Modifier.size(15.dp))
                                Spacer(Modifier.width(5.dp))
                                Text(fileName,fontSize=11.sp,maxLines=1)
                            }
                        }
                    }
                    if(message.telegramSendDraft!=null||message.telegramReadDraft!=null)
                        Text("Подтверждение действий Telegram доступно в Mini App.",
                            fontSize=11.sp,color=c.secondary)
                    message.creditsSpentMilli?.takeIf{it>0}?.let{
                        Text("ИИ-кредиты: "+String.format(Locale.US,"%.3f",it/1000.0),
                            color=c.secondary,fontSize=9.sp)
                    }
                }
            if(!pending){
                Row(Modifier.padding(top=5.dp),
                    horizontalArrangement=Arrangement.spacedBy(13.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Row(Modifier.clip(CircleShape).clickable(onClick=onReply)
                        .padding(horizontal=3.dp,vertical=4.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        TaskChatThinArrow(color=c.secondary,forward=false)
                        Spacer(Modifier.width(4.dp))
                        Text("Ответить",fontSize=10.sp,color=c.secondary)
                    }
                    Row(Modifier.clip(CircleShape).clickable {
                        val share=Intent(Intent.ACTION_SEND).apply{
                            type="text/plain"
                            putExtra(Intent.EXTRA_TEXT,content)
                        }
                        runCatching{context.startActivity(
                            Intent.createChooser(share,"Переслать сообщение"))}
                    }.padding(horizontal=3.dp,vertical=4.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        TaskChatThinArrow(color=c.secondary,forward=true)
                        Spacer(Modifier.width(4.dp))
                        Text("Переслать",fontSize=10.sp,color=c.secondary)
                    }
                }
            }
        }
    }
}
private fun Color.isDarkColor():Boolean =
    (red*.299f+green*.587f+blue*.114f)<.52f

@Composable
private fun NativeAiProposalReview(
    proposal:JsonObject,c:TaskChatColors,busy:Boolean,
    onAction:(String,String)->Unit
){
    val id=(proposal["id"] as? JsonPrimitive)?.contentOrNull ?: return
    val status=(proposal["status"] as? JsonPrimitive)?.contentOrNull ?: "PENDING"
    val operations=(proposal["operations"] as? JsonArray).orEmpty()
    var confirm by remember(id){mutableStateOf<String?>(null)}
    Surface(shape=RoundedCornerShape(13.dp),color=c.panel,
        border=BorderStroke(1.dp,c.accent.copy(alpha=.4f))){
        Column(Modifier.fillMaxWidth().padding(10.dp),
            verticalArrangement=Arrangement.spacedBy(7.dp)){
            Row(verticalAlignment=Alignment.CenterVertically){
                Icon(Icons.Default.AutoAwesome,null,tint=c.accent,
                    modifier=Modifier.size(17.dp))
                Spacer(Modifier.width(7.dp))
                Text("Предложение ИИ · "+status,
                    color=c.text,fontSize=12.sp,fontWeight=FontWeight.Bold)
            }
            operations.take(6).forEachIndexed{index,item->
                val obj=item as? JsonObject
                val title=(obj?.get("title") as? JsonPrimitive)?.contentOrNull
                    ?: (obj?.get("type") as? JsonPrimitive)?.contentOrNull
                    ?: "Изменение"
                Text("${index+1}. "+title,color=c.secondary,fontSize=11.sp,maxLines=2)
            }
            if(operations.size>6)Text("И ещё "+(operations.size-6),
                color=c.secondary,fontSize=11.sp)
            when(status){
                "PENDING"->Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    Button(onClick={confirm="approve"},enabled=!busy,
                        contentPadding=PaddingValues(horizontal=10.dp,vertical=5.dp),
                        shape=RoundedCornerShape(10.dp)){
                        Text("Применить",fontSize=11.sp)
                    }
                    OutlinedButton(onClick={confirm="reject"},enabled=!busy,
                        contentPadding=PaddingValues(horizontal=10.dp,vertical=5.dp),
                        shape=RoundedCornerShape(10.dp)){
                        Text("Отклонить",fontSize=11.sp)
                    }
                }
                "APPLIED"->OutlinedButton(onClick={confirm="undo"},enabled=!busy,
                    shape=RoundedCornerShape(10.dp)){
                    Text("Отменить изменения",fontSize=11.sp)
                }
            }
        }
    }
    confirm?.let{action->
        AlertDialog(onDismissRequest={confirm=null},
            title={Text(when(action){
                "approve"->"Применить изменения ИИ?"
                "reject"->"Отклонить предложение?"
                else->"Отменить изменения ИИ?"
            })},
            text={Text(if(action=="approve")
                "Вы подтверждаете применение ${operations.size} предложенных изменений."
                else "Действие будет отправлено на сервер Планировыча.")},
            confirmButton={
                TextButton(onClick={
                    confirm=null
                    onAction(id,action)
                }){Text("Подтвердить")}
            },
            dismissButton={TextButton(onClick={confirm=null}){Text("Отмена")}})
    }
}

@Composable
private fun TaskChatThinArrow(color:Color,forward:Boolean){
    // Deliberately thin 1.4dp stroke, like the Mini App's Lucide reply/share
    // actions. No filled icon button or circular outline.
    Canvas(Modifier.size(16.dp)){
        val direction=if(forward)1f else -1f
        val tip=if(forward).82f else .18f
        val body=if(forward).54f else .46f
        val center=.51f
        val stroke=1.4.dp.toPx()
        drawLine(color,Offset(tip*size.width,center*size.height),
            Offset(body*size.width,.23f*size.height),
            strokeWidth=stroke,cap=StrokeCap.Round)
        drawLine(color,Offset(tip*size.width,center*size.height),
            Offset(body*size.width,.79f*size.height),
            strokeWidth=stroke,cap=StrokeCap.Round)
        drawLine(color,Offset(tip*size.width,center*size.height),
            Offset((.18f+(.64f)*(1-direction)/2f)*size.width,
                center*size.height),
            strokeWidth=stroke,cap=StrokeCap.Round)
    }
}

private val TASK_AI_PROGRESS_LABELS=mapOf(
    "analyzing_request" to "Анализирую запрос",
    "using_chat_history" to "Учитываю историю диалога",
    "searching_subtasks" to "Ищу нужную подзадачу",
    "analyzing_subtasks" to "Анализирую подзадачи",
    "reading_subtask" to "Изучаю детали подзадачи",
    "searching_files" to "Ищу нужный файл",
    "reading_file" to "Изучаю содержимое файла",
    "reading_attachment" to "Изучаю вложение",
    "searching_tasks" to "Ищу задачи",
    "listing_tasks" to "Собираю список задач",
    "reading_task" to "Изучаю задачу",
    "searching_web" to "Ищу в интернете",
    "analyzing_web_results" to "Изучаю найденные источники",
    "analyzing_retrieved_context" to "Анализирую найденные данные",
    "forming_answer" to "Формирую ответ",
    "applying_changes" to "Вношу изменения",
    "generating_image" to "Создаю изображение",
    "editing_image" to "Редактирую изображение",
    "editing_document" to "Редактирую документ"
)

@Composable
private fun NativeTaskAiProgressChip(status:String,c:TaskChatColors){
    val title=TASK_AI_PROGRESS_LABELS[status] ?: "Обрабатываю запрос"
    Row(Modifier.fillMaxWidth().padding(vertical=5.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(8.dp)){
        Box(Modifier.size(26.dp).clip(CircleShape)
            .background(c.accent.copy(alpha=.1f)),
            contentAlignment=Alignment.Center){
            Icon(Icons.Default.AutoAwesome,null,
                tint=c.accent,modifier=Modifier.size(14.dp))
        }
        Column(verticalArrangement=Arrangement.spacedBy(3.dp)){
            Text(title,color=c.text,fontSize=12.sp,
                fontWeight=FontWeight.SemiBold)
            LinearProgressIndicator(
                modifier=Modifier.width(86.dp).height(2.dp),
                color=c.accent,trackColor=c.border)
        }
    }
}

@Composable
private fun NativeMonitoringActionPill(content:String,c:TaskChatColors){
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Start){
        Row(Modifier.widthIn(max=330.dp)
            .clip(RoundedCornerShape(13.dp))
            .background(c.accent.copy(alpha=.09f))
            .border(1.dp,c.accent.copy(alpha=.2f),RoundedCornerShape(13.dp))
            .padding(horizontal=11.dp,vertical=9.dp),
            verticalAlignment=Alignment.Top,
            horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Icon(Icons.Default.AutoAwesome,null,tint=c.accent,
                modifier=Modifier.size(15.dp))
            Column(verticalArrangement=Arrangement.spacedBy(2.dp)){
                Text("Действие ИИ",color=c.accent,fontWeight=FontWeight.Bold,
                    fontSize=10.sp)
                Text(content,color=c.text,fontSize=12.sp,lineHeight=17.sp)
            }
        }
    }
}
@Composable
private fun NativeMonitoringStatusChips(
    statuses:List<TaskMonitoringStatus>,c:TaskChatColors
){
    Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
        statuses.sortedByDescending{it.createdAt.orEmpty()}.take(3).forEach{status->
            Row(Modifier.fillMaxWidth(),
                horizontalArrangement=Arrangement.Start){
                Row(Modifier.widthIn(max=335.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(c.accent.copy(alpha=.08f))
                    .border(1.dp,c.accent.copy(alpha=.17f),
                        RoundedCornerShape(13.dp))
                    .padding(horizontal=11.dp,vertical=8.dp),
                    verticalAlignment=Alignment.Top,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Icon(Icons.Default.CheckCircleOutline,null,
                        tint=c.accent,modifier=Modifier.size(15.dp))
                    Column(verticalArrangement=Arrangement.spacedBy(2.dp)){
                        Text(status.label,color=c.text,fontSize=12.sp,
                            fontWeight=FontWeight.SemiBold)
                        status.detail?.takeIf{it.isNotBlank()}?.let{
                            Text(it,color=c.secondary,fontSize=11.sp,maxLines=4)
                        }
                    }
                }
            }
        }
    }
}
@Composable
private fun NativeMonitoringTriggerChips(
    triggers:List<TaskMonitoringTrigger>,now:Long,c:TaskChatColors
){
    Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
        triggers.forEach{trigger->
            val due=runCatching{
                java.time.Instant.parse(trigger.dueAt).toEpochMilli()
            }.recoverCatching {
                java.time.OffsetDateTime.parse(trigger.dueAt).toInstant().toEpochMilli()
            }.getOrDefault(now)
            val seconds=((due-now+999)/1000).coerceAtLeast(0)
            val timeText=when {
                seconds>=3600->(seconds/3600).toString()+" ч "+
                    ((seconds%3600+59)/60).toString()+" мин"
                seconds>=60->((seconds+59)/60).toString()+" мин"
                else->"скоро"
            }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Start){
                Row(Modifier.clip(CircleShape)
                    .background(c.accent.copy(alpha=.09f))
                    .border(1.dp,c.accent.copy(alpha=.22f),CircleShape)
                    .padding(horizontal=11.dp,vertical=7.dp),
                    horizontalArrangement=Arrangement.spacedBy(6.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Icon(Icons.Default.Schedule,null,tint=c.accent,
                        modifier=Modifier.size(13.dp))
                    Text("Триггер запущен · "+timeText,
                        color=c.accent,fontSize=11.sp,
                        fontWeight=FontWeight.SemiBold,maxLines=1)
                }
            }
        }
    }
}
