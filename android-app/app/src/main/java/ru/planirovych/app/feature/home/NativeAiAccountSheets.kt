package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import ru.planirovych.app.data.model.*
import java.util.Locale
import java.util.UUID

private val violet=Color(0xFF8B5CF6)
private val cyan=Color(0xFF06B6D4)
private val rose=Color(0xFFF472B6)
private fun fore(dark:Boolean)=if(dark)Color(0xFFF1F5F9)else Color(0xFF172238)
private fun muted(dark:Boolean)=if(dark)Color(0xFFA5B4CA)else Color(0xFF64748B)
private fun panel(dark:Boolean)=if(dark)Color(0xFF152238)else Color.White
private fun edge(dark:Boolean)=if(dark)Color(0xFF44516A)else Color(0xFFDCE3F2)
private fun scoreLabel(value:Double)=String.format(Locale("ru"),"%.1f",value)
    .removeSuffix(",0")
private fun milliLabel(value:Long):String =
    String.format(Locale("ru"),if(value%1000==0L)"%.0f"else "%.2f",value/1000.0)

@Composable
private fun AccountFrame(
    dark:Boolean,title:String,icon:androidx.compose.ui.graphics.vector.ImageVector,
    onClose:()->Unit,content:@Composable ColumnScope.()->Unit
){
    Dialog(onDismissRequest=onClose,
        properties=DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxWidth(.92f).widthIn(max=440.dp)
            .heightIn(max=680.dp),
            shape=RoundedCornerShape(25.dp),color=panel(dark),
            shadowElevation=18.dp,border=BorderStroke(1.dp,edge(dark))){
            Column(Modifier.verticalScroll(rememberScrollState())){
                Row(Modifier.fillMaxWidth().background(Brush.linearGradient(
                    if(dark)listOf(Color(0xFF2B2151),Color(0xFF16364E))
                    else listOf(Color(0xFFF0E9FF),Color(0xFFE7F9FF))))
                    .padding(horizontal=17.dp,vertical=14.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Box(Modifier.size(37.dp).clip(RoundedCornerShape(12.dp))
                        .background(Brush.linearGradient(listOf(violet,cyan))),
                        contentAlignment=Alignment.Center){
                        Icon(icon,null,tint=Color.White,modifier=Modifier.size(19.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(title,Modifier.weight(1f),color=fore(dark),
                        fontSize=17.sp,fontWeight=FontWeight.Bold)
                    IconButton(onClick=onClose,modifier=Modifier.size(31.dp)){
                        Icon(Icons.Default.Close,"Закрыть",tint=fore(dark))
                    }
                }
                Column(Modifier.fillMaxWidth()
                    .padding(start=16.dp,end=16.dp,bottom=17.dp,top=4.dp),
                    verticalArrangement=Arrangement.spacedBy(11.dp),content=content)
            }
        }
    }
}

@Composable
internal fun NativeEfficiencyRatingDialog(
    user:CurrentUser?,dark:Boolean,onClose:()->Unit
){
    val score=(user?.efficiencyScore?:0.0).coerceIn(0.0,100.0)
    AccountFrame(dark,"Рейтинг эффективности",Icons.Default.Stars,onClose){
        Column(Modifier.fillMaxWidth().padding(vertical=7.dp),
            horizontalAlignment=Alignment.CenterHorizontally){
            Box(Modifier.size(134.dp),contentAlignment=Alignment.Center){
                Canvas(Modifier.fillMaxSize()){
                    val stroke=10.dp.toPx()
                    drawCircle(muted(dark).copy(alpha=.20f),
                        style=androidx.compose.ui.graphics.drawscope.Stroke(stroke))
                    drawArc(brush=Brush.sweepGradient(listOf(cyan,violet,rose)),
                        startAngle=-90f,sweepAngle=(score*3.6).toFloat(),
                        useCenter=false,
                        style=androidx.compose.ui.graphics.drawscope.Stroke(
                            width=stroke,cap=StrokeCap.Round))
                }
                Column(horizontalAlignment=Alignment.CenterHorizontally){
                    Icon(Icons.Default.Star,null,tint=rose,
                        modifier=Modifier.size(31.dp))
                    Text(scoreLabel(score)+"/100",color=fore(dark),
                        fontSize=27.sp,fontWeight=FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(when{
                score<30->"Средний рейтинг. Сделайте следующий маленький шаг."
                score<70->"Хороший рейтинг. Так держать."
                else->"Отличный рейтинг! Продолжай в том же духе."
            },color=fore(dark),fontWeight=FontWeight.SemiBold,
                fontSize=13.sp,textAlign=TextAlign.Center)
        }
        listOf(
            Triple("Задачи",user?.efficiencyTaskScore?:0.0,violet),
            Triple("Привычки",user?.efficiencyHabitScore?:0.0,cyan),
            Triple("Работа с ИИ",user?.efficiencyAiScore?:0.0,rose),
            Triple("Режим концентрации (×2)",user?.efficiencyFocusScore?:0.0,
                Color(0xFFF59E0B))
        ).forEach{(title,value,accent)->
            val shape=RoundedCornerShape(12.dp)
            Row(Modifier.fillMaxWidth().clip(shape)
                .background(lerp(panel(dark),accent,if(dark).13f else .08f))
                .border(1.dp,accent.copy(alpha=.24f),shape)
                .padding(horizontal=11.dp,vertical=11.dp),
                verticalAlignment=Alignment.CenterVertically){
                Box(Modifier.size(7.dp).clip(CircleShape).background(accent))
                Spacer(Modifier.width(8.dp))
                Text(title,Modifier.weight(1f),color=fore(dark),fontSize=12.sp)
                Text("+"+scoreLabel(value)+" рейтинга",
                    color=accent,fontWeight=FontWeight.Bold,fontSize=11.sp)
            }
        }
    }
}

@Composable
internal fun NativeAiCreditsDialog(
    vm:HomeViewModel,user:CurrentUser?,dark:Boolean,onClose:()->Unit
){
    val context=LocalContext.current
    var tab by remember{mutableIntStateOf(0)}
    var catalog by remember{mutableStateOf<AiCreditCatalog?>(null)}
    var usage by remember{mutableStateOf<AiCreditUsage?>(null)}
    var loadingCatalog by remember{mutableStateOf(true)}
    var loadingStats by remember{mutableStateOf(false)}
    var error by remember{mutableStateOf<String?>(null)}
    var creating by remember{mutableStateOf(false)}
    var selectedPack by remember{mutableStateOf<String?>(null)}
    var requestId by remember{mutableStateOf<String?>(null)}
    var pendingPurchase by remember{mutableStateOf<String?>(null)}
    var receiptEmail by remember{mutableStateOf("")}
    var receiptNeeded by remember{mutableStateOf(false)}
    var notice by remember{mutableStateOf<String?>(null)}
    LaunchedEffect(Unit){
        vm.loadCreditCatalog({catalog=it;loadingCatalog=false},
            {error=it;loadingCatalog=false})
    }
    LaunchedEffect(tab){
        if(tab==1){
            loadingStats=true
            vm.loadCreditStatistics({usage=it;loadingStats=false;error=null},
                {error=it;loadingStats=false})
        }
    }
    // Payment confirmation is always obtained from the server. Opening the
    // external payment page does not mean that any credits were granted.
    LaunchedEffect(pendingPurchase){
        val id=pendingPurchase?:return@LaunchedEffect
        repeat(30){
            delay(3000)
            if(pendingPurchase!=id)return@LaunchedEffect
            vm.checkCreditPurchase(id,onResult={result->
                when{
                    result.status=="succeeded"&&result.credited->{
                        pendingPurchase=null
                        notice="Кредиты начислены."
                        vm.refreshCreditsBalance()
                    }
                    result.status=="canceled"->{
                        pendingPurchase=null
                        notice="Платёж отменён."
                    }
                    else->notice="Ожидаем подтверждения оплаты…"
                }
            },onError={notice="Статус неизвестен. Не оплачивайте повторно."})
        }
        if(pendingPurchase==id){
            pendingPurchase=null
            notice="Подтверждение задерживается. Не оплачивайте повторно."
        }
    }
    fun buy(key:String){
        if(creating||pendingPurchase!=null)return
        val id=if(selectedPack==key && receiptNeeded)
            requestId?:UUID.randomUUID().toString()
            else UUID.randomUUID().toString()
        selectedPack=key;requestId=id;creating=true;notice=null
        vm.beginCreditPurchase(key,id,receiptEmail.takeIf{it.isNotBlank()},
            onResult={payment->
                creating=false;receiptNeeded=false
                pendingPurchase=payment.purchaseId
                val uri=payment.confirmationUrl?.let(Uri::parse)
                if(uri?.scheme=="https"||uri?.scheme=="http")
                    runCatching{
                        context.startActivity(Intent(Intent.ACTION_VIEW,uri))
                    }.onFailure{notice="Не удалось открыть страницу оплаты."}
                else notice="Платёж создан. Ожидаем подтверждения."
            },onError={
                creating=false
                receiptNeeded=it.contains("email",true)||it.contains("чек",true)
                notice=it
            })
    }
    AccountFrame(dark,"AI-кредиты",Icons.Default.Paid,onClose){
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(if(dark)Color(0xFF29234F)else Color(0xFFF2EBFF))
            .padding(14.dp)){
            Text("Текущий баланс",color=muted(dark),fontSize=12.sp)
            Text((user?.aiCredits?:0).toString()+" кредитов",
                color=fore(dark),fontSize=23.sp,fontWeight=FontWeight.Bold)
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(if(dark)Color(0xFF233149)else Color(0xFFF1F5F9))
            .padding(3.dp)){
            listOf("Пополнить","Статистика").forEachIndexed{index,title->
                Box(Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                    .background(if(tab==index)
                        if(index==0)violet else cyan else Color.Transparent)
                    .clickable{tab=index}
                    .padding(vertical=10.dp),contentAlignment=Alignment.Center){
                    Text(title,fontWeight=FontWeight.Bold,fontSize=12.sp,
                        color=if(tab==index)Color.White else muted(dark))
                }
            }
        }
        if(tab==0){
            when{
                loadingCatalog->CircularProgressIndicator(
                    Modifier.align(Alignment.CenterHorizontally))
                error!=null && catalog==null->Text(error.orEmpty(),color=rose)
                catalog?.packs.isNullOrEmpty()->Text("Пакеты сейчас недоступны.",
                    color=muted(dark),fontSize=12.sp)
                else->{
                    catalog!!.packs.filter{it.isActive}.forEach{pack->
                        val shape=RoundedCornerShape(14.dp)
                        Row(Modifier.fillMaxWidth().clip(shape)
                            .background(Brush.linearGradient(
                                if(dark)listOf(Color(0xFF2B2748),Color(0xFF173D4B))
                                else listOf(Color.White,Color(0xFFF6F0FF),
                                    Color(0xFFECFEFF))))
                            .border(1.dp,violet.copy(alpha=.24f),shape)
                            .padding(11.dp),verticalAlignment=Alignment.CenterVertically){
                            Column(Modifier.weight(1f)){
                                Text(pack.creditsAmount.toString()+" AI-кредитов",
                                    color=fore(dark),fontWeight=FontWeight.Bold,
                                    fontSize=13.sp)
                                Text(pack.price.toString()+" ₽",
                                    color=muted(dark),fontSize=12.sp)
                            }
                            Button(onClick={buy(pack.key)},
                                enabled=catalog?.purchaseAvailable==true &&
                                    !creating&&pendingPurchase==null,
                                contentPadding=PaddingValues(horizontal=13.dp,vertical=7.dp),
                                colors=ButtonDefaults.buttonColors(containerColor=violet)){
                                Text(if(creating&&selectedPack==pack.key)
                                    "Создаём…"else "Купить",fontSize=11.sp)
                            }
                        }
                    }
                    if(catalog?.purchaseAvailable!=true)
                        Text("Оплата временно недоступна.",
                            color=muted(dark),fontSize=11.sp)
                    if(receiptNeeded){
                        OutlinedTextField(receiptEmail,onValueChange={receiptEmail=it},
                            label={Text("Email для чека")},
                            modifier=Modifier.fillMaxWidth(),singleLine=true)
                        Button(onClick={selectedPack?.let(::buy)},
                            enabled=receiptEmail.isNotBlank()&&!creating){
                            Text("Продолжить оплату")
                        }
                    }
                    notice?.let{Text(it,color=fore(dark),fontSize=12.sp)}
                }
            }
        }else{
            when{
                loadingStats->Text("Загружаем статистику…",color=muted(dark))
                error!=null&&usage==null->Text(error.orEmpty(),color=rose)
                usage==null->Text("Статистика пока недоступна.",color=muted(dark))
                else->{
                    val summary=listOf(
                        "Сегодня" to usage!!.todayCreditsMilli,
                        "7 дней" to usage!!.weekCreditsMilli,
                        "30 дней" to usage!!.monthCreditsMilli,
                        "Среднее / день" to usage!!.averageDailyCreditsMilli)
                    summary.chunked(2).forEach{items->
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            items.forEach{(title,value)->
                                Column(Modifier.weight(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(if(dark)Color(0xFF26354A)
                                        else Color(0xFFF5F8FD)).padding(12.dp)){
                                    Text(title,color=muted(dark),fontSize=11.sp)
                                    Text(milliLabel(value),color=fore(dark),
                                        fontWeight=FontWeight.Bold,fontSize=18.sp)
                                }
                            }
                        }
                    }
                    listOf("По моделям · 30 дней" to usage!!.byModel,
                        "По ИИ-инструментам · 30 дней" to usage!!.byFeature)
                        .forEach{(title,items)->
                            Column(Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp,edge(dark),RoundedCornerShape(12.dp))
                                .padding(12.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){
                                Text(title,color=muted(dark),fontSize=11.sp,
                                    fontWeight=FontWeight.Bold)
                                if(items.isEmpty())Text("Пока нет списаний.",
                                    color=muted(dark),fontSize=12.sp)
                                items.forEach{item->
                                    Column(verticalArrangement=Arrangement.spacedBy(4.dp)){
                                        Row(Modifier.fillMaxWidth()){
                                            Text(item.label,Modifier.weight(1f),
                                                color=fore(dark),fontSize=12.sp)
                                            Text(milliLabel(item.creditsMilli),
                                                color=fore(dark),fontSize=12.sp,
                                                fontWeight=FontWeight.Bold)
                                        }
                                        item.children.forEach{child->
                                            Row(Modifier.fillMaxWidth().padding(start=14.dp)){
                                                Text(child.label,Modifier.weight(1f),
                                                    color=muted(dark),fontSize=11.sp)
                                                Text(milliLabel(child.creditsMilli),
                                                    color=muted(dark),fontSize=11.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    Text("Только подтверждённые списания после включения статистики.",
                        color=muted(dark),fontSize=10.sp)
                }
            }
        }
    }
}
