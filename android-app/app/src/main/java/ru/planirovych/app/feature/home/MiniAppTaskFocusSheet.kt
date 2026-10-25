package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.Html
import android.content.Intent
import android.net.Uri
import android.provider.CalendarContract
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.*
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*

private data class FocusColors(
    val bg: Color, val text: Color, val muted: Color, val border: Color,
    val card: Color, val teal: Color, val purple: Color, val red: Color,
)
private fun focusColors(dark: Boolean) = if (dark) FocusColors(
    Color(0xFF101B2D), Color(0xFFF1F5F9), Color(0xFFA5B4CA),
    Color(0xFF394A63), Color(0xFF1B2A40), Color(0xFF67E8F9),
    Color(0xFFC4B5FD), Color(0xFFFB7185)
) else FocusColors(
    Color.White, Color(0xFF10182A), Color(0xFF64748B),
    Color(0xFFDCE3ED), Color(0xFFFAFBFD), Color(0xFF0891B2),
    Color(0xFF7C3AED), Color(0xFFDB355C)
)
private enum class FocusOrder(val label: String) {
    URGENCY("По срочности"), IMPORTANCE("По важности"), NEWEST("Без фильтра")
}

/** Focus view aligned to the current Mini App; subtask editor stays unchanged. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MiniAppTaskFocusSheet(
    task: Task, tasks: List<Task>, spheres: List<Sphere>, dark: Boolean,
    vm: HomeViewModel,
    busy: Boolean, error: String?,
    onBack: () -> Unit, onOpenSubtask: (String) -> Unit, onNewSubtask: () -> Unit,
    onSave: (String, JsonObject, () -> Unit) -> Unit,
    onChangeStatus: (String, TaskStatus, () -> Unit) -> Unit,
    onDelete: (String, () -> Unit) -> Unit, onClearError: () -> Unit,
    onOpenAiChat:(String)->Unit,
) {
    val c=remember(dark){focusColors(dark)}
    val ctx=LocalContext.current
    val state by vm.state.collectAsStateWithLifecycle()
    val scope=rememberCoroutineScope()
    var title by remember(task.id){mutableStateOf(task.title)}
    val initialDescription=remember(task.id){task.description.orEmpty()}
    var description by remember(task.id){mutableStateOf(initialDescription)}
    var dueDate by remember(task.id){mutableStateOf(task.dueDate)}
    var sphereId by remember(task.id){mutableStateOf(task.sphereId)}
    var importance by remember(task.id){mutableIntStateOf(task.importance.coerceIn(1,5))}
    var notifyMinutes by remember(task.id){mutableStateOf(task.notifyBeforeMinutes)}
    var aiNotifications by remember(task.id){mutableStateOf(task.aiNotificationsEnabled)}
    var showDone by remember(task.id){mutableStateOf(false)}
    var order by remember(task.id){mutableStateOf(FocusOrder.URGENCY)}
    var orderOpen by remember{mutableStateOf(false)}
    var settingsOpen by remember{mutableStateOf(false)}
    var sectorMenu by remember{mutableStateOf(false)}
    var notifyMenu by remember{mutableStateOf(false)}
    var descriptionExpanded by remember{mutableStateOf(false)}
    var confirmation by remember{mutableStateOf<String?>(null)}
    var saving by remember{mutableStateOf(false)}
    val maxSheetHeight = (LocalConfiguration.current.screenHeightDp * .83f).dp

    val saveThen: ((()->Unit)->Unit)={after->
        if(!busy && !saving && title.isNotBlank()) {
            val changes=buildJsonObject {
                if(title.trim()!=task.title)put("title",title.trim())
                if(description!=initialDescription) {
                    if(description.isBlank())put("description",JsonNull) else put("description",description)
                }
                if(dueDate!=task.dueDate) {
                    if(dueDate==null)put("dueDate",JsonNull)else put("dueDate",dueDate)
                }
                if(sphereId!=task.sphereId) {
                    if(sphereId==null)put("sphereId",JsonNull)else put("sphereId",sphereId)
                }
                if(importance!=task.importance)put("importance",importance)
                if(notifyMinutes!=task.notifyBeforeMinutes) {
                    if(notifyMinutes==null)put("notifyBeforeMinutes",JsonNull)
                    else put("notifyBeforeMinutes",notifyMinutes)
                }
                if(aiNotifications!=task.aiNotificationsEnabled)
                    put("aiNotificationsEnabled",aiNotifications)
            }
            if(changes.isEmpty())after()
            else {
                saving=true
                onSave(task.id,changes) { saving=false;after() }
            }
        }
    }
    LaunchedEffect(busy,error) {
        if(!busy && error!=null) saving=false
    }
    val selectDueDate={
        val old=focusDate(dueDate) ?: LocalDateTime.now()
        DatePickerDialog(ctx,{_,year,month,day->
            TimePickerDialog(ctx,{_,hour,minute->
                dueDate=LocalDateTime.of(year,month+1,day,hour,minute)
                    .atZone(ZoneId.systemDefault()).toOffsetDateTime()
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            },old.hour,old.minute,true).show()
        },old.year,old.monthValue-1,old.dayOfMonth).show()
    }

    LaunchedEffect(task.id){vm.loadTaskAttachments(task.id)}
    val pickFile=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri!=null){
            scope.launch {
                try {
                    val data=withContext(Dispatchers.IO){
                        val bytes=ctx.contentResolver.openInputStream(uri)?.use{it.readBytes()}
                            ?: throw IllegalStateException("Не удалось открыть файл")
                        val name=ctx.contentResolver.query(uri,
                            arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{
                                if(it.moveToFirst())it.getString(0) else null
                            }?.takeIf{it.isNotBlank()} ?: "Вложение"
                        Triple(name,ctx.contentResolver.getType(uri) ?: "application/octet-stream",bytes)
                    }
                    vm.uploadTaskAttachment(task.id,data.first,data.second,data.third)
                } catch(cause:Throwable){
                    Toast.makeText(ctx,cause.message ?: "Не удалось прочитать файл",Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    ModalBottomSheet(onDismissRequest={if(title.isBlank())onBack() else saveThen(onBack)},
        containerColor=c.bg,contentColor=c.text,
        shape=RoundedCornerShape(topStart=30.dp,topEnd=30.dp),
        sheetGesturesEnabled=true,
        dragHandle={ BottomSheetDefaults.DragHandle(color=c.muted) },
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)){
        // Material handles a downward drag from both the handle and scroll content.
        // The fixed maximum height avoids fighting the inner scrollable task list.
        Column(Modifier.fillMaxWidth().heightIn(max=maxSheetHeight).imePadding()){
            Row(Modifier.fillMaxWidth().padding(start=15.dp,end=15.dp,bottom=10.dp),
                verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.SpaceBetween){
                Text(if(task.taskType==TaskType.EVENT)"РЕДАКТИРОВАНИЕ СОБЫТИЯ" else "ФОКУС ЗАДАЧИ",
                    modifier=Modifier.weight(1f),
                    color=c.purple,fontSize=11.sp,fontWeight=FontWeight.Bold,
                    letterSpacing=2.sp,maxLines=1)
                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    FocusRoundIcon(Icons.Default.EventAvailable,c,"В календарь"){
                        saveThen {
                            val intent=Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
                                .putExtra(CalendarContract.Events.TITLE,title.trim())
                                .putExtra(CalendarContract.Events.DESCRIPTION,description)
                            focusEpoch(dueDate)?.let{
                                intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,it)
                                intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME,it+3600000L)
                            }
                            runCatching{ctx.startActivity(intent)}
                        }
                    }
                    FocusRoundIcon(Icons.Default.Settings,c,"Настройки"){settingsOpen=true}
                    FocusRoundIcon(Icons.Default.Close,c,"Сохранить и закрыть"){
                        if(title.isBlank())onBack() else saveThen(onBack)
                    }
                }
            }
            Column(Modifier.weight(1f,fill=false).verticalScroll(rememberScrollState())
                .padding(horizontal=15.dp).padding(bottom=20.dp)){
                BasicTextField(value=title,onValueChange={title=it;onClearError()},
                    modifier=Modifier.fillMaxWidth().padding(top=5.dp,bottom=8.dp),
                    textStyle=TextStyle(color=c.text,fontSize=27.sp,fontWeight=FontWeight.Bold,
                        lineHeight=32.sp,letterSpacing=(-0.6f).sp),
                    maxLines=4,enabled=!busy,cursorBrush=SolidColor(c.purple),
                    decorationBox={inner->Box{
                        if(title.isEmpty())Text("Без названия",color=c.muted,fontSize=27.sp)
                        inner()
                    }}
                )
                Row(verticalAlignment=Alignment.CenterVertically,
                    modifier=Modifier.fillMaxWidth()){
                    FocusRoundIcon(Icons.Default.CalendarMonth,c,"Изменить дедлайн",selectDueDate)
                    Spacer(Modifier.width(9.dp))
                    val expired=focusEpoch(dueDate)?.let{it<System.currentTimeMillis()}==true
                    Text(if(dueDate==null)"Дедлайн не задан" else "До дедлайна: "+focusRelative(dueDate),
                        Modifier.weight(1f).clickable(onClick=selectDueDate),
                        fontWeight=FontWeight.SemiBold,fontSize=13.sp,
                        color=if(expired)c.red else c.purple,maxLines=2)
                    if(dueDate!=null)IconButton(onClick={dueDate=null},modifier=Modifier.size(28.dp)){
                        Icon(Icons.Default.Close,"Убрать срок",tint=c.muted,modifier=Modifier.size(15.dp))
                    }
                }
                Spacer(Modifier.height(12.dp))
                Surface(shape=RoundedCornerShape(18.dp),color=c.bg,
                    border=BorderStroke(1.dp,if(dark)Color(0xFF504B70) else Color(0xFFD8D6E3))){
                    Box(Modifier.fillMaxWidth().height(128.dp)
                        .clickable(enabled=!busy){descriptionExpanded=true}
                        .padding(horizontal=12.dp,vertical=11.dp)){
                        Text(focusReadableDescription(description)
                                .ifBlank{"Введите описание"},
                            color=if(description.isBlank())c.muted else c.text,
                            fontSize=14.sp,lineHeight=24.sp,
                            maxLines=5,overflow=TextOverflow.Ellipsis)
                    }
                }
                Row(Modifier.padding(top=9.dp,bottom=10.dp),
                    horizontalArrangement=Arrangement.spacedBy(9.dp)){
                    FocusRoundIcon(Icons.Default.OpenInFull,c,"Развернуть описание"){
                        descriptionExpanded=true
                    }
                    FocusRoundIcon(Icons.Default.AttachFile,c,"Прикрепить файл"){
                        pickFile.launch(arrayOf("*/*"))
                    }
                }

                if(state.attachmentTaskId==task.id){
                    if(state.taskAttachmentsBusy)LinearProgressIndicator(Modifier.fillMaxWidth())
                    state.taskAttachmentsError?.let {
                        Text(it,color=c.red,fontSize=12.sp,modifier=Modifier.padding(bottom=6.dp))
                    }
                    state.taskAttachments.forEach{attachment->
                        Row(Modifier.fillMaxWidth().padding(bottom=6.dp)
                            .clip(RoundedCornerShape(12.dp)).background(c.card)
                            .border(1.dp,c.border,RoundedCornerShape(12.dp))
                            .padding(start=9.dp),verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.AttachFile,null,tint=c.purple,
                                modifier=Modifier.size(14.dp))
                            Text(attachment.name,Modifier.weight(1f)
                                .clickable {
                                    vm.openTaskAttachmentLink(task.id,attachment.id){ url ->
                                        runCatching { ctx.startActivity(
                                            Intent(Intent.ACTION_VIEW,Uri.parse(url))) }
                                    }
                                }.padding(horizontal=9.dp,vertical=10.dp),
                                fontSize=12.sp,color=c.text,maxLines=1,overflow=TextOverflow.Ellipsis)
                            IconButton(onClick={confirmation="file:"+attachment.id},
                                enabled=!state.taskAttachmentsBusy,
                                modifier=Modifier.size(32.dp)){
                                Icon(Icons.Default.Close,"Удалить вложение",
                                    tint=c.muted,modifier=Modifier.size(14.dp))
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top=3.dp),
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    FocusAction("Выполнить",Icons.Default.CheckCircle,Color(0xFF059669),
                        Modifier.weight(1f),enabled=!busy){confirmation="complete"}
                    FocusAction("Удалить",Icons.Default.DeleteOutline,Color(0xFFE11D48),
                        Modifier.weight(1f),enabled=!busy){confirmation="delete"}
                }
                if(task.taskType!=TaskType.EVENT){
                    Spacer(Modifier.height(8.dp))
                    FocusAction("Открыть диалог с ИИ",Icons.Default.SmartToy,Color(0xFF9333EA),
                        Modifier.fillMaxWidth(),enabled=!busy,
                        gradient=Brush.horizontalGradient(listOf(Color(0xFF7C3AED),Color(0xFFA855F7)))){
                        saveThen { onOpenAiChat(task.id) }
                    }
                    Spacer(Modifier.height(20.dp))
                    HorizontalDivider(color=c.border)
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                        verticalAlignment=Alignment.CenterVertically){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Text("Подзадачи",color=c.text,fontSize=15.sp,fontWeight=FontWeight.SemiBold)
                            Spacer(Modifier.width(6.dp))
                            FocusRoundIcon(Icons.Default.Add,c,"Добавить подзадачу"){
                                saveThen(onNewSubtask)
                            }
                            IconButton(onClick={showDone=!showDone},modifier=Modifier.size(30.dp)){
                                Icon(if(showDone)Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                    if(showDone)"Скрыть выполненные" else "Показать выполненные",
                                    tint=c.teal,modifier=Modifier.size(17.dp))
                            }
                        }
                        Box{
                            Box(Modifier.clip(CircleShape).background(Color(0xFF0284C7))
                                .clickable{orderOpen=true}.padding(horizontal=13.dp,vertical=10.dp)){
                                Text("Фильтровать",color=Color.White,fontSize=12.sp,
                                    fontWeight=FontWeight.Bold)
                            }
                            DropdownMenu(expanded=orderOpen,onDismissRequest={orderOpen=false}){
                                FocusOrder.entries.forEach{option->
                                    DropdownMenuItem(text={Text(option.label)},onClick={
                                        order=option;orderOpen=false
                                    })
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(11.dp))
                    val subtasks=tasks.filter{it.parentTaskId==task.id}
                        .filter{showDone || it.status!=TaskStatus.DONE}
                        .sortedWith(compareBy<Task>{it.status==TaskStatus.DONE}
                            .thenComparator{a,b->when(order){
                                FocusOrder.URGENCY->compareValues(
                                    focusEpoch(a.dueDate) ?: Long.MAX_VALUE,
                                    focusEpoch(b.dueDate) ?: Long.MAX_VALUE)
                                FocusOrder.IMPORTANCE->compareValues(b.importance,a.importance)
                                FocusOrder.NEWEST->compareValues(b.createdAt ?: "",a.createdAt ?: "")
                            }})
                    if(subtasks.isEmpty())Text(if(showDone)"Пока нет подзадач" else
                        "Активных подзадач пока нет",color=c.muted,fontSize=12.sp)
                    subtasks.forEach{item->
                        FocusSubtask(item,c,busy,
                            onToggle={onChangeStatus(item.id,if(item.status==TaskStatus.DONE)
                                TaskStatus.TODO else TaskStatus.DONE){}},
                            onOpen={saveThen{onOpenSubtask(item.id)}})
                        Spacer(Modifier.height(8.dp))
                    }
                }
                error?.let{Text(it,color=c.red,fontSize=12.sp,
                    modifier=Modifier.padding(top=12.dp))}
            }
        }
    }
    if(settingsOpen) FocusTaskSettingsDialog(
        colors=c,
        task=task,
        sectors=spheres,
        selectedSector=sphereId,
        onSector={sphereId=it},
        notifyBefore=notifyMinutes,
        onNotify={notifyMinutes=it},
        aiNotifications=aiNotifications,
        onAiNotifications={aiNotifications=it},
        importance=importance,
        onImportance={importance=it},
        onClose={settingsOpen=false},
    )
    if(descriptionExpanded) NativeRichDescriptionDialog(
        title="Описание задачи",value=description,dark=dark,
        editorKey=task.id,onChange={description=it;onClearError()},
        onClose={descriptionExpanded=false}
    )
    confirmation?.let{action->
        val isFile=action.startsWith("file:")
        AlertDialog(onDismissRequest={confirmation=null},
            title={Text(if(isFile)"Удалить вложение?" else if(action=="delete")
                "Удалить задачу?" else "Выполнить задачу?")},
            text={Text(if(isFile)"Вложение будет удалено из задачи." else
                (if(action=="delete")"Удалить «" else "Выполнить «")+task.title+"»?")},
            confirmButton={TextButton(onClick={
                confirmation=null
                if(isFile)vm.removeTaskAttachment(task.id,action.removePrefix("file:"))
                else if(action=="delete")onDelete(task.id,onBack)
                else saveThen{onChangeStatus(task.id,TaskStatus.DONE,onBack)}
            }){Text(if(isFile || action=="delete")"Удалить" else "Выполнить")}},
            dismissButton={TextButton(onClick={confirmation=null}){Text("Отмена")}}
        )
    }
}

// Mini App's compact settings popover, anchored near the upper right of the focus sheet.
@Composable
private fun FocusTaskSettingsDialog(
    colors: FocusColors,
    task: Task,
    sectors: List<Sphere>,
    selectedSector: String?,
    onSector: (String?) -> Unit,
    notifyBefore: Int?,
    onNotify: (Int?) -> Unit,
    aiNotifications: Boolean,
    onAiNotifications: (Boolean) -> Unit,
    importance: Int,
    onImportance: (Int) -> Unit,
    onClose: () -> Unit,
) {
    var sectorMenu by remember { mutableStateOf(false) }
    var notifyMenu by remember { mutableStateOf(false) }
    val c = colors
    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)) {
        Box(Modifier.fillMaxSize().padding(top=64.dp,end=12.dp,start=12.dp),
            contentAlignment=Alignment.TopEnd) {
            Surface(
                modifier=Modifier.widthIn(max=355.dp).heightIn(max=550.dp),
                shape=RoundedCornerShape(23.dp),
                color=c.bg,
                border=BorderStroke(1.dp,c.purple.copy(alpha=.40f)),
                shadowElevation=20.dp,
            ) {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(15.dp),
                    verticalArrangement=Arrangement.spacedBy(14.dp)) {
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween) {
                        Text(if(task.taskType==TaskType.EVENT)"Настройки события" else
                            "Настройки задачи",fontSize=15.sp,
                            color=c.text,fontWeight=FontWeight.Bold)
                        FocusRoundIcon(Icons.Default.Close,c,"Закрыть настройки",onClose)
                    }
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("Сектор",color=c.muted,fontSize=11.sp,
                                fontWeight=FontWeight.SemiBold)
                            Spacer(Modifier.height(5.dp))
                            Box {
                                Row(Modifier.fillMaxWidth().height(39.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(c.card)
                                    .border(1.dp,c.border,RoundedCornerShape(12.dp))
                                    .clickable{sectorMenu=true}
                                    .padding(horizontal=9.dp),
                                    verticalAlignment=Alignment.CenterVertically) {
                                    val sphere=sectors.firstOrNull{it.id==selectedSector}
                                    sphere?.let {
                                        Box(Modifier.size(8.dp).clip(CircleShape)
                                            .background(runCatching{
                                                Color(android.graphics.Color.parseColor(it.color))
                                            }.getOrDefault(c.purple)))
                                        Spacer(Modifier.width(5.dp))
                                    }
                                    Text(sphere?.name ?: "Без сектора",
                                        Modifier.weight(1f),fontSize=11.sp,
                                        maxLines=1,overflow=TextOverflow.Ellipsis,color=c.text)
                                    Icon(Icons.Default.ExpandMore,null,tint=c.muted,
                                        modifier=Modifier.size(14.dp))
                                }
                                DropdownMenu(expanded=sectorMenu,onDismissRequest={sectorMenu=false}) {
                                    DropdownMenuItem(text={Text("Без сектора")},onClick={
                                        onSector(null);sectorMenu=false
                                    })
                                    sectors.forEach { sphere->
                                        DropdownMenuItem(text={Text(sphere.name)},onClick={
                                            onSector(sphere.id);sectorMenu=false
                                        })
                                    }
                                }
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text("Уведомлять за",color=c.muted,fontSize=11.sp,
                                fontWeight=FontWeight.SemiBold)
                            Spacer(Modifier.height(5.dp))
                            Box {
                                Row(Modifier.fillMaxWidth().height(39.dp)
                                    .clip(RoundedCornerShape(12.dp)).background(c.card)
                                    .border(1.dp,c.border,RoundedCornerShape(12.dp))
                                    .clickable(enabled=!task.isRecurring){notifyMenu=true}
                                    .padding(horizontal=9.dp),
                                    verticalAlignment=Alignment.CenterVertically) {
                                    Text(when(notifyBefore){
                                        null -> "Не уведомлять"
                                        0 -> "В дедлайн"
                                        60 -> "За час"
                                        1440 -> "За сутки"
                                        else -> "За ${notifyBefore} мин"
                                    },Modifier.weight(1f),fontSize=11.sp,color=c.text,
                                        maxLines=1,overflow=TextOverflow.Ellipsis)
                                    Icon(Icons.Default.ExpandMore,null,tint=c.muted,
                                        modifier=Modifier.size(14.dp))
                                }
                                DropdownMenu(expanded=notifyMenu,onDismissRequest={notifyMenu=false}) {
                                    listOf(null,0,5,10,15,30,60,120,1440).forEach { minutes ->
                                        DropdownMenuItem(text={Text(when(minutes){
                                            null -> "Не уведомлять"
                                            0 -> "В момент дедлайна"
                                            60 -> "За 1 час"
                                            120 -> "За 2 часа"
                                            1440 -> "За сутки"
                                            else -> "За ${minutes} минут"
                                        })},onClick={onNotify(minutes);notifyMenu=false})
                                    }
                                }
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                        Checkbox(checked=task.isRecurring,onCheckedChange=null,
                            modifier=Modifier.size(30.dp))
                        Spacer(Modifier.width(7.dp))
                        Text("повторять",color=c.text,fontSize=13.sp)
                    }
                    if(task.isRecurring) {
                        Text("Повторение: "+(task.recurrenceSummary ?: "включено")+
                            ". Изменить расписание повторений можно в Mini App.",
                            fontSize=11.sp,color=c.muted,lineHeight=16.sp)
                    }
                    if(task.taskType!=TaskType.EVENT) {
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                            Checkbox(checked=aiNotifications,
                                onCheckedChange=onAiNotifications,
                                modifier=Modifier.size(30.dp))
                            Spacer(Modifier.width(7.dp))
                            Text("уведомления от ИИ",fontSize=13.sp,color=c.text)
                        }
                        Text("Важность: ${importance}",color=c.muted,fontSize=12.sp,
                            fontWeight=FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(7.dp)) {
                            (1..5).forEach { level ->
                                Box(Modifier.weight(1f).height(39.dp)
                                    .clip(RoundedCornerShape(11.dp))
                                    .background(if(level==importance)c.purple else c.card)
                                    .border(1.dp,if(level==importance)c.purple else c.border,
                                        RoundedCornerShape(11.dp))
                                    .clickable{onImportance(level)},
                                    contentAlignment=Alignment.Center) {
                                    Text(level.toString(),fontSize=13.sp,
                                        fontWeight=FontWeight.Bold,
                                        color=if(level==importance)Color.White else c.text)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun FocusRoundIcon(icon:androidx.compose.ui.graphics.vector.ImageVector,
    c:FocusColors,label:String,click:()->Unit){
    Box(Modifier.size(34.dp).clip(CircleShape).background(c.bg)
        .border(1.dp,c.teal.copy(alpha=.25f),CircleShape).clickable(onClick=click),
        contentAlignment=Alignment.Center){
        Icon(icon,label,modifier=Modifier.size(19.dp),tint=c.teal)
    }
}
@Composable private fun FocusAction(text:String,
    icon:androidx.compose.ui.graphics.vector.ImageVector,color:Color,
    modifier:Modifier,enabled:Boolean,gradient:Brush?=null,click:()->Unit){
    Row(modifier.height(36.dp).clip(CircleShape)
        .then(if(gradient!=null)Modifier.background(gradient)else Modifier.background(color))
        .clickable(enabled=enabled,onClick=click)
        .alpha(if(enabled)1f else .52f),
        horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically){
        Icon(icon,null,tint=Color.White,modifier=Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(text,color=Color.White,fontSize=13.sp,fontWeight=FontWeight.Bold,maxLines=1)
    }
}
@Composable private fun FocusSubtask(task:Task,c:FocusColors,busy:Boolean,
    onToggle:()->Unit,onOpen:()->Unit){
    Surface(shape=RoundedCornerShape(15.dp),color=c.card,
        border=BorderStroke(1.dp,c.border),shadowElevation=1.dp){
        Row(Modifier.fillMaxWidth().heightIn(min=58.dp)
            .padding(horizontal=10.dp),verticalAlignment=Alignment.CenterVertically){
            Box(Modifier.size(33.dp).clickable(enabled=!busy,onClick=onToggle),
                contentAlignment=Alignment.Center){
                Box(Modifier.size(20.dp).clip(RoundedCornerShape(6.dp))
                    .border(1.5.dp,c.purple,RoundedCornerShape(6.dp))
                    .background(if(task.status==TaskStatus.DONE)c.purple else c.purple.copy(alpha=.06f)),
                    contentAlignment=Alignment.Center){
                    if(task.status==TaskStatus.DONE)Icon(Icons.Default.Check,null,
                        tint=Color.White,modifier=Modifier.size(15.dp))
                }
            }
            Spacer(Modifier.width(7.dp))
            Text(task.title,Modifier.weight(1f).clickable(enabled=!busy,onClick=onOpen)
                .padding(vertical=12.dp),fontWeight=FontWeight.SemiBold,fontSize=14.sp,
                maxLines=1,overflow=TextOverflow.Ellipsis,
                color=if(task.status==TaskStatus.DONE)c.muted else c.text,
                textDecoration=if(task.status==TaskStatus.DONE)
                    TextDecoration.LineThrough else TextDecoration.None)
            task.dueDate?.let{
                Spacer(Modifier.width(5.dp))
                Text(focusSubtaskRemaining(it),
                    fontSize=11.sp,fontWeight=FontWeight.SemiBold,maxLines=1,
                    color=if((focusEpoch(it)?:Long.MAX_VALUE)<System.currentTimeMillis())c.red else c.purple,
                    modifier=Modifier.clickable(onClick=onOpen))
            }
        }
    }
}
private fun focusDate(value:String?):LocalDateTime?{
    if(value.isNullOrBlank())return null
    return runCatching{OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()}
        .recoverCatching{Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDateTime()}.getOrNull()
}
private fun focusEpoch(value:String?):Long?=focusDate(value)
    ?.atZone(ZoneId.systemDefault())?.toInstant()?.toEpochMilli()
private fun focusRelative(value:String?):String{
    val end=focusEpoch(value)?:return "Срок не задан"
    val diff=end-System.currentTimeMillis()
    val abs=kotlin.math.round(kotlin.math.abs(diff)/60000.0).toLong()
    if(abs<1)return if(diff>=0)"Дедлайн прямо сейчас" else "Просрочено только что"
    val days=abs/1440
    val hours=(abs%1440)/60
    val minutes=abs%60
    val parts=mutableListOf<String>()
    if(days>0)parts.add(days.toString()+"д")
    if(hours>0)parts.add(hours.toString()+"ч")
    if(minutes>0 && days==0L)parts.add(minutes.toString()+"м")
    return (if(diff<0)"Просрочено на " else "Через ")+parts.joinToString(" ")
}
private fun focusSubtaskRemaining(value:String):String{
    val diff=(focusEpoch(value)?:return "")-System.currentTimeMillis()
    val hrs=kotlin.math.abs(diff)/3600000
    val mins=(kotlin.math.abs(diff)%3600000)/60000
    return (if(hrs==0L)mins.coerceAtLeast(1).toString()+" м" else hrs.toString()+" ч")+
        if(diff<0)" назад" else ""
}

/** Show the same readable description as Mini App; untouched rich text stays intact. */
private fun focusReadableDescription(raw: String): String =
    if(Regex("<[a-zA-Z][^>]*>").containsMatchIn(raw))
        Html.fromHtml(raw, Html.FROM_HTML_MODE_COMPACT).toString().trimEnd()
    else raw
