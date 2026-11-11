package ru.planirovych.app.planik

import android.Manifest
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import ru.planirovych.app.MainActivity
import ru.planirovych.app.R
import java.util.Locale

/** Consent is deliberately off by default. There is no BOOT_COMPLETED receiver. */
object PlanikWakeWordSettings {
    private const val FILE = "planik_voice_wake"
    private const val KEY = "enabled"
    fun enabled(context: Context): Boolean =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY, false)

    fun setEnabled(context: Context, enabled: Boolean) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY, enabled).apply()

    fun supported(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
}

/**
 * Experimental local wake phrase listener.
 *
 * Android SpeechRecognizer is NOT a low-power hardware DSP hotword engine.
 * It can stop at OS/OEM discretion. Start only from a visible user toggle,
 * use the microphone foreground-service type and persistent notification.
 * Never send wake audio to our servers.
 */
class PlanikWakeWordService : Service(), RecognitionListener {
    companion object {
        private const val CHANNEL = "planik_wake_microphone"
        private const val ALERT_CHANNEL = "planik_wake_alert"
        private const val FOREGROUND_ID = 7301
        private const val ALERT_ID = 7302
        const val ACTION_START = "ru.planirovych.app.planik.START_WAKE"
        const val ACTION_STOP = "ru.planirovych.app.planik.STOP_WAKE"
        @Volatile private var active: PlanikWakeWordService? = null

        fun enable(context: Context): Boolean {
            if (!PlanikWakeWordSettings.supported(context) ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
            ) return false
            PlanikWakeWordSettings.setEnabled(context, true)
            return try {
                ContextCompat.startForegroundService(context,
                    Intent(context, PlanikWakeWordService::class.java).setAction(ACTION_START))
                true
            } catch (_: Exception) {
                PlanikWakeWordSettings.setEnabled(context, false)
                false
            }
        }

        fun disable(context: Context) {
            PlanikWakeWordSettings.setEnabled(context, false)
            context.stopService(Intent(context, PlanikWakeWordService::class.java))
        }

        /** Avoid competing for microphone with the full Realtime WebView. */
        fun pauseForLiveSession() { active?.pauseForConversation() }
        fun resumeAfterLiveSession() { active?.resumeFromConversation() }
    }

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private var conversationActive = false
    private var wakePending = false
    private var consecutiveErrors = 0
    private val restart = Runnable { startListening() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        active = this
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL, "Планик: фраза пробуждения", NotificationManager.IMPORTANCE_LOW
        ))
        manager.createNotificationChannel(NotificationChannel(
            ALERT_CHANNEL, "Планик: голосовая активация", NotificationManager.IMPORTANCE_HIGH
        ))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !PlanikWakeWordSettings.enabled(this)) {
            PlanikWakeWordSettings.setEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!PlanikWakeWordSettings.supported(this) ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            PlanikWakeWordSettings.setEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            // Starting the microphone FGS in background is not allowed on
            // Android 14+. The Settings toggle invokes this while visible.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(FOREGROUND_ID, listeningNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(FOREGROUND_ID, listeningNotification())
            }
        } catch (_: Exception) {
            PlanikWakeWordSettings.setEnabled(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        startListening()
        return START_NOT_STICKY
    }

    private fun listeningNotification(): Notification {
        val stop = PendingIntent.getService(this, 0,
            Intent(this, PlanikWakeWordService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val launch = PendingIntent.getActivity(this, 0, PlanikLiveActivity.intent(this),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_planirovych)
            .setContentTitle("Планик слушает")
            .setContentText("Скажите «Эй, Планик» · Нажмите, чтобы поговорить")
            .setContentIntent(launch)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel, "Выключить", stop).build())
            .build()
    }

    private fun startListening() {
        main.removeCallbacks(restart)
        if (listening || conversationActive || wakePending ||
            !PlanikWakeWordSettings.enabled(this)) return
        if (!PlanikWakeWordSettings.supported(this)) {
            PlanikWakeWordSettings.setEnabled(this, false)
            stopSelf()
            return
        }
        try {
            recognizer?.destroy()
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this).also {
                it.setRecognitionListener(this)
            }
            val prompt = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 4)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
            listening = true
            recognizer?.startListening(prompt)
        } catch (_: Exception) {
            listening = false
            scheduleRestart(3000)
        }
    }

    private fun scheduleRestart(delayMs: Long) {
        main.removeCallbacks(restart)
        if (!conversationActive && !wakePending && PlanikWakeWordSettings.enabled(this)) {
            main.postDelayed(restart, delayMs)
        }
    }

    private fun releaseRecognizer() {
        listening = false
        main.removeCallbacks(restart)
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    private fun pauseForConversation() {
        main.post {
            conversationActive = true
            wakePending = false
            releaseRecognizer()
            getSystemService(NotificationManager::class.java).cancel(ALERT_ID)
        }
    }

    private fun resumeFromConversation() {
        main.post {
            conversationActive = false
            wakePending = false
            if (PlanikWakeWordSettings.enabled(this)) scheduleRestart(750)
        }
    }

    private fun hasWakePhrase(values: ArrayList<String>?): Boolean {
        return values.orEmpty().any { raw ->
            val cleaned = raw.lowercase(Locale.forLanguageTag("ru"))
                .replace(Regex("[.,!?;:]+"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
            cleaned.contains("эй планик") || cleaned.contains("эй планник") ||
                cleaned.contains("хэй планик") || cleaned.contains("хэй планник")
        }
    }

    private fun onWakePhraseDetected() {
        if (conversationActive || wakePending) return
        wakePending = true
        releaseRecognizer()
        val unlock = getSystemService(KeyguardManager::class.java)
        val locked = unlock.isKeyguardLocked
        if (!locked && MainActivity.isInForeground) {
            // Legal while our Activity is visible. No background activity launch
            // or keyguard bypass is attempted.
            startActivity(PlanikLiveActivity.intent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } else {
            // Android limits background activity launches, especially locked.
            // The user taps a high-priority notification to unlock/open Planik.
            val pending = PendingIntent.getActivity(this, 1,
                PlanikLiveActivity.intent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val alert = Notification.Builder(this, ALERT_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_planirovych)
                .setContentTitle("Планик услышал вас")
                .setContentText("Нажмите, чтобы открыть живой диалог")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .build()
            getSystemService(NotificationManager::class.java).notify(ALERT_ID, alert)
        }
        main.postDelayed({
            if (!conversationActive && wakePending) {
                wakePending = false
                scheduleRestart(600)
            }
        }, 30_000)
    }

    private fun handleRecognized(values: ArrayList<String>?) {
        if (hasWakePhrase(values)) onWakePhraseDetected()
    }

    override fun onReadyForSpeech(params: android.os.Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onPartialResults(partialResults: android.os.Bundle?) {
        handleRecognized(partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
    }
    override fun onResults(results: android.os.Bundle?) {
        handleRecognized(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
        listening = false
        if (!wakePending) scheduleRestart(450)
    }
    override fun onError(error: Int) {
        listening = false
        if (conversationActive || wakePending) return
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ||
            error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
            error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
            PlanikWakeWordSettings.setEnabled(this, false)
            stopSelf()
            return
        }
        consecutiveErrors = if (error == SpeechRecognizer.ERROR_NO_MATCH ||
            error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) 0 else consecutiveErrors + 1
        scheduleRestart(if (consecutiveErrors > 5) 10_000 else if (consecutiveErrors > 0) 2000 else 450)
    }
    override fun onEvent(eventType: Int, params: android.os.Bundle?) {}

    override fun onDestroy() {
        releaseRecognizer()
        main.removeCallbacksAndMessages(null)
        if (active === this) active = null
        super.onDestroy()
    }
}
