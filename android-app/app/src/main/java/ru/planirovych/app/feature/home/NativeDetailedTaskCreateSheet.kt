package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*

private data class CreatePalette(
    val surface:Color,val text:Color,val muted:Color,val border:Color,
    val field:Color,val violet:Color,val teal:Color
)
private fun createPalette(dark:Boolean)=if(dark)CreatePalette(
    Color(0xFF121E31),Color(0xFFF1F5F9),Color(0xFFA6B7D0),Color(0xFF3B4B63),
    Color(0xFF1A2A40),Color(0xFFC4B5FD),Color(0xFF67E8F9)
)else CreatePalette(Color.White,Color(0xFF10182A),Color(0xFF64748B),
    Color(0xFFD9E2EE),Color(0xFFF8FAFD),Color(0xFF6D28D9),Color(0xFF0891B2))
private data class DraftChild(
    val id:String=java.util.UUID.randomUUID().toString(),
    val title:String="",val description:String="",val date:String?=null
)
private fun chooseCreateDate(context:android.content.Context,raw:String?,onDate:(String)->Unit){
    val old=runCatching{
        OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
    }.getOrDefault(LocalDateTime.now())
    DatePickerDialog(context,{_,y,m,d->
        TimePickerDialog(context,{_,h,min->
            val due=LocalDateTime.of(y,m+1,d,h,min).atZone(ZoneId.systemDefault())
            onDate(due.toOffsetDateTime().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
        },old.hour,old.minute,true).show()
    },old.year,old.monthValue-1,old.dayOfMonth).show()
}
private fun createDateLabel(raw:String?):String=runCatching{
    OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm",Locale("ru")))
}.getOrDefault("Выбрать дату и время")

@Composable private fun CreateRoundIcon(
    icon:androidx.compose.ui.graphics.vector.ImageVector,label:String,
    c:CreatePalette,onClick:()->Unit){
    Box(Modifier.size(34.dp).clip(CircleShape).background(c.surface)
        .border(1.dp,c.teal.copy(alpha=.35f),CircleShape)
        .clickable(onClick=onClick),contentAlignment=Alignment.Center){
        Icon(icon,label,tint=c.teal,modifier=Modifier.size(18.dp))
    }
}
@Composable
private fun CreationChip(text:String,c:CreatePalette,onClick:()->Unit){
    Row(Modifier.heightIn(min=40.dp).clip(RoundedCornerShape(13.dp))
        .background(c.field).border(1.dp,c.border,RoundedCornerShape(13.dp))
        .clickable(onClick=onClick).padding(horizontal=11.dp,vertical=8.dp),
        verticalAlignment=Alignment.CenterVertically){
        Text(text,color=c.text,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis,
            modifier=Modifier.weight(1f))
        Spacer(Modifier.width(4.dp))
        Icon(Icons.Default.ArrowDropDown,null,tint=c.muted,modifier=Modifier.size(17.dp))
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeDetailedTaskCreateSheet(type:TaskType,vm:HomeViewModel,dark:Boolean,onClose:()->Unit){
    val state by vm.state.collectAsStateWithLifecycle()
    val c=remember(dark){createPalette(dark)}
    val ctx=LocalContext.current
    val scope=rememberCoroutineScope()
    var title by remember(type){mutableStateOf("")}
    var description by remember(type){mutableStateOf("")}
    var descriptionExpanded by remember(type){mutableStateOf(false)}
    var editingChildId by remember(type){mutableStateOf<String?>(null)}
    var location by remember(type){mutableStateOf("")}
    var dueDate by remember(type){mutableStateOf<String?>(null)}
    var sectorId by remember(type){mutableStateOf<String?>(null)}
    var notifyBefore by remember(type){mutableStateOf<Int?>(null)}
    var importance by remember(type){mutableIntStateOf(3)}
    var sectorOpen by remember{mutableStateOf(false)}
    var notifyOpen by remember{mutableStateOf(false)}
    var settingsOpen by remember{mutableStateOf(false)}
    var recurring by remember{mutableStateOf(false)}
    var recurrenceText by remember{mutableStateOf("")}
    var parsed by remember{mutableStateOf<RecurrenceParseResponse?>(null)}
    var aiNotifications by remember{mutableStateOf(true)}
    var aiMonitoring by remember{mutableStateOf(false)}
    var attachmentLoading by remember { mutableStateOf(false) }
    val children=remember { mutableStateListOf<DraftChild>() }
    val attachments=remember { mutableStateListOf<TaskCreationFile>() }
    val isEvent=type==TaskType.EVENT
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris->
        if(uris.isNotEmpty()){
            scope.launch {
                attachmentLoading=true
                try {
                    val added=withContext(Dispatchers.IO){
                        uris.map{uri->
                            val bytes=ctx.contentResolver.openInputStream(uri)?.use{it.readBytes()}
                                ?: throw IllegalStateException("Не удалось открыть файл")
                            if(bytes.isEmpty() || bytes.size>8*1024*1024)
                                throw IllegalStateException("Файлы должны быть от 1 байта до 8 МБ")
                            val name=ctx.contentResolver.query(uri,
                                arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{
                                if(it.moveToFirst())it.getString(0) else null
                            }?.takeIf{it.isNotBlank()} ?: "Вложение"
                            if(!Regex("(?i)\\.(pdf|docx|xls|xlsx|png|jpe?g|webp|gif|txt)$").containsMatchIn(name))
                                throw IllegalStateException("Поддерживаются PDF, DOCX, XLS/XLSX, TXT и изображения")
                            TaskCreationFile(name,ctx.contentResolver.getType(uri)
                                ?: "application/octet-stream",bytes)
                        }
                    }
                    attachments.addAll(added)
                }catch(e:Throwable){
                    Toast.makeText(ctx,e.message ?: "Не удалось прочитать файл",
                        Toast.LENGTH_LONG).show()
                }finally{attachmentLoading=false}
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest=onClose,containerColor=c.surface,contentColor=c.text,
        shape=RoundedCornerShape(topStart=29.dp,topEnd=29.dp),
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        dragHandle={BottomSheetDefaults.DragHandle(color=c.muted)}
    ){
        Column(Modifier.fillMaxWidth()
            .heightIn(max=(LocalConfiguration.current.screenHeightDp*.85f).dp)
            .imePadding().padding(horizontal=16.dp)){
            Row(Modifier.fillMaxWidth().padding(bottom=11.dp),
                verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.SpaceBetween){
                Text(if(isEvent)"НОВОЕ СОБЫТИЕ" else "НОВАЯ ЗАДАЧА",
                    color=c.violet,fontSize=11.sp,fontWeight=FontWeight.Bold,
                    letterSpacing=2.sp,modifier=Modifier.weight(1f))
                CreateRoundIcon(Icons.Default.Settings,"Настройки",c){settingsOpen=true}
                Spacer(Modifier.width(8.dp))
                CreateRoundIcon(Icons.Default.Close,"Закрыть",c,onClose)
            }
            Column(Modifier.fillMaxWidth().weight(1f,fill=false)
                .verticalScroll(rememberScrollState()).padding(bottom=15.dp),
                verticalArrangement=Arrangement.spacedBy(10.dp)){
                BasicTextField(title,onValueChange={title=it},
                    modifier=Modifier.fillMaxWidth().heightIn(min=64.dp),
                    textStyle=TextStyle(color=c.text,fontSize=26.sp,lineHeight=32.sp,
                        fontWeight=FontWeight.Bold),
                    maxLines=3,cursorBrush=SolidColor(c.violet),
                    decorationBox={inner->Box{
                        if(title.isEmpty())Text(if(isEvent)"Введите название события"
                            else "Введите название",fontSize=25.sp,
                            fontWeight=FontWeight.Bold,color=c.muted.copy(alpha=.75f))
                        inner()
                    }})
                if(isEvent)OutlinedTextField(value=location,onValueChange={location=it},
                    modifier=Modifier.fillMaxWidth(),singleLine=true,
                    label={Text("Место события")},leadingIcon={Icon(Icons.Default.Place,null)},
                    shape=RoundedCornerShape(14.dp))
                Row(verticalAlignment=Alignment.CenterVertically){
                    CreateRoundIcon(Icons.Default.CalendarMonth,"Выбрать дедлайн",c){
                        chooseCreateDate(ctx,dueDate){dueDate=it}
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(if(dueDate==null)"До дедлайна: выберите дату"
                        else "Дедлайн: "+createDateLabel(dueDate),
                        color=c.violet,fontWeight=FontWeight.SemiBold,fontSize=12.sp,
                        modifier=Modifier.weight(1f).clickable{
                            chooseCreateDate(ctx,dueDate){dueDate=it}
                        },maxLines=2)
                    if(dueDate!=null)IconButton(onClick={dueDate=null},
                        modifier=Modifier.size(29.dp)){
                        Icon(Icons.Default.Close,"Убрать дедлайн",tint=c.muted,
                            modifier=Modifier.size(15.dp))
                    }
                }
                Surface(shape=RoundedCornerShape(17.dp),color=c.field,
                    border=BorderStroke(1.dp,c.border)){
                    Box(Modifier.fillMaxWidth().height(126.dp)
                        .clickable{descriptionExpanded=true}
                        .padding(12.dp)){
                        Text(if(description.isBlank())"Введите описание"
                            else android.text.Html.fromHtml(description,
                                android.text.Html.FROM_HTML_MODE_COMPACT).toString().trim(),
                            fontSize=14.sp,lineHeight=23.sp,
                            color=if(description.isBlank())c.muted else c.text,
                            maxLines=5,overflow=TextOverflow.Ellipsis)
                    }
                }
                if(isEvent){
                    Row(verticalAlignment=Alignment.CenterVertically){
                        CreateRoundIcon(Icons.Default.AttachFile,"Добавить вложение",c){
                            picker.launch(arrayOf("*/*"))
                        }
                        Spacer(Modifier.width(8.dp))
                        Text("Вложения к событию",fontSize=12.sp,color=c.muted)
                        if(attachmentLoading) {
                            Spacer(Modifier.width(8.dp))
                            CircularProgressIndicator(Modifier.size(16.dp),strokeWidth=2.dp)
                        }
                    }
                    attachments.forEachIndexed {index,file->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp))
                            .background(c.field).padding(start=10.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            Text(file.name,Modifier.weight(1f),
                                color=c.text,fontSize=11.sp,maxLines=1)
                            IconButton(onClick={attachments.removeAt(index)}){
                                Icon(Icons.Default.Close,"Убрать файл",
                                    modifier=Modifier.size(16.dp),tint=c.muted)
                            }
                        }
                    }
                }
                Row(horizontalArrangement=Arrangement.spacedBy(9.dp)){
                    Box(Modifier.weight(1f)){
                        CreationChip(state.spheres.firstOrNull{it.id==sectorId}?.name
                            ?: "Без сектора",c){sectorOpen=true}
                        DropdownMenu(expanded=sectorOpen,onDismissRequest={sectorOpen=false}){
                            DropdownMenuItem(text={Text("Без сектора")},
                                onClick={sectorId=null;sectorOpen=false})
                            state.spheres.forEach{sphere->
                                DropdownMenuItem(text={Text(sphere.name)},onClick={
                                    sectorId=sphere.id;sectorOpen=false
                                })
                            }
                        }
                    }
                    Box(Modifier.weight(1f)){
                        CreationChip(when(notifyBefore){
                            null->"Не уведомлять"
                            0->"В момент дедлайна"
                            60->"За 1 час"
                            1440->"За сутки"
                            else->"За $notifyBefore мин"
                        },c){notifyOpen=true}
                        DropdownMenu(expanded=notifyOpen,onDismissRequest={notifyOpen=false}){
                            listOf(null,0,5,10,15,30,60,120,1440).forEach{minute->
                                DropdownMenuItem(text={Text(when(minute){
                                    null->"Не уведомлять";0->"В момент дедлайна"
                                    60->"За 1 час";120->"За 2 часа";1440->"За сутки"
                                    else->"За $minute минут"
                                })},onClick={notifyBefore=minute;notifyOpen=false})
                            }
                        }
                    }
                }
                if(!isEvent){
                    Text("ВАЖНОСТЬ: $importance",fontSize=11.sp,color=c.violet,
                        fontWeight=FontWeight.Bold,letterSpacing=1.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        (1..5).forEach{level->
                            Box(Modifier.weight(1f).height(39.dp)
                                .clip(RoundedCornerShape(11.dp))
                                .background(if(importance==level)c.violet else c.field)
                                .border(1.dp,if(importance==level)c.violet else c.border,
                                    RoundedCornerShape(11.dp))
                                .clickable{importance=level},
                                contentAlignment=Alignment.Center){
                                Text(level.toString(),color=if(importance==level)Color.White
                                    else c.text,fontWeight=FontWeight.Bold)
                            }
                        }
                    }
                    HorizontalDivider(color=c.border,modifier=Modifier.padding(top=5.dp))
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween){
                        Text("Подзадачи",fontWeight=FontWeight.SemiBold,color=c.text)
                        TextButton(onClick={children.add(DraftChild())}){
                            Icon(Icons.Default.Add,null,modifier=Modifier.size(16.dp))
                            Text("Добавить")
                        }
                    }
                    if(children.isEmpty())Text("Пока нет подзадач",fontSize=11.sp,
                        color=c.muted)
                    children.toList().forEach{child->
                        val index=children.indexOfFirst{it.id==child.id}
                        Surface(shape=RoundedCornerShape(13.dp),color=c.field,
                            border=BorderStroke(1.dp,c.border)){
                            Column(Modifier.padding(10.dp),
                                verticalArrangement=Arrangement.spacedBy(8.dp)){
                                Row(verticalAlignment=Alignment.CenterVertically){
                                    Icon(Icons.Default.SubdirectoryArrowRight,null,
                                        tint=c.violet,modifier=Modifier.size(18.dp))
                                    Spacer(Modifier.width(7.dp))
                                    OutlinedTextField(child.title,onValueChange={
                                        if(index in children.indices)
                                            children[index]=child.copy(title=it)
                                    },label={Text("Название подзадачи")},
                                        singleLine=true,modifier=Modifier.weight(1f),
                                        shape=RoundedCornerShape(10.dp))
                                    IconButton(onClick={children.remove(child)}){
                                        Icon(Icons.Default.Close,"Удалить черновик",
                                            tint=c.muted,modifier=Modifier.size(16.dp))
                                    }
                                }
                                OutlinedButton(onClick={editingChildId=child.id},
                                    modifier=Modifier.fillMaxWidth(),
                                    shape=RoundedCornerShape(10.dp)){
                                    Icon(Icons.Default.Edit,"Редактировать описание",
                                        modifier=Modifier.size(16.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text(if(child.description.isBlank())"Добавить описание"
                                        else "Редактировать описание",
                                        modifier=Modifier.weight(1f),maxLines=1)
                                }
                                Row(verticalAlignment=Alignment.CenterVertically){
                                    CreateRoundIcon(Icons.Default.CalendarMonth,
                                        "Дата подзадачи",c){
                                        chooseCreateDate(ctx,child.date){picked->
                                            if(index in children.indices)
                                                children[index]=child.copy(date=picked)
                                        }
                                    }
                                    Spacer(Modifier.width(8.dp))
                                    Text(if(child.date==null)"Срок не задан"
                                        else createDateLabel(child.date),color=c.violet,
                                        fontSize=11.sp,modifier=Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
                state.taskError?.let {Text(it,color=MaterialTheme.colorScheme.error,
                    fontSize=12.sp)}
            }
            Button(onClick={
                vm.createDetailedTask(buildJsonObject{
                    put("title",title.trim())
                    put("taskType",type.name)
                    put("description",if(description.isBlank())JsonNull
                        else JsonPrimitive(description))
                    put("location",if(isEvent&&location.isNotBlank())
                        JsonPrimitive(location.trim()) else JsonNull)
                    put("dueDate",if(dueDate==null)JsonNull else JsonPrimitive(dueDate!!))
                    put("sphereId",if(sectorId==null)JsonNull else JsonPrimitive(sectorId!!))
                    put("notifyBeforeMinutes",if(notifyBefore==null)JsonNull
                        else JsonPrimitive(notifyBefore!!))
                    put("importance",importance)
                    put("isRecurring",recurring)
                    if(recurring&&parsed!=null){
                        put("recurrenceText",recurrenceText.trim())
                        put("recurrenceJson",parsed!!.schedule)
                        put("recurrenceSummary",parsed!!.summary)
                        put("recurrenceUntil",
                            parsed!!.schedule["until"] ?: JsonNull)
                    }
                    put("aiNotificationsEnabled",aiNotifications)
                    if(!isEvent)put("aiMonitoringEnabled",aiMonitoring)
                },if(isEvent)emptyList() else children
                    .filter{it.title.isNotBlank() || it.description.isNotBlank() || it.date!=null}
                    .map{
                        TaskCreationChild(it.title.trim().ifBlank{"Новая подзадача"},
                            it.description.trim(),it.date)
                    },
                    if(isEvent)attachments.toList() else emptyList(),onClose)
            },modifier=Modifier.fillMaxWidth().padding(bottom=12.dp),
                shape=CircleShape,
                enabled=!state.taskBusy&&!attachmentLoading&&title.isNotBlank()&&
                    (!recurring || parsed!=null)){
                if(state.taskBusy)CircularProgressIndicator(Modifier.size(16.dp),
                    color=Color.White,strokeWidth=2.dp)
                else Text(if(isEvent)"Создать событие" else "Создать задачу",
                    fontWeight=FontWeight.Bold)
            }
        }
    }
    if(descriptionExpanded) NativeRichDescriptionDialog(
        title=if(isEvent)"Описание события" else "Описание задачи",
        value=description,dark=dark,editorKey="create-"+type.name,
        onChange={description=it},onClose={descriptionExpanded=false}
    )
    editingChildId?.let{id->
        val child=children.firstOrNull{it.id==id}
        if(child!=null)NativeRichDescriptionDialog(
            title="Описание подзадачи",value=child.description,dark=dark,
            editorKey=id,
            onChange={html->
                val index=children.indexOfFirst{it.id==id}
                if(index>=0)children[index]=children[index].copy(description=html)
            },
            onClose={editingChildId=null}
        )
    }
    if(settingsOpen){
        AlertDialog(onDismissRequest={settingsOpen=false},
            containerColor=c.surface,title={Text(if(isEvent)
                "Настройки события" else "Настройки задачи",color=c.text)},
            text={
                Column(Modifier.verticalScroll(rememberScrollState())
                    .heightIn(max=420.dp),
                    verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Row(verticalAlignment=Alignment.CenterVertically){
                        Checkbox(recurring,onCheckedChange={
                            recurring=it
                            if(!it)parsed=null
                        })
                        Text("Повторять",color=c.text)
                    }
                    if(!isEvent){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Checkbox(aiNotifications,onCheckedChange={aiNotifications=it})
                            Text("Уведомления от ИИ",color=c.text)
                        }
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Checkbox(aiMonitoring,onCheckedChange={aiMonitoring=it})
                            Text("Автомониторинг ИИ",color=c.text)
                        }
                    }
                    if(recurring){
                        OutlinedTextField(value=recurrenceText,onValueChange={
                            recurrenceText=it;parsed=null;vm.clearRecurrenceError()
                        },label={Text("Как должно повторяться")},
                            placeholder={Text("Например: каждый вторник в 17:00")},
                            modifier=Modifier.fillMaxWidth(),minLines=2,maxLines=4)
                        Button(onClick={
                            vm.parseCreationRecurrence(recurrenceText){parsed=it}
                        },enabled=recurrenceText.isNotBlank()&&!state.recurrenceLoading){
                            Text(if(state.recurrenceLoading)"Обработка…" else "Применить расписание")
                        }
                        parsed?.let{
                            Text(it.summary,color=c.teal,fontSize=12.sp)
                        }
                        state.recurrenceError?.let{
                            Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
                        }
                        Text("Повторение создаётся только после применения расписания.",
                            color=c.muted,fontSize=11.sp)
                    }
                }
            },
            confirmButton={TextButton(onClick={settingsOpen=false}){Text("Готово")}}
        )
    }
}
