package ru.planirovych.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.JsonObject
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
    val state = mutable.asStateFlow()
    val isDark = themes.isDark.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    init { refresh() }
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
                parent=repository.createTopLevelTask(payload)
                for(child in subtasks) {
                    repository.createDraftSubtask(parent,child.title,child.description,child.dueDate)
                }
                for(file in attachments){
                    repository.addTaskAttachment(parent.id,file.name,file.mime,file.bytes)
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
