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
    val background: Boolean,
    val onAction: (String) -> Unit,
    val onBackground: (Boolean) -> Unit,
    val autoOpen: Boolean,
    val onAutoOpen: () -> Unit,
    val onChange: (Boolean) -> Unit
)

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
    private val retry = Runnable { start() }

    private fun screenAvailable(): Boolean =
        context.getSystemService(PowerManager::class.java).isInteractive &&
            !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

    fun resume() {
        foreground = true
        triggered = false
        failed = false
        refresh()
    }

    fun pause() {
        foreground = false
        handler.removeCallbacksAndMessages(null)
        release()
        onStatus("На паузе")
    }

    fun refresh() {
        if (!foreground || PlanikWakeMicGate.busy || !screenAvailable()) {
            release()
            if (PlanikWakeMicGate.busy) triggered = false
            onStatus("На паузе")
        } else if (!triggered && !failed && worker == null) {
            handler.removeCallbacks(retry)
            handler.postDelayed(retry, 400)
        }
    }

    private fun release() {
        generation++
        handler.removeCallbacks(retry)
        synchronized(captureLock) {
            runCatching { recorder?.stop() }
            recorder = null
        }
        worker?.interrupt()
        worker = null
    }

    private fun fail(message: String) {
        release()
        failed = true
        onStatus(message)
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
                }
                report("Планик слушает")
                while (active()) {
                    val count = requireNotNull(input).read(buffer,0,buffer.size)
                    if (count < 0) {
                        if (active()) error("Микрофон недоступен")
                        break
                    }
                    if (count == 0) continue
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
                        fail("Не удалось запустить локальное распознавание. Проверьте интернет для модели и включите функцию повторно.")
                }
            } catch (error: LinkageError) {
                if (active()) handler.post {
                    if (session == generation) fail("Локальный движок недоступен на этом устройстве")
                }
            } finally {
                synchronized(captureLock) {
                    if (recorder === input) recorder = null
                    runCatching { input?.stop() }
                    runCatching { input?.release() }
                }
                runCatching { decoder?.close() }
                runCatching { model?.close() }
            }
            if (detected && active()) handler.post {
                if (session != generation || !foreground || PlanikWakeMicGate.busy ||
                    !screenAvailable()) return@post
                worker = null
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
    var background by remember(accountId) { mutableStateOf(accountId != null && preferences.getBoolean("background_" + accountId, false)) }
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
            if (accountId != null && key == "background_" + accountId)
                background = preferences.getBoolean(key, false)
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
    val requestBackgroundNotification = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val requested=requestedBackgroundAccount
        if(requested!=null && requested==currentAccount && granted && enabled) {
            preferences.edit().putBoolean("background_" + requested,true).apply()
            background=true
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
    DisposableEffect(owner, context, accountId, enabled, available, ready, background) {
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
        action, background,
        onAction = { value ->
            if (accountId != null && value in listOf("live", "voice")) {
                preferences.edit().putString("action_" + accountId, value).apply()
                action = value
            }
        },
        onBackground = { value ->
            if (accountId != null) {
                if (value && Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestedBackgroundAccount=accountId
                    requestBackgroundNotification.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    preferences.edit().putBoolean("background_" + accountId, value).apply()
                    background = value
                    if (!value) PlanikWakeBackgroundService.stop(context)
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
