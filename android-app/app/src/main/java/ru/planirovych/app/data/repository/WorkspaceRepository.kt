package ru.planirovych.app.data.repository

import kotlinx.coroutines.async
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import ru.planirovych.app.core.network.PlanirovychApi
import ru.planirovych.app.data.model.*

class WorkspaceRepository(private val api: PlanirovychApi) {
    suspend fun establishSession() = api.me().user
    suspend fun loadWorkspace() = coroutineScope {
        val spheres = async { api.spheres() }; val tasks = async { api.tasks() }; val habits = async { api.habits() }
        Workspace(spheres.await(), tasks.await(), habits.await())
    }
    suspend fun creditCatalog():AiCreditCatalog=api.creditPacks()
    suspend fun creditStatistics():AiCreditUsage=api.creditUsage().statistics
    suspend fun purchaseCredits(packKey:String,requestId:String,email:String?):AiCreditPurchaseStart =
        api.startCreditPurchase(packKey,buildJsonObject{
            put("clientRequestId",requestId)
            put("clientSurface","web")
            email?.takeIf{it.isNotBlank()}?.let{put("receiptEmail",it)}
        })
    suspend fun purchaseStatus(purchaseId:String):AiCreditPurchase =
        api.creditPurchaseStatus(purchaseId).purchase

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

    private fun kotlinx.serialization.json.JsonObject.optString(key:String):String? =
        (this[key] as? kotlinx.serialization.json.JsonPrimitive)
            ?.takeUnless{it is kotlinx.serialization.json.JsonNull}?.contentOrNull

    fun readTaskAiMessage(item:kotlinx.serialization.json.JsonObject):TaskAiChatMessage{
        val sources=(item["webSources"] as? kotlinx.serialization.json.JsonArray)
            .orEmpty().mapNotNull {source->
                val obj=source as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
                val url=obj.optString("url")?:return@mapNotNull null
                (obj.optString("title")?:url) to url
            }
        return TaskAiChatMessage(
            id=item.optString("id"),role=item.optString("role")?:"assistant",
            content=item.optString("content").orEmpty(),
            createdAt=item.optString("createdAt"),
            authorName=item.optString("authorName"),
            authorColor=item.optString("authorColor"),
            recipientName=item.optString("recipientName"),
            messageKind=item.optString("messageKind"),
            creditsSpentMilli=item.optString("creditsSpentMilli")?.toLongOrNull(),
            webSources=sources,
            taskProposal=item["taskProposal"] as? kotlinx.serialization.json.JsonObject,
            generatedDocument=item["generatedDocument"] as? kotlinx.serialization.json.JsonObject,
            telegramSendDraft=item["telegramSendDraft"] as? kotlinx.serialization.json.JsonObject,
            telegramReadDraft=item["telegramReadDraft"] as? kotlinx.serialization.json.JsonObject
        )
    }
    suspend fun loadSystemNotifications():AndroidSystemNotificationFeed =
        api.systemNotifications()

    suspend fun loadGeneralAiProjects():List<GeneralAiProject> =
        parseGeneralAiProjects(api.generalAiProjects())

    suspend fun persistGeneralAiProjects(projects:List<GeneralAiProject>):List<GeneralAiProject> =
        parseGeneralAiProjects(api.saveGeneralAiProjects(buildJsonObject{
            put("projects",JsonArray(projects.map{it.toJson()}))
        }))

    suspend fun loadGeneralAiThread(projectId:String,chatId:String):List<JsonObject> =
        (api.generalAiThread(projectId,chatId)["messages"] as? JsonArray)
            .orEmpty().mapNotNull{it as? JsonObject}

    suspend fun loadQuickAiHistory():List<JsonObject> =
        (api.generalAiQuickHistory(java.time.ZoneId.systemDefault().id)["messages"]
            as? JsonArray).orEmpty().mapNotNull{it as? JsonObject}

    suspend fun askGeneralAi(
        project:GeneralAiProject,thread:GeneralAiThread,
        history:List<JsonObject>,requestId:String,question:String,
        attachments:List<TaskAiFile>,onProgress:(String)->Unit
    ):JsonObject {
        val payload=buildJsonObject {
            put("clientRequestId",requestId)
            put("question",question)
            put("model",thread.model ?: "gpt-6-luna")
            put("projectTitle",if(thread.id==QUICK_AI_THREAD_ID)
                PERSONAL_AI_PROJECT_TITLE else project.title)
            put("chatTitle",if(thread.id==QUICK_AI_THREAD_ID)
                QUICK_AI_TITLE else thread.title)
            put("projectId",project.id)
            put("chatId",thread.id)
            put("clientSurface","miniapp")
            put("userTimeZone",java.time.ZoneId.systemDefault().id)
            put("history",JsonArray(if(thread.id==QUICK_AI_THREAD_ID)
                history.filter{it.aiString("monitoringTaskId").isBlank()}.takeLast(20)
                    else history))
            if(attachments.isNotEmpty()){
                put("attachments",JsonArray(attachments.map{file->
                    buildJsonObject{
                        put("name",file.name)
                        put("mimeType",file.mimeType)
                        put("size",file.bytes.size)
                        put("contentBase64",android.util.Base64.encodeToString(
                            file.bytes,android.util.Base64.NO_WRAP))
                    }
                }))
            }
        }
        return withContext(Dispatchers.IO){
            var result:JsonObject?=null
            api.streamGeneralAi(payload).use{body->
                body.charStream().buffered().forEachLine{line->
                    if(line.isBlank())return@forEachLine
                    val event=Json.parseToJsonElement(line) as? JsonObject
                        ?:throw IllegalStateException("Некорректное событие ИИ")
                    when(event.aiString("type")){
                        "status"->event.aiString("status").takeIf{it.isNotBlank()}
                            ?.let(onProgress)
                        "result"->result=event["result"] as? JsonObject
                        "error"->throw IllegalStateException(
                            event.aiString("message","Ошибка запроса ИИ"))
                    }
                }
            }
            result?:throw IllegalStateException("Сервер не вернул ответ ИИ")
        }
    }

    suspend fun loadTaskAiHistory(id:String):List<TaskAiChatMessage>{
        val raw=api.taskAiHistory(id,java.time.ZoneId.systemDefault().id)
        val rows=raw["messages"] as? kotlinx.serialization.json.JsonArray
            ?: return emptyList()
        return rows.mapNotNull { (it as? kotlinx.serialization.json.JsonObject)
            ?.let(::readTaskAiMessage) }
    }
    suspend fun sendTaskAiMessage(
        id:String,requestId:String,question:String,model:String,
        attachments:List<TaskAiFile>,userMessage:String=question,
        onProgress:(String)->Unit={}
    ):TaskAiReply {
        val payload=buildJsonObject {
            put("clientRequestId",requestId)
            put("question",question)
            put("userMessage",userMessage)
            put("model",model)
            put("mode",if(model=="gpt-6.1-sol")"smart" else "fast")
            put("clientSurface","miniapp")
            put("interactionContext","chat")
            put("userTimeZone",java.time.ZoneId.systemDefault().id)
            if(attachments.isNotEmpty())put("attachments",kotlinx.serialization.json.buildJsonArray{
                attachments.forEach{file ->
                    add(buildJsonObject{
                        put("name",file.name)
                        put("mimeType",file.mimeType)
                        put("size",file.bytes.size)
                        put("contentBase64",android.util.Base64.encodeToString(
                            file.bytes,android.util.Base64.NO_WRAP))
                    })
                }
            })
        }
        // Mini App uses NDJSON. Status events are emitted by the actual
        // server-side tools and never inferred from a local animation/timer.
        val response=withContext(Dispatchers.IO) {
            var result:JsonObject?=null
            api.streamTaskAi(id,payload).use{body->
                body.charStream().buffered().forEachLine{line->
                    if(line.isBlank())return@forEachLine
                    val event=Json.parseToJsonElement(line) as? JsonObject
                        ?: throw IllegalStateException("Некорректный ответ ИИ")
                    when(event.optString("type")){
                        "status"->event.optString("status")?.let(onProgress)
                        "result"->result=event["result"] as? JsonObject
                        "error"->throw IllegalStateException(
                            event.optString("message")?:"Ошибка запроса ИИ")
                    }
                }
            }
            result ?: throw IllegalStateException("Сервер не вернул ответ ИИ")
        }
        val summary=(response["actionReports"] as? kotlinx.serialization.json.JsonArray)
            .orEmpty().mapNotNull{
                (it as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
            }
        val changed=(response["taskDataChanged"] as? kotlinx.serialization.json.JsonPrimitive)
            ?.booleanOrNull?:false
        return TaskAiReply(response.optString("answer").orEmpty(),changed,summary,response)
    }

    suspend fun loadTaskMonitoringTriggers(id:String):List<TaskMonitoringTrigger> =
        api.taskMonitoringTriggers(id)
    suspend fun loadTaskMonitoringStatuses(id:String):List<TaskMonitoringStatus> =
        api.taskMonitoringStatuses(id)

    suspend fun updateTaskAiProposal(id:String,action:String){
        val empty=buildJsonObject{}
        when(action){
            "approve"->api.approveTaskAiProposal(id,empty)
            "reject"->api.rejectTaskAiProposal(id,empty)
            "undo"->api.undoTaskAiProposal(id,empty)
            else->throw IllegalArgumentException("Неизвестное действие")
        }
    }
    suspend fun taskAiDocumentLink(id:String):String? =
        api.taskAiDocumentLink(id).optString("url")
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
    suspend fun parseTaskRecurrence(text:String):RecurrenceParseResponse =
        api.parseRecurrence(buildJsonObject {
            put("text",text)
            put("userTimeZone",java.time.ZoneId.systemDefault().id)
        })
    suspend fun createDraftSubtask(parent:Task,title:String,description:String,dueDate:String?) =
        createSubtask(parent,title,description,dueDate)
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
