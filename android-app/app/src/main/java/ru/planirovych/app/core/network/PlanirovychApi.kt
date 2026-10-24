package ru.planirovych.app.core.network

import kotlinx.serialization.json.JsonObject
import retrofit2.http.DELETE
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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
