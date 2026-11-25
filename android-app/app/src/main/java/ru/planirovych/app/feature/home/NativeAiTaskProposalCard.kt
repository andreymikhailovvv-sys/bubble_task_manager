package ru.planirovych.app.feature.home

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
private fun ProposalMarkdownPreview(text:String, color:Color) {
    Column(Modifier.fillMaxWidth().height(64.dp).verticalScroll(rememberScrollState())) {
        NativeAiFormattedMessage(text=text,textColor=color,linkColor=Color(0xFF7954DB),fontSize=11.sp)
    }
}

private val proposalStatusTitles=mapOf(
    "PENDING" to "Ожидает подтверждения", "APPLYING" to "Применяется",
    "APPLIED" to "Применено", "REJECTED" to "Отклонено",
    "FAILED" to "Ошибка применения", "CONFLICT" to "Конфликт изменений",
    "UNDOING" to "Возвращаем изменения", "UNDONE" to "Изменения отменены")
private val operationTitles=mapOf(
    "create_task" to "Новая задача", "create_event" to "Новое событие",
    "create_reminder" to "Новое напоминание", "create_subtask" to "Новая подзадача",
    "telegram_suggestion" to "Предложение задачи",
    "rename" to "Переименование", "rename_task" to "Переименование",
    "rename_subtask" to "Переименование",
    "reschedule" to "Перенос", "reschedule_task" to "Перенос",
    "reschedule_subtask" to "Перенос",
    "complete" to "Завершение", "complete_task" to "Завершение",
    "complete_subtask" to "Завершение",
    "delete" to "Удаление", "delete_subtask" to "Удаление",
    "set_priority" to "Приоритет", "update_task" to "Изменение",
    "update_subtask" to "Изменение", "change_sphere" to "Сектор",
    "change_task_sphere" to "Сектор", "clear_due_date" to "Удаление срока",
    "reopen" to "Возобновление", "reopen_subtask" to "Возобновление",
    "set_notification" to "Уведомления",
    "create_note" to "Создание заметки", "update_note" to "Изменение заметки",
    "create_habit" to "Новая привычка")
private fun JsonObject.pText(key:String):String? =
    (this[key] as? JsonPrimitive)?.contentOrNull
private val proposalIso=Regex(
    """\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?""")
private fun isoFrom(s:String?):String? = s?.let { proposalIso.find(it)?.value }
private fun formattedProposalDate(s:String):String{
    val local=runCatching{OffsetDateTime.parse(s)
        .atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()}.getOrElse{
        runCatching{LocalDateTime.parse(s)}.getOrNull()
    }?:return s
    return local.format(DateTimeFormatter.ofPattern(
        "d MMMM yyyy 'г.' 'в' HH:mm",Locale.forLanguageTag("ru-RU")))
}
private fun prettyField(raw:String):String{
    val date=isoFrom(raw)
    if(date!=null)return formattedProposalDate(date)
    return when(raw){"TODO"->"Не начато";"IN_PROGRESS"->"В работе";
        "DONE"->"Выполнено";else->raw}
}
/** Mirrors humanDescription() from the Mini App task proposal card. */
private fun proposalDescription(item:JsonObject):String?{
    val type=item.pText("type").orEmpty()
    val before=isoFrom(item.pText("before"))
    val after=isoFrom(item.pText("after"))
    val due=isoFrom(item.pText("dueDate"))?:after
    if(type.startsWith("reschedule"))return when{
        due==null->"Срок изменён"
        before==null->"Новый срок: "+formattedProposalDate(due)
        else->formattedProposalDate(before)+" → "+formattedProposalDate(due)
    }
    if(type=="create_note")return null
    if(type.startsWith("create_")||type=="telegram_suggestion")
        return due?.let{"Срок: "+formattedProposalDate(it)}
    if(type.startsWith("complete"))return "Отмечено выполненным"
    if(type.startsWith("reopen"))return "Возобновлено"
    if(type=="clear_due_date")return "Срок удалён"
    if(type.startsWith("delete"))return "Задача удалена"
    if(type=="change_sphere"||type=="change_task_sphere")return "Сектор изменён"
    if(type=="set_notification")return "Уведомления изменены"
    if(type=="set_priority")return "Приоритет изменён"
    val raw=item.pText("after")?.trim()?.takeIf{it.isNotBlank()}?:return null
    val translation=mapOf("title" to "Новое название","description" to "Описание",
        "dueDate" to "Срок","importance" to "Важность","urgency" to "Срочность",
        "notifyBeforeMinutes" to "Напоминание","status" to "Статус")
    return raw.split(" · ").joinToString(" · "){part->
        val kv=part.split(": ",limit=2)
        if(kv.size!=2)prettyField(part)
        else if(kv[0]=="sphereId")"Сектор изменён"
        else (translation[kv[0]]?:"Изменено")+": "+prettyField(kv[1])
    }
}

/** Full native analogue of AiTaskProposalCard (Mini App/web). */
@Composable
internal fun NativeAiTaskProposalCard(
    original:JsonObject,c:TaskChatColors,busy:Boolean,vm:HomeViewModel,
    onAction:(String,String,List<Int>?,(JsonObject?)->Unit)->Unit
){
    val id=original.pText("id")?:return
    var proposal by remember(id){mutableStateOf(original)}
    var expanded by remember(id){mutableStateOf(false)}
    var localBusy by remember(id){mutableStateOf(false)}
    var preferenceBusy by remember(id){mutableStateOf(false)}
    var localError by remember(id){mutableStateOf<String?>(null)}
    var confirmation by remember(id){mutableStateOf<String?>(null)}
    var editOpen by remember(id){mutableStateOf(false)}
    val editDrafts=remember(id){mutableStateMapOf<Int,Map<String,JsonElement>>()}
    val drafts=remember(id){mutableStateMapOf<Int,Map<String,JsonElement>>()}
    var spheres by remember(id){mutableStateOf<List<Pair<String,String>>>(emptyList())}
    val scope=rememberCoroutineScope()
    fun resetDrafts(current:JsonObject){
        drafts.clear()
        (current["operations"] as? JsonArray).orEmpty().forEachIndexed{index,item->
            val fields=(item as? JsonObject)?.let(::taskChipEditable)
            if(fields!=null)drafts[index]=fields.toMap()
        }
    }
    val preference by vm.taskProposalAutoApply.collectAsStateWithLifecycle()
    LaunchedEffect(original){proposal=original;resetDrafts(original)}
    val source=proposal.pText("source").orEmpty()
    val telegram=source in setOf("telegram_assistant","telegram_bot","telegram_bot_task")
    val checkup=source=="daily_checkup"
    LaunchedEffect(id){
        runCatching{vm.taskProposalDetails(id)}.getOrNull()?.let{
            proposal=it;resetDrafts(it)
        }
        runCatching{vm.taskChipOptions()}.getOrNull()?.let{options->
            spheres=(options["spheres"] as? JsonArray).orEmpty().mapNotNull{item->
                val obj=item as? JsonObject?:return@mapNotNull null
                val key=obj.pText("id")?:return@mapNotNull null
                key to (obj.pText("name")?:key)
            }
        }
        if(!telegram&&!checkup)runCatching{vm.loadTaskProposalAutoApply()}
    }
    val status=proposal.pText("status")?:"PENDING"
    val ops=(proposal["operations"] as? JsonArray).orEmpty()
    var selected by remember(id){mutableStateOf<Set<Int>>(emptySet())}
    LaunchedEffect(id,ops.size){
        if(selected.isEmpty())selected=ops.indices.toSet()
    }
    val onlyNotes=ops.isNotEmpty() && ops.all{
        (it as? JsonObject)?.pText("type") in setOf("create_note","update_note")
    }
    val hasNotes=ops.any{
        (it as? JsonObject)?.pText("type") in setOf("create_note","update_note")
    }
    val dark=c.bg.red<.45f
    val surface=if(dark)Color(0xFF1B1D2B) else Color.White
    val tile=if(dark)Color(0xFF252735) else Color(0xFFF5F6FB)
    val ink=if(dark)Color(0xFFF1F1FA) else Color(0xFF142033)
    val muted=if(dark)Color(0xFFB8BFD1) else Color(0xFF64748B)
    val edge=if(dark)Color(0xFF424457) else Color(0xFFDCE2EE)
    val purple=if(dark)Color(0xFFA78BFA) else Color(0xFF7C3AED)
    val working=busy||localBusy
    fun openEditor(){
        editDrafts.clear();drafts.forEach{(index,fields)->editDrafts[index]=fields.toMap()}
        localError=null;editOpen=true
    }
    fun submit(action:String){
        if(working)return
        localBusy=true;localError=null
        val indices=if(checkup&&action=="approve")selected.sorted() else null
        scope.launch{
            try{
                var current=proposal
                if(action=="approve"||action=="revise"||action=="edit"){
                    for(index in (if(action=="edit")editDrafts.keys else drafts.keys).sorted()){
                        val fields=(current["operations"] as? JsonArray)
                            ?.getOrNull(index) as? JsonObject ?:continue
                        val existing=taskChipEditable(fields)?:continue
                        val changed=(if(action=="edit")editDrafts[index] else drafts[index])?:continue
                        val values=taskChipDraftPayload(changed)
                        if(values==existing)continue
                        val revision=current.pText("revision")
                            ?:throw IllegalStateException("Карточка устарела. Обновите чат.")
                        current=vm.editTaskAiProposal(id,index,revision,values)
                    }
                    proposal=current
                    resetDrafts(current)
                }
                if(action=="edit"||action=="revise"){
                    if(action=="edit")editOpen=false
                    vm.refresh();localBusy=false
                }else onAction(id,action,indices){result->
                    if(result!=null){proposal=result;resetDrafts(result)}
                    else localError="Не удалось выполнить действие. Проверьте состояние предложения."
                    localBusy=false
                }
            }catch(t:Throwable){
                runCatching{vm.taskProposalDetails(id)}.getOrNull()?.let{
                    proposal=it;resetDrafts(it)
                }
                localError=t.message?:"Не удалось изменить задачу"
                localBusy=false
            }
        }
    }
    Surface(shape=RoundedCornerShape(18.dp),color=surface,
        border=BorderStroke(1.dp,edge),modifier=Modifier.fillMaxWidth()){
        Column(Modifier.fillMaxWidth().padding(12.dp),
            verticalArrangement=Arrangement.spacedBy(10.dp)){
            Row(verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(9.dp)){
                Box(Modifier.size(37.dp).clip(RoundedCornerShape(12.dp))
                    .background(purple.copy(alpha=.16f)),contentAlignment=Alignment.Center){
                    Icon(Icons.Default.AssignmentTurnedIn,null,tint=purple,
                        modifier=Modifier.size(20.dp))
                }
                Column(Modifier.weight(1f),
                    verticalArrangement=Arrangement.spacedBy(3.dp)){
                    Text(if(checkup)"Предложение ИИ-чекапа"
                        else if(onlyNotes)"Изменения заметки"
                        else if(hasNotes)"Изменения задач и заметок"
                        else "Изменения задач",
                        color=ink,fontSize=15.sp,lineHeight=19.sp,
                        fontWeight=FontWeight.Bold)
                    Text((if(checkup&&status=="PENDING")
                        selected.size.toString()+" из "+ops.size+" выбрано"
                        else ops.size.toString()+" действий")+" · "+
                        (proposalStatusTitles[status]?:status),
                        color=muted,fontSize=11.sp,lineHeight=15.sp)
                }
                if(status=="APPLIED")Icon(Icons.Default.CheckCircle,null,
                    tint=Color(0xFF22C55E),modifier=Modifier.size(19.dp))
                if(status=="FAILED"||status=="CONFLICT")
                    Icon(Icons.Default.Warning,null,tint=Color(0xFFF59E0B),
                        modifier=Modifier.size(19.dp))
            }
            val visible=if(expanded||checkup)ops.size else minOf(4,ops.size)
            Column(Modifier.fillMaxWidth()
                .heightIn(max=if(expanded||checkup)400.dp else 900.dp)
                .then(if(expanded||checkup)Modifier.verticalScroll(rememberScrollState())
                    else Modifier),
                verticalArrangement=Arrangement.spacedBy(7.dp)){
                for(index in 0 until visible){
                    val item=ops[index] as? JsonObject?:continue
                    val kind=item.pText("type").orEmpty()
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(tile).border(1.dp,edge,RoundedCornerShape(14.dp))
                        .padding(horizontal=11.dp,vertical=10.dp),
                        verticalArrangement=Arrangement.spacedBy(5.dp)){
                        Row(verticalAlignment=Alignment.Top,
                            horizontalArrangement=Arrangement.spacedBy(7.dp)){
                            if(checkup)Checkbox(checked=index in selected,
                                onCheckedChange={
                                    if(status=="PENDING"&&!working)
                                        selected=if(it)selected+index else selected-index
                                },enabled=status=="PENDING"&&!working,
                                modifier=Modifier.size(22.dp),
                                colors=CheckboxDefaults.colors(checkedColor=Color(0xFF7954DB)))
                            Column(Modifier.weight(1f),
                                verticalArrangement=Arrangement.spacedBy(5.dp)){
                                Text(operationTitles[kind]?:kind,color=muted,fontSize=11.sp)
                                Text((if(status in setOf("PENDING","APPLIED"))
                                    (drafts[index]?.get("title") as? JsonPrimitive)?.contentOrNull
                                    else null)?:item.pText("title")?:"Изменение",color=ink,
                                    fontSize=13.sp,lineHeight=18.sp,
                                    fontWeight=FontWeight.Bold)
                                item.pText("parentTitle")?.let{
                                    Text("В задаче «"+it+"»",color=muted,fontSize=11.sp)
                                }
                                val fields=taskChipEditable(item)?.toMap()
                                val description=(fields?.get("description") as? JsonPrimitive)?.contentOrNull
                                val details=(item["details"] as? JsonArray).orEmpty().mapNotNull{(it as? JsonPrimitive)?.contentOrNull}
                                val preview=description?.takeIf{it.isNotBlank()} ?: (listOfNotNull(proposalDescription(item))+details).joinToString("\n")
                                if(preview.isNotBlank())ProposalMarkdownPreview(preview,muted)
                                (fields?.get("dueDate") as? JsonPrimitive)?.contentOrNull
                                    ?.takeIf{it.isNotBlank()}?.let{Text("Срок: "+prettyField(it),color=muted,fontSize=11.sp)}
                            }
                        }
                    }
                }
            }
            if(!checkup&&ops.size>4){
                Row(Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(11.dp))
                    .clickable{expanded=!expanded}.padding(vertical=10.dp),
                    verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.Center){
                    Icon(if(expanded)Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        null,tint=purple,modifier=Modifier.size(17.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if(expanded)"Свернуть" else "Показать все изменения",
                        color=purple,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
                }
            }
            if(checkup&&status=="PENDING")Text(
                "Отметьте изменения, которые хотите внести. Неотмеченные задачи останутся без изменений.",
                color=muted,fontSize=11.sp,lineHeight=16.sp)
            (proposal.pText("error")?:localError)?.let{
                Text(it,color=Color(0xFFFB7185),fontSize=11.sp,lineHeight=16.sp)
            }
            when(status){
                "PENDING"->Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
                    if(ops.any{(it as? JsonObject)?.let(::taskChipEditable)!=null})
                        TextButton(onClick={openEditor()},enabled=!working,modifier=Modifier.fillMaxWidth()){
                            Icon(Icons.Default.Edit,null,modifier=Modifier.size(14.dp))
                            Spacer(Modifier.width(5.dp));Text("Изменить поля",fontSize=11.sp)
                        }
                    Row(Modifier.fillMaxWidth(),
                    horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    Button(onClick={confirmation="approve"},
                        enabled=!working && (!checkup||selected.isNotEmpty()),
                        modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),
                        colors=ButtonDefaults.buttonColors(
                            containerColor=Color(0xFF7954DB))){
                        Text(if(checkup)"Применить ("+selected.size+")" else "Принять",
                            fontSize=11.sp,maxLines=1,softWrap=false)
                    }
                    OutlinedButton(onClick={confirmation="reject"},enabled=!working,
                        shape=RoundedCornerShape(12.dp)){
                        Text("Отклонить",fontSize=11.sp,maxLines=1)
                    }
                    }
                }
                "APPLIED"->Row(Modifier.fillMaxWidth(),
                    horizontalArrangement=Arrangement.spacedBy(7.dp)){
                    if(ops.any{(it as? JsonObject)?.let(::taskChipEditable)!=null}){
                        Button(onClick={openEditor()},enabled=!working,
                            modifier=Modifier.weight(1f),shape=RoundedCornerShape(12.dp),
                            colors=ButtonDefaults.buttonColors(containerColor=Color(0xFF7954DB))){
                            Icon(Icons.Default.Edit,null,modifier=Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Изменить",fontSize=11.sp)
                        }
                    }
                    OutlinedButton(onClick={confirmation="undo"},
                        modifier=Modifier.weight(1f),enabled=!working,
                        shape=RoundedCornerShape(12.dp)){
                        Icon(Icons.Default.Undo,null,modifier=Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Отменить",fontSize=11.sp)
                    }
                }
                else->Text(proposalStatusTitles[status]?:status,
                    color=muted,fontSize=11.sp)
            }
            if(!telegram&&!checkup){
                Row(Modifier.fillMaxWidth().clickable(enabled=!preferenceBusy){
                    if(!preferenceBusy){
                        preferenceBusy=true;localError=null
                        scope.launch{
                            runCatching{
                                vm.setTaskProposalAutoApply(!(preference?:false))
                            }.onFailure{
                                localError=it.message?:"Не удалось сохранить настройку."
                            }
                            preferenceBusy=false
                        }
                    }
                },verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    Checkbox(checked=preference?:false,onCheckedChange=null,
                        modifier=Modifier.size(23.dp),enabled=!preferenceBusy,
                        colors=CheckboxDefaults.colors(checkedColor=Color(0xFF7954DB)))
                    Text("Применять новые изменения автоматически",
                        color=muted,fontSize=11.sp,lineHeight=16.sp)
                }
            }
        }
    }
    if(editOpen){
        Dialog(onDismissRequest={if(!working)editOpen=false}){
            Surface(Modifier.fillMaxWidth().heightIn(max=620.dp),shape=RoundedCornerShape(18.dp),
                color=surface,border=BorderStroke(1.dp,edge)){
                Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Text("Изменить поля",color=ink,fontSize=18.sp,fontWeight=FontWeight.Bold)
                    Column(Modifier.weight(1f,fill=false).verticalScroll(rememberScrollState()),
                        verticalArrangement=Arrangement.spacedBy(10.dp)){
                        ops.forEachIndexed{index,entry->
                            val item=entry as? JsonObject?:return@forEachIndexed
                            val source=taskChipEditable(item)?:return@forEachIndexed
                            val fields=editDrafts[index]?:source.toMap()
                            Column(Modifier.fillMaxWidth().background(tile,RoundedCornerShape(12.dp))
                                .padding(10.dp)){
                                Text(item.pText("title")?:"Изменение",color=ink,fontSize=13.sp,
                                    fontWeight=FontWeight.SemiBold)
                                NativeTaskChipFields(fields,spheres,!working,dark){key,value->
                                    editDrafts[index]=fields+(key to value)
                                }
                            }
                        }
                    }
                    localError?.let{Text(it,color=Color(0xFFFB7185),fontSize=11.sp)}
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        OutlinedButton(onClick={editOpen=false},enabled=!working,
                            modifier=Modifier.weight(1f)){Text("Отмена")}
                        Button(onClick={submit("edit")},enabled=!working,
                            modifier=Modifier.weight(1f)){
                            if(working)CircularProgressIndicator(Modifier.size(16.dp),strokeWidth=2.dp)
                            else Text("Сохранить")
                        }
                    }
                }
            }
        }
    }
    confirmation?.let{action->
        AlertDialog(onDismissRequest={confirmation=null},
            title={Text(when(action){"approve"->"Применить изменения ИИ?"
                "reject"->"Отклонить изменения?";else->"Вернуть изменения?"})},
            text={Text(when(action){"approve"->"Подтвердить внесение изменений?"
                "undo"->"Отменить ранее внесённые изменения?"
                else->"Отклонить предложение ИИ?"})},
            confirmButton={TextButton(onClick={confirmation=null;submit(action)}){
                Text("Подтвердить")
            }},
            dismissButton={TextButton(onClick={confirmation=null}){Text("Отмена")}})
    }
}
