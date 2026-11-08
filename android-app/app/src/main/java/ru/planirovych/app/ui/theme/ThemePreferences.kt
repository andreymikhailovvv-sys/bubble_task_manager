package ru.planirovych.app.ui.theme

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("appearance")

/** System mode follows the phone's current day/night configuration live. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

class ThemePreferences(private val context: Context) {
    private val modeKey = stringPreferencesKey("theme_mode")
    val mode = context.dataStore.data.map { preferences ->
        when (preferences[modeKey]) {
            ThemeMode.SYSTEM.name -> ThemeMode.SYSTEM
            ThemeMode.LIGHT.name -> ThemeMode.LIGHT
            ThemeMode.DARK.name -> ThemeMode.DARK
            // A newly introduced system mode is the default for every user,
            // including installations with a legacy dark_theme switch saved.
            else -> ThemeMode.SYSTEM
        }
    }

    suspend fun setMode(value: ThemeMode) {
        context.dataStore.edit { it[modeKey] = value.name }
    }
}
