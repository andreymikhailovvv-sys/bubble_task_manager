import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('AI send icon is a closed stroked contour rather than crossing lines', async () => {
  const icon=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/AiChatVoiceInput.kt');
  const start=icon.indexOf('internal fun MiniAppAiSendIcon(');
  const end=icon.indexOf('internal fun appendAiDictation(',start);
  const send=icon.slice(start,end);
  assert.match(send, /val contour=androidx\.compose\.ui\.graphics\.Path\(\)/);
  assert.match(send, /drawPath\(contour,tint,style=/);
  assert.match(send, /drawLine\(tint,middle,tip/);
});

test('both AI conversations keep their composer and conversation above keyboard', async () => {
  const [general,task]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(general, /Box\(Modifier\.fillMaxSize\(\)\.imePadding\(\)\.background/);
  assert.match(general, /MiniAppAiSendIcon\(Color\.White\)/);
  assert.match(task, /Surface\(Modifier\.fillMaxSize\(\)\.imePadding\(\)/);
  assert.match(task, /composerHeightPx\.toDp\(\)\+28\.dp/);
  assert.match(task, /Color\(0xFFF2F7FF\)/);
  assert.match(task, /shadow\(elevation=3\.dp,shape=CircleShape/);
  assert.match(task, /MiniAppAiSendIcon\(Color\.White\)/);
});

test('search focus is released before opening the task sheet', async () => {
  const home=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  assert.match(home, /focusManager\.clearFocus\(force=true\)/);
  assert.match(home, /softwareKeyboard\?\.hide\(\)/);
  assert.match(home, /snapshotFlow\{WindowInsets\.ime\.getBottom\(density\)\}\.first\{it==0\}/);
  assert.match(home, /pendingFocusTaskId=taskId/);
});

test('subtask editor keeps create button fixed outside scrollable fields', async () => {
  const child=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppSubtaskEditorSheet.kt');
  const scroll=child.indexOf('Column(Modifier.weight(1f,fill=false)');
  const footer=child.indexOf('// Sticky actions remain reachable',scroll);
  const end=child.indexOf('if(descriptionExpanded)',footer);
  assert.ok(scroll>0 && footer>scroll && end>footer);
  assert.match(child.slice(scroll,footer), /verticalScroll\(rememberScrollState\(\)\)/);
  assert.doesNotMatch(child.slice(scroll,footer), /ChildAction\("Создать подзадачу"/);
  assert.match(child.slice(footer,end), /ChildAction\("Создать подзадачу"/);
  assert.match(child, /BoxWithConstraints\(Modifier\.fillMaxSize\(\)\.imePadding\(\)/);
});

test('focus AI button is keyboard-sticky and sheet header has less wasted space', async () => {
  const focus=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppTaskFocusSheet.kt');
  assert.match(focus, /imeVisible=WindowInsets\.ime\.getBottom\(resizeDensity\)>0/);
  assert.match(focus, /if\(imeVisible && task\.taskType!=TaskType\.EVENT\)/);
  assert.match(focus, /start=18\.dp,end=18\.dp,top=4\.dp,bottom=12\.dp/);
});
