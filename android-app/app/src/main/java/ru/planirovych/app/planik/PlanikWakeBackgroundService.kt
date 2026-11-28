package ru.planirovych.app.planik

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.annotation.SuppressLint
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import ru.planirovych.app.MainActivity
import ru.planirovych.app.R
import java.util.UUID

/** Only a visible MainActivity may receive direct wake callbacks. */
internal object PlanikWakeDispatch {
    const val ACTION_WAKE = "ru.planirovych.action.PLANIK_WAKE"
    private const val TOKEN = "planik_wake_token"
    private var callback: ((String) -> Unit)? = null
    private var account: String? = null
    private var ticket: String? = null
    private var ticketTime = 0L

    fun attach(id: String, listener: (String) -> Unit) { account=id; callback=listener }
    fun detach(listener: (String) -> Unit) {
        if(callback===listener) { account=null; callback=null }
    }
    fun dispatch(id: String, mode: String): Boolean {
        val listener=callback ?: return false
        if(account!=id)return false
        listener(mode)
        return true
    }
    fun intent(context: Context, id: String, mode: String): Intent {
        val token=UUID.randomUUID().toString()
        ticket=token
        ticketTime=SystemClock.elapsedRealtime()
        return Intent(context, MainActivity::class.java).setAction(ACTION_WAKE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(TOKEN,token)
            .putExtra(MainActivity.EXTRA_NOTIFICATION_ACCOUNT,id)
            .putExtra(MainActivity.EXTRA_QUICK_AI_MODE,mode)
    }
    fun pending(intent: Intent): Boolean = ticket!=null && intent.getStringExtra(TOKEN)==ticket &&
        SystemClock.elapsedRealtime()-ticketTime<=120_000L
    fun consume(intent: Intent): Boolean {
        val expected=ticket ?: return false
        if(intent.getStringExtra(TOKEN)!=expected ||
            SystemClock.elapsedRealtime()-ticketTime>120_000L)return false
        ticket=null
        intent.removeExtra(TOKEN)
        return true
    }
}

class PlanikWakeBackgroundService : Service() {
    companion object {
        private const val CHANNEL="planik_background_wake_silent"
        private const val ALERT="planik_wake_detected_silent"
        private const val ONGOING_ID=7301
        private const val ALERT_ID=7302
        private const val STOP="ru.planirovych.action.PLANIK_WAKE_STOP"
        private const val ACCOUNT="planik_wake_account"
        private var activeAccount: String?=null
        private var activeService: PlanikWakeBackgroundService?=null
        internal var status by mutableStateOf("")
            private set

        internal fun start(context: Context, id: String): Boolean {
            if(!supported(context) || !hasPermission(context))return false
            if(Build.VERSION.SDK_INT>=33 &&
                ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false
            val current=activeService
            val prefs=context.getSharedPreferences("planik_foreground_wake",Context.MODE_PRIVATE)
            val mode=wakeListeningMode(prefs,id)
            if(activeAccount==id && current?.listeningMode==mode && current.listener!=null) {
                current.recoverListening()
                return true
            }
            return runCatching {
                ContextCompat.startForegroundService(context,Intent(context,PlanikWakeBackgroundService::class.java)
                    .putExtra(ACCOUNT,id))
                true
            }.getOrElse { status="Фоновый микрофон не запущен"; false }
        }
        internal fun stop(context: Context) {
            context.stopService(Intent(context,PlanikWakeBackgroundService::class.java))
        }
        internal fun stopOtherAccount(context:Context,id:String) {
            if(activeAccount!=null && activeAccount!=id)stop(context)
        }
    }
    private val prefs by lazy { getSharedPreferences("planik_foreground_wake",MODE_PRIVATE) }
    private var listener: ForegroundWakeListener?=null
    private var id: String?=null
    private var listeningMode=WAKE_BACKGROUND
    private var cpuLock:PowerManager.WakeLock?=null
    private var lastAlert=0L
    private var pendingLockedWake:Intent?=null
    private val handler=Handler(Looper.getMainLooper())
    private val gateObserver: () -> Unit = {
        listener?.refresh()
        updateCpuLock()
    }
    private val screenReceiver=object:BroadcastReceiver(){
        override fun onReceive(context:Context?,intent:Intent?) {
            // These broadcasts are hints; always query actual keyguard state.
            if(intent?.action==Intent.ACTION_SCREEN_OFF)listener?.refresh()
            else recoverListening()
            updateCpuLock()
        }
    }

    @SuppressLint("WakelockTimeout")
    private fun updateCpuLock() {
        if(listeningMode==WAKE_ALWAYS && id!=null && !PlanikWakeMicGate.busy && hasPermission(this)) {
            if(cpuLock==null)cpuLock=getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"planirovych:planikAlways").apply { setReferenceCounted(false) }
            // Only the explicitly selected always-on mode keeps the CPU awake.
            if(cpuLock?.isHeld==false)cpuLock?.acquire()
        } else releaseCpuLock()
    }
    private fun releaseCpuLock() {
        cpuLock?.let { if(it.isHeld)it.release() }
        cpuLock=null
    }
    private fun recoverListening() {
        listener?.resume()
        updateCpuLock()
        val pending=pendingLockedWake ?: return
        if(!PlanikWakeDispatch.pending(pending)) {
            pendingLockedWake=null
            return
        }
        if(wakeDeviceUnlocked(this)) {
            pendingLockedWake=null
            if(Settings.canDrawOverlays(this))runCatching { startActivity(pending) }
            // Otherwise the existing notification remains tappable.
        }
    }

    override fun onCreate() {
        super.onCreate()
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"Планик: фоновый микрофон",NotificationManager.IMPORTANCE_LOW).apply {
            setSound(null,null); enableVibration(false); setShowBadge(false)
        })
        manager.createNotificationChannel(NotificationChannel(ALERT,"Планик: голосовой вызов",NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null,null); enableVibration(false); setShowBadge(false)
        })
        ContextCompat.registerReceiver(this,screenReceiver,IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        },ContextCompat.RECEIVER_EXPORTED)
        PlanikWakeMicGate.addObserver(gateObserver)
    }

    override fun onBind(intent: Intent?): IBinder?=null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action==STOP) {
            id?.let { saveWakeListeningMode(prefs,it,WAKE_APP) }
            stopSelf()
            return START_NOT_STICKY
        }
        val account=intent?.getStringExtra(ACCOUNT)
        if(account==null || !prefs.getBoolean("enabled_"+account,false) ||
            wakeListeningMode(prefs,account)==WAKE_APP || !supported(this) || !hasPermission(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if(Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { stopSelf(); return START_NOT_STICKY }
        val mode=wakeListeningMode(prefs,account)
        try {
            val stop=PendingIntent.getService(this,0,Intent(this,PlanikWakeBackgroundService::class.java).setAction(STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notification=Notification.Builder(this,CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_planirovych)
                .setContentTitle("Планик слушает кодовую фразу")
                .setContentText(if(mode==WAKE_ALWAYS)"Постоянное локальное распознавание, включая выключенный экран"
                    else "Локальное распознавание при разблокированном экране")
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setOngoing(true).setOnlyAlertOnce(true)
                .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Выключить фон",stop).build())
                .build()
            startForeground(ONGOING_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch(_:Exception) {
            status="Не удалось запустить фоновый микрофон"
            stopSelf()
            return START_NOT_STICKY
        }
        listener?.pause()
        releaseCpuLock()
        pendingLockedWake=null
        id=account
        listeningMode=mode
        activeAccount=account
        activeService=this
        listener=ForegroundWakeListener(this,{ status=it },allowLocked=mode==WAKE_ALWAYS) {
            val mode=prefs.getString("action_"+account,"live") ?: "live"
            val unlocked=wakeDeviceUnlocked(this)
            if(!unlocked || !PlanikWakeDispatch.dispatch(account,mode)) {
                val now=SystemClock.elapsedRealtime()
                if(lastAlert==0L || now-lastAlert>15_000L) {
                    lastAlert=now
                    val wakeIntent=PlanikWakeDispatch.intent(this,account,mode)
                    // Explicit user-granted permission permits a background
                    // Activity launch; no synthetic overlay or full-screen alert.
                    if(!unlocked)pendingLockedWake=wakeIntent
                    val attempted=unlocked && Settings.canDrawOverlays(this) &&
                        runCatching { startActivity(wakeIntent); true }.getOrDefault(false)
                    fun fallback() {
                        if(id!=account || !PlanikWakeDispatch.pending(wakeIntent))return
                        val pending=PendingIntent.getActivity(this,1,wakeIntent,
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                        val alert=Notification.Builder(this,ALERT)
                            .setSmallIcon(R.drawable.ic_stat_planirovych)
                            .setContentTitle("Планик услышал вас")
                            .setContentText(if(!unlocked)"Разблокируйте устройство для продолжения"
                                else if(mode=="voice")"Открыть голосовой ввод" else "Начать живое общение")
                            .setVisibility(Notification.VISIBILITY_PRIVATE)
                            .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
                            .setTimeoutAfter(120_000L).build()
                        getSystemService(NotificationManager::class.java).notify(ALERT_ID,alert)
                    }
                    if(attempted)handler.postDelayed({ fallback() },1800L) else fallback()
                }
            }
        }.also { it.resume() }
        updateCpuLock()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        listener?.pause()
        listener=null
        PlanikWakeMicGate.removeObserver(gateObserver)
        unregisterReceiver(screenReceiver)
        getSystemService(NotificationManager::class.java).cancel(ALERT_ID)
        releaseCpuLock()
        pendingLockedWake=null
        if(activeService===this) {
            activeAccount=null
            activeService=null
            status=""
        }
        super.onDestroy()
    }
}
