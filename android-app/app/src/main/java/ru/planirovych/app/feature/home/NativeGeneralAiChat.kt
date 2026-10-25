package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.*
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID
import ru.planirovych.app.data.model.*

private val GENERAL_PROJECT_COLORS=listOf("#8b5cf6","#06b6d4","#22c55e","#f97316",
    "#ec4899","#6366f1","#14b8a6","#f43f5e")
private val GENERAL_PROJECT_ICONS=listOf("✨","🤖","🧠","🚀","📌","🗂️","💬","⚡","🌙","🎯","🧩","🪄")
private fun nativeProjectColor(value:String):Color=runCatching{
    Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Color(0xFF8B5CF6))

/** Same bubbles, attachment rules, streamed progress and reply format as the task AI chat.
 * The general chat has a separate server project tree and its own sidebar.
 */
@Composable
internal fun NativeGeneralAiChatPage(
    vm:HomeViewModel,userId:String?,dark:Boolean,onExit:()->Unit
){
    val state by vm.generalAi.collectAsStateWithLifecycle()
    val c=remember(dark){chatColors(dark)}
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val listState=rememberLazyListState()
    var menuOpen by remember{mutableStateOf(false)}
    var modelMenu by remember{mutableStateOf(false)}
    var draft by remember{mutableStateOf("")}
    var reply by remember{mutableStateOf<GeneralReply?>(null)}
    val files=remember{mutableStateListOf<TaskAiFile>()}
    var attaching by remember{mutableStateOf(false)}
    var attachError by remember{mutableStateOf<String?>(null)}
    var historyPositioned by remember{mutableStateOf(false)}
    var lastVisibleCount by remember{mutableIntStateOf(0)}
    var composerHeightPx by remember{mutableIntStateOf(0)}
    var headerCollapsed by remember{mutableStateOf(false)}
    var lastRequestId by remember{mutableStateOf<String?>(null)}
    var lastOutgoing by remember{mutableStateOf("")}
    var queuedDraft by remember{mutableStateOf("")}
    var queuedFiles by remember{mutableStateOf<List<TaskAiFile>>(emptyList())}
    var queuedReply by remember{mutableStateOf<GeneralReply?>(null)}
    var lastRequestHadError by remember{mutableStateOf(false)}
    var projectEdit by remember{mutableStateOf<GeneralAiProject?>(null)}
    var projectForm by remember{mutableStateOf(false)}
    var renameTarget by remember{mutableStateOf<GeneralAiThread?>(null)}
    var deleteProject by remember{mutableStateOf<GeneralAiProject?>(null)}
    var deleteThread by remember{mutableStateOf<GeneralAiThread?>(null)}
    val project=state.project
    val thread=state.chat
    val isTelegram=project?.isTelegram==true || thread?.id?.startsWith("telegram-ai-assistant:")==true
    val messages=remember(thread?.id,thread?.messages){
        thread?.messages.orEmpty().map(::generalAiMessage)
    }
    val isBusy=state.busy||state.saving
    val model=thread?.model?:"gpt-6-luna"
    val speechInput=rememberAiChatSpeechInput(
        onRecognized={spoken->
            draft=appendAiDictation(draft,spoken)
            attachError=null
            lastRequestHadError=false
        },
        onError={message->attachError=message}
    )

    LaunchedEffect(userId){vm.loadGeneralAi(userId)}
    LaunchedEffect(project?.id,thread?.id,userId){
        if(userId==null)return@LaunchedEffect
        historyPositioned=false
        headerCollapsed=false
        reply=null
        if(project!=null&&thread!=null){
            vm.syncGeneralAiThread(project.id,thread.id)
            while(isActive){
                delay(4500)
                vm.syncGeneralAiThread(project.id,thread.id)
            }
        }
    }
    LaunchedEffect(thread?.id,messages.size,state.pendingMessage,state.busy){
        val count=messages.size+(if(state.pendingMessage!=null)1 else 0)+
            (if(state.busy)1 else 0)
        if(!historyPositioned){
            if(count>0)listState.scrollToItem(count-1)
            historyPositioned=true
        }else if(count>lastVisibleCount && count>0){
            val last=listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index?:-1
            if(state.busy || last>=lastVisibleCount-2)listState.scrollToItem(count-1)
        }
        lastVisibleCount=count
    }
    LaunchedEffect(thread?.id){
        var previous:Int?=null
        var previousOffset=0
        snapshotFlow{Triple(listState.firstVisibleItemIndex,
            listState.firstVisibleItemScrollOffset,listState.isScrollInProgress)}
            .collect{(index,offset,scrolling)->
                if(previous!=null&&scrolling&&historyPositioned){
                    val delta=if(index==previous)offset-previousOffset
                        else (index-previous!!).coerceIn(-2,2)*40
                    if(delta>22)headerCollapsed=true
                    if(delta< -22)headerCollapsed=false
                }
                previous=index;previousOffset=offset
            }
    }
    LaunchedEffect(state.busy,state.error){
        if(!state.busy&&state.error!=null&&queuedDraft.isNotBlank()){
            if(draft.isBlank())draft=queuedDraft
            if(files.isEmpty())files.addAll(queuedFiles)
            if(reply==null)reply=queuedReply
            lastRequestHadError=true
        }
    }

    val picker=rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ){uris->
        if(uris.isNotEmpty())scope.launch{
            attaching=true;attachError=null
            try{
                val selected=withContext(Dispatchers.IO){
                    uris.map{uri->
                        val name=context.contentResolver.query(uri,
                            arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{
                            if(it.moveToFirst())it.getString(0) else null
                        }?:uri.lastPathSegment?.substringAfterLast('/')?:"Файл"
                        if(!isChatAttachmentAllowed(name))
                            throw IllegalArgumentException("Можно прикреплять PDF, документы и изображения.")
                        val bytes=context.contentResolver.openInputStream(uri)?.use{
                            it.readBytes()
                        }?:throw IllegalArgumentException("Не удалось открыть файл.")
                        if(bytes.isEmpty()||bytes.size>8*1024*1024)
                            throw IllegalArgumentException("Размер файла не должен превышать 8 МБ.")
                        TaskAiFile(name,context.contentResolver.getType(uri)
                            ?:"application/octet-stream",bytes)
                    }
                }
                if(files.size+selected.size>3)attachError="Не больше трёх файлов."
                else files.addAll(selected)
            }catch(t:Throwable){attachError=t.message?:"Ошибка вложения"}
            finally{attaching=false}
        }
    }
    fun send(){
        val selectedProject=project?:return
        val selectedThread=thread?:return
        if(isBusy||isTelegram||(draft.isBlank()&&files.isEmpty()))return
        val question=draft.trim().ifBlank{
            "Пользователь отправил вложение. Проанализируй содержимое файлов."
        }
        val outgoing=serializeTaskAiReply(question,
            reply?.let{ReplyTarget(it.id,it.role,it.content)})
        val display=serializeTaskAiReply(
            question+(if(files.isEmpty())"" else "\n\n📎 Файлы: "+
                files.joinToString(", "){it.name}),
            reply?.let{ReplyTarget(it.id,it.role,it.content)})
        val id=if(lastRequestHadError&&outgoing==lastOutgoing)
            lastRequestId?:UUID.randomUUID().toString()
            else UUID.randomUUID().toString()
        lastRequestId=id;lastOutgoing=outgoing;lastRequestHadError=false
        queuedDraft=draft;queuedFiles=files.toList();queuedReply=reply
        draft="";files.clear();reply=null
        vm.sendGeneralAi(selectedProject.id,selectedThread.id,id,outgoing,
            display,queuedFiles,model,onDone={
                queuedDraft="";queuedFiles=emptyList();queuedReply=null
                lastRequestId=null;lastOutgoing=""
                lastRequestHadError=false
            })
    }

    Box(Modifier.fillMaxSize().background(c.bg)){
        Column(Modifier.fillMaxSize()){
            AnimatedVisibility(visible=!headerCollapsed,
                enter=expandVertically(),exit=shrinkVertically()){
                Row(Modifier.fillMaxWidth().background(c.panel)
                    .padding(horizontal=10.dp,vertical=10.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    OutlinedIconButton(onClick={
                        menuOpen=true;vm.refreshGeneralAi()
                    },modifier=Modifier.size(38.dp),
                        border=BorderStroke(1.dp,c.border)){
                        Icon(Icons.Default.Menu,"Проекты и чаты",tint=c.text,
                            modifier=Modifier.size(19.dp))
                    }
                    Column(Modifier.weight(1f)){
                        Text("✧ ЧАТ С ИИ",color=c.accent,fontSize=10.sp,
                            letterSpacing=1.6.sp,fontWeight=FontWeight.Bold)
                        Text(thread?.title?:"Быстрые запросы",color=c.text,
                            fontSize=17.sp,fontWeight=FontWeight.Bold,
                            maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                    project?.let{p->
                        Row(Modifier.widthIn(max=116.dp)
                            .clip(CircleShape)
                            .background(nativeProjectColor(p.color))
                            .padding(horizontal=8.dp,vertical=6.dp),
                            horizontalArrangement=Arrangement.spacedBy(5.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            GeneralAiProjectGlyph(p.icon,18.dp)
                            Text(p.title,color=Color.White,fontSize=10.sp,
                                maxLines=1,overflow=TextOverflow.Ellipsis,
                                fontWeight=FontWeight.SemiBold)
                        }
                    }
                    Box{
                        Row(Modifier.clip(RoundedCornerShape(10.dp))
                            .background(c.bg)
                            .border(1.dp,c.border,RoundedCornerShape(10.dp))
                            .clickable(enabled=!isTelegram && !state.saving){modelMenu=true}
                            .padding(horizontal=7.dp,vertical=7.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            Text(when(model){
                                "gpt-6-luna"->"Luna"
                                "gpt-5.4-mini"->"Mini"
                                else->"Sol"
                            },fontSize=10.sp,color=c.text,
                                fontWeight=FontWeight.SemiBold)
                            Icon(Icons.Default.ArrowDropDown,null,
                                tint=c.secondary,modifier=Modifier.size(16.dp))
                        }
                        DropdownMenu(expanded=modelMenu,
                            onDismissRequest={modelMenu=false}){
                            listOf("gpt-6-luna" to "GPT-6 Luna",
                                "gpt-5.4-mini" to "GPT-5.4 mini",
                                "gpt-6.1-sol" to "GPT-6.1 Sol").forEach{(key,label)->
                                DropdownMenuItem(text={Text(label)},
                                    onClick={
                                        project?.id?.let{pid->
                                            thread?.id?.let{tid->
                                                vm.setGeneralAiModel(pid,tid,key)
                                            }
                                        }
                                        modelMenu=false
                                    })
                            }
                        }
                    }
                    IconButton(onClick=onExit,modifier=Modifier.size(32.dp)){
                        Icon(Icons.Default.Close,"Закрыть общий чат",tint=c.text)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().weight(1f)){
                if(state.loading && messages.isEmpty()){
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                }else if(messages.isEmpty()&&!state.busy){
                    Column(Modifier.align(Alignment.Center)
                        .padding(25.dp),
                        horizontalAlignment=Alignment.CenterHorizontally,
                        verticalArrangement=Arrangement.spacedBy(11.dp)){
                        Icon(Icons.Default.AutoAwesome,null,tint=c.accent,
                            modifier=Modifier.size(38.dp))
                        Text("ИИ готов помочь",color=c.text,
                            fontSize=18.sp,fontWeight=FontWeight.Bold)
                        Text("Задайте вопрос, обсудите идею или попросите составить план.",
                            color=c.secondary,fontSize=12.sp,
                            textAlign=androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }
                val bottomPadding=with(LocalDensity.current){
                    if(composerHeightPx>0)composerHeightPx.toDp()+20.dp else 105.dp
                }
                LazyColumn(state=listState,
                    modifier=Modifier.fillMaxSize().alpha(if(historyPositioned)1f else 0f),
                    contentPadding=PaddingValues(start=12.dp,end=12.dp,
                        top=10.dp,bottom=bottomPadding),
                    verticalArrangement=Arrangement.spacedBy(11.dp)){
                    items(messages,key={m->m.id?:
                        m.role+"-"+messages.indexOf(m)} ){message->
                        TaskChatBubble(message,c,context,
                            onReply={reply=GeneralReply(message.id.orEmpty(),
                                message.role,message.content)},
                            onProposalAction={id,action->
                                vm.applyGeneralAiProposal(id,action)
                            },actionBusy=isBusy,
                            onOpenDocument={id->
                                vm.generalAiDocumentLink(id){url->
                                    runCatching{context.startActivity(
                                        Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
                                }
                            })
                    }
                    if(state.pendingMessage!=null)item(key="pending-general-user"){
                        TaskChatBubble(state.pendingMessage!!,c,context,
                            onReply={},pending=true)
                    }
                    if(state.busy)item(key="general-ai-progress"){
                        NativeTaskAiProgressChip(state.progressStatus
                            ?:"analyzing_request",c)
                    }
                }

                Column(Modifier.align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(start=10.dp,end=10.dp,bottom=10.dp)
                    .onSizeChanged{composerHeightPx=it.height},
                    verticalArrangement=Arrangement.spacedBy(7.dp)){
                    reply?.let{target->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .background(c.accent.copy(alpha=.12f))
                            .padding(horizontal=10.dp,vertical=6.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.Reply,null,tint=c.accent,
                                modifier=Modifier.size(16.dp))
                            Spacer(Modifier.width(7.dp))
                            Text(target.content,Modifier.weight(1f),color=c.secondary,
                                fontSize=11.sp,maxLines=2,
                                overflow=TextOverflow.Ellipsis)
                            IconButton(onClick={reply=null},modifier=Modifier.size(28.dp)){
                                Icon(Icons.Default.Close,"Отменить ответ",
                                    tint=c.secondary,modifier=Modifier.size(15.dp))
                            }
                        }
                    }
                    if(files.isNotEmpty()){
                        Row(Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement=Arrangement.spacedBy(5.dp)){
                            files.toList().forEach{file->
                                Row(Modifier.clip(CircleShape)
                                    .background(c.panel).border(1.dp,c.border,CircleShape)
                                    .padding(start=10.dp),
                                    verticalAlignment=Alignment.CenterVertically){
                                    Text(file.name,color=c.text,fontSize=10.sp,
                                        maxLines=1,modifier=Modifier.widthIn(max=105.dp))
                                    IconButton(onClick={files.remove(file)},
                                        modifier=Modifier.size(25.dp)){
                                        Icon(Icons.Default.Close,"Убрать файл",
                                            tint=c.secondary,modifier=Modifier.size(12.dp))
                                    }
                                }
                            }
                        }
                    }
                    (attachError?:state.error)?.let{msg->
                        Text(msg,color=Color(0xFFFB7185),fontSize=11.sp)
                    }
                    Row(Modifier.fillMaxWidth()
                        .shadow(6.dp,CircleShape).clip(CircleShape)
                        .background(c.panel)
                        .border(1.dp,c.border,CircleShape)
                        .padding(horizontal=7.dp,vertical=6.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(5.dp)){
                        BasicTextField(value=draft,onValueChange={
                            draft=it;lastRequestHadError=false
                        },modifier=Modifier.weight(1f).heightIn(min=42.dp,max=140.dp),
                            textStyle=TextStyle(color=c.text,fontSize=14.sp,lineHeight=20.sp),
                            maxLines=6,enabled=!isBusy&&!isTelegram,
                            cursorBrush=SolidColor(c.accent),
                            decorationBox={inner->
                                Box(Modifier.defaultMinSize(minHeight=42.dp)
                                    .padding(horizontal=10.dp,vertical=9.dp),
                                    contentAlignment=Alignment.CenterStart){
                                    if(draft.isEmpty())Text(if(isTelegram)
                                        "Чат Telegram управляется ассистентом"
                                        else "Напишите сообщение…",
                                        color=c.secondary,fontSize=14.sp)
                                    inner()
                                }
                            })
                        Box(Modifier.size(42.dp).clip(CircleShape)
                            .background(c.bg).border(1.dp,c.border,CircleShape)
                            .clickable(enabled=!isBusy&&!attaching&&!isTelegram){
                                picker.launch(arrayOf("*/*"))
                            },contentAlignment=Alignment.Center){
                            TaskChatPaperclip(c.secondary)
                        }
                        AiChatMicrophoneButton(
                            enabled=!isBusy&&!isTelegram&&!attaching,
                            background=if(dark)Color(0xFF253349) else Color(0xFFF8FAFC),
                            border=c.border,tint=c.secondary,onClick=speechInput
                        )
                        Box(Modifier.size(42.dp).clip(CircleShape)
                            .background(if(!isBusy&&(draft.isNotBlank()||files.isNotEmpty()))
                                c.accent else c.border)
                            .clickable(enabled=!isBusy&&!attaching&&!isTelegram&&
                                (draft.isNotBlank()||files.isNotEmpty())){send()},
                            contentAlignment=Alignment.Center){
                            if(state.busy)CircularProgressIndicator(
                                Modifier.size(19.dp),strokeWidth=2.dp,color=Color.White)
                            else Icon(Icons.Default.Send,"Отправить",tint=Color.White,
                                modifier=Modifier.size(19.dp))
                        }
                    }
                }
            }
        }

        // Keep the overlay mounted for the exit animation. Mini App slides
        // the drawer from the left rather than showing it instantaneously.
        AnimatedVisibility(visible=menuOpen,
            enter=fadeIn(animationSpec=tween(200)),
            exit=fadeOut(animationSpec=tween(180))){
            Box(Modifier.fillMaxSize().background(Color.Black.copy(
                alpha=if(dark).64f else .32f)).clickable { menuOpen=false })
        }
        AnimatedVisibility(
            visible=menuOpen,modifier=Modifier.align(Alignment.CenterStart),
            enter=slideInHorizontally(
                initialOffsetX={-it},
                animationSpec=tween(290,easing=FastOutSlowInEasing)),
            exit=slideOutHorizontally(
                targetOffsetX={-it},
                animationSpec=tween(245,easing=FastOutSlowInEasing))
        ){
            Surface(Modifier.fillMaxHeight().fillMaxWidth(.86f).widthIn(max=375.dp),
                color=Color.Transparent,shadowElevation=18.dp,
                shape=RoundedCornerShape(topEnd=22.dp,bottomEnd=22.dp)){
                Column(Modifier.fillMaxSize()
                    .background(Brush.verticalGradient(
                        if(dark)listOf(Color(0xFF121B30),Color(0xFF0C1426))
                        else listOf(Color.White,Color(0xFFF8FAFC))))
                    .verticalScroll(rememberScrollState())
                    .padding(13.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Row(Modifier.fillMaxWidth(),
                        verticalAlignment=Alignment.CenterVertically){
                        Text("Проекты и чаты",Modifier.weight(1f),
                            color=c.text,fontWeight=FontWeight.Bold,fontSize=19.sp)
                        IconButton(onClick={menuOpen=false}){
                            Icon(Icons.Default.Close,"Закрыть меню",tint=c.text)
                        }
                    }
                    Row(Modifier.fillMaxWidth(),
                        horizontalArrangement=Arrangement.SpaceBetween,
                        verticalAlignment=Alignment.CenterVertically){
                        Text("ПРОЕКТЫ",color=c.accent,
                            fontWeight=FontWeight.Bold,letterSpacing=1.8.sp,
                            fontSize=11.sp)
                        SmallFloatingAdd(color=Color(0xFF7C3AED),enabled=!isBusy){
                            projectEdit=null;projectForm=true
                        }
                    }
                    state.projects.forEachIndexed{index,p->
                        val current=project?.id==p.id
                        AiSidebarGradientCard(
                            active=current,accent=nativeProjectColor(p.color),
                            dark=dark,modifier=Modifier.fillMaxWidth()){
                                Row(Modifier.fillMaxWidth().clickable{
                                    vm.chooseGeneralAiChat(p.id,p.chats.firstOrNull()?.id
                                        ?:QUICK_AI_THREAD_ID)
                                },verticalAlignment=Alignment.CenterVertically){
                                    Box(Modifier.size(41.dp).clip(RoundedCornerShape(15.dp))
                                        .background(nativeProjectColor(p.color)),
                                        contentAlignment=Alignment.Center){
                                        GeneralAiProjectGlyph(p.icon,23.dp)
                                    }
                                    Spacer(Modifier.width(9.dp))
                                    Text(p.title,Modifier.weight(1f),
                                        color=if(dark)Color(0xFFF8FAFC)else Color(0xFF0F172A),
                                        fontWeight=FontWeight.Bold,fontSize=14.sp,
                                        maxLines=2)
                                }
                                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                                    AiSidebarAction("Настроить",Icons.Default.Settings,
                                        c,enabled=index!=0&&!p.isTelegram&&!isBusy){
                                        projectEdit=p;projectForm=true
                                    }
                                    AiSidebarAction("Удалить",Icons.Default.DeleteOutline,
                                        c,danger=true,enabled=index!=0&&!p.isTelegram&&
                                            state.projects.size>1&&!isBusy){
                                        deleteProject=p
                                    }
                                }
                        }
                    }
                    Spacer(Modifier.height(3.dp))
                    Row(Modifier.fillMaxWidth(),
                        horizontalArrangement=Arrangement.SpaceBetween,
                        verticalAlignment=Alignment.CenterVertically){
                        Text("ЧАТЫ",color=Color(0xFF0891B2),
                            fontWeight=FontWeight.Bold,letterSpacing=1.8.sp,fontSize=11.sp)
                        SmallFloatingAdd(color=Color(0xFF06B6D4),
                            enabled=!isBusy&&!project.orIsTelegram()){
                            project?.id?.let(vm::createGeneralAiThread)
                        }
                    }
                    project?.chats.orEmpty().forEach{t->
                        val active=thread?.id==t.id
                        AiSidebarGradientCard(
                            active=active,accent=Color(0xFF06B6D4),
                            dark=dark,modifier=Modifier.fillMaxWidth()){
                                Column(Modifier.fillMaxWidth().clickable{
                                    project?.id?.let{vm.chooseGeneralAiChat(it,t.id)}
                                    menuOpen=false
                                }){
                                    Text(t.title,
                                        color=if(dark)Color(0xFFF8FAFC)else Color(0xFF0F172A),
                                        fontSize=14.sp,
                                        fontWeight=FontWeight.Bold,maxLines=2)
                                    Spacer(Modifier.height(4.dp))
                                    Text("${t.messages.size} сообщ.",
                                        color=if(dark)Color(0xFFA8B8CE)
                                            else Color(0xFF64748B),fontSize=12.sp)
                                }
                                val editable=t.id!=QUICK_AI_THREAD_ID &&
                                    !t.id.startsWith("telegram-ai-assistant:") &&
                                    !project.orIsTelegram()
                                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                                    AiSidebarAction("Переименовать",Icons.Default.Edit,c,
                                        enabled=editable&&!isBusy){renameTarget=t}
                                    AiSidebarAction("Удалить",Icons.Default.DeleteOutline,c,
                                        danger=true,enabled=editable&&!isBusy&&
                                            (project?.chats?.size?:0)>1){deleteThread=t}
                                }
                        }
                    }
                }
            }
        }
    }

    if(projectForm){
        GeneralAiProjectForm(
            initial=projectEdit,c=c,busy=state.saving,onClose={projectForm=false},
            onSave={title,color,icon->
                val initial=projectEdit
                if(initial==null)vm.createGeneralAiProject(title,color,icon)
                else vm.editGeneralAiProject(initial.id,title,color,icon)
                projectForm=false;menuOpen=false
            })
    }
    renameTarget?.let{target->
        var rename by remember(target.id){mutableStateOf(target.title)}
        AlertDialog(onDismissRequest={renameTarget=null},
            title={Text("Переименовать чат")},
            text={OutlinedTextField(rename,onValueChange={rename=it},
                modifier=Modifier.fillMaxWidth(),singleLine=true,
                label={Text("Название")})},
            confirmButton={TextButton(onClick={
                project?.id?.let{vm.renameGeneralAiThread(it,target.id,rename)}
                renameTarget=null
            }){Text("Сохранить")}},
            dismissButton={TextButton(onClick={renameTarget=null}){Text("Отмена")}})
    }
    deleteProject?.let{target->
        AlertDialog(onDismissRequest={deleteProject=null},
            title={Text("Удалить проект?")},
            text={Text("Проект «${target.title}» и его чаты будут удалены.")},
            confirmButton={TextButton(onClick={
                vm.deleteGeneralAiProject(target.id);deleteProject=null
            }){Text("Удалить")}},
            dismissButton={TextButton(onClick={deleteProject=null}){Text("Отмена")}})
    }
    deleteThread?.let{target->
        AlertDialog(onDismissRequest={deleteThread=null},
            title={Text("Удалить чат?")},
            text={Text("«${target.title}»: переписка будет удалена из проекта.")},
            confirmButton={TextButton(onClick={
                project?.id?.let{vm.deleteGeneralAiThread(it,target.id)}
                deleteThread=null
            }){Text("Удалить")}},
            dismissButton={TextButton(onClick={deleteThread=null}){Text("Отмена")}})
    }
}
private data class GeneralReply(val id:String,val role:String,val content:String)
private fun GeneralAiProject?.orIsTelegram():Boolean=this?.isTelegram==true

@Composable private fun SmallFloatingAdd(color:Color,enabled:Boolean,onClick:()->Unit){
    Box(Modifier.size(35.dp).clip(CircleShape)
        .background(if(enabled)color else Color.Gray)
        .clickable(enabled=enabled,onClick=onClick),contentAlignment=Alignment.Center){
        Icon(Icons.Default.Add,"Добавить",tint=Color.White,
            modifier=Modifier.size(20.dp))
    }
}
@Composable private fun AiSidebarAction(label:String,
    icon:androidx.compose.ui.graphics.vector.ImageVector,
    c:TaskChatColors,danger:Boolean=false,enabled:Boolean=true,onClick:()->Unit){
    Row(Modifier.clip(CircleShape)
        .background(c.panel)
        .border(1.dp,c.border,CircleShape)
        .clickable(enabled=enabled,onClick=onClick)
        .padding(horizontal=11.dp,vertical=7.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(5.dp)){
        Icon(icon,null,modifier=Modifier.size(14.dp),
            tint=if(!enabled)c.secondary.copy(alpha=.35f)
                else if(danger)Color(0xFFDB2777)else c.text)
        Text(label,fontSize=10.sp,
            color=if(!enabled)c.secondary.copy(alpha=.35f)
                else if(danger)Color(0xFFDB2777)else c.text,
            fontWeight=FontWeight.SemiBold)
    }
}

@Composable
private fun GeneralAiProjectForm(initial:GeneralAiProject?,
    c:TaskChatColors,busy:Boolean,onClose:()->Unit,
    onSave:(String,String,String)->Unit){
    var title by remember(initial?.id){mutableStateOf(initial?.title?:"Новый проект")}
    var color by remember(initial?.id){mutableStateOf(initial?.color?:"#8b5cf6")}
    var icon by remember(initial?.id){mutableStateOf(initial?.icon?:"✨")}
    Dialog(onDismissRequest=onClose){
        Surface(shape=RoundedCornerShape(22.dp),color=c.panel){
            Column(Modifier.padding(17.dp).verticalScroll(rememberScrollState()),
                verticalArrangement=Arrangement.spacedBy(12.dp)){
                Text(if(initial==null)"Новый проект" else "Настройка проекта",
                    color=c.text,fontSize=18.sp,fontWeight=FontWeight.Bold)
                OutlinedTextField(value=title,onValueChange={title=it},
                    modifier=Modifier.fillMaxWidth(),
                    label={Text("Название")},singleLine=true)
                Text("Цвет",color=c.secondary,fontSize=12.sp)
                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    GENERAL_PROJECT_COLORS.forEach{swatch->
                        Box(Modifier.size(30.dp).clip(CircleShape)
                            .background(nativeProjectColor(swatch))
                            .border(if(color==swatch)3.dp else 1.dp,
                                if(color==swatch)c.text else Color.Transparent,CircleShape)
                            .clickable{color=swatch})
                    }
                }
                Text("Иконка",color=c.secondary,fontSize=12.sp)
                GENERAL_PROJECT_ICONS.chunked(6).forEach{row->
                    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        row.forEach{option->
                            Box(Modifier.size(39.dp).clip(RoundedCornerShape(9.dp))
                                .background(if(icon==option)c.accent.copy(alpha=.23f)
                                    else c.bg)
                                .border(1.dp,if(icon==option)c.accent else c.border,
                                    RoundedCornerShape(9.dp))
                                .clickable{icon=option},contentAlignment=Alignment.Center){
                                Text(option,fontSize=20.sp)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End){
                    TextButton(onClick=onClose){Text("Отмена")}
                    Button(onClick={onSave(title,color,icon)},
                        enabled=!busy&&title.isNotBlank()){
                        Text(if(initial==null)"Создать" else "Сохранить")
                    }
                }
            }
        }
    }
}
