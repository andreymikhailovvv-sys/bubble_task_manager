package ru.planirovych.app.feature.home

import android.text.Html
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.planirovych.app.data.model.StandaloneNote
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * The notes entry point stays within Android and uses the same /api/notes
 * records as the Mini App. Unedited HTML is kept byte-for-byte on save;
 * text edits are explicitly converted to escaped, safe HTML.
 */
@Composable
internal fun NativeNotesPage(vm: HomeViewModel, colors: WorkspaceColors, modifier: Modifier = Modifier) {
    val state by vm.state.collectAsStateWithLifecycle()
    var selected by remember { mutableStateOf<StandaloneNote?>(null) }
    var composing by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var originalText by remember { mutableStateOf("") }
    var deleteConfirm by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.loadNotes() }
    Column(modifier.fillMaxSize().padding(horizontal=16.dp, vertical=14.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,
                verticalAlignment=Alignment.CenterVertically) {
                Text(if(composing) "Заметка" else "Заметки",
                    style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=colors.text)
                if(composing) TextButton(onClick={composing=false;selected=null}){Text("Назад")}
                else TextButton(onClick={
                    title="";body="";originalText="";selected=null;composing=true
                }) { Icon(Icons.Default.Add,null);Text("Новая") }
            }
            Spacer(Modifier.height(8.dp))
            state.notesError?.let {
                Text(it,color=MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(8.dp))
            }
            if (composing) {
                OutlinedTextField(value=title,onValueChange={title=it},modifier=Modifier.fillMaxWidth(),
                    label={Text("Название")},singleLine=true,
                    colors=OutlinedTextFieldDefaults.colors(
                        focusedTextColor=colors.text,unfocusedTextColor=colors.text,
                        focusedBorderColor=colors.purple,unfocusedBorderColor=colors.panelBorder))
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(value=body,onValueChange={body=it},
                    modifier=Modifier.fillMaxWidth().weight(1f),
                    label={Text("Текст заметки")},minLines=8,
                    colors=OutlinedTextFieldDefaults.colors(
                        focusedTextColor=colors.text,unfocusedTextColor=colors.text,
                        focusedBorderColor=colors.purple,unfocusedBorderColor=colors.panelBorder))
                Spacer(Modifier.height(7.dp))
                if (selected != null && body != originalText) Text(
                    "При изменении текста сложное форматирование заменится обычным.",
                    color=colors.secondaryText,style=MaterialTheme.typography.labelSmall)
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    if (selected != null) {
                        OutlinedButton(onClick={deleteConfirm=true},enabled=!state.notesBusy) {
                            Icon(Icons.Default.Delete,null); Spacer(Modifier.width(4.dp));Text("Удалить")
                        }
                    }
                    Button(onClick={
                        val content=if (selected != null && body == originalText) selected!!.content
                            else encodeNoteBody(body)
                        if (selected == null) vm.createNote(title.trim(),content) {
                            composing=false;selected=null
                        } else vm.saveNote(selected!!.id,title.trim(),content) {
                            composing=false;selected=null
                        }
                    },modifier=Modifier.weight(1f),enabled=!state.notesBusy) {
                        if (state.notesBusy) CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp)
                        else Text("Сохранить")
                    }
                }
                Spacer(Modifier.height(14.dp))
            } else {
                if (state.notesLoading) Box(Modifier.fillMaxWidth().weight(1f),
                    contentAlignment=Alignment.Center) { CircularProgressIndicator() }
                else if (state.notes.isEmpty()) {
                    Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center) {
                        Text("Заметок пока нет",color=colors.secondaryText)
                    }
                } else LazyColumn(Modifier.fillMaxWidth().weight(1f),
                    contentPadding=PaddingValues(bottom=20.dp),
                    verticalArrangement=Arrangement.spacedBy(9.dp)) {
                    items(state.notes.sortedByDescending{it.updatedAt ?: it.createdAt ?: ""},key={it.id}) { note ->
                        Surface(shape=RoundedCornerShape(15.dp),color=colors.card,
                            border=BorderStroke(1.dp,colors.panelBorder)) {
                            Column(Modifier.fillMaxWidth().clickable {
                                selected=note;title=note.title
                                originalText=decodeNoteBody(note.content)
                                body=originalText
                                composing=true
                            }.padding(13.dp)) {
                                Text(note.title.ifBlank{"Без названия"},fontWeight=FontWeight.SemiBold,
                                    color=colors.text,maxLines=1,overflow=TextOverflow.Ellipsis)
                                Spacer(Modifier.height(4.dp))
                                Text(decodeNoteBody(note.content),color=colors.secondaryText,
                                    style=MaterialTheme.typography.bodySmall,maxLines=3,
                                    overflow=TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
    }
    if (deleteConfirm && selected != null) AlertDialog(
        onDismissRequest={deleteConfirm=false},
        title={Text("Удалить заметку?")},
        text={Text("Заметка будет удалена и в Mini App.")},
        confirmButton={TextButton(onClick={
            vm.deleteNote(selected!!.id){composing=false;selected=null}
            deleteConfirm=false
        }){Text("Удалить",color=MaterialTheme.colorScheme.error)}},
        dismissButton={TextButton(onClick={deleteConfirm=false}){Text("Отмена")}}
    )
}
private fun decodeNoteBody(html:String):String =
    Html.fromHtml(html,Html.FROM_HTML_MODE_COMPACT).toString().trim()
private fun encodeNoteBody(text:String):String =
    Html.escapeHtml(text).replace("\n","<br>")
