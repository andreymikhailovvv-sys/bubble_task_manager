package ru.planirovych.app.feature.home

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Uses the system speech recognizer: no audio files, microphone permission,
 * third-party keys or background recordings are added to the app.
 * The result is a draft, NOT a message sent without confirmation.
 */
@Composable
internal fun rememberAiChatSpeechInput(
    onRecognized:(String)->Unit,
    onError:(String)->Unit
):()->Unit {
    val currentRecognized by rememberUpdatedState(onRecognized)
    val currentError by rememberUpdatedState(onError)
    val launcher=rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ){result->
        if(result.resultCode==Activity.RESULT_OK){
            val spoken=result.data?.getStringArrayListExtra(
                RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
            if(spoken.isNullOrBlank())
                currentError("Не удалось распознать речь. Повторите попытку.")
            else currentRecognized(spoken)
        }
        // Cancel is deliberately silent; never alter the draft on cancel.
    }
    return {
        try{
            launcher.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply{
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ru-RU")
                putExtra(RecognizerIntent.EXTRA_PROMPT,"Продиктуйте сообщение ИИ")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
            })
        }catch(_:ActivityNotFoundException){
            currentError("На устройстве не установлен сервис голосового ввода.")
        }catch(_:SecurityException){
            currentError("Системный голосовой ввод недоступен.")
        }catch(_:Exception){
            currentError("Не удалось запустить голосовой ввод.")
        }
    }
}

@Composable
internal fun AiChatMicrophoneButton(
    enabled:Boolean,
    background:Color,
    border:Color,
    tint:Color,
    onClick:()->Unit
){
    Box(
        Modifier.size(42.dp).clip(CircleShape).background(background)
            .border(1.dp,border,CircleShape)
            .clickable(enabled=enabled,onClick=onClick),
        contentAlignment=Alignment.Center
    ){
        Icon(Icons.Default.Mic,"Голосовой ввод",
            tint=if(enabled)tint else tint.copy(alpha=.45f),
            modifier=Modifier.size(19.dp))
    }
}

internal fun appendAiDictation(draft:String,recognized:String):String =
    listOf(draft.trimEnd(),recognized.trim())
        .filter{it.isNotBlank()}
        .joinToString(" ")
