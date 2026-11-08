import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');
const base='../../android-app/app/src/main/java/ru/planirovych/app/feature/home/';

test('Android global search mirrors MiniApp sections, including notes and completed results',async()=>{
  const [search,workspace,notes,web]=await Promise.all([
    read(base+'NativeWorkspaceGlobalSearch.kt'),
    read(base+'ModernWorkspace.kt'),
    read(base+'NativeNotesSheet.kt'),
    read('../../client/src/components/WorkspaceGlobalSearch.tsx')
  ]);
  for(const label of ['Задачи','Подзадачи','Заметки','Завершённые задачи и подзадачи',
    'НАЙДЕНО В ПЛАНИРОВЫЧЕ','Свернуть','показано']) {
    assert.ok(search.includes(label),label);
  }
  assert.ok(search.includes('take(5)'), 'limit to five per search group');
  assert.ok(search.includes('searchScore(task.title,body,parentName,query)'));
  assert.ok(search.includes('task.status==TaskStatus.DONE'));
  assert.ok(search.includes('searchScore(note.title,body,"",query)'));
  assert.ok(search.includes('onOpenNote(hit.id) else onOpenTask(hit.id)'));
  assert.ok(workspace.includes('NativeWorkspaceGlobalSearch('));
  assert.ok(workspace.includes('tasks=state.tasks,notes=state.notes'));
  assert.ok(workspace.includes('if(state.query.isNotBlank()) vm.loadNotes()'));
  assert.ok(workspace.includes('pagerState.animateScrollToPage(3)'));
  assert.ok(notes.includes('openNoteId:String?=null'));
  assert.ok(notes.includes('editing=target'));
  assert.ok(notes.includes('editorOpen=true'));
  assert.ok(web.includes('Найдено в Планировыче'));
});

test('Android efficiency rating has the MiniApp-style pastel card and real breakdown',async()=>{
  const rating=await read(base+'NativeAiAccountSheets.kt');
  const start=rating.indexOf('internal fun NativeEfficiencyRatingDialog(');
  const end=rating.indexOf('internal fun NativeAiCreditsDialog(',start);
  const s=rating.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.ok(s.includes('Brush.linearGradient(gradient)'));
  assert.ok(s.includes('Brush.horizontalGradient'));
  assert.ok(s.includes('RoundedCornerShape(31.dp)'));
  for(const field of ['efficiencyTaskScore','efficiencyHabitScore','efficiencyAiScore',
    'efficiencyFocusScore','Режим концентрации (×2)','0,1 за запрос']) {
    assert.ok(s.includes(field),field);
  }
  assert.ok(!s.includes('Canvas('),'rating no longer uses a ring');
});

test('Android overflow menu renders large utility cards with live badges',async()=>{
  const s=await read(base+'ModernWorkspace.kt');
  assert.ok(s.includes('WorkspaceUtilityMenuItem('));
  assert.ok(s.includes('label="Кредиты"'));
  assert.ok(s.includes('label="Рейтинг"'));
  assert.ok(s.includes('label="Настройки"'));
  assert.ok(s.includes('(state.user?.aiCredits?:0).toString()'));
  assert.ok(s.includes('state.user?.efficiencyScore'));
  assert.ok(s.includes('RoundedCornerShape(21.dp)'));
  assert.ok(s.includes('moreOpen=false;onCredits()'));
  assert.ok(s.includes('moreOpen=false;onScore()'));
  assert.ok(s.includes('moreOpen=false;settings()'));
});

test('Both AI chats share a clipped five-line composer that does not overlap controls',async()=>{
  const [shared,general,task]=await Promise.all([
    read(base+'NativeAiComposerInput.kt'),
    read(base+'NativeGeneralAiChat.kt'),
    read(base+'NativeTaskAiChat.kt')
  ]);
  assert.ok(shared.includes('BasicTextField('));
  assert.ok(shared.includes('maxLines=5'));
  assert.ok(shared.includes('minLines=1'));
  assert.ok(shared.includes('max=124.dp'));
  assert.ok((shared.match(/clipToBounds\(\)/g)||[]).length>=2);
  assert.ok(general.includes('NativeAiComposerInput('));
  assert.ok(task.includes('NativeAiComposerInput('));
  assert.ok(general.includes('modifier=Modifier.weight(1f).focusRequester(draftFocus)'));
  assert.ok(general.includes('onValueChange={draft=it;lastRequestHadError=false}'));
  assert.ok(task.includes('onValueChange={draft=it;pendingRetry=false}'));
  assert.ok(!general.includes('BasicTextField(value=draft'));
  assert.ok(!task.includes('BasicTextField(value=draft'));
});

test('Android next release code and name are consistent for GitHub android-v6',async()=>{
  const gradle=await read('../../android-app/app/build.gradle.kts');
  assert.ok(gradle.includes('versionCode = 6'));
  assert.ok(gradle.includes('versionName = "1.0.4"'));
  assert.ok(gradle.includes('applicationId = "ru.planirovych.app"'));
});
