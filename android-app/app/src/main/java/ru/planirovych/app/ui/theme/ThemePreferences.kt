package ru.planirovych.app.ui.theme

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("appearance")
class ThemePreferences(private val context: Context) {
    private val darkKey = booleanPreferencesKey("dark_theme")
    val isDark = context.dataStore.data.map { it[darkKey] ?: false }
    suspend fun setDark(value: Boolean) { context.dataStore.edit { it[darkKey] = value } }
}
