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

/**
 * One-to-one layout mapping of MiniApp.tsx' miniapp-calendar-grid.
 * Seven equal-width days are visible at once. Week and month intentionally
 * share the weekday row, day-number headers, and compact colored entries.
 * No horizontal scroll, zoom controls or sector pills exist in Mini App.
 */
@Composable
private fun TimelineWeek(
    monday:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onOpenHabit:(String)->Unit,
    openDay:(LocalDate)->Unit
){
    MiniAppCalendarGrid(
        first=monday,monthMode=false,tasks=tasks,allTasks=allTasks,
        habits=habits,spheres=spheres,colors=colors,dark=dark,
        onOpen=onOpen,onOpenHabit=onOpenHabit,openDay=openDay
    )
}

@Composable
private fun TimelineMonth(
    first:LocalDate,tasks:List<Task>,allTasks:List<Task>,
    habits:List<Habit>,spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,openDay:(LocalDate)->Unit
){
    MiniAppCalendarGrid(
        first=first,monthMode=true,tasks=tasks,allTasks=allTasks,
        habits=habits,spheres=spheres,colors=colors,dark=dark,
        onOpen=onOpen,onOpenHabit={},openDay=openDay
    )
}

@Composable
private fun MiniAppCalendarGrid(
    first:LocalDate,monthMode:Boolean,
    tasks:List<Task>,allTasks:List<Task>,habits:List<Habit>,
    spheres:List<Sphere>,colors:WorkspaceColors,dark:Boolean,
    onOpen:(String)->Unit,onOpenHabit:(String)->Unit,openDay:(LocalDate)->Unit
){
    val labels=listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс")
    val gridStart=first.minusDays((first.dayOfWeek.value-1).toLong())
    val rows=if(monthMode)6 else 1
    val referenceMonth=first.month
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(4.dp)){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
            labels.forEach{label->
                Text(label,
                    modifier=Modifier.weight(1f).padding(vertical=5.dp),
                    textAlign=TextAlign.Center,color=colors.secondaryText,
                    fontSize=10.sp,fontWeight=FontWeight.ExtraBold)
            }
        }
        repeat(rows){week->
            // A single seven-column row, as CSS grid-template-columns: repeat(7, minmax(0,1fr)).
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max),
                horizontalArrangement=Arrangement.spacedBy(4.dp),
                verticalAlignment=Alignment.Top){
                repeat(7){index->
                    val day=gridStart.plusDays((week*7+index).toLong())
                    val dayEntries=remember(day,monthMode,tasks,allTasks,habits,spheres) {
                        val all=timelineEntries(day,tasks,allTasks,habits,spheres)
                        if(monthMode)all.filter{it.kind!="Привычка"} else all
                    }
                    CalendarDayCell(
                        date=day,entries=dayEntries,
                        outside=monthMode&&day.month!=referenceMonth,
                        monthMode=monthMode,colors=colors,dark=dark,
                        modifier=Modifier.weight(1f).fillMaxHeight(),
                        onDay={openDay(day)},onTask=onOpen,onHabit=onOpenHabit
                    )
                }
            }
        }
    }
}

/** MiniApp's miniapp-calendar-day and miniapp-calendar-date. */
@Composable
private fun CalendarDayCell(
    date:LocalDate,entries:List<TimelineEntry>,
    outside:Boolean,monthMode:Boolean,colors:WorkspaceColors,dark:Boolean,
    modifier:Modifier=Modifier,
    onDay:()->Unit,onTask:(String)->Unit,onHabit:(String)->Unit
){
    val today=date==LocalDate.now()
    val shape=RoundedCornerShape(12.dp)
    val cellBg=when{
        today->if(dark)Color(0xFF261F42) else Color(0xFFF5F3FF)
        dark->Color(0xFF172338)
        else->Color(0xFFF8FAFC)
    }
    val edge=when{
        today->if(dark)Color(0xFF8B5CF6) else Color(0xFF9F77D5)
        dark->Color(0xFF3F5067)
        else->Color(0xFFCBD5E1)
    }
    // Outside-month days remain real interactive dates, just faded.
    Column(
        modifier.then(Modifier
            .alpha(if(outside).42f else 1f)
            .clip(shape)
            .background(cellBg)
            .border(1.dp,edge,shape)
            .heightIn(min=if(monthMode)104.dp else 144.dp)
            .padding(horizontal=if(monthMode)3.dp else 2.dp,vertical=5.dp)),
        horizontalAlignment=Alignment.CenterHorizontally,
        verticalArrangement=Arrangement.spacedBy(3.dp)
    ){
        // In week view, MiniApp shows the short weekday *inside* each cell.
        Row(
            Modifier.fillMaxWidth().height(25.dp)
                .clip(RoundedCornerShape(7.dp)).clickable(onClick=onDay),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.Center
        ){
            if(!monthMode){
                Text(date.format(DateTimeFormatter.ofPattern("EE",Locale("ru"))),
                    color=colors.secondaryText,fontSize=9.sp,maxLines=1)
                Spacer(Modifier.width(2.dp))
            }
            Box(Modifier.size(24.dp)
                .clip(CircleShape)
                .background(if(today)Color(0xFF7C3AED) else Color.Transparent),
                contentAlignment=Alignment.Center
            ){
                Text(date.dayOfMonth.toString(),
                    color=if(today)Color.White else colors.text,
                    fontSize=12.sp,fontWeight=FontWeight.Bold,
                    style=TextStyle(platformStyle=PlatformTextStyle(includeFontPadding=false)),
                    textAlign=TextAlign.Center)
            }
        }
        if(monthMode){
            val visible=entries.take(3)
            visible.forEach{entry->
                MiniAppCalendarEntry(
                    entry=entry,monthMode=true,dark=dark,
                    onClick={
                        if(entry.taskId!=null&&entry.kind!="Напоминание")onTask(entry.taskId)
                    })
            }
            if(entries.size>visible.size){
                Text("Ещё ${entries.size-visible.size}",
                    modifier=Modifier.fillMaxWidth().padding(start=2.dp,top=1.dp),
                    color=if(dark)Color(0xFFA78BFA) else Color(0xFF6D28D9),
                    fontWeight=FontWeight.Bold,fontSize=9.sp,maxLines=1)
            }
        }else{
            // MiniApp calendar groups entries by hour inside each day.
            val hourGroups=remember(entries) { entries.groupBy{it.time.hour}.toSortedMap() }
            hourGroups.forEach{(hour,items)->
                val groupShape=RoundedCornerShape(8.dp)
                Column(
                    Modifier.fillMaxWidth()
                        .clip(groupShape)
                        .background(if(dark)Color(0xFF142033) else Color(0xFFF1F5F9))
                        .border(1.dp,if(dark)Color(0xFF415167) else Color(0xFFCBD5E1),
                            groupShape)
                        .padding(horizontal=2.dp,vertical=3.dp),
                    verticalArrangement=Arrangement.spacedBy(3.dp)
                ){
                    Text(String.format(Locale.US,"%02d:00",hour),
                        modifier=Modifier.padding(start=1.dp),
                        color=colors.secondaryText,fontSize=8.8.sp,
                        maxLines=1,fontWeight=FontWeight.Bold)
                    items.forEach{entry->
                        MiniAppCalendarEntry(entry=entry,monthMode=false,dark=dark,
                            onClick={
                                if(entry.kind=="Привычка")entry.habit?.id?.let(onHabit)
                                else if(entry.kind!="Напоминание")entry.taskId?.let(onTask)
                            })
                    }
                }
            }
        }
    }
}

/** MiniApp's miniapp-calendar-entry, miniapp-calendar-event-entry and reminder variant. */
@Composable
private fun MiniAppCalendarEntry(
    entry:TimelineEntry,monthMode:Boolean,dark:Boolean,onClick:()->Unit
){
    val isEvent=entry.kind=="Событие"
    val isReminder=entry.kind=="Напоминание"
    val isSubtask=entry.kind=="Подзадача"
    val accent=when{
        isEvent->Color(0xFFF59E0B)
        isReminder->Color(0xFF0284C7)
        else->entry.color
    }
    val shape=RoundedCornerShape(5.dp)
    val background=when{
        isEvent&&dark->Color(0xFF63401E)
        isEvent->Color(0xFFFEF3C7)
        isReminder&&dark->Color(0xFF123B59)
        isReminder->Color(0xFFE0F2FE)
        dark->mixCalendarColor(Color(0xFF142135),accent,.22f)
        else->mixCalendarColor(Color.White,accent,.13f)
    }
    val textColor=when{
        isEvent&&dark->Color(0xFFFDE68A)
        isEvent->Color(0xFF92400E)
        dark->Color(0xFFE2E8F0)
        else->Color(0xFF0F172A)
    }
    // Calendar entries keep their sector as a soft background tint.
    // Events use the same dashed outline in day, week and month views.
    Row(Modifier.fillMaxWidth()
        .padding(end=if(isSubtask)2.dp else 0.dp)
        .heightIn(min=if(isSubtask)18.dp else if(monthMode)19.dp else 20.dp)
        .clip(shape).background(background)
        .then(if(isEvent)Modifier.drawBehind {
            val stroke=1.dp.toPx()
            drawRoundRect(color=accent.copy(alpha=.88f),
                topLeft=Offset(stroke/2,stroke/2),
                size=Size(size.width-stroke,size.height-stroke),
                cornerRadius=CornerRadius(5.dp.toPx()),
                style=Stroke(width=stroke,pathEffect=PathEffect.dashPathEffect(
                    floatArrayOf(4.dp.toPx(),3.dp.toPx()),0f)))
        } else Modifier.border(1.dp,accent.copy(alpha=.55f),shape))
        .clickable(onClick=onClick),
        verticalAlignment=Alignment.CenterVertically){
        Text(entry.title,
            modifier=Modifier.weight(1f).padding(start=3.dp,end=1.dp),
            color=textColor,
            fontSize=if(isSubtask)8.3.sp else 9.sp,
            lineHeight=11.sp,maxLines=1,softWrap=false,
            overflow=TextOverflow.Clip,
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
