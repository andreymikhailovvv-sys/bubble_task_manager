package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.*
import java.time.*

private val TASK_KEYS=listOf("title","description","sphereId","dueDate","importance",
    "urgency","status","location","notifyBeforeMinutes")
private val TASK_LABELS=mapOf("title" to "Название","description" to "Описание",
    "sphereId" to "Сектор","dueDate" to "Дата и время",
    "importance" to "Важность","urgency" to "Срочность","status" to "Статус",
    "location" to "Место","notifyBeforeMinutes" to "Уведомление, мин.")

internal fun taskChipEditable(item:JsonObject):JsonObject?=item["editable"] as? JsonObject
private fun JsonElement?.fieldValue():String=(this as? JsonPrimitive)?.contentOrNull.orEmpty()

/** Input value is always the original JSON unless a user explicitly edits it.
 * That preserves the exact ISO instant for an unchanged due date. */
internal fun taskChipDraftPayload(values:Map<String,JsonElement>):JsonObject=buildJsonObject{
    values.forEach{(key,element)->
        val raw=element.fieldValue()
        when{
            element==JsonNull->put(key,JsonNull)
            key=="dueDate"&&raw.isBlank()->put(key,JsonNull)
            key=="dueDate"&&raw.length==16&&raw[10]=='T'->{
                val dt=LocalDateTime.parse(raw)
                put(key,dt.atZone(ZoneId.systemDefault()).toInstant().toString())
            }
            key in listOf("importance","urgency","notifyBeforeMinutes")->{
                val number=raw.toIntOrNull()
                    ?:throw IllegalArgumentException("Введите целое число в поле «"+key+"»")
                put(key,number)
            }
            else->put(key,element)
        }
    }
}
private fun localTime(value:String):String{
    if(value.isBlank())return ""
    return runCatching{
        Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDateTime().toString().take(16)
    }.getOrElse{value.take(16)}
}

@Composable
private fun ChipOption(
    selected:String,options:List<Pair<String,String>>,enabled:Boolean,
    ink:Color,edge:Color,surface:Color,onChange:(String)->Unit
){
    var open by remember{mutableStateOf(false)}
    val title=options.firstOrNull{it.first==selected}?.second
        ?:selected.ifBlank{"Выбрать"}
    Box(Modifier.fillMaxWidth()){
        Box(Modifier.fillMaxWidth().heightIn(min=30.dp)
            .border(1.dp,edge,RoundedCornerShape(7.dp))
            .background(surface,RoundedCornerShape(7.dp))
            .clickable(enabled=enabled){open=true}.padding(horizontal=7.dp,vertical=7.dp)){
            Text(title,color=ink,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded=open,onDismissRequest={open=false}){
            options.forEach{(code,label)->
                DropdownMenuItem(text={Text(label,fontSize=12.sp)},
                    onClick={open=false;onChange(code)})
            }
        }
    }
}

@Composable
internal fun NativeTaskChipFields(
    draft:Map<String,JsonElement>,
    spheres:List<Pair<String,String>>,
    enabled:Boolean,
    dark:Boolean,
    onChange:(String,JsonElement)->Unit
){
    val ink=if(dark)Color(0xFFF1F1FA) else Color(0xFF142033)
    val muted=if(dark)Color(0xFFB8BFD1) else Color(0xFF64748B)
    val edge=if(dark)Color(0xFF52546B) else Color(0xFFDCE2EE)
    val surface=if(dark)Color(0xFF1B1D2B) else Color.White
    // The operation tile is already the inner panel. Keep the fields scrollable
    // without drawing a third card and an extra outline inside it.
    Column(Modifier.fillMaxWidth().heightIn(max=184.dp)
        .verticalScroll(rememberScrollState()).padding(top=4.dp,end=2.dp),
        verticalArrangement=Arrangement.spacedBy(6.dp)){
        TASK_KEYS.filter{draft.containsKey(it)}.forEach{key->
            val value=draft[key].fieldValue()
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(6.dp)){
                Text(TASK_LABELS[key]?:key,Modifier.weight(.38f),color=muted,
                    fontSize=10.sp,lineHeight=12.sp)
                val options:List<Pair<String,String>>?=when(key){
                    "sphereId"->listOf("" to "Без сектора")+spheres
                    "status"->listOf("TODO" to "Не начато",
                        "IN_PROGRESS" to "В работе","DONE" to "Выполнено")
                    "importance","urgency"->(1..5).map{it.toString() to it.toString()}
                    else->null
                }
                Box(Modifier.weight(.62f)){
                    if(options!=null)ChipOption(value,options,enabled,ink,edge,surface){
                        onChange(key,if(it.isEmpty()&&key=="sphereId")JsonNull
                            else if(key in listOf("importance","urgency"))JsonPrimitive(it.toInt())
                            else JsonPrimitive(it))
                    }else BasicTextField(
                        value=if(key=="dueDate"&&value.contains("T"))localTime(value)else value,
                        onValueChange={onChange(key,JsonPrimitive(it))},
                        enabled=enabled,singleLine=key!="description",
                        textStyle=TextStyle(color=ink,fontSize=11.sp),
                        keyboardOptions=KeyboardOptions(keyboardType=
                            if(key=="notifyBeforeMinutes")KeyboardType.Number else KeyboardType.Text),
                        modifier=Modifier.fillMaxWidth()
                            .border(1.dp,edge,RoundedCornerShape(7.dp))
                            .background(surface,RoundedCornerShape(7.dp))
                            .padding(horizontal=7.dp,vertical=7.dp))
                }
            }
        }
    }
}
