package ru.planirovych.app.core.network

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import ru.planirovych.app.BuildConfig

object NetworkModule {
    fun api(context: Context): PlanirovychApi {
        val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
        val client = OkHttpClient.Builder()
            .cookieJar(PersistentCookieJar(context))
            .addInterceptor(HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE })
            .build()
        return Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(PlanirovychApi::class.java)
    }
}
