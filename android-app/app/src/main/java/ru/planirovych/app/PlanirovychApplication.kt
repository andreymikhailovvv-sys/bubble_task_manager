package ru.planirovych.app

import android.app.Application
import ru.planirovych.app.core.network.NetworkModule
import ru.planirovych.app.data.repository.WorkspaceRepository
import ru.planirovych.app.ui.theme.ThemePreferences
import ru.planirovych.app.notifications.AndroidNotificationDelivery

class PlanirovychApplication : Application() {
    val repository by lazy { WorkspaceRepository(NetworkModule.api(this)) }
    val themePreferences by lazy { ThemePreferences(this) }
    override fun onCreate(){
        super.onCreate()
        AndroidNotificationDelivery.schedule(this)
    }
}
