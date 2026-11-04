package ru.planirovych.app.feature.home

import android.text.Html
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
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
    dark:Boolean,modifier:Modifier=Modifier,onClose:()->Unit={}){
    val state by vm.state.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    val notesScroll=rememberLazyListState()
    var searchVisible by remember { mutableStateOf(true) }
    var filterOpen by remember { mutableStateOf(false) }
    var excludedGroups by remember { mutableStateOf<Set<String>>(emptySet()) }
    var includeUngrouped by remember { mutableStateOf(true) }
    val allSelected=excludedGroups.isEmpty() && includeUngrouped
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
    val filtered=remember(state.notes,excludedGroups,includeUngrouped,normalized){
        state.notes.asSequence()
            .filter { note -> if(note.groupId==null)includeUngrouped
                else note.groupId !in excludedGroups }
            .filter {note->
                normalized.isBlank() ||
                (note.title+" "+noteText(note.content)).lowercase()
                    .replace('ё','е').contains(normalized)
            }
            .sortedByDescending{it.updatedAt?:it.createdAt?:""}
            .toList()
    }
    LaunchedEffect(notesScroll) {
        var previousIndex=notesScroll.firstVisibleItemIndex
        var previousOffset=notesScroll.firstVisibleItemScrollOffset
        var movement=0
        snapshotFlow { Triple(notesScroll.firstVisibleItemIndex,
            notesScroll.firstVisibleItemScrollOffset,notesScroll.isScrollInProgress) }
            .collect { (index,offset,scrolling)->
                if(scrolling){
                    val delta=if(index==previousIndex)offset-previousOffset
                        else (index-previousIndex).coerceIn(-3,3)*40
                    if(delta!=0){
                        if((delta>0&&movement<0)||(delta<0&&movement>0))movement=0
                        movement=(movement+delta).coerceIn(-90,90)
                        if(movement>20){searchVisible=false;movement=0}
                        if(movement< -20){searchVisible=true;movement=0}
                    }
                }else movement=0
                if(index==0&&offset==0)searchVisible=true
                previousIndex=index
                previousOffset=offset
            }
    }
    LaunchedEffect(excludedGroups,includeUngrouped,normalized){
        searchVisible=true
        notesScroll.scrollToItem(0)
    }
    val notesBg=if(dark)Color(0xFF101A2C) else Color(0xFFF5F6FF)
    val notesCard=if(dark)Color(0xFF1D2D46) else Color.White
    val notesInk=if(dark)Color(0xFFF0F4FF) else Color(0xFF17223A)
    val notesMuted=if(dark)Color(0xFFAAB9D2) else Color(0xFF65738E)
    val notesBorder=if(dark)Color(0xFF40516E) else Color(0xFFDBE0F6)
    val notesField=if(dark)Color(0xFF1C2B45) else Color.White
    Column(modifier.fillMaxSize().background(notesBg)) {
        Column(Modifier.fillMaxWidth()
            .padding(start=15.dp,end=15.dp,top=14.dp,bottom=11.dp),
            verticalArrangement=Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.SpaceBetween){
                Column(verticalArrangement=Arrangement.spacedBy(5.dp)){
                    Text("ЛИЧНЫЕ ЗАПИСИ",fontSize=11.sp,
                        letterSpacing=1.35.sp,fontWeight=FontWeight.Bold,
                        color=if(dark)Color(0xFFCAB7F8) else Color(0xFF7544B6))
                    Row(verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        Text("Мои заметки",fontSize=23.sp,
                            fontWeight=FontWeight.ExtraBold,color=notesInk,maxLines=1)
                        Text(if(allSelected)"("+filtered.size+")"
                            else "("+filtered.size+" из "+state.notes.size+")",
                            fontSize=13.sp,color=notesMuted,maxLines=1)
                    }
                }
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                    .background(if(dark)Color(0xFF253650) else Color(0xFFEEF0F8))
                    .border(1.dp,if(dark)Color(0xFF3C4F6C)
                        else Color(0xFFD9E0ED),RoundedCornerShape(12.dp))
                    .clickable(onClick=onClose),contentAlignment=Alignment.Center){
                    Icon(Icons.Default.Close,"Закрыть заметки",tint=notesInk,
                        modifier=Modifier.size(21.dp))
                }
            }
            AnimatedVisibility(visible=searchVisible,
                enter=expandVertically()+fadeIn(),exit=shrinkVertically()+fadeOut()){
                Column(Modifier.fillMaxWidth(),
                    verticalArrangement=Arrangement.spacedBy(11.dp)){
                    Row(Modifier.fillMaxWidth(),
                        horizontalArrangement=Arrangement.spacedBy(9.dp)){
                        Box(Modifier.weight(1.35f).height(49.dp)
                            .clip(RoundedCornerShape(15.dp))
                            .background(Brush.horizontalGradient(listOf(
                                Color(0xFF933CF0),Color(0xFF5048E5))))
                            .clickable {editing=null;editorOpen=true},
                            contentAlignment=Alignment.Center){
                            Row(verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.spacedBy(7.dp)){
                                Icon(Icons.Default.Add,null,tint=Color.White,
                                    modifier=Modifier.size(22.dp))
                                Text("Новая заметка",fontSize=14.sp,
                                    fontWeight=FontWeight.Bold,color=Color.White,
                                    maxLines=1,softWrap=false)
                            }
                        }
                        Box(Modifier.weight(1f)){
                            Row(Modifier.fillMaxWidth().height(49.dp)
                                .clip(RoundedCornerShape(15.dp))
                                .background(if(dark)Color(0xFF283B56)
                                    else Color(0xFFEEE9FF))
                                .border(1.dp,notesBorder,RoundedCornerShape(15.dp))
                                .clickable{filterOpen=true},
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.Center){
                                Icon(Icons.Default.Tune,null,
                                    tint=if(dark)Color(0xFFD9C1FF)
                                        else Color(0xFF6840B1),
                                    modifier=Modifier.size(19.dp))
                                Spacer(Modifier.width(7.dp))
                                Text("Фильтры",fontSize=14.sp,
                                    fontWeight=FontWeight.SemiBold,
                                    color=if(dark)Color(0xFFE1D0FF)
                                        else Color(0xFF6840B1),maxLines=1)
                            }
                            val filterShape=RoundedCornerShape(19.dp)
                            // Style the popup's own Surface, not just its inner content.
                            // The old rectangular Material menu showed through round corners.
                            DropdownMenu(expanded=filterOpen,
                                onDismissRequest={filterOpen=false},
                                modifier=Modifier.widthIn(min=250.dp,max=330.dp)
                                    .heightIn(max=590.dp),
                                shape=filterShape,
                                containerColor=notesCard,
                                tonalElevation=0.dp,
                                shadowElevation=6.dp,
                                border=BorderStroke(1.dp,notesBorder)){
                                Text("Какие заметки показывать",
                                    Modifier.padding(horizontal=15.dp,vertical=9.dp),
                                    color=notesMuted,fontSize=12.sp,
                                    fontWeight=FontWeight.SemiBold)
                                DropdownMenuItem(
                                    text={Text("Показать все группы",color=notesInk)},
                                    leadingIcon={Checkbox(checked=allSelected,
                                        onCheckedChange=null,
                                        modifier=Modifier.size(22.dp))},
                                    onClick={excludedGroups=emptySet();includeUngrouped=true})
                                HorizontalDivider(color=notesBorder)
                                DropdownMenuItem(
                                    text={Text("Без группы",color=notesInk)},
                                    leadingIcon={Checkbox(checked=includeUngrouped,
                                        onCheckedChange=null,
                                        modifier=Modifier.size(22.dp))},
                                    onClick={includeUngrouped=!includeUngrouped})
                                groups.forEach{g->
                                    DropdownMenuItem(
                                        text={Row(verticalAlignment=Alignment.CenterVertically){
                                            Box(Modifier.size(9.dp)
                                                .background(noteColor(g.color),CircleShape))
                                            Spacer(Modifier.width(8.dp))
                                            Text(g.name,color=notesInk,maxLines=1,
                                                overflow=TextOverflow.Ellipsis)
                                        }},
                                        leadingIcon={Checkbox(
                                            checked=g.id !in excludedGroups,
                                            onCheckedChange=null,
                                            modifier=Modifier.size(22.dp))},
                                        onClick={excludedGroups=if(g.id in excludedGroups)
                                            excludedGroups-g.id else excludedGroups+g.id})
                                }
                                HorizontalDivider(color=notesBorder)
                                DropdownMenuItem(
                                    text={Text("Добавить группу",color=notesInk)},
                                    leadingIcon={Icon(Icons.Default.Add,null,
                                        tint=colors.purple)},
                                    enabled=groups.size<40,
                                    onClick={filterOpen=false;groupManagerOpen=true;newGroup=true})
                                DropdownMenuItem(
                                    text={Text("Настройки групп",color=notesInk)},
                                    leadingIcon={Icon(Icons.Default.Settings,null,
                                        tint=colors.purple)},
                                    onClick={filterOpen=false;groupManagerOpen=true;newGroup=false})
                            }
                        }
                    }
                    BasicTextField(value=query,onValueChange={query=it},
                        modifier=Modifier.fillMaxWidth().height(49.dp)
                            .clip(RoundedCornerShape(15.dp))
                            .background(notesField)
                            .border(1.dp,if(dark)Color(0xFF40536F)
                                else Color(0xFFD9DEF2),RoundedCornerShape(15.dp)),
                        singleLine=true,textStyle=TextStyle(fontSize=16.sp,color=notesInk),
                        cursorBrush=SolidColor(colors.purple),
                        decorationBox={inner->
                            Row(Modifier.fillMaxSize()
                                .padding(start=14.dp,end=8.dp),
                                verticalAlignment=Alignment.CenterVertically){
                                Icon(Icons.Default.Search,null,tint=notesMuted,
                                    modifier=Modifier.size(20.dp))
                                Spacer(Modifier.width(10.dp))
                                Box(Modifier.weight(1f),
                                    contentAlignment=Alignment.CenterStart){
                                    if(query.isEmpty())Text("Поиск по заметкам…",
                                        fontSize=16.sp,color=notesMuted,maxLines=1)
                                    inner()
                                }
                                if(query.isNotEmpty())IconButton(onClick={query=""},
                                    modifier=Modifier.size(30.dp)){
                                    Icon(Icons.Default.Close,"Очистить поиск",
                                        tint=notesMuted,modifier=Modifier.size(16.dp))
                                }
                            }
                        })
                }
            }
        }
        state.notesError?.let{Text(it,Modifier.padding(horizontal=15.dp),
            color=MaterialTheme.colorScheme.error,fontSize=12.sp)}
        if(state.notesLoading && state.notes.isEmpty()){
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){
                CircularProgressIndicator(color=colors.purple)
            }
        }else if(filtered.isEmpty()){
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){
                Text(if(query.isNotBlank())"По запросу ничего не найдено"
                    else if(state.notes.isNotEmpty())"В выбранных группах нет заметок"
                    else "Пока нет заметок. Создайте первую.",
                    color=notesMuted,fontSize=13.sp)
            }
        }else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal=14.dp),
                state=notesScroll,contentPadding=PaddingValues(top=18.dp,bottom=21.dp),
                verticalArrangement=Arrangement.spacedBy(13.dp)){
                items(filtered,key={it.id}) {note->
                    val group=groupMap[note.groupId]
                    val cardShape=RoundedCornerShape(19.dp)
                    Surface(modifier=Modifier.fillMaxWidth()
                        .shadow(if(dark)3.dp else 4.dp,cardShape),
                        shape=cardShape,color=notesCard,
                        border=BorderStroke(1.dp,notesBorder),shadowElevation=0.dp){
                        Column {
                            Column(Modifier.fillMaxWidth().clickable{
                                editing=note;editorOpen=true
                            }.padding(start=16.dp,end=16.dp,top=15.dp,bottom=12.dp),
                                verticalArrangement=Arrangement.spacedBy(9.dp)){
                                if(group!=null){
                                    val tint=noteColor(group.color)
                                    Row(Modifier.clip(CircleShape)
                                        .background(tint.copy(alpha=if(dark).27f else .17f))
                                        .padding(horizontal=10.dp,vertical=5.dp),
                                        verticalAlignment=Alignment.CenterVertically,
                                        horizontalArrangement=Arrangement.spacedBy(7.dp)){
                                        Box(Modifier.size(8.dp).background(tint,CircleShape))
                                        Text(group.name,color=notesInk,
                                            fontSize=11.sp,fontWeight=FontWeight.Bold,
                                            maxLines=1)
                                    }
                                }
                                Text(note.title.ifBlank{"Без названия"},
                                    color=notesInk,fontWeight=FontWeight.Bold,
                                    fontSize=16.sp,lineHeight=21.sp,maxLines=2,
                                    overflow=TextOverflow.Ellipsis)
                                Text(noteText(note.content).ifBlank{"Пустая заметка"},
                                    color=notesMuted,fontSize=14.sp,lineHeight=21.sp,
                                    maxLines=2,overflow=TextOverflow.Ellipsis)
                            }
                            HorizontalDivider(Modifier.padding(horizontal=16.dp),
                                thickness=.7.dp,color=notesBorder)
                            Row(Modifier.fillMaxWidth()
                                .padding(start=16.dp,end=15.dp,top=8.dp,bottom=9.dp),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.SpaceBetween){
                                Row(Modifier.weight(1f),
                                    verticalAlignment=Alignment.CenterVertically,
                                    horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                    Icon(Icons.Default.CalendarToday,null,tint=notesMuted,
                                        modifier=Modifier.size(15.dp))
                                    Text(notesDisplayDate(note.updatedAt?:note.createdAt),
                                        color=notesMuted,fontSize=12.sp,maxLines=1,
                                        overflow=TextOverflow.Ellipsis)
                                }
                                Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){
                                    var groupPicker by remember(note.id) {
                                        mutableStateOf(false)
                                    }
                                    Box{
                                        Box(Modifier.size(37.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(if(dark)Color(0xFF3B315E)
                                                else Color(0xFFEFE9FF))
                                            .clickable{groupPicker=true},
                                            contentAlignment=Alignment.Center){
                                            Icon(Icons.Default.Label,
                                                "Переместить в группу",
                                                tint=if(dark)Color(0xFFC8A8FF)
                                                    else Color(0xFF7041D7),
                                                modifier=Modifier.size(18.dp))
                                        }
                                        DropdownMenu(expanded=groupPicker,
                                            onDismissRequest={groupPicker=false},
                                            modifier=Modifier.background(notesCard)){
                                            DropdownMenuItem(text={Text("Без группы",color=notesInk)},
                                                onClick={
                                                    groupPicker=false
                                                    vm.assignNoteGroup(note.id,null)
                                                })
                                            groups.forEach{g->
                                                DropdownMenuItem(text={Text(g.name,color=notesInk)},
                                                    onClick={
                                                        groupPicker=false
                                                        vm.assignNoteGroup(note.id,g.id)
                                                    })
                                            }
                                        }
                                    }
                                    Box(Modifier.size(37.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(if(dark)Color(0xFF482C42)
                                            else Color(0xFFFFEDF3))
                                        .clickable{deleting=note},
                                        contentAlignment=Alignment.Center){
                                        Icon(Icons.Default.DeleteOutline,
                                            "Удалить заметку",
                                            tint=if(dark)Color(0xFFFF9EC1)
                                                else Color(0xFFDD2263),
                                            modifier=Modifier.size(18.dp))
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
        note=editing,groups=groups,colors=colors,dark=dark,busy=state.notesBusy,
        error=state.notesError,
        initialGroup=null,
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
private fun notesDisplayDate(raw:String?):String{
    if(raw.isNullOrBlank())return ""
    return runCatching{
        java.time.OffsetDateTime.parse(raw)
            .atZoneSameInstant(java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern(
                "d MMM yyyy 'г.'",java.util.Locale("ru")))
    }.getOrElse{raw.take(10)}
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
    colors:WorkspaceColors,dark:Boolean,busy:Boolean,error:String?,
    initialGroup:String?,onClose:()->Unit,onSave:(String,String,String?)->Unit) {
    var title by remember(note?.id){ mutableStateOf(note?.title.orEmpty()) }
    val original=remember(note?.id){note?.content.orEmpty()}
    var text by remember(note?.id){mutableStateOf(original)}
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
                Surface(Modifier.fillMaxWidth().weight(1f),
                    shape=RoundedCornerShape(13.dp),color=colors.card,
                    border=BorderStroke(1.dp,colors.panelBorder)){
                    NativeRichTextEditor(value=text,onChange={text=it},
                        dark=dark,modifier=Modifier.fillMaxSize(),
                        editorKey=note?.id?:"new-note")
                }
                error?.let{Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)}
                Button(onClick={
                    onSave(title.trim(),text,group)
                },modifier=Modifier.fillMaxWidth(),enabled=!busy,
                    shape=RoundedCornerShape(13.dp)){
                    Text(if(busy)"Сохраняем…" else "Сохранить")
                }
            }
        }
    }
}
@Composable
private fun NoteGroupManager(vm:HomeViewModel,colors:WorkspaceColors,
    groups:List<StandaloneNoteGroup>,startNew:Boolean,onClose:()->Unit){
    val state by vm.state.collectAsStateWithLifecycle()
    val dark=colors.text.red>.75f
    val surface=if(dark)Color(0xFF17243A) else Color(0xFFF8F9FF)
    val card=if(dark)Color(0xFF20314C) else Color.White
    val edge=if(dark)Color(0xFF40516E) else Color(0xFFDCE2F1)
    val ink=if(dark)Color(0xFFF0F4FF) else Color(0xFF17223A)
    val muted=if(dark)Color(0xFFAAB9D2) else Color(0xFF65738E)
    var selected by remember { mutableStateOf<StandaloneNoteGroup?>(null) }
    var form by remember { mutableStateOf(startNew) }
    var name by remember { mutableStateOf("") }
    var color by remember { mutableStateOf("#8b5cf6") }
    var confirm by remember { mutableStateOf<StandaloneNoteGroup?>(null) }
    val swatches=listOf("#8b5cf6","#0891b2","#d97706","#db2777",
        "#059669","#4f46e5","#e11d48","#64748b")
    val shape=RoundedCornerShape(24.dp)
    androidx.compose.ui.window.Dialog(onDismissRequest=onClose,
        properties=androidx.compose.ui.window.DialogProperties(
            usePlatformDefaultWidth=false)){
        Surface(Modifier.fillMaxWidth(.94f)
            .heightIn(max=(androidx.compose.ui.platform.LocalConfiguration
                .current.screenHeightDp*.84f).dp),
            shape=shape,color=surface,border=BorderStroke(1.dp,edge),
            shadowElevation=14.dp){
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(17.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                Row(Modifier.fillMaxWidth(),
                    verticalAlignment=Alignment.Top,
                    horizontalArrangement=Arrangement.spacedBy(10.dp)){
                    Column(Modifier.weight(1f),
                        verticalArrangement=Arrangement.spacedBy(5.dp)){
                        Text("Группы заметок",fontSize=19.sp,
                            fontWeight=FontWeight.Bold,color=ink)
                        Text("Секторные группы связаны с секторами. Остальные " +
                            "можно переименовывать и удалять, не теряя заметок.",
                            fontSize=11.sp,lineHeight=16.sp,color=muted)
                    }
                    Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
                        .background(card).border(1.dp,edge,RoundedCornerShape(10.dp))
                        .clickable(onClick=onClose),contentAlignment=Alignment.Center){
                        Icon(Icons.Default.Close,"Закрыть",tint=ink,
                            modifier=Modifier.size(18.dp))
                    }
                }
                HorizontalDivider(color=edge)
                groups.forEach{g->
                    Row(Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(13.dp))
                        .background(card)
                        .border(1.dp,edge,RoundedCornerShape(13.dp))
                        .padding(start=12.dp,end=7.dp,top=8.dp,bottom=8.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(9.dp)){
                        Box(Modifier.size(13.dp).background(noteColor(g.color),CircleShape))
                        Text(g.name,Modifier.weight(1f),color=ink,
                            fontWeight=FontWeight.SemiBold,fontSize=13.sp,
                            maxLines=1,overflow=TextOverflow.Ellipsis)
                        if(g.sphereId!=null){
                            Text("Сектор",color=muted,fontSize=10.sp)
                        }else{
                            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
                                .background(if(dark)Color(0xFF3B315E)
                                    else Color(0xFFEFE9FF))
                                .clickable{
                                    selected=g;name=g.name;color=g.color;form=true
                                },contentAlignment=Alignment.Center){
                                Icon(Icons.Default.Edit,"Изменить группу",
                                    tint=if(dark)Color(0xFFC8A8FF) else Color(0xFF7041D7),
                                    modifier=Modifier.size(17.dp))
                            }
                            Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
                                .background(if(dark)Color(0xFF482C42)
                                    else Color(0xFFFFEDF3))
                                .clickable{confirm=g},contentAlignment=Alignment.Center){
                                Icon(Icons.Default.DeleteOutline,"Удалить группу",
                                    tint=if(dark)Color(0xFFFF9EC1) else Color(0xFFDD2263),
                                    modifier=Modifier.size(17.dp))
                            }
                        }
                    }
                }
                if(groups.isEmpty()){
                    Text("Групп пока нет.",color=muted,fontSize=12.sp)
                }
                if(!form){
                    Row(Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(13.dp))
                        .background(card)
                        .border(1.dp,edge,RoundedCornerShape(13.dp))
                        .clickable(enabled=groups.size<40){
                            selected=null;name="";color="#8b5cf6";form=true
                        }
                        .padding(vertical=13.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.Center,
                        ){
                        Icon(Icons.Default.Add,null,tint=colors.purple,
                            modifier=Modifier.size(19.dp))
                        Spacer(Modifier.width(7.dp))
                        Text("Новая группа",color=ink,fontWeight=FontWeight.SemiBold,
                            fontSize=13.sp)
                    }
                }else{
                    Column(Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(17.dp)).background(card)
                        .border(1.dp,edge,RoundedCornerShape(17.dp))
                        .padding(14.dp),
                        verticalArrangement=Arrangement.spacedBy(11.dp)){
                        Text(if(selected!=null)"Изменить группу" else "Новая группа",
                            fontSize=15.sp,color=ink,fontWeight=FontWeight.Bold)
                        OutlinedTextField(value=name,onValueChange={name=it.take(50)},
                            label={Text("Название")},singleLine=true,
                            modifier=Modifier.fillMaxWidth(),
                            colors=OutlinedTextFieldDefaults.colors(
                                focusedTextColor=ink,unfocusedTextColor=ink,
                                focusedBorderColor=colors.purple))
                        Text("Цвет группы",color=muted,fontSize=12.sp,
                            fontWeight=FontWeight.SemiBold)
                        Row(Modifier.fillMaxWidth(),
                            horizontalArrangement=Arrangement.spacedBy(5.dp)){
                            swatches.forEach{swatch->
                                Box(Modifier.weight(1f).aspectRatio(1f)
                                    .clip(CircleShape).background(noteColor(swatch))
                                    .border(if(color==swatch)3.dp else 1.dp,
                                        if(color==swatch)ink else edge,CircleShape)
                                    .clickable{color=swatch})
                            }
                        }
                        Row(Modifier.fillMaxWidth(),
                            horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            OutlinedButton(onClick={form=false},
                                modifier=Modifier.weight(1f),
                                shape=RoundedCornerShape(12.dp)){
                                Text("Отмена",maxLines=1)
                            }
                            Button(onClick={
                                vm.saveNoteGroup(selected?.id,name,color){
                                    form=false;selected=null
                                }
                            },enabled=name.isNotBlank()&&!state.notesBusy,
                                modifier=Modifier.weight(1.3f),
                                shape=RoundedCornerShape(12.dp),
                                colors=ButtonDefaults.buttonColors(
                                    containerColor=Color(0xFF7C3AED))){
                                Text(if(state.notesBusy)"Сохраняю…" else "Сохранить",
                                    maxLines=1,softWrap=false)
                            }
                        }
                    }
                }
                state.notesError?.let{
                    Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp)
                }
            }
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
