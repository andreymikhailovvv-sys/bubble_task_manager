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

test('Android quick actions open on tap and dismiss after an explicit choice',()=>{
  const launcher=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeHoldActionButton.kt');
  const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const economic=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicCompose.kt');
  assert.match(launcher,/\.clickable\(enabled=!waiting, onClickLabel="Открыть меню добавления"\)/);
  assert.match(launcher,/open=!open/);
  assert.match(launcher,/onDismissRequest=\{open=false\}/);
  assert.match(launcher,/PopupProperties\(focusable=true/);
  assert.match(launcher,/\.clickable \{ activate\(index\) \}/);
  assert.match(launcher,/\.clickable \{ activate\(-1\) \}/);
  assert.match(launcher,/latestVoice\(\)/);
  assert.match(launcher,/fadeIn\(/);
  assert.match(launcher,/fadeOut\(/);
  assert.match(launcher,/cy-28\.dp\.toPx\(\)/);
  assert.doesNotMatch(launcher,/awaitEachGesture|awaitFirstDown|delay\(|hintVisible|releasedPreview|Зажмите/);
  assert.match(home,/onMenuVisibilityChange=\{plannerMenuOpen=it\}/);
  assert.match(home,/NativeHoldAction\("Добавить напоминание"/);
  assert.match(economic,/onMenuVisibilityChange=\{economicMenuOpen=it\}/);
  assert.match(economic,/NativeHoldAction\("Добавить кредит"/);
  assert.doesNotMatch(economic,/DropdownMenu\(expanded=addMenuOpen/);
});

test('Mini App planner and Economic plus buttons stay above navigation and accept taps',()=>{
  const mini=read('../../client/src/MiniApp.tsx');
  const miniCss=read('../../client/src/styles.css');
  const economic=read('../../client/src/EconomicApp.tsx');
  const econCss=read('../../client/src/EconomicApp.css');
  assert.match(mini,/onClick=\{\(\) => setIsQuickCreateOpen\(\(prev\) => !prev\)\}/);
  assert.match(mini,/aria-expanded=\{isQuickCreateOpen\}/);
  assert.match(miniCss,/\.miniapp-shell \.miniapp-quick-create \{\s*z-index: 320;/);
  assert.match(miniCss,/\.miniapp-shell \.miniapp-quick-create\.is-open \.miniapp-quick-create-actions,/);
  assert.match(miniCss,/touch-action: manipulation/);
  assert.match(economic,/className="econ-mobile-add-fab"[\s\S]*?onClick=\{\(\) => setAddMenuOpen\(v=>!v\)\}/);
  assert.match(economic,/\{addMenuOpen && createMenu\}/);
  assert.match(econCss,/\.econ-mobile-create\{\s*position:fixed;right:0;bottom:0;z-index:320/);
  assert.match(econCss,/\.econ-mobile-create \.econ-create-menu\{z-index:321\}/);
});

test('quick voice records locally, submits to existing AI chat and opens replies afterwards',()=>{
  const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const voice=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/AiChatVoiceInput.kt');
  const rich=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeRichTextEditor.kt');
  assert.match(home,/quickAiMode=="voice"/);
  assert.match(home,/vm\.sendGeneralAi\(quick\.id,QUICK_AI_THREAD_ID/);
  assert.match(home,/onDone=\{[\s\S]*?pagerState\.animateScrollToPage\(2\)/);
  assert.match(voice,/quickLauncher:Boolean=false/);
  assert.match(voice,/suggestions\.take\(9\)/);
  assert.match(voice,/recorder\.value\?\.maxAmplitude/);
  assert.match(voice,/if\(peak<850\)0f/);
  assert.match(voice,/drawCircle\(accent\.copy/);
  assert.match(voice,/Icon\(Icons\.Default\.Send/);
  assert.match(rich,/maxVerticalScroll\(\)>0/);
  assert.match(rich,/Consume pre-slop MOVE/);
  assert.match(rich,/cancelNativeGesture\(event\)/);
  assert.match(rich,/getOffsetForPosition\(event\.x,event\.y\)/);
  assert.match(rich,/InputMethodManager\.SHOW_IMPLICIT/);
  assert.match(voice,/financialSuggestions:Set<String>/);
  assert.match(voice,/Color\(0xFFF3AC43\)/);
  assert.match(voice,/fontSize=21\.sp/);
  assert.match(voice,/OutlinedButton\(onClick=\{releaseRecorder\(true\)\}/);
});
