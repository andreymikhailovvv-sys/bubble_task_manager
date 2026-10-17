package ru.planirovych.app.feature.home

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import ru.planirovych.app.data.model.Sphere
import ru.planirovych.app.data.model.Task
import ru.planirovych.app.data.model.TaskStatus
import ru.planirovych.app.data.model.TaskType

private val violet = Color(0xFF8B5CF6)
private val success = Color(0xFF16A34A)

/**
 * A single native editor for both tasks and subtasks, modelled on MiniApp's
 * focus-task panel. When task is null, parent denotes a new subtask.
 * The parent sheet is restored by the host rather than stacking two modal sheets.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskEditorSheet(
    task: Task?,
    parent: Task?,
    tasks: List<Task>,
    spheres: List<Sphere>,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onOpenSubtask: (String) -> Unit,
    onNewSubtask: () -> Unit,
    onSave: (String, JsonObject, () -> Unit) -> Unit,
    onCreateSubtask: (String, String, String, String?, () -> Unit) -> Unit,
    onChangeStatus: (String, TaskStatus, () -> Unit) -> Unit,
    onDelete: (String, () -> Unit) -> Unit,
    onClearError: () -> Unit,
) {
    val isNew = task == null
    val isSubtask = parent != null
    val editorKey = task?.id ?: "new-subtask-" + parent?.id
    var title by remember(editorKey) { mutableStateOf(task?.title.orEmpty()) }
    var description by remember(editorKey) { mutableStateOf(task?.description.orEmpty()) }
    var location by remember(editorKey) { mutableStateOf(task?.location.orEmpty()) }
    var dueDate by remember(editorKey) { mutableStateOf(task?.dueDate) }
    var sphereId by remember(editorKey) { mutableStateOf(task?.sphereId) }
    var importance by remember(editorKey) { mutableIntStateOf((task?.importance ?: 3).coerceIn(1, 5)) }
    var showClosed by remember(editorKey) { mutableStateOf(false) }
    var sectorMenu by remember(editorKey) { mutableStateOf(false) }
    var pendingAction by remember(editorKey) { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    fun selectDueDate() {
        val initial = parseLocalDateTime(dueDate) ?: LocalDateTime.now()
        DatePickerDialog(
            context,
            { _, year, month, day ->
                TimePickerDialog(
                    context,
                    { _, hour, minute ->
                        dueDate = LocalDateTime.of(year, month + 1, day, hour, minute)
                            .atZone(ZoneId.systemDefault())
                            .toOffsetDateTime()
                            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                    },
                    initial.hour,
                    initial.minute,
                    true,
                ).show()
            },
            initial.year, initial.monthValue - 1, initial.dayOfMonth,
        ).show()
    }

    val commit: (() -> Unit) -> Unit = { after ->
        if (!busy && title.isNotBlank()) {
            if (isNew) {
                val parentId = parent?.id
                if (parentId != null) {
                    onCreateSubtask(parentId, title.trim(), description.trim(), dueDate, after)
                }
            } else if (task != null) {
                val changes = buildJsonObject {
                    if (title.trim() != task.title) put("title", title.trim())
                    if (description.trim() != task.description.orEmpty()) {
                        if (description.isBlank()) put("description", JsonNull)
                        else put("description", description.trim())
                    }
                    if (dueDate != task.dueDate) {
                        if (dueDate == null) put("dueDate", JsonNull)
                        else put("dueDate", dueDate)
                    }
                    if (!isSubtask) {
                        if (location.trim() != task.location.orEmpty() && task.taskType == TaskType.EVENT) {
                            if (location.isBlank()) put("location", JsonNull)
                            else put("location", location.trim())
                        }
                        if (sphereId != task.sphereId) {
                            if (sphereId == null) put("sphereId", JsonNull)
                            else put("sphereId", sphereId)
                        }
                        if (importance != task.importance) put("importance", importance)
                    }
                }
                if (changes.isEmpty()) after() else onSave(task.id, changes, after)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (isNew) onBack() else commit(onBack) },
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).imePadding()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (isSubtask) {
                    IconButton(onClick = { if (isNew) onBack() else commit(onBack) }, enabled = !busy) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "К основной задаче")
                    }
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        when {
                            isNew -> "Новая подзадача"
                            isSubtask -> "Подзадача"
                            task?.taskType == TaskType.EVENT -> "Редактирование события"
                            else -> "Фокус задачи"
                        },
                        color = violet,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    if (parent != null) {
                        Text(
                            "Основная задача: " + parent.title,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                IconButton(onClick = { if (isNew) onBack() else commit(onBack) }, enabled = !busy) {
                    Icon(Icons.Default.Close, contentDescription = "Сохранить и закрыть")
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it; onClearError() },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (isSubtask) "Название подзадачи" else "Название") },
                    textStyle = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    minLines = 1,
                    maxLines = 3,
                    enabled = !busy,
                    shape = RoundedCornerShape(16.dp),
                )
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(onClick = ::selectDueDate, enabled = !busy, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.CalendarToday, null, Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            dueDate?.let(::readableDate) ?: "Указать срок",
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (dueDate != null) {
                        IconButton(onClick = { dueDate = null }, enabled = !busy) {
                            Icon(Icons.Default.RemoveCircleOutline, contentDescription = "Убрать срок")
                        }
                    }
                }
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it; onClearError() },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 126.dp),
                    label = { Text("Описание / заметки") },
                    minLines = 4,
                    maxLines = 10,
                    enabled = !busy,
                    shape = RoundedCornerShape(16.dp),
                )

                if (!isSubtask) {
                    if (task?.taskType == TaskType.EVENT) {
                        OutlinedTextField(
                            value = location, onValueChange = { location = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Место события") },
                            enabled = !busy,
                        )
                    }
                    Text("Сектор", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
                    Box {
                        OutlinedButton(onClick = { sectorMenu = true }, enabled = !busy) {
                            Text(spheres.find { it.id == sphereId }?.name ?: "Без сектора")
                            Spacer(Modifier.width(8.dp))
                            Icon(Icons.Default.ExpandMore, null, Modifier.size(18.dp))
                        }
                        DropdownMenu(expanded = sectorMenu, onDismissRequest = { sectorMenu = false }) {
                            DropdownMenuItem(text = { Text("Без сектора") }, onClick = {
                                sphereId = null; sectorMenu = false
                            })
                            spheres.forEach { sphere ->
                                DropdownMenuItem(text = { Text(sphere.name) }, onClick = {
                                    sphereId = sphere.id; sectorMenu = false
                                })
                            }
                        }
                    }
                    Text(
                        "Важность: " + importance + "/5",
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Slider(
                        value = importance.toFloat(),
                        onValueChange = { importance = it.toInt().coerceIn(1, 5) },
                        valueRange = 1f..5f,
                        steps = 3,
                        enabled = !busy,
                    )
                    if (task?.isRecurring == true) {
                        Text(
                            "Повторение: " + (task.recurrenceSummary ?: "включено") +
                                ". Настройка повторов будет добавлена в отдельном этапе.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                if (task != null && !isSubtask && task.taskType != TaskType.EVENT) {
                    val subtasks = tasks.filter { it.parentTaskId == task.id }
                        .sortedWith(compareBy<Task> { if (it.status == TaskStatus.DONE) 1 else 0 }
                            .thenBy { sortDate(it.dueDate) })
                    val visible = if (showClosed) subtasks else subtasks.filter { it.status != TaskStatus.DONE }
                    HorizontalDivider()
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Подзадачи", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                        IconButton(onClick = { commit(onNewSubtask) }, enabled = !busy) {
                            Icon(Icons.Default.Add, contentDescription = "Добавить подзадачу", tint = violet)
                        }
                        IconButton(onClick = { showClosed = !showClosed }) {
                            Icon(
                                if (showClosed) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                contentDescription = if (showClosed) "Скрыть выполненные" else "Показать выполненные",
                            )
                        }
                    }
                    if (visible.isEmpty()) {
                        Text(
                            if (showClosed) "Подзадач пока нет" else "Активных подзадач пока нет",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    visible.forEach { child ->
                        val done = child.status == TaskStatus.DONE
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = done,
                                    onCheckedChange = {
                                        if (it) showClosed = true
                                        onChangeStatus(
                                            child.id,
                                            if (it) TaskStatus.DONE else TaskStatus.TODO,
                                        ) {}
                                    },
                                    enabled = !busy,
                                )
                                Column(
                                    Modifier.weight(1f)
                                        .clickable(enabled = !busy) { commit { onOpenSubtask(child.id) } }
                                        .padding(vertical = 8.dp),
                                ) {
                                    Text(
                                        child.title,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        color = if (done) MaterialTheme.colorScheme.onSurfaceVariant
                                            else MaterialTheme.colorScheme.onSurface,
                                    )
                                    child.dueDate?.let {
                                        Text(
                                            readableDate(it),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = violet,
                                        )
                                    }
                                }
                                IconButton(
                                    onClick = { commit { onOpenSubtask(child.id) } },
                                    enabled = !busy,
                                ) { Icon(Icons.Default.ExpandMore, contentDescription = "Открыть подзадачу") }
                            }
                        }
                    }
                }
                if (error != null) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (busy) {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                Button(
                    onClick = { commit(onBack) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy && title.isNotBlank(),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Icon(if (isNew) Icons.Default.Add else Icons.Default.Check, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (isNew) "Создать подзадачу" else "Сохранить и закрыть")
                }
                if (task != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Button(
                            onClick = {
                                if (task.status == TaskStatus.DONE) {
                                    onChangeStatus(task.id, TaskStatus.TODO, onBack)
                                } else {
                                    pendingAction = "complete"
                                }
                            },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            colors = ButtonDefaults.buttonColors(containerColor = success),
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Icon(Icons.Default.CheckCircle, null, Modifier.size(17.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(if (task.status == TaskStatus.DONE) "Вернуть" else "Выполнить")
                        }
                        OutlinedButton(
                            onClick = { pendingAction = "delete" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            shape = RoundedCornerShape(14.dp),
                        ) {
                            Icon(Icons.Default.DeleteOutline, null, Modifier.size(17.dp), tint = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(5.dp))
                            Text("Удалить", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    if (pendingAction != null && task != null) {
        val deleting = pendingAction == "delete"
        AlertDialog(
            onDismissRequest = { pendingAction = null },
            title = { Text(if (deleting) "Удалить?" else "Завершить?") },
            text = {
                Text(
                    (if (deleting) "Удалить «" else "Завершить «") + task.title + "»?" +
                        if (task.isCollaborative) " Для совместной задачи действие применяется только к вашему аккаунту."
                        else ""
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pendingAction = null
                    if (deleting) onDelete(task.id, onBack)
                    else onChangeStatus(task.id, TaskStatus.DONE, onBack)
                }, enabled = !busy) {
                    Text(if (deleting) "Удалить" else "Выполнить")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingAction = null }) { Text("Отмена") }
            },
        )
    }
}

private fun parseLocalDateTime(value: String?): LocalDateTime? {
    if (value.isNullOrBlank()) return null
    return runCatching { OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime() }
        .recoverCatching { Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDateTime() }
        .recoverCatching { LocalDateTime.parse(value) }
        .getOrNull()
}

private fun readableDate(value: String): String {
    val date = parseLocalDateTime(value) ?: return value.take(16)
    return date.format(DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale("ru")))
}

private fun sortDate(value: String?): Long =
    parseLocalDateTime(value)?.atZone(ZoneId.systemDefault())?.toInstant()?.toEpochMilli()
        ?: Long.MAX_VALUE
