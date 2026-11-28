package ru.planirovych.app.planik

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import android.view.View

internal object PlanikSystemAssistant {
    const val ACCOUNT_KEY="system_assistant_account"

    fun isSelected(context:Context):Boolean =
        runCatching {
            VoiceInteractionService.isActiveService(context,ComponentName(context,PlanikVoiceInteractionService::class.java))
        }.getOrDefault(false)

    data class Invocation(val account:String,val action:String)
    fun invocation(context:Context):Invocation? {
        if(!isSelected(context) || !wakeDeviceUnlocked(context))return null
        val prefs=context.getSharedPreferences("planik_foreground_wake",Context.MODE_PRIVATE)
        val account=prefs.getString(ACCOUNT_KEY,null) ?: return null
        if(!prefs.getBoolean("enabled_"+account,false) || wakeListeningMode(prefs,account)!=WAKE_SYSTEM)return null
        val action=prefs.getString("action_"+account,"live") ?: "live"
        if(action !in listOf("live","voice"))return null
        return Invocation(account,action)
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

/** The framework hosts this window above the current task. Normal invocation
 * never starts MainActivity, never opens a second task, and never captures the
 * underlying app's content. */
private class PlanikVoiceSession(private val appContext:Context):VoiceInteractionSession(appContext) {
    private var surface:PlanikAssistantPanel?=null

    override fun onCreateContentView():View =
        PlanikAssistantPanel(appContext, onClose={ hide() }, onOpenChat={ account ->
            // Only a deliberate tap on the chat link may switch applications.
            val intent=Intent(appContext,ru.planirovych.app.MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(ru.planirovych.app.MainActivity.EXTRA_OPEN_GENERAL_AI,true)
                .putExtra(ru.planirovych.app.MainActivity.EXTRA_NOTIFICATION_ACCOUNT,account)
            if(wakeDeviceUnlocked(appContext)) {
                runCatching { appContext.startActivity(intent) }.onSuccess { hide() }
            }
        }).also { surface=it }.root

    override fun onShow(args:Bundle?,showFlags:Int) {
        super.onShow(args,showFlags)
        window?.window?.apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
            clearFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(0f)
        }
        surface?.show(PlanikSystemAssistant.invocation(appContext))
    }

    override fun onHide() {
        surface?.close()
        super.onHide()
    }
    override fun onDestroy() {
        surface?.close()
        surface=null
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
