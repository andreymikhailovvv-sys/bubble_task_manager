package ru.planirovych.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import ru.planirovych.app.data.model.*
import ru.planirovych.app.data.repository.WorkspaceRepository
import ru.planirovych.app.data.repository.userMessage
import ru.planirovych.app.ui.theme.ThemePreferences

data class HomeState(val loading: Boolean = true, val user: CurrentUser? = null, val spheres: List<Sphere> = emptyList(), val tasks: List<Task> = emptyList(), val habits: List<Habit> = emptyList(), val query: String = "", val error: String? = null, val authError: String? = null, val authBusy: Boolean = false)
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
