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
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(TOKEN,token)
            .putExtra(MainActivity.EXTRA_NOTIFICATION_ACCOUNT,id)
            .putExtra(MainActivity.EXTRA_QUICK_AI_MODE,mode)
    }
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
        private const val CHANNEL="planik_background_wake"
        private const val ALERT="planik_wake_detected"
        private const val ONGOING_ID=7301
        private const val ALERT_ID=7302
        private const val STOP="ru.planirovych.action.PLANIK_WAKE_STOP"
        private const val ACCOUNT="planik_wake_account"
        private var activeAccount: String?=null
        internal var status by mutableStateOf("")
            private set

        internal fun start(context: Context, id: String): Boolean {
            if(!supported(context) || !hasPermission(context))return false
            if(Build.VERSION.SDK_INT>=33 &&
                ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false
            if(activeAccount==id)return true
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
    private var lastAlert=0L
    private val gateObserver: () -> Unit = { listener?.refresh() }
    private val screenReceiver=object:BroadcastReceiver(){
        override fun onReceive(context:Context?,intent:Intent?) {
            if(intent?.action==Intent.ACTION_SCREEN_OFF)listener?.pause()
            else listener?.resume()
        }
    }

    override fun onCreate() {
        super.onCreate()
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"Планик: фоновый микрофон",NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel(ALERT,"Планик: голосовой вызов",NotificationManager.IMPORTANCE_HIGH))
        ContextCompat.registerReceiver(this,screenReceiver,IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        },ContextCompat.RECEIVER_NOT_EXPORTED)
        PlanikWakeMicGate.addObserver(gateObserver)
    }

    override fun onBind(intent: Intent?): IBinder?=null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action==STOP) {
            id?.let { prefs.edit().putBoolean("background_"+it,false).apply() }
            stopSelf()
            return START_NOT_STICKY
        }
        val account=intent?.getStringExtra(ACCOUNT)
        if(account==null || !prefs.getBoolean("enabled_"+account,false) ||
            !prefs.getBoolean("background_"+account,false) || !supported(this) || !hasPermission(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if(Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { stopSelf(); return START_NOT_STICKY }
        try {
            val stop=PendingIntent.getService(this,0,Intent(this,PlanikWakeBackgroundService::class.java).setAction(STOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notification=Notification.Builder(this,CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_planirovych)
                .setContentTitle("Планик слушает кодовую фразу")
                .setContentText("Локальное распознавание при разблокированном экране")
                .setOngoing(true)
                .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"Выключить фон",stop).build())
                .build()
            startForeground(ONGOING_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch(_:Exception) {
            status="Не удалось запустить фоновый микрофон"
            stopSelf()
            return START_NOT_STICKY
        }
        listener?.pause()
        id=account
        activeAccount=account
        listener=ForegroundWakeListener(this,{ status=it }) {
            val mode=prefs.getString("action_"+account,"live") ?: "live"
            if(!PlanikWakeDispatch.dispatch(account,mode)) {
                val now=SystemClock.elapsedRealtime()
                if(lastAlert==0L || now-lastAlert>15_000L) {
                    lastAlert=now
                    val pending=PendingIntent.getActivity(this,1,PlanikWakeDispatch.intent(this,account,mode),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                    val alert=Notification.Builder(this,ALERT)
                        .setSmallIcon(R.drawable.ic_stat_planirovych)
                        .setContentTitle("Планик услышал вас")
                        .setContentText(if(mode=="voice")"Открыть голосовой ввод" else "Начать живое общение")
                        .setContentIntent(pending).setAutoCancel(true).build()
                    getSystemService(NotificationManager::class.java).notify(ALERT_ID,alert)
                }
            }
        }.also { it.resume() }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        listener?.pause()
        listener=null
        PlanikWakeMicGate.removeObserver(gateObserver)
        unregisterReceiver(screenReceiver)
        getSystemService(NotificationManager::class.java).cancel(ALERT_ID)
        activeAccount=null
        status=""
        super.onDestroy()
    }
}
