package ru.planirovych.app.data.repository

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import ru.planirovych.app.core.network.PlanirovychApi
import ru.planirovych.app.data.model.*

class WorkspaceRepository(private val api: PlanirovychApi) {
    suspend fun establishSession() = api.me().user
    suspend fun loadWorkspace() = coroutineScope {
        val spheres = async { api.spheres() }; val tasks = async { api.tasks() }; val habits = async { api.habits() }
        Workspace(spheres.await(), tasks.await(), habits.await())
    }
    suspend fun login(login: String, password: String) = api.login(LoginRequest(login, password)).user
    suspend fun register(login: String, password: String, name: String, consent: Boolean) = api.register(RegisterRequest(login, password, name.ifBlank { null }, consent)).user
    suspend fun logout() { api.logout() }
}

data class Workspace(val spheres: List<Sphere>, val tasks: List<Task>, val habits: List<Habit>)

fun Throwable.userMessage(): String {
    if (this is HttpException) {
        val raw = runCatching { response()?.errorBody()?.string().orEmpty() }.getOrDefault("")
        val message = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(raw).jsonObject.let { it["error"] ?: it["message"] }?.jsonPrimitive?.content }.getOrNull()
        return message?.takeIf { it.isNotBlank() } ?: if (code() >= 500) "Сервис временно недоступен. Попробуйте ещё раз" else "Ошибка сервера: HTTP ${code()}"
    }
    return if (this is java.io.IOException) "Нет соединения с интернетом. Проверьте сеть и повторите попытку" else message ?: "Не удалось загрузить данные"
}
