import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('financial operations use Russian labels; approval stays in assistant chat, not overview',()=>{
 const backend=read('../src/services/economic-ai-proposals.service.ts');
 const overview=read('../../client/src/EconomicApp.tsx');
 assert.match(backend,/row\.entity==='operation'\)return 'Финансовая операция'/);
 assert.doesNotMatch(overview,/econ-planner-proposals|Подтверждение финансовых изменений/);
 assert.match(overview,/EconomicAiProposalCard key=\{item\.id\}/);
});

test('Mini App closes only the outer progress ring and greys the emoji in both themes',()=>{
 const css=read('../../client/src/styles.css');
 const mini=read('../../client/src/MiniApp.tsx');
 const final=css.slice(css.lastIndexOf('/* Completion closes only the outer ring'));
 assert.match(final,/--habit-progress: 100%/);
 assert.match(final,/background: var\(--habit-core-bg/);
 assert.match(final,/\.miniapp-habit-circle-completed \.miniapp-habit-emoji/);
 assert.match(final,/filter: grayscale\(1\)/);
 assert.match(mini,/miniapp-habit-emoji text-lg/);
 assert.match(mini,/habitModalCompleted >= parseHabitTargetCount\(habitDraft\.targetCount\)/);
});

test('Android greys only completed emoji glyphs and preserves circular progress',()=>{
 const helper=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HabitEmojiModifier.kt');
 const main=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt');
 const legacy=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeScreen.kt');
 const detail=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeHabitDetailSheet.kt');
 assert.match(helper,/ColorFilter\.colorMatrix/);
 assert.match(helper,/setToSaturation\(0f\)/);
 assert.match(main,/habitEmojiCompletionFilter\(completed\)/);
 assert.match(legacy,/habitEmojiCompletionFilter\(scheduledToday && amount>=target\)/);
 assert.match(detail,/habitEmojiCompletionFilter\(amount>=habit\.targetCount/);
 assert.match(main,/sweepAngle=progress\*360f/);
 assert.match(legacy,/sweepAngle = progress \* 360f/);
});
