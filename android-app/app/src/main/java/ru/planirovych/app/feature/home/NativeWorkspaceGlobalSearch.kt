package ru.planirovych.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.text.Html
import ru.planirovych.app.data.model.*

/** A compact, grouped native counterpart of MiniApp's WorkspaceGlobalSearch.
 * Always searches the full workspace, not merely the currently filtered list.
 */
private data class SearchHit(
    val id:String, val title:String, val preview:String,
    val kind:String, val parent:String="", val relevance:Int=0
)
private fun searchFold(value:String)=value.lowercase(java.util.Locale.ROOT)
    .replace('ё','е').trim().replace(Regex("\\s+")," ")

private fun searchText(html:String):String = runCatching {
    Html.fromHtml(html,Html.FROM_HTML_MODE_COMPACT).toString()
        .replace(Regex("\\s+")," ").trim()
}.getOrDefault(html.replace(Regex("<[^>]+>")," ").trim())

private fun variants(term:String):List<String> {
    val en="qwertyuiop[]asdfghjkl;'zxcvbnm,."
    val ru="йцукенгшщзхъфывапролджэячсмитьбю"
    val source=if(term.any{it in 'a'..'z'} && term.none{it in 'а'..'я'}) en else ru
    val target=if(source==en) ru else en
    val changed=term.map{char->val index=source.indexOf(char)
        if(index>=0)target[index] else char}.joinToString("")
    return if(changed==term)listOf(term) else listOf(term,changed)
}
private fun searchScore(title:String,body:String,parent:String,query:String):Int {
    val t=searchFold(title);val b=searchFold(body);val p=searchFold(parent)
    val words=searchFold(query).split(' ').filter{it.isNotBlank()}.take(10)
    if(words.isEmpty()) return 0
    var relevance=0
    for(word in words) {
        val candidates=variants(word)
        val titleMatch=candidates.any{t.contains(it)}
        val bodyMatch=candidates.any{b.contains(it)}
        val parentMatch=candidates.any{p.contains(it)}
        // Allow common Russian case endings, but never reduce short terms.
        val stem=if(word.length>=6)word.dropLast(2) else word
        val fuzzy=word.length>=6 && (
            t.contains(stem)||b.contains(stem)||p.contains(stem))
        if(!titleMatch && !bodyMatch && !parentMatch && !fuzzy) return 0
        relevance+=when {
            titleMatch -> 35
            bodyMatch -> 12
            parentMatch -> 5
            else -> 1
        }
    }
    if(variants(searchFold(query)).any{it==t}) relevance+=200
    else if(variants(searchFold(query)).any{t.contains(it)}) relevance+=110
    return relevance
}

@Composable
internal fun NativeWorkspaceGlobalSearch(
    query:String, tasks:List<Task>, notes:List<StandaloneNote>,
    notesLoading:Boolean, dark:Boolean, onOpenTask:(String)->Unit,
    onOpenNote:(String)->Unit, onDismiss:()->Unit,
    modifier:Modifier=Modifier
) {
    val bg=if(dark)Color(0xFF17243A) else Color.White
    val ink=if(dark)Color(0xFFF1F5F9) else Color(0xFF172238)
    val muted=if(dark)Color(0xFFA5B4CA) else Color(0xFF627087)
    val line=if(dark)Color(0xFF374861) else Color(0xFFDDE4EF)
    val accent=if(dark)Color(0xFF67E8F9) else Color(0xFF0987A2)
    val focus=LocalFocusManager.current
    val keyboard=LocalSoftwareKeyboardController.current
    val result=remember(tasks,notes,query) {
        val parents=tasks.associateBy{it.id}
        val matchingTasks=tasks.mapNotNull{task->
            val parentName=task.parentTaskId?.let{parents[it]?.title}.orEmpty()
            val body=searchText(task.description.orEmpty())
            val score=searchScore(task.title,body,parentName,query)
            if(score==0)null else SearchHit(task.id,task.title,body.take(185),
                if(task.parentTaskId!=null)"subtask" else "task",parentName,score) to
                (task.status==TaskStatus.DONE)
        }
        val sort: (List<SearchHit>)->List<SearchHit> = { list ->
            list.sortedWith(compareByDescending<SearchHit>{it.relevance}
                .thenBy{it.title}).take(5)
        }
        val active=matchingTasks.filter{!it.second}.map{it.first}
        val completed=matchingTasks.filter{it.second}.map{it.first}
        val noteHits=notes.mapNotNull{note->
            val body=searchText(note.content)
            val score=searchScore(note.title,body,"",query)
            if(score==0)null else SearchHit(note.id,note.title.ifBlank{"Без названия"},
                body.take(185),"note",relevance=score)
        }
        listOf(
            "Задачи" to sort(active.filter{it.kind=="task"}),
            "Подзадачи" to sort(active.filter{it.kind=="subtask"}),
            "Заметки" to sort(noteHits),
            "Завершённые задачи и подзадачи" to sort(completed)
        )
    }
    val count=result.sumOf{it.second.size}
    val select:(SearchHit)->Unit={hit->
        keyboard?.hide()
        focus.clearFocus(force=true)
        onDismiss()
        if(hit.kind=="note")onOpenNote(hit.id) else onOpenTask(hit.id)
    }
    Surface(
        modifier=modifier.fillMaxWidth(),
        shape=RoundedCornerShape(22.dp),
        color=bg,
        border=androidx.compose.foundation.BorderStroke(1.dp,line),
        shadowElevation=12.dp
    ) {
        Column {
            Row(Modifier.fillMaxWidth().padding(horizontal=15.dp,vertical=13.dp),
                horizontalArrangement=Arrangement.SpaceBetween,
                verticalAlignment=Alignment.CenterVertically) {
                Text("НАЙДЕНО В ПЛАНИРОВЫЧЕ",color=muted,fontSize=10.sp,
                    fontWeight=FontWeight.Bold,letterSpacing=.8.sp)
                Text("$count показано",color=muted,fontSize=11.sp)
            }
            HorizontalDivider(color=line)
            LazyColumn(Modifier.fillMaxWidth().heightIn(max=370.dp)
                .padding(horizontal=8.dp,vertical=7.dp),
                verticalArrangement=Arrangement.spacedBy(3.dp)) {
                result.forEach{(label,hits)->
                    if(hits.isNotEmpty()) {
                        item(key="section-$label") {
                            Row(Modifier.fillMaxWidth().padding(start=10.dp,top=8.dp,bottom=5.dp),
                                verticalAlignment=Alignment.CenterVertically,
                                horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                Icon(when(label) {
                                    "Заметки"->Icons.Default.StickyNote2
                                    "Подзадачи"->Icons.Default.Description
                                    else->Icons.Default.Checklist
                                },null,tint=accent,modifier=Modifier.size(17.dp))
                                Text(label.uppercase(),color=ink,fontSize=11.sp,
                                    fontWeight=FontWeight.Bold,letterSpacing=.9.sp)
                            }
                        }
                        items(hits,key={label+it.id}){hit->
                            Column(Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(13.dp))
                                .clickable{select(hit)}
                                .padding(horizontal=12.dp,vertical=11.dp),
                                verticalArrangement=Arrangement.spacedBy(4.dp)) {
                                Text(hit.title,color=ink,fontSize=14.sp,
                                    fontWeight=FontWeight.SemiBold,maxLines=2,
                                    overflow=TextOverflow.Ellipsis)
                                if(hit.parent.isNotBlank()) {
                                    Text("В задаче: "+hit.parent,color=muted,
                                        fontSize=11.sp,maxLines=1,
                                        overflow=TextOverflow.Ellipsis)
                                }
                                if(hit.preview.isNotBlank())
                                    Text(hit.preview,color=muted,fontSize=12.sp,
                                        maxLines=2,overflow=TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                if(count==0) item("empty") {
                    Text(if(notesLoading)"Ищу также в заметках…"
                        else "Совпадений пока нет",
                        modifier=Modifier.fillMaxWidth().padding(22.dp),
                        color=muted,fontSize=13.sp)
                }
            }
            HorizontalDivider(color=line)
            Row(Modifier.fillMaxWidth().padding(vertical=9.dp),
                horizontalArrangement=Arrangement.Center) {
                Surface(shape=RoundedCornerShape(22.dp),
                    color=if(dark)Color(0xFF2A3850) else Color(0xFFE9EDF6),
                    border=androidx.compose.foundation.BorderStroke(1.dp,line)) {
                    Row(Modifier.clickable(onClick=onDismiss)
                        .padding(horizontal=16.dp,vertical=8.dp),
                        verticalAlignment=Alignment.CenterVertically,
                        horizontalArrangement=Arrangement.spacedBy(7.dp)) {
                        Icon(Icons.Default.KeyboardArrowUp,null,
                            tint=ink,modifier=Modifier.size(19.dp))
                        Text("Свернуть",color=ink,fontSize=13.sp,
                            fontWeight=FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
