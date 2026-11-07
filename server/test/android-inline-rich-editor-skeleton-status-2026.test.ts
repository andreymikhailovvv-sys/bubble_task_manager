import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('Quick AI composer no longer reserves navigation bar space when keyboard is visible',async()=>{
  const home=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  assert.match(home,/val keyboardOpen=imeInsets\.getBottom\(density\)>0/);
  assert.match(home,/!state\.loading && state\.error == null && !keyboardOpen/);
  const general=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt');
  assert.match(general,/Box\(Modifier\.fillMaxSize\(\)\.background\(/);
  assert.doesNotMatch(general,/Box\(Modifier\.fillMaxSize\(\)\.imePadding\(\)\.background/);
});

test('subtask dialog wraps its content, resizes for IME and preserves Create footer',async()=>{
  const s=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppSubtaskEditorSheet.kt');
  assert.match(s,/BoxWithConstraints\(Modifier\.fillMaxSize\(\)/);
  assert.match(s,/heightIn\(max=visibleMaxHeight\)/);
  assert.doesNotMatch(s,/height\(minOf\(visibleMaxHeight,520\.dp\)\)/);
  assert.match(s,/Column\(Modifier\.weight\(1f,fill=false\)/);
  assert.match(s,/SOFT_INPUT_ADJUST_RESIZE/);
  assert.match(s,/titleFocus\.requestFocus\(\)/);
  assert.match(s,/keyboard\?\.show\(\)/);
  const footer=s.indexOf('// Sticky actions remain reachable');
  assert.ok(footer>0);
  assert.match(s.slice(footer),/ChildAction\("Создать подзадачу"/);
});

test('compact rich descriptions are directly editable in task, subtask and new-task cards',async()=>{
  const sources=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppTaskFocusSheet.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/MiniAppSubtaskEditorSheet.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeDetailedTaskCreateSheet.kt')
  ]);
  for(const s of sources)assert.match(s,/NativeRichTextEditor\([\s\S]*?inline=true/);
  const rich=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeRichTextEditor.kt');
  assert.match(rich,/inline:Boolean=false/);
  assert.match(rich,/if\(!inline\)/);
  assert.match(rich,/if\(!view\.hydrated\)view\.hydrate\(value\)/);
  assert.match(rich,/override fun onTouchEvent\(event:MotionEvent\)/);
});

test('rich toolbar fits a row and has a dedicated list-mode popover',async()=>{
  const s=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeRichTextEditor.kt');
  assert.match(s,/Triple\("☷","list","Список"\)/);
  assert.match(s,/DropdownMenu\(expanded=listPickerOpen/);
  assert.match(s,/state\.value\?\.format\("bullets"\)/);
  assert.match(s,/state\.value\?\.format\("numbers"\)/);
  assert.doesNotMatch(s,/Row\(Modifier\.fillMaxWidth\(\)\.horizontalScroll/);
});

test('shared AI thinking status uses animated cyan segments and both chats reserve space',async()=>{
  const [task,general]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt')
  ]);
  assert.match(task,/rememberInfiniteTransition\(label="ai-status-shimmer"\)/);
  assert.match(task,/repeat\(3\)\{index->/);
  assert.match(task,/composerHeightPx\.toDp\(\)\+48\.dp/);
  assert.match(general,/composerHeightPx\.toDp\(\)\+48\.dp/);
  assert.match(general,/NativeTaskAiProgressChip/);
});

test('launch loading uses shimmering future-card placeholders instead of a spinner',async()=>{
  const [home,loading]=await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeLoadingSkeleton.kt')
  ]);
  assert.match(home,/state\.loading -> NativeLoadingSkeleton\(/);
  assert.match(loading,/rememberInfiniteTransition\(label="workspace-loading"\)/);
  assert.match(loading,/repeat\(3\)/);
});

test('new task focuses the title after the sheet has expanded',async()=>{
  const source=await read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeDetailedTaskCreateSheet.kt');
  assert.match(source,/createSheetState\.currentValue==SheetValue\.Expanded/);
  assert.match(source,/titleFocus\.requestFocus\(\)/);
  assert.match(source,/keyboard\?\.show\(\)/);
  assert.match(source,/\.focusRequester\(titleFocus\)/);
});
