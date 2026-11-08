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
import java.io.File

class MainActivity:ComponentActivity(){
    companion object{
        const val EXTRA_NOTIFICATION_TASK_ID="planirovych_notification_task"
        const val EXTRA_NOTIFICATION_ID="planirovych_notification_id"
        const val EXTRA_OPEN_GENERAL_AI="planirovych_open_general_ai"
        const val EXTRA_QUICK_AI_MODE="planirovych_widget_quick_ai_mode"
        const val ACTION_WIDGET_QUICK_AI="ru.planirovych.action.OPEN_QUICK_AI"
        const val QUICK_AI_TEXT="text"
        const val QUICK_AI_VOICE="voice"
        const val EXTRA_CHECK_ANDROID_UPDATE="planirovych_check_android_update"
    }
    private var notificationTaskId by mutableStateOf<String?>(null)
    private var openGeneralAi by mutableStateOf(false)
    private var quickAiMode by mutableStateOf<String?>(null)
    private var quickAiRequestId by mutableIntStateOf(0)
    private var availableUpdate by mutableStateOf<AndroidAppRelease?>(null)
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
            val dark by vm.isDark.collectAsStateWithLifecycle()
            PlanirovychTheme(dark){
                val nav=rememberNavController()
                NavHost(navController=nav,startDestination="home"){
                    composable("home"){
                        HomeScreen(vm,dark,notificationTaskId,openGeneralAi,
                            quickAiMode,quickAiRequestId)
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
    private suspend fun checkAndroidUpdateNow() {
        if(BuildConfig.DEBUG || updateDownloading || pendingUpdateFile!=null) return
        val latest=AndroidAppUpdateChecker.latest(this)
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
