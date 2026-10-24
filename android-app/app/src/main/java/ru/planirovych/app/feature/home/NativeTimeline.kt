package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.*
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import ru.planirovych.app.data.model.*

private enum class TimelineZoom(val label:String){DAY("День"),WEEK("Неделя"),MONTH("Месяц")}
private fun timelineDate(value:String?):ZonedDateTime? {
    if(value.isNullOrBlank())return null
    return runCatching { OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()) }
        .recoverCatching { Instant.parse(value).atZone(ZoneId.systemDefault()) }.getOrNull()
}
private fun calendarColor(color:String?):Color = runCatching {
    Color(android.graphics.Color.parseColor(color ?: "#64748b"))
}.getOrDefault(Color(0xFF64748B))
private fun timelineHabitScheduled(habit:Habit,date:LocalDate):Boolean{
    val rawCreated=habit.createdAt ?: return false
    val created=runCatching {
        OffsetDateTime.parse(rawCreated).toLocalDate()
    }.recoverCatching{
        Instant.parse(rawCreated).atZone(ZoneId.systemDefault()).toLocalDate()
    }.getOrDefault(LocalDate.now())
    if(date.isBefore(created))return false
    if(habit.isAutoCompleted || habit.isArchived)return false
    if(habit.durationMode==HabitDurationMode.UNTIL_DATE &&
        !habit.endDate.isNullOrBlank() && date.toString()>habit.endDate.take(10))return false
    return when(habit.recurrenceType){
        HabitRecurrenceType.DAILY -> true
        HabitRecurrenceType.INTERVAL ->
            java.time.temporal.ChronoUnit.DAYS.between(created,date) %
                (habit.intervalDays ?: 1).coerceAtLeast(1) == 0L
        HabitRecurrenceType.WEEKDAYS -> habit.weekdays.contains(date.dayOfWeek.value%7)
    }
}
private data class TimelineEntry(
    val key:String,val time:LocalTime,val title:String,
    val kind:String,val color:Color,val taskId:String?=null,
    val habit:Habit?=null,val sectorName:String?=null
)
private fun timelineEntries(date:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>):List<TimelineEntry>{
    val parents=allTasks.associateBy{it.id}
    val entries=tasks.mapNotNull {task ->
        val due=timelineDate(task.dueDate) ?: return@mapNotNull null
        if(due.toLocalDate()!=date)return@mapNotNull null
        val kind=when{
            task.taskType==TaskType.EVENT->"Событие"
            task.taskType==TaskType.REMINDER->"Напоминание"
            task.parentTaskId!=null->"Подзадача"
            else->"Задача"
        }
        val source=task.parentTaskId?.let{parents[it]} ?: task
        val accent=when(kind){
            "Событие" -> Color(0xFFF59E0B)
            "Напоминание" -> Color(0xFF0284C7)
            else -> calendarColor(spheres.firstOrNull{it.id==source.sphereId}?.color)
        }
        TimelineEntry(task.id,due.toLocalTime(),task.title,kind,accent,task.id,
            sectorName=spheres.firstOrNull{it.id==source.sphereId}?.name)
    }.toMutableList()
    habits.filter{timelineHabitScheduled(it,date)}.forEach{habit->
        val times=habit.reminderTimes.ifEmpty{listOfNotNull(habit.reminderTime)}
        times.forEachIndexed{index,value->
            val t=runCatching {LocalTime.parse(value)}.getOrNull() ?: return@forEachIndexed
            entries.add(TimelineEntry("habit-${habit.id}-$index",t,
                "${habit.icon} ${habit.name}","Привычка",calendarColor(habit.color),habit=habit))
        }
    }
    return entries.sortedWith(compareBy<TimelineEntry>{it.time}.thenBy{it.title})
}
private fun shortTime(value:LocalTime)=value.format(DateTimeFormatter.ofPattern("HH:mm"))

@Composable
internal fun NativeTimelineWorkspace(
    tasks:List<Task>,allTasks:List<Task>,habits:List<Habit>,spheres:List<Sphere>,
    colors:WorkspaceColors,dark:Boolean,onOpen:(String)->Unit
){
    var zoom by rememberSaveable{mutableStateOf(TimelineZoom.DAY)}
    var weekScale by rememberSaveable{mutableFloatStateOf(1f)}
    var anchorRaw by rememberSaveable{mutableStateOf(LocalDate.now().toString())}
    val anchor=runCatching{LocalDate.parse(anchorRaw)}.getOrDefault(LocalDate.now())
    val start=when(zoom){
        TimelineZoom.DAY->anchor
        TimelineZoom.WEEK->anchor.minusDays((anchor.dayOfWeek.value-1).toLong())
        TimelineZoom.MONTH->anchor.withDayOfMonth(1)
    }
    val end=when(zoom){
        TimelineZoom.DAY->start
        TimelineZoom.WEEK->start.plusDays(6)
        TimelineZoom.MONTH->start.plusMonths(1).minusDays(1)
    }
    val label=if(zoom==TimelineZoom.MONTH)
        start.format(DateTimeFormatter.ofPattern("LLLL yyyy",Locale("ru")))
    else if(start==end)start.format(DateTimeFormatter.ofPattern("d MMMM yyyy",Locale("ru")))
    else start.format(DateTimeFormatter.ofPattern("d MMM",Locale("ru")))+" – "+
        end.format(DateTimeFormatter.ofPattern("d MMM yyyy",Locale("ru")))
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
        Surface(shape=RoundedCornerShape(20.dp),color=colors.panel,
            border=BorderStroke(1.dp,colors.panelBorder)){
            Column(Modifier.padding(11.dp),verticalArrangement=Arrangement.spacedBy(11.dp)){
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)){
                    TimelineZoom.entries.forEach{option->
                        Box(Modifier.weight(1f).height(38.dp)
                            .clip(RoundedCornerShape(11.dp))
                            .background(if(option==zoom)colors.selected else colors.muted)
                            .border(1.dp,if(option==zoom)colors.purple else colors.panelBorder,
                                RoundedCornerShape(11.dp))
                            .clickable{zoom=option},contentAlignment=Alignment.Center){
                            Text(option.label,color=if(option==zoom)colors.selectedText else colors.text,
                                fontSize=12.sp,fontWeight=FontWeight.SemiBold)
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.SpaceBetween){
                    IconButton(onClick={
                        anchorRaw=when(zoom){
                            TimelineZoom.DAY->anchor.minusDays(1)
                            TimelineZoom.WEEK->anchor.minusWeeks(1)
                            TimelineZoom.MONTH->anchor.minusMonths(1)
                        }.toString()
                    }){Icon(Icons.Default.ChevronLeft,"Предыдущий период",tint=colors.text)}
                    Column(horizontalAlignment=Alignment.CenterHorizontally,
                        modifier=Modifier.weight(1f)){
                        Text(label.replaceFirstChar{it.uppercase()},
                            fontSize=13.sp,fontWeight=FontWeight.SemiBold,color=colors.text,
                            textAlign=TextAlign.Center,maxLines=2)
                        Text(when(zoom){
                            TimelineZoom.DAY->"Выбранный день"
                            TimelineZoom.WEEK->"Выбранная неделя"
                            TimelineZoom.MONTH->"Выбранный месяц"
                        },color=colors.secondaryText,fontSize=10.sp)
                    }
                    IconButton(onClick={
                        anchorRaw=when(zoom){
                            TimelineZoom.DAY->anchor.plusDays(1)
                            TimelineZoom.WEEK->anchor.plusWeeks(1)
                            TimelineZoom.MONTH->anchor.plusMonths(1)
                        }.toString()
                    }){Icon(Icons.Default.ChevronRight,"Следующий период",tint=colors.text)}
                }
            }
        }
        when(zoom){
            TimelineZoom.DAY->TimelineDay(anchor,tasks,allTasks,habits,spheres,colors,dark,onOpen)
            TimelineZoom.WEEK->TimelineWeek(start,tasks,allTasks,habits,spheres,colors,dark,
                onOpen,weekScale=weekScale,
                onWeekScaleChange={weekScale=it.coerceIn(.72f,1.8f)},
                openDay={anchorRaw=it.toString();zoom=TimelineZoom.DAY})
            TimelineZoom.MONTH->TimelineMonth(start,tasks,allTasks,habits,spheres,colors,dark,
                openDay={anchorRaw=it.toString();zoom=TimelineZoom.DAY})
        }
    }
}

@Composable
private fun TimelineEventCard(entry:TimelineEntry,c:WorkspaceColors,dark:Boolean,
    compact:Boolean=false,scale:Float=1f,onOpen:(String)->Unit){
    val isEvent=entry.kind=="Событие"
    val isReminder=entry.kind=="Напоминание"
    val isSubtask=entry.kind=="Подзадача"
    val isHabit=entry.kind=="Привычка"
    val kindColor=when {
        isEvent->Color(0xFFD97706)
        isReminder->Color(0xFF0284C7)
        isHabit->Color(0xFF059669)
        else->c.purple
    }
    // A sector is shown as a labeled chip instead of a colored card in the
    // weekly calendar. Kind accents still distinguish events and reminders.
    val edge=if(compact){
        when{
            isEvent->kindColor.copy(alpha=.75f)
            isReminder->kindColor.copy(alpha=.75f)
            isHabit->kindColor.copy(alpha=.6f)
            else->c.panelBorder
        }
    } else if(isEvent||isReminder)kindColor else entry.color
    val base=when {
        isEvent->if(dark)Color(0xFF543717) else Color(0xFFFFF4D6)
        isReminder->if(dark)Color(0xFF163955) else Color(0xFFE0F2FE)
        isHabit->if(dark)Color(0xFF1A352B) else Color(0xFFEFFCF2)
        isSubtask->if(dark)Color(0xFF263348) else Color(0xFFF3F5FA)
        else->if(dark)Color(0xFF1B2C41) else Color(0xFFF6F8FC)
    }
    val radius=RoundedCornerShape(if(compact)9.dp else 13.dp)
    val adjusted=if(compact)scale.coerceIn(.72f,1.8f) else 1f
    Row(Modifier.fillMaxWidth().clip(radius).background(base)
        .border(1.dp,edge.copy(alpha=if(dark).72f else .6f),radius)
        .clickable(enabled=entry.taskId!=null&&!isReminder){
            entry.taskId?.let(onOpen)
        }.heightIn(min=if(compact)(37f*adjusted).dp
            else if(isSubtask)44.dp else 54.dp),
        verticalAlignment=Alignment.CenterVertically){
        if(!compact){
            Box(Modifier.width(if(isSubtask)5.dp else 3.dp)
                .heightIn(min=if(isSubtask)40.dp else 49.dp).background(edge))
        }
        Column(Modifier.weight(1f).padding(
            horizontal=if(compact)(7f*adjusted).dp else 10.dp,
            vertical=if(compact)(5f*adjusted).dp else 6.dp),
            verticalArrangement=Arrangement.spacedBy(if(compact)3.dp else 2.dp)){
            Text(entry.title,color=c.text,
                fontSize=if(compact)(10.5f*adjusted).sp else if(isSubtask)12.sp else 13.sp,
                lineHeight=if(compact)(13f*adjusted).sp else 17.sp,
                fontWeight=FontWeight.SemiBold,maxLines=if(compact)2 else 1,
                overflow=TextOverflow.Ellipsis)
            Text(entry.kind+" · "+shortTime(entry.time),
                color=if(isEvent)if(dark)Color(0xFFFCD34D) else Color(0xFF92400E)
                    else if(isReminder)if(dark)Color(0xFF7DD3FC) else Color(0xFF0369A1)
                    else c.secondaryText,
                fontSize=if(compact)(9f*adjusted).sp else 11.sp,
                maxLines=1)
            if(compact && !entry.sectorName.isNullOrBlank() && !isHabit && !isReminder){
                Surface(shape=RoundedCornerShape(6.dp),color=c.selected,
                    border=BorderStroke(.6.dp,c.purple.copy(alpha=.40f))){
                    Text(entry.sectorName,modifier=Modifier.padding(
                        horizontal=(5f*adjusted).dp,vertical=(2f*adjusted).dp),
                        color=c.selectedText,fontWeight=FontWeight.Medium,
                        fontSize=(8.5f*adjusted).sp,maxLines=1,
                        overflow=TextOverflow.Ellipsis)
                }
            }
        }
        if(!compact){
            Icon(when {
                isEvent->Icons.Default.Event
                isReminder->Icons.Default.Notifications
                isSubtask->Icons.Default.SubdirectoryArrowRight
                isHabit->Icons.Default.AutoAwesome
                else->Icons.Default.CheckCircleOutline
            },null,tint=kindColor,modifier=Modifier.padding(end=9.dp).size(16.dp))
        }
    }
}

@Composable
private fun TimelineDay(day:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit){
    val entries=remember(day,tasks,allTasks,habits,spheres){
        timelineEntries(day,tasks,allTasks,habits,spheres)
    }
    // In the compact day view only occupied hours are shown. There are no
    // empty quarter-hour slots, unlike the former full 24-hour grid.
    val byHour=remember(entries){entries.groupBy{it.time.hour}.toSortedMap()}
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)){
        if(entries.isEmpty()){
            Surface(color=colors.panel,shape=RoundedCornerShape(15.dp),
                border=BorderStroke(1.dp,colors.panelBorder)){
                Text("На выбранный день нет записей.",color=colors.secondaryText,
                    fontSize=12.sp,modifier=Modifier.padding(17.dp))
            }
        }
        byHour.forEach{(hour,records)->
            Surface(shape=RoundedCornerShape(16.dp),color=colors.panel,
                border=BorderStroke(1.dp,colors.panelBorder)){
                Row(Modifier.fillMaxWidth().padding(horizontal=9.dp,vertical=10.dp),
                    horizontalArrangement=Arrangement.spacedBy(9.dp),
                    verticalAlignment=Alignment.Top){
                    Column(Modifier.width(45.dp).padding(top=5.dp),
                        horizontalAlignment=Alignment.CenterHorizontally){
                        Text(String.format(Locale.US,"%02d:00",hour),
                            color=colors.purple,fontSize=11.sp,
                            fontWeight=FontWeight.Bold)
                    }
                    Column(Modifier.weight(1f),
                        verticalArrangement=Arrangement.spacedBy(7.dp)){
                        records.forEach{entry->
                            TimelineEventCard(entry,colors,dark,onOpen=onOpen)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimelineWeek(monday:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,weekScale:Float,onWeekScaleChange:(Float)->Unit,
    openDay:(LocalDate)->Unit){
    val labels=listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")
    val currentScale by rememberUpdatedState(weekScale)
    val updateScale by rememberUpdatedState(onWeekScaleChange)
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End,
            verticalAlignment=Alignment.CenterVertically){
            Icon(Icons.Default.ZoomIn,"Изменить масштаб недели",
                tint=colors.secondaryText,modifier=Modifier.size(15.dp))
            Spacer(Modifier.width(5.dp))
            Text("Масштаб",color=colors.secondaryText,fontSize=11.sp)
            Spacer(Modifier.width(8.dp))
            IconButton(onClick={onWeekScaleChange(weekScale-.15f)},
                enabled=weekScale>.73f,modifier=Modifier.size(32.dp)){
                Icon(Icons.Default.Remove,"Уменьшить масштаб",
                    tint=colors.purple,modifier=Modifier.size(18.dp))
            }
            Text("${(weekScale*100).toInt()}%",
                color=colors.text,fontSize=11.sp,fontWeight=FontWeight.Bold,
                textAlign=TextAlign.Center,modifier=Modifier.width(44.dp))
            IconButton(onClick={onWeekScaleChange(weekScale+.15f)},
                enabled=weekScale<1.79f,modifier=Modifier.size(32.dp)){
                Icon(Icons.Default.Add,"Увеличить масштаб",
                    tint=colors.purple,modifier=Modifier.size(18.dp))
            }
        }
        // Intercept *only* two-finger gestures. A single finger remains
        // available for horizontal week scrolling and outer page gestures.
        Row(Modifier.fillMaxWidth()
            .pointerInput(Unit){
                awaitEachGesture {
                    awaitPointerEventScope {
                        do {
                            val event=awaitPointerEvent(PointerEventPass.Initial)
                            if(event.changes.count{it.pressed}>=2){
                                val factor=event.calculateZoom()
                                if(factor.isFinite() && factor>0f && factor!=1f){
                                    updateScale((currentScale*factor).coerceIn(.72f,1.8f))
                                }
                                event.changes.forEach{it.consume()}
                            }
                        }while(event.changes.any{it.pressed})
                    }
                }
            }
            .horizontalScroll(rememberScrollState()),
            horizontalArrangement=Arrangement.spacedBy(6.dp)){
            repeat(7){index->
                val date=monday.plusDays(index.toLong())
                val items=remember(date,tasks,allTasks,habits,spheres){
                    timelineEntries(date,tasks,allTasks,habits,spheres)
                }
                Surface(Modifier.width((155f*weekScale).dp).heightIn(min=230.dp),
                    shape=RoundedCornerShape(15.dp),
                    color=colors.panel,border=BorderStroke(1.dp,
                        if(date==LocalDate.now())colors.purple else colors.panelBorder)){
                    Column(Modifier.padding((7f*weekScale).dp),
                        verticalArrangement=Arrangement.spacedBy((7f*weekScale).dp)){
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp))
                            .background(if(date==LocalDate.now())colors.selected else colors.muted)
                            .clickable{openDay(date)}.padding(8.dp),
                            horizontalAlignment=Alignment.CenterHorizontally){
                            Text(labels[index],color=colors.secondaryText,
                                fontSize=(11f*weekScale).sp)
                            Text(date.dayOfMonth.toString(),fontWeight=FontWeight.Bold,
                                color=colors.text,fontSize=(18f*weekScale).sp)
                            Text(date.format(DateTimeFormatter.ofPattern("MMM",Locale("ru"))),
                                color=colors.secondaryText,fontSize=(10f*weekScale).sp)
                        }
                        if(items.isEmpty()){
                            Text("Нет записей",color=colors.secondaryText,
                                fontSize=(10f*weekScale).sp,
                                modifier=Modifier.padding(top=14.dp))
                        }
                        items.groupBy{it.time.hour}.forEach{(hour,group)->
                            Text(String.format(Locale.US,"%02d:00",hour),
                                color=colors.secondaryText,fontSize=(10f*weekScale).sp,
                                fontWeight=FontWeight.SemiBold)
                            group.forEach{
                                TimelineEventCard(it,colors,dark,compact=true,
                                    scale=weekScale,onOpen=onOpen)
                            }
                        }
                        TextButton(onClick={openDay(date)},modifier=Modifier.fillMaxWidth()){
                            Text("Открыть день",fontSize=(10f*weekScale).sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TimelineMonth(first:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    openDay:(LocalDate)->Unit){
    val start=first.minusDays((first.dayOfWeek.value-1).toLong())
    val weekdays=listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")
    Surface(shape=RoundedCornerShape(17.dp),color=colors.panel,
        border=BorderStroke(1.dp,colors.panelBorder)){
        Column(Modifier.padding(6.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
            Row(Modifier.fillMaxWidth()){
                weekdays.forEach{label->
                    Text(label,Modifier.weight(1f).padding(vertical=5.dp),
                        textAlign=TextAlign.Center,fontSize=10.sp,
                        fontWeight=FontWeight.Bold,color=colors.secondaryText)
                }
            }
            repeat(6){week->
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(3.dp)){
                    repeat(7){index->
                        val date=start.plusDays((week*7+index).toLong())
                        val entries=remember(date,tasks,allTasks,habits,spheres){
                            timelineEntries(date,tasks,allTasks,habits,spheres)
                        }
                        val outside=date.month!=first.month
                        val eventCount=entries.count{it.kind=="Событие"}
                        val subCount=entries.count{it.kind=="Подзадача"}
                        Box(Modifier.weight(1f).height(87.dp)
                            .clip(RoundedCornerShape(9.dp))
                            .background(when{
                                date==LocalDate.now()->colors.selected
                                outside->colors.field.copy(alpha=.45f)
                                else->colors.card
                            })
                            .border(1.dp,if(date==LocalDate.now())colors.purple
                                else colors.panelBorder.copy(alpha=.6f),RoundedCornerShape(9.dp))
                            .clickable{openDay(date)}.padding(3.dp)){
                            Column(verticalArrangement=Arrangement.spacedBy(3.dp)){
                                Text(date.dayOfMonth.toString(),fontSize=11.sp,
                                    color=if(outside)colors.secondaryText.copy(alpha=.55f)
                                        else colors.text,fontWeight=FontWeight.Bold)
                                entries.take(3).forEach{entry->
                                    Box(Modifier.fillMaxWidth().height(15.dp)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(entry.color.copy(alpha=if(dark).32f else .18f))
                                        .border(.7.dp,entry.color.copy(alpha=.7f),
                                            RoundedCornerShape(4.dp))
                                        .padding(start=2.dp),contentAlignment=Alignment.CenterStart){
                                        Text(when(entry.kind){
                                            "Событие"->"◆ "+entry.title
                                            "Подзадача"->"↳ "+entry.title
                                            "Напоминание"->"🔔 "+entry.title
                                            else->entry.title
                                        },fontSize=8.sp,color=colors.text,maxLines=1,
                                            overflow=TextOverflow.Ellipsis)
                                    }
                                }
                                if(entries.size>3)Text("+${entries.size-3}",
                                    color=colors.purple,fontSize=9.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
