package ru.planirovych.app.data.repository

import kotlinx.coroutines.async
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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
    suspend fun loadTasks(): List<Task> = api.tasks()
    suspend fun updateTask(id: String, changes: JsonObject): Task = api.updateTask(id, changes)
    suspend fun updateStatus(id: String, status: TaskStatus): Task =
        api.updateTask(id, buildJsonObject {
            put("status", status.name)
            // Mirror MiniApp's default collaborative scope: act on my own copy.
            put("collaborationScope", "me")
        })
    suspend fun createSubtask(parent: Task, title: String, description: String, dueDate: String?): Task =
        api.createTask(buildJsonObject {
            put("title", title)
            put("parentTaskId", parent.id)
            if (description.isBlank()) put("description", JsonNull) else put("description", description)
            if (dueDate == null) put("dueDate", JsonNull) else put("dueDate", dueDate)
            if (parent.sphereId == null) put("sphereId", JsonNull) else put("sphereId", parent.sphereId)
            put("importance", parent.importance.coerceIn(1, 5))
        })
    suspend fun deleteTask(id: String) { api.deleteTask(id, "me") }
    suspend fun postponeOverdue(tasks: List<Task>) {
        // Same calendar-day replacement as the Mini App; never move events/reminders.
        val today = java.time.LocalDate.now()
        tasks.filter { it.status != TaskStatus.DONE && it.taskType == TaskType.TASK }
            .forEach { task ->
                val due = runCatching { java.time.OffsetDateTime.parse(task.dueDate) }.getOrNull()
                    ?: return@forEach
                if (!due.toInstant().isBefore(java.time.Instant.now())) return@forEach
                val local = due.atZoneSameInstant(java.time.ZoneId.systemDefault())
                val next = local.withYear(today.year).withMonth(today.monthValue)
                    .withDayOfMonth(today.dayOfMonth).toInstant().toString()
                api.updateTask(task.id, buildJsonObject { put("dueDate", next) })
            }
    }

    suspend fun loadTaskAttachments(taskId: String) = api.taskAttachments(taskId)
    suspend fun addTaskAttachment(taskId: String, name: String, mime: String, bytes: ByteArray) =
        api.addTaskAttachment(taskId, buildJsonObject {
            put("name", name)
            put("mimeType", mime)
            put("size", bytes.size)
            put("contentBase64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
        })
    suspend fun removeTaskAttachment(taskId: String, attachmentId: String) {
        api.removeTaskAttachment(taskId, attachmentId)
    }
    suspend fun taskAttachmentLink(taskId: String, attachmentId: String) =
        api.taskAttachmentLink(taskId, attachmentId).url
    suspend fun loadHabits() = api.habits()
    suspend fun loadHabitHistory(id: String) = api.habitHistory(id)
    suspend fun recordHabit(id: String,dateKey: String,amount: Int): Habit =
        api.completeHabit(id,buildJsonObject {
            put("dateKey",dateKey)
            put("amount",amount)
            val recordedDate=java.time.LocalDate.parse(dateKey).atTime(12,0)
                .atZone(java.time.ZoneId.systemDefault()).toInstant().toString()
            put("completedAt",recordedDate)
        })
    suspend fun undoHabit(id: String,dateKey: String,amount: Int): Habit =
        api.uncompleteHabit(id,buildJsonObject { put("dateKey",dateKey);put("amount",amount) })
    suspend fun editHabit(id: String,changes: JsonObject): Habit = api.updateHabit(id,changes)
    suspend fun finishHabit(id: String) { api.finishHabit(id) }
    suspend fun deleteHabit(id: String) { api.deleteHabit(id) }
    suspend fun completeHabit(id: String) { api.completeHabit(id, buildJsonObject { put("dateKey", java.time.LocalDate.now().toString()) }) }
    suspend fun createHabit(payload: JsonObject): Habit = api.createHabit(payload)
    suspend fun createTopLevelTask(payload: JsonObject): Task = api.createTask(payload)
    suspend fun createHabit(name: String) {
        api.createHabit(buildJsonObject {
            put("name", name.trim())
            put("icon", "✨")
            put("color", "#22c55e")
            put("targetCount", 1)
            put("recurrenceType", "DAILY")
        })
    }
    suspend fun loadNotes() = api.notes()
    suspend fun loadNoteGroups() = api.noteGroups()
    suspend fun createNoteGroup(name: String, color: String) =
        api.createNoteGroup(buildJsonObject { put("name",name);put("color",color) })
    suspend fun updateNoteGroup(id:String,name:String,color:String) =
        api.updateNoteGroup(id,buildJsonObject { put("name",name);put("color",color) })
    suspend fun deleteNoteGroup(id:String) { api.deleteNoteGroup(id) }
    suspend fun assignNoteGroup(id:String,groupId:String?) =
        api.updateNote(id,buildJsonObject {
            if(groupId==null)put("groupId",JsonNull) else put("groupId",groupId)
        })
    suspend fun createNote(title: String, content: String,groupId:String?=null) =
        api.createNote(buildJsonObject {
            put("title", title); put("content", content)
            if(groupId==null)put("groupId",JsonNull)else put("groupId",groupId)
        })
    suspend fun saveNote(id: String, title: String, content: String,groupId:String?=null) =
        api.updateNote(id, buildJsonObject {
            put("title", title); put("content", content)
            if(groupId==null)put("groupId",JsonNull)else put("groupId",groupId)
        })
    suspend fun deleteNote(id: String) { api.deleteNote(id) }
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
