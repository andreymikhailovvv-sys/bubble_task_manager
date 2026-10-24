package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.Html
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.*
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.*
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeQuickTaskCreateSheet(type:TaskType,vm:HomeViewModel,dark:Boolean,
    onClose:()->Unit) {
    if(type != TaskType.REMINDER){
        NativeDetailedTaskCreateSheet(type,vm,dark,onClose)
        return
    }
    val state by vm.state.collectAsStateWithLifecycle()
    val context=LocalContext.current
    var title by remember(type){mutableStateOf("")}
    var description by remember(type){mutableStateOf("")}
    var location by remember(type){mutableStateOf("")}
    var dueDate by remember(type){mutableStateOf<String?>(null)}
    var sector by remember(type){mutableStateOf<String?>(null)}
    var sectorsOpen by remember{mutableStateOf(false)}
    val label=when(type){TaskType.TASK->"Задача";TaskType.EVENT->"Событие";TaskType.REMINDER->"Напоминание"}
    val chooseDate={
        val now=LocalDateTime.now()
        DatePickerDialog(context,{_,year,month,day->
            TimePickerDialog(context,{_,hour,minute->
                dueDate=LocalDateTime.of(year,month+1,day,hour,minute)
                    .atZone(ZoneId.systemDefault()).toOffsetDateTime()
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
            },now.hour,now.minute,true).show()
        },now.year,now.monthValue-1,now.dayOfMonth).show()
    }
    ModalBottomSheet(onDismissRequest=onClose,
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        containerColor=if(dark)Color(0xFF121E31) else Color.White,
        shape=RoundedCornerShape(topStart=29.dp,topEnd=29.dp)) {
        Column(Modifier.fillMaxWidth().heightIn(max=450.dp)
            .verticalScroll(rememberScrollState()).padding(horizontal=18.dp,vertical=12.dp)
            .navigationBarsPadding(),verticalArrangement=Arrangement.spacedBy(13.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                verticalAlignment=Alignment.CenterVertically){
                Text("НОВОЕ НАПОМИНАНИЕ",fontSize=11.sp,letterSpacing=2.sp,
                    fontWeight=FontWeight.Bold,color=if(dark)Color(0xFFC4B5FD) else Color(0xFF6D28D9))
                IconButton(onClick=onClose){Icon(Icons.Default.Close,"Закрыть")}
            }
            OutlinedTextField(value=title,onValueChange={title=it},
                modifier=Modifier.fillMaxWidth(),label={Text("Название напоминания")},
                singleLine=false,maxLines=2,shape=RoundedCornerShape(16.dp))
            OutlinedTextField(value=description,onValueChange={description=it},
                modifier=Modifier.fillMaxWidth(),label={Text("Описание")},
                minLines=2,maxLines=4,shape=RoundedCornerShape(16.dp))
            if(type==TaskType.EVENT)OutlinedTextField(value=location,onValueChange={location=it},
                modifier=Modifier.fillMaxWidth(),label={Text("Место проведения")},singleLine=true)
            OutlinedButton(onClick=chooseDate,modifier=Modifier.fillMaxWidth(),
                shape=RoundedCornerShape(15.dp)){
                Icon(Icons.Default.CalendarMonth,null);Spacer(Modifier.width(8.dp))
                Text(dueDate?.let { runCatching{
                    OffsetDateTime.parse(it).format(DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm"))
                }.getOrNull() } ?: "Указать дату и время")
            }
            if(type!=TaskType.REMINDER){
                Box {
                    OutlinedButton(onClick={sectorsOpen=true},modifier=Modifier.fillMaxWidth()){
                        Text(state.spheres.firstOrNull{it.id==sector}?.name ?: "Без сектора")
                        Icon(Icons.Default.ArrowDropDown,null)
                    }
                    DropdownMenu(expanded=sectorsOpen,onDismissRequest={sectorsOpen=false}){
                        DropdownMenuItem(text={Text("Без сектора")},
                            onClick={sector=null;sectorsOpen=false})
                        state.spheres.forEach{sphere->
                            DropdownMenuItem(text={Text(sphere.name)},
                                onClick={sector=sphere.id;sectorsOpen=false})
                        }
                    }
                }
            }
            state.taskError?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            Button(onClick={
                vm.createTopLevelTask(buildJsonObject{
                    put("title",title.trim());put("taskType",type.name)
                    if(description.isNotBlank())put("description",description)
                    if(dueDate!=null)put("dueDate",dueDate)
                    if(sector!=null)put("sphereId",sector)
                    if(type==TaskType.EVENT && location.isNotBlank())put("location",location)
                },onClose)
            },enabled=title.isNotBlank()&&!state.taskBusy&&
                (type!=TaskType.REMINDER || dueDate!=null),
                modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(14.dp)){
                Text(if(state.taskBusy)"Создаём…" else "Создать")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeQuickNoteCreateSheet(vm:HomeViewModel,dark:Boolean,onClose:()->Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var group by remember { mutableStateOf<String?>(null) }
    var groupsOpen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit){vm.loadNotes()}
    ModalBottomSheet(onDismissRequest=onClose,
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        containerColor=MaterialTheme.colorScheme.surface){
        Column(Modifier.fillMaxWidth().heightIn(max=550.dp)
            .padding(horizontal=18.dp,vertical=12.dp).navigationBarsPadding(),
            verticalArrangement=Arrangement.spacedBy(11.dp)){
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                verticalAlignment=Alignment.CenterVertically){
                Text("Новая заметка",fontSize=19.sp,fontWeight=FontWeight.Bold)
                IconButton(onClick=onClose){Icon(Icons.Default.Close,"Закрыть")}
            }
            OutlinedTextField(value=title,onValueChange={title=it},label={Text("Название")},
                modifier=Modifier.fillMaxWidth())
            Box{
                OutlinedButton(onClick={groupsOpen=true},modifier=Modifier.fillMaxWidth()){
                    Text(state.noteGroups.firstOrNull{it.id==group}?.name ?: "Без группы")
                    Icon(Icons.Default.ArrowDropDown,null)
                }
                DropdownMenu(expanded=groupsOpen,onDismissRequest={groupsOpen=false}){
                    DropdownMenuItem(text={Text("Без группы")},
                        onClick={group=null;groupsOpen=false})
                    state.noteGroups.forEach{g->
                        DropdownMenuItem(text={Text(g.name)},
                            onClick={group=g.id;groupsOpen=false})
                    }
                }
            }
            OutlinedTextField(value=body,onValueChange={body=it},
                label={Text("Содержимое")},modifier=Modifier.weight(1f).fillMaxWidth(),
                minLines=5)
            state.notesError?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            Button(onClick={
                vm.createNote(title.trim(),Html.escapeHtml(body).replace("\n","<br>"),group,onClose)
            },modifier=Modifier.fillMaxWidth(),enabled=!state.notesBusy,
                shape=RoundedCornerShape(14.dp)){Text(if(state.notesBusy)"Сохраняем…" else "Создать заметку")}
        }
    }
}
