package ru.planirovych.app.core.network

import kotlinx.serialization.json.JsonObject
import retrofit2.http.DELETE
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Headers
import retrofit2.http.PUT
import retrofit2.http.Streaming
import okhttp3.ResponseBody
import ru.planirovych.app.data.model.*

interface PlanirovychApi {
    @GET("api/auth/me") suspend fun me(): UserResponse
    @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): UserResponse
    @POST("api/auth/register") suspend fun register(@Body request: RegisterRequest): UserResponse
    @POST("api/auth/logout") suspend fun logout(): OkResponse
    @GET("api/spheres") suspend fun spheres(): List<Sphere>
    @GET("api/tasks") suspend fun tasks(): List<Task>
    @POST("api/ai/parse-recurrence")
    suspend fun parseRecurrence(@Body payload: JsonObject): RecurrenceParseResponse
    @PATCH("api/tasks/{id}") suspend fun updateTask(@Path("id") id: String, @Body changes: JsonObject): Task
    @POST("api/tasks") suspend fun createTask(@Body payload: JsonObject): Task
    @DELETE("api/tasks/{id}") suspend fun deleteTask(@Path("id") id: String, @Query("scope") scope: String = "me"): OkResponse

    @GET("api/tasks/{id}/attachments")
    suspend fun taskAttachments(@Path("id") id: String): List<TaskAttachment>
    @POST("api/tasks/{id}/attachments")
    suspend fun addTaskAttachment(@Path("id") id: String, @Body payload: JsonObject): TaskAttachment
    @DELETE("api/tasks/{id}/attachments/{attachmentId}")
    suspend fun removeTaskAttachment(@Path("id") id: String,
        @Path("attachmentId") attachmentId: String): OkResponse
    @POST("api/tasks/{id}/attachments/{attachmentId}/download-link")
    suspend fun taskAttachmentLink(@Path("id") id: String,
        @Path("attachmentId") attachmentId: String): TaskAttachmentLink
    // The native general chat uses the exact same project tree and thread API
    // as the web client and Telegram Mini App.
    @GET("api/system-notifications")
    suspend fun systemNotifications():AndroidSystemNotificationFeed
    @POST("api/system-notifications/android-devices")
    suspend fun registerAndroidPushDevice(@Body data: JsonObject):OkResponse
    @retrofit2.http.HTTP(method="DELETE", path="api/system-notifications/android-devices", hasBody=true)
    suspend fun unregisterAndroidPushDevice(@Body data:JsonObject):OkResponse

    @GET("api/ai-chat/projects")
    suspend fun generalAiProjects():JsonObject
    @PUT("api/ai-chat/projects")
    suspend fun saveGeneralAiProjects(@Body payload:JsonObject):JsonObject
    @GET("api/ai-chat/projects/{projectId}/chats/{chatId}/messages")
    suspend fun generalAiThread(@Path("projectId") projectId:String,
        @Path("chatId") chatId:String):JsonObject
    @GET("api/ai-general-chat")
    suspend fun generalAiQuickHistory(@Query("userTimeZone") timeZone:String):JsonObject
    @Streaming
    @Headers("Accept: application/x-ndjson")
    @POST("api/ai-chat")
    suspend fun streamGeneralAi(@Body payload:JsonObject):ResponseBody

    @GET("api/tasks/{id}/ai-chat")
    suspend fun taskAiHistory(@Path("id") taskId:String,
        @Query("userTimeZone") userTimeZone:String): JsonObject
    @POST("api/tasks/{id}/ai-chat")
    suspend fun sendTaskAi(@Path("id") taskId:String,@Body payload:JsonObject): JsonObject
    @Streaming
    @Headers("Accept: application/x-ndjson")
    @POST("api/tasks/{id}/ai-chat")
    suspend fun streamTaskAi(@Path("id") taskId:String,@Body payload:JsonObject):ResponseBody
    @GET("api/tasks/{id}/monitoring/triggers")
    suspend fun taskMonitoringTriggers(@Path("id") taskId:String):List<TaskMonitoringTrigger>
    @DELETE("api/tasks/{id}/monitoring/triggers/{triggerId}")
    suspend fun cancelTaskMonitoringTrigger(@Path("id") taskId:String,
        @Path("triggerId") triggerId:String):JsonObject
    @GET("api/tasks/{id}/monitoring/statuses")
    suspend fun taskMonitoringStatuses(@Path("id") taskId:String):List<TaskMonitoringStatus>

    @POST("api/ai/task-proposals/{id}/approve")
    suspend fun approveTaskAiProposal(@Path("id") id:String,@Body payload:JsonObject):JsonObject
    @POST("api/ai/task-proposals/{id}/reject")
    suspend fun rejectTaskAiProposal(@Path("id") id:String,@Body payload:JsonObject):JsonObject
    @POST("api/ai/task-proposals/{id}/undo")
    suspend fun undoTaskAiProposal(@Path("id") id:String,@Body payload:JsonObject):JsonObject
    @POST("api/ai-documents/{id}/download-link")
    suspend fun taskAiDocumentLink(@Path("id") id:String):JsonObject
    @GET("api/credit-packs")
    suspend fun creditPacks():AiCreditCatalog
    @GET("api/credits/statistics")
    suspend fun creditUsage():AiCreditUsageResponse
    @POST("api/payments/yookassa/credit-packs/{packKey}")
    suspend fun startCreditPurchase(@Path("packKey") packKey:String,
        @Body payload:JsonObject):AiCreditPurchaseStart
    @GET("api/payments/yookassa/purchases/{id}")
    suspend fun creditPurchaseStatus(@Path("id") purchaseId:String):AiCreditPurchaseStatus

    @GET("api/habits") suspend fun habits(): List<Habit>
    @POST("api/habits") suspend fun createHabit(@Body payload: JsonObject): Habit
    @POST("api/habits/{id}/complete") suspend fun completeHabit(@Path("id") id: String, @Body payload: JsonObject): Habit
    @GET("api/habits/{id}/history") suspend fun habitHistory(@Path("id") id: String): List<HabitStat>
    @PATCH("api/habits/{id}") suspend fun updateHabit(@Path("id") id: String,@Body payload: JsonObject): Habit
    @POST("api/habits/{id}/uncomplete") suspend fun uncompleteHabit(@Path("id") id: String,@Body payload: JsonObject): Habit
    @POST("api/habits/{id}/finish") suspend fun finishHabit(@Path("id") id: String): JsonObject
    @DELETE("api/habits/{id}") suspend fun deleteHabit(@Path("id") id: String): JsonObject
    @GET("api/note-groups") suspend fun noteGroups(): List<StandaloneNoteGroup>
    @POST("api/note-groups") suspend fun createNoteGroup(@Body payload: JsonObject): StandaloneNoteGroup
    @PATCH("api/note-groups/{id}") suspend fun updateNoteGroup(@Path("id") id: String,@Body payload: JsonObject): StandaloneNoteGroup
    @DELETE("api/note-groups/{id}") suspend fun deleteNoteGroup(@Path("id") id: String): OkResponse
    @GET("api/notes") suspend fun notes(): List<StandaloneNote>
    @POST("api/notes") suspend fun createNote(@Body payload: JsonObject): StandaloneNote
    @PATCH("api/notes/{id}") suspend fun updateNote(@Path("id") id: String, @Body payload: JsonObject): StandaloneNote
    @DELETE("api/notes/{id}") suspend fun deleteNote(@Path("id") id: String): OkResponse
}
