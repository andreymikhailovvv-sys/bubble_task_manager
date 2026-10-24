package ru.planirovych.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.JsonObject
import kotlinx.coroutines.launch
import ru.planirovych.app.data.model.*
import ru.planirovych.app.data.repository.WorkspaceRepository
import ru.planirovych.app.data.repository.userMessage
import ru.planirovych.app.ui.theme.ThemePreferences

data class HomeState(val loading: Boolean = true, val user: CurrentUser? = null, val spheres: List<Sphere> = emptyList(), val tasks: List<Task> = emptyList(), val habits: List<Habit> = emptyList(), val query: String = "", val error: String? = null, val authError: String? = null, val authBusy: Boolean = false, val taskBusy: Boolean = false, val taskError: String? = null, val habitBusy: Boolean = false, val notes: List<StandaloneNote> = emptyList(), val notesLoading: Boolean = false, val notesBusy: Boolean = false, val notesError: String? = null)
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
    fun loadNotes() = viewModelScope.launch {
        mutable.update { it.copy(notesLoading = true, notesError = null) }
        try {
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesLoading = false) }
        } catch (error: Throwable) {
            mutable.update { it.copy(notesLoading = false, notesError = error.userMessage()) }
        }
    }
    fun createNote(title: String, content: String, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.notesBusy) return@launch
        mutable.update { it.copy(notesBusy = true, notesError = null) }
        try {
            repository.createNote(title, content)
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesBusy = false) }
            done()
        } catch (error: Throwable) {
            mutable.update { it.copy(notesBusy = false, notesError = error.userMessage()) }
        }
    }
    fun saveNote(id: String, title: String, content: String, done: () -> Unit) = viewModelScope.launch {
        if (mutable.value.notesBusy) return@launch
        mutable.update { it.copy(notesBusy = true, notesError = null) }
        try {
            repository.saveNote(id, title, content)
            val notes = repository.loadNotes()
            mutable.update { it.copy(notes = notes, notesBusy = false) }
            done()
        } catch (error: Throwable) {
            mutable.update { it.copy(notesBusy = false, notesError = error.userMessage()) }
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
