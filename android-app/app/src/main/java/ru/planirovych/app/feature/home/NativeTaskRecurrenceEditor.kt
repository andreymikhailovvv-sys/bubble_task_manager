package ru.planirovych.app.feature.home

import android.app.TimePickerDialog
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import kotlinx.serialization.json.*
import java.time.ZoneId

/**
 * Manual recurrence uses exactly the same FREQ/slots/Timezone JSON as desktop.
 * Shared by creation and existing-task settings; neither requires an AI call.
 */
@Composable
internal fun NativeTaskRecurrenceEditor(
    rule:JsonObject?,
    summary:String?,
    prompt:String,
    onPrompt:(String)->Unit,
    onManual:(JsonObject,String)->Unit,
    onParse:()->Unit,
    parsing:Boolean,
    error:String?=null,
    isEvent:Boolean=false,
    dark:Boolean
) {
    val ctx=LocalContext.current
    val savedSlots=remember(rule){(rule?.get("slots") as? JsonArray)
        ?.mapNotNull{it as? JsonObject}.orEmpty()}
    val savedPeriod=remember(rule){
        (rule?.get("rrule") as? JsonPrimitive)?.contentOrNull
            ?.substringAfter("FREQ=")?.substringBefore(';')
            ?.takeIf{it in listOf("DAILY","WEEKLY","MONTHLY")}
            ?:"DAILY"
    }
    var mode by remember{mutableStateOf(if(savedSlots.isNotEmpty())"manual"
        else if(rule!=null)"ai" else "manual")}
    var period by remember{mutableStateOf(savedPeriod)}
    val times=remember{mutableStateListOf<String>().also{list->
        list.addAll(if(savedPeriod=="DAILY")savedSlots.mapNotNull{
            (it["time"] as? JsonPrimitive)?.contentOrNull
        }.ifEmpty{listOf("09:00")} else listOf(
            (savedSlots.firstOrNull()?.get("time") as? JsonPrimitive)
                ?.contentOrNull ?: "09:00"))
    }}
    val days=remember{mutableStateListOf<Int>().also{list->
        list.addAll(savedSlots.mapNotNull{
            val field=if(savedPeriod=="WEEKLY")"weekday" else "monthDay"
            (it[field] as? JsonPrimitive)?.intOrNull
        }.ifEmpty{listOf(1)})
    }}
    val activeOnManual by rememberUpdatedState(onManual)
    val slate=if(dark)Color(0xFF466875)else Color(0xFFDDEAF0)
    val selectedText=if(dark)Color.White else Color(0xFF234B59)
    val muted=if(dark)Color(0xFFAEC3CC)else Color(0xFF617584)
    val outline=if(dark)Color(0xFF516674)else Color(0xFFD2DEE5)
    val currentTimes=times.toList()
    val currentDays=days.toList()
    LaunchedEffect(mode,period,currentTimes,currentDays){
        if(mode!="manual")return@LaunchedEffect
        val slots=if(period=="DAILY")currentTimes.map{t->
            buildJsonObject{put("time",t)}
        }else currentDays.sorted().map{day->
            buildJsonObject{
                put("time",currentTimes.firstOrNull()?:"09:00")
                put(if(period=="WEEKLY")"weekday" else "monthDay",day)
            }
        }
        if(slots.isEmpty() || slots.any{
            val t=(it["time"] as? JsonPrimitive)?.contentOrNull.orEmpty()
            !Regex("^(?:[01]\\d|2[0-3]):[0-5]\\d$").matches(t)
        })return@LaunchedEffect
        val result=buildJsonObject{
            put("rrule","FREQ="+period)
            put("timezone",ZoneId.systemDefault().id)
            put("until",JsonNull)
            put("slots",JsonArray(slots))
        }
        val unit=when(period){"DAILY"->"день";"WEEKLY"->"неделю";else->"месяц"}
        activeOnManual(result,slots.size.toString()+" раз в "+unit)
    }
    val selectedColors=ButtonDefaults.buttonColors(
        containerColor=slate,contentColor=selectedText)
    val quietColors=ButtonDefaults.outlinedButtonColors(contentColor=muted)
    Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            listOf("manual" to "Вручную","ai" to "Через ИИ").forEach{(key,label)->
                OutlinedButton(onClick={mode=key},
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(10.dp),
                    border=BorderStroke(1.dp,outline),
                    colors=if(mode==key)selectedColors else quietColors,
                    contentPadding=PaddingValues(horizontal=8.dp,vertical=7.dp)){
                    Text(label,fontSize=12.sp)
                }
            }
        }
        if(mode=="manual"){
            Row(horizontalArrangement=Arrangement.spacedBy(5.dp)){
                listOf("DAILY" to "В день","WEEKLY" to "В неделю",
                    "MONTHLY" to "В месяц").forEach{(key,label)->
                    OutlinedButton(onClick={
                        period=key
                        if(key!="DAILY" && days.isEmpty())days.add(1)
                        if(key=="DAILY" && times.size>1) {
                            val first=times.first()
                            times.clear();times.add(first)
                        }
                    },modifier=Modifier.weight(1f),
                        shape=RoundedCornerShape(9.dp),
                        border=BorderStroke(1.dp,outline),
                        colors=if(period==key)selectedColors else quietColors,
                        contentPadding=PaddingValues(horizontal=2.dp,vertical=8.dp)){
                        Text(label,fontSize=11.sp)
                    }
                }
            }
            fun selectTime(index:Int){
                val current=times.getOrNull(index)?:"09:00"
                val parts=current.split(":").mapNotNull{it.toIntOrNull()}
                TimePickerDialog(ctx,{_,h,m->
                    if(index in times.indices)
                        times[index]="%02d:%02d".format(h,m)
                },parts.getOrElse(0){9},parts.getOrElse(1){0},true).show()
            }
            if(period=="DAILY"){
                times.forEachIndexed{index,time->
                    Row(Modifier.fillMaxWidth(),
                        horizontalArrangement=Arrangement.SpaceBetween){
                        Text("Время "+(index+1),fontSize=12.sp,color=muted,
                            modifier=Modifier.padding(top=10.dp))
                        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                            OutlinedButton(onClick={selectTime(index)},
                                shape=RoundedCornerShape(9.dp)){
                                Text(time,fontSize=12.sp)
                            }
                            if(times.size>1)TextButton(onClick={times.removeAt(index)}){
                                Text("×",fontSize=17.sp)
                            }
                        }
                    }
                }
                OutlinedButton(onClick={
                    if(times.size<31){
                        val next=(0 until 24*60).map{i->
                            "%02d:%02d".format((i+540)/60%24,(i+540)%60)
                        }.firstOrNull{it !in times}
                        if(next!=null)times.add(next)
                    }
                },enabled=times.size<31,shape=RoundedCornerShape(10.dp)){
                    Text("＋ Добавить время",fontSize=12.sp)
                }
            }else{
                Row(Modifier.fillMaxWidth(),
                    horizontalArrangement=Arrangement.SpaceBetween){
                    Text("Время",fontSize=12.sp,color=muted,
                        modifier=Modifier.padding(top=11.dp))
                    OutlinedButton(onClick={selectTime(0)},
                        shape=RoundedCornerShape(9.dp)){
                        Text(times.firstOrNull()?:"09:00",fontSize=12.sp)
                    }
                }
                val choices=if(period=="WEEKLY")(1..7).toList()
                    else (1..31).toList()
                choices.chunked(7).forEach{week->
                    Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){
                        week.forEach{day->
                            val selected=day in days
                            OutlinedButton(onClick={
                                if(selected){if(days.size>1)days.remove(day)}
                                else days.add(day)
                            },modifier=Modifier.weight(1f),
                                shape=RoundedCornerShape(8.dp),
                                border=BorderStroke(1.dp,outline),
                                colors=if(selected)selectedColors else quietColors,
                                contentPadding=PaddingValues(0.dp)){
                                Text(if(period=="WEEKLY")listOf(
                                    "Пн","Вт","Ср","Чт","Пт","Сб","Вс")[day-1]
                                    else day.toString(),fontSize=10.sp,maxLines=1)
                            }
                        }
                        repeat(7-week.size){Spacer(Modifier.weight(1f))}
                    }
                }
            }
            Text("Время указано для вашего часового пояса",
                color=muted,fontSize=11.sp)
        }else{
            OutlinedTextField(value=prompt,onValueChange=onPrompt,
                label={Text(if(isEvent)"Как повторяется событие"
                    else "Как повторяется задача")},
                placeholder={Text("Каждый вторник в 17:00")},
                modifier=Modifier.fillMaxWidth(),minLines=2,maxLines=3)
            OutlinedButton(onClick=onParse,enabled=prompt.isNotBlank()&&!parsing,
                shape=RoundedCornerShape(10.dp)){
                Text(if(parsing)"Обработка…" else "Применить расписание",fontSize=12.sp)
            }
        }
        summary?.takeIf{it.isNotBlank()}?.let{
            Text(it,fontSize=12.sp,color=muted,fontWeight=FontWeight.Medium)
        }
        error?.let{Text(it,color=MaterialTheme.colorScheme.error,fontSize=11.sp)}
    }
}
