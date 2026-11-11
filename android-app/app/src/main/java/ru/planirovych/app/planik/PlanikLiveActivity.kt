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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
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
        private const val BOOT_TIMEOUT_MS = 18_000L
        private const val CHECK_INTERVAL_MS = 550L
        private const val EXTRA_TASK_ID = "planik_task_id"
        private const val EXTRA_PROJECT_ID = "planik_project_id"
        private const val EXTRA_CHAT_ID = "planik_chat_id"

        fun intent(
            context: Context,
            taskId: String? = null,
            projectId: String? = null,
            chatId: String? = null
        ) = Intent(context, PlanikLiveActivity::class.java).apply {
            taskId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_TASK_ID, it) }
            projectId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_PROJECT_ID, it) }
            chatId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_CHAT_ID, it) }
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

    private val microphoneLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = voicePermission
        voicePermission = null
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
                if (!failed && !loaded) inspectReactRoot()
            }

            override fun onReceivedError(
                view: WebView?, request: WebResourceRequest?, error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "Main document load failed: code=${error?.errorCode}")
                    showFailure("Не удалось загрузить экран Планика. Проверьте интернет.")
                }
            }

            override fun onReceivedHttpError(
                view: WebView?, request: WebResourceRequest?, errorResponse: WebResourceResponse?
            ) {
                if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) {
                    Log.e(TAG, "Planik page HTTP ${errorResponse?.statusCode}")
                    showFailure("Сервер не открыл экран Планика (HTTP ${errorResponse?.statusCode}).")
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
        // Cookie copy is required for the authenticated SPA. Never put
        // credentials in the URL or expose them to JavaScript.
        val manager = CookieManager.getInstance()
        manager.setAcceptCookie(true)
        manager.setAcceptThirdPartyCookies(view, false)
        val host = base.newBuilder().encodedPath("/").query(null).build()
        val cookies = PersistentCookieJar(this).loadForRequest(host)
        if (cookies.isEmpty()) {
            Log.w(TAG, "No first-party session cookie available; opening login state.")
            view.loadUrl(targetUrl)
        } else {
            var pending = cookies.size
            cookies.forEach { cookie ->
                manager.setCookie(host.toString(), cookie.toString()) {
                    pending--
                    if (pending == 0 && !isFinishing && !isDestroyed) {
                        manager.flush()
                        view.loadUrl(targetUrl)
                    }
                }
            }
        }
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
                    showFailure("Планик не загрузился. Проверьте соединение и повторите.")
                    return
                }
                inspectReactRoot()
                handler.postDelayed(this, CHECK_INTERVAL_MS)
            }
        }, CHECK_INTERVAL_MS)
    }

    private fun inspectReactRoot() {
        val view = browser ?: return
        // Do not hide loading just because the static HTML is downloaded.
        // Wait until React paints the authenticated chat or voice dialog.
        val code = """(function() {
            var root = document.getElementById('root');
            if (!root || !root.children.length) return 'loading';
            if (document.querySelector('.planik-live-fullscreen, .miniapp-ai-chat-composer')) return 'ready';
            var text = (root.innerText || '').trim();
            if (text.indexOf('Ошибка') >= 0 && text.length < 350) return 'error';
            return text.length > 60 ? 'ready' : 'loading';
        })();"""
        view.evaluateJavascript(code) { result ->
            if (loaded || failed) return@evaluateJavascript
            when {
                result.contains("ready") -> markReady()
                result.contains("error") -> showFailure("Ошибка при запуске Планика. Попробуйте ещё раз.")
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
