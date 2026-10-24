package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import ru.planirovych.app.data.model.*

/**
 * Native workspace modeled after MiniApp.tsx / MiniWorkspaceTools.tsx.
 * Keep the screen's visual tokens independent of Material's default tonal surfaces:
 * this prevents the light theme from turning the chips grey/translucent.
 */
internal data class WorkspaceColors(
    val panel: Color, val card: Color, val panelBorder: Color,
    val field: Color, val muted: Color, val text: Color, val secondaryText: Color,
    val purple: Color, val selected: Color, val selectedText: Color,
)
private fun workspaceColors(dark: Boolean) = if (dark) WorkspaceColors(
    panel=Color(0xFF18243A), card=Color(0xFF1B283D), panelBorder=Color(0xFF35455C),
    field=Color(0xFF142036), muted=Color(0xFF243249), text=Color(0xFFF1F5F9),
    secondaryText=Color(0xFFA5B4CA), purple=Color(0xFFA78BFA),
    selected=Color(0xFF352D59), selectedText=Color(0xFFC4B5FD),
) else WorkspaceColors(
    panel=Color.White, card=Color.White, panelBorder=Color(0xFFD8E2EF),
    field=Color(0xFFF8FAFD), muted=Color(0xFFF3F5FB), text=Color(0xFF172238),
    secondaryText=Color(0xFF60718B), purple=Color(0xFF6D28D9),
    selected=Color(0xFFEFE7FF), selectedText=Color(0xFF6D28D9),
)
private fun tinted(color: Color, background: Color, fraction: Float) = lerp(background, color, fraction)
private enum class WorkspaceMode { LIST, TIMELINE }
private enum class PeriodFilter(val label: String) {
    ALL("За всё время"), TODAY("Сегодня"), TOMORROW("Завтра"), WEEK("Неделя"), MONTH("Месяц")
}
private enum class SortTasks(val label: String) { URGENCY("По срочности"), IMPORTANCE("По важности") }
private enum class TimelineScale(val label: String) { DAY("День"), WEEK("Неделя"), MONTH("Месяц") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernWorkspace(
    vm: HomeViewModel,
    state: HomeState,
    dark: Boolean,
    search: (String) -> Unit,
    settings: () -> Unit,
    onOpenTask: (String) -> Unit,
    pagerState: PagerState,
    modifier: Modifier = Modifier,
) {
    val colors = remember(dark) { workspaceColors(dark) }
    var period by rememberSaveable { mutableStateOf(PeriodFilter.ALL) }
    var sort by rememberSaveable { mutableStateOf(SortTasks.URGENCY) }
    var selectedSectors by remember { mutableStateOf(setOf<String>()) }
    var sectorFilterEnabled by rememberSaveable { mutableStateOf(false) }
    var timelineSector by rememberSaveable { mutableStateOf("all") }
    var filtersOpen by remember { mutableStateOf(false) }
    var scoreOpen by remember { mutableStateOf(false) }
    var creditsOpen by remember { mutableStateOf(false) }
    var selectedHabitId by remember { mutableStateOf<String?>(null) }
    var createHabitOpen by remember { mutableStateOf(false) }
    val sectors = remember(state.spheres) { state.spheres.associateBy { it.id } }
    val searchQuery = state.query.trim().lowercase(Locale.getDefault())
    val now = System.currentTimeMillis()
    val overdue = state.tasks.any { it.status != TaskStatus.DONE && it.taskType == TaskType.TASK &&
        it.dueDate != null && dueMillis(it.dueDate) < now }
    val habits = remember(state.habits) {
        state.habits.filter { !it.isAutoCompleted && !it.isArchived }.sortedWith(
            compareBy<Habit> { h -> isHabitDoneToday(h) }.thenBy { it.createdAt ?: "" }
        )
    }
    HorizontalPager(state=pagerState,modifier=modifier.fillMaxSize(),
        beyondViewportPageCount=1) { page ->
        when(page) {
            2 -> {
                val pagerScope=rememberCoroutineScope()
                NativeGeneralAiChatPage(vm=vm,userId=state.user?.id,dark=dark,
                    onExit={pagerScope.launch{pagerState.animateScrollToPage(0)}})
            }
            3 -> NativeNotesPage(vm=vm,colors=colors,modifier=Modifier.fillMaxSize())
            else -> {
                val contentMode = if(page==1) WorkspaceMode.TIMELINE else WorkspaceMode.LIST
    val rootTasks = remember(state.tasks, period, searchQuery, contentMode, sectorFilterEnabled, selectedSectors, timelineSector, sort) {
        state.tasks.asSequence()
            .filter { it.status != TaskStatus.DONE }
            .filter {
                val date = parseDueDate(it.dueDate)
                if(contentMode==WorkspaceMode.TIMELINE) true else when(period) {
                    PeriodFilter.ALL -> true
                    PeriodFilter.TODAY -> date?.toLocalDate() == LocalDate.now()
                    PeriodFilter.TOMORROW -> date?.toLocalDate() == LocalDate.now().plusDays(1)
                    PeriodFilter.WEEK -> date != null && !date.toInstant().isBefore(Instant.now()) &&
                        !date.toInstant().isAfter(Instant.now().plus(Duration.ofDays(7)))
                    PeriodFilter.MONTH -> date != null && !date.toInstant().isBefore(Instant.now()) &&
                        !date.toInstant().isAfter(Instant.now().plus(Duration.ofDays(30)))
                }
            }
            .filter { task ->
                searchQuery.isEmpty() || task.title.lowercase(Locale.getDefault()).contains(searchQuery) ||
                    task.description.orEmpty().lowercase(Locale.getDefault()).contains(searchQuery)
            }
            .filter { task ->
                if (contentMode == WorkspaceMode.LIST) {
                    task.parentTaskId == null && task.taskType == TaskType.TASK &&
                        (!sectorFilterEnabled || (task.sphereId != null && selectedSectors.contains(task.sphereId)))
                } else {
                    val sectorId = task.sphereId ?: if(task.parentTaskId!=null)
                        state.tasks.firstOrNull { it.id==task.parentTaskId }?.sphereId else null
                    (timelineSector == "all" ||
                        (timelineSector == "without-sphere" && sectorId == null) ||
                        sectorId == timelineSector)
                }
            }
            .sortedWith(if (contentMode == WorkspaceMode.LIST && sort == SortTasks.IMPORTANCE)
                compareByDescending<Task> { it.importance }.thenBy { dueMillis(it.dueDate) }
            else compareBy<Task> { dueMillis(it.dueDate) })
            .toList()
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start=14.dp, end=14.dp, top=12.dp, bottom=28.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item { WorkspaceTopbar(state, colors, search, settings,
            onCredits={ creditsOpen=true }, onScore={ scoreOpen=true }) }
        if (contentMode == WorkspaceMode.LIST) item {
            HabitsStrip(habits, colors, dark, onHabitClick = { selectedHabitId = it.id }, onAdd = { createHabitOpen = true })
        }
        item {
            WorkspaceToolbar(colors, dark,
                filtered = period != PeriodFilter.ALL || if (contentMode == WorkspaceMode.LIST)
                    sort != SortTasks.URGENCY || sectorFilterEnabled else timelineSector != "all",
                onFilter = { filtersOpen=true },
                onPostpone = { vm.postponeOverdue() }, canPostpone = overdue && !state.taskBusy)
        }
        state.taskError?.let { error ->
            item { Text(error, color=MaterialTheme.colorScheme.error,
                style=MaterialTheme.typography.bodySmall) }
        }
        if (contentMode == WorkspaceMode.LIST) {
            if (rootTasks.isEmpty()) item { EmptyWorkspaceMessage("Задачи не найдены.", colors) }
            items(rootTasks, key={it.id}) { task ->
                ModernTaskCard(task, sectors[task.sphereId], colors, dark,
                    showImportance=sort==SortTasks.IMPORTANCE,
                    busy=state.taskBusy, onOpen={onOpenTask(task.id)},
                    onComplete={vm.changeStatus(task.id, TaskStatus.DONE)})
            }
        } else item {
            NativeTimelineWorkspace(rootTasks, state.tasks, state.habits,
                state.spheres, colors, dark, onOpenTask,
                onOpenHabit={selectedHabitId=it})
        }
    }

            }
        }
    }
    if (filtersOpen) {
        ModalBottomSheet(onDismissRequest={filtersOpen=false}, containerColor=colors.panel,
            contentColor=colors.text) {
            WorkspaceFilters(colors, if(pagerState.currentPage==1) WorkspaceMode.TIMELINE else WorkspaceMode.LIST, period, onPeriod={period=it}, sort, onSort={sort=it},
                state.spheres, selectedSectors, sectorFilterEnabled,
                onSectorEnabled={enabled -> sectorFilterEnabled=enabled
                    if (enabled && selectedSectors.isEmpty()) selectedSectors=state.spheres.map { it.id }.toSet()
                },
                onToggleSector={id -> selectedSectors= if (id in selectedSectors) selectedSectors-id else selectedSectors+id },
                timelineSector, onTimelineSector={timelineSector=it},
                onReset={period=PeriodFilter.ALL;sort=SortTasks.URGENCY;sectorFilterEnabled=false;timelineSector="all"})
        }
    }
    if (scoreOpen) AlertDialog(onDismissRequest={scoreOpen=false},
        title={Text("Рейтинг эффективности")}, text={
            Column(verticalArrangement=Arrangement.spacedBy(7.dp)){
                Text((state.user?.efficiencyScore?.toInt() ?: 0).toString()+"/100", style=MaterialTheme.typography.headlineMedium)
                Text("Задачи: +" + (state.user?.efficiencyTaskScore ?: 0.0))
                Text("Привычки: +" + (state.user?.efficiencyHabitScore ?: 0.0))
                Text("Работа с ИИ: +" + (state.user?.efficiencyAiScore ?: 0.0))
                Text("Режим концентрации: +" + (state.user?.efficiencyFocusScore ?: 0.0))
            }
        }, confirmButton={TextButton(onClick={scoreOpen=false}){Text("Закрыть")}})
    if (creditsOpen) AlertDialog(onDismissRequest={creditsOpen=false},
        title={Text("ИИ-кредиты")},
        text={Text("Баланс: " + (state.user?.aiCredits ?: 0).toString())},
        confirmButton={TextButton(onClick={creditsOpen=false}){Text("Закрыть")}})
    if (createHabitOpen) NativeHabitCreateSheet(vm=vm,dark=dark,
        onClose={createHabitOpen=false})
    selectedHabitId?.let { id ->
        state.habits.firstOrNull { it.id == id }?.let {habit->
            NativeHabitDetailSheet(vm=vm,habit=habit,dark=dark,
                onClose={selectedHabitId=null})
        }
    }
}

@Composable
private fun WorkspaceTopbar(state:HomeState, colors:WorkspaceColors,
    search:(String)->Unit, settings:()->Unit, onCredits:()->Unit, onScore:()->Unit) {
    Surface(shape=RoundedCornerShape(23.dp), color=colors.panel,
        border=BorderStroke(1.dp,colors.panelBorder), shadowElevation=3.dp) {
        Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.spacedBy(5.dp)) {
            Row(Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp))
                    .background(colors.field).border(1.dp,colors.panelBorder,RoundedCornerShape(12.dp))
                    .padding(horizontal=8.dp), verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.Search, contentDescription=null, tint=colors.secondaryText,
                    modifier=Modifier.size(17.dp))
                Spacer(Modifier.width(5.dp))
                BasicTextField(value=state.query, onValueChange=search,
                    modifier=Modifier.weight(1f), singleLine=true,
                    textStyle=MaterialTheme.typography.bodyMedium.copy(color=colors.text,fontSize=14.sp),
                    cursorBrush=androidx.compose.ui.graphics.SolidColor(colors.purple),
                    decorationBox={inner ->
                        Box(contentAlignment=Alignment.CenterStart) {
                            if (state.query.isEmpty()) Text("Поиск",fontSize=13.sp,color=colors.secondaryText)
                            inner()
                        }
                    })
            }
            Row(Modifier.height(36.dp).clip(RoundedCornerShape(12.dp))
                .background(colors.muted).clickable(onClick=onCredits)
                .border(1.dp,colors.panelBorder,RoundedCornerShape(12.dp))
                .padding(horizontal=7.dp), verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.Paid, null, modifier=Modifier.size(16.dp),tint=Color(0xFF22B8CF))
                Spacer(Modifier.width(3.dp))
                Text((state.user?.aiCredits ?: 0).toString(), fontSize=12.sp,
                    fontWeight=FontWeight.SemiBold,color=colors.text,maxLines=1)
            }
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp))
                .background(colors.muted).border(1.dp,colors.panelBorder,RoundedCornerShape(12.dp))
                .clickable(onClick=onScore),contentAlignment=Alignment.Center) {
                Box(Modifier.size(27.dp), contentAlignment=Alignment.Center) {
                    CircularProgressIndicator(progress={
                        ((state.user?.efficiencyScore ?: 0.0)/100.0).toFloat().coerceIn(0f,1f)
                    },modifier=Modifier.fillMaxSize(),strokeWidth=2.8.dp,color=Color(0xFF8B5CF6),
                    trackColor=colors.panelBorder)
                    Icon(Icons.Default.Star, null,tint=Color(0xFFF472B6),modifier=Modifier.size(17.dp))
                }
            }
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp))
                .background(colors.muted).border(1.dp,colors.panelBorder,RoundedCornerShape(12.dp))
                .clickable(onClick=settings), contentAlignment=Alignment.Center) {
                Icon(Icons.Default.Settings,"Настройки",modifier=Modifier.size(17.dp),tint=Color(0xFFF59E0B))
            }
        }
    }
}

@Composable
private fun HabitsStrip(habits:List<Habit>, colors:WorkspaceColors, dark:Boolean,
    onHabitClick:(Habit)->Unit, onAdd:()->Unit) {
    Surface(shape=RoundedCornerShape(23.dp), color=colors.panel,
        border=BorderStroke(1.dp,colors.panelBorder), shadowElevation=3.dp) {
        Column(Modifier.fillMaxWidth().padding(15.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.SpaceBetween,
                modifier=Modifier.fillMaxWidth()) {
                Text("Привычки",style=MaterialTheme.typography.titleMedium,
                    fontWeight=FontWeight.Bold,color=colors.text)
                Surface(shape=CircleShape,color=colors.muted) {
                    Text("Выполнено "+habits.count(::isHabitDoneToday)+" из "+habits.size,
                        modifier=Modifier.padding(horizontal=10.dp,vertical=6.dp),
                        style=MaterialTheme.typography.labelSmall,color=colors.secondaryText)
                }
            }
            LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp), contentPadding=PaddingValues(end=2.dp)) {
                items(habits,key={it.id}) { habit ->
                    val count = completedHabitToday(habit)
                    val done = count >= habit.targetCount
                    val ring = if (done) Color(0xFF94A3B8) else parseWorkspaceColor(habit.color)
                    val core = if (dark) Color(0xFF0F172A) else if(done) Color(0xFFF1F5F9) else Color.White
                    Box(Modifier.size(58.dp).clip(CircleShape).clickable{onHabitClick(habit)},contentAlignment=Alignment.Center) {
                        Canvas(Modifier.fillMaxSize()) {
                            drawCircle(color=if (dark) Color(0xFF1E293B) else Color(0xFFE2E8F0))
                            drawArc(color=ring, startAngle=-90f,
                                sweepAngle=(count.toFloat()/habit.targetCount.coerceAtLeast(1)).coerceIn(0f,1f)*360f,
                                useCenter=true)
                        }
                        Column(Modifier.size(48.dp).clip(CircleShape).background(core),
                            horizontalAlignment=Alignment.CenterHorizontally,
                            verticalArrangement=Arrangement.Center) {
                            Text(habit.icon, fontSize=20.sp,lineHeight=21.sp,
                                maxLines=1,textAlign=TextAlign.Center)
                            Spacer(Modifier.height(1.dp))
                            Text(count.coerceAtMost(habit.targetCount).toString()+"/"+habit.targetCount,
                                fontSize=10.sp,lineHeight=12.sp,fontWeight=FontWeight.Bold,
                                color=if(done) colors.secondaryText else colors.text)
                        }
                    }
                }
                item {
                    Box(Modifier.size(58.dp).clip(CircleShape)
                        .border(1.dp,Color(0xFF34D399),CircleShape)
                        .background(tinted(Color(0xFF34D399),colors.panel,.1f))
                        .clickable(onClick=onAdd),contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Add,"Добавить привычку",tint=Color(0xFF34D399),modifier=Modifier.size(19.dp))
                    }
                }
            }
        }
    }
}

@Composable private fun WorkspaceToolbar(colors:WorkspaceColors,dark:Boolean,
    filtered:Boolean,onFilter:()->Unit,onPostpone:()->Unit,canPostpone:Boolean) {
    Surface(shape=RoundedCornerShape(19.dp),
        color=tinted(colors.purple,colors.panel,if(dark).12f else .045f),
        border=BorderStroke(1.dp,tinted(colors.purple,colors.panelBorder,if(dark).44f else .22f)),
        shadowElevation=2.dp) {
        Row(Modifier.fillMaxWidth().padding(9.dp),
            horizontalArrangement=Arrangement.spacedBy(8.dp),
            verticalAlignment=Alignment.CenterVertically) {
            ToolbarButton("Отложить",Icons.Default.Schedule,
                if(dark)Color(0xFF7DD3FC) else Color(0xFF0369A1),
                tinted(Color(0xFF38BDF8),colors.panel,.10f),
                tinted(Color(0xFF38BDF8),colors.panel,.34f),
                Modifier.weight(1.13f),onPostpone,enabled=canPostpone)
            ToolbarButton("Оптимизировать",Icons.Default.AutoAwesome,
                if(dark)Color(0xFFF9A8D4) else Color(0xFFBE185D),
                tinted(Color(0xFFF472B6),colors.panel,.13f),
                tinted(Color(0xFFF472B6),colors.panel,.35f),
                Modifier.weight(1.55f),{},enabled=false,dimDisabled=false)
            Row(Modifier.weight(1f).height(43.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if(filtered)colors.selected else colors.muted)
                .border(1.dp,if(filtered)colors.purple else colors.panelBorder,
                    RoundedCornerShape(14.dp))
                .clickable(onClick=onFilter),
                horizontalArrangement=Arrangement.Center,
                verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.FilterList,"Фильтры",
                    tint=if(filtered)colors.purple else colors.text,
                    modifier=Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Фильтры",fontSize=10.5.sp,color=colors.text,
                    fontWeight=FontWeight.SemiBold,maxLines=1)
            }
        }
    }
}
@Composable private fun ModeButton(label:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    selected:Boolean,colors:WorkspaceColors,modifier:Modifier=Modifier,click:()->Unit){
    Row(modifier.fillMaxHeight().clip(RoundedCornerShape(12.dp))
        .background(if(selected)colors.selected else colors.muted).clickable(onClick=click),
        horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically) {
        Icon(icon,null,modifier=Modifier.size(16.dp),
            tint=if(selected)colors.selectedText else colors.secondaryText)
        Spacer(Modifier.width(5.dp))
        Text(label,fontSize=12.sp,fontWeight=FontWeight.SemiBold,
            color=if(selected)colors.selectedText else colors.text,maxLines=1)
    }
}
@Composable private fun ToolbarButton(label:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    ink:Color,fill:Color,border:Color,modifier:Modifier=Modifier,
    click:()->Unit,enabled:Boolean=true,dimDisabled:Boolean=true) {
    val alpha=if(!enabled && dimDisabled).48f else 1f
    Row(modifier.height(43.dp).alpha(alpha).clip(RoundedCornerShape(14.dp))
        .background(fill).border(1.dp,border,RoundedCornerShape(14.dp))
        .then(if(enabled)Modifier.clickable(onClick=click) else Modifier),
        horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically) {
        Icon(icon,null,tint=ink,modifier=Modifier.size(15.dp))
        Spacer(Modifier.width(3.dp))
        Text(label,color=ink,fontSize=10.5.sp,fontWeight=FontWeight.SemiBold,maxLines=1,
            softWrap=false)
    }
}

@Composable
private fun ModernTaskCard(task:Task,sphere:Sphere?,colors:WorkspaceColors,dark:Boolean,
    showImportance:Boolean,busy:Boolean,onOpen:()->Unit,onComplete:()->Unit){
    val sectorColor=parseWorkspaceColor(sphere?.color ?: "#64748b")
    val isOverdue=task.dueDate!=null && dueMillis(task.dueDate)<System.currentTimeMillis()
    Surface(shape=RoundedCornerShape(21.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder),shadowElevation=2.dp) {
        Box(Modifier.fillMaxWidth().heightIn(min=110.dp)) {
            Column(Modifier.fillMaxWidth().clickable(onClick=onOpen).padding(15.dp).padding(end=31.dp),
                verticalArrangement=Arrangement.spacedBy(6.dp)) {
                Row(Modifier.widthIn(max=225.dp)
                    .clip(CircleShape).background(tinted(sectorColor,colors.card,if(dark).20f else .14f))
                    .border(1.dp,tinted(sectorColor,colors.card,if(dark).36f else .18f),CircleShape)
                    .padding(horizontal=10.dp,vertical=5.dp),verticalAlignment=Alignment.CenterVertically) {
                    Box(Modifier.size(6.dp).background(sectorColor,CircleShape))
                    Spacer(Modifier.width(5.dp))
                    Text(sphere?.name ?: "Без сектора",maxLines=1,overflow=TextOverflow.Ellipsis,
                        color=tinted(sectorColor,colors.text,if(dark).65f else .77f),
                        fontWeight=FontWeight.SemiBold,fontSize=11.sp,lineHeight=14.sp)
                }
                Text(task.title,color=colors.text,fontWeight=FontWeight.SemiBold,
                    fontSize=15.sp,lineHeight=20.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                if(showImportance){
                    Text(remainingDue(task.dueDate),fontSize=12.sp,
                        color=if(isOverdue)Color(0xFFE11D48) else if(dark)Color(0xFF7DD3FC) else Color(0xFF0369A1))
                    Row(Modifier.clip(CircleShape).background(tinted(Color(0xFF8B5CF6),colors.card,.19f))
                        .border(1.dp,tinted(Color(0xFF8B5CF6),colors.card,.29f),CircleShape)
                        .padding(horizontal=7.dp,vertical=3.dp),verticalAlignment=Alignment.CenterVertically) {
                        Icon(Icons.Default.Speed,null,modifier=Modifier.size(13.dp),tint=colors.purple)
                        Spacer(Modifier.width(4.dp))
                        Text(String.format(Locale.US,"%.1f",task.importance.coerceIn(0,5)/5f),
                            fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=colors.text)
                    }
                } else {
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        Icon(Icons.Default.DateRange,null,modifier=Modifier.size(13.dp),tint=colors.secondaryText)
                        Spacer(Modifier.width(5.dp))
                        Text("Дедлайн: "+friendlyDue(task.dueDate),fontSize=12.sp,
                            color=colors.secondaryText)
                    }
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        val tint=if(isOverdue) {if(dark)Color(0xFFFB7185) else Color(0xFFE11D48)}
                            else if(dark)Color(0xFF7DD3FC) else Color(0xFF0369A1)
                        Icon(Icons.Default.Schedule,null,modifier=Modifier.size(13.dp),tint=tint)
                        Spacer(Modifier.width(5.dp))
                        Text(remainingDue(task.dueDate),fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=tint)
                    }
                }
            }
            Box(Modifier.align(Alignment.TopEnd).padding(top=10.dp,end=9.dp).size(33.dp)
                .clip(CircleShape).clickable(enabled=!busy,onClick=onComplete),
                contentAlignment=Alignment.Center) {
                Box(Modifier.size(18.dp).border(2.dp,colors.secondaryText,CircleShape))
            }
        }
    }
}

@Composable private fun EmptyWorkspaceMessage(message:String,colors:WorkspaceColors) {
    Surface(shape=RoundedCornerShape(18.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder)) {
        Text(message,Modifier.fillMaxWidth().padding(22.dp),color=colors.secondaryText)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun WorkspaceFilters(colors:WorkspaceColors,mode:WorkspaceMode,period:PeriodFilter,
    onPeriod:(PeriodFilter)->Unit,sort:SortTasks,onSort:(SortTasks)->Unit,
    spheres:List<Sphere>,selectedSectors:Set<String>,sectorFilterEnabled:Boolean,
    onSectorEnabled:(Boolean)->Unit,onToggleSector:(String)->Unit,
    timelineSector:String,onTimelineSector:(String)->Unit,onReset:()->Unit) {
    Column(Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState())
        .padding(horizontal=20.dp,vertical=12.dp),verticalArrangement=Arrangement.spacedBy(11.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
            verticalAlignment=Alignment.CenterVertically) {
            Text("Фильтры задач",style=MaterialTheme.typography.titleMedium,color=colors.text,fontWeight=FontWeight.Bold)
            TextButton(onClick=onReset){Text("Сбросить",color=colors.purple)}
        }
        Text("Период",fontSize=12.sp,color=colors.secondaryText)
        FilterChoice(period.label,PeriodFilter.entries.map { it.label },
            selected=PeriodFilter.entries.indexOf(period),
            colors=colors,onSelect={onPeriod(PeriodFilter.entries[it])})
        if(mode==WorkspaceMode.LIST){
            Text("Сортировка",fontSize=12.sp,color=colors.secondaryText)
            FilterChoice(sort.label,SortTasks.entries.map{it.label},
                SortTasks.entries.indexOf(sort),colors,onSelect={onSort(SortTasks.entries[it])})
            Text("Сектора",fontSize=12.sp,color=colors.secondaryText)
            Row(Modifier.fillMaxWidth().clickable{onSectorEnabled(!sectorFilterEnabled)},
                verticalAlignment=Alignment.CenterVertically) {
                Checkbox(!sectorFilterEnabled, onCheckedChange={onSectorEnabled(!it)})
                Text("Все сектора",color=colors.text)
            }
            spheres.forEach { sector ->
                Row(Modifier.fillMaxWidth().clickable {
                    if(!sectorFilterEnabled)onSectorEnabled(true)
                    onToggleSector(sector.id)
                }, verticalAlignment=Alignment.CenterVertically) {
                    Checkbox(!sectorFilterEnabled || sector.id in selectedSectors,
                        onCheckedChange={if(!sectorFilterEnabled)onSectorEnabled(true);onToggleSector(sector.id)})
                    Box(Modifier.size(10.dp).background(parseWorkspaceColor(sector.color),CircleShape))
                    Spacer(Modifier.width(7.dp))
                    Text(sector.name,color=colors.text)
                }
            }
        } else {
            Text("Сектор",fontSize=12.sp,color=colors.secondaryText)
            val options=listOf("all","without-sphere")+spheres.map{it.id}
            val labels=listOf("Все сектора","Без сектора")+spheres.map{it.name}
            FilterChoice(labels[options.indexOf(timelineSector).coerceAtLeast(0)],
                labels,options.indexOf(timelineSector).coerceAtLeast(0),colors,
                onSelect={onTimelineSector(options[it])})
        }
    }
}
@Composable private fun FilterChoice(label:String,options:List<String>,selected:Int,
    colors:WorkspaceColors,onSelect:(Int)->Unit){
    var expanded by remember { mutableStateOf(false) }
    Box {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(colors.field)
            .border(1.dp,colors.panelBorder,RoundedCornerShape(13.dp))
            .clickable{expanded=true}.padding(12.dp),horizontalArrangement=Arrangement.SpaceBetween,
            verticalAlignment=Alignment.CenterVertically) {
            Text(label,color=colors.text,fontSize=14.sp)
            Icon(Icons.Default.ArrowDropDown,null,tint=colors.secondaryText)
        }
        DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}) {
            options.forEachIndexed { index,option ->
                DropdownMenuItem(text={Text(option)},onClick={onSelect(index);expanded=false},
                    trailingIcon=if(index==selected) ({ Icon(Icons.Default.Check,null) }) else null)
            }
        }
    }
}

private fun parseWorkspaceColor(raw:String):Color = runCatching{Color(android.graphics.Color.parseColor(raw))}
    .getOrDefault(Color(0xFF64748B))
private fun parseDueDate(raw:String?):ZonedDateTime?{
    if(raw.isNullOrBlank())return null
    return runCatching{OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault())}
        .recoverCatching{Instant.parse(raw).atZone(ZoneId.systemDefault())}.getOrNull()
}
private fun dueMillis(raw:String?):Long=parseDueDate(raw)?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE
private fun friendlyDue(raw:String?):String=parseDueDate(raw)
    ?.format(DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm",Locale("ru"))) ?: "Без дедлайна"
private fun remainingDue(raw:String?):String{
    val date=parseDueDate(raw)?:return "Срок не задан"
    val delta=date.toInstant().toEpochMilli()-System.currentTimeMillis()
    val absMinutes=kotlin.math.round(kotlin.math.abs(delta)/60000.0).toLong()
    if(absMinutes<1) return if(delta>=0) "Дедлайн прямо сейчас" else "Просрочено только что"
    val days=absMinutes/1440;val hours=(absMinutes%1440)/60;val minutes=absMinutes%60
    val parts=mutableListOf<String>()
    if(days>0)parts.add(days.toString()+"д")
    if(hours>0)parts.add(hours.toString()+"ч")
    if(minutes>0 && days==0L)parts.add(minutes.toString()+"м")
    return (if(delta>=0)"Через " else "Просрочено на ")+parts.joinToString(" ")
}
private fun completedHabitToday(habit:Habit):Int=habit.stats.filter{it.dateKey==LocalDate.now().toString()}.sumOf{it.amount}
private fun isHabitDoneToday(habit:Habit)=completedHabitToday(habit)>=habit.targetCount
