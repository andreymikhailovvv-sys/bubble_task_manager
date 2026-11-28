package ru.planirovych.app.planik

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
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
    val onChange: (Boolean) -> Unit
)

internal fun supported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        runCatching { SpeechRecognizer.isOnDeviceRecognitionAvailable(context) }.getOrDefault(false)

internal fun hasPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

internal fun isPlanikWakePhrase(raw: String): Boolean {
    val normalized = raw.lowercase(Locale.forLanguageTag("ru"))
        .replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    return Regex("(^|\\s)(эй|хэй)\\s+планн?ик(?=\\s|$)").containsMatchIn(normalized)
}

/**
 * Experimental foreground-only detector. Never falls back to cloud recognition.
 * Android SpeechRecognizer is not an always-on hotword engine; sessions can have
 * gaps and the local Russian model must be installed on the device.
 */
internal class ForegroundWakeListener(
    private val context: Context,
    private val onStatus: (String) -> Unit,
    private val onWake: () -> Unit
) {
    private val handler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var generation = 0
    private var foreground = false
    private var triggered = false
    private var failures = 0
    private var failed = false
    private val retry = Runnable { start() }

    private fun screenAvailable(): Boolean =
        context.getSystemService(PowerManager::class.java).isInteractive &&
            !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked

    fun resume() {
        foreground = true
        triggered = false
        failed = false
        failures = 0
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
        } else if (!triggered && !failed && recognizer == null) {
            schedule(650)
        }
    }

    private fun release() {
        generation++
        handler.removeCallbacks(retry)
        val old = recognizer
        recognizer = null
        runCatching { old?.cancel() }
        runCatching { old?.destroy() }
    }

    private fun schedule(delay: Long) {
        handler.removeCallbacks(retry)
        if (foreground && !triggered && !failed && !PlanikWakeMicGate.busy)
            handler.postDelayed(retry, delay)
    }

    private fun fail(message: String) {
        release()
        failed = true
        onStatus(message)
    }

    private fun start() {
        if (!foreground || triggered || failed || PlanikWakeMicGate.busy ||
            !screenAvailable() || recognizer != null) return
        if (!hasPermission(context)) {
            fail("Нет доступа к микрофону")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !supported(context)) {
            fail("Локальное распознавание недоступно")
            return
        }
        val session = ++generation
        try {
            val local = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            recognizer = local
            local.setRecognitionListener(object : RecognitionListener {
                private fun valid() = session == generation && foreground &&
                    !triggered && !PlanikWakeMicGate.busy && screenAvailable()
                private fun detected(results: Bundle?): Boolean {
                    if (!valid()) return false
                    val values = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
                    if (values.none(::isPlanikWakePhrase)) return false
                    triggered = true
                    release()
                    onStatus("Планик услышал вас")
                    try {
                        onWake()
                        handler.postDelayed({
                            if (foreground && triggered) {
                                triggered = false
                                refresh()
                            }
                        }, 2500)
                    } catch (_: Exception) {
                        triggered = false
                        fail("Не удалось открыть диалог. Выключите и включите функцию.")
                    }
                    return true
                }
                override fun onReadyForSpeech(params: Bundle?) {
                    if (valid()) onStatus("Планик слушает")
                }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {
                    detected(partialResults)
                }
                override fun onResults(results: Bundle?) {
                    if (!valid() || detected(results)) return
                    failures = 0
                    release()
                    schedule(450)
                }
                override fun onError(error: Int) {
                    if (!valid()) return
                    release()
                    when (error) {
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                            fail("Нет доступа к микрофону")
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
                        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
                            fail("Русская офлайн-модель недоступна. Проверьте настройки распознавания Android.")
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                            failures = 0
                            schedule(450)
                        }
                        else -> retryAfterFailure()
                    }
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            }
            onStatus("Запуск локального распознавания…")
            local.startListening(request)
        } catch (_: Exception) {
            release()
            retryAfterFailure()
        }
    }

    private fun retryAfterFailure() {
        failures++
        if (failures >= 5) {
            fail("Распознавание остановлено. Выключите и включите функцию или откройте приложение заново.")
        } else {
            onStatus("Повторное подключение микрофона…")
            schedule(2000)
        }
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
    val requestPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (requestedAccount != null && requestedAccount == currentAccount) {
            setConsent(granted)
            if (!granted) status = "Разрешите доступ к микрофону в настройках Android"
        }
        requestedAccount = null
    }
    DisposableEffect(owner, context, accountId, enabled, available, ready, background) {
        if (accountId == null || !enabled || !background)
            PlanikWakeBackgroundService.stop(context)
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
        !available -> "Нужен Android 12+ с локальным распознаванием речи"
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
                    status = "Разрешите уведомления в настройках Android для фонового режима"
                } else {
                    preferences.edit().putBoolean("background_" + accountId, value).apply()
                    background = value
                    if (!value) PlanikWakeBackgroundService.stop(context)
                }
            }
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
