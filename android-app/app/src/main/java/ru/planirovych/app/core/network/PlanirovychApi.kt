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
    @PATCH("api/tasks/{id}") suspend fun updateTask(@Path("id") id: String, @Body changes: JsonObject): Task
    @POST("api/tasks") suspend fun createTask(@Body payload: JsonObject): Task
    @DELETE("api/tasks/{id}") suspend fun deleteTask(@Path("id") id: String, @Query("scope") scope: String = "me"): OkResponse
    @GET("api/habits") suspend fun habits(): List<Habit>
}
