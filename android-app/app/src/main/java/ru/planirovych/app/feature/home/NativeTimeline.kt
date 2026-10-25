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
import androidx.compose.ui.draw.shadow
import kotlinx.coroutines.launch
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
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
    val habit:Habit?=null,val sectorName:String?=null,
    val dueDate:String?=null
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
            sectorName=spheres.firstOrNull{it.id==source.sphereId}?.name,
            dueDate=task.dueDate)
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
private fun timelineDueLabel(raw:String?):String {
    val due=timelineDate(raw) ?: return ""
    val minutes=Duration.between(ZonedDateTime.now(),due).toMinutes()
    val remaining=kotlin.math.abs(minutes)
    val days=remaining/1440
    val hours=(remaining%1440)/60
    val mins=remaining%60
    val parts=mutableListOf<String>()
    if(days>0)parts.add(days.toString()+"д")
    if(hours>0)parts.add(hours.toString()+"ч")
    if(days==0L && (mins>0 || parts.isEmpty()))parts.add(mins.coerceAtLeast(1).toString()+"м")
    return (if(minutes<0)"Просрочено на " else "Через ")+parts.joinToString(" ")
}

@Composable
internal fun NativeTimelineWorkspace(
    tasks:List<Task>,allTasks:List<Task>,habits:List<Habit>,spheres:List<Sphere>,
    colors:WorkspaceColors,dark:Boolean,onOpen:(String)->Unit,
    onOpenHabit:(String)->Unit={}
){
    var zoom by rememberSaveable{mutableStateOf(TimelineZoom.DAY)}
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
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        // This mirrors MiniApp's two independent navigation bars:
        // miniapp-timeline-view-switch and miniapp-timeline-date-nav.
        val switchShape=RoundedCornerShape(12.dp)
        Row(Modifier.fillMaxWidth().clip(switchShape)
            .background(if(dark)Color(0xFF0F172A) else Color(0xFFF1F5F9))
            .border(1.dp,if(dark)Color(0xFF64748B).copy(alpha=.45f)
                else Color(0xFFCBD5E1),switchShape)
            .padding(3.dp),
            horizontalArrangement=Arrangement.spacedBy(3.dp)){
            TimelineZoom.entries.forEach{option->
                val active=option==zoom
                Box(Modifier.weight(1f).height(34.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if(active)Color(0xFF7C3AED) else Color.Transparent)
                    .clickable{zoom=option},
                    contentAlignment=Alignment.Center){
                    Text(option.label,
                        color=if(active)Color.White
                            else if(dark)Color(0xFF94A3B8) else Color(0xFF334155),
                        fontSize=11.sp,fontWeight=FontWeight.Bold)
                }
            }
        }
        val dateShape=RoundedCornerShape(14.dp)
        val arrowColor=if(dark)Color(0xFFC4B5FD) else Color(0xFF6D28D9)
        Row(Modifier.fillMaxWidth().height(52.dp)
            .clip(dateShape)
            .background(if(dark)Color(0xFF22233E) else Color(0xFFFAF7FF))
            .border(1.dp,Color(0xFF8B5CF6).copy(alpha=if(dark).42f else .28f),
                dateShape),
            verticalAlignment=Alignment.CenterVertically){
            Box(Modifier.width(38.dp).fillMaxHeight()
                .clickable {
                    anchorRaw=when(zoom){
                        TimelineZoom.DAY->anchor.minusDays(1)
                        TimelineZoom.WEEK->anchor.minusWeeks(1)
                        TimelineZoom.MONTH->anchor.minusMonths(1)
                    }.toString()
                },contentAlignment=Alignment.Center){
                Icon(Icons.Default.ChevronLeft,"Предыдущий период",
                    tint=arrowColor,modifier=Modifier.size(20.dp))
            }
            Box(Modifier.width(1.dp).fillMaxHeight()
                .background(Color(0xFF8B5CF6).copy(alpha=.17f)))
            Row(Modifier.weight(1f).padding(horizontal=6.dp),
                verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.Center){
                Icon(Icons.Default.CalendarMonth,null,tint=arrowColor,
                    modifier=Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Column(horizontalAlignment=Alignment.CenterHorizontally,
                    verticalArrangement=Arrangement.spacedBy(1.dp)){
                    Text(label.replaceFirstChar{it.uppercase()},
                        fontSize=12.sp,fontWeight=FontWeight.Bold,
                        color=if(dark)Color(0xFFF8FAFC) else Color(0xFF1E293B),
                        textAlign=TextAlign.Center,maxLines=1,
                        overflow=TextOverflow.Ellipsis)
                    Text(when(zoom){
                        TimelineZoom.DAY->"Выбранный день"
                        TimelineZoom.WEEK->"Выбранная неделя"
                        TimelineZoom.MONTH->"Выбранный месяц"
                    },color=colors.secondaryText,fontSize=9.sp)
                }
            }
            Box(Modifier.width(1.dp).fillMaxHeight()
                .background(Color(0xFF8B5CF6).copy(alpha=.17f)))
            Box(Modifier.width(38.dp).fillMaxHeight()
                .clickable{
                    anchorRaw=when(zoom){
                        TimelineZoom.DAY->anchor.plusDays(1)
                        TimelineZoom.WEEK->anchor.plusWeeks(1)
                        TimelineZoom.MONTH->anchor.plusMonths(1)
                    }.toString()
                },contentAlignment=Alignment.Center){
                Icon(Icons.Default.ChevronRight,"Следующий период",
                    tint=arrowColor,modifier=Modifier.size(20.dp))
            }
        }
        when(zoom){
            TimelineZoom.DAY->TimelineDay(anchor,tasks,allTasks,habits,spheres,colors,dark,onOpen)
            TimelineZoom.WEEK->TimelineWeek(start,tasks,allTasks,habits,spheres,colors,dark,
                onOpen,onOpenHabit=onOpenHabit,
                openDay={anchorRaw=it.toString();zoom=TimelineZoom.DAY})
            TimelineZoom.MONTH->TimelineMonth(start,tasks,allTasks,habits,spheres,colors,dark,
                onOpen=onOpen,
                openDay={anchorRaw=it.toString();zoom=TimelineZoom.DAY})
        }
    }
}


/**
 * Day view only: premium, understated timeline. Week and month keep their
 * existing Mini App calendar-grid rendering.
 */
@Composable
private fun DayTimelineCard(
    entry:TimelineEntry,colors:WorkspaceColors,dark:Boolean,onOpen:(String)->Unit
){
    val subtask=entry.kind=="Подзадача"
    val event=entry.kind=="Событие"
    val reminder=entry.kind=="Напоминание"
    val habit=entry.kind=="Привычка"
    val accent=entry.color
    val cardBase=if(dark)Color(0xFF19263B) else Color.White
    val softTint=mixCalendarColor(cardBase,accent,if(dark).105f else .043f)
    val gradient=androidx.compose.ui.graphics.Brush.horizontalGradient(
        listOf(softTint,cardBase,cardBase)
    )
    val outline=if(dark)Color(0xFF40506A) else Color(0xFFE5EAF2)
    val stripe=mixCalendarColor(cardBase,accent,if(dark).54f else .35f)
    val shape=RoundedCornerShape(18.dp)
    val dueLabel=if(event||reminder||habit)shortTime(entry.time)
        else timelineDueLabel(entry.dueDate)
    val overdue=entry.dueDate?.let {
        timelineDate(it)?.isBefore(ZonedDateTime.now())
    }==true
    val statusColor=when {
        overdue->if(dark)Color(0xFFFF91A9) else Color(0xFFE63962)
        else->if(dark)Color(0xFF9BAFC9) else Color(0xFF71839F)
    }
    Row(
        Modifier.fillMaxWidth()
            // Subtasks align with tasks on the left; only the right edge is inset.
            .padding(end=if(subtask)8.dp else 0.dp)
            .shadow(
                elevation=if(dark)2.dp else 5.dp,
                shape=shape,
                ambientColor=if(dark)Color(0x22000000) else Color(0x12354B6D),
                spotColor=if(dark)Color(0x28000000) else Color(0x1C354B6D)
            )
            .clip(shape)
            .background(gradient)
            .drawBehind {
                // A soft sector accent rather than a saturated, full-card tint.
                drawRoundRect(
                    color=stripe,
                    topLeft=Offset.Zero,
                    size=Size(3.5.dp.toPx(),size.height),
                    cornerRadius=CornerRadius(2.dp.toPx())
                )
                if(event){
                    val stroke=1.dp.toPx()
                    drawRoundRect(
                        color=accent.copy(alpha=if(dark).60f else .44f),
                        topLeft=Offset(stroke/2,stroke/2),
                        size=Size(size.width-stroke,size.height-stroke),
                        cornerRadius=CornerRadius(18.dp.toPx()),
                        style=Stroke(width=stroke,
                            pathEffect=PathEffect.dashPathEffect(
                                floatArrayOf(6.dp.toPx(),4.dp.toPx()),0f))
                    )
                }
            }
            .then(if(event)Modifier else Modifier.border(1.dp,outline,shape))
            .clickable(enabled=entry.taskId!=null&&!reminder){
                entry.taskId?.let(onOpen)
            }
            .heightIn(min=if(subtask)54.dp else 62.dp),
        verticalAlignment=Alignment.Top
    ){
        // Card marker retains the sector color; only rail markers are unified.
        Box(
            Modifier.padding(start=15.dp,top=20.dp)
                .size(if(subtask)6.dp else 7.dp)
                .background(accent,CircleShape)
        )
        Column(
            Modifier.weight(1f)
                .padding(start=12.dp,end=13.dp,top=12.dp,bottom=12.dp),
            verticalArrangement=Arrangement.spacedBy(5.dp)
        ){
            Text(
                entry.title,color=colors.text,
                fontSize=if(subtask)12.5.sp else 14.sp,
                lineHeight=if(subtask)17.sp else 19.sp,
                fontWeight=FontWeight.SemiBold,
                maxLines=1,overflow=TextOverflow.Ellipsis
            )
            if(dueLabel.isNotBlank()){
                Text(
                    dueLabel,color=statusColor,
                    fontSize=if(subtask)10.5.sp else 11.5.sp,
                    lineHeight=15.sp,fontWeight=FontWeight.Medium,maxLines=1
                )
            }
        }
        // Intentionally no ellipsis button or trailing action.
    }
}

@Composable
private fun TimelineDay(day:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit){
    val entries=remember(day,tasks,allTasks,habits,spheres){
        timelineEntries(day,tasks,allTasks,habits,spheres)
    }
    val byHour=remember(entries){entries.groupBy{it.time.hour}.toSortedMap()}
    if(entries.isEmpty()){
        Surface(color=colors.panel,shape=RoundedCornerShape(15.dp),
            border=BorderStroke(1.dp,colors.panelBorder)){
            Text("На выбранный день нет записей.",color=colors.secondaryText,
                fontSize=12.sp,modifier=Modifier.padding(17.dp))
        }
        return
    }
    val rail=if(dark)Color(0xFF46556F) else Color(0xFFE1E6EF)
    // All left-side markers use exactly the same neutral slate color,
    // independent of sector, task type and overdue state.
    val marker=if(dark)Color(0xFF9CACCC) else Color(0xFF8D9BB4)
    Column(
        Modifier.fillMaxWidth().padding(top=4.dp,bottom=4.dp)
            .drawBehind {
                val x=64.dp.toPx()
                drawLine(
                    color=rail,
                    start=Offset(x,20.dp.toPx()),
                    end=Offset(x,size.height-14.dp.toPx()),
                    strokeWidth=1.3.dp.toPx()
                )
            },
        verticalArrangement=Arrangement.spacedBy(11.dp)
    ){
        byHour.forEach{(hour,records)->
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment=Alignment.Top
            ){
                Box(Modifier.width(64.dp).height(48.dp)){
                    Text(
                        String.format(Locale.US,"%02d:00",hour),
                        modifier=Modifier.align(Alignment.TopStart).padding(top=16.dp),
                        color=if(dark)Color(0xFFB7C4D7) else Color(0xFF667895),
                        fontSize=11.sp,fontWeight=FontWeight.Medium
                    )
                    Box(
                        Modifier.align(Alignment.TopEnd)
                            .offset(x=4.5.dp,y=19.dp).size(9.dp)
                            .background(marker,CircleShape)
                    )
                }
                Column(
                    Modifier.weight(1f).padding(start=13.dp),
                    verticalArrangement=Arrangement.spacedBy(9.dp)
                ){
                    records.forEach{entry->
                        DayTimelineCard(entry,colors,dark,onOpen)
                    }
                }
            }
        }
    }
}


/** Responsive calendar: week is scrollable so text never needs a 7sp font.
 * Month preserves all seven visible days and offers direct entry to day view. */
@Composable
private fun TimelineWeek(
    monday:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onOpenHabit:(String)->Unit,
    openDay:(LocalDate)->Unit
){
    MiniAppCalendarGrid(monday,false,tasks,allTasks,habits,spheres,
        colors,dark,onOpen,onOpenHabit,openDay)
}
@Composable
private fun TimelineMonth(
    first:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,openDay:(LocalDate)->Unit
){
    MiniAppCalendarGrid(first,true,tasks,allTasks,habits,spheres,
        colors,dark,onOpen,{},openDay)
}
@Composable
private fun MiniAppCalendarGrid(
    first:LocalDate,monthMode:Boolean,
    tasks:List<Task>,allTasks:List<Task>,habits:List<Habit>,
    spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onOpenHabit:(String)->Unit,openDay:(LocalDate)->Unit
){
    val gridStart=first.minusDays((first.dayOfWeek.value-1).toLong())
    if(!monthMode){
        val days=remember(gridStart,tasks,allTasks,habits,spheres){
            (0L..6L).map{index->
                val day=gridStart.plusDays(index)
                day to timelineEntries(day,tasks,allTasks,habits,spheres)
            }
        }
        ReadableWeekGrid(days,colors,dark,onOpen,onOpenHabit,openDay)
        return
    }
    val labels=listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(5.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
            labels.forEach{label->
                Text(label,modifier=Modifier.weight(1f).padding(vertical=5.dp),
                    textAlign=TextAlign.Center,color=colors.secondaryText,
                    fontSize=11.sp,fontWeight=FontWeight.SemiBold)
            }
        }
        repeat(6){row->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                horizontalArrangement=Arrangement.spacedBy(4.dp)){
                repeat(7){col->
                    val date=gridStart.plusDays((row*7+col).toLong())
                    val entries=remember(date,tasks,allTasks,habits,spheres){
                        timelineEntries(date,tasks,allTasks,habits,spheres)
                            .filter{it.kind!="Привычка"}
                    }
                    CalendarDayCell(date,entries,date.month!=first.month,true,
                        colors,dark,Modifier.weight(1f).fillMaxHeight(),
                        onDay={openDay(date)},onTask=onOpen,onHabit=onOpenHabit)
                }
            }
        }
    }
}

@Composable
private fun ReadableWeekGrid(
    days:List<Pair<LocalDate,List<TimelineEntry>>>,
    colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onHabit:(String)->Unit,openDay:(LocalDate)->Unit
){
    val weekScroll=rememberScrollState()
    val scope=rememberCoroutineScope()
    val stride=with(LocalDensity.current){160.dp.roundToPx()}
    val secondary=if(dark)Color(0xFFA9B9D0) else Color(0xFF657792)
    val border=if(dark)Color(0xFF40506A) else Color(0xFFE1E8F1)
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
            days.forEachIndexed{index,(day,_)->
                val today=day==LocalDate.now()
                val shape=RoundedCornerShape(12.dp)
                Column(Modifier.weight(1f).clip(shape)
                    .background(if(today)if(dark)Color(0xFF31264A)
                        else Color(0xFFF5F0FF)
                        else if(dark)Color(0xFF1A283C) else Color.White)
                    .border(1.dp,if(today)Color(0xFFA58BEC) else border,shape)
                    .clickable{scope.launch{
                        weekScroll.animateScrollTo(index*stride)
                    }}.padding(vertical=7.dp),
                    horizontalAlignment=Alignment.CenterHorizontally){
                    Text(day.format(DateTimeFormatter.ofPattern("EE",Locale("ru")))
                        .replaceFirstChar{it.uppercase()},
                        color=secondary,fontSize=10.sp)
                    Spacer(Modifier.height(2.dp))
                    Box(Modifier.size(27.dp).clip(CircleShape)
                        .background(if(today)Color(0xFF7C3AED) else Color.Transparent),
                        contentAlignment=Alignment.Center){
                        Text(day.dayOfMonth.toString(),
                            color=if(today)Color.White else colors.text,
                            fontSize=13.sp,fontWeight=FontWeight.Bold)
                    }
                }
            }
        }
        Row(verticalAlignment=Alignment.CenterVertically){
            Icon(Icons.Default.ChevronLeft,null,tint=secondary,
                modifier=Modifier.size(14.dp))
            Text("Листайте дни или выберите дату сверху",fontSize=10.5.sp,
                color=secondary)
            Icon(Icons.Default.ChevronRight,null,tint=secondary,
                modifier=Modifier.size(14.dp))
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(weekScroll)
            .padding(bottom=6.dp),
            horizontalArrangement=Arrangement.spacedBy(8.dp),
            verticalAlignment=Alignment.Top){
            days.forEach{(day,entries)->
                ReadableWeekColumn(day,entries,colors,dark,onOpen,onHabit,openDay)
            }
        }
    }
}

@Composable
private fun ReadableWeekColumn(
    day:LocalDate,entries:List<TimelineEntry>,
    colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onHabit:(String)->Unit,openDay:(LocalDate)->Unit
){
    val today=day==LocalDate.now()
    val edge=if(today)Color(0xFFA58BEC).copy(alpha=.7f)
        else if(dark)Color(0xFF40506A) else Color(0xFFE2E8F2)
    val muted=if(dark)Color(0xFFAFBDD2) else Color(0xFF6E7E99)
    val bg=if(dark)Color(0xFF19263A)
        else if(today)Color(0xFFFBF9FF) else Color(0xFFFCFDFF)
    val grouped=remember(entries){entries.groupBy{it.time.hour}.toSortedMap()}
    Column(Modifier.width(152.dp)
        .clip(RoundedCornerShape(16.dp)).background(bg)
        .border(1.dp,edge,RoundedCornerShape(16.dp))
        .padding(horizontal=10.dp,vertical=12.dp),
        verticalArrangement=Arrangement.spacedBy(11.dp)){
        Row(Modifier.fillMaxWidth().clickable{openDay(day)},
            horizontalArrangement=Arrangement.SpaceBetween,
            verticalAlignment=Alignment.CenterVertically){
            Text(day.format(DateTimeFormatter.ofPattern("EE, d MMM",Locale("ru")))
                    .replaceFirstChar{it.uppercase()},
                fontSize=12.sp,fontWeight=FontWeight.Bold,
                color=colors.text,maxLines=1)
            Icon(Icons.Default.ChevronRight,"Открыть день",
                tint=muted,modifier=Modifier.size(16.dp))
        }
        HorizontalDivider(color=edge.copy(alpha=.65f))
        if(entries.isEmpty()){
            Text("Нет записей",fontSize=11.sp,color=muted,
                modifier=Modifier.padding(vertical=9.dp))
        }else grouped.forEach{(hour,items)->
            Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
                Text(String.format(Locale.US,"%02d:00",hour),
                    color=muted,fontSize=10.5.sp,
                    fontWeight=FontWeight.SemiBold)
                items.forEach{entry->
                    MiniAppCalendarEntry(entry,false,dark,colors){
                        if(entry.kind=="Привычка")entry.habit?.id?.let(onHabit)
                        else if(entry.kind=="Напоминание")openDay(day)
                        else entry.taskId?.let(onOpen)
                    }
                }
            }
        }
        Text("Открыть день",fontSize=10.5.sp,
            color=if(dark)Color(0xFFC4B5FD) else Color(0xFF7C3AED),
            modifier=Modifier.fillMaxWidth().clickable{openDay(day)}
                .padding(vertical=3.dp))
    }
}

/** Month day: two readable snippets max and an explicit +N day drill-down. */
@Composable
private fun CalendarDayCell(
    date:LocalDate,entries:List<TimelineEntry>,
    outside:Boolean,monthMode:Boolean,colors:WorkspaceColors,dark:Boolean,
    modifier:Modifier=Modifier,
    onDay:()->Unit,onTask:(String)->Unit,onHabit:(String)->Unit
){
    val today=date==LocalDate.now()
    val shape=RoundedCornerShape(13.dp)
    val border=when{
        today->Color(0xFFA58BEC).copy(alpha=.8f)
        dark->Color(0xFF40506A)
        else->Color(0xFFE0E7F0)
    }
    val background=if(dark)Color(0xFF19263A)
        else if(today)Color(0xFFFAF8FF) else Color(0xFFFCFDFF)
    Column(modifier.clip(shape).background(background)
        .border(1.dp,border,shape).heightIn(min=135.dp)
        .padding(horizontal=2.dp,vertical=6.dp),
        horizontalAlignment=Alignment.CenterHorizontally,
        verticalArrangement=Arrangement.spacedBy(5.dp)){
        Box(Modifier.fillMaxWidth().height(30.dp).clickable(onClick=onDay),
            contentAlignment=Alignment.Center){
            Box(Modifier.size(28.dp).clip(CircleShape)
                .background(if(today)Color(0xFF7C3AED) else Color.Transparent),
                contentAlignment=Alignment.Center){
                Text(date.dayOfMonth.toString(),
                    color=when{
                        today->Color.White
                        outside->colors.secondaryText.copy(alpha=.7f)
                        else->colors.text
                    },fontSize=13.sp,fontWeight=FontWeight.Bold)
            }
        }
        entries.take(2).forEach{entry->
            MiniAppCalendarEntry(entry,true,dark,colors){
                if(entry.kind=="Напоминание")onDay()
                else entry.taskId?.let(onTask)?:onDay()
            }
        }
        if(entries.size>2){
            Text("Ещё "+(entries.size-2),
                color=if(dark)Color(0xFFC4B5FD) else Color(0xFF6D28D9),
                fontSize=10.sp,fontWeight=FontWeight.Bold,
                modifier=Modifier.fillMaxWidth().clickable(onClick=onDay)
                    .padding(vertical=2.dp),
                textAlign=TextAlign.Center,maxLines=1)
        }
    }
}

/** Calm calendar chip; never silently cut text off at its bounds. */
@Composable
private fun MiniAppCalendarEntry(
    entry:TimelineEntry,monthMode:Boolean,dark:Boolean,
    colors:WorkspaceColors,onClick:()->Unit
){
    val subtask=entry.kind=="Подзадача"
    val event=entry.kind=="Событие"
    val accent=entry.color
    val base=if(dark)Color(0xFF202D42) else Color.White
    val background=mixCalendarColor(base,accent,
        if(dark).13f else .055f)
    val ink=if(dark)Color(0xFFEAF1FA) else Color(0xFF233048)
    val line=if(dark)Color(0xFF45536C) else Color(0xFFE1E8F0)
    val radius=RoundedCornerShape(if(monthMode)7.dp else 10.dp)
    Row(Modifier.fillMaxWidth()
        .padding(end=if(subtask&&!monthMode)5.dp else 0.dp)
        .clip(radius).background(background)
        .then(if(event)Modifier.drawBehind{
            val stroke=1.dp.toPx()
            drawRoundRect(color=accent.copy(alpha=.68f),
                topLeft=Offset(stroke/2,stroke/2),
                size=Size(size.width-stroke,size.height-stroke),
                cornerRadius=CornerRadius(if(monthMode)7.dp.toPx() else 10.dp.toPx()),
                style=Stroke(width=stroke,
                    pathEffect=PathEffect.dashPathEffect(
                        floatArrayOf(5.dp.toPx(),4.dp.toPx()),0f)))
        }else Modifier.border(.7.dp,line,radius))
        .clickable(onClick=onClick)
        .heightIn(min=if(monthMode)30.dp else if(subtask)38.dp else 43.dp),
        verticalAlignment=Alignment.CenterVertically){
        Box(Modifier.width(3.dp).height(if(monthMode)21.dp else 30.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(accent.copy(alpha=.60f)))
        Text(entry.title,
            modifier=Modifier.weight(1f).padding(
                start=if(monthMode)3.dp else 6.dp,
                end=if(monthMode)1.dp else 4.dp,
                top=4.dp,bottom=4.dp),
            color=ink,
            fontSize=if(monthMode)10.sp else if(subtask)11.sp else 11.5.sp,
            lineHeight=if(monthMode)12.sp else 14.sp,
            fontWeight=FontWeight.Medium,
            maxLines=2,softWrap=true,overflow=TextOverflow.Ellipsis,
            textAlign=TextAlign.Start,
            style=TextStyle(platformStyle=PlatformTextStyle(includeFontPadding=false)))
    }
}

private fun mixCalendarColor(background:Color,foreground:Color,amount:Float):Color =
    Color(
        red=background.red*(1-amount)+foreground.red*amount,
        green=background.green*(1-amount)+foreground.green*amount,
        blue=background.blue*(1-amount)+foreground.blue*amount,
        alpha=1f
    )
