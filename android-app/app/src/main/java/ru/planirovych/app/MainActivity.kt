package ru.planirovych.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import androidx.core.view.WindowCompat
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.planirovych.app.feature.home.HomeScreen
import ru.planirovych.app.feature.home.HomeViewModel
import ru.planirovych.app.notifications.AndroidNotificationDelivery
import ru.planirovych.app.updates.AndroidApkInstaller
import ru.planirovych.app.updates.AndroidAppRelease
import ru.planirovych.app.updates.AndroidAppUpdateChecker
import ru.planirovych.app.updates.AndroidAppUpdateDialog
import ru.planirovych.app.updates.AndroidAppUpdateWorker
import ru.planirovych.app.ui.theme.PlanirovychTheme
import ru.planirovych.app.ui.theme.ThemeMode
import java.io.File

class MainActivity:ComponentActivity(){
    companion object{
        const val EXTRA_NOTIFICATION_TASK_ID="planirovych_notification_task"
        const val EXTRA_NOTIFICATION_ACCOUNT="planirovych_notification_account"
        const val EXTRA_NOTIFICATION_HABIT_ID="planirovych_notification_habit"
        const val EXTRA_NOTIFICATION_LOAN_ID="planirovych_notification_loan"
        const val EXTRA_NOTIFICATION_TASK_CHAT="planirovych_notification_task_chat"
        const val EXTRA_NOTIFICATION_CHAT_ID="planirovych_notification_chat"
        const val EXTRA_NOTIFICATION_ID="planirovych_notification_id"
        const val EXTRA_OPEN_GENERAL_AI="planirovych_open_general_ai"
        const val EXTRA_QUICK_AI_MODE="planirovych_widget_quick_ai_mode"
        const val ACTION_WIDGET_QUICK_AI="ru.planirovych.action.OPEN_QUICK_AI"
        const val QUICK_AI_TEXT="text"
        const val QUICK_AI_VOICE="voice"
        const val EXTRA_CHECK_ANDROID_UPDATE="planirovych_check_android_update"
    }
    private var notificationTaskId by mutableStateOf<String?>(null)
    private var notificationHabitId by mutableStateOf<String?>(null)
    private var notificationChatId by mutableStateOf<String?>(null)
    private var notificationTaskChat by mutableStateOf(false)
    private var notificationLoanId by mutableStateOf<String?>(null)
    private var notificationAccount by mutableStateOf<String?>(null)
    private var notificationRequestId by mutableIntStateOf(0)
    private var openGeneralAi by mutableStateOf(false)
    private var quickAiMode by mutableStateOf<String?>(null)
    private var quickAiRequestId by mutableIntStateOf(0)
    private var availableUpdate by mutableStateOf<AndroidAppRelease?>(null)
    private var knownUpdate by mutableStateOf<AndroidAppRelease?>(null)
    private var updateDownloading by mutableStateOf(false)
    private var updateDownloadProgress by mutableStateOf<Int?>(null)
    private var updateDownloadError by mutableStateOf<String?>(null)
    private var updateNeedsInstallPermission by mutableStateOf(false)
    private var pendingUpdateFile: File? = null
    private var downloadJob: Job? = null
    // Short-lived guard against reopening the dialog after leaving for the
    // system installer. This is NOT a saved refusal or a snooze.
    private var updatePageOpenedVersion=0
    private var updatePageOpenedAtMs=0L

    private val askNotifications=registerForActivityResult(
        ActivityResultContracts.RequestPermission()){granted->
        if(granted)AndroidNotificationDelivery.enqueueRefresh(this)
    }

    internal fun dispatchPlanikWake(accountId:String, mode:String) {
        if(mode !in listOf("live","voice"))return
        notificationTaskId=null
        notificationHabitId=null
        notificationLoanId=null
        notificationChatId=null
        notificationTaskChat=false
        notificationAccount=accountId
        quickAiMode=if(mode=="voice")"wake_voice" else "live"
        openGeneralAi=mode=="live"
        quickAiRequestId++
    }

    private fun applyNavigation(intent:Intent?){
        if(intent?.action==ru.planirovych.app.planik.PlanikWakeDispatch.ACTION_WAKE) {
            val account=intent.getStringExtra(EXTRA_NOTIFICATION_ACCOUNT)
            val mode=intent.getStringExtra(EXTRA_QUICK_AI_MODE)
            if(account!=null && mode!=null && ru.planirovych.app.planik.PlanikWakeDispatch.consume(intent)) {
                dispatchPlanikWake(account,mode)
            }
            intent.action=null
            intent.removeExtra(EXTRA_QUICK_AI_MODE)
            intent.removeExtra(EXTRA_NOTIFICATION_ACCOUNT)
            return
        }
        notificationTaskId=intent?.getStringExtra(EXTRA_NOTIFICATION_TASK_ID)
        notificationHabitId=intent?.getStringExtra(EXTRA_NOTIFICATION_HABIT_ID)
        notificationChatId=intent?.getStringExtra(EXTRA_NOTIFICATION_CHAT_ID)
        notificationTaskChat=intent?.getBooleanExtra(EXTRA_NOTIFICATION_TASK_CHAT,false)==true
        notificationLoanId=intent?.getStringExtra(EXTRA_NOTIFICATION_LOAN_ID)
        notificationAccount=intent?.getStringExtra(EXTRA_NOTIFICATION_ACCOUNT)
        if(notificationAccount!=null)notificationRequestId++
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
        // AppWidget PendingIntents are durable. Their extras must not become
        // sticky launch instructions after rotation, task restore or re-entry.
        if(widgetMode!=null) intent?.let { incoming ->
            incoming.action=null
            incoming.removeExtra(EXTRA_QUICK_AI_MODE)
        }
        intent?.removeExtra(EXTRA_OPEN_GENERAL_AI)
    }

    private fun consumeQuickAiCommand(id:Int) {
        if(id==quickAiRequestId) {
            quickAiMode=null
            openGeneralAi=false
        }
    }

    override fun onNewIntent(intent:Intent){
        super.onNewIntent(intent)
        setIntent(intent)
        applyNavigation(intent)
        if(intent.getBooleanExtra(EXTRA_CHECK_ANDROID_UPDATE,false))
            lifecycleScope.launch { checkAndroidUpdateNow() }
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
                // Foreground: short fallback polls if an FCM message is delayed.
                // Background delivery stays push-first; WorkManager is OS-throttled.
                while(isActive){
                    withContext(Dispatchers.IO){
                        runCatching{AndroidNotificationDelivery.refresh(this@MainActivity)}
                    }
                    delay(30_000L)
                }
            }
        }
        // APK updates are independent of authentication and never auto-install.
        // In release builds check when the app is opened and periodically while
        // it remains foregrounded. WorkManager covers longer background periods.
        AndroidAppUpdateWorker.schedule(this)
        if(!BuildConfig.DEBUG) lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while(isActive) {
                    checkAndroidUpdateNow()
                    delay(6 * 60 * 60_000L)
                }
            }
        }
        val app=application as PlanirovychApplication
        setContent{
            val vm:HomeViewModel=viewModel(
                factory=HomeViewModel.Factory(app.repository,app.themePreferences))
            val accountIds=remember(vm){vm.state.map{it.user?.id}.distinctUntilChanged()}
            val accountId by accountIds.collectAsStateWithLifecycle(initialValue=null)
            LaunchedEffect(vm,accountId){
                if(accountId==null)return@LaunchedEffect
                lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED){
                    // Match the web client's minute refresh and refresh immediately
                    // when returning from another app or the live voice Activity.
                    while(isActive){
                        vm.refreshCreditsBalanceNow()
                        delay(60_000L)
                    }
                }
            }
            val preferredMode by vm.themeMode.collectAsStateWithLifecycle()
            val deviceDark=isSystemInDarkTheme()
            val dark=when(preferredMode) {
                ThemeMode.SYSTEM -> deviceDark
                ThemeMode.DARK -> true
                ThemeMode.LIGHT -> false
            }
            // Edge-to-edge defaults to the PHONE theme, which may differ from
            // the app's manual override. Reapply whenever our theme changes,
            // including on the main tabs without any modal windows.
            SideEffect {
                val bars=WindowCompat.getInsetsController(window,window.decorView)
                bars.isAppearanceLightStatusBars=!dark
                bars.isAppearanceLightNavigationBars=!dark
                // Android 10+ otherwise paints a contrast scrim over the gesture
                // area, creating a visible seam beneath the light tab bar.
                if(Build.VERSION.SDK_INT>=29)window.isNavigationBarContrastEnforced=false
            }
            PlanirovychTheme(dark){
                val nav=rememberNavController()
                NavHost(navController=nav,startDestination="home"){
                    composable("home"){
                        HomeScreen(vm,dark,notificationTaskId,openGeneralAi,
                            quickAiMode,quickAiRequestId,
                            onQuickAiHandled=::consumeQuickAiCommand,
                            notificationHabitId=notificationHabitId,notificationChatId=notificationChatId,
                            notificationAccount=notificationAccount,notificationRequestId=notificationRequestId,notificationTaskChat=notificationTaskChat,notificationLoanId=notificationLoanId,
                            updateAvailable=knownUpdate!=null,
                            onCheckUpdates={lifecycleScope.launch { checkAndroidUpdateNow(manual=true) }})
                    }
                }
                availableUpdate?.let { release ->
                    AndroidAppUpdateDialog(
                        release=release,
                        downloading=updateDownloading,
                        downloadProgress=updateDownloadProgress,
                        downloadError=updateDownloadError,
                        needsInstallPermission=updateNeedsInstallPermission,
                        onLater={
                            if(updateDownloading) {
                                downloadJob?.cancel()
                                // Cancelling a download is not a 24-hour snooze.
                                updatePageOpenedVersion=release.versionCode
                                updatePageOpenedAtMs=System.currentTimeMillis()
                            } else {
                                AndroidAppUpdateChecker.snooze(this@MainActivity,release.versionCode)
                            }
                            clearUpdateFlow()
                            availableUpdate=null
                        },
                        onUpdate={ beginNativeUpdate(release) },
                        onBrowserFallback={
                            // Escape hatch if native installation is blocked on a device.
                            clearUpdateFlow()
                            updatePageOpenedVersion=release.versionCode
                            updatePageOpenedAtMs=System.currentTimeMillis()
                            availableUpdate=null
                            startActivity(AndroidApkInstaller.browserDownloadIntent())
                        })
                }
            }
        }
    }
    private suspend fun checkAndroidUpdateNow(manual:Boolean=false) {
        if(BuildConfig.DEBUG || updateDownloading || pendingUpdateFile!=null) return
        val latest=AndroidAppUpdateChecker.latest(this)
        knownUpdate=latest
        if(manual){
            availableUpdate=latest
            if(latest==null) android.widget.Toast.makeText(this,"Новых обновлений не найдено. Версия ${BuildConfig.VERSION_NAME}",android.widget.Toast.LENGTH_LONG).show()
            return
        }
        val now=System.currentTimeMillis()
        val recentlyOpenedInstaller=latest!=null &&
            latest.versionCode==updatePageOpenedVersion &&
            now>=updatePageOpenedAtMs &&
            now-updatePageOpenedAtMs<15*60_000L
        availableUpdate=if(latest!=null &&
            !AndroidAppUpdateChecker.snoozed(this,latest.versionCode,now) &&
            !recentlyOpenedInstaller) latest else null
    }

    private val unknownSourcePermissionLauncher=registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()) {
        val file=pendingUpdateFile ?: return@registerForActivityResult
        if(AndroidApkInstaller.canInstall(this)) {
            launchSystemInstaller(file)
        } else {
            updateNeedsInstallPermission=true
            updateDownloadError="Установка пока не разрешена. Разрешите её в настройках Android."
        }
    }

    private fun clearUpdateFlow() {
        downloadJob?.cancel()
        downloadJob=null
        updateDownloading=false
        updateDownloadProgress=null
        updateDownloadError=null
        updateNeedsInstallPermission=false
        pendingUpdateFile=null
    }

    private fun beginNativeUpdate(release:AndroidAppRelease) {
        if(updateDownloading) return
        if(updateNeedsInstallPermission && pendingUpdateFile!=null) {
            try {
                unknownSourcePermissionLauncher.launch(
                    AndroidApkInstaller.installationPermissionIntent(this))
            } catch(error:Exception) {
                updateDownloadError="Не удалось открыть настройки установки APK."
            }
            return
        }
        updatePageOpenedVersion=release.versionCode
        updatePageOpenedAtMs=System.currentTimeMillis()
        updateDownloadError=null
        updateDownloadProgress=null
        updateNeedsInstallPermission=false
        pendingUpdateFile=null
        updateDownloading=true
        downloadJob=lifecycleScope.launch {
            try {
                val file=AndroidApkInstaller.download(this@MainActivity,release) { percent ->
                    updateDownloadProgress=percent
                }
                updateDownloading=false
                pendingUpdateFile=file
                if(AndroidApkInstaller.canInstall(this@MainActivity)) {
                    launchSystemInstaller(file)
                } else {
                    updateNeedsInstallPermission=true
                }
            } catch(cancelled:CancellationException) {
                throw cancelled
            } catch(error:Exception) {
                updateDownloading=false
                updateDownloadError=error.message ?: "Не удалось скачать обновление"
            }
        }
    }

    private fun launchSystemInstaller(file:File) {
        try {
            AndroidApkInstaller.showSystemInstaller(this,file)
            // Opening the system installer does not mean the user installed
            // anything. The next launch will still compare versionCode.
            availableUpdate=null
            clearUpdateFlow()
        } catch(error:Exception) {
            updateDownloading=false
            updateNeedsInstallPermission=false
            updateDownloadError="Не удалось открыть установщик Android. Можно скачать APK через браузер."
        }
    }

}
