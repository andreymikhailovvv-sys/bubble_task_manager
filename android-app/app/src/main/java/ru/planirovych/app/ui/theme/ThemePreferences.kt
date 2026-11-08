package ru.planirovych.app.ui.theme

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("appearance")

/** System mode follows the phone's current day/night configuration live. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

class ThemePreferences(private val context: Context) {
    private val modeKey = stringPreferencesKey("theme_mode")
    // Keep pre-existing manual choices made before system theme support.
    private val legacyDarkKey = booleanPreferencesKey("dark_theme")

    val mode = context.dataStore.data.map { preferences ->
        when (preferences[modeKey]) {
            ThemeMode.SYSTEM.name -> ThemeMode.SYSTEM
            ThemeMode.LIGHT.name -> ThemeMode.LIGHT
            ThemeMode.DARK.name -> ThemeMode.DARK
            else -> when (preferences[legacyDarkKey]) {
                true -> ThemeMode.DARK
                false -> ThemeMode.LIGHT
                null -> ThemeMode.SYSTEM
            }
        }
    }

    suspend fun setMode(value: ThemeMode) {
        context.dataStore.edit { it[modeKey] = value.name }
    }
}
