package ru.planirovych.app.feature.home

import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.geometry.Offset
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
private fun habitScheduledToday(habit: Habit, today: LocalDate): Boolean {
    if (habit.isAutoCompleted || habit.isArchived) return false
    val created = habit.createdAt?.let { raw ->
        runCatching { OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate() }
            .recoverCatching { Instant.parse(raw).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull()
    }
    if (created != null && today.isBefore(created)) return false
    if (habit.durationMode == HabitDurationMode.UNTIL_DATE &&
        !habit.endDate.isNullOrBlank() && today.toString() > habit.endDate.take(10)) return false
    return when (habit.recurrenceType) {
        HabitRecurrenceType.DAILY -> true
        HabitRecurrenceType.WEEKDAYS -> habit.weekdays.contains(today.dayOfWeek.value % 7)
        HabitRecurrenceType.INTERVAL -> {
            val start = created ?: today
            val days = java.time.temporal.ChronoUnit.DAYS.between(start, today)
            days >= 0 && days % (habit.intervalDays ?: 1).coerceAtLeast(1) == 0L
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModernWorkspace(
    vm: HomeViewModel,
    state: HomeState,
    dark: Boolean,
    search: (String) -> Unit,
    settings: () -> Unit,
    onAccount: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenTaskAi: (String) -> Unit,
    pagerState: PagerState,
    quickAiMode:String?=null,
    quickAiRequestId:Int=0,
    onQuickAiHandled:(Int)->Unit={},
    onQuickVoice:()->Unit={},voiceAwaiting:Boolean=false,
    modifier: Modifier = Modifier,
) {
    val colors = remember(dark) { workspaceColors(dark) }
    val completionScope=rememberCoroutineScope()
    val completingTaskIds=remember { mutableStateListOf<String>() }
    var period by rememberSaveable { mutableStateOf(PeriodFilter.ALL) }
    var sort by rememberSaveable { mutableStateOf(SortTasks.URGENCY) }
    // Both values MUST survive Activity recreation together. Previously the
    // toggle was saved but the sector IDs were not, so returning from Planik
    // could restore "sector filter ON" with no selected sectors and hide ALL tasks.
    var selectedSectors by rememberSaveable { mutableStateOf(listOf<String>()) }
    var sectorFilterEnabled by rememberSaveable { mutableStateOf(false) }
    var timelineSector by rememberSaveable { mutableStateOf("all") }
    var filtersOpen by remember { mutableStateOf(false) }
    var overdueOpen by remember { mutableStateOf(false) }
    var sectorSettingsOpen by remember { mutableStateOf(false) }
    var notesVisible by remember { mutableStateOf(false) }
    // HorizontalPager precomposes adjacent pages. A single Boolean made all
    // precomposed search fields request focus and dragged the pager to AI Chat.
    // Only one page can own an open search (and its keyboard focus) at a time.
    var searchOpenedOnPage by rememberSaveable { mutableIntStateOf(-1) }
    var scoreOpen by remember { mutableStateOf(false) }
    var creditsOpen by remember { mutableStateOf(false) }
    var searchExpanded by remember { mutableStateOf(false) }
    var searchNoteTarget by remember { mutableStateOf<String?>(null) }
    val searchPagerScope=rememberCoroutineScope()
    LaunchedEffect(state.user?.id,state.query.isNotBlank()) {
        // Search notes just once upon entering a nonempty query. Reuse existing
        // cached state while typing; avoid an API request per keystroke.
        if(state.query.isNotBlank()) vm.loadNotes()
        else searchExpanded=false
    }
    var selectedHabitId by remember { mutableStateOf<String?>(null) }
    var createHabitOpen by remember { mutableStateOf(false) }
    val sectors = remember(state.spheres) { state.spheres.associateBy { it.id } }
    val searchQuery = state.query.trim().lowercase(Locale.getDefault())
    val now = System.currentTimeMillis()
    val overdueTasks = state.tasks.filter {
        it.status != TaskStatus.DONE && it.taskType != TaskType.EVENT &&
            it.taskType != TaskType.REMINDER && it.dueDate != null && dueMillis(it.dueDate) < now
    }.sortedBy { dueMillis(it.dueDate) }
    val overdue = overdueTasks.isNotEmpty()
    val todayForHabits = LocalDate.now()
    val habits = remember(state.habits, todayForHabits) {
        state.habits.filter { !it.isAutoCompleted && !it.isArchived }.sortedWith(
            compareBy<Habit> { h -> !habitScheduledToday(h, todayForHabits) }
                .thenBy { h -> habitScheduledToday(h, todayForHabits) && isHabitDoneToday(h) }
                .thenBy { it.createdAt ?: "" }
        )
    }
    LaunchedEffect(pagerState.currentPage) {
        // Switching tabs explicitly closes the old field. Never focus a field
        // from an adjacent page that HorizontalPager already precomposed.
        if(searchOpenedOnPage!=-1 && searchOpenedOnPage!=pagerState.currentPage) {
            searchOpenedOnPage=-1
            searchExpanded=false
            search("")
        }
    }
    HorizontalPager(state=pagerState,userScrollEnabled=false,
        modifier=modifier.fillMaxSize(),
        beyondViewportPageCount=1) { page ->
        val searchActiveHere = searchOpenedOnPage==page && pagerState.currentPage==page
        when(page) {
            3 -> NativeEconomicPage(userId=state.user?.id,dark=dark,active=pagerState.currentPage==3,
                onQuickVoice=onQuickVoice,voiceAwaiting=voiceAwaiting)
            2 -> {
                val pagerScope=rememberCoroutineScope()
                Column(Modifier.fillMaxSize().background(
                    if(dark) Color(0xFF101B30) else Color(0xFFF2F7FF))) {
                    Column(Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=9.dp)) {
                        WorkspaceTopbar(state,colors,dark,onAccount=onAccount,
                            onSearchToggle={
                                if(searchOpenedOnPage==page) {
                                    searchOpenedOnPage=-1
                                    search("")
                                } else {
                                    searchOpenedOnPage=page
                                }
                                searchExpanded=false
                            },settings=settings,onCredits={creditsOpen=true})
                        if(searchActiveHere) {
                            Spacer(Modifier.height(8.dp))
                            WorkspaceSearchField(state.query,colors,search,
                                onClose={search("");searchOpenedOnPage=-1;searchExpanded=false},
                                onEdited={searchExpanded=it.isNotBlank()})
                        }
                        if(searchActiveHere && searchExpanded && searchQuery.isNotEmpty()) {
                            Spacer(Modifier.height(6.dp))
                            NativeWorkspaceGlobalSearch(query=state.query,
                                tasks=state.tasks,notes=state.notes,
                                notesLoading=state.notesLoading,dark=dark,
                                onOpenTask={id->searchExpanded=false;onOpenTask(id)},
                                onOpenNote={id->
                                    searchNoteTarget=id;notesVisible=true;searchExpanded=false
                                },onDismiss={searchExpanded=false})
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(10.dp)
                        .background(Brush.verticalGradient(listOf(
                            if(dark)Color(0xFF101B30) else Color(0xFFF2F7FF),
                            if(dark)Color(0xFF17253B) else Color(0xFFEAF1FB)))))
                    Box(Modifier.weight(1f)) {
                        NativeGeneralAiChatPage(vm=vm,userId=state.user?.id,dark=dark,
                            tasks=state.tasks,quickAiMode=quickAiMode,
                            quickAiRequestId=quickAiRequestId,
                            onQuickAiHandled=onQuickAiHandled,
                            chatVisible=pagerState.currentPage==2,
                            onExit={pagerScope.launch{pagerState.animateScrollToPage(0)}},
                            onOpenTask=onOpenTask,onOpenTaskAi=onOpenTaskAi)
                    }
                }
            }
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
                        (!sectorFilterEnabled || selectedSectors.isEmpty() ||
                            (task.sphereId != null && selectedSectors.contains(task.sphereId)))
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
    val workspaceScroll=rememberLazyListState()
    val timelineActive=pagerState.currentPage==1
    // On every entry the timeline begins at the top, not centered on "now".
    LaunchedEffect(timelineActive) {
        if(timelineActive) workspaceScroll.scrollToItem(0)
    }
    // Mini App's subtly blue-tinted background; task cards remain white.
    Box(Modifier.fillMaxSize()
        .background(Brush.verticalGradient(
        if(dark) listOf(Color(0xFF0E192B),Color(0xFF111C30))
        else listOf(Color(0xFFF3F8FF),Color(0xFFEEF6FF),Color(0xFFF5F9FF))
    ))){
    LazyColumn(
        state=workspaceScroll,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start=14.dp,end=14.dp,top=12.dp,bottom=28.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item(key="workspace-unified-header") {
            Column(Modifier.fillMaxWidth()) {
                WorkspaceTopbar(state,colors,dark,
                    onAccount=onAccount,onSearchToggle={
                        if(searchOpenedOnPage==page) {
                            searchOpenedOnPage=-1
                            search("")
                        } else {
                            searchOpenedOnPage=page
                        }
                        searchExpanded=false
                    },settings=settings,onCredits={creditsOpen=true})
                if(searchActiveHere) {
                    Spacer(Modifier.height(8.dp))
                    WorkspaceSearchField(state.query,colors,search,
                        onClose={search("");searchOpenedOnPage=-1;searchExpanded=false},
                        onEdited={searchExpanded=it.isNotBlank()})
                }
                if(searchActiveHere && searchExpanded && searchQuery.isNotEmpty()) {
                    Spacer(Modifier.height(7.dp))
                    NativeWorkspaceGlobalSearch(
                        query=state.query,tasks=state.tasks,notes=state.notes,
                        notesLoading=state.notesLoading,dark=dark,
                        onOpenTask={id->searchExpanded=false;onOpenTask(id)},
                        onOpenNote={id->
                            searchNoteTarget=id;notesVisible=true;searchExpanded=false
                        },onDismiss={searchExpanded=false})
                }
                // Match the visual rhythm between Habits and Statistics.
                if(contentMode==WorkspaceMode.LIST) Spacer(Modifier.height(8.dp))
            }
        }
        if (contentMode == WorkspaceMode.LIST) {
            item {
                HabitsStrip(habits, colors, dark, onHabitClick = { selectedHabitId = it.id },
                    onAdd = { createHabitOpen = true })
            }
            item {
                Text("Статистика выполнения",fontSize=24.sp,fontWeight=FontWeight.Bold,
                    color=colors.text,modifier=Modifier.padding(top=8.dp))
            }
            item {
                val actual=state.tasks.filter { it.taskType==TaskType.TASK && it.parentTaskId==null }
                val completed=actual.count { it.status==TaskStatus.DONE }
                val today=LocalDate.now()
                val planned=actual.filter { parseDueDate(it.dueDate)?.toLocalDate()==today }
                val plannedDone=planned.count { it.status==TaskStatus.DONE }
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                    WorkspaceProgressCard("Все задачи",Icons.Default.CheckCircle,
                        completed,actual.size,colors,Modifier.weight(1f))
                    WorkspaceProgressCard("За сегодня",Icons.Default.Today,
                        plannedDone,planned.size,colors,Modifier.weight(1f))
                }
            }
            item {
                WorkspaceSectorsOverview(state.spheres,state.tasks,colors,
                    selectedSectors.toSet().takeIf{sectorFilterEnabled} ?: emptySet(),
                    onSelect={id->
                        if(id==null){sectorFilterEnabled=false;selectedSectors=emptyList()}
                        else if(sectorFilterEnabled && selectedSectors==listOf(id)){
                            sectorFilterEnabled=false;selectedSectors=emptyList()
                        }else{sectorFilterEnabled=true;selectedSectors=listOf(id)}
                    },onSettings={sectorSettingsOpen=true})
            }
            item {
                Text("Ваши задачи",fontSize=24.sp,fontWeight=FontWeight.Bold,
                    color=colors.text,modifier=Modifier.padding(top=7.dp))
            }
        }
        // Timeline already has its navigation immediately beneath the top search bar.
        // The toolbar belongs only to List; do not insert a spare Filters row here.
        if (contentMode == WorkspaceMode.LIST) item {
            WorkspaceToolbar(colors, dark, mode=contentMode,
                filtered = period != PeriodFilter.ALL ||
                    sort != SortTasks.URGENCY || sectorFilterEnabled,
                onFilter = { filtersOpen=true },
                onPostpone = { vm.postponeOverdue() }, canPostpone = overdue && !state.taskBusy,
                onOpenOverdue = { overdueOpen=true },
                overdueCount=overdueTasks.size)
        }
        state.taskError?.let { error ->
            item { Text(error, color=MaterialTheme.colorScheme.error,
                style=MaterialTheme.typography.bodySmall) }
        }
        if (contentMode == WorkspaceMode.LIST) {
            if (rootTasks.isEmpty()) item {
                if (state.tasks.any { it.status != TaskStatus.DONE && it.parentTaskId == null && it.taskType == TaskType.TASK }) {
                    Column(horizontalAlignment=Alignment.CenterHorizontally,
                        modifier=Modifier.fillMaxWidth().padding(vertical=18.dp)) {
                        EmptyWorkspaceMessage("По текущим фильтрам задачи не найдены.", colors)
                        TextButton(onClick={
                            period=PeriodFilter.ALL
                            sort=SortTasks.URGENCY
                            selectedSectors=emptyList()
                            sectorFilterEnabled=false
                            search("")
                        }) { Text("Показать все задачи") }
                    }
                } else EmptyWorkspaceMessage("Задачи не найдены.", colors)
            }
            items(rootTasks, key={it.id}) { task ->
                val completing=task.id in completingTaskIds
                Box(Modifier.fillMaxWidth().animateItem()){
                    AnimatedVisibility(visible=!completing,
                        exit=fadeOut(animationSpec=tween(370))+
                            shrinkVertically(animationSpec=tween(450))+
                            slideOutHorizontally(targetOffsetX={it/4},
                                animationSpec=tween(450))){
                        ModernTaskCard(task, sectors[task.sphereId], colors, dark,
                            showImportance=sort==SortTasks.IMPORTANCE,
                            busy=state.taskBusy || completing,
                            onOpen={onOpenTask(task.id)},
                            onComplete={
                                if(!state.taskBusy && completingTaskIds.isEmpty()){
                                    completingTaskIds.add(task.id)
                                    completionScope.launch {
                                        // Let the particle burst and card departure finish
                                        // before the server removes the item from the list.
                                        delay(460)
                                        vm.changeStatus(task.id,TaskStatus.DONE){
                                            completingTaskIds.remove(task.id)
                                        }
                                        // If the server rejects the update, show the card again.
                                        delay(1400)
                                        completingTaskIds.remove(task.id)
                                    }
                                }
                            })
                    }
                    if(completing) {
                        TaskCompletionConfetti()
                    }
                }
            }
        } else item {
            NativeTimelineWorkspace(rootTasks, state.tasks, state.habits,
                state.spheres, colors, dark, onOpenTask,
                onOpenHabit={selectedHabitId=it},
                isActive=timelineActive,
                overdueCount=overdueTasks.size,
                onOpenOverdue={overdueOpen=true})
        }
    }
    }
            }
        }
    }
    if (notesVisible) {
        Dialog(onDismissRequest={notesVisible=false},
            properties=DialogProperties(usePlatformDefaultWidth=false)) {
            NativeNotesPage(vm=vm,colors=colors,dark=dark,
                modifier=Modifier.fillMaxSize(),
                onClose={notesVisible=false},
                openNoteId=searchNoteTarget,
                onNoteOpened={searchNoteTarget=null})
        }
    }
    if (sectorSettingsOpen) {
        ModalBottomSheet(onDismissRequest={sectorSettingsOpen=false},
            containerColor=colors.panel,contentColor=colors.text) {
            WorkspaceSectorSettings(vm,state,colors,onClose={sectorSettingsOpen=false})
        }
    }
    if (filtersOpen) {
        ModalBottomSheet(onDismissRequest={filtersOpen=false}, containerColor=colors.panel,
            contentColor=colors.text) {
            WorkspaceFilters(colors, if(pagerState.currentPage==1) WorkspaceMode.TIMELINE else WorkspaceMode.LIST, period, onPeriod={period=it}, sort, onSort={sort=it},
                state.spheres, selectedSectors.toSet(), sectorFilterEnabled,
                onSectorEnabled={enabled -> sectorFilterEnabled=enabled
                    if (enabled && selectedSectors.isEmpty()) selectedSectors=state.spheres.map { it.id }
                },
                onToggleSector={id -> selectedSectors= if (id in selectedSectors) selectedSectors-id else selectedSectors+id },
                timelineSector, onTimelineSector={timelineSector=it},
                onReset={period=PeriodFilter.ALL;sort=SortTasks.URGENCY;sectorFilterEnabled=false;timelineSector="all"})
        }
    }
    if(overdueOpen) {
        ModalBottomSheet(onDismissRequest={overdueOpen=false},containerColor=colors.panel,
            contentColor=colors.text) {
            Column(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,bottom=24.dp)) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Просроченные задачи",fontSize=18.sp,fontWeight=FontWeight.SemiBold,color=colors.text)
                        Text("Всего: ${overdueTasks.size}",fontSize=12.sp,color=colors.secondaryText)
                    }
                    TextButton(onClick={vm.postponeOverdue()},
                        enabled=overdueTasks.isNotEmpty() && !state.taskBusy) {
                        if(state.taskBusy) CircularProgressIndicator(Modifier.size(15.dp),strokeWidth=2.dp)
                        else Icon(Icons.Default.Schedule,null,Modifier.size(17.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Отложить",fontWeight=FontWeight.SemiBold)
                    }
                    IconButton(onClick={overdueOpen=false}) {
                        Icon(Icons.Default.Close,"Закрыть список",tint=colors.secondaryText)
                    }
                }
                Spacer(Modifier.height(12.dp))
                if(overdueTasks.isEmpty()) {
                    Text("Просроченных задач нет",Modifier.fillMaxWidth().padding(vertical=35.dp),
                        textAlign=TextAlign.Center,color=colors.secondaryText)
                } else {
                    LazyColumn(Modifier.fillMaxWidth().heightIn(max=530.dp),
                        verticalArrangement=Arrangement.spacedBy(8.dp)) {
                        items(overdueTasks,key={it.id}) { task ->
                            Surface(modifier=Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                                    .clickable { overdueOpen=false; onOpenTask(task.id) },
                                shape=RoundedCornerShape(16.dp),color=colors.card,
                                border=BorderStroke(1.dp,colors.panelBorder)) {
                                Row(Modifier.fillMaxWidth().padding(12.dp),
                                    verticalAlignment=Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(task.title,fontSize=14.sp,fontWeight=FontWeight.SemiBold,
                                            color=colors.text,maxLines=2,overflow=TextOverflow.Ellipsis)
                                        if(task.parentTaskId != null) {
                                            val parentTitle=state.tasks.firstOrNull { it.id==task.parentTaskId }?.title
                                            Text(parentTitle ?: "Подзадача",fontSize=11.sp,
                                                color=colors.secondaryText,maxLines=1,
                                                overflow=TextOverflow.Ellipsis)
                                        }
                                        Text(friendlyDue(task.dueDate),fontSize=12.sp,
                                            color=if(dark)Color(0xFFFB7185) else Color(0xFFE11D48))
                                    }
                                    Icon(Icons.Default.ChevronRight,null,
                                        Modifier.size(18.dp),tint=colors.secondaryText)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if(scoreOpen)NativeEfficiencyRatingDialog(state.user,dark){scoreOpen=false}
    if(creditsOpen)NativeAiCreditsDialog(vm,state.user,dark){creditsOpen=false}
    if (createHabitOpen) NativeHabitCreateSheet(vm=vm,dark=dark,
        onClose={createHabitOpen=false})
    state.postponeNotice?.let { notice ->
        LaunchedEffect(notice.serial) {
            delay(3200)
            vm.dismissPostponeNotice(notice.serial)
        }
        Popup(alignment=Alignment.TopCenter,offset=IntOffset(0,44)) {
            Surface(modifier=Modifier.padding(horizontal=16.dp).widthIn(max=450.dp),
                shape=RoundedCornerShape(16.dp),
                color=if(dark)Color(0xFF18253A) else Color.White,
                border=BorderStroke(1.dp,
                    if(dark)Color(0xFF356A79) else Color(0xFF7DD3FC)),
                shadowElevation=9.dp) {
                Row(Modifier.padding(horizontal=16.dp,vertical=12.dp),
                    horizontalArrangement=Arrangement.spacedBy(8.dp),
                    verticalAlignment=Alignment.CenterVertically) {
                    Text("✅",fontSize=18.sp)
                    Text("Отложено ${notice.count} просроченных задач",
                        fontSize=14.sp,fontWeight=FontWeight.Medium,color=colors.text)
                }
            }
        }
    }
    selectedHabitId?.let { id ->
        state.habits.firstOrNull { it.id == id }?.let {habit->
            NativeHabitDetailSheet(vm=vm,habit=habit,dark=dark,
                onClose={selectedHabitId=null})
        }
    }
}

/** A unified, naturally scrolling header shared by Overview, Timeline and AI Chat. */
@Composable
private fun WorkspaceTopbar(
    state:HomeState,colors:WorkspaceColors,dark:Boolean,
    onAccount:()->Unit,onSearchToggle:()->Unit,settings:()->Unit,
    onCredits:()->Unit
) {
    val shape=RoundedCornerShape(13.dp)
    Row(Modifier.fillMaxWidth().height(54.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(40.dp).clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF7657CD),Color(0xFF3BA6CE)))),
            contentAlignment=Alignment.Center) {
            Icon(Icons.Default.AutoAwesome,"Планировыч",Modifier.size(24.dp),tint=Color.White)
        }
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(1.dp)) {
            Text("Планировыч",color=colors.text,fontSize=17.sp,lineHeight=20.sp,
                fontWeight=FontWeight.ExtraBold,maxLines=1,
                overflow=TextOverflow.Ellipsis)
            Text(state.user?.displayName ?: "Мой профиль",fontSize=10.sp,
                color=colors.secondaryText,lineHeight=12.sp,maxLines=1,
                overflow=TextOverflow.Ellipsis)
        }
        WorkspaceHeaderIcon(Icons.Default.AccountCircle,"Аккаунт",colors,
            if(dark)Color(0xFFC4B5FD) else Color(0xFF7757C6),onAccount)
        Surface(Modifier.height(40.dp).clip(shape).clickable(onClick=onCredits),
            shape=shape,color=tinted(if(dark)Color(0xFF9D83DC)
                else Color(0xFF8B5CF6),colors.card,if(dark).13f else .07f),
            border=BorderStroke(1.dp,colors.panelBorder)) {
            Row(Modifier.padding(horizontal=5.dp),verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.Paid,if(state.user?.subscriptionLimit != null) "Лимит ИИ" else "Кредиты",Modifier.size(19.dp),
                    tint=if(dark)Color(0xFFF3B7D2) else Color(0xFFC25487))
                Spacer(Modifier.width(2.dp))
                Text(state.user?.aiBalanceLabel ?: "0",fontSize=11.sp,
                    fontWeight=FontWeight.Bold,color=colors.text,maxLines=1)
            }
        }
        WorkspaceHeaderIcon(Icons.Default.Search,"Поиск",colors,
            if(dark)Color(0xFF69D4D2) else Color(0xFF0F9B9B),onSearchToggle)
        WorkspaceHeaderIcon(Icons.Default.Settings,"Настройки",colors,
            if(dark)Color(0xFFF2CE91) else Color(0xFFC58B31),settings)
    }
}

@Composable
private fun WorkspaceHeaderIcon(
    icon:androidx.compose.ui.graphics.vector.ImageVector,label:String,
    colors:WorkspaceColors,accent:Color,onClick:()->Unit
) {
    val shape=RoundedCornerShape(13.dp)
    Surface(Modifier.size(39.dp).clip(shape).clickable(onClick=onClick),
        shape=shape,
        color=tinted(accent,colors.card,.10f),
        border=BorderStroke(1.dp,colors.panelBorder)) {
        Box(contentAlignment=Alignment.Center) {
            Icon(icon,label,Modifier.size(23.dp),tint=accent)
        }
    }
}

@Composable
private fun WorkspaceSearchField(
    query:String,colors:WorkspaceColors,
    onSearch:(String)->Unit,onClose:()->Unit,onEdited:(String)->Unit
) {
    val requester=remember{FocusRequester()}
    val keyboard=LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) {
        // Wait until this active pager page's text field is attached, then
        // focus it and open the IME. Never request focus from a prefetched page.
        withFrameNanos { }
        requester.requestFocus()
        keyboard?.show()
    }
    Surface(Modifier.fillMaxWidth().height(46.dp),
        shape=RoundedCornerShape(17.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder)) {
        Row(Modifier.fillMaxSize().padding(horizontal=12.dp),
            verticalAlignment=Alignment.CenterVertically) {
            Icon(Icons.Default.Search,null,Modifier.size(21.dp),
                tint=colors.purple)
            Spacer(Modifier.width(8.dp))
            BasicTextField(value=query,
                onValueChange={text->onSearch(text);onEdited(text)},
                modifier=Modifier.weight(1f).focusRequester(requester),
                singleLine=true,textStyle=MaterialTheme.typography.bodyMedium.copy(
                    color=colors.text,fontSize=14.sp),
                cursorBrush=androidx.compose.ui.graphics.SolidColor(colors.purple),
                decorationBox={inner->Box(contentAlignment=Alignment.CenterStart){
                    if(query.isBlank())Text("Поиск по задачам и заметкам",
                        color=colors.secondaryText,fontSize=13.sp)
                    inner()
                }})
            IconButton(onClick=onClose,modifier=Modifier.size(32.dp)) {
                Icon(Icons.Default.Close,"Закрыть поиск",
                    Modifier.size(19.dp),tint=colors.secondaryText)
            }
        }
    }
}

private fun workspaceHabitNextDay(habit: Habit, today: LocalDate): String {
    val labels = listOf("вс", "пн", "вт", "ср", "чт", "пт", "сб")
    for (offset in 1L..370L) {
        val date = today.plusDays(offset)
        if (habitScheduledToday(habit, date)) return labels[date.dayOfWeek.value % 7]
    }
    return "—"
}

@Composable
private fun WorkspaceHabitBubble(habit: Habit, dueToday: Boolean, colors: WorkspaceColors,
    dark: Boolean, onClick: () -> Unit) {
    val count = if (dueToday) completedHabitToday(habit) else 0
    val target = habit.targetCount.coerceAtLeast(1)
    val accent = if (dueToday) parseWorkspaceColor(habit.color) else Color(0xFF94A3B8)
    val core = when {
        !dueToday -> if (dark) Color(0xFF334155) else Color(0xFFF1F5F9)
        dark -> Color(0xFF0F172A)
        else -> Color.White
    }
    val dayBadge = if (dueToday) "" else workspaceHabitNextDay(habit, LocalDate.now())
    Box(Modifier.width(65.dp).height(67.dp), contentAlignment = Alignment.BottomCenter) {
        Box(Modifier.align(Alignment.BottomCenter).size(58.dp).clip(CircleShape)
            .clickable(onClick=onClick), contentAlignment=Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val ringWidth=5.dp.toPx()
                val ringBounds=androidx.compose.ui.geometry.Size(
                    size.width-ringWidth,size.height-ringWidth)
                val trackColor=if (dueToday) (if (dark) Color(0xFF1E293B) else Color(0xFFE2E8F0))
                    else if (dark) Color(0xFF475569) else Color(0xFFE2E8F0)
                drawCircle(color=trackColor,radius=size.minDimension/2f-ringWidth/2f,
                    style=Stroke(width=ringWidth))
                val progress=(count.toFloat()/target).coerceIn(0f,1f)
                if (progress>0f) {
                    drawArc(color=accent,startAngle=-90f,sweepAngle=progress*360f,
                        useCenter=false,topLeft=Offset(ringWidth/2f,ringWidth/2f),
                        size=ringBounds,style=Stroke(width=ringWidth,cap=StrokeCap.Butt))
                }
            }
            Column(Modifier.size(48.dp).clip(CircleShape).background(core),
                horizontalAlignment=Alignment.CenterHorizontally,
                verticalArrangement=Arrangement.Center) {
                Text(habit.icon, modifier=Modifier
                        .habitEmojiCompletionFilter(dueToday && count>=target)
                        .alpha(if (!dueToday) .27f else if (count>=target) .72f else 1f),
                    fontSize=20.sp,lineHeight=21.sp,maxLines=1,textAlign=TextAlign.Center)
                Spacer(Modifier.height(1.dp))
                Text("${count.coerceAtMost(target)}/$target",fontSize=10.sp,
                    lineHeight=12.sp,fontWeight=FontWeight.Bold,
                    color=if (dueToday) colors.text else colors.secondaryText)
            }
        }
        if (!dueToday) {
            Surface(modifier=Modifier.align(Alignment.TopEnd).offset(x=1.dp),
                shape=RoundedCornerShape(7.dp),
                color=if(dark) Color(0xFF273244) else Color(0xFFE2E8F0),
                border=BorderStroke(1.dp,if(dark) Color(0xFF64748B) else Color(0xFFCBD5E1))) {
                Text(dayBadge, Modifier.padding(horizontal=5.dp,vertical=3.dp),
                    fontSize=10.sp,lineHeight=11.sp,fontWeight=FontWeight.Bold,
                    color=if(dark) Color(0xFFD8E0E9) else Color(0xFF475569))
            }
        }
    }
}

@Composable
private fun HabitsStrip(habits:List<Habit>, colors:WorkspaceColors, dark:Boolean,
    onHabitClick:(Habit)->Unit, onAdd:()->Unit) {
    val today = LocalDate.now()
    val todayHabits = habits.filter { habitScheduledToday(it, today) }
    val otherHabits = habits.filterNot { habitScheduledToday(it, today) }
    val shape=RoundedCornerShape(23.dp)
    Surface(modifier=Modifier.shadow(if(dark)2.dp else 1.dp,shape,
            ambientColor=if(dark)Color(0x15000000) else Color(0x0C394C6A),
            spotColor=if(dark)Color(0x21000000) else Color(0x10394C6A)),
        shape=shape,color=colors.panel,
        border=BorderStroke(1.dp,colors.panelBorder),shadowElevation=0.dp) {
        Column(Modifier.fillMaxWidth().padding(15.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween,
                modifier=Modifier.fillMaxWidth()) {
                Text("Привычки",fontSize=18.sp,fontWeight=FontWeight.Bold,color=colors.text)
                val habitGreen=if(dark)Color(0xFF86EFAC) else Color(0xFF15803D)
                Surface(shape=CircleShape,color=if(dark)Color(0xFF193A30) else Color(0xFFE7F6EF)) {
                    Text("Выполнено "+todayHabits.count(::isHabitDoneToday)+" из "+todayHabits.size,
                        modifier=Modifier.padding(horizontal=10.dp,vertical=6.dp),
                        fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=habitGreen)
                }
            }
            LazyRow(horizontalArrangement=Arrangement.spacedBy(8.dp),contentPadding=PaddingValues(end=2.dp),
                verticalAlignment=Alignment.CenterVertically) {
                items(todayHabits,key={it.id}) { habit ->
                    WorkspaceHabitBubble(habit,true,colors,dark){onHabitClick(habit)}
                }
                if(todayHabits.isNotEmpty() && otherHabits.isNotEmpty()) {
                    item(key="other-day-divider") {
                        Box(Modifier.padding(horizontal=3.dp).width(1.dp).height(39.dp)
                            .background(if(dark)Color(0xFF506078) else Color(0xFFCBD5E1)))
                    }
                }
                items(otherHabits,key={it.id}) { habit ->
                    WorkspaceHabitBubble(habit,false,colors,dark){onHabitClick(habit)}
                }
                item(key="habit-add") {
                    val addGreen=if(dark)Color(0xFF6EE7B7) else Color(0xFF6DD9B6)
                    Box(Modifier.size(58.dp).clip(CircleShape)
                        .background(tinted(addGreen,colors.panel,.13f))
                        .drawBehind {
                            drawCircle(color=addGreen,radius=size.minDimension/2-1.dp.toPx(),
                                style=Stroke(width=1.dp.toPx(),
                                    pathEffect=PathEffect.dashPathEffect(
                                        floatArrayOf(4.dp.toPx(),3.dp.toPx()),0f)))
                        }.clickable(onClick=onAdd),contentAlignment=Alignment.Center) {
                        Icon(Icons.Default.Add,"Добавить привычку",
                            tint=addGreen,modifier=Modifier.size(21.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceUtilityMenuItem(
    label:String,value:String?,
    icon:androidx.compose.ui.graphics.vector.ImageVector,
    accent:Color,dark:Boolean,onClick:()->Unit
) {
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF273B58)
    val border=if(dark)Color(0xFF42516B) else Color(0xFFE7DAF5)
    val tile=if(dark)Color(0xFF273651) else Color.White
    val shape=RoundedCornerShape(21.dp)
    Row(Modifier.fillMaxWidth().clip(shape).background(tile)
        .border(1.dp,border,shape)
        .clickable(onClick=onClick)
        .padding(horizontal=14.dp,vertical=13.dp),
        verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(13.dp)) {
        Box(Modifier.size(32.dp),contentAlignment=Alignment.Center) {
            Icon(icon,null,tint=accent,modifier=Modifier.size(27.dp))
        }
        Text(label,modifier=Modifier.weight(1f),color=ink,
            fontSize=16.sp,fontWeight=FontWeight.Bold,maxLines=1)
        if(value!=null) {
            Text(value,color=if(dark)Color(0xFFD0B5FF) else Color(0xFF7E40B1),
                fontSize=13.sp,fontWeight=FontWeight.Bold,maxLines=1,
                modifier=Modifier.clip(RoundedCornerShape(14.dp))
                    .background(if(dark)Color(0xFF453659) else Color(0xFFF3EAFE))
                    .padding(horizontal=10.dp,vertical=9.dp))
        }
    }
}

@Composable
private fun WorkspaceToolbar(
    colors:WorkspaceColors,dark:Boolean,mode:WorkspaceMode,filtered:Boolean,
    onFilter:()->Unit,onPostpone:()->Unit,canPostpone:Boolean,onOpenOverdue:()->Unit,
    overdueCount:Int
) {
    // No outer tinted container. Mini App renders these as independent chips.
    val filterInk=if(filtered)colors.purple else if(dark)Color(0xFFE2E8F0) else Color(0xFF24354F)
    val filterFill=if(filtered)colors.selected else colors.card
    val filterBorder=if(filtered)colors.purple else colors.panelBorder
    if(mode==WorkspaceMode.TIMELINE) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End) {
            ToolbarButton("Фильтры",Icons.Default.FilterList,
                filterInk,filterFill,filterBorder,
                Modifier.width(124.dp),onFilter)
        }
    } else {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),
            verticalAlignment=Alignment.CenterVertically) {
            ToolbarButton("Отложить",Icons.Default.Schedule,
                if(dark)Color(0xFF7DD3FC) else Color(0xFF0369A1),
                tinted(Color(0xFF38BDF8),colors.panel,if(dark).14f else .09f),
                tinted(Color(0xFF38BDF8),colors.panelBorder,.32f),
                Modifier.weight(1.04f),onPostpone,enabled=canPostpone)
            ToolbarButton("Просроченные задачи",Icons.Default.Schedule,
                if(dark)Color(0xFFF9A8D4) else Color(0xFFBE185D),
                tinted(Color(0xFFF472B6),colors.panel,if(dark).13f else .07f),
                tinted(Color(0xFFF472B6),colors.panelBorder,.29f),
                Modifier.weight(1.65f),onOpenOverdue,badgeCount=overdueCount)
            ToolbarButton("Фильтры",Icons.Default.FilterList,
                filterInk,filterFill,filterBorder,
                Modifier.weight(1.03f),onFilter)
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
    click:()->Unit,enabled:Boolean=true,dimDisabled:Boolean=true,badgeCount:Int=0) {
    val iconInk=if(!enabled && dimDisabled)ink.copy(alpha=.55f) else ink
    val shape=RoundedCornerShape(17.dp)
    Box(modifier.height(44.dp)) {
        Row(Modifier.fillMaxSize()
            .clip(shape).background(fill).border(1.dp,border,shape)
            .clickable(enabled=enabled,onClick=click)
            .padding(horizontal=4.dp),
            horizontalArrangement=Arrangement.Center,verticalAlignment=Alignment.CenterVertically) {
            Icon(icon,null,tint=iconInk,modifier=Modifier.size(15.dp))
            Spacer(Modifier.width(5.dp))
            val overdue = label=="Просроченные задачи"
            Text(label,color=iconInk,fontSize=if(overdue)10.sp else 11.sp,
                fontWeight=FontWeight.SemiBold,maxLines=if(overdue)2 else 1,
                lineHeight=12.sp,textAlign=TextAlign.Center,softWrap=overdue)
        }
        if(badgeCount>0) {
            Box(Modifier.align(Alignment.TopEnd).offset(x=3.dp,y=(-5).dp)
                .defaultMinSize(minWidth=18.dp,minHeight=18.dp)
                .clip(CircleShape).background(Color(0xFFE11D48))
                .padding(horizontal=4.dp),contentAlignment=Alignment.Center) {
                Text(if(badgeCount>99)"99+" else badgeCount.toString(),
                    color=Color.White,fontSize=10.sp,fontWeight=FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ModernTaskCard(task:Task,sphere:Sphere?,colors:WorkspaceColors,dark:Boolean,
    showImportance:Boolean,busy:Boolean,onOpen:()->Unit,onComplete:()->Unit){
    val sectorColor=parseWorkspaceColor(sphere?.color ?: "#64748b")
    val isOverdue=task.dueDate!=null && dueMillis(task.dueDate)<System.currentTimeMillis()
    Surface(modifier=Modifier.shadow(
            elevation=if(dark)3.dp else 4.dp,
            shape=RoundedCornerShape(21.dp),
            ambientColor=if(dark)Color(0x22000000) else Color(0x24394C6A),
            spotColor=if(dark)Color(0x2B000000) else Color(0x34394C6A)),
        shape=RoundedCornerShape(21.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder),shadowElevation=0.dp) {
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
                Text(task.title,color=colors.text,fontWeight=FontWeight.Bold,
                    fontSize=16.sp,lineHeight=21.sp,letterSpacing=(-0.1).sp,
                    maxLines=1,overflow=TextOverflow.Ellipsis)
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
                    // Preserve the title gap, tighten only the two metadata rows.
                    Column(verticalArrangement=Arrangement.spacedBy(3.dp)) {
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
                            Text(remainingDue(task.dueDate),fontSize=12.sp,
                                fontWeight=FontWeight.SemiBold,color=tint)
                        }
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

@Composable
private fun TaskCompletionConfetti() {
    val animation=remember { Animatable(0f) }
    LaunchedEffect(Unit){animation.animateTo(1f,animationSpec=tween(560))}
    val progress=animation.value
    val colors=listOf(Color(0xFF22C55E),Color(0xFFA855F7),Color(0xFFFACC15),
        Color(0xFF38BDF8),Color(0xFFFB7185))
    Canvas(Modifier.fillMaxSize()) {
        val anchor=Offset(size.width*.88f,size.height*.19f)
        repeat(25){index->
            val angle=(index*2.399963f)
            val distance=size.width*(.08f+(index%7)*.024f)*progress
            val position=Offset(
                anchor.x+cos(angle)*distance,
                anchor.y+sin(angle)*distance+size.height*.40f*progress*progress)
            drawCircle(
                color=colors[index%colors.size].copy(alpha=(1f-progress).coerceIn(0f,1f)),
                radius=(2.3f+(index%4)*.8f)*density,
                center=position
            )
        }
    }
}

@Composable private fun EmptyWorkspaceMessage(message:String,colors:WorkspaceColors) {
    val shape=RoundedCornerShape(18.dp)
    Surface(modifier=Modifier.shadow(3.dp,shape),shape=shape,color=colors.card,
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

@Composable
private fun WorkspaceProgressCard(
    label:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    completed:Int,total:Int,colors:WorkspaceColors,modifier:Modifier=Modifier
) {
    Surface(modifier,shape=RoundedCornerShape(21.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder)) {
        Column(Modifier.padding(15.dp),verticalArrangement=Arrangement.spacedBy(11.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                Icon(icon,null,Modifier.size(19.dp),tint=colors.purple)
                Text(label,fontSize=12.sp,fontWeight=FontWeight.SemiBold,color=colors.secondaryText)
            }
            Text("$completed из $total",fontSize=27.sp,fontWeight=FontWeight.ExtraBold,
                color=colors.text,maxLines=1)
            LinearProgressIndicator(progress={if(total>0)completed.toFloat()/total else 0f},
                modifier=Modifier.fillMaxWidth().height(7.dp).clip(CircleShape),
                color=colors.purple,trackColor=colors.muted)
        }
    }
}

@Composable
private fun WorkspaceSectorsOverview(
    spheres:List<Sphere>,tasks:List<Task>,colors:WorkspaceColors,
    selected:Set<String>,onSelect:(String?)->Unit,onSettings:()->Unit
) {
    Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(23.dp),color=colors.card,
        border=BorderStroke(1.dp,colors.panelBorder)) {
        Column(Modifier.padding(15.dp),verticalArrangement=Arrangement.spacedBy(13.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                Text("Сектора",fontSize=19.sp,fontWeight=FontWeight.Bold,
                    color=colors.text,modifier=Modifier.weight(1f))
                Text(spheres.size.toString(),fontSize=12.sp,color=colors.secondaryText)
                IconButton(onClick=onSettings,modifier=Modifier.size(34.dp)) {
                    Icon(Icons.Default.Settings,"Настроить сектора",
                        Modifier.size(19.dp),tint=colors.secondaryText)
                }
            }
            if(spheres.isEmpty()) {
                Text("Добавьте первый сектор через настройки",
                    color=colors.secondaryText,fontSize=13.sp)
            } else {
                spheres.chunked(3).forEach { group ->
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        group.forEach { sector ->
                            val sectorColor=parseWorkspaceColor(sector.color)
                            val count=tasks.count {
                                it.taskType==TaskType.TASK && it.parentTaskId==null &&
                                    it.sphereId==sector.id && it.status!=TaskStatus.DONE
                            }
                            val chosen=sector.id in selected
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp))
                                .background(if(chosen)colors.selected else colors.card)
                                .clickable { onSelect(sector.id) }
                                .padding(vertical=6.dp,horizontal=2.dp),
                                horizontalAlignment=Alignment.CenterHorizontally,
                                verticalArrangement=Arrangement.spacedBy(7.dp)) {
                                Box(Modifier.size(65.dp)
                                    .background(sectorColor.copy(alpha=.17f),CircleShape),
                                    contentAlignment=Alignment.Center) {
                                    Box(Modifier.size(53.dp).background(sectorColor,CircleShape),
                                        contentAlignment=Alignment.Center) {
                                        Text(count.toString(),fontSize=19.sp,
                                            fontWeight=FontWeight.Bold,color=Color.White)
                                    }
                                }
                                Text(sector.name,fontSize=12.sp,fontWeight=FontWeight.Medium,
                                    color=colors.text,maxLines=2,textAlign=TextAlign.Center,
                                    lineHeight=14.sp)
                            }
                        }
                        repeat(3-group.size){Spacer(Modifier.weight(1f))}
                    }
                }
            }
            if(selected.isNotEmpty()) {
                TextButton(onClick={onSelect(null)}) {
                    Text("Показать все сектора",color=colors.purple)
                }
            }
        }
    }
}

private data class SectorIconChoice(
    val code:String,val title:String,
    val symbol:androidx.compose.ui.graphics.vector.ImageVector
)
private val sectorIconChoices=listOf(
    SectorIconChoice("briefcase","Работа",Icons.Default.Work),
    SectorIconChoice("heart","Здоровье",Icons.Default.Favorite),
    SectorIconChoice("home","Дом",Icons.Default.Home),
    SectorIconChoice("graduation-cap","Учёба",Icons.Default.School),
    SectorIconChoice("dumbbell","Спорт",Icons.Default.FitnessCenter),
    SectorIconChoice("wallet","Финансы",Icons.Default.AccountBalanceWallet),
    SectorIconChoice("book-open","Книги",Icons.Default.MenuBook),
    SectorIconChoice("palette","Творчество",Icons.Default.Palette),
    SectorIconChoice("plane","Поездки",Icons.Default.Flight),
    SectorIconChoice("car","Авто",Icons.Default.DirectionsCar),
    SectorIconChoice("music","Музыка",Icons.Default.MusicNote),
    SectorIconChoice("star","Избранное",Icons.Default.Star),
    SectorIconChoice("target","Цели",Icons.Default.TrackChanges),
    SectorIconChoice("laptop","Проекты",Icons.Default.Computer),
    SectorIconChoice("users","Семья",Icons.Default.Group),
    SectorIconChoice("shopping-cart","Покупки",Icons.Default.ShoppingCart),
    SectorIconChoice("sprout","Природа",Icons.Default.Eco),
    SectorIconChoice("coffee","Отдых",Icons.Default.LocalCafe),
    SectorIconChoice("calendar","Планы",Icons.Default.CalendarToday),
    SectorIconChoice("lightbulb","Идеи",Icons.Default.Lightbulb),
    SectorIconChoice("sparkles","Развитие",Icons.Default.AutoAwesome),
    SectorIconChoice("trophy","Достижения",Icons.Default.EmojiEvents),
    SectorIconChoice("globe","Мир",Icons.Default.Public),
    SectorIconChoice("paw-print","Питомцы",Icons.Default.Pets)
)
private fun sectorIconVector(code:String?):androidx.compose.ui.graphics.vector.ImageVector =
    sectorIconChoices.firstOrNull{it.code==code}?.symbol ?: Icons.Default.Work

@Composable
private fun SectorIconSelector(
    selected:String,colors:WorkspaceColors,onSelect:(String)->Unit
) {
    Column(verticalArrangement=Arrangement.spacedBy(9.dp)) {
        Text("Иконка сектора",color=colors.secondaryText,fontSize=13.sp)
        sectorIconChoices.chunked(4).forEach { group ->
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                group.forEach { choice ->
                    val active=choice.code==selected
                    val shape=RoundedCornerShape(14.dp)
                    Column(Modifier.weight(1f).clip(shape)
                        .background(if(active)colors.selected else colors.card)
                        .border(if(active)2.dp else 1.dp,
                            if(active)colors.purple else colors.panelBorder,shape)
                        .clickable{onSelect(choice.code)}
                        .padding(vertical=9.dp,horizontal=2.dp),
                        horizontalAlignment=Alignment.CenterHorizontally,
                        verticalArrangement=Arrangement.spacedBy(5.dp)) {
                        Icon(choice.symbol,choice.title,Modifier.size(25.dp),
                            tint=if(active)colors.purple else colors.secondaryText)
                        Text(choice.title,color=if(active)colors.text else colors.secondaryText,
                            fontSize=9.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                }
                repeat(4-group.size){Spacer(Modifier.weight(1f))}
            }
        }
    }
}

@Composable
private fun WorkspaceSectorSettings(
    vm:HomeViewModel,state:HomeState,colors:WorkspaceColors,onClose:()->Unit
) {
    var editorOpen by remember { mutableStateOf(false) }
    var editingId by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var color by remember { mutableStateOf("#8B5CF6") }
    var icon by remember { mutableStateOf("briefcase") }
    var prompt by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    val palette=listOf("#8B5CF6","#2563EB","#06B6D4","#10B981","#F59E0B",
        "#F97316","#E11D48","#64748B")
    fun edit(sector:Sphere?) {
        editingId=sector?.id
        name=sector?.name ?: ""
        color=sector?.color ?: palette.first()
        icon=sector?.icon ?: "briefcase"
        prompt=sector?.generalPrompt ?: ""
        editorOpen=true
    }
    Column(Modifier.fillMaxWidth().navigationBarsPadding()
        .verticalScroll(rememberScrollState())
        .padding(start=19.dp,end=19.dp,bottom=28.dp),
        verticalArrangement=Arrangement.spacedBy(13.dp)) {
        Row(verticalAlignment=Alignment.CenterVertically) {
            Text(if(editorOpen)"Редактирование сектора" else "Настройки секторов",
                fontSize=20.sp,fontWeight=FontWeight.Bold,color=colors.text,
                modifier=Modifier.weight(1f))
            IconButton(onClick={if(editorOpen){editorOpen=false}else onClose()}) {
                Icon(Icons.Default.Close,"Закрыть",tint=colors.text)
            }
        }
        if(!editorOpen) {
            state.spheres.forEach { sector ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp))
                    .background(colors.card).clickable { edit(sector) }.padding(12.dp),
                    verticalAlignment=Alignment.CenterVertically) {
                    Box(Modifier.size(32.dp).background(parseWorkspaceColor(sector.color),CircleShape),
                        contentAlignment=Alignment.Center) {
                        Icon(sectorIconVector(sector.icon),null,Modifier.size(19.dp),
                            tint=Color.White)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(sector.name,color=colors.text,modifier=Modifier.weight(1f))
                    Icon(Icons.Default.Edit,"Редактировать",Modifier.size(18.dp),
                        tint=colors.secondaryText)
                }
            }
            Button(onClick={edit(null)},modifier=Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Add,null)
                Spacer(Modifier.width(8.dp))
                Text("Добавить сектор")
            }
        } else {
            OutlinedTextField(value=name,onValueChange={name=it},
                label={Text("Название сектора")},singleLine=true,
                modifier=Modifier.fillMaxWidth())
            Text("Цвет сектора",color=colors.secondaryText,fontSize=13.sp)
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                palette.forEach { option ->
                    Box(Modifier.weight(1f).aspectRatio(1f)
                        .clip(CircleShape).background(parseWorkspaceColor(option))
                        .border(if(color==option)3.dp else 0.dp,
                            if(color==option)colors.text else Color.Transparent,CircleShape)
                        .clickable { color=option })
                }
            }
            SectorIconSelector(selected=icon,colors=colors,onSelect={icon=it})
            OutlinedTextField(value=prompt,onValueChange={prompt=it},
                label={Text("Общий промпт")},minLines=2,maxLines=4,
                modifier=Modifier.fillMaxWidth())
            state.sectorError?.let {
                Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
            }
            Button(
                onClick={vm.saveSphere(editingId,name,color,icon,prompt){
                    editorOpen=false
                }},
                enabled=!state.sectorBusy && name.isNotBlank(),
                modifier=Modifier.fillMaxWidth()
            ) {
                if(state.sectorBusy)CircularProgressIndicator(Modifier.size(17.dp),
                    color=Color.White,strokeWidth=2.dp)
                else Text("Сохранить")
            }
            if(editingId!=null) {
                OutlinedButton(onClick={confirmDelete=true},
                    enabled=!state.sectorBusy,modifier=Modifier.fillMaxWidth()) {
                    Text("Удалить сектор",color=MaterialTheme.colorScheme.error)
                }
            }
        }
    }
    if(confirmDelete) {
        AlertDialog(onDismissRequest={confirmDelete=false},
            title={Text("Удалить сектор?")},
            text={Text("Действие удалит сектор. Перед удалением проверьте связанные задачи.")},
            confirmButton={TextButton(onClick={
                confirmDelete=false
                editingId?.let { vm.deleteSphere(it){editorOpen=false} }
            }){Text("Удалить")}},
            dismissButton={TextButton(onClick={confirmDelete=false}){Text("Отмена")}})
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
