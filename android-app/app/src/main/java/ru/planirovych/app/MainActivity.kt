package ru.planirovych.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.planirovych.app.feature.home.HomeScreen
import ru.planirovych.app.feature.home.HomeViewModel
import ru.planirovych.app.notifications.AndroidNotificationDelivery
import ru.planirovych.app.ui.theme.PlanirovychTheme

class MainActivity:ComponentActivity(){
    companion object{
        const val EXTRA_NOTIFICATION_TASK_ID="planirovych_notification_task"
        const val EXTRA_NOTIFICATION_ID="planirovych_notification_id"
        const val EXTRA_OPEN_GENERAL_AI="planirovych_open_general_ai"
        const val EXTRA_QUICK_AI_MODE="planirovych_widget_quick_ai_mode"
        const val ACTION_WIDGET_QUICK_AI="ru.planirovych.action.OPEN_QUICK_AI"
        const val QUICK_AI_TEXT="text"
        const val QUICK_AI_VOICE="voice"
    }
    private var notificationTaskId by mutableStateOf<String?>(null)
    private var openGeneralAi by mutableStateOf(false)
    private var quickAiMode by mutableStateOf<String?>(null)
    private var quickAiRequestId by mutableIntStateOf(0)

    private val askNotifications=registerForActivityResult(
        ActivityResultContracts.RequestPermission()){granted->
        if(granted)AndroidNotificationDelivery.enqueueRefresh(this)
    }

    private fun applyNavigation(intent:Intent?){
        notificationTaskId=intent?.getStringExtra(EXTRA_NOTIFICATION_TASK_ID)
        val widgetMode=if(intent?.action==ACTION_WIDGET_QUICK_AI)
            intent.getStringExtra(EXTRA_QUICK_AI_MODE) else null
        quickAiMode=widgetMode?.takeIf{it==QUICK_AI_TEXT||it==QUICK_AI_VOICE}
        if(quickAiMode!=null){
            // Count every tap, even if MainActivity is already at the AI tab.
            quickAiRequestId++
            notificationTaskId=null
        }
        openGeneralAi=quickAiMode!=null ||
            intent?.getBooleanExtra(EXTRA_OPEN_GENERAL_AI,false)==true
    }

    override fun onNewIntent(intent:Intent){
        super.onNewIntent(intent)
        setIntent(intent)
        applyNavigation(intent)
    }
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        applyNavigation(intent)

        if(Build.VERSION.SDK_INT>=33 &&
            !AndroidNotificationDelivery.canNotify(this)){
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        lifecycleScope.launch{
            repeatOnLifecycle(Lifecycle.State.STARTED){
                // Foreground: refresh within a minute. WorkManager covers
                // background delivery at the OS-defined periodic cadence.
                while(isActive){
                    withContext(Dispatchers.IO){
                        runCatching{AndroidNotificationDelivery.refresh(this@MainActivity)}
                    }
                    delay(60_000L)
                }
            }
        }
        val app=application as PlanirovychApplication
        setContent{
            val vm:HomeViewModel=viewModel(
                factory=HomeViewModel.Factory(app.repository,app.themePreferences))
            val dark by vm.isDark.collectAsStateWithLifecycle()
            PlanirovychTheme(dark){
                val nav=rememberNavController()
                NavHost(navController=nav,startDestination="home"){
                    composable("home"){
                        HomeScreen(vm,dark,notificationTaskId,openGeneralAi,
                            quickAiMode,quickAiRequestId)
                    }
                }
            }
        }
    }
}
