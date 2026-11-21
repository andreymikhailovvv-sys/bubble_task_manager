import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('AI proposal chips are compact summaries; edits live in dedicated dialogs',()=>{
  const task=read('../../client/src/components/AiTaskProposalCard.tsx');
  const finance=read('../../client/src/components/EconomicAiProposalCard.tsx');
  const nativeTask=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiTaskProposalCard.kt');
  const nativeFinance=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicAiProposalCard.kt');
  for(const web of [task,finance]){
    assert.match(web,/role="dialog" aria-modal="true"/);
    assert.match(web,/Сохранить/);
    assert.match(web,/onClick=\{openEditor\}/);
  }
  assert.match(task,/const saveEditor=async\(\)=>/);
  assert.match(finance,/const previewValue=/);
  assert.match(nativeTask,/Dialog\(onDismissRequest=/);
  assert.match(nativeTask,/submit\("edit"\)/);
  assert.match(nativeFinance,/Dialog\(onDismissRequest=/);
  assert.match(nativeFinance,/action\("revise"\)/);
  assert.match(nativeFinance,/Icons\.Default\.Edit/);
});

test('Android long-press drag actions provide voice, visual feedback and haptics',()=>{
  const launcher=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeHoldActionButton.kt');
  const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const economic=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicCompose.kt');
  assert.match(launcher,/detectDragGesturesAfterLongPress/);
  assert.match(launcher,/HapticFeedbackType\.TextHandleMove/);
  assert.match(launcher,/animateFloatAsState/);
  assert.match(launcher,/onVoice\(\)/);
  assert.match(home,/NativeHoldActionButton\(/);
  assert.match(home,/NativeHoldAction\("Добавить напоминание"/);
  assert.match(economic,/NativeHoldActionButton\(/);
  assert.match(economic,/NativeHoldAction\("Добавить кредит"/);
  assert.doesNotMatch(economic,/DropdownMenu\(expanded=addMenuOpen/);
});

test('quick voice records locally, submits to existing AI chat and opens replies afterwards',()=>{
  const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const voice=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/AiChatVoiceInput.kt');
  const rich=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeRichTextEditor.kt');
  assert.match(home,/quickAiMode=="voice"/);
  assert.match(home,/vm\.sendGeneralAi\(quick\.id,QUICK_AI_THREAD_ID/);
  assert.match(home,/onDone=\{[\s\S]*?pagerState\.animateScrollToPage\(2\)/);
  assert.match(voice,/quickLauncher:Boolean=false/);
  assert.match(voice,/suggestions\.take\(5\)/);
  assert.match(voice,/drawCircle\(accent\.copy/);
  assert.match(voice,/Icon\(Icons\.Default\.Send/);
  assert.match(rich,/maxVerticalScroll\(\)>0/);
  assert.match(rich,/Consume pre-slop MOVE/);
});
