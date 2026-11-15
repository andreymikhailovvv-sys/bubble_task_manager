package ru.planirovych.app.feature.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import ru.planirovych.app.data.model.Task
import ru.planirovych.app.data.model.TaskComment
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val collaborationPalette=listOf("#8b5cf6", "#ec4899", "#06b6d4",
    "#f97316", "#22c55e", "#eab308")

internal fun memberColor(value:String?):Color=runCatching{
    Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Color(0xFF8B5CF6))

/** A separate dialog above the focus bottom sheet, never a replacement of it. */
@Composable
internal fun NativeCollaborationSettingsDialog(
    task:Task, dark:Boolean, vm:HomeViewModel, onClose:()->Unit
){
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF172033)
    val muted=if(dark)Color(0xFFA5B4CA) else Color(0xFF64748B)
    val bg=if(dark)Color(0xFF172439) else Color.White
    val border=if(dark)Color(0xFF394A63) else Color(0xFFFBECC3)
    val scope=rememberCoroutineScope()
    var working by remember(task.id){mutableStateOf(false)}
    var error by remember(task.id){mutableStateOf<String?>(null)}
    var confirm by remember(task.id){mutableStateOf<String?>(null)}
    fun execute(closeAfter:Boolean=false, block:suspend ()->Unit){
        if(working)return
        scope.launch {
            working=true;error=null
            try{
                block()
                if(closeAfter)onClose()
            }catch(t:Throwable){error=t.message?:"Не удалось обновить совместную задачу"}
            finally{working=false}
        }
    }

    Dialog(onDismissRequest={if(!working)onClose()},
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        val maxHeight=(LocalConfiguration.current.screenHeightDp*.84f).dp
        Surface(Modifier.fillMaxWidth().padding(horizontal=16.dp)
            .widthIn(max=450.dp).heightIn(max=maxHeight),
            color=bg,shape=RoundedCornerShape(27.dp),
            border=BorderStroke(1.dp,memberColor(task.collaborationColor).copy(alpha=.3f))){
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp)){
                Row(verticalAlignment=Alignment.Top){
                    Column(Modifier.weight(1f)){
                        Text("СОВМЕСТНАЯ ЗАДАЧА",fontSize=11.sp,fontWeight=FontWeight.Bold,
                            letterSpacing=2.sp,color=Color(0xFFF59E0B))
                        Spacer(Modifier.height(8.dp))
                        Text("Настройки участников",fontSize=22.sp,
                            fontWeight=FontWeight.Bold,color=ink)
                    }
                    IconButton(onClick=onClose,enabled=!working){
                        Icon(Icons.Default.Close,"Закрыть",tint=Color(0xFF0891B2))
                    }
                }
                Spacer(Modifier.height(22.dp))
                Text("Ваш цвет в совместной задаче",color=muted,fontSize=14.sp)
                Spacer(Modifier.height(15.dp))
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                    collaborationPalette.forEach{hex->
                        val color=memberColor(hex)
                        val selected=task.collaborationColor.equals(hex,ignoreCase=true)
                        Box(Modifier.size(39.dp)
                            .clip(CircleShape)
                            .background(color)
                            .border(if(selected)3.dp else 2.dp,
                                if(selected)Color(0xFFF5B400) else color.copy(alpha=.3f),
                                CircleShape)
                            .clickable(enabled=!working){
                                execute {vm.updateSharedTaskColor(task.id,hex)}
                            },contentAlignment=Alignment.Center){
                            if(selected)Box(Modifier.size(27.dp).border(2.dp,bg,CircleShape))
                        }
                    }
                }
                if(task.collaborationOwner){
                    Spacer(Modifier.height(24.dp))
                    HorizontalDivider(color=border)
                    Spacer(Modifier.height(19.dp))
                    Text("Участники с доступом",color=ink,fontSize=16.sp,
                        fontWeight=FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
                        task.collaborationMembers.forEach{member->
                            Row(Modifier.fillMaxWidth()
                                .border(1.dp,border,RoundedCornerShape(14.dp))
                                .padding(horizontal=12.dp,vertical=10.dp),
                                verticalAlignment=Alignment.CenterVertically){
                                Box(Modifier.size(12.dp).background(memberColor(member.color),CircleShape))
                                Spacer(Modifier.width(12.dp))
                                Text(member.name+(if(member.isOwner)" (создатель)" else ""),
                                    Modifier.weight(1f),color=ink,
                                    maxLines=1,overflow=TextOverflow.Ellipsis,
                                    fontSize=14.sp,fontWeight=FontWeight.Medium)
                                if(!member.isOwner){
                                    Spacer(Modifier.width(7.dp))
                                    Button(onClick={confirm=member.userId},enabled=!working,
                                        shape=CircleShape,
                                        colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFFF0050)),
                                        contentPadding=PaddingValues(horizontal=11.dp,vertical=5.dp)){
                                        Text("Исключить",fontSize=12.sp,color=Color.White)
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(23.dp))
                    Text("Вы создатель задачи",color=ink,fontWeight=FontWeight.Bold,fontSize=16.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("После выключения у каждого участника останется отдельная копия задачи. Дальнейшие изменения больше не будут общими.",
                        color=muted,fontSize=13.sp,lineHeight=20.sp)
                    Spacer(Modifier.height(17.dp))
                    Button(onClick={confirm="disable"},enabled=!working,
                        modifier=Modifier.fillMaxWidth(),shape=CircleShape,
                        colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFFF0050))){
                        Text("Выключить совместный режим",color=Color.White,
                            fontWeight=FontWeight.Bold)
                    }
                }
                if(working)LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=10.dp))
                error?.let{Text(it,color=Color(0xFFFB7185),fontSize=12.sp,
                    modifier=Modifier.padding(top=8.dp))}
            }
        }
    }
    confirm?.let{key->
        val disable=key=="disable"
        AlertDialog(onDismissRequest={if(!working)confirm=null},
            title={Text(if(disable)"Выключить совместный режим?" else "Исключить участника?")},
            text={Text(if(disable)"У каждого останется своя независимая копия задачи."
                else "Участник потеряет доступ к совместной задаче.")},
            confirmButton={TextButton(enabled=!working,onClick={
                confirm=null
                execute(closeAfter=disable){
                    if(disable)vm.disableSharedTask(task.id)
                    else vm.removeSharedTaskMember(task.id,key)
                }
            }){Text(if(disable)"Выключить" else "Исключить",color=Color(0xFFFF0050))}},
            dismissButton={TextButton(onClick={confirm=null}){Text("Отмена")}})
    }
}

@Composable
internal fun NativeSubtaskCommentsDialog(
    subtask:Task, dark:Boolean, vm:HomeViewModel, onClose:()->Unit
){
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF172033)
    val muted=if(dark)Color(0xFFA5B4CA) else Color(0xFF64748B)
    val bg=if(dark)Color(0xFF172439) else Color(0xFFF9FAFC)
    val card=if(dark)Color(0xFF24364D) else Color.White
    val border=if(dark)Color(0xFF394A63) else Color(0xFFDCE4EF)
    val scope=rememberCoroutineScope()
    var comments by remember(subtask.id){mutableStateOf<List<TaskComment>>(emptyList())}
    var loading by remember(subtask.id){mutableStateOf(true)}
    var sending by remember(subtask.id){mutableStateOf(false)}
    var error by remember(subtask.id){mutableStateOf<String?>(null)}
    var draft by remember(subtask.id){mutableStateOf("")}
    var replyTo by remember(subtask.id){mutableStateOf<TaskComment?>(null)}
    val listState=rememberLazyListState()
    LaunchedEffect(subtask.id){
        loading=true
        try{
            val loaded=vm.loadSharedSubtaskComments(subtask.id)
            comments=loaded
            // Reading is acknowledged even when the thread is empty.
            runCatching {vm.readSharedSubtaskComments(subtask.id,loaded.lastOrNull()?.id)}
        }catch(t:Throwable){error=t.message?:"Не удалось загрузить комментарии"}
        finally{loading=false}
    }
    LaunchedEffect(comments.size,loading){
        if(!loading && comments.isNotEmpty())listState.animateScrollToItem(comments.lastIndex)
    }
    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxWidth().padding(horizontal=14.dp).widthIn(max=500.dp)
            .heightIn(min=330.dp,max=570.dp),
            shape=RoundedCornerShape(25.dp),color=bg,border=BorderStroke(1.dp,border)){
            Column {
                Row(Modifier.fillMaxWidth().padding(horizontal=17.dp,vertical=13.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Column(Modifier.weight(1f)){
                        Text("КОММЕНТАРИИ К ПОДЗАДАЧЕ",color=Color(0xFF8B5CF6),
                            fontSize=11.sp,fontWeight=FontWeight.Bold,letterSpacing=1.5.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(subtask.title,color=ink,fontSize=18.sp,
                            fontWeight=FontWeight.Bold,maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                    IconButton(onClick=onClose){Icon(Icons.Default.Close,"Закрыть",tint=muted)}
                }
                HorizontalDivider(color=border)
                if(loading)LinearProgressIndicator(Modifier.fillMaxWidth())
                Box(Modifier.weight(1f).fillMaxWidth().padding(12.dp)){
                    if(!loading && comments.isEmpty()){
                        Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(15.dp),
                            color=if(dark)card else Color(0xFFEDF2F8)){
                            Text("Комментариев пока нет.",Modifier.padding(19.dp),
                                color=muted,fontSize=15.sp)
                        }
                    }else{
                        LazyColumn(state=listState,modifier=Modifier.fillMaxSize(),
                            verticalArrangement=Arrangement.spacedBy(9.dp)){
                            items(comments,key={it.id}){comment->
                                Column(Modifier.fillMaxWidth()
                                    .padding(start=if(comment.parentCommentId!=null)18.dp else 0.dp)
                                    .border(1.dp,border,RoundedCornerShape(15.dp))
                                    .background(card,RoundedCornerShape(15.dp))
                                    .padding(12.dp)){
                                    Row(verticalAlignment=Alignment.CenterVertically){
                                        Box(Modifier.size(8.dp).background(
                                            memberColor(comment.authorColor),CircleShape))
                                        Spacer(Modifier.width(6.dp))
                                        Text(comment.authorName,Modifier.weight(1f),color=ink,
                                            fontWeight=FontWeight.SemiBold,fontSize=12.sp,
                                            maxLines=1,overflow=TextOverflow.Ellipsis)
                                        Text(formatCommentTimestamp(comment.createdAt),
                                            color=muted,fontSize=10.sp)
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text(comment.content,color=ink,fontSize=14.sp,lineHeight=19.sp)
                                    TextButton(onClick={replyTo=comment},
                                        contentPadding=PaddingValues(horizontal=2.dp)){
                                        Text("Ответить",color=Color(0xFF8B5CF6),fontSize=12.sp)
                                    }
                                }
                            }
                        }
                    }
                }
                HorizontalDivider(color=border)
                Column(Modifier.padding(14.dp)){
                    replyTo?.let{comment->
                        Row(Modifier.fillMaxWidth()
                            .background(card,RoundedCornerShape(9.dp))
                            .padding(start=10.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            Text("Ответ для ${comment.authorName}: ${comment.content}",
                                Modifier.weight(1f),color=muted,fontSize=12.sp,
                                maxLines=1,overflow=TextOverflow.Ellipsis)
                            IconButton(onClick={replyTo=null},modifier=Modifier.size(30.dp)){
                                Icon(Icons.Default.Close,"Отменить ответ",tint=muted,
                                    modifier=Modifier.size(15.dp))
                            }
                        }
                        Spacer(Modifier.height(7.dp))
                    }
                    OutlinedTextField(value=draft,onValueChange={if(it.length<=3000)draft=it},
                        modifier=Modifier.fillMaxWidth(),minLines=2,maxLines=4,
                        placeholder={Text("Оставьте комментарий…",color=muted)},
                        colors=OutlinedTextFieldDefaults.colors(
                            focusedBorderColor=Color(0xFF8B5CF6),unfocusedBorderColor=border),
                        shape=RoundedCornerShape(15.dp))
                    error?.let{Text(it,color=Color(0xFFFB7185),fontSize=12.sp)}
                    Row(Modifier.fillMaxWidth().padding(top=8.dp),
                        horizontalArrangement=Arrangement.End){
                        Button(enabled=draft.isNotBlank()&&!sending,onClick={
                            if(sending || draft.isBlank())return@Button
                            sending=true;error=null
                            val message=draft.trim()
                            val parent=replyTo?.id
                            scope.launch{
                                try{
                                    val created=vm.postSharedSubtaskComment(subtask.id,message,parent)
                                    comments=comments+created
                                    draft="";replyTo=null
                                }catch(t:Throwable){error=t.message?:"Не удалось отправить комментарий"}
                                finally{sending=false}
                            }
                        },shape=RoundedCornerShape(13.dp),
                            colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFB58AF6))){
                            Icon(Icons.Default.Send,null,modifier=Modifier.size(17.dp))
                            Spacer(Modifier.width(7.dp))
                            Text("Отправить",fontWeight=FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }
}

private fun formatCommentTimestamp(value:String):String = runCatching{
    DateTimeFormatter.ofPattern("dd.MM HH:mm")
        .withZone(ZoneId.systemDefault()).format(Instant.parse(value))
}.getOrDefault("")
