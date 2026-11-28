package ru.planirovych.app.planik

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.GradientDrawable
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
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
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONTokener
import ru.planirovych.app.BuildConfig
import ru.planirovych.app.PlanirovychApplication
import ru.planirovych.app.core.network.PersistentCookieJar
import ru.planirovych.app.data.model.QUICK_AI_THREAD_ID
import ru.planirovych.app.feature.home.playVoiceInputStarted
import java.io.File
import java.util.UUID
import kotlin.math.sin

/** System-owned bottom panel. It never opens the planner unless the user taps
 * the explicit chat link. Only the active session has microphone access. */
internal class PlanikAssistantPanel(
    private val context:Context,
    private val onClose:()->Unit,
    private val onOpenChat:(String)->Unit
) {
    private fun dp(v:Int)=(v*context.resources.displayMetrics.density).toInt()
    private val repository get()=(context.applicationContext as PlanirovychApplication).repository
    private val handler=Handler(Looper.getMainLooper())
    private var scope:CoroutineScope?=null
    private var request:PlanikSystemAssistant.Invocation?=null
    private var recorder:MediaRecorder?=null
    private var file:File?=null
    private var startedAt=0L
    private var browser:WebView?=null
    private var active=false
    private var generation=0
    private var micOwned=false
    private var work:Job?=null
    private var transcript:TextView?=null
    private var status:TextView?=null
    private var waveform:VoiceWave?=null
    private val panel=LinearLayout(context).apply {
        orientation=LinearLayout.VERTICAL
        background=GradientDrawable(GradientDrawable.Orientation.TL_BR,
            intArrayOf(0xff25294a.toInt(),0xff14192e.toInt(),0xff111829.toInt())).apply {
            cornerRadius=dp(28).toFloat()
            setStroke(dp(1),0xff514d80.toInt())
        }
        clipToOutline=true
        elevation=dp(18).toFloat()
        setPadding(dp(16),dp(10),dp(16),dp(14))
        isClickable=true
    }
    val root=FrameLayout(context).apply {
        setBackgroundColor(Color.TRANSPARENT)
        isClickable=true
        setOnClickListener { onClose() }
        addView(panel,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM).apply {
            setMargins(dp(10),0,dp(10),dp(10))
        })
    }

    private fun label(text:String,size:Float,color:Int=0xfff1f3ff.toInt())=TextView(context).apply {
        this.text=text
        textSize=size
        setTextColor(color)
        gravity=Gravity.CENTER
    }

    private fun button(text:String,action:()->Unit)=Button(context).apply {
        this.text=text
        isAllCaps=false
        textSize=14f
        setTextColor(0xfff4f3ff.toInt())
        background=GradientDrawable().apply {
            setColor(0xff3b3863.toInt())
            cornerRadius=dp(18).toFloat()
        }
        setOnClickListener { action() }
    }

    private fun header(title:String,account:String?) {
        panel.removeAllViews()
        val grip=View(context).apply {
            background=GradientDrawable().apply {setColor(0xff817ca6.toInt());cornerRadius=dp(4).toFloat()}
        }
        panel.addView(grip,LinearLayout.LayoutParams(dp(38),dp(4)).apply {
            gravity=Gravity.CENTER_HORIZONTAL;bottomMargin=dp(8)
        })
        val row=LinearLayout(context).apply {gravity=Gravity.CENTER_VERTICAL}
        row.addView(label(title,18f).apply {gravity=Gravity.START or Gravity.CENTER_VERTICAL},
            LinearLayout.LayoutParams(0,dp(40),1f))
        if(account!=null)row.addView(button("В чат"){onOpenChat(account)},LinearLayout.LayoutParams(dp(85),dp(40)).apply {marginEnd=dp(8)})
        row.addView(button("×"){onClose()}.apply {contentDescription="Закрыть Планика"},
            LinearLayout.LayoutParams(dp(44),dp(40)))
        panel.addView(row,LinearLayout.LayoutParams(-1,-2))
    }

    private fun animateIn() {
        panel.animate().cancel()
        panel.alpha=0f
        panel.translationY=dp(100).toFloat()
        panel.animate().translationY(0f).alpha(1f).setDuration(260)
            .setInterpolator(DecelerateInterpolator(1.5f)).start()
    }

    fun show(invocation:PlanikSystemAssistant.Invocation?) {
        close()
        active=true
        val token=++generation
        request=invocation
        scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
        header(if(invocation?.action=="live")"Планик · живое общение" else "Планик",invocation?.account)
        animateIn()
        if(invocation==null) {
            panel.addView(label("Включите системный режим в настройках Планировыча. Для вызова устройство должно быть разблокировано.",15f))
            return
        }
        if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            panel.addView(label("Разрешите доступ к микрофону в настройках Android.",15f))
            return
        }
        // The Vosk listener and native chat must not compete with this session.
        if(PlanikWakeMicGate.busy) {
            panel.addView(label("Микрофон уже используется Плаником. Завершите другой голосовой сеанс.",15f))
            return
        }
        PlanikWakeMicGate.acquire(this)
        micOwned=true
        val loading=label("Подключаюсь…",15f)
        panel.addView(loading,LinearLayout.LayoutParams(-1,dp(80)))
        work=scope?.launch {
            try {
                val current=repository.establishSession()
                if(!valid(token))return@launch
                val request=invocation
                if(current.id!=request.account) {
                    fail("Аккаунт Android изменился. Откройте Планировыч и проверьте вход.")
                    return@launch
                }
                panel.removeView(loading)
                if(invocation.action=="voice")startDictation(invocation,token)
                else startLive(invocation,token)
            } catch(cancel:CancellationException) { throw cancel }
            catch(_:Exception) {if(valid(token))fail("Не удалось подключиться к аккаунту. Проверьте интернет.")}
        }
    }

    private fun valid(token:Int):Boolean=active && generation==token && wakeDeviceUnlocked(context)
    private fun stillSelected(invocation:PlanikSystemAssistant.Invocation):Boolean =
        PlanikSystemAssistant.invocation(context)?.account==invocation.account
    private fun releaseGate() {
        if(micOwned) {micOwned=false;PlanikWakeMicGate.release(this)}
    }

    @Suppress("DEPRECATION")
    private fun startDictation(invocation:PlanikSystemAssistant.Invocation,token:Int) {
        val mascot=ImageView(context).apply {
            contentDescription="Планик"
            scaleType=ImageView.ScaleType.FIT_CENTER
            runCatching {
                val source=context.assets.open("planik_idle.svg").bufferedReader().use{it.readText()}
                val picture=SVG.getFromString(source).renderToPicture(280,220)
                val bitmap=Bitmap.createBitmap(280,220,Bitmap.Config.ARGB_8888)
                Canvas(bitmap).drawPicture(picture)
                setImageBitmap(bitmap)
            }
        }
        panel.addView(mascot,LinearLayout.LayoutParams(dp(146),dp(108)).apply {gravity=Gravity.CENTER_HORIZONTAL})
        status=label("Слушаю…",19f)
        panel.addView(status)
        val wave=VoiceWave(context)
        waveform=wave
        panel.addView(wave,LinearLayout.LayoutParams(-1,dp(42)))
        val controls=LinearLayout(context).apply {gravity=Gravity.CENTER}
        controls.addView(button("Отмена"){onClose()},LinearLayout.LayoutParams(0,dp(46),1f).apply{marginEnd=dp(8)})
        val send=button("Отправить"){finishDictation(invocation,token)}
        controls.addView(send,LinearLayout.LayoutParams(0,dp(46),1f))
        panel.addView(controls,LinearLayout.LayoutParams(-1,-2))
        try {
            val output=File.createTempFile("planik-system-voice-",".m4a",context.cacheDir)
            file=output
            val native=MediaRecorder()
            recorder=native
            native.setAudioSource(MediaRecorder.AudioSource.MIC)
            native.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            native.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            native.setAudioSamplingRate(44100)
            native.setAudioEncodingBitRate(64000)
            native.setOutputFile(output.absolutePath)
            native.prepare()
            native.start()
            startedAt=SystemClock.elapsedRealtime()
            playVoiceInputStarted(context)
        } catch(_:Exception) {
            fail("Не удалось запустить микрофон.")
            return
        }
        scope?.launch {
            while(valid(token) && recorder!=null) {
                val elapsed=(SystemClock.elapsedRealtime()-startedAt)/1000L
                status?.text="Слушаю · "+String.format(java.util.Locale.ROOT,"%02d:%02d",elapsed/60,elapsed%60)
                val amplitude=runCatching{recorder?.maxAmplitude?:0}.getOrDefault(0)
                wave.level=(amplitude/16000f).coerceIn(0f,1f)
                wave.invalidate()
                if(elapsed>=120){finishDictation(invocation,token);break}
                delay(75)
            }
            if(active && generation==token && !wakeDeviceUnlocked(context))onClose()
        }
    }

    private fun stopRecorder():Boolean {
        val native=recorder ?: return false
        recorder=null
        val stopped=runCatching{native.stop()}.isSuccess
        runCatching {native.release()}
        return stopped
    }

    private fun finishDictation(invocation:PlanikSystemAssistant.Invocation,token:Int) {
        if(!valid(token) || recorder==null)return
        val duration=(SystemClock.elapsedRealtime()-startedAt)/1000.0
        val output=file
        file=null
        val stopped=stopRecorder()
        releaseGate()
        if(!stopped || output==null || duration<.25) {
            output?.delete()
            fail("Запись слишком короткая. Вызовите Планика ещё раз.")
            return
        }
        header("Планик",invocation.account)
        status=label("Распознаю запрос…",17f)
        panel.addView(status,LinearLayout.LayoutParams(-1,dp(48)))
        work=scope?.launch {
            try {
                val bytes=withContext(Dispatchers.IO) {
                    require(output.length() in 100L..6L*1024*1024){"Запись слишком большая"}
                    output.readBytes()
                }
                check(stillSelected(invocation) && repository.establishSession().id==invocation.account)
                if(!valid(token))return@launch
                val question=repository.transcribeVoice(bytes,duration.coerceAtMost(120.0))
                if(!valid(token))return@launch
                panel.addView(label(question,15f).apply {gravity=Gravity.START;maxLines=4})
                status?.text="Думаю…"
                val project=repository.loadGeneralAiProjects().firstOrNull { it.chats.any { chat -> chat.id==QUICK_AI_THREAD_ID } }
                    ?: error("Откройте Планировыч один раз, чтобы создать быстрый чат")
                val thread=project.chats.first { it.id==QUICK_AI_THREAD_ID }
                val history=repository.loadQuickAiHistory()
                check(stillSelected(invocation) && repository.establishSession().id==invocation.account)
                if(!valid(token))return@launch
                val response=repository.askGeneralAi(project,thread,history,UUID.randomUUID().toString(),
                    question,emptyList(),onProgress={})
                if(!valid(token))return@launch
                status?.text="Готово"
                val answer=response["answer"]?.jsonPrimitive?.contentOrNull.orEmpty()
                val result=label(answer.ifBlank{"Ответ сохранён в чате Планировыча."},15f).apply {
                    gravity=Gravity.START
                    setTextIsSelectable(true)
                }
                transcript=result
                panel.addView(ScrollView(context).apply {addView(result)},LinearLayout.LayoutParams(-1,dp(164)))
                panel.addView(label("Карточки действий и полный ответ доступны в чате.",12f,0xffb9b7d8.toInt()))
                PlanikLiveUpdates.publish()
            } catch(cancel:CancellationException){throw cancel}
            catch(_:Exception){if(valid(token))fail("Не удалось обработать запрос. Проверьте интернет или откройте чат.")}
            finally {output.delete()}
        }
    }

    private fun startLive(invocation:PlanikSystemAssistant.Invocation,token:Int) {
        val base=BuildConfig.API_BASE_URL.toHttpUrlOrNull()
        if(base==null || base.scheme!="https") {fail("Не удалось открыть защищённое соединение.");return}
        val host=base.newBuilder().encodedPath("/").query(null).build()
        val target=base.newBuilder().encodedPath("/android-planik").query(null)
            .addQueryParameter("openPlanik","1").build().toString()
        val cookies=PersistentCookieJar(context).loadForRequest(host)
            .filter{it.name=="btm_auth" || it.name=="btm_device"}
        if(cookies.isEmpty()){fail("Откройте Планировыч и войдите в аккаунт.");return}
        val manager=CookieManager.getInstance()
        val origin=host.toString()
        fun authPairs()=manager.getCookie(origin).orEmpty().split(';').mapNotNull {
            val part=it.trim();val index=part.indexOf('=')
            if(index<=0)null else part.substring(0,index) to part.substring(index+1)
        }.filter{it.first=="btm_auth" || it.first=="btm_device"}.toSet()
        val expected=cookies.map{it.name to it.value}.toSet()
        val previous=authPairs()
        // Never replace an unrelated WebView account from the system overlay.
        if(previous.isNotEmpty() && previous!=expected) {
            fail("Аккаунты различаются. Откройте живое общение в Планировыче для подтверждения аккаунта.")
            return
        }
        val frame=FrameLayout(context)
        val view=WebView(context)
        browser=view
        view.setBackgroundColor(Color.TRANSPARENT)
        view.alpha=0f
        with(view.settings) {
            javaScriptEnabled=true;domStorageEnabled=true;mediaPlaybackRequiresUserGesture=false
            allowFileAccess=false;allowContentAccess=false;javaScriptCanOpenWindowsAutomatically=false
            setSupportMultipleWindows(false)
            mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            safeBrowsingEnabled=true
        }
        manager.setAcceptCookie(true)
        manager.setAcceptThirdPartyCookies(view,false)
        val waiting=label("Подключаю живое общение…",15f)
        frame.addView(view,FrameLayout.LayoutParams(-1,-1))
        frame.addView(waiting,FrameLayout.LayoutParams(-1,-1))
        val available=(context.resources.displayMetrics.heightPixels/context.resources.displayMetrics.density).toInt()
        panel.addView(frame,LinearLayout.LayoutParams(-1,dp((available*0.51f).toInt().coerceIn(250,430))))
        var ready=false
        var missing=0
        val deadline=SystemClock.elapsedRealtime()+40_000L
        val script="""(function(){
          var css=document.getElementById('planik-system-panel');
          if(!css){css=document.createElement('style');css.id='planik-system-panel';
          css.textContent='html,body{background:transparent!important} body *{visibility:hidden!important;pointer-events:none!important} .planik-live-fullscreen,.planik-live-fullscreen *,.planik-live-compact,.planik-live-compact *{visibility:visible!important;pointer-events:auto!important} .planik-live-fullscreen{background:transparent!important} .planik-live-fullscreen::before{display:none!important} .planik-live-stage{height:100%!important;padding:6px 10px!important} .planik-live-header{display:none!important} .planik-live-center{gap:3px!important;justify-content:center!important} .planik-live-avatar{width:124px!important;height:106px!important} .planik-live-phase{margin-top:0!important} .planik-live-visualizer{height:25px!important;margin:0!important} .planik-live-transcript{max-height:95px!important} .planik-live-caption{display:none!important} .planik-live-footer{padding:2px!important} .planik-live-compact{bottom:12px!important;right:50%!important;transform:translateX(50%)!important}';
          document.head.appendChild(css);}
          return document.querySelector('.planik-live-fullscreen,.planik-live-compact')?'live':(document.documentElement.dataset.planikAndroid||'pending');
        })();"""
        fun watch() {
            if(!valid(token) || browser!==view) {if(active && generation==token)onClose();return}
            if(!stillSelected(invocation)){onClose();return}
            view.evaluateJavascript(script) {raw->
                if(!valid(token) || browser!==view)return@evaluateJavascript
                val value=runCatching{JSONTokener(raw).nextValue()?.toString()}.getOrNull()
                when {
                    value=="live" -> {
                        missing=0
                        if(!ready){ready=true;waiting.visibility=View.GONE;view.animate().alpha(1f).setDuration(180).start()}
                    }
                    value=="ended" -> {onClose();return@evaluateJavascript}
                    value=="error" || (!ready && SystemClock.elapsedRealtime()>deadline) -> {
                        fail("Не удалось подключить живое общение.");return@evaluateJavascript
                    }
                    ready && ++missing>=4 -> {onClose();return@evaluateJavascript}
                }
                handler.postDelayed({watch()},350L)
            }
        }
        view.webViewClient=object:WebViewClient(){
            override fun shouldOverrideUrlLoading(v:WebView?,r:WebResourceRequest):Boolean =
                r.url.scheme!="https" || r.url.host!=base.host ||
                    (r.isForMainFrame && r.url.encodedPath!="/android-planik")
            override fun onReceivedError(v:WebView?,r:WebResourceRequest?,e:WebResourceError?){
                if(r?.isForMainFrame==true && valid(token))fail("Ошибка соединения с Плаником.")
            }
            override fun onReceivedHttpError(v:WebView?,r:WebResourceRequest?,e:WebResourceResponse?){
                if(r?.isForMainFrame==true && valid(token))fail("Сервер не открыл голосовой диалог.")
            }
            override fun onRenderProcessGone(v:WebView?,detail:RenderProcessGoneDetail?):Boolean{
                if(browser===v){browser=null;frame.removeView(v);v?.destroy();if(valid(token))fail("Голосовой компонент остановился.")}
                return true
            }
        }
        view.webChromeClient=object:WebChromeClient(){
            override fun onPermissionRequest(r:PermissionRequest){
                if(valid(token) && browser===view && r.origin.scheme=="https" && r.origin.host==base.host &&
                    r.resources.contentEquals(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) &&
                    ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)
                    r.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else r.deny()
            }
        }
        var loaded=false
        fun loadIfVerified(){
            if(!valid(token) || browser!==view || loaded)return
            if(authPairs()!=expected){fail("Не удалось подтвердить авторизацию Планика.");return}
            loaded=true
            manager.flush()
            view.loadUrl(target)
            handler.postDelayed({watch()},700L)
        }
        if(previous==expected)loadIfVerified()
        else {
            var pending=cookies.size
            cookies.forEach {cookie->manager.setCookie(origin,cookie.toString()){
                if(valid(token) && browser===view && --pending==0)loadIfVerified()
            }}
            handler.postDelayed({loadIfVerified()},4000L)
        }
    }

    private fun destroyBrowser(){
        val view=browser ?: return
        browser=null
        (view.parent as? android.view.ViewGroup)?.removeView(view)
        runCatching {view.stopLoading();view.loadUrl("about:blank");view.destroy()}
    }
    private fun fail(message:String) {
        handler.removeCallbacksAndMessages(null)
        stopRecorder()
        file?.delete();file=null
        destroyBrowser()
        releaseGate()
        header("Планик",request?.account)
        panel.addView(label(message,15f),LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12);bottomMargin=dp(12)})
    }

    fun close(){
        if(!active)return
        active=false
        generation++
        handler.removeCallbacksAndMessages(null)
        scope?.cancel();scope=null;work=null
        stopRecorder()
        file?.delete();file=null
        destroyBrowser()
        releaseGate()
        request=null;status=null;transcript=null;waveform=null
        panel.animate().cancel()
        panel.removeAllViews()
        PlanikLiveUpdates.publish()
    }

    private class VoiceWave(context:Context):View(context) {
        var level=0f
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas:Canvas) {
            super.onDraw(canvas)
            val step=width/31f
            val time=SystemClock.uptimeMillis()/160.0
            for(i in 0..30){
                val envelope=1f-kotlin.math.abs(i-15)/17f
                val pulse=(0.65+0.35*sin(time+i*.66)).toFloat()
                val h=height*(.13f+level*.76f*pulse*envelope)
                paint.color=if(i%2==0)0xff8ee8e6.toInt() else 0xffa99bff.toInt()
                paint.alpha=(90+level*155).toInt()
                val x=step*(i+.5f)
                canvas.drawRoundRect(x-step*.19f,(height-h)/2,x+step*.19f,(height+h)/2,step*.2f,step*.2f,paint)
            }
        }
    }
}
