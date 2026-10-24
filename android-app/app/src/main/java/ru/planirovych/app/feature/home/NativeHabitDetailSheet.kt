package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.serialization.json.*
import ru.planirovych.app.data.model.*
import java.time.*
import java.time.temporal.ChronoUnit
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class HabitPalette(val bg:Color,val field:Color,val text:Color,val muted:Color,
    val border:Color,val primary:Color,val done:Color)
private fun habitPalette(dark:Boolean)=if(dark)HabitPalette(
    Color(0xFF152238),Color(0xFF213049),Color(0xFFF1F5F9),Color(0xFFA7B4C8),
    Color(0xFF45536A),Color(0xFFA78BFA),Color(0xFF16A34A)
)else HabitPalette(Color.White,Color(0xFFF7F8FC),Color(0xFF172238),
    Color(0xFF64748B),Color(0xFFDCE4EE),Color(0xFF7C3AED),Color(0xFF15803D))
private fun habitAccent(raw:String):Color=runCatching{
    Color(android.graphics.Color.parseColor(raw))
}.getOrDefault(Color(0xFF22C55E))
private fun habitCreated(habit:Habit):LocalDate {
    val raw=habit.createdAt ?: return LocalDate.now()
    return runCatching {
        Instant.parse(raw).atZone(ZoneId.systemDefault()).toLocalDate()
    }.recoverCatching { OffsetDateTime.parse(raw).toLocalDate() }
        .getOrDefault(LocalDate.now())
}
private fun habitScheduled(habit:Habit,date:LocalDate,created:LocalDate):Boolean {
    if(date.isBefore(created))return false
    if(habit.durationMode==HabitDurationMode.UNTIL_DATE &&
        !habit.endDate.isNullOrBlank() && date.toString()>habit.endDate.take(10))return false
    return when(habit.recurrenceType){
        HabitRecurrenceType.DAILY -> true
        HabitRecurrenceType.INTERVAL ->
            ChronoUnit.DAYS.between(created,date) % (habit.intervalDays?:1).coerceAtLeast(1)==0L
        HabitRecurrenceType.WEEKDAYS -> habit.weekdays.contains(date.dayOfWeek.value%7)
    }
}
private fun habitAmount(date:LocalDate,counts:Map<String,Int>)=counts[date.toString()]?:0
private data class HabitMetrics(val completed:Int,val eligible:Int,val percent:Int,
    val currentStreak:Int,val longestStreak:Int)
private fun habitMetrics(habit:Habit,yearMonth:YearMonth,counts:Map<String,Int>):HabitMetrics {
    val today=LocalDate.now()
    val created=habitCreated(habit)
    var eligible=0;var completed=0
    for(day in 1..yearMonth.lengthOfMonth()){
        val date=yearMonth.atDay(day)
        if(date.isAfter(today))break
        if(habitScheduled(habit,date,created)){
            eligible++
            if(habitAmount(date,counts)>=habit.targetCount.coerceAtLeast(1))completed++
        }
    }
    var current=0; var best=0;var running=0;var tracking=true
    val range=ChronoUnit.DAYS.between(created,today).coerceIn(0,36525).toInt()
    for(i in 0..range){
        val date=created.plusDays(i.toLong())
        if(!habitScheduled(habit,date,created))continue
        val done=habitAmount(date,counts)>=habit.targetCount.coerceAtLeast(1)
        if(done)running++ else if(date!=today)running=0
        if(running>best)best=running
    }
    for(i in 0..range){
        val date=today.minusDays(i.toLong())
        if(date.isBefore(created))break
        if(!habitScheduled(habit,date,created))continue
        if(i==0 && habitAmount(date,counts)<habit.targetCount)continue
        if(habitAmount(date,counts)>=habit.targetCount && tracking)current++
        else tracking=false
        if(!tracking)break
    }
    return HabitMetrics(completed,eligible,if(eligible==0)0 else completed*100/eligible,
        current,best)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeHabitDetailSheet(vm:HomeViewModel,habit:Habit,dark:Boolean,onClose:()->Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val c=remember(dark){habitPalette(dark)}
    val accent=habitAccent(habit.color)
    val today=LocalDate.now()
    val created=remember(habit.id,habit.createdAt){habitCreated(habit)}
    val history=if(state.habitHistoryId==habit.id)state.habitHistory else null
    val counts=remember(history,habit.stats){
        val stats=linkedMapOf<String,Int>()
        history?.forEach{stats[it.dateKey]=it.amount}
        habit.stats.forEach{stats[it.dateKey]=it.amount}
        stats
    }
    var month by remember(habit.id){mutableStateOf(YearMonth.now())}
    var settingsOpen by remember(habit.id){mutableStateOf(false)}
    var confirm by remember(habit.id){mutableStateOf<String?>(null)}
    val metrics=remember(habit,month,counts){habitMetrics(habit,month,counts)}
    val amount=habitAmount(today,counts)
    val density=LocalDensity.current
    var dragDistance by remember(habit.id){ mutableFloatStateOf(0f) }
    LaunchedEffect(habit.id){vm.loadHabitHistory(habit.id)}
    ModalBottomSheet(
        onDismissRequest=onClose,
        sheetGesturesEnabled=false,
        containerColor=c.bg,contentColor=c.text,
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),
        dragHandle={
            Box(Modifier.fillMaxWidth().height(28.dp)
                .pointerInput(habit.id) {
                    detectVerticalDragGestures(
                        onDragEnd={
                            if(dragDistance > with(density){64.dp.toPx()})onClose()
                            dragDistance=0f
                        },
                        onDragCancel={dragDistance=0f},
                        onVerticalDrag={change,amount->
                            change.consume()
                            dragDistance=(dragDistance+amount).coerceAtLeast(0f)
                        }
                    )
                },contentAlignment=Alignment.Center) {
                Box(Modifier.width(38.dp).height(4.dp).clip(CircleShape)
                    .background(c.muted.copy(alpha=.52f)))
            }
        },
    ){
        Column(Modifier.fillMaxWidth().heightIn(max=(LocalConfiguration.current.screenHeightDp*.75f).dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal=17.dp,vertical=4.dp)
            .navigationBarsPadding(),
            verticalArrangement=Arrangement.spacedBy(13.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.SpaceBetween) {
                Text("ПРИВЫЧКА",color=c.primary,fontSize=11.sp,
                    fontWeight=FontWeight.Bold,letterSpacing=2.sp)
                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    HabitCircleIcon(Icons.Default.Settings,c,"Настройки привычки"){
                        settingsOpen=true
                    }
                    HabitCircleIcon(Icons.Default.Close,c,"Закрыть",onClose)
                }
            }
            Row(verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(13.dp)){
                Box(Modifier.size(70.dp).clip(CircleShape)
                    .background(c.field).border(3.dp,accent,CircleShape),
                    contentAlignment=Alignment.Center){
                    Text(habit.icon,fontSize=29.sp,textAlign=TextAlign.Center)
                }
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)){
                    Text(habit.name,fontSize=18.sp,fontWeight=FontWeight.Bold,color=c.text)
                    Text("Сегодня выполнено: "+amount+" из "+habit.targetCount,
                        color=c.muted,fontSize=12.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        HabitCounterButton(Icons.Default.Remove,c,
                            enabled=amount>0&&!state.habitBusy){
                            vm.uncompleteHabitDay(habit.id,today.toString(),1)
                        }
                        Button(onClick={vm.recordHabitDay(habit.id,today.toString())},
                            enabled=amount<habit.targetCount&&!state.habitBusy,
                            modifier=Modifier.weight(1f).height(37.dp),
                            shape=RoundedCornerShape(12.dp),
                            colors=ButtonDefaults.buttonColors(containerColor=Color(0xFF059669))) {
                            Text("Выполнить",fontSize=12.sp)
                        }
                        HabitCounterButton(Icons.Default.Add,c,
                            enabled=amount<habit.targetCount&&!state.habitBusy){
                            vm.recordHabitDay(habit.id,today.toString())
                        }
                    }
                }
            }
            Surface(shape=RoundedCornerShape(22.dp),color=c.field,
                border=BorderStroke(1.dp,c.border)){
                Column(Modifier.fillMaxWidth().padding(13.dp),
                    verticalArrangement=Arrangement.spacedBy(10.dp)){
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.SpaceBetween){
                        Row(verticalAlignment=Alignment.CenterVertically){
                            Icon(Icons.Default.CalendarMonth,null,tint=c.primary,
                                modifier=Modifier.size(17.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(month.atDay(1).format(DateTimeFormatter.ofPattern(
                                "LLLL yyyy",Locale("ru"))).replaceFirstChar{it.uppercase()},
                                color=c.text,fontWeight=FontWeight.Bold,fontSize=14.sp)
                        }
                        Row{
                            IconButton(onClick={month=month.minusMonths(1)},
                                enabled=month.isAfter(YearMonth.from(created))){
                                Icon(Icons.Default.ChevronLeft,"Предыдущий месяц",tint=c.primary)
                            }
                            IconButton(onClick={month=month.plusMonths(1)},
                                enabled=month.isBefore(YearMonth.now())){
                                Icon(Icons.Default.ChevronRight,"Следующий месяц",tint=c.primary)
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth()){
                        listOf("Пн","Вт","Ср","Чт","Пт","Сб","Вс").forEach{d->
                            Text(d,Modifier.weight(1f),textAlign=TextAlign.Center,
                                fontSize=11.sp,color=c.muted,fontWeight=FontWeight.Bold)
                        }
                    }
                    val first=month.atDay(1)
                    val start=first.minusDays((first.dayOfWeek.value-1).toLong())
                    val cells=((first.dayOfWeek.value-1+month.lengthOfMonth()+6)/7)*7
                    repeat(cells/7){week->
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(2.dp)){
                            repeat(7){index->
                                val day=start.plusDays((week*7+index).toLong())
                                val inside=YearMonth.from(day)==month
                                val planned=habitScheduled(habit,day,created)
                                val count=habitAmount(day,counts)
                                val complete=planned&&count>=habit.targetCount
                                val partial=planned&&count>0&&!complete
                                val editable=inside&&planned&&!day.isAfter(today)&&history!=null&&!state.habitBusy
                                Box(Modifier.weight(1f).aspectRatio(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(when {
                                        complete&&inside->c.done
                                        partial&&inside->accent.copy(alpha=.46f)
                                        day==today&&inside->c.primary.copy(alpha=.13f)
                                        else->c.bg
                                    })
                                    .then(if(day==today && inside)Modifier.border(
                                        1.dp,c.primary,RoundedCornerShape(10.dp))else Modifier)
                                    .clickable(enabled=editable){
                                        if(complete)vm.uncompleteHabitDay(habit.id,day.toString(),count)
                                        else vm.recordHabitDay(habit.id,day.toString(),
                                            (habit.targetCount-count).coerceAtLeast(1))
                                    },contentAlignment=Alignment.Center){
                                    Text(day.dayOfMonth.toString(),fontSize=12.sp,
                                        color=if(complete&&inside)Color.White
                                            else if(inside&&planned)c.text else c.muted.copy(alpha=.42f),
                                        fontWeight=if(day==today)FontWeight.Bold else FontWeight.Normal)
                                }
                            }
                        }
                    }
                    when {
                        history==null && state.habitError!=null ->
                            Text("Историю получить не удалось. Отметки календаря недоступны.",
                                color=c.muted,fontSize=11.sp)
                        history==null -> Text("Загружаем историю выполнения…",
                            color=c.muted,fontSize=11.sp)
                        else -> Text("Нажмите на прошедший запланированный день, чтобы поставить или снять отметку.",
                            color=c.muted,fontSize=11.sp)
                    }
                    Row(horizontalArrangement=Arrangement.spacedBy(11.dp)){
                        HabitLegend(c.done,"Выполнено",c)
                        HabitLegend(accent.copy(alpha=.46f),"Частично",c)
                    }
                }
            }
            state.habitError?.let{
                Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
            }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(9.dp)){
                HabitStatCard("Выполнение за месяц",metrics.percent.toString()+"%",
                    metrics.completed.toString()+" из "+metrics.eligible,c,Modifier.weight(1f))
                HabitStatCard("Текущая серия",metrics.currentStreak.toString(),
                    "плановых дней подряд",c,Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(9.dp)){
                HabitStatCard("Лучшая серия",metrics.longestStreak.toString(),
                    "из доступной истории",c,Modifier.weight(1f))
                HabitStatCard("Успешных дней",metrics.completed.toString(),
                    "в выбранном месяце",c,Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
        }
    }
    if(settingsOpen) HabitSettingsDialog(habit,c,
        busy=state.habitBusy,
        onDismiss={settingsOpen=false},
        onSave={payload->vm.editHabit(habit.id,payload){settingsOpen=false}},
        onFinish={settingsOpen=false;confirm="finish"},
        onDelete={settingsOpen=false;confirm="delete"})
    confirm?.let{action->
        AlertDialog(onDismissRequest={confirm=null},
            title={Text(if(action=="finish")"Завершить привычку?" else "Удалить привычку?")},
            text={Text(if(action=="finish")"Привычка больше не будет активной."
                else "Привычка и её история будут удалены.")},
            confirmButton={TextButton(onClick={
                confirm=null
                vm.removeHabit(habit.id,action=="finish",onClose)
            }){Text(if(action=="finish")"Завершить" else "Удалить")}},
            dismissButton={TextButton(onClick={confirm=null}){Text("Отмена")}})
    }
}
@Composable private fun HabitCircleIcon(icon:androidx.compose.ui.graphics.vector.ImageVector,
    c:HabitPalette,label:String,click:()->Unit){
    Box(Modifier.size(34.dp).clip(CircleShape).background(c.field)
        .border(1.dp,c.primary.copy(alpha=.24f),CircleShape)
        .clickable(onClick=click),contentAlignment=Alignment.Center){
        Icon(icon,label,modifier=Modifier.size(17.dp),tint=c.primary)
    }
}
@Composable private fun HabitCounterButton(icon:androidx.compose.ui.graphics.vector.ImageVector,
    c:HabitPalette,enabled:Boolean,click:()->Unit){
    IconButton(onClick=click,enabled=enabled,
        modifier=Modifier.size(34.dp).border(1.dp,c.border,CircleShape)
            .background(c.field,CircleShape)){
        Icon(icon,null,tint=c.primary,modifier=Modifier.size(17.dp))
    }
}
@Composable private fun HabitLegend(color:Color,label:String,c:HabitPalette){
    Row(verticalAlignment=Alignment.CenterVertically){
        Box(Modifier.size(8.dp).background(color,CircleShape))
        Spacer(Modifier.width(5.dp))
        Text(label,color=c.muted,fontSize=10.sp)
    }
}
@Composable private fun HabitStatCard(title:String,value:String,subtitle:String,
    c:HabitPalette,modifier:Modifier=Modifier){
    Surface(modifier,shape=RoundedCornerShape(17.dp),color=c.field,
        border=BorderStroke(1.dp,c.border)){
        Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(5.dp)){
            Text(value,fontSize=23.sp,color=c.text,fontWeight=FontWeight.Bold)
            Text(title,fontSize=11.sp,color=c.text,fontWeight=FontWeight.SemiBold)
            Text(subtitle,fontSize=10.sp,color=c.muted,lineHeight=13.sp)
        }
    }
}

@Composable
fun NativeHabitCreateSheet(vm:HomeViewModel,dark:Boolean,onClose:()->Unit){
    val state by vm.state.collectAsStateWithLifecycle()
    HabitSettingsDialog(
        habit=null,c=habitPalette(dark),busy=state.habitBusy,
        onDismiss=onClose,
        onSave={payload->vm.createHabit(payload,onClose)},
        onFinish={},onDelete={}
    )
}
@Composable
private fun HabitSettingsDialog(habit:Habit?,c:HabitPalette,busy:Boolean,
    onDismiss:()->Unit,onSave:(JsonObject)->Unit,onFinish:()->Unit,onDelete:()->Unit){
    val ctx=LocalContext.current
    var icon by remember(habit?.id ?: "new"){mutableStateOf(habit?.icon ?: "✨")}
    var color by remember(habit?.id ?: "new"){mutableStateOf(habit?.color ?: "#22c55e")}
    var name by remember(habit?.id ?: "new"){mutableStateOf(habit?.name.orEmpty())}
    var target by remember(habit?.id ?: "new"){mutableIntStateOf(habit?.targetCount ?: 1)}
    var reminderTimes by remember(habit?.id ?: "new"){mutableStateOf(habit?.reminderTimes.orEmpty().ifEmpty {
        listOfNotNull(habit?.reminderTime)
    })}
    var duration by remember(habit?.id ?: "new"){mutableStateOf(habit?.durationMode ?: HabitDurationMode.FOREVER)}
    var endDate by remember(habit?.id ?: "new"){mutableStateOf(habit?.endDate?.take(10))}
    var totalRepeat by remember(habit?.id ?: "new"){mutableIntStateOf(habit?.totalRepeatTarget?:1)}
    var recurrence by remember(habit?.id ?: "new"){mutableStateOf(habit?.recurrenceType ?: HabitRecurrenceType.DAILY)}
    var intervalDays by remember(habit?.id ?: "new"){mutableIntStateOf(habit?.intervalDays?:2)}
    var weekdays by remember(habit?.id ?: "new"){mutableStateOf(habit?.weekdays.orEmpty().toSet())}
    val datePicker={
        val date=endDate?.let{runCatching{LocalDate.parse(it)}.getOrNull()}?:LocalDate.now()
        DatePickerDialog(ctx,{_,year,month,day->
            endDate=LocalDate.of(year,month+1,day).toString()
        },date.year,date.monthValue-1,date.dayOfMonth).show()
    }
    val sendChanges={
        if(name.isNotBlank()){
            onSave(buildJsonObject{
                put("name",name.trim());put("icon",icon.trim().ifBlank{"✨"})
                put("color",color)
                put("targetCount",target)
                put("reminderTimes",buildJsonArray{reminderTimes.sorted().forEach{add(it)}})
                if(reminderTimes.isEmpty())put("reminderTime",JsonNull)
                else put("reminderTime",reminderTimes.sorted().first())
                put("durationMode",duration.name)
                if(duration==HabitDurationMode.UNTIL_DATE && !endDate.isNullOrBlank())
                    put("endDate",endDate)
                else put("endDate",JsonNull)
                if(duration==HabitDurationMode.REPEAT_COUNT)put("totalRepeatTarget",totalRepeat)
                else put("totalRepeatTarget",JsonNull)
                put("recurrenceType",recurrence.name)
                if(recurrence==HabitRecurrenceType.INTERVAL)put("intervalDays",intervalDays)
                put("weekdays",buildJsonArray {
                    if(recurrence==HabitRecurrenceType.WEEKDAYS)weekdays.sorted().forEach{add(it)}
                })
            })
        }
    }
    Dialog(onDismissRequest=onDismiss,properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxWidth().padding(horizontal=15.dp)
            .heightIn(max=(LocalConfiguration.current.screenHeightDp*.85f).dp),
            shape=RoundedCornerShape(23.dp),color=c.bg,
            border=BorderStroke(1.dp,c.primary.copy(alpha=.38f)),shadowElevation=14.dp){
            Column(Modifier.padding(16.dp)){
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.SpaceBetween){
                    Text(if(habit==null)"Новая привычка" else "Настройки привычки",fontSize=17.sp,color=c.text,
                        fontWeight=FontWeight.Bold)
                    HabitCircleIcon(Icons.Default.Close,c,"Закрыть настройки",onDismiss)
                }
                Spacer(Modifier.height(10.dp))
                Column(Modifier.weight(1f,fill=false).verticalScroll(rememberScrollState()),
                    verticalArrangement=Arrangement.spacedBy(12.dp)){
                    OutlinedTextField(value=name,onValueChange={name=it},
                        label={Text("Название привычки")},modifier=Modifier.fillMaxWidth(),
                        singleLine=true)
                    Text("Иконка",color=c.muted,fontSize=12.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                        listOf("✨","📚","💧","🏃","🧘","💪").forEach{option->
                            Box(Modifier.size(39.dp).clip(CircleShape)
                                .background(if(icon==option)c.primary.copy(alpha=.25f) else c.field)
                                .border(1.dp,if(icon==option)c.primary else c.border,CircleShape)
                                .clickable{icon=option},contentAlignment=Alignment.Center){
                                Text(option,fontSize=18.sp)
                            }
                        }
                    }
                    OutlinedTextField(value=icon,onValueChange={icon=it.take(8)},
                        label={Text("Другой эмодзи")},modifier=Modifier.fillMaxWidth(),
                        singleLine=true)
                    Text("Цвет круга",color=c.muted,fontSize=12.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        listOf("#22c55e","#06b6d4","#8b5cf6","#f59e0b","#ef4444","#ec4899").forEach{option->
                            Box(Modifier.size(36.dp).clip(CircleShape)
                                .background(habitAccent(option))
                                .border(if(option==color)3.dp else 1.dp,
                                    if(option==color)c.text else c.border,CircleShape)
                                .clickable{color=option})
                        }
                    }
                    Text("Повторов в день",color=c.muted,fontSize=12.sp)
                    HabitStepper(target,1,99,c){target=it}
                    Text("Уведомления",color=c.muted,fontSize=12.sp)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        reminderTimes.sorted().forEach{time->
                            Row(Modifier.clip(CircleShape).background(c.field)
                                .border(1.dp,c.border,CircleShape)
                                .clickable{reminderTimes=reminderTimes-time}
                                .padding(horizontal=9.dp,vertical=8.dp),
                                verticalAlignment=Alignment.CenterVertically){
                                Text(time,color=c.text,fontSize=12.sp)
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Default.Close,null,tint=c.muted,modifier=Modifier.size(13.dp))
                            }
                        }
                        OutlinedButton(onClick={
                            val now=LocalTime.of(9,0)
                            TimePickerDialog(ctx,{_,hour,minute->
                                val time=String.format(Locale.US,"%02d:%02d",hour,minute)
                                reminderTimes=(reminderTimes+time).distinct().sorted()
                            },now.hour,now.minute,true).show()
                        }){Icon(Icons.Default.Add,null,Modifier.size(14.dp));Text("Добавить",fontSize=11.sp)}
                    }
                    Text("Продолжительность привычки",color=c.muted,fontSize=12.sp)
                    HabitOptions(listOf("Постоянно","До даты","По повторам"),
                        duration.ordinal,c){duration=HabitDurationMode.entries[it]}
                    if(duration==HabitDurationMode.UNTIL_DATE) {
                        OutlinedButton(onClick=datePicker,modifier=Modifier.fillMaxWidth()){
                            Text(endDate ?: "Выбрать дату завершения")
                        }
                    }
                    if(duration==HabitDurationMode.REPEAT_COUNT) {
                        Text("Общее количество повторов",fontSize=11.sp,color=c.muted)
                        HabitStepper(totalRepeat,1,9999,c){totalRepeat=it}
                    }
                    Text("Как часто повторяется",fontSize=12.sp,color=c.muted)
                    HabitOptions(listOf("Каждый день","Интервал","Дни недели"),
                        recurrence.ordinal,c){recurrence=HabitRecurrenceType.entries[it]}
                    if(recurrence==HabitRecurrenceType.INTERVAL) {
                        Text("Каждые N дней",fontSize=11.sp,color=c.muted)
                        HabitStepper(intervalDays,1,365,c){intervalDays=it}
                    }
                    if(recurrence==HabitRecurrenceType.WEEKDAYS){
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){
                            listOf("Вс","Пн","Вт","Ср","Чт","Пт","Сб").forEachIndexed{day,label->
                                val active=day in weekdays
                                Box(Modifier.weight(1f).height(36.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if(active)c.primary else c.field)
                                    .clickable{weekdays=if(active)weekdays-day else weekdays+day},
                                    contentAlignment=Alignment.Center){
                                    Text(label,fontSize=10.sp,color=if(active)Color.White else c.text)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    if(habit!=null){
                        HorizontalDivider(color=c.border)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            OutlinedButton(onClick=onFinish,modifier=Modifier.weight(1f)){
                                Text("Завершить",fontSize=11.sp)
                            }
                            OutlinedButton(onClick=onDelete,modifier=Modifier.weight(1f)){
                                Text("Удалить",fontSize=11.sp,color=Color(0xFFE11D48))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Button(onClick=sendChanges,enabled=!busy&&name.isNotBlank()&&
                    !(duration==HabitDurationMode.UNTIL_DATE&&endDate.isNullOrBlank())&&
                    !(recurrence==HabitRecurrenceType.WEEKDAYS&&weekdays.isEmpty()),
                    modifier=Modifier.fillMaxWidth(),
                    shape=RoundedCornerShape(13.dp)){
                    Text(if(busy)"Сохраняем…" else if(habit==null)"Создать привычку" else "Сохранить настройки")
                }
            }
        }
    }
}
@Composable private fun HabitStepper(value:Int,min:Int,max:Int,c:HabitPalette,
    onChange:(Int)->Unit){
    Row(Modifier.fillMaxWidth().height(42.dp)
        .clip(RoundedCornerShape(12.dp)).border(1.dp,c.border,RoundedCornerShape(12.dp)),
        verticalAlignment=Alignment.CenterVertically){
        IconButton(onClick={onChange((value-1).coerceAtLeast(min))},
            enabled=value>min){Icon(Icons.Default.Remove,null,tint=c.primary)}
        Text(value.toString(),Modifier.weight(1f),textAlign=TextAlign.Center,
            color=c.text,fontWeight=FontWeight.Bold)
        IconButton(onClick={onChange((value+1).coerceAtMost(max))},
            enabled=value<max){Icon(Icons.Default.Add,null,tint=c.primary)}
    }
}
@Composable private fun HabitOptions(labels:List<String>,selected:Int,c:HabitPalette,
    onClick:(Int)->Unit){
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(5.dp)){
        labels.forEachIndexed{index,label->
            Box(Modifier.weight(1f).heightIn(min=36.dp)
                .clip(CircleShape).background(if(index==selected)c.primary else c.field)
                .border(1.dp,if(index==selected)c.primary else c.border,CircleShape)
                .clickable{onClick(index)}.padding(horizontal=4.dp,vertical=7.dp),
                contentAlignment=Alignment.Center){
                Text(label,color=if(index==selected)Color.White else c.text,
                    fontSize=10.sp,fontWeight=FontWeight.SemiBold,textAlign=TextAlign.Center,
                    maxLines=2,lineHeight=12.sp)
            }
        }
    }
}
