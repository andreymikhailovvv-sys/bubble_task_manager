package ru.planirovych.app.feature.home

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.animation.core.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
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
    onError:(String)->Unit,
    onProcessingStart:()->Unit={},
    onProcessingCancelled:()->Unit={},
    quickLauncher:Boolean=false,
    accent:Color=Color(0xFF7C3AED),
    suggestions:List<String> = emptyList(),
    financialSuggestions:Set<String> = emptySet()
):()->Unit {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val recognized by rememberUpdatedState(onRecognized)
    val errorCallback by rememberUpdatedState(onError)
    val transcription by rememberUpdatedState(transcribe)
    val processingStarted by rememberUpdatedState(onProcessingStart)
    val processingCancelled by rememberUpdatedState(onProcessingCancelled)
    var stage by remember { mutableStateOf(VoiceRecordingStage.IDLE) }
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var amplitude by remember { mutableFloatStateOf(0f) }
    var startedAt by remember { mutableLongStateOf(0L) }
    val recorder=remember { mutableStateOf<MediaRecorder?>(null) }
    val recording=remember { mutableStateOf<File?>(null) }
    var processingJob by remember { mutableStateOf<Job?>(null) }
    var processingGeneration by remember { mutableIntStateOf(0) }
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
            amplitude=0f
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
        val generation=++processingGeneration
        if(sendImmediately)processingStarted()
        processingJob=scope.launch{
            try{
                val bytes=withContext(Dispatchers.IO){
                    try {
                        if(file.length() !in 100L..maxSize.toLong())
                            error("Длина записи не подходит. Максимум 6 МБ.")
                        file.readBytes()
                    } finally { file.delete() }
                }
                val text=transcription(bytes,length.coerceAtMost(120.0))
                if(!isActive)return@launch
                if(text.isBlank())error("Речь не распознана.")
                recognized(text.trim(),sendImmediately)
            }catch(_:CancellationException){
                // User dismissed the small processing pill: do not report an error.
            }catch(cause:Exception){
                errorCallback(cause.message?.take(240)
                    ?:"Расшифровка не удалась. Повторите попытку.")
            }finally{
                // An earlier cancelled job must not close a new recording.
                if(processingGeneration==generation){
                    stage=VoiceRecordingStage.IDLE
                    elapsedSeconds=0
                    processingJob=null
                }
            }
        }
    }

    fun cancelProcessing(){
        if(stage!=VoiceRecordingStage.TRANSCRIBING)return
        processingGeneration++
        processingJob?.cancel()
        processingJob=null
        stage=VoiceRecordingStage.IDLE
        elapsedSeconds=0
        processingCancelled()
    }

    // Sample amplitude without re-laying out all bars. Only the timer's displayed
    // second changes in composition; wave scale is applied during the draw phase.
    LaunchedEffect(stage){
        while(stage==VoiceRecordingStage.RECORDING){
            val second=((SystemClock.elapsedRealtime()-startedAt)/1000L).toInt()
            if(elapsedSeconds!=second)elapsedSeconds=second
            // MediaRecorder.maxAmplitude samples the actual microphone signal.
            // Apply a small noise gate so silence stays still rather than
            // displaying the old looping fake listening animation.
            val peak=recorder.value?.maxAmplitude?:0
            amplitude=if(peak<850)0f else ((peak-850f)/21000f).coerceIn(0f,1f)
            if(second>=120){
                finishRecording(false)
                break
            }
            delay(80)
        }
    }
    DisposableEffect(Unit){
        onDispose {
            processingJob?.cancel()
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
        val waveTransition=rememberInfiniteTransition(label="voice-wave")
        val phase by waveTransition.animateFloat(
            initialValue=0f,targetValue=(2f*Math.PI.toFloat()),
            animationSpec=infiniteRepeatable(
                animation=tween(1100,easing=LinearEasing),repeatMode=RepeatMode.Restart
            ),label="voice-wave-phase"
        )
        val smoothAmplitude by animateFloatAsState(
            targetValue=amplitude,animationSpec=tween(125),label="voice-volume"
        )
        if(quickLauncher){
            val financeAccent=accent==Color(0xFFF5A52E)
            val primaryText=if(dark)Color(0xFFF8FAFC) else Color(0xFF192439)
            val secondaryText=if(dark)Color(0xFFADBBD0) else Color(0xFF55657C)
            val panel=if(dark)Color(0xFF1B283C) else Color(0xFFFBFCFF)
            val panelBorder=if(dark)Color(0xFF43516B) else Color(0xFFDCE3ED)
            val accessibleAccent=if(dark)accent
                else if(financeAccent)Color(0xFF97540E) else Color(0xFF6435B3)
            val iconOnAccent=if(financeAccent)Color(0xFF2B1B08) else Color.White

            if(recordingNow){
                Dialog(onDismissRequest={},properties=DialogProperties(
                    usePlatformDefaultWidth=false,dismissOnBackPress=false,
                    dismissOnClickOutside=false)){
                    Box(Modifier.fillMaxSize()
                        // Softer than the previous near-opaque 0xED overlay.
                        .background(if(dark)Color(0xB30B1120) else Color(0xB4EDF0F8))){
                        Column(
                            Modifier.align(Alignment.TopCenter)
                                .statusBarsPadding()
                                .padding(start=24.dp,end=24.dp,top=30.dp),
                            horizontalAlignment=Alignment.CenterHorizontally,
                            verticalArrangement=Arrangement.spacedBy(9.dp)
                        ){
                            Text("Голосовой ввод",color=primaryText,
                                fontWeight=FontWeight.SemiBold,fontSize=20.sp)
                            Text("Говорите, я записываю",color=secondaryText,fontSize=13.sp)
                            Spacer(Modifier.height(8.dp))
                            // Only a few quiet suggestions: the microphone remains
                            // the main visual focus instead of a wall of chips.
                            suggestions.take(3).forEach { hint ->
                                val suggestedFinance=hint in financialSuggestions
                                val hintColor=if(suggestedFinance)Color(0xFFF5A52E) else accent
                                Surface(
                                    shape=RoundedCornerShape(50),
                                    color=panel.copy(alpha=if(dark).80f else .92f),
                                    border=BorderStroke(.8.dp,
                                        hintColor.copy(alpha=if(dark).50f else .33f))
                                ){
                                    Text(hint,Modifier.padding(horizontal=14.dp,vertical=7.dp),
                                        color=primaryText,fontSize=12.sp,
                                        fontWeight=FontWeight.Medium)
                                }
                            }
                        }
                        Column(
                            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                                .navigationBarsPadding()
                                .padding(horizontal=18.dp).padding(bottom=32.dp),
                            horizontalAlignment=Alignment.CenterHorizontally
                        ){
                            Text(
                                String.format(java.util.Locale.ROOT,"%02d:%02d",
                                    elapsedSeconds/60,elapsedSeconds%60),
                                color=primaryText,fontWeight=FontWeight.SemiBold,
                                fontSize=27.sp,letterSpacing=1.sp
                            )
                            Spacer(Modifier.height(14.dp))
                            Row(
                                Modifier.fillMaxWidth(),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.SpaceBetween
                            ){
                                Column(Modifier.weight(1f),
                                    horizontalAlignment=Alignment.CenterHorizontally,
                                    verticalArrangement=Arrangement.spacedBy(7.dp)){
                                    Box(Modifier.size(48.dp).clip(CircleShape)
                                        .background(panel.copy(alpha=.91f))
                                        .border(.8.dp,panelBorder,CircleShape)
                                        .clickable { releaseRecorder(true) },
                                        contentAlignment=Alignment.Center){
                                        Icon(Icons.Default.Close,"Отменить запись",
                                            tint=primaryText,modifier=Modifier.size(21.dp))
                                    }
                                    Text("Отмена",fontSize=11.sp,color=secondaryText)
                                }
                                Box(Modifier.size(156.dp),
                                    contentAlignment=Alignment.Center){
                                    Canvas(Modifier.fillMaxSize()){
                                        val center=Offset(size.width/2,size.height/2)
                                        val level=smoothAmplitude.coerceIn(0f,1f)
                                        for(i in 0..3){
                                            val radius=size.minDimension*
                                                (.27f+i*.066f+level*(.07f+i*.04f))
                                            val alpha=if(level<.035f){
                                                if(i==0).30f else .07f
                                            }else(.19f+level*.31f)*(1f-i*.19f)
                                            drawCircle(accent.copy(alpha=alpha*.28f),
                                                radius=radius,center=center)
                                            drawCircle(accent.copy(alpha=alpha),
                                                radius=radius,center=center,
                                                style=androidx.compose.ui.graphics.drawscope.Stroke(
                                                    (1.25f+level*1.8f).dp.toPx()))
                                        }
                                    }
                                    Box(Modifier.size(86.dp).clip(CircleShape)
                                        .background(
                                            Brush.linearGradient(listOf(
                                                accent,accent.copy(alpha=.82f))))
                                        .border(1.dp,Color.White.copy(alpha=.18f),CircleShape),
                                        contentAlignment=Alignment.Center){
                                        Icon(Icons.Default.Mic,"Идёт запись",
                                            tint=iconOnAccent,modifier=Modifier.size(36.dp))
                                    }
                                }
                                Column(Modifier.weight(1f),
                                    horizontalAlignment=Alignment.CenterHorizontally,
                                    verticalArrangement=Arrangement.spacedBy(7.dp)){
                                    Box(Modifier.size(48.dp).clip(CircleShape)
                                        .background(accent)
                                        .clickable { finishRecording(true) },
                                        contentAlignment=Alignment.Center){
                                        Icon(Icons.Default.Send,"Отправить голосовой запрос",
                                            tint=iconOnAccent,modifier=Modifier.size(21.dp))
                                    }
                                    Text("Отправить",fontSize=11.sp,
                                        fontWeight=FontWeight.Medium,color=primaryText)
                                }
                            }
                            Spacer(Modifier.height(12.dp))
                            Text("До 2 минут",fontSize=11.sp,color=secondaryText)
                        }
                    }
                }
            }else{
                // The full-screen recorder disappears the instant Send is
                // tapped. Only this compact cancellable status stays visible
                // while transcription runs; the home FAB shows AI progress.
                val density=LocalDensity.current
                Popup(
                    alignment=Alignment.BottomEnd,
                    offset=IntOffset(
                        x=with(density){(-16).dp.roundToPx()},
                        y=with(density){(-112).dp.roundToPx()}
                    ),
                    properties=PopupProperties(focusable=false,clippingEnabled=false)
                ){
                    Surface(
                        shape=RoundedCornerShape(18.dp),
                        color=panel,
                        border=BorderStroke(1.dp,panelBorder),
                        shadowElevation=10.dp
                    ){
                        Row(Modifier.widthIn(max=320.dp)
                            .padding(horizontal=12.dp,vertical=10.dp),
                            verticalAlignment=Alignment.CenterVertically,
                            horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            CircularProgressIndicator(
                                modifier=Modifier.size(22.dp),strokeWidth=2.5.dp,
                                color=accessibleAccent
                            )
                            Column(Modifier.weight(1f)) {
                                Text("Обработка речи",fontSize=13.sp,
                                    fontWeight=FontWeight.SemiBold,color=primaryText)
                                Text("Можно продолжать работу",fontSize=10.sp,
                                    color=secondaryText)
                            }
                            TextButton(onClick={cancelProcessing()},
                                contentPadding=PaddingValues(horizontal=8.dp)){
                                Text("Отмена",fontSize=12.sp,
                                    fontWeight=FontWeight.SemiBold,
                                    color=accessibleAccent)
                            }
                        }
                    }
                }
            }
        }else Dialog(onDismissRequest={},properties=DialogProperties(
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
                        val waveBrush=Brush.verticalGradient(listOf(
                            Color(0xFF39C5BA),Color(0xFF8B5CF6)))
                        repeat(23){index->
                            Box(Modifier.weight(1f).height(51.dp)
                                .graphicsLayer{
                                    // GPU-scale the fixed geometry instead of rebuilding
                                    // bar heights at the 6 FPS amplitude sampling cadence.
                                    scaleY=if(recordingNow)
                                        (.12f + .88f*smoothAmplitude*
                                            (.35f+.65f*kotlin.math.abs(
                                                sin(index*.61f+phase)))).coerceIn(.12f,1f)
                                        else .14f
                                }
                                .clip(RoundedCornerShape(6.dp))
                                .background(waveBrush))
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
                            horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            val buttonShape=RoundedCornerShape(12.dp)
                            Box(Modifier.weight(1f).height(42.dp)
                                .clip(buttonShape)
                                .background(if(dark)Color(0xFF422B3D)
                                    else Color(0xFFFFE8ED))
                                .border(1.dp,if(dark)Color(0xFF744258)
                                    else Color(0xFFF2C6D2),buttonShape)
                                .clickable {releaseRecorder(true)},
                                contentAlignment=Alignment.Center){
                                Text("Отмена",fontSize=11.sp,fontWeight=FontWeight.SemiBold,
                                    maxLines=1,softWrap=false,overflow=TextOverflow.Ellipsis,
                                    color=if(dark)Color(0xFFFFB6CB) else Color(0xFFB42350))
                            }
                            Box(Modifier.weight(1f).height(42.dp)
                                .clip(buttonShape)
                                .background(if(dark)Color(0xFF164952)
                                    else Color(0xFFDBFAF9))
                                .border(1.dp,if(dark)Color(0xFF24717B)
                                    else Color(0xFFB5EAE6),buttonShape)
                                .clickable {finishRecording(false)},
                                contentAlignment=Alignment.Center){
                                Text("В текст",fontSize=11.sp,fontWeight=FontWeight.SemiBold,
                                    maxLines=1,softWrap=false,overflow=TextOverflow.Ellipsis,
                                    color=if(dark)Color(0xFF8BECE4) else Color(0xFF137D7B))
                            }
                            Box(Modifier.weight(1.3f).height(42.dp)
                                .clip(buttonShape)
                                .background(Color(0xFF7C3AED))
                                .clickable {finishRecording(true)},
                                contentAlignment=Alignment.Center){
                                Text("Отправить",fontSize=11.sp,
                                    fontWeight=FontWeight.Bold,maxLines=1,
                                    softWrap=false,overflow=TextOverflow.Ellipsis,
                                    color=Color.White)
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
    Box(Modifier.size(44.dp).clip(CircleShape).background(background)
        .border(1.dp,border.copy(alpha=.88f),CircleShape)
        .clickable(enabled=enabled,onClick=onClick),contentAlignment=Alignment.Center){
        Icon(Icons.Default.Mic,"Голосовой ввод GPT",
            tint=if(enabled)tint else tint.copy(alpha=.45f),
            modifier=Modifier.size(19.dp))
    }
}

/** Thin outlined paper-plane, matching the Mini App's SendHorizontal glyph. */
@Composable
internal fun MiniAppAiSendIcon(tint:Color){
    Canvas(Modifier.size(21.dp).semantics{contentDescription="Отправить"}){
        // Outlined SendHorizontal: a single non-intersecting contour and one
        // center stroke. The previous crossed lines looked like a bent arrow.
        val w=size.width
        val h=size.height
        val thickness=1.9.dp.toPx()
        val tip=Offset(w*.91f,h*.50f)
        val middle=Offset(w*.25f,h*.50f)
        val contour=androidx.compose.ui.graphics.Path().apply {
            moveTo(w*.12f,h*.14f)
            lineTo(middle.x,middle.y)
            lineTo(w*.12f,h*.86f)
            lineTo(tip.x,tip.y)
            close()
        }
        drawPath(contour,tint,style=androidx.compose.ui.graphics.drawscope.Stroke(
            width=thickness,cap=StrokeCap.Round,
            join=androidx.compose.ui.graphics.StrokeJoin.Round))
        drawLine(tint,middle,tip,thickness,cap=StrokeCap.Round)
    }
}

internal fun appendAiDictation(draft:String,recognized:String):String =
    listOf(draft.trimEnd(),recognized.trim())
        .filter{it.isNotBlank()}.joinToString(" ")
