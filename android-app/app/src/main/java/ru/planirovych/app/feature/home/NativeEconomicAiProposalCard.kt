package ru.planirovych.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.RotateLeft
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/** Native implementation of the existing Economic assistant's confirmation
 * card. No financial changes are made locally. All buttons call the same
 * owner-scoped server endpoints as web and Mini App, including safe undo. */
@Composable
internal fun NativeEconomicAiProposalCard(
    initial:JsonObject,c:TaskChatColors,vm:HomeViewModel
){
    val id=(initial["id"] as? JsonPrimitive)?.contentOrNull?:return
    var proposal by remember(id){mutableStateOf(initial)}
    var autoApply by remember(id){mutableStateOf(false)}
    var busy by remember(id){mutableStateOf(false)}
    var error by remember(id){mutableStateOf<String?>(null)}
    val scope=rememberCoroutineScope()
    val light=c.assistantText.red < .5f
    val bg=if(light)Color.White else Color(0xFF30251D)
    val ink=if(light)Color(0xFF263141) else Color(0xFFFFE8CE)
    val muted=if(light)Color(0xFF627184) else Color(0xFFD4AE84)
    val frame=RoundedCornerShape(14.dp)
    val amber=Color(0xFFF2A746)
    val status=(proposal["status"] as? JsonPrimitive)?.contentOrNull.orEmpty()
    val statusLabel=when(status){
        "PENDING"->"Ожидает подтверждения"
        "APPLYING"->"Применяется"
        "APPLIED"->"Применено"
        "REJECTED"->"Отклонено"
        "UNDONE"->"Отменено"
        "UNDOING"->"Отменяется"
        else->status
    }
    LaunchedEffect(id) {
        try{
            proposal=vm.economicProposalDetails(id)
            autoApply=vm.economicAutoApply()
            error=null
        }catch(t:Throwable){
            error="Не удалось обновить карточку: "+(t.message?:"ошибка соединения")
        }
    }
    fun action(kind:String){
        if(busy)return
        busy=true;error=null
        scope.launch {
            try {
                proposal=vm.economicProposalAction(id,kind)
            }catch(t:Throwable){
                // A lost response may follow a committed operation; read
                // the actual server status before offering another attempt.
                val updated=runCatching{vm.economicProposalDetails(id)}.getOrNull()
                if(updated!=null)proposal=updated
                else error="Не удалось проверить действие. Откройте чат заново."
                if(updated!=null && (updated["status"] as? JsonPrimitive)
                    ?.contentOrNull==status)
                    error=t.message?:"Не удалось выполнить действие"
            }finally{busy=false}
        }
    }
    Column(
        Modifier.fillMaxWidth().border(1.dp,Color(0xFFC98C3E).copy(alpha=.55f),frame)
            .background(bg,frame).padding(12.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)
    ){
        Text("◉  "+((proposal["title"] as? JsonPrimitive)?.contentOrNull
            ?:"Финансовое действие"),color=ink,fontSize=12.sp,fontWeight=FontWeight.Bold)
        Text(statusLabel,color=muted,fontSize=10.sp)
        (proposal["description"] as? JsonPrimitive)?.contentOrNull
            ?.takeIf{it.isNotBlank()}?.let{
                Text(it,color=ink,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
            }
        val details=(proposal["details"] as? JsonArray).orEmpty()
        if(details.isNotEmpty()){
            Column(Modifier.fillMaxWidth()
                .background(if(light)Color(0xFFF7F8FA) else Color(0xFF382F29),
                    RoundedCornerShape(9.dp)).padding(9.dp),
                verticalArrangement=Arrangement.spacedBy(4.dp)){
                details.take(8).forEach{entry->
                    val detail=(entry as? JsonPrimitive)?.contentOrNull
                    if(!detail.isNullOrBlank())Text(detail,color=muted,fontSize=11.sp)
                }
            }
        }
        val err=error?:(proposal["error"] as? JsonPrimitive)?.contentOrNull
        if(!err.isNullOrBlank())Text(err,color=Color(0xFFD65B47),fontSize=10.sp)
        if(status=="PENDING"){
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                Button(onClick={action("approve")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    colors=ButtonDefaults.buttonColors(containerColor=amber,
                        contentColor=Color(0xFF2B1B08)),
                    contentPadding=PaddingValues(horizontal=8.dp)){
                    Icon(Icons.Default.Check,null,modifier=Modifier.size(15.dp))
                    Spacer(Modifier.width(3.dp))
                    Text("Применить",fontSize=11.sp)
                }
                OutlinedButton(onClick={action("reject")},enabled=!busy,
                    modifier=Modifier.weight(1f),shape=RoundedCornerShape(9.dp),
                    contentPadding=PaddingValues(horizontal=7.dp)){
                    Icon(Icons.Default.Close,null,modifier=Modifier.size(14.dp),
                        tint=muted)
                    Spacer(Modifier.width(3.dp))
                    Text("Отклонить",color=ink,fontSize=11.sp)
                }
            }
        }
        if(status=="APPLIED"){
            OutlinedButton(onClick={action("undo")},enabled=!busy,
                modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(9.dp)){
                Icon(Icons.Default.RotateLeft,null,modifier=Modifier.size(15.dp),
                    tint=muted)
                Spacer(Modifier.width(5.dp))
                Text("Отменить изменения",color=ink,fontSize=11.sp)
            }
        }
        Row(verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){
            Checkbox(checked=autoApply,enabled=!busy,
                onCheckedChange={enabled->
                    busy=true;error=null
                    scope.launch {
                        try{autoApply=vm.setEconomicAutoApply(enabled)}
                        catch(t:Throwable){error=t.message?:"Ошибка настройки"}
                        finally{busy=false}
                    }
                },
                modifier=Modifier.size(36.dp),
                colors=CheckboxDefaults.colors(checkedColor=amber))
            Spacer(Modifier.width(4.dp))
            Text("Автоматически применять новые изменения",color=muted,
                fontSize=10.sp,lineHeight=14.sp)
        }
    }
}
