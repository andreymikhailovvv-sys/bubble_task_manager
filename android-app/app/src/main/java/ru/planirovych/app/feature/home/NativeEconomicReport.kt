package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonObject
import ru.planirovych.app.core.network.PlanirovychApi
import java.math.BigInteger
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val reportColors = listOf(
    0xFFF1A94C,0xFF8887ED,0xFF66BDB1,0xFFEC8293,0xFF7EAEF1,0xFFC3A1D9,
    0xFFE0C064,0xFF94C17F,0xFFDC9670,0xFF7DB4C2,0xFFC5A1AE,0xFFA5A6ED
).map { Color(it) }

private fun reportDate(text:String): String = runCatching {
    LocalDate.parse(text.take(10)).format(DateTimeFormatter.ofPattern("dd.MM.yyyy",Locale.forLanguageTag("ru")))
}.getOrDefault(text.take(10))

@Composable
private fun ReportDatePicker(label:String,date:String,colors:EcoColors,onChange:(String)->Unit) {
    val context=LocalContext.current
    val selected=runCatching { LocalDate.parse(date) }.getOrDefault(LocalDate.now())
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
        .background(colors.field).border(1.dp,colors.outline,RoundedCornerShape(10.dp))
        .clickable {
            DatePickerDialog(context,{_,y,m,d->
                onChange("%04d-%02d-%02d".format(y,m+1,d))
            },selected.year,selected.monthValue-1,selected.dayOfMonth).show()
        }.padding(12.dp),verticalAlignment=Alignment.CenterVertically) {
        Icon(Icons.Default.CalendarToday,null,tint=colors.gold,modifier=Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text("$label: ${reportDate(date)}",fontSize=12.sp,color=colors.text)
    }
}

/** Fully native Compose report. Its amounts come from the same server aggregation as the web app. */
@Composable
internal fun EcoReportPanel(api:PlanirovychApi, colors:EcoColors, revision:Int, preview:Boolean = false) {
    var period by remember { mutableStateOf("month") }
    var kind by remember { mutableStateOf("expense") }
    var offset by remember { mutableIntStateOf(0) }
    var start by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1).toString()) }
    var end by remember { mutableStateOf(LocalDate.now().toString()) }
    var report by remember { mutableStateOf<JsonObject?>(null) }
    var busy by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    LaunchedEffect(api,revision,preview,period,offset,start,end) {
        busy=true
        error=""
        try {
            report=api.economicReport(if(preview)"month" else period,
                if(preview)0 else offset,
                if(!preview && period=="custom")start else null,
                if(!preview && period=="custom")end else null)
        } catch(cause:Exception) {
            error=cause.localizedMessage ?: "Не удалось загрузить отчёт"
        } finally { busy=false }
    }
    val selected=report.ecoObject(kind)
    val total=selected.ecoText("totalMinor").toBigIntegerOrNull() ?: BigInteger.ZERO
    val rows=selected.ecoItems("categories")
    val selection=rows.mapIndexed {index,item->
        Triple(item.ecoText("name"),
            item.ecoText("amountMinor").toBigIntegerOrNull() ?: BigInteger.ZERO,
            reportColors[index % reportColors.size])
    }
    val first=report.ecoText("start").take(10)
    val last=runCatching {LocalDate.parse(report.ecoText("end").take(10)).minusDays(1).toString()}.getOrDefault("")
    val range=if(first.isNotBlank() && last.isNotBlank())
        "${reportDate(first)} – ${reportDate(last)}" else "Текущий месяц"
    EcoPanel(colors) {
        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)){
            Icon(Icons.Default.PieChart,null,tint=colors.gold,modifier=Modifier.size(21.dp))
            Text("Финансовый отчёт",color=colors.text,fontWeight=FontWeight.Bold,fontSize=17.sp)
        }
        Spacer(Modifier.height(4.dp))
        Text(if(preview)"Расходы по категориям за текущий месяц" else "Распределение по категориям и периодам",
            color=colors.muted,fontSize=11.sp)
        if(!preview){
            Spacer(Modifier.height(15.dp))
            EcoSelect("Период",period,listOf("week" to "Неделя","month" to "Месяц",
                "year" to "Год","all" to "Всё время","custom" to "Произвольный"),colors){
                period=it;offset=0
            }
            Spacer(Modifier.height(11.dp))
            if(period=="custom"){
                ReportDatePicker("С",start,colors){start=it}
                Spacer(Modifier.height(7.dp))
                ReportDatePicker("По",end,colors){end=it}
            } else if(period!="all"){
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.SpaceBetween) {
                    IconButton(onClick={offset--},enabled=offset > -120) {
                        Icon(Icons.Default.ChevronLeft,"Предыдущий период",tint=colors.goldSoft)
                    }
                    Text(range,fontSize=11.sp,color=colors.muted)
                    IconButton(onClick={offset++},enabled=offset < 0) {
                        Icon(Icons.Default.ChevronRight,"Следующий период",tint=colors.goldSoft)
                    }
                }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(7.dp)) {
                listOf("expense" to "Расходы","income" to "Доходы").forEach { (value,label) ->
                    val active=kind==value
                    Text(label,Modifier.clip(RoundedCornerShape(10.dp))
                        .background(if(active)colors.gold.copy(alpha=.20f) else colors.field)
                        .border(1.dp,if(active)colors.gold else colors.outline,RoundedCornerShape(10.dp))
                        .clickable{kind=value}.padding(horizontal=13.dp,vertical=9.dp),
                        color=if(active)colors.goldSoft else colors.muted,fontSize=12.sp)
                }
            }
        }
        if(error.isNotBlank()){
            Spacer(Modifier.height(9.dp))
            Text(error,color=Color(0xFFE99D75),fontSize=12.sp)
        }
        if(busy && report==null) {
            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(Modifier.fillMaxWidth(),color=colors.gold)
        }
        Spacer(Modifier.height(18.dp))
        Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.Center) {
            Box(Modifier.size(220.dp),contentAlignment=Alignment.Center) {
                Canvas(Modifier.fillMaxSize()) {
                    val inset=19.dp.toPx()
                    val ringSize=Size(size.width-inset*2,size.height-inset*2)
                    val stroke=Stroke(width=29.dp.toPx())
                    if(total==BigInteger.ZERO) {
                        drawArc(color=colors.outline,startAngle=-90f,sweepAngle=360f,useCenter=false,
                            topLeft=Offset(inset,inset),size=ringSize,style=stroke)
                    } else {
                        var angle=-90f
                        selection.forEach { (_,amount,color) ->
                            val sweep=360f*(amount.toDouble()/total.toDouble()).toFloat()
                            if(sweep>0f) drawArc(color=color,startAngle=angle,sweepAngle=sweep,
                                useCenter=false,topLeft=Offset(inset,inset),size=ringSize,style=stroke)
                            angle+=sweep
                        }
                    }
                }
                Column(horizontalAlignment=Alignment.CenterHorizontally) {
                    Text(if(kind=="expense")"Расходы" else "Доходы",color=colors.muted,fontSize=12.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(ecoRubles(total.toString()),color=colors.text,fontSize=17.sp,
                        fontWeight=FontWeight.ExtraBold,maxLines=1)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        if(selection.isEmpty()) {
            Text(if(busy)"Загрузка…" else "За выбранный период операций нет",color=colors.muted,
                modifier=Modifier.fillMaxWidth(),fontSize=12.sp)
        }
        selection.forEach { (name,amount,color) ->
            val ratio=if(total==BigInteger.ZERO)0f else
                (amount.toDouble()/total.toDouble()).toFloat().coerceIn(0f,1f)
            Row(Modifier.fillMaxWidth().padding(top=8.dp),verticalAlignment=Alignment.CenterVertically) {
                Box(Modifier.size(9.dp).background(color, RoundedCornerShape(9.dp)))
                Spacer(Modifier.width(8.dp))
                Text(name,Modifier.weight(1f),color=colors.muted,fontSize=12.sp,
                    maxLines=2,overflow=TextOverflow.Ellipsis)
                Text(ecoRubles(amount.toString()),color=colors.text,fontSize=12.sp,
                    fontWeight=FontWeight.SemiBold)
            }
            Spacer(Modifier.height(5.dp))
            LinearProgressIndicator(progress={ratio},modifier=Modifier.fillMaxWidth().height(4.dp),
                color=color,trackColor=colors.outline)
            Text("${"%.1f".format(Locale.US,ratio*100)}%",color=colors.muted,
                modifier=Modifier.fillMaxWidth(),fontSize=10.sp)
        }
    }
}
