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

test('single corporate task gets an internal key without involving the user',()=>{
  const actions=parseWorkChanges({actions:[{
    op:'create_task',projectId:'existing-company-project',title:'Создание конструктора рабочего пространства',
    assigneeMemberId:'known-company-member'
  }]});
  assert.equal(actions.length,1);
  assert.match(actions[0].taskKey||'',/^internal_task_0/);
  assert.equal(actions[0].projectId,'existing-company-project');
  assert.equal(actions[0].assigneeMemberId,'known-company-member');
});
test('new project and its only new task/subtask link without model-supplied keys',()=>{
  const actions=parseWorkChanges({actions:[
    {op:'create_project',name:'Развитие B2B'},
    {op:'create_task',title:'Создать конструктор'},
    {op:'create_subtask',title:'Добавить меню'}
  ]});
  assert.match(actions[0].projectKey||'',/^internal_project/);
  assert.equal(actions[1].projectKey,actions[0].projectKey);
  assert.equal(actions[2].taskKey,actions[1].taskKey);
});
test('generated internal keys do not collide with explicit keys and never replace them',()=>{
  const actions=parseWorkChanges({actions:[
    {op:'create_project',projectKey:'internal_project_1',name:'Первый'},
    {op:'create_project',name:'Второй'},
    {op:'create_task',projectKey:'internal_project_1',taskKey:'explicit',title:'Один'},
    {op:'create_task',projectKey:'internal_project_1',title:'Два'}
  ]});
  assert.notEqual(actions[1].projectKey,'internal_project_1');
  assert.equal(actions[2].taskKey,'explicit');
  assert.ok(actions[3].taskKey);
  assert.notEqual(actions[3].taskKey,'explicit');
});
