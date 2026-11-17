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
  assert.match(proposal,/row\.updatedAt\.toISOString\(\)!==data\.revision/);
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
