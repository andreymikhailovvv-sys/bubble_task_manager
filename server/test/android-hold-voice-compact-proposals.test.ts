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
  assert.match(launcher,/\.clickable\(enabled=!waiting,/);
  assert.match(launcher,/onClickLabel=if\(open\)"Закрыть меню добавления"/);
  assert.match(launcher,/targetValue=if\(open\)45f else 0f/);
  assert.match(launcher,/rotationZ=plusRotation/);
  // Focusable native Popup intercepts outside taps: its own visible X must
  // close the popup instead of relying on the underlying FAB.
  assert.match(launcher,/\.clickable\(onClickLabel="Закрыть меню добавления"\) \{ open=false \}/);
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
  assert.match(mini,/ref=\{quickCreateRef\}/);
  assert.match(mini,/document.addEventListener\('pointerdown', onOutsidePointerDown\)/);
  assert.match(mini,/document.addEventListener\('keydown', onEscape\)/);
  assert.match(mini,/if \(event.key === 'Escape'\) setIsQuickCreateOpen\(false\)/);
  assert.match(miniCss,/\.miniapp-shell \.miniapp-quick-create \{\s*z-index: 320;/);
  assert.match(miniCss,/\.miniapp-shell \.miniapp-quick-create\.is-open \.miniapp-quick-create-actions,/);
  assert.match(miniCss,/touch-action: manipulation/);
  assert.match(economic,/className="econ-mobile-add-fab"[\s\S]*?onClick=\{\(\) => setAddMenuOpen\(v=>!v\)\}/);
  assert.match(economic,/\{addMenuOpen && createMenu\}/);
  assert.match(economic,/mobile && embeddedInMiniApp && !dialog && createPortal\(/);
  assert.match(economic,/<\/div>, document\.body\)\}/);
  assert.match(econCss,/\.econ-root\.econ-mobile-create\{\s*position:fixed;right:0;bottom:0;z-index:320/);
  assert.match(econCss,/\.econ-mobile-create \.econ-create-menu\{z-index:321\}/);
  assert.match(miniCss,/\.miniapp-quick-create\.is-open \.miniapp-ai-chat-launcher svg \{[\s\S]*?rotate\(45deg\)/);
  assert.match(econCss,/\.econ-mobile-create \.econ-mobile-add-fab\[aria-expanded="true"\] svg,/);
  assert.match(econCss,/transform:rotate\(45deg\)/);
});

test('Android planner and Economic share the minimal recording window and instant background transcription',()=>{
  const home=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
  const voice=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/AiChatVoiceInput.kt');
  const rich=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeRichTextEditor.kt');
  assert.match(home,/quickAiMode=="voice"/);
  assert.match(home,/vm\.sendGeneralAi\(quick\.id,QUICK_AI_THREAD_ID/);
  assert.match(home,/onDone=\{[\s\S]*?pagerState\.animateScrollToPage\(2\)/);
  assert.match(home,/onQuickVoice=\{voiceFromFinance=true;voiceInput\(\)\}/);
  assert.match(home,/onVoice=\{voiceFromFinance=false;voiceInput\(\)\}/);
  assert.match(home,/onProcessingStart=\{voiceAwaiting=true\}/);
  assert.match(home,/onProcessingCancelled=\{voiceAwaiting=false\}/);
  assert.match(home,/accent=if\(voiceFromFinance\)Color\(0xFFF5A52E\) else Color\(0xFF8050DF\)/);

  assert.match(voice,/quickLauncher:Boolean=false/);
  assert.match(voice,/FlowRow\(/);
  assert.match(voice,/suggestions\.forEach \{ hint ->/);
  assert.doesNotMatch(voice,/suggestions\.take\(3\)|suggestions\.take\(9\)/);
  // All nine planner hints, including financial commands, and all five
  // Economic hints must reach the same shared voice UI.
  for (const hint of [
    "Создай задачу","Добавь напоминание","Перенеси встречу",
    "Создай привычку","Запиши заметку","Запиши расход",
    "Создай счёт","Переведи деньги между счетами","Создай долг",
    "Добавь расход","Запиши доход","Покажи расходы за месяц",
    "Сколько денег на счетах?"
  ]) assert.ok(home.includes(hint), hint);
  assert.match(voice,/val voiceBackdrop=if\(dark\)Color\(0xB30B1120\) else Color\(0xBFD9E0EC\)/);
  assert.match(voice,/Brush\.verticalGradient\(/);
  assert.match(voice,/voiceBackdrop\.copy\(alpha=voiceBackdrop\.alpha\*\.24f\)/);
  assert.match(voice,/startY=0f,endY=statusBarFadePx/);
  assert.match(voice,/\.height\(156\.dp\)[\s\S]*?contentAlignment=Alignment\.Center/);
  assert.match(voice,/\.offset\(y=47\.dp\)/);
  assert.match(voice,/recorder\.value\?\.maxAmplitude/);
  assert.match(voice,/if\(peak<850\)0f/);
  assert.match(voice,/drawCircle\(accent\.copy/);
  assert.match(voice,/Icon\(Icons\.Default\.Mic,"Идёт запись"/);
  assert.match(voice,/Icon\(Icons\.Default\.Send,"Отправить голосовой запрос"/);
  assert.match(voice,/elapsedSeconds\/60,elapsedSeconds%60/);
  assert.match(voice,/Color\(0xB30B1120\)/);
  assert.match(voice,/Color\(0xBFD9E0EC\)/);
  assert.match(voice,/Modifier\.size\(86\.dp\)\.clip\(CircleShape\)/);
  assert.match(voice,/Modifier\.size\(48\.dp\)\.clip\(CircleShape\)/);

  // Sending must dismiss the fullscreen recorder immediately and show
  // a separate, small processing popover while bytes are transcribed.
  assert.match(voice,/stage=VoiceRecordingStage\.TRANSCRIBING[\s\S]*?if\(sendImmediately\)processingStarted\(\)/);
  assert.match(voice,/if\(recordingNow\)\{\s*Dialog\(/);
  assert.match(voice,/\}else\{\s*\/\/ The full-screen recorder disappears/);
  assert.match(voice,/Popup\([\s\S]*?alignment=Alignment\.BottomEnd/);
  assert.match(voice,/PopupProperties\(focusable=false,clippingEnabled=false\)/);
  assert.match(voice,/Text\("Обработка речи"/);
  assert.match(voice,/TextButton\(onClick=\{cancelProcessing\(\)\}/);
  assert.match(voice,/if\(financeAccent\)Color\(0xFF97540E\) else Color\(0xFF6435B3\)/);
  assert.match(voice,/processingJob\?\.cancel\(\)/);
  assert.match(voice,/if\(processingGeneration==generation\)/);
  assert.match(voice,/catch\(_:CancellationException\)/);

  // Existing non-quick dictation and editor gestures are preserved.
  assert.match(rich,/maxVerticalScroll\(\)>0/);
  assert.match(rich,/Consume pre-slop MOVE/);
  assert.match(rich,/cancelNativeGesture\(event\)/);
  assert.match(rich,/getOffsetForPosition\(event\.x,event\.y\)/);
  assert.match(rich,/InputMethodManager\.SHOW_IMPLICIT/);
  assert.match(voice,/financialSuggestions:Set<String>/);
  assert.match(voice,/\}else Dialog\(onDismissRequest=/);
});
