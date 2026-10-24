package ru.planirovych.app.core.network

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import ru.planirovych.app.BuildConfig

object NetworkModule {
    fun api(context: Context): PlanirovychApi {
        val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
        val client = OkHttpClient.Builder()
            .cookieJar(PersistentCookieJar(context))
            // Task AI responses can take several minutes. All other API calls
            // retain OkHttp's regular timeouts.
            .addInterceptor { chain ->
                val taskAiSend=chain.request().method=="POST" &&
                    Regex(".*/api/tasks/[^/]+/ai-chat$").matches(
                        chain.request().url.encodedPath)
                if(taskAiSend)chain.withReadTimeout(240,TimeUnit.SECONDS)
                    .proceed(chain.request())
                else chain.proceed(chain.request())
            }
            .addInterceptor(HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE })
            .build()
        return Retrofit.Builder().baseUrl(BuildConfig.API_BASE_URL).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build().create(PlanirovychApi::class.java)
    }
}
