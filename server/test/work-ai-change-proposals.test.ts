import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkChanges, workChangesTool } from '../src/services/work-ai-actions.service.js';

test('Work AI prepares an ordered project and task plan without executing it', () => {
  const actions=parseWorkChanges({actions:[
    {op:'create_project',projectKey:'sales',name:'Продажи'},
    {op:'create_task',taskKey:'call',projectKey:'sales',title:'Позвонить клиенту'},
    {op:'create_subtask',taskKey:'call',title:'Подготовить документы'}
  ]});
  assert.equal(actions.length,3);
  assert.equal(actions[1].projectKey,'sales');
  assert.equal(actions[2].taskKey,'call');
  assert.match(workChangesTool.description,/НИЧЕГО не выполняя/);
});
test('Work AI rejects unsupported changes and arbitrary tool arguments',()=>{
  assert.throws(()=>parseWorkChanges({actions:[{op:'delete_project',projectId:'x'}]}),/Недопустимое действие/);
  assert.throws(()=>parseWorkChanges({actions:[{op:'create_project',name:'А',projectKey:'p',status:'DONE'}]}),/Лишние поля/);
  assert.throws(()=>parseWorkChanges({actions:[{op:'update_task',taskId:'a',clearDueAt:true,dueAt:'2026-11-01T12:00:00Z'}]}),/Нельзя одновременно/);
  assert.throws(()=>parseWorkChanges({actions:[{op:'update_task',taskId:'a',dueAt:'2026-11-01T12:00:00'}]}),/часовой пояс/);
  assert.throws(()=>parseWorkChanges({actions:Array.from({length:13},(_,i)=>({op:'create_project',name:'P'+i}))}),/от 1 до 12/);
});
