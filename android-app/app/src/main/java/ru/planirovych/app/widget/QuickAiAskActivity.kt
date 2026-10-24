package ru.planirovych.app.widget

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.ui.graphics.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import ru.planirovych.app.MainActivity
import ru.planirovych.app.PlanirovychApplication
import ru.planirovych.app.data.model.*
import ru.planirovych.app.ui.theme.PlanirovychTheme
import java.util.UUID

/** Deliberately one small request surface, not a second independent AI chat.
 * The server stores the result in the very same Quick Requests thread.
 */
class QuickAiAskActivity:ComponentActivity(){
    companion object{
        const val ACTION_TEXT="ru.planirovych.action.QUICK_AI_TEXT"
        const val ACTION_VOICE="ru.planirovych.action.QUICK_AI_VOICE"
    }
    private var speechResult by mutableStateOf<String?>(null)
    private var speechError by mutableStateOf<String?>(null)
    private val speechLauncher=registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()){result->
        val spoken=result.data?.getStringArrayListExtra(
            RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
        if(spoken.isNullOrBlank()){
            if(result.resultCode!=RESULT_CANCELED)
                speechError="Не удалось распознать речь. Введите запрос текстом."
        }else speechResult=spoken
    }
    private fun recognize(){
        try{
            speechLauncher.launch(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply{
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ru-RU")
                    putExtra(RecognizerIntent.EXTRA_PROMPT,"Спросите Планировыча")
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
                }
            )
        }catch(_:ActivityNotFoundException){
            speechError="На устройстве нет сервиса голосового ввода."
        }catch(_:SecurityException){
            speechError="Голосовой ввод недоступен на этом устройстве."
        }
    }
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        val app=application as PlanirovychApplication
        setContent{
            val dark by app.themePreferences.isDark.collectAsStateWithLifecycle(
                initialValue=false)
            PlanirovychTheme(dark){
                val scope=rememberCoroutineScope()
                val focus=remember{FocusRequester()}
                val keyboard=LocalSoftwareKeyboardController.current
                var input by remember{mutableStateOf("")}
                var sending by remember{mutableStateOf(false)}
                var status by remember{mutableStateOf<String?>(null)}
                var error by remember{mutableStateOf<String?>(null)}
                var answer by remember{mutableStateOf<String?>(null)}
                var started by remember{mutableStateOf(false)}
                val foreground=if(dark)Color(0xFFF1F5F9)else Color(0xFF172238)
                val secondary=if(dark)Color(0xFFA6B6D0)else Color(0xFF64748B)
                val accent=Color(0xFF9471E9)
                LaunchedEffect(speechResult){
                    val recognized=speechResult?:return@LaunchedEffect
                    input=recognized
                    error=null
                }
                LaunchedEffect(Unit){
                    if(!started){
                        started=true
                        if(intent?.action==ACTION_VOICE)recognize()
                        else {
                            focus.requestFocus()
                            keyboard?.show()
                        }
                    }
                }
                fun submit(){
                    val question=input.trim()
                    if(question.isBlank()||sending)return
                    sending=true;error=null;answer=null
                    scope.launch{
                        try{
                            val result=withContext(Dispatchers.IO){
                                app.repository.establishSession()
                                var projects=app.repository.loadGeneralAiProjects()
                                if(projects.isEmpty()){
                                    projects=app.repository.persistGeneralAiProjects(
                                        defaultGeneralAiProjects())
                                }
                                val project=projects.firstOrNull()
                                    ?:throw IllegalStateException("Не удалось найти личный проект")
                                val thread=project.chats.firstOrNull{
                                    it.id==QUICK_AI_THREAD_ID
                                }?:GeneralAiThread(QUICK_AI_THREAD_ID,QUICK_AI_TITLE)
                                val history=app.repository.loadQuickAiHistory()
                                val reply=app.repository.askGeneralAi(
                                    project,thread,history,UUID.randomUUID().toString(),
                                    question,emptyList(),onProgress={stage->
                                        scope.launch{status=when(stage){
                                            "searching_tasks"->"Ищу задачи…"
                                            "reading_task"->"Изучаю задачу…"
                                            "searching_web"->"Ищу в интернете…"
                                            "forming_answer"->"Формирую ответ…"
                                            else->"Обрабатываю запрос…"
                                        }}
                                    })
                                }
                                reply.aiString("answer")
                            }
                            answer=result.ifBlank{"Запрос отправлен в «Быстрые запросы»."}
                            status=null
                        }catch(t:Throwable){
                            error=t.message?:"Не удалось отправить запрос"
                            status=null
                        }finally{sending=false}
                    }
                }
                Box(Modifier.fillMaxSize().background(
                    if(dark)Color(0xFF0E1728)else Color(0xFFF5F7FC))){
                    Column(Modifier.fillMaxWidth().align(Alignment.TopCenter)
                        .padding(17.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(if(dark)Color(0xFF1A2740)else Color.White)
                        .border(1.dp,if(dark)Color(0xFF394864)
                            else Color(0xFFE0E5F1),RoundedCornerShape(24.dp))
                        .padding(17.dp)
                        .verticalScroll(rememberScrollState()),
                        verticalArrangement=Arrangement.spacedBy(13.dp)){
                        Row(Modifier.fillMaxWidth(),
                            verticalAlignment=Alignment.CenterVertically){
                            Box(Modifier.size(37.dp).clip(RoundedCornerShape(12.dp))
                                .background(Brush.linearGradient(
                                    listOf(Color(0xFF7C3AED),Color(0xFF0891B2)))),
                                contentAlignment=Alignment.Center){
                                Icon(Icons.Default.AutoAwesome,null,
                                    tint=Color.White,modifier=Modifier.size(21.dp))
                            }
                            Spacer(Modifier.width(9.dp))
                            Column(Modifier.weight(1f)){
                                Text("Быстрый запрос ИИ",color=foreground,
                                    fontSize=16.sp,fontWeight=FontWeight.Bold)
                                Text("Синхронизирован с Планировычем",
                                    color=secondary,fontSize=10.sp)
                            }
                            IconButton(onClick={finish()}){
                                Icon(Icons.Default.Close,"Закрыть",
                                    tint=secondary)
                            }
                        }
                        OutlinedTextField(value=input,onValueChange={
                            input=it;error=null
                        },modifier=Modifier.fillMaxWidth()
                            .heightIn(min=108.dp)
                            .focusRequester(focus),
                            placeholder={Text("Напишите или продиктуйте запрос…")},
                            enabled=!sending,
                            minLines=3,maxLines=6,
                            shape=RoundedCornerShape(17.dp))
                        Text("Например:",fontSize=11.sp,color=secondary,
                            fontWeight=FontWeight.Bold)
                        Row(Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            listOf("Что важно сегодня?","Мои просроченные задачи",
                                "Составь план на завтра").forEach{example->
                                Surface(onClick={input=example},enabled=!sending,
                                    color=accent.copy(alpha=.13f),
                                    shape=RoundedCornerShape(13.dp)){
                                    Text(example,Modifier.padding(
                                        horizontal=10.dp,vertical=8.dp),
                                        color=foreground,fontSize=11.sp)
                                }
                            }
                        }
                        Row(Modifier.fillMaxWidth(),
                            horizontalArrangement=Arrangement.spacedBy(9.dp),
                            verticalAlignment=Alignment.CenterVertically){
                            OutlinedButton(onClick={recognize()},
                                enabled=!sending,
                                modifier=Modifier.height(46.dp),
                                shape=RoundedCornerShape(15.dp)){
                                Icon(Icons.Default.Mic,"Продиктовать",
                                    modifier=Modifier.size(19.dp))
                            }
                            Button(onClick={submit()},enabled=!sending&&input.isNotBlank(),
                                modifier=Modifier.weight(1f).height(46.dp),
                                shape=RoundedCornerShape(15.dp),
                                colors=ButtonDefaults.buttonColors(
                                    containerColor=accent)){
                                if(sending)CircularProgressIndicator(
                                    Modifier.size(19.dp),strokeWidth=2.dp,
                                    color=Color.White)
                                else Icon(Icons.Default.Send,null,
                                    modifier=Modifier.size(18.dp))
                                Spacer(Modifier.width(7.dp))
                                Text(if(sending)"Отправляем…"else "Отправить",
                                    fontWeight=FontWeight.Bold)
                            }
                        }
                        (error?:speechError)?.let{
                            Text(it,color=Color(0xFFEF4444),fontSize=12.sp)
                        }
                        status?.let{Text(it,color=secondary,fontSize=12.sp)}
                        answer?.let{response->
                            HorizontalDivider(color=secondary.copy(alpha=.25f))
                            Text("Ответ ИИ",color=accent,
                                fontWeight=FontWeight.Bold,fontSize=12.sp)
                            Text(response,color=foreground,fontSize=13.sp,
                                lineHeight=20.sp)
                            OutlinedButton(onClick={
                                startActivity(Intent(this@QuickAiAskActivity,
                                    MainActivity::class.java).apply{
                                    putExtra(MainActivity.EXTRA_OPEN_GENERAL_AI,true)
                                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                                })
                                finish()
                            },modifier=Modifier.fillMaxWidth()){
                                Text("Открыть «Быстрые запросы»")
                            }
                        }
                    }
                }
            }
        }
    }
}
