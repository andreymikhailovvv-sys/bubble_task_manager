package ru.planirovych.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import ru.planirovych.app.data.repository.userMessage
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import ru.planirovych.app.data.model.*
import ru.planirovych.app.data.repository.WorkspaceRepository
import ru.planirovych.app.data.repository.userMessage
import ru.planirovych.app.ui.theme.ThemePreferences

data class TaskCreationChild(val title:String,val description:String,val dueDate:String?)
data class TaskCreationFile(val name:String,val mime:String,val bytes:ByteArray)


data class TaskAiChatState(
    val taskId:String?=null,
    val messages:List<TaskAiChatMessage> = emptyList(),
    val loading:Boolean=false,
    val busy:Boolean=false,
    val actionBusy:Boolean=false,
    val progressStatus:String?=null,
    val monitoringTriggers:List<TaskMonitoringTrigger> = emptyList(),
    val monitoringStatuses:List<TaskMonitoringStatus> = emptyList(),
    val lastActionReports:List<String> = emptyList(),
    val error:String?=null,
    val requestId:String?=null,
)

data class GeneralAiChatState(
    val projects:List<GeneralAiProject> = emptyList(),
    val selectedProjectId:String?=null,
    val selectedChatId:String=QUICK_AI_THREAD_ID,
    val loading:Boolean=false,val saving:Boolean=false,val busy:Boolean=false,
    val error:String?=null,val progressStatus:String?=null,
    val pendingMessage:TaskAiChatMessage?=null
){
    val project:GeneralAiProject? get()=projects.firstOrNull{it.id==selectedProjectId}
        ?:projects.firstOrNull()
    val chat:GeneralAiThread? get()=project?.chats?.firstOrNull{it.id==selectedChatId}
        ?:project?.chats?.firstOrNull()
}

data class HomeState(val loading: Boolean = true, val user: CurrentUser? = null, val spheres: List<Sphere> = emptyList(), val tasks: List<Task> = emptyList(), val habits: List<Habit> = emptyList(), val query: String = "", val error: String? = null, val authError: String? = null, val authBusy: Boolean = false, val taskBusy: Boolean = false, val taskError: String? = null,
    val recurrenceLoading:Boolean=false, val recurrenceError:String?=null, val habitBusy: Boolean = false,
    val habitHistoryId: String? = null,
    val habitHistory: List<HabitStat>? = null,
    val habitError: String? = null,
    val notes: List<StandaloneNote> = emptyList(), val noteGroups: List<StandaloneNoteGroup> = emptyList(), val notesLoading: Boolean = false, val notesBusy: Boolean = false, val notesError: String? = null, val attachmentTaskId: String? = null,
    val taskAttachments: List<TaskAttachment> = emptyList(),
    val taskAttachmentsBusy: Boolean = false, val taskAttachmentsError: String? = null)
class HomeViewModel(private val repository: WorkspaceRepository, private val themes: ThemePreferences) : ViewModel() {
    private val mutable = MutableStateFlow(HomeState())
    private val taskAiMutable=MutableStateFlow(TaskAiChatState())
    private val generalAiMutable=MutableStateFlow(GeneralAiChatState())
    val generalAi=generalAiMutable.asStateFlow()
    private val generalWriteMutex=Mutex()
    private var generalLoadedForUser:String?=null

    fun loadGeneralAi(userId:String?,force:Boolean=false){
        if(userId==null){
            generalLoadedForUser=null
            generalAiMutable.value=GeneralAiChatState()
            return
        }
        if(!force && generalLoadedForUser==userId)return
        if(generalLoadedForUser!=userId){
            // Never display one account's chat tree during another login.
            generalAiMutable.value=GeneralAiChatState(loading=true)
        }
        generalLoadedForUser=userId
        generalAiMutable.update{it.copy(loading=true,error=null)}
        viewModelScope.launch {
            try{
                var remote=repository.loadGeneralAiProjects()
                if(remote.isEmpty()){
                    // Only initialize a fresh account once; never generate a
                    // different quick-chat project on every tab switch.
                    remote=generalWriteMutex.withLock{
                        val existing=repository.loadGeneralAiProjects()
                        if(existing.isNotEmpty())existing
                        else repository.persistGeneralAiProjects(defaultGeneralAiProjects())
                    }
                }
                val quick=repository.loadQuickAiHistory()
                remote=mergeQuickAiMessages(remote,quick)
                generalAiMutable.update{current->
                    if(generalLoadedForUser!=userId)current else {
                        val projectId=current.selectedProjectId
                            ?.takeIf{id->remote.any{it.id==id}} ?:remote.firstOrNull()?.id
                        val project=remote.firstOrNull{it.id==projectId}
                        val chatId=current.selectedChatId.takeIf{id->
                            project?.chats?.any{it.id==id}==true
                        }?:project?.chats?.firstOrNull()?.id?:QUICK_AI_THREAD_ID
                        current.copy(projects=remote,selectedProjectId=projectId,
                            selectedChatId=chatId,loading=false,error=null)
                    }
                }
            }catch(error:Throwable){
                generalLoadedForUser=null
                generalAiMutable.update{it.copy(loading=false,error=error.userMessage())}
            }
        }
    }
    private fun mergeQuickAiMessages(
        projects:List<GeneralAiProject>,messages:List<JsonObject>
    ):List<GeneralAiProject>{
        if(projects.isEmpty())return projects
        val first=projects.first()
        val idx=first.chats.indexOfFirst{it.id==QUICK_AI_THREAD_ID}
        val existing=if(idx>=0)first.chats[idx] else GeneralAiThread(
            QUICK_AI_THREAD_ID,QUICK_AI_TITLE)
        val combined=first.chats.toMutableList()
        val merged=existing.copy(messages=messages.takeLast(100))
        if(idx>=0)combined[idx]=merged else combined.add(0,merged)
        return listOf(first.copy(chats=combined))+projects.drop(1)
    }
    fun chooseGeneralAiChat(projectId:String,chatId:String){
        generalAiMutable.update{current->
            if(current.projects.any{p->p.id==projectId && p.chats.any{it.id==chatId}})
                current.copy(selectedProjectId=projectId,selectedChatId=chatId,error=null)
            else current
        }
        syncGeneralAiThread(projectId,chatId)
    }
    fun refreshGeneralAi(){
        if(generalAiMutable.value.busy||generalAiMutable.value.saving)return
        val userId=mutable.value.user?.id?:return
        loadGeneralAi(userId,force=true)
    }
    fun syncGeneralAiThread(projectId:String,chatId:String){
        if(generalAiMutable.value.busy || generalAiMutable.value.saving)return
        viewModelScope.launch {
            try{
                val remote=if(chatId==QUICK_AI_THREAD_ID)
                    repository.loadQuickAiHistory()
                else repository.loadGeneralAiThread(projectId,chatId)
                generalAiMutable.update {state->
                    if(state.busy||state.saving)state else state.copy(
                        projects=state.projects.map{p->
                            if(p.id!=projectId)p else p.copy(
                                chats=p.chats.map{c->
                                    if(c.id==chatId)c.copy(messages=remote) else c
                                })
                        }
                    )
                }
            }catch(_:Throwable){/* transient network error; preserve history */}
        }
    }

    /** Each structural edit merges into the newest server state while serialized.
      * Sending a full stale Android snapshot could erase browser chat history.
      */
    private fun modifyGeneralProjects(
        operation:(List<GeneralAiProject>)->List<GeneralAiProject>,
        after:(List<GeneralAiProject>)->Unit={}
    ){
        if(generalAiMutable.value.saving||generalAiMutable.value.busy)return
        generalAiMutable.update{it.copy(saving=true,error=null)}
        viewModelScope.launch {
            try{
                val saved=generalWriteMutex.withLock {
                    val remote=repository.loadGeneralAiProjects()
                    repository.persistGeneralAiProjects(operation(remote))
                }
                generalAiMutable.update{it.copy(projects=saved,saving=false,error=null)}
                after(saved)
            }catch(e:Throwable){
                generalAiMutable.update{it.copy(saving=false,error=e.userMessage())}
            }
        }
    }
    fun createGeneralAiProject(title:String,color:String,icon:String){
        val id=java.util.UUID.randomUUID().toString()
        val chatId=java.util.UUID.randomUUID().toString()
        modifyGeneralProjects({remote->remote+GeneralAiProject(
            id,title.trim().ifBlank{"Новый проект"},color,icon,
            listOf(GeneralAiThread(chatId,"Новый чат")))
        },{saved->
            if(saved.any{it.id==id})chooseGeneralAiChat(id,chatId)
        })
    }
    fun editGeneralAiProject(id:String,title:String,color:String,icon:String){
        modifyGeneralProjects({remote->remote.map{
            if(it.id==id && !it.isTelegram && remote.firstOrNull()?.id!=id)
                it.copy(title=title.trim().ifBlank{"Проект"},color=color,icon=icon)
            else it
        }})
    }
    fun deleteGeneralAiProject(id:String){
        modifyGeneralProjects({remote->
            if(remote.firstOrNull()?.id==id ||
                id==TELEGRAM_AI_PROJECT_ID ||remote.size<=1)remote
            else remote.filterNot{it.id==id}
        },{saved->
            val project=saved.firstOrNull() ?:return@modifyGeneralProjects
            val state=generalAiMutable.value
            if(saved.none{it.id==state.selectedProjectId}){
                chooseGeneralAiChat(project.id,
                    project.chats.firstOrNull()?.id?:QUICK_AI_THREAD_ID)
            }
        })
    }
    fun createGeneralAiThread(projectId:String){
        val id=java.util.UUID.randomUUID().toString()
        modifyGeneralProjects({remote->remote.map{p->
            if(p.id!=projectId||p.isTelegram)p else p.copy(
                chats=listOf(GeneralAiThread(id,"Чат ${p.chats.size+1}"))+p.chats)
        }},{saved->
            if(saved.any{p->p.id==projectId&&p.chats.any{it.id==id}})
                chooseGeneralAiChat(projectId,id)
        })
    }
    fun renameGeneralAiThread(projectId:String,chatId:String,title:String){
        if(chatId==QUICK_AI_THREAD_ID||chatId.startsWith("telegram-ai-assistant:"))return
        modifyGeneralProjects({remote->remote.map{p->
            if(p.id!=projectId||p.isTelegram)p else p.copy(
                chats=p.chats.map{c->
                    if(c.id==chatId)c.copy(title=title.trim().ifBlank{"Новый чат"}) else c
                })
        }})
    }
    fun deleteGeneralAiThread(projectId:String,chatId:String){
        if(chatId==QUICK_AI_THREAD_ID||chatId.startsWith("telegram-ai-assistant:"))return
        modifyGeneralProjects({remote->remote.map{p->
            if(p.id!=projectId||p.isTelegram||p.chats.size<=1)p
            else p.copy(chats=p.chats.filterNot{it.id==chatId})
        }},{saved->
            val state=generalAiMutable.value
            if(state.selectedChatId==chatId && state.selectedProjectId==projectId){
                saved.firstOrNull{it.id==projectId}?.chats?.firstOrNull()?.let{
                    chooseGeneralAiChat(projectId,it.id)
                }
            }
        })
    }
    fun setGeneralAiModel(projectId:String,chatId:String,model:String){
        if(chatId==QUICK_AI_THREAD_ID){
            // Quick model in MiniApp is per-session, not persisted on the server.
            generalAiMutable.update{state->state.copy(projects=state.projects.map{p->
                if(p.id==projectId)p.copy(chats=p.chats.map{c->
                    if(c.id==chatId)c.copy(model=model) else c
                }) else p
            })}
        }else modifyGeneralProjects({remote->remote.map{p->
            if(p.id!=projectId)p else p.copy(chats=p.chats.map{c->
                if(c.id==chatId)c.copy(model=model,modelChangedAt=java.time.Instant.now().toString())
                else c
            })
        }})
    }
    fun applyGeneralAiProposal(id:String,action:String){
        viewModelScope.launch{
            try{
                repository.updateTaskAiProposal(id,action)
                val updated=repository.loadTasks()
                mutable.update{it.copy(tasks=updated)}
                generalAiMutable.update{it.copy(error=null)}
            }catch(t:Throwable){
                generalAiMutable.update{it.copy(error=t.userMessage())}
            }
        }
    }
    fun generalAiDocumentLink(id:String,onReady:(String)->Unit){
        viewModelScope.launch{
            try{
                val link=repository.taskAiDocumentLink(id)
                    ?:throw IllegalStateException("Ссылка на документ недоступна")
                onReady(link)
            }catch(t:Throwable){
                generalAiMutable.update{it.copy(error=t.userMessage())}
            }
        }
    }
    fun sendGeneralAi(
        projectId:String,chatId:String,requestId:String,question:String,
        messageContent:String,files:List<TaskAiFile>,model:String,
        onDone:()->Unit={}
    ){
        val current=generalAiMutable.value
        val project=current.projects.firstOrNull{it.id==projectId} ?:return
        val thread=project.chats.firstOrNull{it.id==chatId}?:return
        if(current.busy||current.saving)return
        val optimistic=buildJsonObject{
            put("id",requestId);put("role","user");put("content",messageContent)
            put("createdAt",java.time.Instant.now().toString())
        }
        generalAiMutable.update{state->
            state.copy(busy=true,error=null,progressStatus="analyzing_request",
                pendingMessage=repository.readTaskAiMessage(optimistic))
        }
        viewModelScope.launch {
            try{
                val response=repository.askGeneralAi(project,
                    thread.copy(model=model),thread.messages,requestId,question,files
                ){status->
                    generalAiMutable.update{state->
                        if(state.busy)state.copy(progressStatus=status)else state
                    }
                }
                val answer=response.aiString("answer")
                if(chatId==QUICK_AI_THREAD_ID){
                    val remote=repository.loadQuickAiHistory()
                    generalAiMutable.update{state->state.copy(
                        projects=mergeQuickAiMessages(state.projects,remote))}
                }else{
                    val assistant=buildJsonObject{
                        put("id",java.util.UUID.randomUUID().toString())
                        put("role","assistant")
                        put("content",answer+
                            (response["actionReports"] as? JsonArray).orEmpty()
                                .mapNotNull{(it as? JsonPrimitive)?.contentOrNull}
                                .takeIf{it.isNotEmpty()}?.let{
                                    "\n\nИзменения:\n- "+it.joinToString("\n- ")
                                }.orEmpty())
                        put("createdAt",java.time.Instant.now().toString())
                        (response["billing"] as? JsonObject)?.get("creditsSpentMilli")?.let{
                            put("creditsSpentMilli",it)
                        }
                        listOf("webSearchUsed","webSources","webCitations",
                            "generatedDocument","taskProposal","telegramSendDraft",
                            "telegramReadDraft","telegramSuggestedReply").forEach{key->
                            response[key]?.let{put(key,it)}
                        }
                    }
                    val saved=generalWriteMutex.withLock {
                        val fresh=repository.loadGeneralAiProjects()
                        repository.persistGeneralAiProjects(fresh.map{p->
                            if(p.id!=projectId)p else p.copy(chats=p.chats.map{c->
                                if(c.id!=chatId)c else {
                                    val ids=c.messages.map{it.aiString("id")}.toSet()
                                    c.copy(
                                        title=if(c.title.matches(Regex("Новый чат|Чат \\d+")) &&
                                            c.messages.isEmpty())
                                            response.aiString("suggestedChatTitle")
                                                .ifBlank{c.title} else c.title,
                                        messages=c.messages+
                                            listOf(optimistic,assistant).filterNot{
                                                it.aiString("id") in ids
                                            })
                                }
                            })
                        })
                    }
                    generalAiMutable.update{it.copy(projects=saved)}
                }
                if((response["taskDataChanged"] as? JsonPrimitive)?.booleanOrNull==true){
                    runCatching{repository.loadTasks()}.onSuccess{tasks->
                        mutable.update{it.copy(tasks=tasks)}
                    }
                }
                generalAiMutable.update{it.copy(
                    busy=false,progressStatus=null,pendingMessage=null,error=null)}
                onDone()
            }catch(e:Throwable){
                // A retry must keep the same requestId; server idempotency
                // prevents duplicate tool actions / credit charges.
                generalAiMutable.update{it.copy(
                    busy=false,progressStatus=null,pendingMessage=null,error=e.userMessage())}
            }
        }
    }

    val taskAi=taskAiMutable.asStateFlow()
    fun openTaskAi(taskId:String){
        taskAiMutable.value=TaskAiChatState(taskId=taskId,loading=true)
        viewModelScope.launch{
            try{
                val history=repository.loadTaskAiHistory(taskId)
                taskAiMutable.update{if(it.taskId==taskId)it.copy(
                    messages=history,loading=false,error=null) else it}
                refreshTaskAiMonitoring(taskId)
            }catch(error:Throwable){
                taskAiMutable.update{if(it.taskId==taskId)it.copy(
                    loading=false,error=error.userMessage())else it}
            }
        }
    }
    fun refreshTaskAiMonitoring(taskId:String){
        if(taskAiMutable.value.taskId!=taskId)return
        viewModelScope.launch{
            try{
                val triggers=repository.loadTaskMonitoringTriggers(taskId)
                val statuses=repository.loadTaskMonitoringStatuses(taskId)
                taskAiMutable.update{
                    if(it.taskId==taskId)it.copy(
                        monitoringTriggers=triggers,monitoringStatuses=statuses)
                    else it
                }
            }catch(_:Throwable){
                // Monitoring is optional. A permission issue must not break the chat.
            }
        }
    }
    fun closeTaskAi(){
        // Do not cancel a response already accepted by the server.
        // Its history remains shared with the site after this window closes.
        taskAiMutable.update { it.copy(taskId=null) }
    }
    fun syncTaskAiHistory(taskId:String){
        if(taskAiMutable.value.taskId!=taskId ||
            taskAiMutable.value.busy || taskAiMutable.value.loading)return
        viewModelScope.launch{
            try{
                val history=repository.loadTaskAiHistory(taskId)
                taskAiMutable.update{
                    if(it.taskId==taskId && !it.busy)it.copy(messages=history,error=null)
                    else it
                }
            }catch(_:Throwable){/* retain the last known messages on transient errors */}
        }
    }
    fun sendTaskAi(
        taskId:String,requestId:String,question:String,model:String,
        attachments:List<TaskAiFile>,
        userMessage:String=question,onSuccess:()->Unit={}
    ){
        if(taskAiMutable.value.busy || taskAiMutable.value.taskId!=taskId)return
        taskAiMutable.update{it.copy(busy=true,error=null,requestId=requestId,
            progressStatus="analyzing_request",lastActionReports=emptyList())}
        viewModelScope.launch{
            try{
                val reply=repository.sendTaskAiMessage(taskId,requestId,question,model,
                    attachments,userMessage,onProgress={status->
                        taskAiMutable.update{
                            if(it.taskId==taskId && it.requestId==requestId)
                                it.copy(progressStatus=status) else it
                        }
                    })
                // The server writes both messages before returning; never append them
                // with /messages (which would duplicate the shared chat).
                val history=repository.loadTaskAiHistory(taskId)
                taskAiMutable.update{
                    if(it.taskId==taskId)it.copy(messages=history,busy=false,
                        requestId=null,progressStatus=null,error=null,
                        lastActionReports=reply.actionReports)
                    else it.copy(busy=false,progressStatus=null)
                }
                refreshTaskAiMonitoring(taskId)
                if(reply.taskDataChanged){
                    runCatching{repository.loadTasks()}.onSuccess{tasks->
                        mutable.update{it.copy(tasks=tasks)}
                    }
                }
                runCatching{repository.establishSession()}.onSuccess{user->
                    mutable.update{it.copy(user=user)}
                }
                onSuccess()
            }catch(error:Throwable){
                // The response may have been saved before a network interruption.
                // Synchronize first; resubmission should reuse the same request ID.
                val history=runCatching{repository.loadTaskAiHistory(taskId)}.getOrNull()
                taskAiMutable.update{
                    if(it.taskId==taskId)it.copy(
                        messages=history?:it.messages,busy=false,
                        error=error.userMessage(),requestId=requestId,
                        progressStatus=null)
                    else it.copy(busy=false)
                }
            }
        }
    }
    fun applyTaskAiProposal(taskId:String,proposalId:String,action:String){
        if(taskAiMutable.value.actionBusy)return
        taskAiMutable.update{it.copy(actionBusy=true,error=null)}
        viewModelScope.launch {
            try {
                repository.updateTaskAiProposal(proposalId,action)
                val tasks=repository.loadTasks()
                val history=repository.loadTaskAiHistory(taskId)
                mutable.update{it.copy(tasks=tasks)}
                taskAiMutable.update{if(it.taskId==taskId)it.copy(
                    actionBusy=false,messages=history,error=null)
                    else it.copy(actionBusy=false)}
            }catch(e:Throwable){
                taskAiMutable.update{it.copy(actionBusy=false,error=e.userMessage())}
            }
        }
    }
    fun getTaskAiDocumentLink(id:String,onReady:(String)->Unit){
        viewModelScope.launch {
            try{
                val url=repository.taskAiDocumentLink(id)
                    ?: throw IllegalStateException("Ссылка для скачивания недоступна")
                onReady(url)
            }catch(e:Throwable){
                taskAiMutable.update{it.copy(error=e.userMessage())}
            }
        }
    }
    fun clearTaskAiError(){
        taskAiMutable.update{it.copy(error=null)}
    }

    val state = mutable.asStateFlow()
    val isDark = themes.isDark.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    init { refresh() }
    // AI credit UI runs only while its dialog is visible. Purchases are always
    // initiated through the existing YooKassa backend, never via local balance.
    fun loadCreditCatalog(onResult:(AiCreditCatalog)->Unit,onError:(String)->Unit){
        viewModelScope.launch{
            runCatching{repository.creditCatalog()}.onSuccess(onResult)
                .onFailure{onError(it.userMessage())}
        }
    }
    fun loadCreditStatistics(onResult:(AiCreditUsage)->Unit,onError:(String)->Unit){
        viewModelScope.launch{
            runCatching{repository.creditStatistics()}.onSuccess(onResult)
                .onFailure{onError(it.userMessage())}
        }
    }
    fun beginCreditPurchase(packKey:String,requestId:String,receiptEmail:String?,
        onResult:(AiCreditPurchaseStart)->Unit,onError:(String)->Unit){
        viewModelScope.launch{
            runCatching{repository.purchaseCredits(packKey,requestId,receiptEmail)}
                .onSuccess(onResult).onFailure{onError(it.userMessage())}
        }
    }
    fun checkCreditPurchase(id:String,onResult:(AiCreditPurchase)->Unit,
        onError:(String)->Unit){
        viewModelScope.launch{
            runCatching{repository.purchaseStatus(id)}
                .onSuccess(onResult).onFailure{onError(it.userMessage())}
        }
    }
    fun refreshCreditsBalance(){
        viewModelScope.launch{
            runCatching{repository.establishSession()}.onSuccess{profile->
                mutable.update{it.copy(user=profile)}
            }
        }
    }
    fun refresh() = viewModelScope.launch {
        mutable.value = HomeState(loading = true)
        runCatching { repository.establishSession() to repository.loadWorkspace() }
            .onSuccess { (user, workspace) -> mutable.value = HomeState(false, user, workspace.spheres, workspace.tasks, workspace.habits) }
            .onFailure { mutable.value = HomeState(loading=false, error=it.userMessage()) }
    }
    fun clearTaskError() { mutable.update { it.copy(taskError = null) } }

    private fun mutateTask(action: suspend () -> Unit, done: () -> Unit = {}) {
        if (mutable.value.taskBusy) return
        viewModelScope.launch {
            mutable.update { it.copy(taskBusy = true, taskError = null) }
            try {
                action()
                val updated = repository.loadTasks()
                val profile = runCatching { repository.establishSession() }.getOrNull()
                mutable.update { it.copy(tasks = updated, user = profile ?: it.user, taskBusy = false) }
                done()
            } catch (error: Throwable) {
                mutable.update { it.copy(taskBusy = false, taskError = error.userMessage()) }
            }
        }
    }

    fun saveTask(id: String, changes: JsonObject, done: () -> Unit) =
        mutateTask({ repository.updateTask(id, changes) }, done)

    fun createSubtask(parentId: String, title: String, description: String, dueDate: String?, done: () -> Unit) {
        val parent = mutable.value.tasks.find { it.id == parentId && it.parentTaskId == null }
            ?: run {
                mutable.update { it.copy(taskError = "Основная задача не найдена") }
                return
            }
        mutateTask({ repository.createSubtask(parent, title, description, dueDate) }, done)
    }

    fun changeStatus(id: String, status: TaskStatus, done: () -> Unit = {}) =
        mutateTask({ repository.updateStatus(id, status) }, done)

    fun deleteTask(id: String, done: () -> Unit) =
        mutateTask({ repository.deleteTask(id) }, done)


    fun postponeOverdue() {
        if (mutable.value.taskBusy) return
        viewModelScope.launch {
            mutable.update { it.copy(taskBusy = true, taskError = null) }
            try {
                repository.postponeOverdue(mutable.value.tasks)
                val tasks = repository.loadTasks()
                mutable.update { it.copy(tasks = tasks, taskBusy = false) }
            } catch (error: Throwable) {
                mutable.update { it.copy(taskBusy = false, taskError = error.userMessage()) }
            }
        }
    }
    fun completeHabit(id: String) = viewModelScope.launch {
        if (mutable.value.habitBusy) return@launch
        mutable.update { it.copy(habitBusy = true, taskError = null) }
        try {
            repository.completeHabit(id)
            val habits = repository.loadHabits()
            mutable.update { it.copy(habits = habits, habitBusy = false) }
        } catch (error: Throwable) {
            mutable.update { it.copy(habitBusy = false, taskError = error.userMessage()) }
        }
    }
    fun createHabit(payload: JsonObject, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.habitBusy) return@launch
        mutable.update { it.copy(habitBusy = true, habitError = null) }
        try {
            repository.createHabit(payload)
            val habits=repository.loadHabits()
            mutable.update { it.copy(habits=habits,habitBusy=false) }
            done()
        } catch(error:Throwable) {
            mutable.update { it.copy(habitBusy=false,habitError=error.userMessage()) }
        }
    }
    fun parseCreationRecurrence(text:String,onParsed:(RecurrenceParseResponse)->Unit) {
        if(mutable.value.recurrenceLoading || text.isBlank())return
        viewModelScope.launch {
            mutable.update{it.copy(recurrenceLoading=true,recurrenceError=null)}
            try {
                val parsed=repository.parseTaskRecurrence(text.trim())
                mutable.update{it.copy(recurrenceLoading=false)}
                onParsed(parsed)
            }catch(cause:Throwable){
                mutable.update{it.copy(recurrenceLoading=false,recurrenceError=cause.userMessage())}
            }
        }
    }
    fun clearRecurrenceError() {
        mutable.update{it.copy(recurrenceError=null)}
    }
    fun createDetailedTask(payload:JsonObject,
        subtasks:List<TaskCreationChild>,attachments:List<TaskCreationFile>,done:()->Unit){
        if(mutable.value.taskBusy)return
        viewModelScope.launch {
            mutable.update{it.copy(taskBusy=true,taskError=null)}
            var parent:Task?=null
            try {
                val created=repository.createTopLevelTask(payload)
                parent=created
                for(child in subtasks) {
                    repository.createDraftSubtask(created,child.title,child.description,child.dueDate)
                }
                for(file in attachments){
                    repository.addTaskAttachment(created.id,file.name,file.mime,file.bytes)
                }
                val updated=repository.loadTasks()
                mutable.update{it.copy(taskBusy=false,tasks=updated,taskError=null)}
                done()
            }catch(cause:Throwable){
                val created=parent
                if(created==null){
                    mutable.update{it.copy(taskBusy=false,taskError=cause.userMessage())}
                } else {
                    // Do not let retry create duplicate parent records after a partial failure.
                    val updated=runCatching{repository.loadTasks()}.getOrNull()
                    mutable.update{it.copy(taskBusy=false,
                        tasks=updated?:it.tasks,
                        taskError="Объект создан, но часть подзадач или вложений не удалось добавить: "+
                            cause.userMessage())}
                    done()
                }
            }
        }
    }
    fun createTopLevelTask(payload: JsonObject, done: () -> Unit) =
        mutateTask({repository.createTopLevelTask(payload);Unit},done)
    fun createHabit(name: String) = viewModelScope.launch {
        if (mutable.value.habitBusy || name.isBlank()) return@launch
        mutable.update { it.copy(habitBusy = true, taskError = null) }
        try {
            repository.createHabit(name)
            val habits = repository.loadHabits()
            mutable.update { it.copy(habits = habits, habitBusy = false) }
        } catch (error: Throwable) {
            mutable.update { it.copy(habitBusy = false, taskError = error.userMessage()) }
        }
    }

    fun loadHabitHistory(id: String) = viewModelScope.launch {
        mutable.update { it.copy(habitHistoryId=id,habitHistory=null,habitError=null) }
        try {
            val history=repository.loadHabitHistory(id)
            mutable.update { if(it.habitHistoryId==id)it.copy(habitHistory=history) else it }
        } catch (error:Throwable) {
            mutable.update { if(it.habitHistoryId==id)it.copy(habitError=error.userMessage()) else it }
        }
    }
    fun clearHabitError() { mutable.update { it.copy(habitError=null) } }
    private fun mutateHabit(id:String,change:suspend ()->Habit,done:()->Unit={}) {
        if(mutable.value.habitBusy)return
        viewModelScope.launch {
            mutable.update { it.copy(habitBusy=true,habitError=null) }
            try {
                val habit=change()
                val history=repository.loadHabitHistory(id)
                mutable.update { state ->
                    state.copy(habitBusy=false,
                        habits=state.habits.map { if(it.id==id)habit else it },
                        habitHistory=if(state.habitHistoryId==id)history else state.habitHistory)
                }
                done()
            } catch(error:Throwable) {
                mutable.update { it.copy(habitBusy=false,habitError=error.userMessage()) }
            }
        }
    }
    fun recordHabitDay(id:String,dateKey:String,amount:Int=1) =
        mutateHabit(id,{repository.recordHabit(id,dateKey,amount)})
    fun uncompleteHabitDay(id:String,dateKey:String,amount:Int) =
        mutateHabit(id,{repository.undoHabit(id,dateKey,amount)})
    fun editHabit(id:String,changes:JsonObject,done:()->Unit={}) =
        mutateHabit(id,{repository.editHabit(id,changes)},done)
    fun removeHabit(id:String,finish:Boolean,done:()->Unit) {
        if(mutable.value.habitBusy)return
        viewModelScope.launch {
            mutable.update{it.copy(habitBusy=true,habitError=null)}
            try {
                if(finish)repository.finishHabit(id) else repository.deleteHabit(id)
                val refreshed=repository.loadHabits()
                mutable.update { it.copy(habits=refreshed,habitBusy=false,
                    habitHistory=if(it.habitHistoryId==id)null else it.habitHistory) }
                done()
            } catch(error:Throwable) {
                mutable.update { it.copy(habitBusy=false,habitError=error.userMessage()) }
            }
        }
    }

    fun loadNotes() = viewModelScope.launch {
        mutable.update { it.copy(notesLoading = true, notesError = null) }
        try {
            val (notes,groups)=coroutineScope {
                val noteRequest=async{repository.loadNotes()}
                val groupRequest=async{repository.loadNoteGroups()}
                noteRequest.await() to groupRequest.await()
            }
            mutable.update { it.copy(notes = notes,noteGroups=groups, notesLoading = false) }
        } catch (error: Throwable) {
            mutable.update { it.copy(notesLoading = false, notesError = error.userMessage()) }
        }
    }
    fun createNote(title:String,content:String,done:()->Unit) =
        createNote(title,content,null,done)
    fun createNote(title: String, content: String, groupId: String?, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.notesBusy) return@launch
        mutable.update { it.copy(notesBusy = true, notesError = null) }
        try {
            repository.createNote(title, content,groupId)
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesBusy = false) }
            done()
        } catch (error: Throwable) {
            mutable.update { it.copy(notesBusy = false, notesError = error.userMessage()) }
        }
    }
    fun saveNote(id:String,title:String,content:String,done:()->Unit) =
        saveNote(id,title,content,null,done)
    fun saveNote(id: String, title: String, content: String, groupId:String?, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.notesBusy) return@launch
        mutable.update { it.copy(notesBusy = true, notesError = null) }
        try {
            repository.saveNote(id, title, content,groupId)
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesBusy = false) }
            done()
        } catch (error: Throwable) {
            mutable.update { it.copy(notesBusy = false, notesError = error.userMessage()) }
        }
    }
    fun assignNoteGroup(id:String,groupId:String?,done:()->Unit={})=viewModelScope.launch {
        if(mutable.value.notesBusy)return@launch
        mutable.update{it.copy(notesBusy=true,notesError=null)}
        try {
            val note=repository.assignNoteGroup(id,groupId)
            mutable.update{state->state.copy(notes=state.notes.map{
                if(it.id==id)note else it},notesBusy=false)}
            done()
        } catch(error:Throwable){
            mutable.update{it.copy(notesBusy=false,notesError=error.userMessage())}
        }
    }
    fun saveNoteGroup(id:String?,name:String,color:String,done:()->Unit={})=viewModelScope.launch {
        if(mutable.value.notesBusy||name.isBlank())return@launch
        mutable.update{it.copy(notesBusy=true,notesError=null)}
        try {
            if(id==null)repository.createNoteGroup(name.trim(),color)
            else repository.updateNoteGroup(id,name.trim(),color)
            val groups=repository.loadNoteGroups()
            mutable.update{it.copy(noteGroups=groups,notesBusy=false)}
            done()
        }catch(error:Throwable){
            mutable.update{it.copy(notesBusy=false,notesError=error.userMessage())}
        }
    }
    fun deleteNoteGroup(id:String,done:()->Unit={})=viewModelScope.launch {
        if(mutable.value.notesBusy)return@launch
        mutable.update{it.copy(notesBusy=true,notesError=null)}
        try {
            repository.deleteNoteGroup(id)
            val groups=repository.loadNoteGroups()
            val notes=repository.loadNotes()
            mutable.update{it.copy(noteGroups=groups,notes=notes,notesBusy=false)}
            done()
        }catch(error:Throwable){
            mutable.update{it.copy(notesBusy=false,notesError=error.userMessage())}
        }
    }
    fun deleteNote(id: String, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.notesBusy) return@launch
        mutable.update { it.copy(notesBusy = true, notesError = null) }
        try {
            repository.deleteNote(id)
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesBusy = false) }
            done()
        } catch (error: Throwable) {
            mutable.update { it.copy(notesBusy = false, notesError = error.userMessage()) }
        }
    }


    fun loadTaskAttachments(taskId: String) = viewModelScope.launch {
        mutable.update { it.copy(attachmentTaskId = taskId,
            taskAttachments = emptyList(), taskAttachmentsBusy = false, taskAttachmentsError = null) }
        try {
            val files = repository.loadTaskAttachments(taskId)
            mutable.update { if (it.attachmentTaskId == taskId)
                it.copy(taskAttachments = files) else it }
        } catch (cause: Throwable) {
            mutable.update { if (it.attachmentTaskId == taskId)
                it.copy(taskAttachmentsError = cause.userMessage()) else it }
        }
    }
    fun uploadTaskAttachment(taskId: String, name: String, mimeType: String, bytes: ByteArray) {
        if (mutable.value.taskAttachmentsBusy || mutable.value.attachmentTaskId != taskId) return
        viewModelScope.launch {
            mutable.update { it.copy(taskAttachmentsBusy = true, taskAttachmentsError = null) }
            try {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    repository.addTaskAttachment(taskId, name, mimeType, bytes)
                }
                val files = repository.loadTaskAttachments(taskId)
                mutable.update { if(it.attachmentTaskId == taskId)
                    it.copy(taskAttachments = files, taskAttachmentsBusy = false) else it }
            } catch (cause: Throwable) {
                mutable.update { if(it.attachmentTaskId == taskId)
                    it.copy(taskAttachmentsBusy = false, taskAttachmentsError = cause.userMessage()) else it }
            }
        }
    }
    fun removeTaskAttachment(taskId: String, attachmentId: String) {
        if (mutable.value.taskAttachmentsBusy || mutable.value.attachmentTaskId != taskId) return
        viewModelScope.launch {
            mutable.update { it.copy(taskAttachmentsBusy = true, taskAttachmentsError = null) }
            try {
                repository.removeTaskAttachment(taskId, attachmentId)
                val files = repository.loadTaskAttachments(taskId)
                mutable.update { if(it.attachmentTaskId == taskId)
                    it.copy(taskAttachments = files, taskAttachmentsBusy = false) else it }
            } catch (cause: Throwable) {
                mutable.update { if(it.attachmentTaskId == taskId)
                    it.copy(taskAttachmentsBusy = false, taskAttachmentsError = cause.userMessage()) else it }
            }
        }
    }
    fun openTaskAttachmentLink(taskId: String, attachmentId: String, open: (String) -> Unit) =
        viewModelScope.launch {
            try { open(repository.taskAttachmentLink(taskId, attachmentId)) }
            catch (cause: Throwable) {
                mutable.update { if (it.attachmentTaskId == taskId)
                    it.copy(taskAttachmentsError = cause.userMessage()) else it }
            }
        }

    fun search(value: String) { mutable.update { it.copy(query=value) } }
    fun setDark(value: Boolean) { viewModelScope.launch { themes.setDark(value) } }
    fun clearAuthError() { mutable.update { it.copy(authError=null) } }
    fun login(login: String, password: String, done: () -> Unit) = authAction(done) { repository.login(login.trim(), password) }
    fun register(login: String, password: String, name: String, consent: Boolean, done: () -> Unit) = authAction(done) { repository.register(login.trim(), password, name.trim(), consent) }
    private fun authAction(done: () -> Unit, action: suspend () -> CurrentUser) = viewModelScope.launch {
        mutable.update { it.copy(authBusy=true, authError=null) }
        runCatching { action() to repository.loadWorkspace() }.onSuccess { (user, workspace) -> mutable.value=HomeState(false,user,workspace.spheres,workspace.tasks,workspace.habits); done() }.onFailure { error -> mutable.update { it.copy(authBusy=false,authError=error.userMessage()) } }
    }
    fun logout(done: () -> Unit) = viewModelScope.launch {
        mutable.value = HomeState(loading=true)
        runCatching { repository.logout(); repository.establishSession() to repository.loadWorkspace() }.onSuccess { (user,w) -> mutable.value=HomeState(false,user,w.spheres,w.tasks,w.habits); done() }.onFailure { mutable.value=HomeState(false,error=it.userMessage()) }
    }
    class Factory(private val repo: WorkspaceRepository, private val themes: ThemePreferences): ViewModelProvider.Factory { override fun <T: ViewModel> create(modelClass: Class<T>): T { @Suppress("UNCHECKED_CAST") return HomeViewModel(repo,themes) as T } }
}
