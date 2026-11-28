package ru.planirovych.app.planik

import android.Manifest
import android.animation.ValueAnimator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.res.ColorStateList
import android.graphics.drawable.RippleDrawable
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.animation.PathInterpolator
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.noties.markwon.Markwon
import io.noties.markwon.ext.tables.TablePlugin
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import ru.planirovych.app.feature.home.nativeAiProgressLabel
import ru.planirovych.app.feature.home.planikActionSvg
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
    private var expanded=false
    private var entering=false
    private var closing=false
    private var bottomInset=dp(24)
    private var heightAnimation:ValueAnimator?=null
    private var mascotJob:Job?=null
    private var mascotMode="idle"
    private var mascotFloat:ObjectAnimator?=null
    private var progressView:ProgressSegments?=null
    private val markdown by lazy { Markwon.builder(context).usePlugin(TablePlugin.create(context)).build() }
    private val body=LinearLayout(context).apply {
        orientation=LinearLayout.VERTICAL
        gravity=Gravity.CENTER_HORIZONTAL
    }
    private val panel=LinearLayout(context).apply {
        orientation=LinearLayout.VERTICAL
        background=GradientDrawable(GradientDrawable.Orientation.TL_BR,
            intArrayOf(0xff25294a.toInt(),0xff14192e.toInt(),0xff111829.toInt())).apply {
            cornerRadius=dp(28).toFloat()
            setStroke(dp(1),0xff514d80.toInt())
        }
        clipToOutline=true
        elevation=dp(18).toFloat()
        setPadding(dp(16),dp(6),dp(16),dp(16))
        isClickable=true
    }
    val root=FrameLayout(context).apply {
        setBackgroundColor(Color.TRANSPARENT)
        isClickable=true
        setOnClickListener { dismissAnimated() }
        addView(panel,FrameLayout.LayoutParams(-1,dp(330),Gravity.BOTTOM).apply {
            setMargins(dp(12),0,dp(12),dp(36))
        })
        panel.visibility=View.INVISIBLE
        ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
            val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or
                WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.mandatorySystemGestures())
            bottomInset=maxOf(dp(16),safe.bottom)+dp(12)
            if(active)applyGeometry()
            insets
        }
        addOnLayoutChangeListener { _,l,t,r,b,ol,ot,orr,ob ->
            if(active && (r-l!=orr-ol || b-t!=ob-ot))applyGeometry()
        }
    }

    private fun screenHeight():Int = (root.height.takeIf{it>0}
        ?:context.resources.displayMetrics.heightPixels).coerceAtLeast(dp(160))
    private fun targetHeight(open:Boolean):Int {
        val available=(screenHeight()-bottomInset-dp(16)).coerceAtLeast(dp(120))
        val compact=dp(if(request?.action=="live")420 else 350).coerceAtMost((available*.85f).toInt())
        return if(open)maxOf(compact,(available*.69f).toInt()).coerceAtMost(available) else compact
    }
    private fun setPanelHeight(value:Int) {
        val params=panel.layoutParams as FrameLayout.LayoutParams
        if(params.height!=value || params.bottomMargin!=bottomInset) {
            params.height=value
            params.bottomMargin=bottomInset
            panel.layoutParams=params
        }
    }
    private fun applyGeometry() {
        if(!closing && heightAnimation?.isRunning!=true)setPanelHeight(targetHeight(expanded))
    }
    private fun settle(open:Boolean) {
        expanded=open
        heightAnimation?.cancel()
        val from=panel.height.takeIf{it>0} ?:targetHeight(!open)
        heightAnimation=ValueAnimator.ofInt(from,targetHeight(open)).apply {
            duration=300
            interpolator=PathInterpolator(.2f,.8f,.2f,1f)
            addUpdateListener { setPanelHeight(it.animatedValue as Int) }
            start()
        }
    }

    private fun dismissAnimated() {
        if(closing || !active)return
        closing=true
        heightAnimation?.cancel()
        stopRecorder()
        file?.delete();file=null
        destroyBrowser()
        releaseGate()
        scope?.cancel()
        panel.animate().cancel()
        panel.animate().translationY((panel.height+bottomInset+dp(20)).toFloat()).alpha(0f)
            .setDuration(240).setInterpolator(PathInterpolator(.4f,0f,1f,1f))
            .withEndAction { if(active)onClose() }.start()
        root.animate().alpha(0f).setDuration(230).start()
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
        minHeight=0;minimumHeight=0;minWidth=0;minimumWidth=0
        setPadding(dp(8),0,dp(8),0)
        stateListAnimator=null
        background=RippleDrawable(ColorStateList.valueOf(0x66b6a5ff),
            GradientDrawable().apply {
                setColor(0xff3b3863.toInt())
                cornerRadius=dp(18).toFloat()
            },null)
        setOnClickListener {
            performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            action()
        }
        setOnTouchListener { v,event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> v.animate().scaleX(.96f).scaleY(.96f).setDuration(85).start()
                MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL ->
                    v.animate().scaleX(1f).scaleY(1f).setDuration(150).start()
            }
            false
        }
    }

    private fun header(title:String,account:String?) {
        stopMascot()
        progressView=null
        panel.removeAllViews()
        body.removeAllViews()
        val grip=FrameLayout(context).apply {
            contentDescription="Потяните вверх для раскрытия, вниз для закрытия"
            isClickable=true
            isFocusable=true
            addView(View(context).apply {
                background=GradientDrawable().apply {setColor(0xffa09abf.toInt());cornerRadius=dp(4).toFloat()}
            },FrameLayout.LayoutParams(dp(38),dp(4),Gravity.CENTER))
            setOnClickListener {
                performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                settle(!expanded)
            }
        }
        var downY=0f
        var downHeight=0
        var dragged=false
        val slop=ViewConfiguration.get(context).scaledTouchSlop
        grip.setOnTouchListener { v,event ->
            when(event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    heightAnimation?.cancel()
                    downY=event.rawY;downHeight=panel.height;dragged=false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val delta=downY-event.rawY
                    if(kotlin.math.abs(delta)>slop)dragged=true
                    if(dragged) {
                        setPanelHeight((downHeight+delta).toInt().coerceIn(dp(90).coerceAtMost(targetHeight(false)),targetHeight(true)))
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val delta=downY-event.rawY
                    if(!dragged)v.performClick()
                    else if(delta < -dp(55) && !expanded)dismissAnimated()
                    else if(delta < -dp(55) && expanded)settle(false)
                    else if(delta > dp(35))settle(true)
                    else settle(expanded)
                    true
                }
                MotionEvent.ACTION_CANCEL -> {settle(expanded);true}
                else -> true
            }
        }
        panel.addView(grip,LinearLayout.LayoutParams(-1,dp(28)))
        val row=LinearLayout(context).apply {gravity=Gravity.CENTER_VERTICAL}
        row.addView(label(title,18f).apply {gravity=Gravity.START or Gravity.CENTER_VERTICAL},
            LinearLayout.LayoutParams(0,dp(40),1f))
        if(account!=null)row.addView(button("В чат"){onOpenChat(account)},LinearLayout.LayoutParams(dp(85),dp(40)).apply {marginEnd=dp(8)})
        row.addView(button("×"){dismissAnimated()}.apply {contentDescription="Закрыть Планика"},
            LinearLayout.LayoutParams(dp(44),dp(40)))
        panel.addView(row,LinearLayout.LayoutParams(-1,-2))
        panel.addView(body,LinearLayout.LayoutParams(-1,0,1f))
    }

    private fun animateIn() {
        entering=true
        panel.animate().cancel()
        panel.visibility=View.INVISIBLE
        root.alpha=1f
        root.setBackgroundColor(Color.TRANSPARENT)
        applyGeometry()
        val token=generation
        panel.post {
            if(!active || generation!=token || closing)return@post
            panel.translationY=(panel.height+bottomInset+dp(24)).toFloat()
            panel.alpha=1f
            panel.visibility=View.VISIBLE
            panel.animate().translationY(0f).setDuration(430)
                .setInterpolator(PathInterpolator(.16f,1f,.3f,1f))
                .withEndAction {entering=false}.start()
        }
    }

    private fun stopMascot() {
        mascotJob?.cancel();mascotJob=null
        mascotFloat?.cancel();mascotFloat=null
    }

    private fun addMascot(mode:String,compact:Boolean=false) {
        stopMascot()
        mascotMode=mode
        val mascot=ImageView(context).apply {
            contentDescription="Планик"
            scaleType=ImageView.ScaleType.FIT_CENTER
        }
        body.addView(mascot,LinearLayout.LayoutParams(-1,dp(if(compact)100 else 118)).apply {
            gravity=Gravity.CENTER_HORIZONTAL
        })
        mascotFloat=ObjectAnimator.ofPropertyValuesHolder(mascot,
            PropertyValuesHolder.ofFloat(View.TRANSLATION_Y,dp(2).toFloat(),-dp(2).toFloat())).apply {
            duration=1600;repeatCount=ValueAnimator.INFINITE;repeatMode=ValueAnimator.REVERSE
            interpolator=android.view.animation.AccelerateDecelerateInterpolator();start()
        }
        val token=generation
        mascotJob=scope?.launch {
            val frames=withContext(Dispatchers.Default) {
                val idle=context.assets.open("planik_idle.svg").bufferedReader().use{it.readText()}
                val blink=context.assets.open("planik_blink.svg").bufferedReader().use{it.readText()}
                listOf("idle","thinking","searching","typing").associateWith { state ->
                    List(2){index->
                        val source=if(index==1)blink else idle
                        val action=planikActionSvg(state,index==1)
                        // Existing drawing is centered on x=215; symmetric padding
                        // prevents both asymmetric alignment and clipped accessories.
                        val svg=source.replace(Regex("viewBox=\\\"[^\\\"]+\\\""),"viewBox=\"-10 -30 450 365\"")
                            .replace("</svg>",action+"</svg>")
                        runCatching {
                            val picture=SVG.getFromString(svg).renderToPicture(450,365)
                            Bitmap.createBitmap(450,365,Bitmap.Config.ARGB_8888).apply {Canvas(this).drawPicture(picture)}
                        }.getOrNull()
                    }
                }
            }
            var frame=0
            var previous=""
            while(valid(token)) {
                val state=mascotMode
                if(previous!=state){frame=0;previous=state}
                mascot.setImageBitmap(frames[state]?.getOrNull(frame) ?: frames["idle"]?.firstOrNull())
                delay(if(state=="idle")if(frame==0)4900L else 115L else 260L)
                frame=1-frame
            }
        }
    }

    private fun updateProgress(code:String) {
        status?.text=nativeAiProgressLabel(code)
        mascotMode=when {
            code.startsWith("searching") || code.startsWith("reading") || code.startsWith("listing") -> "searching"
            code=="forming_answer" || code=="editing_document" -> "typing"
            else -> "thinking"
        }
    }

    private fun addProgress() {
        addMascot("thinking",compact=true)
        status=label("Распознаю запрос…",17f)
        body.addView(status,LinearLayout.LayoutParams(-1,dp(34)))
        progressView=ProgressSegments(context).also { body.addView(it,LinearLayout.LayoutParams(-1,dp(18))) }
    }

    private fun requiresChat(response:JsonObject):Boolean {
        val keys=listOf("taskProposal","economicProposals","generatedDocument","telegramSendDraft",
            "telegramReadDraft","mailSendDraft","telegramSuggestedReply","mailSuggestedReply",
            "assistantSettingsProposalId","generatedImage","generatedImages","image","images")
        fun present(key:String)=when(val value=response[key]) {
            null,JsonNull -> false
            is JsonArray -> value.isNotEmpty()
            is JsonObject -> value.isNotEmpty()
            is JsonPrimitive -> value.contentOrNull?.let{it.isNotBlank() && it!="false"}==true
        }
        return keys.any(::present)
    }

    fun show(invocation:PlanikSystemAssistant.Invocation?) {
        close()
        active=true
        val token=++generation
        request=invocation
        expanded=false
        closing=false
        scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
        header(if(invocation?.action=="live")"Планик · живое общение" else "Планик",invocation?.account)
        animateIn()
        if(invocation==null) {
            body.addView(label("Включите системный режим в настройках Планировыча. Для вызова устройство должно быть разблокировано.",15f))
            return
        }
        if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) {
            body.addView(label("Разрешите доступ к микрофону в настройках Android.",15f))
            return
        }
        // The Vosk listener and native chat must not compete with this session.
        if(PlanikWakeMicGate.busy) {
            body.addView(label("Микрофон уже используется Плаником. Завершите другой голосовой сеанс.",15f))
            return
        }
        PlanikWakeMicGate.acquire(this)
        micOwned=true
        addMascot("idle")
        val loading=label("Подключаюсь…",15f)
        body.addView(loading,LinearLayout.LayoutParams(-1,dp(40)))
        work=scope?.launch {
            try {
                val current=repository.establishSession()
                if(!valid(token))return@launch
                val request=invocation
                if(current.id!=request.account) {
                    fail("Аккаунт Android изменился. Откройте Планировыч и проверьте вход.")
                    return@launch
                }
                stopMascot()
                body.removeAllViews()
                if(invocation.action=="voice")startDictation(invocation,token)
                else startLive(invocation,token)
            } catch(cancel:CancellationException) { throw cancel }
            catch(_:Exception) {if(valid(token))fail("Не удалось подключиться к аккаунту. Проверьте интернет.")}
        }
    }

    private fun valid(token:Int):Boolean=active && !closing && generation==token && wakeDeviceUnlocked(context)
    private fun stillSelected(invocation:PlanikSystemAssistant.Invocation):Boolean =
        PlanikSystemAssistant.invocation(context)?.account==invocation.account
    private fun releaseGate() {
        if(micOwned) {micOwned=false;PlanikWakeMicGate.release(this)}
    }

    @Suppress("DEPRECATION")
    private fun startDictation(invocation:PlanikSystemAssistant.Invocation,token:Int) {
        addMascot("idle")
        status=label("Слушаю…",19f)
        body.addView(status)
        val wave=VoiceWave(context)
        waveform=wave
        body.addView(wave,LinearLayout.LayoutParams(-1,dp(42)))
        val controls=LinearLayout(context).apply {gravity=Gravity.CENTER}
        controls.addView(button("Отмена"){dismissAnimated()},LinearLayout.LayoutParams(0,dp(46),1f).apply{marginEnd=dp(8)})
        val send=button("Отправить"){finishDictation(invocation,token)}
        controls.addView(send,LinearLayout.LayoutParams(0,dp(46),1f))
        body.addView(View(context),LinearLayout.LayoutParams(-1,0,1f))
        body.addView(controls,LinearLayout.LayoutParams(-1,-2))
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
        addProgress()
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
                body.addView(label(question,14f,0xffc7c4dd.toInt()).apply {
                    gravity=Gravity.START;maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END
                },LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(8)})
                updateProgress("analyzing_request")
                val project=repository.loadGeneralAiProjects().firstOrNull { it.chats.any { chat -> chat.id==QUICK_AI_THREAD_ID } }
                    ?: error("Откройте Планировыч один раз, чтобы создать быстрый чат")
                val thread=project.chats.first { it.id==QUICK_AI_THREAD_ID }
                val history=repository.loadQuickAiHistory()
                check(stillSelected(invocation) && repository.establishSession().id==invocation.account)
                if(!valid(token))return@launch
                val response=repository.askGeneralAi(project,thread,history,UUID.randomUUID().toString(),
                    question,emptyList(),onProgress={code->
                        // The streaming repository calls this from Dispatchers.IO.
                        handler.post { if(valid(token))updateProgress(code) }
                    })
                if(!valid(token))return@launch
                header("Планик",invocation.account)
                val answer=response["answer"]?.jsonPrimitive?.contentOrNull.orEmpty()
                val result=label("",15f).apply {
                    gravity=Gravity.START
                    setLineSpacing(dp(3).toFloat(),1.12f)
                    setLinkTextColor(0xff8ee8e6.toInt())
                    setPadding(dp(4),dp(8),dp(4),dp(8))
                }
                val readable=answer.replace(Regex("""\[\[task_ref=([^\]]+)\]\]|\[\[task_ref:([^|\]]+)\|([^\]]+)\]\]""")) {
                    it.groups[3]?.value ?: "Задача в чате"
                }
                markdown.setMarkdown(result,readable.ifBlank{"Ответ сохранён в чате Планировыча."})
                transcript=result
                val content=LinearLayout(context).apply {
                    orientation=LinearLayout.VERTICAL
                    addView(result,LinearLayout.LayoutParams(-1,-2))
                }
                val cards=PlanikPanelProposalCards(context,repository,
                    requireNotNull(scope),isValid={valid(token)&&stillSelected(invocation)},
                    verifyAccount={check(repository.establishSession().id==invocation.account)},
                    makeButton={text,action->button(text,action)},onEdit={settle(true)})
                val cardCount=cards.attach(content,response)
                body.addView(ScrollView(context).apply {
                    isFillViewport=true
                    addView(content,ScrollView.LayoutParams(-1,-2))
                },LinearLayout.LayoutParams(-1,0,1f))
                if(cardCount>0)settle(true)
                if(requiresChat(response) || answer.contains("[[task_ref")) {
                    body.addView(button("Посмотреть в чате"){onOpenChat(invocation.account)},
                        LinearLayout.LayoutParams(-1,dp(46)).apply{topMargin=dp(8)})
                }
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
        body.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        var ready=false
        var missing=0
        val deadline=SystemClock.elapsedRealtime()+40_000L
        val script="""(function(){
          var css=document.getElementById('planik-system-panel');
          if(!css){css=document.createElement('style');css.id='planik-system-panel';
          css.textContent='html,body{background:transparent!important} body *{visibility:hidden!important;pointer-events:none!important} .planik-live-fullscreen,.planik-live-fullscreen *,.planik-live-compact,.planik-live-compact *{visibility:visible!important;pointer-events:auto!important} .planik-live-fullscreen{background:transparent!important} .planik-live-fullscreen::before{display:none!important} .planik-live-stage{height:100%!important;padding:6px 10px!important} .planik-live-header{display:none!important} .planik-live-center{gap:3px!important;justify-content:center!important} .planik-live-avatar{width:124px!important;height:106px!important;margin:0 auto!important;align-self:center!important} .planik-live-phase{margin-top:0!important} .planik-live-visualizer{height:25px!important;margin:0!important} .planik-live-transcript{max-height:clamp(72px,28vh,240px)!important} .planik-live-caption{display:none!important} .planik-live-footer{padding:2px!important} .planik-live-compact{bottom:12px!important;right:50%!important;transform:translateX(50%)!important}';
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
        body.addView(label(message,15f),LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12);bottomMargin=dp(12)})
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
        stopMascot()
        heightAnimation?.cancel();heightAnimation=null
        panel.animate().cancel()
        root.animate().cancel()
        root.alpha=1f
        panel.visibility=View.INVISIBLE
        panel.removeAllViews()
        body.removeAllViews()
        progressView=null
        entering=false;closing=false
        PlanikLiveUpdates.publish()
    }

    private class ProgressSegments(context:Context):View(context) {
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas:Canvas) {
            super.onDraw(canvas)
            val density=resources.displayMetrics.density
            val bar=30*density;val gap=5*density;val h=4*density
            val left=(width-(bar*3+gap*2))/2
            val sweep=(SystemClock.uptimeMillis()%1250L)/1250f*3f
            for(i in 0..2){
                val intensity=(1f-kotlin.math.abs(sweep-i)).coerceIn(0f,1f)
                paint.color=0xff67e8f9.toInt()
                paint.alpha=(51+204*intensity).toInt()
                val x=left+i*(bar+gap)
                canvas.drawRoundRect(x,(height-h)/2,x+bar,(height+h)/2,h/2,h/2,paint)
            }
            if(isShown)postInvalidateOnAnimation()
        }
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
