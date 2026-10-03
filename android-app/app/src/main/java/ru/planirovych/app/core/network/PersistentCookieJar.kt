package ru.planirovych.app.core.network

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class PersistentCookieJar(context: Context) : CookieJar {
    @Serializable private data class StoredCookie(val name: String, val value: String, val expiresAt: Long, val domain: String, val path: String, val secure: Boolean, val httpOnly: Boolean, val hostOnly: Boolean)
    private val preferences = context.getSharedPreferences("server_session_cookies", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val cookies = mutableListOf<Cookie>()

    init {
        val stored = runCatching { json.decodeFromString<List<StoredCookie>>(preferences.getString(KEY, "[]") ?: "[]") }.getOrDefault(emptyList())
        cookies += stored.mapNotNull { it.toCookie() }.filter { it.expiresAt > System.currentTimeMillis() }
    }

    @Synchronized override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
        newCookies.forEach { incoming -> cookies.removeAll { it.name == incoming.name && it.domain == incoming.domain && it.path == incoming.path }; if (incoming.expiresAt > System.currentTimeMillis()) cookies += incoming }
        persist()
    }

    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
        cookies.removeAll { it.expiresAt <= System.currentTimeMillis() }
        persist()
        return cookies.filter { it.matches(url) }
    }

    private fun persist() = preferences.edit().putString(KEY, json.encodeToString(cookies.map { StoredCookie(it.name, it.value, it.expiresAt, it.domain, it.path, it.secure, it.httpOnly, it.hostOnly) })).apply()
    private fun StoredCookie.toCookie(): Cookie? = runCatching {
        Cookie.Builder().name(name).value(value).expiresAt(expiresAt).path(path).apply { if (hostOnly) hostOnlyDomain(domain) else domain(domain); if (secure) secure(); if (httpOnly) httpOnly() }.build()
    }.getOrNull()
    private companion object { const val KEY = "cookies" }
}
