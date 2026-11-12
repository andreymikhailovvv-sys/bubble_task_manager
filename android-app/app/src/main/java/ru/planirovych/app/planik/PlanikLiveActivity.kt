package ru.planirovych.app.planik

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONTokener
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import okhttp3.Cookie
import okhttp3.HttpUrl
import ru.planirovych.app.PlanirovychApplication
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import ru.planirovych.app.BuildConfig
import ru.planirovych.app.core.network.PersistentCookieJar

/**
 * Fullscreen voice uses the exact same Mini App code, while the small native
 * launcher is a real SVG bitmap (not a transparent WebView).
 *
 * Never show a silent blank page: display loading, inspect the mounted React
 * root, and surface network/JavaScript/render errors with a retry action.
 * The website runs only on the authenticated HTTPS origin.
 */
class PlanikLiveActivity : ComponentActivity() {
    companion object {
        private const val TAG = "PlanikLive"
        private const val BOOT_TIMEOUT_MS = 40_000L
        private const val CHECK_INTERVAL_MS = 550L
        private const val EXTRA_TASK_ID = "planik_task_id"
        private const val EXTRA_PROJECT_ID = "planik_project_id"
        private const val EXTRA_CHAT_ID = "planik_chat_id"
        private const val EXTRA_EXPECTED_USER_ID = "planik_expected_user_id"
        private const val COOKIE_READY_TIMEOUT_MS = 4_000L

        fun intent(
            context: Context,
            taskId: String? = null,
            projectId: String? = null,
            chatId: String? = null,
            expectedUserId: String? = null
        ) = Intent(context, PlanikLiveActivity::class.java).apply {
            taskId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_TASK_ID, it) }
            projectId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_PROJECT_ID, it) }
            chatId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_CHAT_ID, it) }
            // Internal-only value from the chat that was actually open.
            // Never put user identity or session credentials into the website URL.
            expectedUserId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_EXPECTED_USER_ID, it) }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var voicePermission: PermissionRequest? = null
    private var browser: WebView? = null
    private var loadingIndicator: ProgressBar? = null
    private var loadingLabel: TextView? = null
    private var retryButton: Button? = null
    private var loaded = false
    private var failed = false
    private var deadline = 0L
    private var targetUrl = ""
    private var lastWebStage = ""
    private var lastWebDetail = ""
    private var lastConsoleError = false
    private var navigationStarted = false

    private val microphoneLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = voicePermission
        voicePermission = null
        Log.i(TAG, "Android microphone runtime permission result granted=$granted")
        if (granted) request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        else request?.deny()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(13, 19, 38)
        window.navigationBarColor = Color.rgb(9, 14, 27)
        window.decorView.systemUiVisibility = 0
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { finish() }
        })

        val base = BuildConfig.API_BASE_URL.toHttpUrlOrNull()
        if (base == null || base.scheme != "https") {
            finish()
            return
        }
        targetUrl = base.newBuilder()
            .encodedPath("/android-planik")
            .addQueryParameter("openPlanik", "1").apply {
                intent.getStringExtra(EXTRA_TASK_ID)?.let { addQueryParameter("taskId", it) }
                intent.getStringExtra(EXTRA_PROJECT_ID)?.let { addQueryParameter("projectId", it) }
                intent.getStringExtra(EXTRA_CHAT_ID)?.let { addQueryParameter("chatId", it) }
            }.build().toString()

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(13, 19, 38))
        }
        val view = WebView(this)
        browser = view
        view.setBackgroundColor(Color.rgb(13, 19, 38))
        with(view.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled = true
        }

        val baseHost = base.host
        view.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.i(TAG, "Web document started path=${url?.let { Uri.parse(it).path } ?: "unknown"}")
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && url.host == baseHost) return false
                if (url.scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.i(TAG, "Web document finished path=${url?.let { Uri.parse(it).path } ?: "unknown"}")
                if (!failed && !loaded) inspectReactRoot()
            }

            override fun onReceivedError(
                view: WebView?, request: WebResourceRequest?, error: WebResourceError?
            ) {
                val assetPath = request?.url?.path.orEmpty()
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "Main document load failed: code=${error?.errorCode}")
                    showFailure("Не удалось получить страницу Планика (сетевая ошибка ${error?.errorCode}).")
                } else if (assetPath.startsWith("/assets/") &&
                    (assetPath.endsWith(".js") || assetPath.endsWith(".css"))) {
                    Log.e(TAG, "App bundle asset failed: ${request?.url?.lastPathSegment} code=${error?.errorCode}")
                    showFailure("Не удалось загрузить файлы интерфейса Планика.")
                }
            }

            override fun onReceivedHttpError(
                view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?
            ) {
                val assetPath = request?.url?.path.orEmpty()
                if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) {
                    Log.e(TAG, "Planik page HTTP ${errorResponse?.statusCode}")
                    showFailure("Сервер не открыл экран Планика (HTTP ${errorResponse?.statusCode}).")
                } else if ((errorResponse?.statusCode ?: 0) >= 400 &&
                    assetPath.startsWith("/assets/") &&
                    (assetPath.endsWith(".js") || assetPath.endsWith(".css"))) {
                    Log.e(TAG, "App bundle asset HTTP ${errorResponse?.statusCode}: ${request?.url?.lastPathSegment}")
                    showFailure("Не загрузились скрипты Планика (HTTP ${errorResponse?.statusCode}).")
                }
            }

            override fun onRenderProcessGone(
                view: WebView?, detail: RenderProcessGoneDetail?
            ): Boolean {
                Log.e(TAG, "WebView renderer exited. crashed=${detail?.didCrash()}")
                browser = null
                root.removeView(view)
                view?.destroy()
                showFailure("Веб-компонент Планика остановился. Попробуйте открыть снова.")
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage?.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    lastConsoleError = true
                    Log.e(TAG, "Web runtime error at line ${consoleMessage.lineNumber()}: " +
                        consoleMessage.message().take(200))
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val origin = request.origin
                    val permitted = origin.scheme == "https" && origin.host == baseHost &&
                        request.resources.contentEquals(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    Log.i(TAG, "WebView microphone permission request accepted=$permitted androidGranted=${ContextCompat.checkSelfPermission(this@PlanikLiveActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED}")
                    if (!permitted) {
                        request.deny()
                        return@runOnUiThread
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@PlanikLiveActivity, Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        voicePermission?.deny()
                        voicePermission = request
                        microphoneLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (voicePermission == request) voicePermission = null
            }
        }
        root.addView(view, FrameLayout.LayoutParams(-1, -1))

        val overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 28, 48, 28)
            setBackgroundColor(Color.rgb(13, 19, 38))
        }
        loadingIndicator = ProgressBar(this)
        overlay.addView(loadingIndicator)
        loadingLabel = TextView(this).apply {
            text = "Открываю Планика…"
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, 22, 0, 14)
        }
        overlay.addView(loadingLabel)
        retryButton = Button(this).apply {
            text = "Повторить"
            visibility = View.GONE
            setOnClickListener {
                finish()
                startActivity(intent)
            }
        }
        overlay.addView(retryButton)
        root.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        deadline = android.os.SystemClock.uptimeMillis() + BOOT_TIMEOUT_MS
        startRootChecks()
        // Verify the native account BEFORE opening the embedded website.
        // A stale WebView may still have a perfectly valid cookie for another user.
        // Opening two accounts in the same UI makes existing tasks appear lost.
        lifecycleScope.launch {
            val currentUser = runCatching {
                (application as PlanirovychApplication).repository.establishSession()
            }.getOrElse { cause ->
                Log.e(TAG, "Native session verification failed", cause)
                showFailure("Не удалось проверить аккаунт Android. Проверьте подключение и повторите.")
                return@launch
            }
            if (failed || isFinishing || isDestroyed) return@launch
            val expectedUserId = intent.getStringExtra(EXTRA_EXPECTED_USER_ID)
            if (!expectedUserId.isNullOrBlank() && currentUser.id != expectedUserId) {
                Log.e(TAG, "Native session changed since the chat was opened; refusing cross-account Planik")
                showFailure("Аккаунт Android изменился. Данные прежнего аккаунта не удалены. Войдите в нужный аккаунт и повторите.")
                return@launch
            }

            val host = base.newBuilder().encodedPath("/").query(null).build()
            val authCookies = PersistentCookieJar(this@PlanikLiveActivity)
                .loadForRequest(host)
                .filter { it.name == "btm_auth" || it.name == "btm_device" }
            if (authCookies.isEmpty()) {
                Log.e(TAG, "Native authentication cookies missing after session verification")
                showFailure("Не удалось передать авторизацию Android. Войдите в аккаунт заново.")
                return@launch
            }
            loadWithVerifiedNativeSession(view, host, authCookies)
        }
    }

    private fun loadWithVerifiedNativeSession(
        view: WebView, host: HttpUrl, cookies: List<Cookie>, approvedReplacement: Boolean = false
    ) {
        val manager = CookieManager.getInstance()
        val origin = host.toString()
        manager.setAcceptCookie(true)
        manager.setAcceptThirdPartyCookies(view, false)

        // An older WebView can be the ONLY remaining credential for a guest's
        // workspace. Never erase another account's cookie silently.
        val previousAuth = manager.getCookie(origin).orEmpty().split(';').mapNotNull { item ->
            val part = item.trim()
            val index = part.indexOf('=')
            if (index <= 0) null else part.substring(0, index) to part.substring(index + 1)
        }.filter { it.first == "btm_auth" || it.first == "btm_device" }
        val nativeAuth = cookies.map { it.name to it.value }
        if (!approvedReplacement && previousAuth.isNotEmpty() &&
            (previousAuth.size != nativeAuth.size || previousAuth.toSet() != nativeAuth.toSet())) {
            Log.w(TAG, "Different WebView and Android sessions found; preserving original credentials")
            handler.removeCallbacksAndMessages(null)
            android.app.AlertDialog.Builder(this)
                .setTitle("Обнаружены два разных аккаунта")
                .setMessage(
                    "Планик сохранил сессию другого аккаунта. Возможно, именно там находятся ваши задачи. " +
                    "Ничего не удалено. Если хотите сохранить возможность доступа к прежнему аккаунту, " +
                    "нажмите «Отмена» и войдите в него в Android. Заменить сессию Планика текущим " +
                    "Android-аккаунтом можно только вручную."
                )
                .setNegativeButton("Отмена") { _, _ ->
                    showFailure("Аккаунты Android и Планика различаются. Войдите в аккаунт с вашими задачами.")
                }
                .setPositiveButton("Использовать Android") { _, _ ->
                    if (!isFinishing && !isDestroyed && !failed) {
                        deadline = android.os.SystemClock.uptimeMillis() + BOOT_TIMEOUT_MS
                        startRootChecks()
                        loadWithVerifiedNativeSession(view, host, cookies, approvedReplacement = true)
                    }
                }
                .setOnCancelListener {
                    showFailure("Аккаунты Android и Планика различаются. Войдите в аккаунт с вашими задачами.")
                }
                .show()
            return
        }

        // The native OkHttp jar and the embedded WebView have separate cookie
        // stores. Never call removeAllCookies(): it logs out *every* WebView
        // account and can make a return to the planner look like a sign-out.
        // Replace only our two first-party authentication cookies, preserving
        // unrelated WebView sessions and storage.
        val names = listOf("btm_auth", "btm_device")
        var removalsPending = names.size
        names.forEach { name ->
            manager.setCookie(origin, "$name=; Max-Age=0; Path=/") {
                if (failed || isFinishing || isDestroyed) return@setCookie
                removalsPending -= 1
                if (removalsPending == 0) {
                    var pending = cookies.size
                    cookies.forEach { cookie ->
                        manager.setCookie(origin, cookie.toString()) {
                            if (failed || isFinishing || isDestroyed || navigationStarted) return@setCookie
                            pending -= 1
                            if (pending == 0) loadIfCookiesMatch(view, origin, cookies)
                        }
                    }
                }
            }
        }
        // On some vendor WebViews the callback is delayed or never delivered.
        // Bounded retry verifies the actual cookies and never loads a stale session.
        handler.postDelayed({
            if (!navigationStarted && !failed && !isFinishing && !isDestroyed) {
                loadIfCookiesMatch(view, origin, cookies)
            }
        }, COOKIE_READY_TIMEOUT_MS)
    }

    private fun loadIfCookiesMatch(view: WebView, origin: String, expected: List<Cookie>) {
        if (failed || navigationStarted || isFinishing || isDestroyed) return
        val actual = CookieManager.getInstance().getCookie(origin)
            .orEmpty().split(';').mapNotNull { item ->
                val part = item.trim()
                val index = part.indexOf('=')
                if (index <= 0) null else part.substring(0, index) to part.substring(index + 1)
            }.filter { it.first == "btm_auth" || it.first == "btm_device" }
        val expectedPairs = expected.map { it.name to it.value }
        if (actual.size != expectedPairs.size || actual.toSet() != expectedPairs.toSet()) {
            Log.e(TAG, "WebView authentication cookies do not match native session; blocking launch")
            showFailure("Не удалось синхронизировать сессию Планика с Android. Повторите попытку.")
            return
        }
        CookieManager.getInstance().flush()
        navigationStarted = true
        Log.i(TAG, "Planik navigation starting with verified native session")
        view.loadUrl(targetUrl)
    }

    private fun showFailure(message: String) {
        if (isFinishing || isDestroyed || loaded) return
        failed = true
        handler.removeCallbacksAndMessages(null)
        loadingLabel?.text = message
        loadingIndicator?.visibility = View.GONE
        retryButton?.visibility = View.VISIBLE
        Log.w(TAG, "Planik not ready: ${message.take(120)}")
    }

    private fun markReady() {
        if (loaded || failed) return
        loaded = true
        handler.removeCallbacksAndMessages(null)
        (loadingLabel?.parent as? View)?.visibility = View.GONE
    }

    private fun startRootChecks() {
        handler.postDelayed(object : Runnable {
            override fun run() {
                if (loaded || failed || isFinishing || isDestroyed) return
                if (android.os.SystemClock.uptimeMillis() > deadline) {
                    val reason = when (lastWebStage) {
                        "legacy" -> "Веб-часть Планика на сервере не обновлена. Разверните последнюю версию сайта."
                        "html" -> "HTML Планика получен, но JavaScript не запустился. Проверьте загрузку файлов сайта."
                        "boot" -> "JavaScript Планика стартовал, но приложение не успело открыть чат."
                        "workspace-loading" -> "Не удалось загрузить данные аккаунта для Планика."
                        "chat-opening" -> "Чат открылся, но не удалось запустить голосовой режим."
                        "voice-starting" -> "Голосовой режим не появился на экране."
                        else -> if (lastConsoleError) "Ошибка сценария Планика. Проверьте Logcat: PlanikLive."
                            else "Не удалось открыть живой диалог. Повторите попытку."
                    }
                    Log.e(TAG, "Realtime boot timeout: stage=$lastWebStage detail=$lastWebDetail")
                    showFailure(reason)
                    return
                }
                inspectReactRoot()
                handler.postDelayed(this, CHECK_INTERVAL_MS)
            }
        }, CHECK_INTERVAL_MS)
    }

    private fun inspectReactRoot() {
        val view = browser ?: return
        // A mounted React root is not proof that the live dialog is usable:
        // it may contain only the login view, splash or a stale web bundle.
        // The frontend sets an explicit marker when LiveVoiceDialog mounts.
        val code = """(function () {
            var root = document.getElementById('root');
            var stage = document.documentElement.dataset.planikAndroid || 'legacy';
            var detail = document.documentElement.dataset.planikAndroidReason || '';
            var realtime = !!document.querySelector('.planik-live-fullscreen, .planik-live-compact');
            return [stage, detail, realtime ? '1' : '0', document.readyState,
                root ? root.children.length : 0, location.pathname, document.scripts.length].join('|');
        })();"""
        view.evaluateJavascript(code) { result ->
            if (loaded || failed) return@evaluateJavascript
            // evaluateJavascript returns a JSON-encoded JS string; do not
            // parse it by substring or accidentally treat quotes as a stage.
            val value = runCatching { JSONTokener(result).nextValue()?.toString().orEmpty() }
                .getOrDefault("")
            val parts = value.split('|')
            val stage = parts.getOrNull(0).orEmpty()
            val detail = parts.getOrNull(1).orEmpty()
            val visible = parts.getOrNull(2) == "1"
            if (stage.isNotBlank() && (stage != lastWebStage || detail != lastWebDetail)) {
                lastWebStage = stage
                lastWebDetail = detail
                Log.i(TAG, "Web stage=$stage detail=$detail rendered=$visible readyState=${parts.getOrNull(3)} rootChildren=${parts.getOrNull(4)} path=${parts.getOrNull(5)} scripts=${parts.getOrNull(6)}")
            }
            when {
                visible && stage == "live" -> markReady()
                stage == "error" -> showFailure(when (detail) {
                    "workspace-data" -> "Не удалось получить данные аккаунта. Проверьте авторизацию Планировыча."
                    "script-load-failed" -> "Не удалось загрузить основной JavaScript Планика с сервера."
                    "composer-not-mounted" -> "Не удалось открыть голосовой чат. Проверьте обновление сайта."
                    else -> "Ошибка запуска живого общения с Плаником."
                })
            }
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        voicePermission?.deny()
        voicePermission = null
        browser?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        browser = null
        super.onDestroy()
    }
}
