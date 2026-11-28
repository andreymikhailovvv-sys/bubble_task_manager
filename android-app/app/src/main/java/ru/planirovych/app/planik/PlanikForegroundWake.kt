package ru.planirovych.app.planik

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.content.SharedPreferences
import android.media.AudioRecord
import android.media.AudioFormat
import android.media.MediaRecorder
import android.annotation.SuppressLint
import org.vosk.Model
import org.vosk.Recognizer
import org.json.JSONObject
import android.provider.Settings
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.util.Locale

/** Main-thread-only microphone arbitration for every native dictation composer. */
internal object PlanikWakeMicGate {
    private val owners = mutableSetOf<Any>()
    private val observers = mutableSetOf<() -> Unit>()
    val busy: Boolean get() = owners.isNotEmpty()
    fun acquire(owner: Any) {
        if (owners.add(owner)) observers.toList().forEach { it() }
    }
    fun release(owner: Any) {
        if (owners.remove(owner)) observers.toList().forEach { it() }
    }
    fun addObserver(observer: () -> Unit) { observers.add(observer) }
    fun removeObserver(observer: () -> Unit) { observers.remove(observer) }
}

internal data class PlanikWakeControls(
    val enabled: Boolean,
    val available: Boolean,
    val status: String,
    val action: String,
    val listeningMode: String,
    val onAction: (String) -> Unit,
    val onListeningMode: (String) -> Unit,
    val autoOpen: Boolean,
    val onAutoOpen: () -> Unit,
    val onChange: (Boolean) -> Unit
)

internal const val WAKE_APP = "app"
internal const val WAKE_BACKGROUND = "background"
internal const val WAKE_ALWAYS = "always"

internal fun wakeListeningMode(prefs:SharedPreferences, accountId:String):String =
    prefs.getString("mode_" + accountId, null)
        ?.takeIf { it in listOf(WAKE_APP,WAKE_BACKGROUND,WAKE_ALWAYS) }
        ?: if(prefs.getBoolean("background_" + accountId, false)) WAKE_BACKGROUND else WAKE_APP

internal fun saveWakeListeningMode(prefs:SharedPreferences, accountId:String, mode:String) {
    require(mode in listOf(WAKE_APP,WAKE_BACKGROUND,WAKE_ALWAYS))
    prefs.edit().putString("mode_" + accountId,mode)
        .putBoolean("background_" + accountId,mode!=WAKE_APP).apply()
}

internal fun wakeDeviceUnlocked(context:Context):Boolean =
    context.getSystemService(PowerManager::class.java).isInteractive &&
        !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

internal fun supported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)

internal fun hasPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

internal fun isPlanikWakePhrase(raw: String): Boolean {
    val normalized = raw.lowercase(Locale.forLanguageTag("ru"))
        .replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    return Regex("^(эй|хэй) (планн?ик|план ник|план ик)$").matches(normalized)
}

/**
 * Continuous PCM recognition using a local model, not the interactive
 * Android recognizer. No recording files or audio uploads.
 */
internal class ForegroundWakeListener(
    private val context: Context,
    private val onStatus: (String) -> Unit,
    private val allowLocked: Boolean = false,
    private val onWake: () -> Unit
) {
    private val handler = Handler(Looper.getMainLooper())
    private val captureLock = Any()
    @Volatile private var generation = 0
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null
    private var foreground = false
    private var triggered = false
    private var failed = false
    private var failures = 0
    private var retryAt = 0L
    @Volatile private var lastFrameAt = 0L
    @Volatile private var capturing = false
    private val retry = Runnable { start() }
    private val health = object : Runnable {
        override fun run() {
            if (!foreground) return
            refresh()
            handler.postDelayed(this, 5000L)
        }
    }

    private fun screenAvailable(): Boolean = allowLocked || wakeDeviceUnlocked(context)

    // Idempotent: do not tear down a healthy recorder on every Activity resume.
    fun resume() {
        if (!foreground) triggered = false
        foreground = true
        failed = false
        retryAt = 0L
        refresh()
        handler.removeCallbacks(health)
        handler.postDelayed(health, 5000L)
    }

    fun pause() {
        foreground = false
        handler.removeCallbacksAndMessages(null)
        release()
        onStatus("На паузе")
    }

    fun refresh() {
        if (!foreground || PlanikWakeMicGate.busy || !screenAvailable()) {
            if(worker != null || recorder != null) release()
            handler.removeCallbacks(retry)
            if (PlanikWakeMicGate.busy) triggered = false
            onStatus(if (!screenAvailable()) "Пауза до разблокировки" else "На паузе")
            return
        }
        if (triggered || failed) return
        if (capturing && SystemClock.elapsedRealtime()-lastFrameAt>15_000L) {
            fail("Микрофон не отвечает. Восстанавливаю прослушивание…", recoverable=true)
            return
        }
        if (worker?.isAlive == false) {
            worker = null
            capturing = false
        }
        if (worker == null && !handler.hasCallbacks(retry)) {
            handler.postDelayed(retry,maxOf(400L,retryAt-SystemClock.elapsedRealtime()))
        }
    }

    private fun release() {
        generation++
        capturing = false
        lastFrameAt = 0L
        handler.removeCallbacks(retry)
        synchronized(captureLock) {
            runCatching { recorder?.stop() }
            recorder = null
        }
        worker?.interrupt()
        worker = null
    }

    private fun fail(message: String, recoverable:Boolean=false) {
        release()
        failed = !recoverable
        onStatus(message)
        if(recoverable) {
            failures = (failures+1).coerceAtMost(5)
            retryAt = SystemClock.elapsedRealtime() + (2000L shl failures).coerceAtMost(60_000L)
            refresh()
        }
    }

    @SuppressLint("MissingPermission")
    private fun start() {
        if (!foreground || triggered || failed || PlanikWakeMicGate.busy ||
            !screenAvailable() || worker != null) return
        if (!hasPermission(context)) {
            fail("Нет доступа к микрофону")
            return
        }
        val session = ++generation
        lastFrameAt = 0L
        capturing = false
        fun active() = session == generation && !Thread.currentThread().isInterrupted
        fun report(message: String) {
            handler.post { if (session == generation) onStatus(message) }
        }
        val thread = Thread({
            var input: AudioRecord? = null
            var model: Model? = null
            var decoder: Recognizer? = null
            var detected = false
            try {
                report("Подготовка локальной модели речи…")
                val path = PlanikWakeModel.ensure(context.applicationContext, ::active, ::report)
                if (!active()) return@Thread
                model = Model(path.absolutePath)
                // Split pronunciations accommodate names not in the dictionary.
                decoder = Recognizer(model, 16000f,
                    """["эй планик","эй планник","хэй планик","хэй планник","эй план ник","хэй план ник","эй план ик","хэй план ик","[unk]"]""")
                if (!active()) return@Thread
                val minimum = AudioRecord.getMinBufferSize(16000,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                require(minimum > 0)
                val buffer = ShortArray(1600)
                synchronized(captureLock) {
                    if (!active()) return@Thread
                    input = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,
                        AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,
                        maxOf(minimum,buffer.size*4))
                    val current = requireNotNull(input)
                    check(current.state == AudioRecord.STATE_INITIALIZED)
                    recorder = current
                    current.startRecording()
                    check(current.recordingState == AudioRecord.RECORDSTATE_RECORDING)
                    lastFrameAt = SystemClock.elapsedRealtime()
                    capturing = true
                }
                handler.post {
                    if(session==generation) {
                        failures=0
                        retryAt=0L
                        onStatus("Планик слушает")
                    }
                }
                while (active()) {
                    val count = requireNotNull(input).read(buffer,0,buffer.size)
                    if (count < 0) {
                        if (active()) error("Микрофон недоступен")
                        break
                    }
                    if (count == 0) continue
                    if (!active()) break
                    lastFrameAt = SystemClock.elapsedRealtime()
                    val recognition = requireNotNull(decoder)
                    // Final hypotheses only: avoid transient false matches.
                    if (recognition.acceptWaveForm(buffer,count)) {
                        val phrase = JSONObject(recognition.result).optString("text")
                        if (isPlanikWakePhrase(phrase)) {
                            detected = true
                            break
                        }
                    }
                }
            } catch (error: Exception) {
                if (active()) handler.post {
                    if (session == generation)
                        fail("Не удалось запустить распознавание. Повторяю подключение…", recoverable=true)
                }
            } catch (error: LinkageError) {
                if (active()) handler.post {
                    if (session == generation) fail("Локальный движок недоступен на этом устройстве")
                }
            } finally {
                synchronized(captureLock) {
                    if (recorder === input) {
                        recorder = null
                        capturing = false
                    }
                    runCatching { input?.stop() }
                    runCatching { input?.release() }
                }
                runCatching { decoder?.close() }
                runCatching { model?.close() }
            }
            if (detected && active()) handler.post {
                if (session != generation) return@post
                worker = null
                if (!foreground || PlanikWakeMicGate.busy || !screenAvailable()) {
                    refresh()
                    return@post
                }
                triggered = true
                onStatus("Планик услышал вас")
                try {
                    onWake()
                    handler.postDelayed({
                        if (foreground && triggered) {
                            triggered = false
                            refresh()
                        }
                    }, 5000)
                } catch (_: Exception) {
                    triggered = false
                    fail("Не удалось открыть диалог")
                }
            }
        }, "Planik-local-wake")
        worker = thread
        thread.start()
    }
}

/** Consent is local to this installation and account, off by default. */
@Composable
internal fun rememberPlanikWake(accountId: String?, ready: Boolean): PlanikWakeControls {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val preferences = remember(context) { context.getSharedPreferences("planik_foreground_wake", Context.MODE_PRIVATE) }
    var enabled by remember(accountId) {
        mutableStateOf(accountId != null && preferences.getBoolean("enabled_" + accountId, false))
    }
    var action by remember(accountId) { mutableStateOf(preferences.getString("action_" + accountId, "live") ?: "live") }
    var listeningMode by remember(accountId) {
        mutableStateOf(accountId?.let { wakeListeningMode(preferences,it) } ?: WAKE_APP)
    }
    val background = listeningMode != WAKE_APP
    val available = remember(context) { supported(context) }
    val activity = context as? ru.planirovych.app.MainActivity
    val latestAction by rememberUpdatedState(action)
    var autoOpen by remember { mutableStateOf(Settings.canDrawOverlays(context)) }
    val overlaySettings=rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        autoOpen=Settings.canDrawOverlays(context)
    }
    DisposableEffect(owner,context) {
        val observer=LifecycleEventObserver { _, event ->
            if(event==Lifecycle.Event.ON_RESUME) autoOpen=Settings.canDrawOverlays(context)
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    DisposableEffect(preferences, accountId) {
        val observer = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (accountId != null && (key == "background_" + accountId || key == "mode_" + accountId))
                listeningMode = wakeListeningMode(preferences,accountId)
            if (accountId != null && key == "enabled_" + accountId)
                enabled = preferences.getBoolean(key, false)
        }
        preferences.registerOnSharedPreferenceChangeListener(observer)
        onDispose { preferences.unregisterOnSharedPreferenceChangeListener(observer) }
    }
    var status by remember(accountId) { mutableStateOf("Выключено") }
    var requestedAccount by remember { mutableStateOf<String?>(null) }
    val currentAccount by rememberUpdatedState(accountId)
    fun setConsent(value: Boolean) {
        if (accountId == null) return
        preferences.edit().putBoolean("enabled_" + accountId, value).apply()
        enabled = value
        if (!value) {
            status = "Выключено"
            PlanikWakeBackgroundService.stop(context)
        }
    }
    var requestedBackgroundAccount by remember { mutableStateOf<String?>(null) }
    var requestedMode by remember { mutableStateOf(WAKE_BACKGROUND) }
    val requestBackgroundNotification = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val requested=requestedBackgroundAccount
        if(requested!=null && requested==currentAccount && granted && enabled) {
            saveWakeListeningMode(preferences,requested,requestedMode)
            listeningMode=requestedMode
        } else if(requested!=null && requested==currentAccount) {
            status="Для фонового режима разрешите уведомления Android"
        }
        requestedBackgroundAccount=null
    }
    val requestPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (requestedAccount != null && requestedAccount == currentAccount) {
            setConsent(granted)
            if (!granted) status = "Разрешите доступ к микрофону в настройках Android"
        }
        requestedAccount = null
    }
    DisposableEffect(owner, context, accountId, enabled, available, ready, listeningMode) {
        if (accountId == null || !enabled || !background || !available)
            PlanikWakeBackgroundService.stop(context)
        else PlanikWakeBackgroundService.stopOtherAccount(context,accountId)
        if (!enabled || !available || !ready || accountId == null) {
            onDispose { }
        } else if (background) {
            val callback: (String) -> Unit = { mode -> activity?.dispatchPlanikWake(accountId, mode) }
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> {
                        PlanikWakeDispatch.attach(accountId, callback)
                        status = if (PlanikWakeBackgroundService.start(context, accountId))
                            "Фоновое прослушивание включено" else "Не удалось включить фоновый микрофон"
                    }
                    Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_DESTROY ->
                        PlanikWakeDispatch.detach(callback)
                    else -> Unit
                }
            }
            owner.lifecycle.addObserver(observer)
            onDispose {
                owner.lifecycle.removeObserver(observer)
                PlanikWakeDispatch.detach(callback)
            }
        } else {
            val listener = ForegroundWakeListener(context, { status = it }) {
                activity?.dispatchPlanikWake(accountId, latestAction)
            }
            val gateObserver: () -> Unit = { listener.refresh() }
            val lifecycleObserver = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> listener.resume()
                    Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP, Lifecycle.Event.ON_DESTROY -> listener.pause()
                    else -> Unit
                }
            }
            PlanikWakeMicGate.addObserver(gateObserver)
            owner.lifecycle.addObserver(lifecycleObserver)
            // addObserver synchronizes to the current lifecycle, including RESUME.
            onDispose {
                owner.lifecycle.removeObserver(lifecycleObserver)
                PlanikWakeMicGate.removeObserver(gateObserver)
                listener.pause()
            }
        }
    }
    val visibleStatus = when {
        !available -> "Нужен Android 12+ с микрофоном"
        accountId == null -> "Откройте профиль"
        !enabled && status == "На паузе" -> "Выключено"
        enabled && !ready -> "Ожидание рабочего пространства"
        enabled && background -> PlanikWakeBackgroundService.status.ifBlank { status }
        else -> status
    }
    return PlanikWakeControls(enabled, available && accountId != null, visibleStatus,
        action, listeningMode,
        onAction = { value ->
            if (accountId != null && value in listOf("live", "voice")) {
                preferences.edit().putString("action_" + accountId, value).apply()
                action = value
            }
        },
        onListeningMode = { value ->
            if (accountId != null && value in listOf(WAKE_APP,WAKE_BACKGROUND,WAKE_ALWAYS)) {
                if (value != WAKE_APP && Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestedBackgroundAccount=accountId
                    requestedMode=value
                    requestBackgroundNotification.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    saveWakeListeningMode(preferences,accountId,value)
                    listeningMode = value
                    if (value == WAKE_APP) PlanikWakeBackgroundService.stop(context)
                }
            }
        },
        autoOpen=autoOpen,
        onAutoOpen={
            runCatching {
                overlaySettings.launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:"+context.packageName)))
            }.onFailure { status="Откройте разрешение поверх других приложений в настройках Android" }
        }
    ) { value ->
        if (!value) setConsent(false)
        else if (available && accountId != null) {
            if (hasPermission(context)) setConsent(true)
            else {
                requestedAccount = accountId
                requestPermission.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }
}
