import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {taskChipInitial,validateTaskChipValues,chipChanged,chipDbPatch} from '../src/services/ai-task-chip-edit.service.js';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('task edit fields respect the proposed operation and preserve original date',()=>{
  const task={title:'Раньше',description:'Контекст',sphereId:'c123456789',
    dueDate:new Date('2026-12-01T09:00:00.000Z'),status:'TODO',
    importance:3,urgency:4,location:null,notifyBeforeMinutes:15,parentTaskId:null};
  const fields=taskChipInitial({operation:'rename',title:'Новое'},task)!;
  assert.equal(fields.title,'Новое');
  assert.equal(fields.sphereId,task.sphereId);
  assert.equal(fields.dueDate,'2026-12-01T09:00:00.000Z');
  const normalized=validateTaskChipValues({...fields,importance:5,dueDate:'2026-12-01T09:00:00.000Z'},fields);
  assert.deepEqual(chipChanged(fields,normalized),{importance:5});
  assert.equal(chipDbPatch(task,{importance:5}).priorityScore,4.6);
  assert.equal(taskChipInitial({operation:'delete',itemId:'c123456789'},task),null);
  assert.equal(taskChipInitial({operation:'delete_task',taskId:'c123456789'},task),null);
});

test('chip rejects unknown fields, forged references and malformed dates',()=>{
  const base=taskChipInitial({operation:'create_task',title:'Задача'})!;
  assert.throws(()=>validateTaskChipValues({...base,userId:'victim'},base),/недопустимые/i);
  assert.throws(()=>validateTaskChipValues({...base,title:''},base),/Название/);
  assert.throws(()=>validateTaskChipValues({...base,dueDate:'not-a-date'},base),/дата/i);
  assert.throws(()=>validateTaskChipValues({...base,importance:20},base),/от 1 до 5/);
  assert.throws(()=>validateTaskChipValues({...base,sphereId:'foreign'},base),/сектор/i);
});

test('task chip revision uses owner-scoped updates and never reruns an applied AI batch',()=>{
  const proposal=read('../src/services/ai-task-proposal.service.ts');
  const router=read('../src/routes/api.ts');
  const web=read('../../client/src/components/AiTaskProposalCard.tsx');
  const android=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiTaskProposalCard.kt');
  assert.match(proposal,/taskProposalRevision\(row\)!==data\.revision/);
  assert.match(proposal,/status:'APPLIED',updatedAt:row\.updatedAt/);
  assert.match(proposal,/updateMany\(/);
  assert.match(proposal,/undoData:undo/);
  assert.match(router,/task-proposals\/:id', requireAuth, taskProposalSameOrigin/);
  assert.match(web,/api\.editAiTaskProposal/);
  assert.match(web,/Изменить/);
  assert.match(android,/vm\.editTaskAiProposal/);
  assert.match(android,/Изменить/);
});

test('receipts trigger finance proposals in both assistants and dark chip elements match their surface',()=>{
  const finance=read('../src/services/economic-assistant.service.ts');
  const planner=read('../src/services/ai-assistant.service.ts');
  const css=read('../../client/src/components/EconomicAiProposalCard.css');
  for(const prompt of [finance,planner]){
    assert.match(prompt,/чек/);
    assert.match(prompt,/propose_economic_changes/);
  }
  assert.match(css,/econ-finance-autoapply input\[type='checkbox'\]/);
  assert.match(css,/scrollbar-color/);
  assert.match(css,/border-top-color/);
});

test('task proposal stays one inner panel, with paired actions on web, Mini App and Android',()=>{
  const card=read('../../client/src/components/AiTaskProposalCard.tsx');
  const css=read('../../client/src/components/AiTaskProposalCard.css');
  const miniCss=read('../../client/src/styles.css');
  const nativeCard=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeAiTaskProposalCard.kt');
  const nativeFields=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskChipFields.kt');
  assert.match(card,/ai-task-proposal__actions mt-3 flex w-full gap-2/);
  assert.match(card,/Отменить\s*<\/button>/);
  assert.match(css,/\.ai-task-proposal__editable\{[\s\S]*?border:0;border-radius:0;background:transparent/);
  assert.match(miniCss,/\.miniapp-shell \.miniapp-ai-chat-backdrop-general \{[\s\S]*?bottom: calc\(3\.25rem \+ var\(--miniapp-bottom-inset/);
  assert.match(nativeCard,/"APPLIED"->Row\(Modifier\.fillMaxWidth\(\)/);
  assert.match(nativeCard,/Text\("Отменить",fontSize=11\.sp\)/);
  assert.doesNotMatch(nativeFields,/\.background\(surface\.copy\(alpha=\.5f\)/);
  assert.match(nativeFields,/\.verticalScroll\(rememberScrollState\(\)\)\.padding\(top=4\.dp,end=2\.dp\)/);
});

test('desktop task chip uses one editable panel and a horizontal action row',()=>{
  const css=read('../../client/src/components/AiTaskProposalCard.css');
  assert.match(css,/\.app-shell \.ai-task-proposal__editable\{/);
  assert.match(css,/background:transparent!important;border:0!important/);
  assert.match(css,/\.app-shell \.ai-task-proposal__actions>button\{/);
  assert.match(css,/flex:1 1 0;min-width:0;width:0/);
});

test('browser performance telemetry is coarse, bounded and avoids user content',()=>{
  const tracker=read('../../client/src/lib/ui-performance-diagnostics.ts');
  const entry=read('../../client/src/main.tsx');
  const api=read('../src/routes/api.ts');
  assert.match(tracker,/PerformanceObserver/);
  assert.match(tracker,/requestAnimationFrame/);
  assert.match(tracker,/\/api\/client-performance/);
  assert.match(tracker,/navigator\.sendBeacon/);
  assert.match(entry,/startUiPerformanceDiagnostics\(/);
  assert.match(api,/apiRouter\.post\('\/client-performance', requireAuth, mailOrigin/);
  assert.match(api,/new FixedWindowRateLimiter\(8, 60_000\)/);
  // The background task scan must not hydrate unrelated future deadlines.
  const telegram=read('../src/services/telegram.service.ts');
  assert.match(telegram,/latestNotifiableDueDate = new Date\(now\.getTime\(\) \+ MAX_SHINE_WINDOW_MINUTES \* 60_000\)/);
  assert.match(telegram,/dueDate: \{ not: null, lte: latestNotifiableDueDate \}/);
});

test('Telegram reminder scan only loads task details for a deliverable message',()=>{
  const telegram=read('../src/services/telegram.service.ts');
  assert.match(telegram,/if \(isShining && !recipient\.telegramNotifiedAt && BOT_TOKEN && recipient\.telegramChatId\) \{\s*const text = await getTaskNotificationText/);
  assert.doesNotMatch(telegram,/const text = await getTaskNotificationText\(task\.id, recipient\.userId\);\s*if \(BOT_TOKEN/);
  // Local and Android feed notifications remain independent from Telegram.
  assert.match(telegram,/createSystemNotificationUnlessExists\(prisma, existingTaskNotifications/);
});

test('rich description input coalesces expensive sanitizing and flushes before save',()=>{
  const editor=read('../../client/src/components/InlineRichDescriptionEditor.tsx');
  assert.match(editor,/pendingHtmlRef\.current = editor\.innerHTML/);
  assert.match(editor,/pendingTimerRef\.current = setTimeout/);
  assert.match(editor,/const html = linkifyNoteHtml\(rawHtml\)/);
  assert.match(editor,/document\.addEventListener\('pointerdown', onOutsidePointerDown, true\)/);
  assert.match(editor,/event\.key === 'Escape'/);
  assert.match(editor,/const html = flushPending\(\) \?\? emitSanitized\(editor\.innerHTML\)/);
  assert.match(editor,/onBlur=\{handleBlur\}/);
  assert.match(editor,/flushPending\(\);\s*\};\s*\}, \[\]\)/);
});
