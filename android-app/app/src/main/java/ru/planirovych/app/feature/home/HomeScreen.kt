package ru.planirovych.app.feature.home

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import ru.planirovych.app.data.model.*

private enum class AuthMode { LOGIN, REGISTER }

@Composable
fun HomeScreen(vm: HomeViewModel, dark: Boolean) {
    val state by vm.state.collectAsStateWithLifecycle()
    var settings by remember { mutableStateOf(false) }
    var authMode by remember { mutableStateOf<AuthMode?>(null) }
    Scaffold(contentWindowInsets=WindowInsets.safeDrawing, containerColor=MaterialTheme.colorScheme.background) { padding ->
        when {
            state.loading -> Loading(Modifier.padding(padding))
            state.error != null -> ErrorState(state.error!!, vm::refresh, Modifier.padding(padding))
            else -> Workspace(state, vm::search, { settings=true }, Modifier.padding(padding))
        }
    }
    if(settings) SettingsSheet(state.user, dark, { vm.setDark(it) }, { settings=false }, { authMode=it; settings=false }, { vm.logout { settings=false } })
    authMode?.let { mode -> AuthDialog(mode, state.authBusy, state.authError, { authMode=null; vm.clearAuthError() }, vm::login, vm::register) }
}

@Composable private fun Loading(modifier: Modifier) = Box(modifier.fillMaxSize(), contentAlignment=Alignment.Center) { Column(horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(14.dp)) { CircularProgressIndicator(); Text("Загружаем Планировыч…", fontWeight=FontWeight.SemiBold) } }
@Composable private fun ErrorState(message:String, retry:()->Unit, modifier:Modifier) = Box(modifier.fillMaxSize().padding(24.dp), contentAlignment=Alignment.Center) { Card(colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.errorContainer), shape=RoundedCornerShape(24.dp)) { Column(Modifier.padding(24.dp), horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(14.dp)) { Icon(Icons.Default.CloudOff,null); Text(message); Button(retry) { Icon(Icons.Default.Refresh,null); Spacer(Modifier.width(8.dp)); Text("Повторить") } } } }

@Composable private fun Workspace(state:HomeState, search:(String)->Unit, settings:()->Unit, modifier:Modifier) {
    val spheres=remember(state.spheres){state.spheres.associateBy{it.id}}
    val query=state.query.trim().lowercase(Locale.getDefault())
    val tasks=state.tasks.filter { it.parentTaskId==null && (query.isEmpty() || it.title.lowercase().contains(query) || it.description.orEmpty().lowercase().contains(query)) }
    LazyColumn(modifier.fillMaxSize(), contentPadding=PaddingValues(14.dp), verticalArrangement=Arrangement.spacedBy(14.dp)) {
        item { Header(state, search, settings) }
        item { HabitsCard(state.habits) }
        item { Text("Задачи", style=MaterialTheme.typography.titleLarge, fontWeight=FontWeight.Bold) }
        if(tasks.isEmpty()) item { EmptyCard(if(query.isNotEmpty()) "По вашему запросу ничего не найдено" else "Задач пока нет") }
        else items(tasks,key={it.id}) { task -> TaskCard(task, spheres[task.sphereId], state.tasks.count{it.parentTaskId==task.id}) }
        item { Spacer(Modifier.height(6.dp)) }
    }
}

@Composable private fun Header(state:HomeState, search:(String)->Unit, settings:()->Unit) {
    Surface(shape=RoundedCornerShape(20.dp), tonalElevation=4.dp, shadowElevation=4.dp, border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline.copy(.65f))) {
        Column(Modifier.padding(10.dp), verticalArrangement=Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(state.query, search, Modifier.weight(1f), placeholder={Text("Поиск по задачам")}, leadingIcon={Icon(Icons.Default.Search,null)}, singleLine=true, shape=RoundedCornerShape(14.dp))
                IconButton(settings, Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) { Icon(Icons.Default.Settings,"Настройки", tint=Color(0xFFF59E0B)) }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                Metric(Icons.Default.AutoAwesome, "ИИ-кредиты", "${state.user?.aiCredits ?: 0}", Color(0xFF22B8CF), Modifier.weight(1f))
                Metric(Icons.Default.Star, "Эффективность", "${state.user?.efficiencyScore?.toInt() ?: 0}/100", Color(0xFF8B5CF6), Modifier.weight(1f))
            }
        }
    }
}
@Composable private fun Metric(icon:androidx.compose.ui.graphics.vector.ImageVector,label:String,value:String,color:Color,modifier:Modifier){ Surface(modifier,shape=RoundedCornerShape(13.dp),color=color.copy(.12f),border=BorderStroke(1.dp,color.copy(.3f))){Row(Modifier.padding(10.dp),verticalAlignment=Alignment.CenterVertically){Icon(icon,null,tint=color);Spacer(Modifier.width(7.dp));Column{Text(label,style=MaterialTheme.typography.labelSmall);Text(value,fontWeight=FontWeight.Bold)}}}}

@Composable private fun HabitsCard(habits:List<Habit>) {
    val today=LocalDate.now().toString(); val complete=habits.count { h -> h.stats.filter{it.dateKey==today}.sumOf{it.amount} >= h.targetCount }
    Surface(shape=RoundedCornerShape(22.dp), tonalElevation=2.dp, border=BorderStroke(1.dp,MaterialTheme.colorScheme.outline.copy(.6f))) { Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically){Text("Привычки",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold);Surface(shape=CircleShape,color=MaterialTheme.colorScheme.secondary.copy(.12f)){Text("Выполнено $complete из ${habits.size}",Modifier.padding(horizontal=10.dp,vertical=5.dp),style=MaterialTheme.typography.labelSmall)}}
        if(habits.isEmpty()) Text("Привычек пока нет",color=MaterialTheme.colorScheme.onSurfaceVariant)
        else LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){items(habits,key={it.id}){ HabitBubble(it,today) }}
    }}
}
@Composable private fun HabitBubble(habit:Habit,today:String){val amount=habit.stats.filter{it.dateKey==today}.sumOf{it.amount};val done=amount>=habit.targetCount;val color=parseColor(habit.color,MaterialTheme.colorScheme.primary);Column(Modifier.width(72.dp),horizontalAlignment=Alignment.CenterHorizontally){Surface(shape=CircleShape,color=color.copy(if(done).26f else .13f),border=BorderStroke(2.dp,if(done)Color(0xFF22C55E) else color),shadowElevation=2.dp){Box(Modifier.size(60.dp),contentAlignment=Alignment.Center){Column(horizontalAlignment=Alignment.CenterHorizontally){Text(habit.icon,style=MaterialTheme.typography.titleLarge);Text("${amount.coerceAtMost(habit.targetCount)}/${habit.targetCount}",style=MaterialTheme.typography.labelSmall,fontWeight=FontWeight.Bold)}}};Text(habit.name,Modifier.padding(top=5.dp),style=MaterialTheme.typography.labelSmall,maxLines=1,overflow=TextOverflow.Ellipsis)}}

@Composable private fun TaskCard(task:Task,sphere:Sphere?,children:Int){val importance=when(task.importance){in 8..Int.MAX_VALUE->Color(0xFFEF4444);in 5..7->Color(0xFFF59E0B);else->Color(0xFF22C55E)};Surface(shape=RoundedCornerShape(20.dp),shadowElevation=3.dp,border=BorderStroke(1.dp,importance.copy(.32f))){Row(Modifier.fillMaxWidth()){Box(Modifier.width(5.dp).heightIn(min=118.dp).background(importance));Column(Modifier.padding(14.dp).weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)){Row(verticalAlignment=Alignment.Top){Text(task.title,Modifier.weight(1f),style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold);Surface(shape=CircleShape,color=importance.copy(.13f)){Text("${task.importance}",Modifier.padding(horizontal=9.dp,vertical=4.dp),color=importance,fontWeight=FontWeight.Bold)}};task.description?.takeIf{it.isNotBlank()}?.let{Text(it,maxLines=2,overflow=TextOverflow.Ellipsis,color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodySmall)};Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){Chip(if(task.taskType==TaskType.EVENT)"Событие" else "Задача",if(task.taskType==TaskType.EVENT)Color(0xFF06B6D4) else Color(0xFF8B5CF6));Chip(statusText(task.status),MaterialTheme.colorScheme.primary);sphere?.let{Chip("${it.icon.orEmpty()} ${it.name}".trim(),parseColor(it.color,MaterialTheme.colorScheme.secondary))}};Row(verticalAlignment=Alignment.CenterVertically){Icon(Icons.Default.Schedule,null,Modifier.size(15.dp),tint=MaterialTheme.colorScheme.onSurfaceVariant);Spacer(Modifier.width(5.dp));Text(formatDate(task.dueDate),style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant);if(children>0){Spacer(Modifier.width(14.dp));Icon(Icons.Default.AccountTree,null,Modifier.size(15.dp));Text(" $children",style=MaterialTheme.typography.labelMedium)}}}}}}
@Composable private fun Chip(text:String,color:Color){Surface(shape=CircleShape,color=color.copy(.12f)){Text(text,Modifier.padding(horizontal=8.dp,vertical=4.dp),style=MaterialTheme.typography.labelSmall,color=color,fontWeight=FontWeight.SemiBold)}}
@Composable private fun EmptyCard(text:String){Surface(Modifier.fillMaxWidth(),shape=RoundedCornerShape(20.dp),color=MaterialTheme.colorScheme.surfaceVariant){Column(Modifier.padding(28.dp).fillMaxWidth(),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Default.CheckCircle,null,tint=MaterialTheme.colorScheme.primary);Spacer(Modifier.height(8.dp));Text(text)}}}

@OptIn(ExperimentalMaterial3Api::class) @Composable private fun SettingsSheet(user:CurrentUser?,dark:Boolean,setDark:(Boolean)->Unit,close:()->Unit,auth:(AuthMode)->Unit,logout:()->Unit){ModalBottomSheet(onDismissRequest=close,windowInsets=WindowInsets.safeDrawing){Column(Modifier.padding(20.dp).navigationBarsPadding(),verticalArrangement=Arrangement.spacedBy(16.dp)){Text("Настройки",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold);Text(user?.displayName ?: "Профиль");Text(if(user?.hasAccount==true)"Аккаунт Планировыча" else "Локальный профиль устройства",color=MaterialTheme.colorScheme.onSurfaceVariant);Row(verticalAlignment=Alignment.CenterVertically){Icon(if(dark)Icons.Default.DarkMode else Icons.Default.LightMode,null);Text("Тёмная тема",Modifier.padding(start=10.dp).weight(1f));Switch(dark,{setDark(it)})};if(user?.hasAccount==true)OutlinedButton(logout,Modifier.fillMaxWidth()){Text("Выйти")}else Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){Button({auth(AuthMode.LOGIN)},Modifier.weight(1f)){Text("Войти")};OutlinedButton({auth(AuthMode.REGISTER)},Modifier.weight(1f)){Text("Регистрация")}};Spacer(Modifier.height(8.dp))}}}

@Composable private fun AuthDialog(mode:AuthMode,busy:Boolean,error:String?,close:()->Unit,login:(String,String,()->Unit)->Unit,register:(String,String,String,Boolean,()->Unit)->Unit){var username by remember{mutableStateOf("")};var password by remember{mutableStateOf("")};var name by remember{mutableStateOf("")};var consent by remember{mutableStateOf(false)};val context=LocalContext.current;AlertDialog(onDismissRequest={if(!busy)close()},title={Text(if(mode==AuthMode.LOGIN)"Вход в аккаунт" else "Регистрация")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){OutlinedTextField(username,{username=it},label={Text("Логин")},singleLine=true);if(mode==AuthMode.REGISTER)OutlinedTextField(name,{name=it},label={Text("Имя")},singleLine=true);OutlinedTextField(password,{password=it},label={Text("Пароль")},singleLine=true);if(mode==AuthMode.REGISTER){Row(verticalAlignment=Alignment.Top){Checkbox(consent,{consent=it});Text("Я согласен на обработку персональных данных",Modifier.padding(top=12.dp))};TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/consent")))}){Text("Прочитать согласие")};Row{TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/terms")))}){Text("Условия")};TextButton({context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://planirovych.ru/legal/privacy")))}){Text("Конфиденциальность")}}};error?.let{Text(it,color=MaterialTheme.colorScheme.error)}}},confirmButton={Button(onClick={if(mode==AuthMode.LOGIN){{login(username,password,close)}}else{{register(username,password,name,consent,close)}}},enabled=!busy&&username.isNotBlank()&&password.isNotBlank()&&(mode==AuthMode.LOGIN||consent)){if(busy)CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp)else Text(if(mode==AuthMode.LOGIN)"Войти" else "Зарегистрироваться")}},dismissButton={TextButton(close,enabled=!busy){Text("Отмена")}})}
private fun parseColor(value:String,fallback:Color)=runCatching{Color(android.graphics.Color.parseColor(value))}.getOrDefault(fallback)
private fun statusText(status:TaskStatus)=when(status){TaskStatus.TODO->"К выполнению";TaskStatus.IN_PROGRESS->"В работе";TaskStatus.DONE->"Готово"}
private fun formatDate(value:String?):String{if(value.isNullOrBlank())return "Без срока";return try{OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("d MMM, HH:mm",Locale("ru")))}catch(_:DateTimeParseException){value.take(10)}}
