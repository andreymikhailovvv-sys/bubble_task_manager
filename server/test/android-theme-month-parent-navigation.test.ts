import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path:string)=>readFile(new URL(path,import.meta.url),'utf8');
const native = '../../android-app/app/src/main/java/ru/planirovych/app/';

test('Android follows device theme by default with explicit manual overrides',async()=>{
  const [prefs,vm,main,home]=await Promise.all([
    read(native+'ui/theme/ThemePreferences.kt'),
    read(native+'feature/home/HomeViewModel.kt'),
    read(native+'MainActivity.kt'),
    read(native+'feature/home/HomeScreen.kt')
  ]);
  assert.ok(prefs.includes('enum class ThemeMode { SYSTEM, LIGHT, DARK }'));
  assert.ok(prefs.includes('else -> ThemeMode.SYSTEM'));
  assert.ok(prefs.includes('it[modeKey] = value.name'));
  assert.ok(vm.includes('val themeMode = themes.mode.stateIn'));
  assert.ok(main.includes('isSystemInDarkTheme()'));
  assert.ok(main.includes('ThemeMode.SYSTEM -> deviceDark'));
  assert.ok(main.includes('ThemeMode.DARK -> true'));
  assert.ok(main.includes('ThemeMode.LIGHT -> false'));
  assert.ok(home.includes('Text("Как на телефоне")'));
  assert.ok(home.includes('mode==ThemeMode.SYSTEM'));
  assert.ok(home.includes('vm::setThemeMode'));
});

test('Android dark main tabs use light status bar icons and light tabs use dark icons',async()=>{
  const main=await read(native+'MainActivity.kt');
  assert.ok(main.includes('enableEdgeToEdge()'));
  assert.ok(main.includes('SideEffect {'));
  assert.ok(main.includes('WindowCompat.getInsetsController(window,window.decorView)'));
  assert.ok(main.includes('bars.isAppearanceLightStatusBars=!dark'));
  assert.ok(main.includes('bars.isAppearanceLightNavigationBars=!dark'));
});

test('month calendar cell has the only click target and does not open task previews',async()=>{
  const timeline=await read(native+'feature/home/NativeTimeline.kt');
  const start=timeline.indexOf('private fun CalendarDayCell(');
  const entryStart=timeline.indexOf('private fun MiniAppCalendarEntry(',start);
  const entryEnd=timeline.indexOf('private fun mixCalendarColor(',entryStart);
  assert.ok(start>0 && entryStart>start && entryEnd>entryStart);
  const cell=timeline.slice(start,entryStart);
  const chip=timeline.slice(entryStart,entryEnd);
  assert.ok(cell.includes('.clickable(onClick=onDay)'));
  assert.ok(cell.includes('MiniAppCalendarEntry(entry,true,dark,colors)'));
  assert.ok(!cell.includes('entry.taskId?.let(onTask)'));
  assert.ok(!cell.includes('.height(23.dp).clickable'));
  assert.ok(!chip.includes('.clickable('));
  assert.ok(timeline.includes('openDay={anchorRaw=it.toString();zoom=TimelineZoom.DAY}'));
});

test('subtask parent chip saves edits then opens its actual parent from all entrypoints',async()=>{
  const [child,home]=await Promise.all([
    read(native+'feature/home/MiniAppSubtaskEditorSheet.kt'),
    read(native+'feature/home/HomeScreen.kt')
  ]);
  assert.ok(child.includes('onOpenParent:()->Unit'));
  assert.ok(child.includes('saveThen(onOpenParent)'));
  assert.ok(child.includes('enabled=!busy && !saving'));
  assert.ok(home.includes('onOpenParent = {'));
  assert.ok(home.includes('openedTaskId = parent.id'));
  assert.ok(home.includes('onOpenParent={'));
  assert.ok(home.includes('openedTaskId=overlayParent.id'));
  assert.ok(home.includes('overlaySubtaskId=null'));
});

test('new native Android release uses the next immutable update version',async()=>{
  const gradle=await read('../../android-app/app/build.gradle.kts');
  assert.ok(gradle.includes('versionCode = 5'));
  assert.ok(gradle.includes('versionName = "1.0.3"'));
  assert.ok(gradle.includes('applicationId = "ru.planirovych.app"'));
});
