package ru.planirovych.app.planik

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import ru.planirovych.app.BuildConfig
import ru.planirovych.app.core.network.PersistentCookieJar

/**
 * Reuse the actual Mini App HTML/CSS/SVG + live WebAudio implementation.
 * A second Compose copy would drift visually and break the exact card/Markdown
 * behaviour. All ordinary Android screens continue to be native.
 *
 * Login cookies are copied from the app's first-party, persistent OkHttp jar
 * to this first-party WebView (including HttpOnly / Secure). No token appears
 * in an Intent, URL, JavaScript interface or local page.
 */
class PlanikLiveActivity : ComponentActivity() {
    companion object {
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

    private var voicePermission: PermissionRequest? = null
    private var browser: WebView? = null
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
        PlanikWakeWordService.pauseForLiveSession()
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
        val target = base.newBuilder()
            .encodedPath("/android-planik")
            .addQueryParameter("openPlanik", "1")
        intent.getStringExtra(EXTRA_TASK_ID)?.let { target.addQueryParameter("taskId", it) }
        intent.getStringExtra(EXTRA_PROJECT_ID)?.let { target.addQueryParameter("projectId", it) }
        intent.getStringExtra(EXTRA_CHAT_ID)?.let { target.addQueryParameter("chatId", it) }

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
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                val url = request.url
                // Navigate only within the HTTPS application origin. No external
                // origin can inherit the session or request microphone access.
                if (url.scheme == "https" && url.host == base.host) return false
                if (url.scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                }
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val origin = request.origin
                    val permitted = origin.scheme == "https" &&
                        origin.host == base.host &&
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
        setContentView(view)

        // Set each saved cookie with the original flags, then load. Calling
        // loadUrl before async setCookie callbacks can cause a guest-session 401.
        val manager = CookieManager.getInstance()
        manager.setAcceptCookie(true)
        val host = base.newBuilder().encodedPath("/").query(null).build()
        val cookies = PersistentCookieJar(this).loadForRequest(host)
        if (cookies.isEmpty()) {
            view.loadUrl(target.build().toString())
        } else {
            var pending = cookies.size
            cookies.forEach { cookie ->
                manager.setCookie(host.toString(), cookie.toString()) {
                    pending--
                    if (pending == 0 && !isFinishing) {
                        manager.flush()
                        view.loadUrl(target.build().toString())
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        voicePermission?.deny()
        voicePermission = null
        browser?.apply {
            stopLoading()
            loadUrl("about:blank")
            destroy()
        }
        browser = null
        PlanikWakeWordService.resumeAfterLiveSession()
        super.onDestroy()
    }
}
