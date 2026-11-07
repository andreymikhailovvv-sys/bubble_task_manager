package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import android.provider.OpenableColumns
import android.text.Html
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.time.*
import java.time.format.DateTimeFormatter
import ru.planirovych.app.data.model.*

/** The native equivalent of MiniApp's subtask editor, displayed as a centered
 *  dialog above the parent focus sheet rather than replacing that sheet.
 */
private data class ChildColors(val bg:Color,val ink:Color,val muted:Color,val line:Color,
    val panel:Color,val teal:Color,val purple:Color,val danger:Color)
private fun childColors(dark:Boolean)=if(dark)ChildColors(
    Color(0xFF111C30),Color(0xFFF1F5F9),Color(0xFFA5B4CA),Color(0xFF42516B),
    Color(0xFF17243A),Color(0xFF67E8F9),Color(0xFFC4B5FD),Color(0xFFFB7185))
else ChildColors(Color.White,Color(0xFF0F172A),Color(0xFF64748B),
    Color(0xFFD6DCE7),Color(0xFFFAFBFD),Color(0xFF0891B2),
    Color(0xFF7C3AED),Color(0xFFE11D48))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiniAppSubtaskEditorSheet(
    task:Task?, parent:Task, dark:Boolean, vm:HomeViewModel,
    busy:Boolean,error:String?,
    onBack:()->Unit, onSave:(String,JsonObject,()->Unit)->Unit,
    onCreateSubtask:(String,String,String,String?,()->Unit)->Unit,
    onChangeStatus:(String,TaskStatus,()->Unit)->Unit,
    onDelete:(String,()->Unit)->Unit,onClearError:()->Unit
) {
    val c=remember(dark){childColors(dark)}
    val ctx=LocalContext.current
    val vmState by vm.state.collectAsStateWithLifecycle()
    val scope=rememberCoroutineScope()
    val key=task?.id ?: "new-"+parent.id
    val isNew=task==null
    var title by remember(key){mutableStateOf(task?.title.orEmpty())}
    val initialDescription=remember(key){task?.description.orEmpty()}
    var description by remember(key){mutableStateOf(initialDescription)}
    var dueDate by remember(key){mutableStateOf(task?.dueDate)}
    var location by remember(key){mutableStateOf(task?.location.orEmpty())}
    var descriptionExpanded by remember(key){mutableStateOf(false)}
    var pendingAction by remember(key){mutableStateOf<String?>(null)}
    var saving by remember(key){mutableStateOf(false)}
    val maxHeight=(LocalConfiguration.current.screenHeightDp*.79f).dp

    val saveThen:((()->Unit)->Unit)={after->
        if(!busy && !saving && title.isNotBlank()) {
            if(isNew) {
                saving=true
                onCreateSubtask(parent.id,title.trim(),description.trim(),dueDate){
                    saving=false;after()
                }
            } else if(task!=null) {
                val changes=buildJsonObject {
                    if(title.trim()!=task.title)put("title",title.trim())
                    if(description!=initialDescription){
                        if(description.isBlank())put("description",JsonNull)
                        else put("description",description)
                    }
                    if(dueDate!=task.dueDate){
                        if(dueDate==null)put("dueDate",JsonNull)
                        else put("dueDate",dueDate)
                    }
                }
                if(changes.isEmpty())after()
                else {
                    saving=true
                    onSave(task.id,changes){saving=false;after()}
                }
            }
        }
    }
    LaunchedEffect(busy,error){if(!busy && error!=null)saving=false}
    val datePicker={
        val old=childLocalDate(dueDate)?:LocalDateTime.now()
        DatePickerDialog(ctx,{_,year,month,day->
            TimePickerDialog(ctx,{_,hour,minute->
                dueDate=LocalDateTime.of(year,month+1,day,hour,minute)
                    .atZone(ZoneId.systemDefault()).toOffsetDateTime()
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            },old.hour,old.minute,true).show()
        },old.year,old.monthValue-1,old.dayOfMonth).show()
    }
    LaunchedEffect(task?.id){task?.id?.let(vm::loadTaskAttachments)}
    val filePicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri!=null && task!=null)scope.launch{
            try{
                val file=withContext(Dispatchers.IO){
                    val bytes=ctx.contentResolver.openInputStream(uri)?.use{it.readBytes()}
                        ?: throw IllegalStateException("Не удалось открыть файл")
                    val name=ctx.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),
                        null,null,null)?.use{if(it.moveToFirst())it.getString(0) else null}
                        ?.takeIf{it.isNotBlank()} ?: "Вложение"
                    Triple(name,ctx.contentResolver.getType(uri) ?: "application/octet-stream",bytes)
                }
                vm.uploadTaskAttachment(task.id,file.first,file.second,file.third)
            }catch(cause:Throwable){
                Toast.makeText(ctx,cause.message ?: "Не удалось прочитать файл",Toast.LENGTH_LONG).show()
            }
        }
    }
    Dialog(
        onDismissRequest={if(isNew || title.isBlank())onBack() else saveThen(onBack)},
        properties=DialogProperties(usePlatformDefaultWidth=false)
    ) {
        // The keyboard reduces the dialog's available height, not its footer.
        // Keep Create/Complete/Delete outside the scrollable editor fields.
        BoxWithConstraints(Modifier.fillMaxSize(),
            contentAlignment=Alignment.Center) {
            // Dialog window is adjustResize. Do not subtract IME insets again:
            // the double reduction pushed the Create button below the viewport.
            val visibleMaxHeight=minOf(maxHeight,this.maxHeight-12.dp)
                .coerceAtLeast(180.dp)
            Surface(
                modifier=Modifier.fillMaxWidth(.94f)
                    .height(minOf(visibleMaxHeight,520.dp)),
                shape=RoundedCornerShape(24.dp),
                color=c.bg,
                contentColor=c.ink,
                border=BorderStroke(1.dp,c.line),
                shadowElevation=16.dp
            ) {
                Column(Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(start=16.dp,end=16.dp,top=18.dp,bottom=4.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top,
                    horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    BasicTextField(value=title,onValueChange={title=it;onClearError()},
                        modifier=Modifier.weight(1f).padding(top=4.dp,end=3.dp),
                        textStyle=TextStyle(color=c.ink,fontSize=24.sp,lineHeight=29.sp,
                            fontWeight=FontWeight.Bold),
                        maxLines=3,enabled=!busy,cursorBrush=SolidColor(c.purple),
                        decorationBox={inner->
                            Box{
                                if(title.isBlank())Text("Название подзадачи",
                                    color=c.muted,fontSize=24.sp,fontWeight=FontWeight.Bold)
                                inner()
                            }
                        })
                    if(!isNew){
                        ChildRoundIcon(Icons.Default.EventAvailable,c,"Добавить в календарь"){
                            saveThen {
                                val intent=Intent(Intent.ACTION_INSERT)
                                    .setData(CalendarContract.Events.CONTENT_URI)
                                    .putExtra(CalendarContract.Events.TITLE,title.trim())
                                    .putExtra(CalendarContract.Events.DESCRIPTION,description)
                                childMillis(dueDate)?.let{
                                    intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,it)
                                    intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME,it+3600000L)
                                }
                                runCatching{ctx.startActivity(intent)}
                            }
                        }
                    }
                    ChildRoundIcon(Icons.Default.Close,c,"Сохранить и закрыть"){
                        if(isNew || title.isBlank())onBack() else saveThen(onBack)
                    }
                }
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Row(Modifier.clip(CircleShape)
                        .background(c.purple.copy(alpha=if(dark).17f else .10f))
                        .border(1.dp,c.purple.copy(alpha=.36f),CircleShape)
                        .clickable(enabled=!busy,onClick=datePicker)
                        .padding(horizontal=12.dp,vertical=10.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        Icon(Icons.Default.CalendarMonth,null,modifier=Modifier.size(17.dp),
                            tint=c.teal)
                        Text("Выбрать дату",fontSize=13.sp,fontWeight=FontWeight.SemiBold,
                            color=c.purple,maxLines=1)
                    }
                    Text(if(dueDate==null)"Срок не задан" else childRemaining(dueDate),
                        Modifier.weight(1f),
                        color=if(childMillis(dueDate)?.let{it<System.currentTimeMillis()}==true)
                            c.danger else c.muted,
                        fontSize=12.sp,fontWeight=FontWeight.SemiBold,maxLines=2)
                    if(dueDate!=null)IconButton(onClick={dueDate=null},
                        modifier=Modifier.size(26.dp)){
                        Icon(Icons.Default.Close,"Убрать срок",tint=c.muted,
                            modifier=Modifier.size(14.dp))
                    }
                }
                Spacer(Modifier.height(16.dp))
                Surface(color=c.bg,shape=RoundedCornerShape(16.dp),
                    border=BorderStroke(1.dp,if(dark)Color(0xFF504771) else Color(0xFFD6D2E5))){
                    NativeRichTextEditor(value=description,
                        onChange={description=it;onClearError()},dark=dark,
                        editorKey="child-inline-"+key,inline=true,
                        modifier=Modifier.fillMaxWidth().height(112.dp))
                }
                if(!isNew){
                    Spacer(Modifier.height(9.dp))
                    Row(Modifier.clip(CircleShape).background(c.panel)
                        .border(1.dp,c.line,CircleShape)
                        .clickable{saveThen(onBack)}
                        .padding(horizontal=11.dp,vertical=7.dp),
                        verticalAlignment=Alignment.CenterVertically) {
                        Icon(Icons.Default.ArrowUpward,null,tint=c.teal,
                            modifier=Modifier.size(14.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Основная задача: "+parent.title,color=c.ink,fontSize=11.sp,
                            fontWeight=FontWeight.SemiBold,maxLines=1,
                            overflow=TextOverflow.Ellipsis)
                    }
                }
                Row(Modifier.padding(top=12.dp,bottom=10.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(9.dp)){
                    val editAccent=if(dark)c.purple else c.teal
                    Row(Modifier.clip(CircleShape)
                        .background(if(dark)c.panel else c.bg)
                        .border(1.dp,editAccent.copy(alpha=.36f),CircleShape)
                        .clickable(enabled=!busy){descriptionExpanded=true}
                        .padding(horizontal=14.dp,vertical=10.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        Icon(Icons.Default.Edit,null,tint=editAccent,
                            modifier=Modifier.size(17.dp))
                        Text("Редактировать описание",fontSize=13.sp,
                            fontWeight=FontWeight.SemiBold,
                            color=if(dark)c.ink else c.teal)
                    }
                    if(task!=null)ChildRoundIcon(Icons.Default.AttachFile,c,"Прикрепить файл"){
                        filePicker.launch(arrayOf("*/*"))
                    }
                }
                if(task!=null && vmState.attachmentTaskId==task.id){
                    if(vmState.taskAttachmentsBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
                    vmState.taskAttachmentsError?.let{
                        Text(it,color=c.danger,fontSize=12.sp)
                    }
                    vmState.taskAttachments.forEach{attachment->
                        Row(Modifier.fillMaxWidth().padding(bottom=5.dp)
                            .clip(RoundedCornerShape(11.dp))
                            .background(c.panel)
                            .border(1.dp,c.line,RoundedCornerShape(11.dp))
                            .padding(start=7.dp),verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.AttachFile,null,tint=c.purple,
                                modifier=Modifier.size(13.dp))
                            Text(attachment.name,Modifier.weight(1f)
                                .clickable{
                                    vm.openTaskAttachmentLink(task.id,attachment.id){url->
                                        runCatching{ctx.startActivity(
                                            Intent(Intent.ACTION_VIEW,Uri.parse(url)))}
                                    }
                                }.padding(9.dp),color=c.ink,
                                fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                            IconButton(onClick={pendingAction="file:"+attachment.id},
                                enabled=!vmState.taskAttachmentsBusy,
                                modifier=Modifier.size(30.dp)) {
                                Icon(Icons.Default.Close,"Удалить вложение",tint=c.muted,
                                    modifier=Modifier.size(14.dp))
                            }
                        }
                    }
                }
                    }
                    // Sticky actions remain reachable when the IME shrinks the dialog.
                    Column(Modifier.fillMaxWidth().background(c.bg)
                        .padding(start=16.dp,end=16.dp,top=9.dp,bottom=14.dp)) {
                        if(isNew){
                            ChildAction("Создать подзадачу",Icons.Default.Add,Color(0xFF059669),
                                Modifier.fillMaxWidth(),
                                enabled=!busy && title.isNotBlank() && !saving){
                                saveThen(onBack)
                            }
                        }else if(task!=null){
                            Row(Modifier.fillMaxWidth(),
                                horizontalArrangement=Arrangement.spacedBy(9.dp)){
                                ChildAction(if(task.status==TaskStatus.DONE)"Вернуть" else "Выполнить",
                                    Icons.Default.CheckCircle,Color(0xFF059669),
                                    Modifier.weight(1.9f),enabled=!busy){
                                    if(task.status==TaskStatus.DONE)
                                        saveThen{onChangeStatus(task.id,TaskStatus.TODO,onBack)}
                                    else pendingAction="complete"
                                }
                                ChildAction("Удалить",Icons.Default.DeleteOutline,c.danger,
                                    Modifier.weight(.9f),enabled=!busy,outlined=true){
                                    pendingAction="delete"
                                }
                            }
                        }
                        error?.let{Text(it,color=c.danger,
                            modifier=Modifier.padding(top=8.dp),fontSize=12.sp)}
                    }
                }
            }
        }
    }
    if(descriptionExpanded) NativeRichDescriptionDialog(
        title="Описание подзадачи",value=description,dark=dark,
        editorKey=key,onChange={description=it;onClearError()},
        onClose={descriptionExpanded=false}
    )
    pendingAction?.let{action->
        val isFile=action.startsWith("file:")
        AlertDialog(onDismissRequest={pendingAction=null},
            title={Text(if(isFile)"Удалить вложение?"
                else if(action=="delete")"Удалить подзадачу?" else "Выполнить подзадачу?")},
            text={Text(if(isFile)"Вложение будет удалено."
                else "Подзадача: "+(task?.title ?: title))},
            confirmButton={
                TextButton(onClick={
                    pendingAction=null
                    if(isFile && task!=null)vm.removeTaskAttachment(task.id,action.removePrefix("file:"))
                    else if(task!=null && action=="delete")onDelete(task.id,onBack)
                    else if(task!=null)saveThen{onChangeStatus(task.id,TaskStatus.DONE,onBack)}
                }){Text(if(isFile || action=="delete")"Удалить" else "Выполнить")}
            },dismissButton={TextButton(onClick={pendingAction=null}){Text("Отмена")}})
    }
}
@Composable private fun ChildRoundIcon(
    icon:androidx.compose.ui.graphics.vector.ImageVector,c:ChildColors,
    label:String,onClick:()->Unit
){
    Box(Modifier.size(34.dp).clip(CircleShape).background(c.bg)
        .border(1.dp,c.teal.copy(alpha=.3f),CircleShape)
        .clickable(onClick=onClick),contentAlignment=Alignment.Center){
        Icon(icon,label,tint=c.teal,modifier=Modifier.size(17.dp))
    }
}
@Composable private fun ChildAction(
    label:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    color:Color,modifier:Modifier,enabled:Boolean,outlined:Boolean=false,
    onClick:()->Unit
){
    Row(modifier.height(44.dp).clip(CircleShape)
        .background(if(outlined)Color.Transparent else color)
        .then(if(outlined)Modifier.border(1.dp,color.copy(alpha=.58f),CircleShape)
            else Modifier)
        .clickable(enabled=enabled,onClick=onClick)
        .alpha(if(enabled)1f else .45f),
        horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){
        val foreground=if(outlined)color else Color.White
        Icon(icon,null,tint=foreground,modifier=Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label,color=foreground,fontSize=14.sp,fontWeight=FontWeight.Bold)
    }
}
private fun childReadDescription(text:String)=
    if(Regex("<[a-zA-Z][^>]*>").containsMatchIn(text))
        Html.fromHtml(text,Html.FROM_HTML_MODE_COMPACT).toString().trimEnd()
    else text
private fun childLocalDate(value:String?):LocalDateTime?{
    if(value.isNullOrBlank())return null
    return runCatching{OffsetDateTime.parse(value).atZoneSameInstant(
        ZoneId.systemDefault()).toLocalDateTime()}
        .recoverCatching{Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDateTime()}
        .getOrNull()
}
private fun childMillis(value:String?)=childLocalDate(value)?.atZone(ZoneId.systemDefault())
    ?.toInstant()?.toEpochMilli()
private fun childRemaining(value:String?):String{
    val millis=childMillis(value) ?: return "Срок не задан"
    val delta=millis-System.currentTimeMillis()
    val minutes=(kotlin.math.abs(delta)/60000).coerceAtLeast(1L)
    val hours=minutes/60
    return if(hours>0)
        hours.toString()+" ч"+if(delta<0)" назад" else ""
    else minutes.toString()+" мин"+if(delta<0)" назад" else ""
}
