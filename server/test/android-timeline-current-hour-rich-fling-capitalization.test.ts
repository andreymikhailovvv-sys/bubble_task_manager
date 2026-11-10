import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');
const root='../../android-app/app/src/main/java/ru/planirovych/app/feature/home/';

test('Day timeline centers a measured current-time marker through its parent list',async()=>{
  const [timeline,workspace]=await Promise.all([
    read(root+'NativeTimeline.kt'),read(root+'ModernWorkspace.kt')
  ]);
  assert.ok(timeline.includes('hostScroll:LazyListState,active:Boolean'));
  assert.ok(timeline.includes('onNowHourPosition='));
  assert.ok(timeline.includes('LocalTime.now().hour'));
  assert.ok(timeline.includes('LocalTime.now().format('));
  assert.ok(timeline.includes('val hours=(byHour.keys+listOfNotNull(currentHour))'));
  assert.ok(timeline.includes('onGloballyPositioned'));
  assert.ok(timeline.includes('it.positionInWindow().y'));
  assert.ok(timeline.includes('hostScroll.scrollBy(y-centerPx)'));
  assert.ok(timeline.includes('centeredKey!=scrollKey'));
  assert.ok(timeline.includes('hostScroll.scrollToItem(0)'));
  assert.ok(workspace.includes('hostScroll=workspaceScroll,active=pagerState.currentPage==1'));
});

test('Week timeline automatically selects today on tab reentry and respects other weeks',async()=>{
  const timeline=await read(root+'NativeTimeline.kt');
  assert.ok(timeline.includes('active=active,entryEpoch=entryEpoch'));
  assert.ok(timeline.includes('LaunchedEffect(days.firstOrNull()?.first,entryEpoch,active)'));
  assert.ok(timeline.includes('val todayIndex=days.indexOfFirst{it.first==LocalDate.now()}'));
  assert.ok(timeline.includes('weekScroll.scrollToItem(todayIndex.coerceAtLeast(0))'));
  assert.ok(timeline.includes('weekScroll.animateScrollToItem(index)'));
});

test('native rich text uses velocity-driven fling instead of gesture-only scrolling',async()=>{
  const editor=await read(root+'NativeRichTextEditor.kt');
  assert.ok(editor.includes('private val flingScroller=OverScroller(context)'));
  assert.ok(editor.includes('VelocityTracker.obtain()'));
  assert.ok(editor.includes('computeCurrentVelocity(1000,maxFlingVelocity.toFloat())'));
  assert.ok(editor.includes('flingScroller.fling('));
  assert.ok(editor.includes('override fun computeScroll()'));
  assert.ok(editor.includes('postInvalidateOnAnimation()'));
  assert.ok(editor.includes('selectionStart==selectionEnd'));
  assert.ok(editor.includes('parent?.requestDisallowInterceptTouchEvent('));
  assert.ok(editor.includes('InputType.TYPE_TEXT_FLAG_CAP_SENTENCES'));
});

test('note editor follows MiniApp full-height layout, not small nested text field',async()=>{
  const notes=await read(root+'NativeNotesSheet.kt');
  const start=notes.indexOf('private fun NoteEditorDialog(');
  const end=notes.indexOf('private fun NoteGroupManager(',start);
  const editor=notes.slice(start,end);
  assert.ok(start>0 && end>start);
  assert.ok(editor.includes('Modifier.fillMaxSize().imePadding()'));
  assert.ok(editor.includes('Редактирование заметки'));
  assert.ok(editor.includes('Выделите текст для форматирования'));
  assert.ok(editor.includes('modifier=Modifier.fillMaxWidth().weight(1f)'));
  assert.ok(editor.includes('keyboardOptions=KeyboardOptions('));
  assert.ok(editor.includes('groupsOpen=true'));
  assert.ok(editor.includes('onSave(title.trim(),text,group)'));
  assert.ok(!editor.includes('Modifier.fillMaxWidth().fillMaxHeight(.87f)'));
  assert.ok(!editor.includes('Surface(Modifier.fillMaxWidth().weight(1f)'));
});

test('capitalize sentences for prose fields without changing email or search inputs',async()=>{
  const names=[
    'NativeAiComposerInput.kt','NativeQuickCreateSheets.kt',
    'NativeDetailedTaskCreateSheet.kt','MiniAppTaskFocusSheet.kt',
    'MiniAppSubtaskEditorSheet.kt','NativeGeneralAiChat.kt',
    'NativeHabitDetailSheet.kt','NativeTaskRecurrenceEditor.kt',
    'NativeMailSendCard.kt','TaskEditorSheet.kt','NativeNotesSheet.kt'
  ];
  for(const name of names){
    const source=await read(root+name);
    assert.ok(source.includes('KeyboardCapitalization.Sentences'),name);
  }
  const mail=await read(root+'NativeMailSendCard.kt');
  const recipient=mail.slice(mail.indexOf('OutlinedTextField(value=recipient'),
    mail.indexOf('ActionCaption("Тема",c)'));
  assert.ok(!recipient.includes('KeyboardCapitalization.Sentences'),
    'email addresses must not be autocapitalized');
});

test('signed Android 1.0.7 APK has next versionCode',async()=>{
  const gradle=await read('../../android-app/app/build.gradle.kts');
  assert.ok(gradle.includes('versionCode = 9'));
  assert.ok(gradle.includes('versionName = "1.0.7"'));
  assert.ok(gradle.includes('applicationId = "ru.planirovych.app"'));
});
