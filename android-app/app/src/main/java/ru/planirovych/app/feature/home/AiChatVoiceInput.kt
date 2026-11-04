package ru.planirovych.app.feature.home

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.sin

private enum class VoiceRecordingStage { IDLE, RECORDING, TRANSCRIBING }

/**
 * Mini App parity: record a short private AAC/MP4 clip, then send it to the
 * authenticated /api/ai/audio/transcribe GPT endpoint. Never invoke Android
 * SpeechRecognizer or send a chat message without the user's explicit choice.
 * Temporary audio is removed from the device after processing.
 */
@Composable
internal fun rememberAiChatSpeechInput(
    dark:Boolean,
    transcribe:suspend (ByteArray,Double)->String,
    onRecognized:(String,Boolean)->Unit,
    onError:(String)->Unit
):()->Unit {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val recognized by rememberUpdatedState(onRecognized)
    val errorCallback by rememberUpdatedState(onError)
    val transcription by rememberUpdatedState(transcribe)
    var stage by remember { mutableStateOf(VoiceRecordingStage.IDLE) }
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var amplitude by remember { mutableFloatStateOf(.15f) }
    var startedAt by remember { mutableLongStateOf(0L) }
    val recorder=remember { mutableStateOf<MediaRecorder?>(null) }
    val recording=remember { mutableStateOf<File?>(null) }
    val maxSize=6*1024*1024

    fun releaseRecorder(discard:Boolean) {
        val active=recorder.value
        recorder.value=null
        if(active!=null){
            if(discard)runCatching{active.stop()}
            runCatching{active.reset()}
            runCatching{active.release()}
        }
        if(discard){
            recording.value?.delete()
            recording.value=null
            stage=VoiceRecordingStage.IDLE
        }
    }

    @Suppress("DEPRECATION")
    fun startRecording() {
        if(stage!=VoiceRecordingStage.IDLE)return
        try{
            val file=File.createTempFile("ai-dictation-", ".m4a",context.cacheDir)
            recording.value=file
            val native=MediaRecorder()
            recorder.value=native
            native.setAudioSource(MediaRecorder.AudioSource.MIC)
            native.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            native.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            native.setAudioSamplingRate(44100)
            native.setAudioEncodingBitRate(64000)
            native.setOutputFile(file.absolutePath)
            native.prepare()
            native.start()
            startedAt=SystemClock.elapsedRealtime()
            elapsedSeconds=0
            amplitude=.15f
            stage=VoiceRecordingStage.RECORDING
        }catch(error:Exception){
            releaseRecorder(true)
            errorCallback("Не удалось включить запись. Проверьте доступ к микрофону.")
        }
    }

    val permission=rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()){granted->
        if(granted)startRecording()
        else errorCallback("Разрешите доступ к микрофону в настройках Android.")
    }

    fun finishRecording(sendImmediately:Boolean){
        if(stage!=VoiceRecordingStage.RECORDING)return
        val file=recording.value
        val length=(SystemClock.elapsedRealtime()-startedAt)/1000.0
        val active=recorder.value
        recorder.value=null
        val stopped=runCatching {active?.stop()}.isSuccess
        runCatching{active?.release()}
        recording.value=null
        if(!stopped || file==null || length<.25){
            file?.delete()
            stage=VoiceRecordingStage.IDLE
            errorCallback("Запись слишком короткая. Попробуйте ещё раз.")
            return
        }
        stage=VoiceRecordingStage.TRANSCRIBING
        scope.launch{
            try{
                val bytes=withContext(Dispatchers.IO){
                    try {
                        if(file.length() !in 100L..maxSize.toLong())
                            error("Длина записи не подходит. Максимум 6 МБ.")
                        file.readBytes()
                    } finally { file.delete() }
                }
                val text=transcription(bytes,length.coerceAtMost(120.0))
                if(text.isBlank())error("Речь не распознана.")
                recognized(text.trim(),sendImmediately)
            }catch(cause:Exception){
                errorCallback(cause.message?.take(240)
                    ?:"Расшифровка не удалась. Повторите попытку.")
            }finally{
                stage=VoiceRecordingStage.IDLE
                elapsedSeconds=0
            }
        }
    }

    LaunchedEffect(stage){
        while(stage==VoiceRecordingStage.RECORDING){
            elapsedSeconds=((SystemClock.elapsedRealtime()-startedAt)/1000L).toInt()
            amplitude=((recorder.value?.maxAmplitude?:0)/25000f).coerceIn(.12f,1f)
            if(elapsedSeconds>=120){
                finishRecording(false)
                break
            }
            delay(160)
        }
    }
    DisposableEffect(Unit){
        onDispose {
            recorder.value?.let{native->
                runCatching{native.stop()}
                runCatching{native.release()}
            }
            recorder.value=null
            recording.value?.delete()
            recording.value=null
        }
    }
    if(stage!=VoiceRecordingStage.IDLE){
        val recordingNow=stage==VoiceRecordingStage.RECORDING
        Dialog(onDismissRequest={},properties=DialogProperties(
            dismissOnBackPress=false,dismissOnClickOutside=false)){
            Surface(shape=RoundedCornerShape(25.dp),
                color=if(dark)Color(0xFF17243A) else Color.White,
                shadowElevation=18.dp,modifier=Modifier.fillMaxWidth()){
                Column(Modifier.fillMaxWidth().padding(20.dp),
                    horizontalAlignment=Alignment.CenterHorizontally,
                    verticalArrangement=Arrangement.spacedBy(15.dp)){
                    Row(verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(9.dp)){
                        Icon(Icons.Default.Mic,null,tint=Color(0xFF67E8F9),
                            modifier=Modifier.size(20.dp))
                        Text(if(recordingNow)"Голосовой ввод"
                            else "Расшифровываем запись…",
                            fontWeight=FontWeight.Bold,
                            color=if(dark)Color.White else Color(0xFF172238),fontSize=17.sp)
                    }
                    Row(Modifier.fillMaxWidth().height(61.dp),
                        horizontalArrangement=Arrangement.spacedBy(3.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        repeat(23){index->
                            val wave=(.38f+.62f*kotlin.math.abs(
                                sin((index*.58+elapsedSeconds*2.1))))
                            val barHeight=if(recordingNow)
                                7.dp+(amplitude*wave*46f).dp else 9.dp
                            Box(Modifier.weight(1f).height(barHeight)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFA78BFA)))
                        }
                    }
                    Text(if(recordingNow)
                        String.format(java.util.Locale.ROOT,"%02d:%02d",
                            elapsedSeconds/60,elapsedSeconds%60)
                        else "Обрабатываем речь и считаем кредиты",
                        color=if(dark)Color(0xFFBCCBE1) else Color(0xFF52647E),
                        fontSize=13.sp)
                    if(recordingNow){
                        Row(Modifier.fillMaxWidth(),
                            horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            OutlinedButton(onClick={releaseRecorder(true)},
                                modifier=Modifier.weight(1f)){
                                Text("Отмена",fontSize=11.sp)
                            }
                            OutlinedButton(onClick={finishRecording(false)},
                                modifier=Modifier.weight(1f)){
                                Text("В текст",fontSize=11.sp)
                            }
                            Button(onClick={finishRecording(true)},
                                modifier=Modifier.weight(1.2f)){
                                Text("Отправить",fontSize=11.sp)
                            }
                        }
                    }else{
                        CircularProgressIndicator(
                            modifier=Modifier.size(25.dp),strokeWidth=3.dp,
                            color=Color(0xFF67E8F9))
                    }
                    Text("Распознавание GPT оплачивается ИИ-кредитами. " +
                        "Запись отправляется в чат только по команде.",
                        fontSize=11.sp,lineHeight=15.sp,
                        color=if(dark)Color(0xFF9BAFC7) else Color(0xFF64748B))
                }
            }
        }
    }
    return {
        if(stage==VoiceRecordingStage.IDLE){
            if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==
                PackageManager.PERMISSION_GRANTED)startRecording()
            else permission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
}

@Composable
internal fun AiChatMicrophoneButton(
    enabled:Boolean,background:Color,border:Color,tint:Color,onClick:()->Unit
){
    Box(Modifier.size(42.dp).clip(CircleShape).background(background)
        .border(1.dp,border,CircleShape)
        .clickable(enabled=enabled,onClick=onClick),contentAlignment=Alignment.Center){
        Icon(Icons.Default.Mic,"Голосовой ввод GPT",
            tint=if(enabled)tint else tint.copy(alpha=.45f),
            modifier=Modifier.size(19.dp))
    }
}

internal fun appendAiDictation(draft:String,recognized:String):String =
    listOf(draft.trimEnd(),recognized.trim())
        .filter{it.isNotBlank()}.joinToString(" ")
