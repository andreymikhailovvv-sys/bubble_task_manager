package ru.planirovych.app.feature.home

import android.text.Html
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.planirovych.app.data.model.*

/** Native notes board mirrors MiniApp's StandaloneNotesWorkspace and uses the same API. */
@Composable
internal fun NativeNotesPage(vm:HomeViewModel,colors:WorkspaceColors,
    modifier:Modifier=Modifier){
    val state by vm.state.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var groupId by remember { mutableStateOf("all") }
    var editing by remember { mutableStateOf<StandaloneNote?>(null) }
    var editorOpen by remember { mutableStateOf(false) }
    var groupManagerOpen by remember { mutableStateOf(false) }
    var newGroup by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<StandaloneNote?>(null) }
    val groups=state.noteGroups.sortedWith(compareByDescending<StandaloneNoteGroup>{
        it.sphereId!=null
    }.thenBy{it.name})
    val groupMap=remember(groups){groups.associateBy{it.id}}
    LaunchedEffect(state.user?.id){vm.loadNotes()}
    val normalized=query.trim().lowercase().replace('ё','е')
    val filtered=remember(state.notes,groupId,normalized){
        state.notes.asSequence()
            .filter { groupId=="all" || (groupId=="ungrouped" && it.groupId==null) || it.groupId==groupId }
            .filter {note->
                normalized.isBlank() ||
                (note.title+" "+noteText(note.content)).lowercase()
                    .replace('ё','е').contains(normalized)
            }
            .sortedByDescending{it.updatedAt?:it.createdAt?:""}
            .toList()
    }
    Column(modifier.fillMaxSize().padding(horizontal=14.dp,vertical=12.dp),
        verticalArrangement=Arrangement.spacedBy(11.dp)){
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.SpaceBetween){
            Column {
                Text("ЛИЧНЫЕ ЗАПИСИ",fontSize=10.sp,
                    letterSpacing=1.7.sp,fontWeight=FontWeight.Bold,color=colors.purple)
                Text("Мои заметки",fontSize=21.sp,fontWeight=FontWeight.Bold,color=colors.text)
                Text(filtered.size.toString()+" из "+state.notes.size,
                    fontSize=11.sp,color=colors.secondaryText)
            }
            Button(onClick={editing=null;editorOpen=true},
                shape=RoundedCornerShape(13.dp),
                contentPadding=PaddingValues(horizontal=11.dp,vertical=8.dp)){
                Icon(Icons.Default.Add,null,modifier=Modifier.size(17.dp))
                Spacer(Modifier.width(3.dp))
                Text("Новая",fontSize=12.sp)
            }
        }
        LazyRow(horizontalArrangement=Arrangement.spacedBy(7.dp)){
            item {
                NoteGroupChip("Группы",false,colors,Color(0xFF8B5CF6),
                    icon=Icons.Default.Settings){groupManagerOpen=true;newGroup=false}
            }
            item{NoteGroupChip("Все",groupId=="all",colors,colors.purple){
                groupId="all"
            }}
            item{NoteGroupChip("Без группы",groupId=="ungrouped",colors,Color(0xFF64748B)){
                groupId="ungrouped"
            }}
            items(groups,key={it.id}){g->
                NoteGroupChip(g.name,groupId==g.id,colors,noteColor(g.color)){
                    groupId=g.id
                }
            }
            item{NoteGroupChip("+ Группа",false,colors,Color(0xFF059669)){
                groupManagerOpen=true;newGroup=true
            }}
        }
        OutlinedTextField(value=query,onValueChange={query=it},
            modifier=Modifier.fillMaxWidth(),singleLine=true,
            leadingIcon={Icon(Icons.Default.Search,null)},
            label={Text("Поиск по заметкам")},
            trailingIcon=if(query.isNotEmpty()) ({ IconButton(onClick={query=""}) {
                Icon(Icons.Default.Close,"Очистить поиск")
            }}) else null,
            shape=RoundedCornerShape(15.dp))
        state.notesError?.let{Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)}
        if(state.notesLoading && state.notes.isEmpty()){
            Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){
                CircularProgressIndicator()
            }
        } else if(filtered.isEmpty()){
            Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center){
                Text(if(query.isNotBlank())"По запросу ничего не найдено"
                    else if(groupId!="all")"В этой группе нет заметок"
                    else "Пока нет заметок. Создайте первую.",
                    color=colors.secondaryText)
            }
        } else {
            LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(bottom=18.dp),
                verticalArrangement=Arrangement.spacedBy(11.dp)){
                items(filtered,key={it.id}) {note->
                    val group=groupMap[note.groupId]
                    Surface(shape=RoundedCornerShape(18.dp),color=colors.card,
                        border=BorderStroke(1.dp,colors.panelBorder),shadowElevation=1.dp){
                        Column {
                            Column(Modifier.fillMaxWidth().clickable{
                                editing=note;editorOpen=true
                            }.padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                                Text(note.title.ifBlank{"Без названия"},
                                    color=colors.text,fontWeight=FontWeight.Bold,fontSize=15.sp,
                                    maxLines=2,overflow=TextOverflow.Ellipsis)
                                if(group!=null){
                                    Row(Modifier.clip(CircleShape)
                                        .background(noteColor(group.color).copy(alpha=.12f))
                                        .padding(horizontal=9.dp,vertical=5.dp),
                                        verticalAlignment=Alignment.CenterVertically){
                                        Box(Modifier.size(7.dp).background(noteColor(group.color),CircleShape))
                                        Spacer(Modifier.width(6.dp))
                                        Text(group.name,fontSize=11.sp,color=colors.text,maxLines=1)
                                    }
                                }
                                Text(noteText(note.content).ifBlank{"Пустая заметка"},
                                    fontSize=12.sp,color=colors.secondaryText,
                                    maxLines=4,overflow=TextOverflow.Ellipsis)
                            }
                            HorizontalDivider(color=colors.panelBorder)
                            Row(Modifier.fillMaxWidth().padding(horizontal=10.dp),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.SpaceBetween){
                                Text(note.updatedAt?.take(10)?:note.createdAt?.take(10).orEmpty(),
                                    fontSize=10.sp,color=colors.secondaryText)
                                Row {
                                    var groupPicker by remember { mutableStateOf(false) }
                                    Box{
                                        IconButton(onClick={groupPicker=true},modifier=Modifier.size(34.dp)){
                                            Icon(Icons.Default.Label,"Переместить в группу",
                                                tint=colors.secondaryText,modifier=Modifier.size(18.dp))
                                        }
                                        DropdownMenu(expanded=groupPicker,
                                            onDismissRequest={groupPicker=false}){
                                            DropdownMenuItem(text={Text("Без группы")},onClick={
                                                groupPicker=false;vm.assignNoteGroup(note.id,null)
                                            })
                                            groups.forEach{g->DropdownMenuItem(text={Text(g.name)},onClick={
                                                groupPicker=false;vm.assignNoteGroup(note.id,g.id)
                                            })}
                                        }
                                    }
                                    IconButton(onClick={deleting=note},modifier=Modifier.size(34.dp)){
                                        Icon(Icons.Default.DeleteOutline,"Удалить заметку",
                                            tint=colors.secondaryText,modifier=Modifier.size(18.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if(editorOpen) NoteEditorDialog(
        note=editing,groups=groups,colors=colors,busy=state.notesBusy,
        error=state.notesError,
        initialGroup=if(groupId!="all"&&groupId!="ungrouped")groupId else null,
        onClose={editorOpen=false;editing=null},
        onSave={title,html,group->
            val close={editorOpen=false;editing=null}
            if(editing==null)vm.createNote(title,html,group,close)
            else vm.saveNote(editing!!.id,title,html,group,close)
        })
    if(groupManagerOpen) NoteGroupManager(vm=vm,colors=colors,groups=groups,
        startNew=newGroup,onClose={groupManagerOpen=false})
    deleting?.let{note->
        AlertDialog(onDismissRequest={deleting=null},
            title={Text("Удалить заметку?")},
            text={Text(note.title.ifBlank{"Без названия"})},
            confirmButton={TextButton(onClick={
                vm.deleteNote(note.id){}
                deleting=null
            }){Text("Удалить")}},
            dismissButton={TextButton(onClick={deleting=null}){Text("Отмена")}})
    }
}
private fun noteText(html:String):String =
    Html.fromHtml(html,Html.FROM_HTML_MODE_COMPACT).toString().trim()
private fun noteHtml(text:String):String=
    Html.escapeHtml(text).replace("\n","<br>")
private fun noteColor(value:String):Color=runCatching{
    Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Color(0xFF8B5CF6))
@Composable
private fun NoteGroupChip(label:String,active:Boolean,colors:WorkspaceColors,
    accent:Color,icon:androidx.compose.ui.graphics.vector.ImageVector?=null,
    onClick:()->Unit){
    Row(Modifier.height(34.dp).clip(CircleShape)
        .background(if(active)colors.selected else colors.panel)
        .border(1.dp,if(active)colors.purple else colors.panelBorder,CircleShape)
        .clickable(onClick=onClick).padding(horizontal=11.dp),
        verticalAlignment=Alignment.CenterVertically){
        if(icon!=null)Icon(icon,null,tint=colors.purple,modifier=Modifier.size(15.dp))
        else Box(Modifier.size(7.dp).background(accent,CircleShape))
        Spacer(Modifier.width(5.dp))
        Text(label,fontSize=11.sp,color=colors.text,
            fontWeight=if(active)FontWeight.Bold else FontWeight.Normal,maxLines=1)
    }
}
@Composable
private fun NoteEditorDialog(note:StandaloneNote?,groups:List<StandaloneNoteGroup>,
    colors:WorkspaceColors,busy:Boolean,error:String?,
    initialGroup:String?,onClose:()->Unit,onSave:(String,String,String?)->Unit) {
    var title by remember(note?.id){ mutableStateOf(note?.title.orEmpty()) }
    val original=remember(note?.id){note?.content.orEmpty()}
    val decoded=remember(note?.id){noteText(original)}
    var text by remember(note?.id){mutableStateOf(decoded)}
    var group by remember(note?.id){mutableStateOf(note?.groupId?:initialGroup)}
    var groupsOpen by remember{mutableStateOf(false)}
    androidx.compose.ui.window.Dialog(onDismissRequest=onClose,
        properties=androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxWidth().fillMaxHeight(.87f)
            .padding(horizontal=10.dp,vertical=19.dp),
            color=colors.panel,shape=RoundedCornerShape(23.dp),
            border=BorderStroke(1.dp,colors.panelBorder)){
            Column(Modifier.padding(15.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                    horizontalArrangement=Arrangement.SpaceBetween){
                    Text(if(note==null)"Новая заметка" else "Редактирование заметки",
                        fontWeight=FontWeight.Bold,color=colors.text,fontSize=16.sp)
                    IconButton(onClick=onClose){Icon(Icons.Default.Close,"Закрыть")}
                }
                OutlinedTextField(value=title,onValueChange={title=it},
                    label={Text("Название")},modifier=Modifier.fillMaxWidth())
                Box{
                    OutlinedButton(onClick={groupsOpen=true},modifier=Modifier.fillMaxWidth()){
                        Text(groups.firstOrNull{it.id==group}?.name ?: "Без группы")
                        Icon(Icons.Default.ArrowDropDown,null)
                    }
                    DropdownMenu(expanded=groupsOpen,onDismissRequest={groupsOpen=false}){
                        DropdownMenuItem(text={Text("Без группы")},onClick={
                            group=null;groupsOpen=false
                        })
                        groups.forEach{g->
                            DropdownMenuItem(text={Text(g.name)},onClick={
                                group=g.id;groupsOpen=false
                            })
                        }
                    }
                }
                OutlinedTextField(value=text,onValueChange={text=it},
                    label={Text("Текст заметки")},modifier=Modifier.fillMaxWidth().weight(1f),
                    minLines=6)
                if(note!=null && text!=decoded)Text(
                    "При изменении текста сложное форматирование заменяется обычным.",
                    color=colors.secondaryText,fontSize=11.sp)
                error?.let{Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)}
                Button(onClick={
                    onSave(title.trim(),if(note!=null && text==decoded)original else noteHtml(text),group)
                },modifier=Modifier.fillMaxWidth(),enabled=!busy,
                    shape=RoundedCornerShape(13.dp)){
                    Text(if(busy)"Сохраняем…" else "Сохранить")
                }
            }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NoteGroupManager(vm:HomeViewModel,colors:WorkspaceColors,
    groups:List<StandaloneNoteGroup>,startNew:Boolean,onClose:()->Unit){
    val state by vm.state.collectAsStateWithLifecycle()
    var selected by remember { mutableStateOf<StandaloneNoteGroup?>(null) }
    var form by remember { mutableStateOf(startNew) }
    var name by remember { mutableStateOf("") }
    var color by remember { mutableStateOf("#8b5cf6") }
    var confirm by remember { mutableStateOf<StandaloneNoteGroup?>(null) }
    val swatches=listOf("#8b5cf6","#0891b2","#d97706","#db2777",
        "#059669","#4f46e5","#e11d48","#64748b")
    ModalBottomSheet(onDismissRequest=onClose,containerColor=colors.panel,
        sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true)){
        Column(Modifier.fillMaxWidth().heightIn(max=580.dp)
            .verticalScroll(rememberScrollState()).padding(horizontal=17.dp,vertical=12.dp)
            .navigationBarsPadding(),verticalArrangement=Arrangement.spacedBy(12.dp)){
            Text("Группы заметок",fontWeight=FontWeight.Bold,fontSize=19.sp,color=colors.text)
            Text("Группы секторов редактируются через настройки секторов.",
                color=colors.secondaryText,fontSize=11.sp)
            groups.forEach{g->
                Surface(color=colors.card,shape=RoundedCornerShape(12.dp),
                    border=BorderStroke(1.dp,colors.panelBorder)){
                    Row(Modifier.fillMaxWidth().padding(start=10.dp),
                        verticalAlignment=Alignment.CenterVertically){
                        Box(Modifier.size(10.dp).background(noteColor(g.color),CircleShape))
                        Spacer(Modifier.width(8.dp))
                        Text(g.name,Modifier.weight(1f),
                            color=colors.text,fontSize=13.sp,maxLines=1)
                        if(g.sphereId!=null)Text("Сектор",color=colors.secondaryText,fontSize=10.sp)
                        else {
                            IconButton(onClick={
                                selected=g;name=g.name;color=g.color;form=true
                            }){Icon(Icons.Default.Edit,"Изменить",tint=colors.purple)}
                            IconButton(onClick={confirm=g}){
                                Icon(Icons.Default.DeleteOutline,"Удалить",
                                    tint=colors.secondaryText)
                            }
                        }
                    }
                }
            }
            if(!form){
                OutlinedButton(onClick={
                    selected=null;name="";color="#8b5cf6";form=true
                },modifier=Modifier.fillMaxWidth(),enabled=groups.size<40){
                    Icon(Icons.Default.Add,null);Text("Новая группа")
                }
            } else {
                OutlinedTextField(value=name,onValueChange={name=it.take(50)},
                    label={Text("Название группы")},modifier=Modifier.fillMaxWidth())
                Text("Цвет группы",color=colors.secondaryText,fontSize=12.sp)
                Row(horizontalArrangement=Arrangement.spacedBy(5.dp)){
                    swatches.forEach{swatch->
                        Box(Modifier.size(33.dp).background(noteColor(swatch),CircleShape)
                            .border(if(color==swatch)3.dp else 1.dp,
                                if(color==swatch)colors.text else colors.panelBorder,CircleShape)
                            .clickable{color=swatch})
                    }
                }
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    OutlinedButton(onClick={form=false},modifier=Modifier.weight(1f)){
                        Text("Отмена")
                    }
                    Button(onClick={
                        vm.saveNoteGroup(selected?.id,name,color){
                            form=false;selected=null
                        }
                    },enabled=name.isNotBlank()&&!state.notesBusy,
                        modifier=Modifier.weight(1f)){Text("Сохранить")}
                }
            }
            state.notesError?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            Spacer(Modifier.height(8.dp))
        }
    }
    confirm?.let{g->
        AlertDialog(onDismissRequest={confirm=null},
            title={Text("Удалить группу?")},
            text={Text("Заметки останутся без группы.")},
            confirmButton={TextButton(onClick={
                vm.deleteNoteGroup(g.id)
                confirm=null
            }){Text("Удалить")}},
            dismissButton={TextButton(onClick={confirm=null}){Text("Отмена")}})
    }
}
