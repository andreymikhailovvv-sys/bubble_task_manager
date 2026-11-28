package ru.planirovych.app.planik

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

internal object PlanikSystemAssistant {
    const val ACCOUNT_KEY="system_assistant_account"

    fun isSelected(context:Context):Boolean =
        runCatching {
            VoiceInteractionService.isActiveService(context,ComponentName(context,PlanikVoiceInteractionService::class.java))
        }.getOrDefault(false)

    fun invocation(context:Context):Intent? {
        if(!isSelected(context) || !wakeDeviceUnlocked(context))return null
        val prefs=context.getSharedPreferences("planik_foreground_wake",Context.MODE_PRIVATE)
        val account=prefs.getString(ACCOUNT_KEY,null) ?: return null
        if(!prefs.getBoolean("enabled_"+account,false) || wakeListeningMode(prefs,account)!=WAKE_SYSTEM)return null
        val action=prefs.getString("action_"+account,"live") ?: "live"
        if(action !in listOf("live","voice"))return null
        return PlanikWakeDispatch.intent(context,account,action)
    }
}

/** System-bound service. No background recording or hidden hotword APIs. */
class PlanikVoiceInteractionService:VoiceInteractionService() {
    override fun onReady() {
        super.onReady()
        // Do not collect the foreground application's content or screenshot.
        setDisabledShowContext(VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT)
    }
}

class PlanikVoiceSessionService:VoiceInteractionSessionService() {
    override fun onNewSession(args:Bundle?):VoiceInteractionSession = PlanikVoiceSession(this)
}

private class PlanikVoiceSession(private val appContext:Context):VoiceInteractionSession(appContext) {
    private val handler=Handler(Looper.getMainLooper())
    private var message:TextView?=null
    private var pending:Intent?=null

    override fun onCreateContentView():View {
        val space=(20*appContext.resources.displayMetrics.density).toInt()
        return LinearLayout(appContext).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(space,space,space,space)
            setBackgroundColor(0xff20263d.toInt())
            addView(TextView(appContext).apply {
                text="Планик"
                textSize=23f
                setTextColor(0xfff2f4ff.toInt())
            })
            message=TextView(appContext).apply {
                text="Открываю голосовой режим…"
                textSize=16f
                setTextColor(0xfff2f4ff.toInt())
            }
            addView(message)
            addView(Button(appContext).apply {
                text="Открыть Планика"
                setOnClickListener { launch() }
            })
            addView(Button(appContext).apply { text="Закрыть";setOnClickListener { hide() } })
        }
    }

    override fun onShow(args:Bundle?,showFlags:Int) {
        super.onShow(args,showFlags)
        handler.removeCallbacksAndMessages(null)
        pending=null
        launch()
    }

    private fun launch() {
        if(!wakeDeviceUnlocked(appContext)) {
            message?.text="Разблокируйте устройство и вызовите Планика снова."
            return
        }
        val intent=PlanikSystemAssistant.invocation(appContext)
        if(intent==null) {
            message?.text="Включите системный режим в настройках Планировыча."
            return
        }
        pending=intent
        // Start the ordinary native task, not a duplicate assistant workspace.
        try {
            appContext.startActivity(intent)
            message?.text="Открываю голосовой режим…"
            handler.postDelayed({
                if(pending===intent && !PlanikWakeDispatch.pending(intent)) hide()
                else message?.text="Если приложение не открылось, нажмите «Открыть Планика»."
            },900L)
        } catch(_:Exception) {
            message?.text="Android не открыл приложение. Попробуйте кнопку ещё раз."
        }
    }

    override fun onHide() {
        handler.removeCallbacksAndMessages(null)
        pending=null
        super.onHide()
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        pending=null
        message=null
        super.onDestroy()
    }
}

/** Metadata companion for assistant eligibility. It is not a general-purpose
 * Android speech provider; actual dictation is handled by the native composer.
 * Never hijack keyboard dictation or collect audio from other applications. */
class PlanikAssistantRecognitionService:RecognitionService() {
    override fun onStartListening(recognizerIntent:Intent,listener:Callback) {
        listener.error(SpeechRecognizer.ERROR_CLIENT)
    }
    override fun onStopListening(listener:Callback) { }
    override fun onCancel(listener:Callback) { }
}
