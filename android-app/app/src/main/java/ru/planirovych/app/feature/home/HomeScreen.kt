package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.rememberPagerState
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.UUID
import ru.planirovych.app.data.model.*
import ru.planirovych.app.ui.theme.ThemeMode

private enum class AuthMode { LOGIN, REGISTER }

@Composable
fun HomeScreen(vm: HomeViewModel, dark: Boolean,
    notificationTaskId:String?=null,openGeneralAi:Boolean=false,
    quickAiMode:String?=null,quickAiRequestId:Int=0,
    onQuickAiHandled:(Int)->Unit={},
    updateAvailable:Boolean=false,onCheckUpdates:()->Unit={}) {
    val state by vm.state.collectAsStateWithLifecycle()
    val themeMode by vm.themeMode.collectAsStateWithLifecycle()
    val focusManager=LocalFocusManager.current
    val softwareKeyboard=LocalSoftwareKeyboardController.current
    val density=LocalDensity.current
    val imeInsets=WindowInsets.ime
    val keyboardOpen=imeInsets.getBottom(density)>0
    // Do not mount a bottom sheet while the search IME is animating out.
    var pendingFocusTaskId by remember{mutableStateOf<String?>(null)}
    var settings by remember { mutableStateOf(false) }
    var wardrobeOpen by remember(state.user?.id) { mutableStateOf(false) }
    LaunchedEffect(state.user?.id){vm.refreshMascotWardrobe(state.user?.id)}
    var accountOpen by remember { mutableStateOf(false) }
    var creationType by remember { mutableStateOf<TaskType?>(null) }
    var createHabit by remember { mutableStateOf(false) }
    var createNote by remember { mutableStateOf(false) }
    var notesRequest by remember { mutableIntStateOf(0) }
    var plannerMenuOpen by remember { mutableStateOf(false) }
    val pagerState = rememberPagerState(initialPage=0,pageCount={4})
    val plannerScrimAlpha by animateFloatAsState(
        targetValue=if(plannerMenuOpen&&pagerState.currentPage in 0..1)
            if(dark).26f else .19f else 0f,
        animationSpec=tween(155),label="planner-action-scrim"
    )
    val pagerScope = rememberCoroutineScope()
    val sharedChat by vm.generalAi.collectAsStateWithLifecycle()
    var pendingVoiceText by remember { mutableStateOf<String?>(null) }
    var voiceAwaiting by remember { mutableStateOf(false) }
    var voiceError by remember { mutableStateOf<String?>(null) }
    // Voice launched by a widget is always the planner, independent of the
    // last open tab (including Economych).
    var voiceFromFinance by remember { mutableStateOf(false) }
    val voiceInput=rememberAiChatSpeechInput(
        dark=dark,transcribe=vm::transcribeVoice,
        onRecognized={spoken,sendImmediately->
            if(sendImmediately){
                pendingVoiceText=spoken
                voiceAwaiting=true
                vm.loadGeneralAi(state.user?.id)
            }
        },
        onError={message->voiceError=message;voiceAwaiting=false},
        // Reflect processing on the originating planner/finance FAB immediately
        // after Send, not only after the remote transcript is returned.
        onProcessingStart={voiceAwaiting=true},
        onProcessingCancelled={voiceAwaiting=false},
        quickLauncher=true,
        accent=if(voiceFromFinance)Color(0xFFF5A52E) else Color(0xFF8050DF),
        suggestions=if(voiceFromFinance)listOf(
            "Добавь расход", "Запиши доход", "Покажи расходы за месяц",
            "Создай долг", "Сколько денег на счетах?"
        )else listOf(
            "Создай задачу", "Добавь напоминание", "Перенеси встречу",
            "Создай привычку", "Запиши заметку", "Запиши расход",
            "Создай счёт", "Переведи деньги между счетами", "Создай долг"
        ),
        financialSuggestions=if(voiceFromFinance)emptySet() else setOf(
            "Запиши расход","Создай счёт","Переведи деньги между счетами","Создай долг")
    )
    // Open the shared Quick AI thread as soon as processing starts.
    LaunchedEffect(pendingVoiceText,sharedChat.projects,sharedChat.loading,sharedChat.busy){
        val spoken=pendingVoiceText?:return@LaunchedEffect
        if(sharedChat.loading)return@LaunchedEffect
        val quick=sharedChat.projects.firstOrNull{project->
            !project.isTelegram && project.chats.any{it.id==QUICK_AI_THREAD_ID}
        }
        if(quick==null){
            pendingVoiceText=null;voiceAwaiting=false
            voiceError="Общий чат с ИИ не найден. Обновите данные аккаунта."
            return@LaunchedEffect
        }
        if(sharedChat.busy||sharedChat.saving){
            pendingVoiceText=null;voiceAwaiting=false
            voiceError="Дождитесь предыдущего ответа ИИ."
            return@LaunchedEffect
        }
        pendingVoiceText=null
        val thread=quick.chats.first{it.id==QUICK_AI_THREAD_ID}
        vm.chooseGeneralAiChat(quick.id,QUICK_AI_THREAD_ID)
        vm.sendGeneralAi(quick.id,QUICK_AI_THREAD_ID,UUID.randomUUID().toString(),
            spoken,spoken,emptyList(),thread.model?:"gpt-6-luna",
            onDone={voiceAwaiting=false},
            onFailed={message->voiceAwaiting=false;voiceError=message}
        )
        pagerScope.launch{pagerState.scrollToPage(2)}
    }
    var requestPersonalChat by remember { mutableStateOf(false) }
    LaunchedEffect(requestPersonalChat,sharedChat.projects,sharedChat.loading,sharedChat.saving){
        if(requestPersonalChat && !sharedChat.loading && !sharedChat.saving){
            val personal=sharedChat.projects.firstOrNull{
                it.title==PERSONAL_AI_PROJECT_TITLE && !it.isTelegram
            } ?:sharedChat.projects.firstOrNull{!it.isTelegram}
            if(personal!=null){
                requestPersonalChat=false
                vm.createGeneralAiThread(personal.id)
            }
        }
    }
    var quickNavigationHandled by remember(openGeneralAi,quickAiRequestId){mutableStateOf(false)}
    LaunchedEffect(openGeneralAi,quickAiMode,quickAiRequestId,sharedChat.projects,state.loading){
        if(quickAiMode=="voice" && quickAiRequestId>0 && !quickNavigationHandled && !state.loading){
            quickNavigationHandled=true
            onQuickAiHandled(quickAiRequestId)
            voiceFromFinance=false
            pagerState.scrollToPage(0)
            voiceInput()
        }else if((openGeneralAi || quickAiMode!=null) && quickAiMode!="voice" && !quickNavigationHandled){
            pagerState.scrollToPage(2)
            // Widget result and scheduled checkup alerts must open Quick Requests,
            // not whichever project conversation happened to be selected last.
            val quickProject=sharedChat.projects.firstOrNull{p->
                p.chats.any{it.id==QUICK_AI_THREAD_ID}
            }
            if(quickProject!=null){
                vm.chooseGeneralAiChat(quickProject.id,QUICK_AI_THREAD_ID)
                quickNavigationHandled=true
            }
        }
    }
    var authMode by remember { mutableStateOf<AuthMode?>(null) }
    var openedTaskId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(pendingFocusTaskId){
        val target=pendingFocusTaskId ?: return@LaunchedEffect
        // Inset goes to zero when the keyboard has actually finished closing.
        // The timeout avoids a stuck tap on OEM keyboards that never report zero.
        withTimeoutOrNull(850L){
            snapshotFlow{imeInsets.getBottom(density)}.first{it==0}
        }
        if(pendingFocusTaskId==target){
            openedTaskId=target
            pendingFocusTaskId=null
        }
    }
    var newSubtaskParentId by remember { mutableStateOf<String?>(null) }
    // Keep the parent focus sheet mounted while its subtask dialog is open.
    var overlaySubtaskId by remember { mutableStateOf<String?>(null) }
    var overlayNewSubtaskParentId by remember { mutableStateOf<String?>(null) }
    // Only return to the parent if the subtask was entered from its focus sheet.
    // Direct timeline navigation must close back to the timeline.
    var subtaskReturnToTaskId by remember { mutableStateOf<String?>(null) }
    var taskAiChatId by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(quickAiRequestId){
        if(quickAiRequestId>0){
            // A widget should not be hidden behind an already-open task sheet.
            openedTaskId=null
            newSubtaskParentId=null
            overlaySubtaskId=null
            overlayNewSubtaskParentId=null
            subtaskReturnToTaskId=null
            taskAiChatId=null
            settings=false
        }
    }
    // Never resume a previously focused chat input just because the user
    // switched back to Chats AI. A widget's explicit text command is different.
    LaunchedEffect(pagerState.currentPage) {
        if(pagerState.currentPage!=2) {
            focusManager.clearFocus(force=true)
            softwareKeyboard?.hide()
        }
    }

    // Never leave the previous account's task editor open after login/logout.
    LaunchedEffect(state.user?.id) {
        openedTaskId = null
        newSubtaskParentId = null
        overlaySubtaskId = null
        overlayNewSubtaskParentId = null
        subtaskReturnToTaskId = null
        taskAiChatId = null
    }
    LaunchedEffect(notificationTaskId,state.user?.id){
        if(!notificationTaskId.isNullOrBlank()){
            openedTaskId=notificationTaskId
            newSubtaskParentId=null
            overlaySubtaskId=null
            overlayNewSubtaskParentId=null
            subtaskReturnToTaskId=null
            pagerState.scrollToPage(0)
        }
    }

    Scaffold(contentWindowInsets = WindowInsets.safeDrawing,
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            if(!state.loading && state.error==null &&
                pagerState.currentPage!=2 && pagerState.currentPage!=3){
                NativeHoldActionButton(
                    accent=if(dark)Color(0xFFA78BFA) else Color(0xFF6D28D9),
                    foreground=if(dark)Color(0xFF131125) else Color.White,
                    waiting=voiceAwaiting,onVoice={voiceFromFinance=false;voiceInput()},
                    onMenuVisibilityChange={plannerMenuOpen=it},
                    actions=listOf(
                        NativeHoldAction("Добавить задачу",Icons.Default.CheckCircle){creationType=TaskType.TASK},
                        NativeHoldAction("Добавить событие",Icons.Default.Event){creationType=TaskType.EVENT},
                        NativeHoldAction("Добавить напоминание",Icons.Default.Notifications){creationType=TaskType.REMINDER},
                        NativeHoldAction("Добавить привычку",Icons.Default.AutoAwesome){createHabit=true},
                        NativeHoldAction("Добавить заметку",Icons.Default.StickyNote2){createNote=true},
                        NativeHoldAction("Открыть заметки",Icons.Default.StickyNote2){notesRequest++},
                        NativeHoldAction("Создать чат с ИИ",Icons.Default.SmartToy){
                            requestPersonalChat=true
                            vm.loadGeneralAi(state.user?.id)
                            pagerScope.launch{pagerState.animateScrollToPage(2)}
                        }
                    )
                )
            }
        },
        bottomBar = {
            // Scaffold already reserves the navigation-bar height in its content.
            // Keeping it while the IME is open double-offsets Quick AI composer.
            if(!state.loading && state.error == null && !keyboardOpen) {
                val tabs = listOf(
                    Triple("Общая",Icons.Default.Dashboard,"Общая"),
                    Triple("Таймлайн",Icons.Default.CalendarViewWeek,"Таймлайн"),
                    Triple("ИИ-чат",Icons.Default.SmartToy,"ИИ-чат"),
                    Triple("Экономыч",Icons.Default.MonetizationOn,"Экономыч AI, финансы")
                )
                // One uninterrupted surface behind the five tabs AND the Android
                // gesture area. No extra border around the bottom system inset.
                val navBackground=if(dark)Color(0xFF121827) else Color.White
                Column(modifier=Modifier.fillMaxWidth().background(navBackground)) {
                  HorizontalDivider(thickness=1.dp,
                      color=if(dark)Color(0xFF263044) else Color(0xFFE4E8F0))
                  NavigationBar(
                    modifier=Modifier.height(66.dp),
                    containerColor=navBackground,
                    contentColor=if(dark)Color(0xFFE2E8F0) else Color(0xFF172238),
                    tonalElevation=0.dp,
                    windowInsets=WindowInsets(0,0,0,0)
                ) {
                    tabs.forEachIndexed { index,tab ->
                        NavigationBarItem(
                            selected=pagerState.currentPage==index,
                            onClick={pagerScope.launch { pagerState.animateScrollToPage(index) }},
                            icon={Icon(tab.second,contentDescription=tab.third,
                                modifier=Modifier.size(24.dp))},
                            label={Text(tab.first,fontSize=10.sp,maxLines=1)},
                            alwaysShowLabel=true,
                            colors=NavigationBarItemDefaults.colors(
                                selectedIconColor=if(index==3) (if(dark) Color(0xFFF6B95F) else Color(0xFF9B5200)) else if(dark)Color(0xFFD8B4FE) else Color(0xFF6828C6),
                                selectedTextColor=if(dark)Color(0xFFF1E8FF) else Color(0xFF5420A7),
                                indicatorColor=if(index==3) (if(dark)Color(0xFF56371F) else Color(0xFFFFE4BF)) else if(dark)Color(0xFF34264E) else Color(0xFFECE0FF),
                                unselectedIconColor=if(index==3) (if(dark)Color(0xFFD6A05B) else Color(0xFFB16D22)) else if(dark)Color(0xFF9CA3AF) else Color(0xFF55647E),
                                unselectedTextColor=if(dark)Color(0xFF9CA3AF) else Color(0xFF55647E)
                            ),
                        )
                    }
                  }
                  Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
                }
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize()){
        when {
            state.loading -> NativeLoadingSkeleton(Modifier.padding(padding),dark)
            state.error != null -> ErrorState(state.error!!, vm::refresh, Modifier.padding(padding))
            else -> ModernWorkspace(
                vm, state, dark, vm::search, { settings = true },
                onAccount = { accountOpen = true },
                onOpenTask = { taskId ->
                    focusManager.clearFocus(force=true)
                    softwareKeyboard?.hide()
                    if(imeInsets.getBottom(density)>0){
                        pendingFocusTaskId=taskId
                    }else{
                        openedTaskId=taskId
                        pendingFocusTaskId=null
                    }
                    subtaskReturnToTaskId = null
                    newSubtaskParentId = null
                    overlaySubtaskId = null
                    overlayNewSubtaskParentId = null
                    vm.clearTaskError()
                },
                pagerState = pagerState,
                onOpenTaskAi = { taskId ->
                    if(state.tasks.any { it.id==taskId && it.parentTaskId==null }) {
                        openedTaskId=null
                        taskAiChatId=taskId
                    }
                },
                quickAiMode=quickAiMode,
                quickAiRequestId=quickAiRequestId,
                onQuickAiHandled=onQuickAiHandled,
                onQuickVoice={voiceFromFinance=true;voiceInput()},voiceAwaiting=voiceAwaiting,
                notesRequest=notesRequest,
                updateAvailable=updateAvailable,
                modifier = Modifier.padding(padding),
            )
        }
        // Dim the workspace behind the popup without intercepting drags on
        // the FAB. The popup and FAB remain above this drawing-only overlay.
        if(plannerScrimAlpha>0.001f){
            Box(Modifier.matchParentSize().background(
                Color.Black.copy(alpha=plannerScrimAlpha)))
        }
        }
    }
    voiceError?.let{message->
        AlertDialog(onDismissRequest={voiceError=null},
            title={Text("Голосовой запрос")},text={Text(message)},
            confirmButton={TextButton(onClick={voiceError=null}){Text("Понятно")}})
    }
    creationType?.let { type ->
        NativeQuickTaskCreateSheet(type=type,vm=vm,dark=dark,
            onClose={creationType=null})
    }
    if(createHabit) NativeHabitCreateSheet(vm=vm,dark=dark,
        onClose={createHabit=false})
    if(createNote) NativeQuickNoteCreateSheet(vm=vm,dark=dark,
        onClose={createNote=false})
    if (accountOpen) AndroidAccountSheet(state.user,dark,
        busy=state.profileBusy,error=state.profileError,
        onSave={name,username,email,password,onSaved->
            vm.updateProfile(name,username,email,password,onSaved)
        },
        onClose={accountOpen=false},onSettings={accountOpen=false;settings=true},
        onLogout={accountOpen=false;vm.logout { }})
    if (settings) SettingsSheet(
        state.user, dark, themeMode, vm::setThemeMode, { settings = false },
        { authMode = it; settings = false }, { vm.logout { settings = false } },
        updateAvailable=updateAvailable,onCheckUpdates={settings=false;onCheckUpdates()},
        onOpenWardrobe={settings=false;wardrobeOpen=true;vm.refreshMascotWardrobe(state.user?.id)},
    )
    if(wardrobeOpen) NativeMascotWardrobeDialog(vm,dark,state.user?.id){wardrobeOpen=false}
    authMode?.let { mode ->
        AuthDialog(mode, state.authBusy, state.authError, { authMode = null; vm.clearAuthError() }, vm::login, vm::register)
    }

    val openedTask = state.tasks.firstOrNull { it.id == openedTaskId }
    val parent = when {
        newSubtaskParentId != null -> state.tasks.firstOrNull { it.id == newSubtaskParentId }
        openedTask?.parentTaskId != null -> state.tasks.firstOrNull { it.id == openedTask.parentTaskId }
        else -> null
    }
    val editorVisible = (openedTaskId != null && openedTask != null) ||
        (newSubtaskParentId != null && parent != null)
    if (editorVisible) {
        val back: () -> Unit = {
            openedTaskId = subtaskReturnToTaskId
            subtaskReturnToTaskId = null
            newSubtaskParentId = null
            vm.clearTaskError()
        }
        if (openedTask != null && parent == null && openedTask.taskType != TaskType.REMINDER) {
            MiniAppTaskFocusSheet(
                task = openedTask,
                vm = vm,
                tasks = state.tasks,
                spheres = state.spheres,
                dark = dark,
                busy = state.taskBusy,
                error = state.taskError,
                onBack = back,
                onOpenSubtask = { childId ->
                    // Dialog overlays the existing focus sheet; no intermediate empty screen.
                    overlaySubtaskId = childId
                    overlayNewSubtaskParentId = null
                    vm.clearTaskError()
                },
                onNewSubtask = {
                    overlayNewSubtaskParentId = openedTask.id
                    overlaySubtaskId = null
                    vm.clearTaskError()
                },
                onSave = vm::saveTask,
                onChangeStatus = vm::changeStatus,
                onDelete = vm::deleteTask,
                onClearError = vm::clearTaskError,
                onOpenAiChat = {taskAiChatId=it},
            )
        } else if (parent != null) {
            MiniAppSubtaskEditorSheet(
                task = openedTask,
                parent = parent,
                dark = dark,
                vm = vm,
                busy = state.taskBusy,
                error = state.taskError,
                onBack = back,
                onOpenParent = {
                    // Direct entry from the timeline has no parent sheet beneath
                    // this dialog. Replace the child with the parent focus task.
                    openedTaskId = parent.id
                    newSubtaskParentId = null
                    subtaskReturnToTaskId = null
                    vm.clearTaskError()
                },
                onSave = vm::saveTask,
                onCreateSubtask = vm::createSubtask,
                onChangeStatus = vm::changeStatus,
                onDelete = vm::deleteTask,
                onClearError = vm::clearTaskError,
            )
        } else TaskEditorSheet(
            task = openedTask,
            parent = parent,
            tasks = state.tasks,
            spheres = state.spheres,
            busy = state.taskBusy,
            error = state.taskError,
            onBack = back,
            onOpenSubtask = { childId ->
                subtaskReturnToTaskId = openedTask?.id ?: parent?.id
                openedTaskId = childId
                newSubtaskParentId = null
                vm.clearTaskError()
            },
            onNewSubtask = {
                val root = openedTask ?: parent
                if (root != null) {
                    subtaskReturnToTaskId = root.id
                    newSubtaskParentId = root.id
                    openedTaskId = null
                    vm.clearTaskError()
                }
            },
            onSave = vm::saveTask,
            onCreateSubtask = vm::createSubtask,
            onChangeStatus = vm::changeStatus,
            onDelete = vm::deleteTask,
            onClearError = vm::clearTaskError,
        )
    }
    // Parent sheet stays alive underneath; closing only this dialog reveals it instantly.
    val overlayChild=overlaySubtaskId?.let{id->state.tasks.firstOrNull{it.id==id}}
    val overlayParent=when {
        overlayNewSubtaskParentId!=null ->
            state.tasks.firstOrNull{it.id==overlayNewSubtaskParentId}
        overlayChild?.parentTaskId!=null ->
            state.tasks.firstOrNull{it.id==overlayChild.parentTaskId}
        else -> null
    }
    if(overlayParent!=null && (overlayChild!=null || overlayNewSubtaskParentId!=null)){
        MiniAppSubtaskEditorSheet(
            task=overlayChild,parent=overlayParent,dark=dark,vm=vm,
            busy=state.taskBusy,error=state.taskError,
            onBack={
                overlaySubtaskId=null
                overlayNewSubtaskParentId=null
                vm.clearTaskError()
            },
            onOpenParent={
                // The parent focus sheet is already mounted under this dialog.
                // Reveal it directly, including for a child opened from its list.
                openedTaskId=overlayParent.id
                newSubtaskParentId=null
                subtaskReturnToTaskId=null
                overlaySubtaskId=null
                overlayNewSubtaskParentId=null
                vm.clearTaskError()
            },
            onSave=vm::saveTask,onCreateSubtask=vm::createSubtask,
            onChangeStatus=vm::changeStatus,onDelete=vm::deleteTask,
            onClearError=vm::clearTaskError
        )
    }
    taskAiChatId?.let{id->
        state.tasks.firstOrNull{it.id==id}?.let{aiTask->
            NativeTaskAiChat(task=aiTask,vm=vm,dark=dark,
                onClose={taskAiChatId=null},
                onOpenTaskReference={referenceId->
                    if(state.tasks.any{it.id==referenceId}){
                        taskAiChatId=null
                        openedTaskId=referenceId
                        subtaskReturnToTaskId=null
                        newSubtaskParentId=null
                        overlaySubtaskId=null
                        overlayNewSubtaskParentId=null
                        vm.clearTaskError()
                    }
                })
        }
    }
}

@Composable private fun Loading(modifier: Modifier) = Box(modifier.fillMaxSize(), contentAlignment=Alignment.Center) { Column(horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(14.dp)) { CircularProgressIndicator(); Text("Загружаем Планировыч…", fontWeight=FontWeight.SemiBold) } }
@Composable private fun ErrorState(message:String, retry:()->Unit, modifier:Modifier) = Box(modifier.fillMaxSize().padding(24.dp), contentAlignment=Alignment.Center) { Card(colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.errorContainer), shape=RoundedCornerShape(24.dp)) { Column(Modifier.padding(24.dp), horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(14.dp)) { Icon(Icons.Default.CloudOff,null); Text(message); Button(retry) { Icon(Icons.Default.Refresh,null); Spacer(Modifier.width(8.dp)); Text("Повторить") } } } }

@Composable
private fun Workspace(
    state: HomeState,
    search: (String) -> Unit,
    settings: () -> Unit,
    onOpenTask: (String) -> Unit,
    modifier: Modifier,
) {
    val spheres = remember(state.spheres) { state.spheres.associateBy { it.id } }
    val query = state.query.trim().lowercase(Locale.getDefault())
    val tasks = remember(state.tasks, query) {
        state.tasks
            .asSequence()
            .filter { it.parentTaskId == null && it.status != TaskStatus.DONE }
            .filter {
                query.isEmpty() ||
                    it.title.lowercase(Locale.getDefault()).contains(query) ||
                    it.description.orEmpty().lowercase(Locale.getDefault()).contains(query)
            }
            .sortedWith(compareBy<Task> { taskSortTime(it.dueDate) }.thenByDescending { it.importance })
            .toList()
    }
    val children = remember(state.tasks) { state.tasks.groupBy { it.parentTaskId } }
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Header(state, search, settings) }
        item { HabitsCard(state.habits) }
        item { Text("Задачи", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (tasks.isEmpty()) {
            item {
                EmptyCard(if (query.isNotEmpty()) "По вашему запросу ничего не найдено" else "Активных задач пока нет")
            }
        } else {
            items(tasks, key = { it.id }) { task ->
                TaskCard(task, spheres[task.sphereId], children[task.id].orEmpty()) {
                    onOpenTask(task.id)
                }
            }
        }
        item { Spacer(Modifier.height(6.dp)) }
    }
}

@Composable private fun Header(state:HomeState, search:(String)->Unit, settings:()->Unit) {
    Surface(shape=RoundedCornerShape(20.dp), tonalElevation=4.dp, shadowElevation=4.dp, border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline.copy(.65f))) {
        Column(Modifier.padding(10.dp), verticalArrangement=Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.query, search, Modifier.weight(1f), placeholder={Text("Поиск по задачам")}, leadingIcon={Icon(Icons.Default.Search,null)}, singleLine=true, shape=RoundedCornerShape(14.dp))
                IconButton(settings, Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) { Icon(Icons.Default.Settings,"Настройки", tint=Color(0xFFF59E0B)) }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                Metric(Icons.Default.AutoAwesome, if(state.user?.subscriptionLimit != null) "Лимит ИИ" else "ИИ-кредиты", state.user?.aiBalanceLabel ?: "0", Color(0xFF22B8CF), Modifier.weight(1f))
                Metric(Icons.Default.Star, "Эффективность", "${state.user?.efficiencyScore?.toInt() ?: 0}/100", Color(0xFF8B5CF6), Modifier.weight(1f))
            }
        }
    }
}
@Composable private fun Metric(icon:androidx.compose.ui.graphics.vector.ImageVector,label:String,value:String,color:Color,modifier:Modifier){ Surface(modifier,shape=RoundedCornerShape(13.dp),color=color.copy(.12f),border=BorderStroke(1.dp,color.copy(.3f))){Row(Modifier.padding(10.dp),verticalAlignment=Alignment.CenterVertically){Icon(icon,null,tint=color);Spacer(Modifier.width(7.dp));Column{Text(label,style=MaterialTheme.typography.labelSmall);Text(value,fontWeight=FontWeight.Bold)}}}}

/** Mirrors MiniApp recurrence semantics. Weekdays use JS day numbers (0=Sunday). */
private fun habitScheduledOn(habit: Habit, date: LocalDate): Boolean {
    if (habit.isArchived || habit.isAutoCompleted) return false
    val created = habit.createdAt?.let { raw ->
        runCatching { Instant.parse(raw).atZone(ZoneId.systemDefault()).toLocalDate() }
            .recoverCatching { OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate() }
            .getOrNull()
    } ?: date
    if (date.isBefore(created)) return false
    if (habit.durationMode == HabitDurationMode.UNTIL_DATE &&
        habit.endDate?.take(10)?.let { date.toString() > it } == true) return false
    return when (habit.recurrenceType) {
        HabitRecurrenceType.DAILY -> true
        HabitRecurrenceType.WEEKDAYS -> habit.weekdays.contains(date.dayOfWeek.value % 7)
        HabitRecurrenceType.INTERVAL ->
            ChronoUnit.DAYS.between(created, date) %
                (habit.intervalDays ?: 1).coerceAtLeast(1) == 0L
    }
}
private fun nextHabitWeekday(habit: Habit, today: LocalDate): String {
    val weekdayLabels = listOf("вс", "пн", "вт", "ср", "чт", "пт", "сб")
    for (offset in 1L..370L) {
        val date = today.plusDays(offset)
        if (habitScheduledOn(habit, date)) return weekdayLabels[date.dayOfWeek.value % 7]
    }
    return "—"
}

@Composable private fun HabitsCard(habits: List<Habit>) {
    val today = LocalDate.now()
    val dayKey = today.toString()
    val active = habits.filter { !it.isAutoCompleted && !it.isArchived }
    val dueToday = active.filter { habitScheduledOn(it, today) }.sortedWith(
        compareBy<Habit> { it.stats.filter { stat -> stat.dateKey == dayKey }.sumOf { stat -> stat.amount } >= it.targetCount }
            .thenBy { it.createdAt ?: "" }
    )
    val otherDays = active.filterNot { habitScheduledOn(it, today) }
    val complete = dueToday.count { habit ->
        habit.stats.filter { it.dateKey == dayKey }.sumOf { it.amount } >= habit.targetCount
    }
    Surface(shape = RoundedCornerShape(22.dp), tonalElevation = 2.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .6f))) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically) {
                Text("Привычки", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondary.copy(alpha = .12f)) {
                    Text("Выполнено $complete из ${dueToday.size}",
                        Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelSmall)
                }
            }
            if (active.isEmpty()) {
                Text("Привычек пока нет", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    items(dueToday, key = { it.id }) { habit ->
                        HabitBubble(habit, dayKey, scheduledToday = true)
                    }
                    if (dueToday.isNotEmpty() && otherDays.isNotEmpty()) {
                        item(key = "other-days-divider") {
                            Box(Modifier.padding(horizontal = 3.dp).width(1.dp).height(41.dp)
                                .background(MaterialTheme.colorScheme.outline.copy(alpha = .48f)))
                        }
                    }
                    items(otherDays, key = { it.id }) { habit ->
                        HabitBubble(habit, dayKey, scheduledToday = false,
                            nextWeekday = nextHabitWeekday(habit, today))
                    }
                }
            }
        }
    }
}

@Composable private fun HabitBubble(habit: Habit, today: String, scheduledToday: Boolean,
    nextWeekday: String = "") {
    val amount = if (scheduledToday) habit.stats.filter { it.dateKey == today }.sumOf { it.amount } else 0
    val target = habit.targetCount.coerceAtLeast(1)
    val progress = (amount.toFloat() / target).coerceIn(0f, 1f)
    val baseColor = parseColor(habit.color, MaterialTheme.colorScheme.primary)
    val circleColor = if (scheduledToday) baseColor else MaterialTheme.colorScheme.outline
    val bg = if (!scheduledToday) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .68f)
        else baseColor.copy(alpha = .13f)
    val contentColor = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.width(72.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.width(72.dp).height(70.dp), contentAlignment = Alignment.BottomCenter) {
            Box(Modifier.align(Alignment.BottomCenter).size(60.dp)) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = CircleShape,
                    color = bg,
                    border = BorderStroke(2.dp, circleColor.copy(alpha = if (scheduledToday) .2f else .6f)),
                    shadowElevation = if (scheduledToday) 2.dp else 0.dp
                ) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(habit.icon, modifier = Modifier
                                    .habitEmojiCompletionFilter(scheduledToday && amount>=target)
                                    .alpha(if (!scheduledToday) .24f else if (amount>=target) .72f else 1f),
                                style = MaterialTheme.typography.titleLarge)
                            Text("${amount.coerceAtMost(target)}/$target",
                                color = contentColor.copy(alpha = if (scheduledToday) 1f else .65f),
                                style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (progress > 0f) {
                    Canvas(Modifier.fillMaxSize()) {
                        val ringWidth = 2.dp.toPx()
                        drawArc(color = baseColor,
                            startAngle = -90f, sweepAngle = progress * 360f,
                            useCenter = false, topLeft = Offset(ringWidth / 2f, ringWidth / 2f),
                            size = Size(size.width - ringWidth, size.height - ringWidth),
                            style = Stroke(width = ringWidth, cap = StrokeCap.Butt))
                    }
                }
            }
            if (!scheduledToday) {
                Surface(
                    modifier = Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = 0.dp),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = .6f)),
                    shadowElevation = 1.dp
                ) {
                    Text(nextWeekday, Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold)
                }
            }
        }
        Text(habit.name, Modifier.padding(top = 5.dp),
            style = MaterialTheme.typography.labelSmall,
            color = if (scheduledToday) MaterialTheme.colorScheme.onSurface
                else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Compact, clickable card following the Telegram MiniApp list, without status chips. */
@Composable
private fun TaskCard(task: Task, sphere: Sphere?, children: List<Task>, onClick: () -> Unit) {
    val isEvent = task.taskType == TaskType.EVENT
    val stripe = if (isEvent) Color(0xFFF59E0B)
        else sphere?.let { parseColor(it.color, Color(0xFF64748B)) } ?: Color(0xFF64748B)
    val complete = children.count { it.status == TaskStatus.DONE }
    val overdue = !isEvent && task.dueDate?.let { taskSortTime(it) < System.currentTimeMillis() } == true
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.64f),
        border = BorderStroke(1.dp, if (overdue) Color(0xFFEF4444).copy(alpha = .5f) else stripe.copy(alpha = .36f)),
        shadowElevation = 2.dp,
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 74.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(if (isEvent) 2.dp else 4.dp).height(74.dp).background(stripe))
            Column(
                Modifier.weight(1f).padding(horizontal = 13.dp, vertical = 11.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    task.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    (if (isEvent) "Событие: " else "Дедлайн: ") + formatDate(task.dueDate),
                    color = if (overdue) Color(0xFFEF4444) else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            if (children.isNotEmpty()) {
                Box(Modifier.padding(end = 14.dp).size(29.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        progress = { complete.toFloat() / children.size },
                        modifier = Modifier.fillMaxSize(),
                        color = Color(0xFF22C55E),
                        trackColor = MaterialTheme.colorScheme.outlineVariant,
                        strokeWidth = 3.dp,
                    )
                    Text(
                        complete.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun taskSortTime(value: String?): Long {
    if (value.isNullOrBlank()) return Long.MAX_VALUE
    return runCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }
        .getOrElse { Long.MAX_VALUE }
}

@Composable private fun EmptyCard(text:String){Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(20.dp),color=MaterialTheme.colorScheme.surfaceVariant){Column(Modifier.padding(28.dp).fillMaxWidth(),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Default.CheckCircle,null,tint=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(8.dp));Text(text)}}}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(
    user: CurrentUser?,
    dark: Boolean,
    mode: ThemeMode,
    setMode: (ThemeMode) -> Unit,
    close: () -> Unit,
    auth: (AuthMode) -> Unit,
    logout: () -> Unit,
    updateAvailable:Boolean=false,onCheckUpdates:()->Unit={},onOpenWardrobe:()->Unit={}
) {
    // Open at the content's natural expanded height rather than the
    // half-screen anchor. It remains a wrap-content sheet, not fullscreen.
    val sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)
    ModalBottomSheet(onDismissRequest=close,sheetState=sheetState) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal=20.dp,vertical=12.dp),
            verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("Настройки",style=MaterialTheme.typography.headlineSmall,
                fontWeight=FontWeight.Bold)
            Text(user?.displayName ?: "Профиль")
            Text(if(user?.hasAccount==true)"Аккаунт Планировыча"
                else "Локальный профиль устройства",
                color=MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment=Alignment.CenterVertically) {
                Icon(Icons.Default.SettingsBrightness,null)
                Column(Modifier.padding(start=10.dp).weight(1f)) {
                    Text("Как на телефоне")
                    Text("Автоматически переключать светлую и тёмную тему",
                        style=MaterialTheme.typography.bodySmall,
                        color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked=mode==ThemeMode.SYSTEM,
                    onCheckedChange={follow->
                        setMode(if(follow) ThemeMode.SYSTEM
                            else if(dark) ThemeMode.DARK else ThemeMode.LIGHT)
                    })
            }
            Row(verticalAlignment=Alignment.CenterVertically) {
                Icon(if(dark) Icons.Default.DarkMode else Icons.Default.LightMode,null)
                Text("Тёмная тема",Modifier.padding(start=10.dp).weight(1f))
                Switch(checked=dark,enabled=mode!=ThemeMode.SYSTEM,
                    onCheckedChange={setMode(if(it) ThemeMode.DARK else ThemeMode.LIGHT)},
                    colors=SwitchDefaults.colors(
                        checkedThumbColor=Color.White,
                        checkedTrackColor=Color(0xFF7C3AED),
                        uncheckedThumbColor=Color(0xFF6D28D9),
                        uncheckedTrackColor=Color(0xFFE8E1F4),
                        uncheckedBorderColor=Color(0xFFB8A8D6),
                        uncheckedIconColor=Color(0xFF6D28D9)
                    ))
            }
            OutlinedButton(onClick=onOpenWardrobe,enabled=user?.id!=null,modifier=Modifier.fillMaxWidth()){Text("Аксессуары и скины Планика")}
            OutlinedButton(onClick=onCheckUpdates,modifier=Modifier.fillMaxWidth()){
                Icon(Icons.Default.SystemUpdate,null)
                Spacer(Modifier.width(8.dp))
                Text("Обновления",Modifier.weight(1f))
                if(updateAvailable) Badge { Text("Новое") }
            }
            if(user?.hasAccount==true) {
                OutlinedButton(logout,Modifier.fillMaxWidth()){Text("Выйти")}
            } else {
                Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                    Button({auth(AuthMode.LOGIN)},Modifier.weight(1f)){Text("Войти")}
                    OutlinedButton({auth(AuthMode.REGISTER)},Modifier.weight(1f)){
                        Text("Регистрация")
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AndroidAccountSheet(
    user:CurrentUser?,dark:Boolean,busy:Boolean,error:String?,
    onSave:(String,String,String,String,()->Unit)->Unit,
    onClose:()->Unit,onSettings:()->Unit,onLogout:()->Unit
) {
    var name by remember(user?.id) { mutableStateOf(user?.name ?: "") }
    var username by remember(user?.id) { mutableStateOf(user?.username ?: "") }
    var email by remember(user?.id) { mutableStateOf(user?.email ?: "") }
    var password by remember(user?.id) { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest=onClose) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
            .imePadding().padding(start=20.dp,end=20.dp,bottom=32.dp),
            verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("Управление аккаунтом",style=MaterialTheme.typography.headlineSmall,
                fontWeight=FontWeight.Bold)
            Text(user?.displayName ?: "Профиль",fontWeight=FontWeight.SemiBold)
            if(user?.hasAccount==true) {
                OutlinedTextField(value=name,onValueChange={name=it},
                    label={Text("Имя")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                OutlinedTextField(value=username,onValueChange={username=it},
                    label={Text("Логин")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                OutlinedTextField(value=email,onValueChange={email=it},
                    label={Text("Электронная почта")},modifier=Modifier.fillMaxWidth(),
                    singleLine=true)
                OutlinedTextField(value=password,onValueChange={password=it},
                    label={Text("Текущий пароль (для смены почты)")},
                    modifier=Modifier.fillMaxWidth(),singleLine=true,
                    visualTransformation=androidx.compose.ui.text.input.PasswordVisualTransformation())
                error?.let {
                    Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
                }
                Button(onClick={onSave(name,username,email,password,onClose)},
                    modifier=Modifier.fillMaxWidth(),
                    enabled=!busy && username.trim().length>=3 && email.isNotBlank()) {
                    if(busy) CircularProgressIndicator(
                        Modifier.size(18.dp),strokeWidth=2.dp)
                    else Text("Сохранить данные аккаунта")
                }
                Text("При смене почты может потребоваться подтверждение по электронной почте.",
                    style=MaterialTheme.typography.bodySmall,
                    color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            HorizontalDivider()
            Text((if(user?.subscriptionLimit != null) "Лимит ИИ: " else "ИИ-кредиты: ")+(user?.aiBalanceLabel ?: "0"),
                fontWeight=FontWeight.Medium)
            OutlinedButton(onClick=onSettings,modifier=Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Settings,null)
                Spacer(Modifier.width(8.dp))
                Text("Настройки приложения")
            }
            if(user?.hasAccount==true) {
                OutlinedButton(onClick=onLogout,modifier=Modifier.fillMaxWidth()) {
                    Text("Выйти из аккаунта")
                }
            }
        }
    }
}

@Composable private fun AuthDialog(mode:AuthMode,busy:Boolean,error:String?,close:()->Unit,login:(String,String,()->Unit)->Unit,register:(String,String,String,String,Boolean,()->Unit)->Unit){var username by remember{mutableStateOf("")};var password by remember{mutableStateOf("")};var email by remember{mutableStateOf("")};var name by remember{mutableStateOf("")};var consent by remember{mutableStateOf(false)};val context=LocalContext.current;AlertDialog(onDismissRequest={if(!busy)close()},title={Text(if(mode==AuthMode.LOGIN)"Вход в аккаунт" else "Регистрация")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){OutlinedTextField(username,{username=it},label={Text(if(mode==AuthMode.LOGIN)"Логин или email" else "Логин")},singleLine=true);if(mode==AuthMode.REGISTER){OutlinedTextField(email,{email=it},label={Text("Электронная почта (обязательно)")},singleLine=true);OutlinedTextField(name,{name=it},label={Text("Имя")},singleLine=true);Text("100 пробных ИИ-кредитов начисляются после подтверждения почты.",style=MaterialTheme.typography.bodySmall)};OutlinedTextField(password,{password=it},label={Text("Пароль")},singleLine=true);if(mode==AuthMode.LOGIN)TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/auth/email?mode=forgot")))}){Text("Забыли пароль?")};if(mode==AuthMode.REGISTER){Row(verticalAlignment=Alignment.Top){Checkbox(consent,{consent=it});Text("Я согласен на обработку персональных данных",Modifier.padding(top=12.dp))};TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/consent")))}){Text("Прочитать согласие")};Row{TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/terms")))}){Text("Условия")};TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/privacy")))}){Text("Конфиденциальность")}}};error?.let{Text(it,color=MaterialTheme.colorScheme.error)}}},confirmButton={Button(onClick={if(mode==AuthMode.LOGIN){login(username,password,close)}else{register(username,password,email,name,consent,close)}},enabled=!busy&&username.isNotBlank()&&password.isNotBlank()&&(mode==AuthMode.LOGIN||(consent&&android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()))){if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp)else Text(if(mode==AuthMode.LOGIN)"Войти" else "Зарегистрироваться")}},dismissButton={TextButton(close,enabled=!busy){Text("Отмена")}})}
private fun parseColor(value:String,fallback:Color)=runCatching{Color(android.graphics.Color.parseColor(value))}.getOrDefault(fallback)
private fun statusText(status:TaskStatus)=when(status){TaskStatus.TODO->"К выполнению";TaskStatus.IN_PROGRESS->"В работе";TaskStatus.DONE->"Готово"}
private fun formatDate(value:String?):String{if(value.isNullOrBlank())return "Без срока";return try{OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("d MMM, HH:mm",Locale("ru")))}catch(_:DateTimeParseException){value.take(10)}}
