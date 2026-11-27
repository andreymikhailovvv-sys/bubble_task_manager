import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { taskService } from './task.service.js';

/** Editable fields are strictly allowlisted: no task ID, ownership or
 * collaboration controls may ever arrive from a chip. */
export const TASK_CHIP_FIELDS=['title','description','sphereId','dueDate','importance',
  'urgency','status','location','notifyBeforeMinutes'] as const;
export type TaskChipField=typeof TASK_CHIP_FIELDS[number];
export type TaskChipValues={
  title?:string;description?:string;sphereId?:string|null;dueDate?:string|null;
  importance?:number;urgency?:number;status?:string;location?:string;
  notifyBeforeMinutes?:number;
};
const selectable=new Set<string>(TASK_CHIP_FIELDS);
const iso=(value:unknown)=>value instanceof Date?value.toISOString():value;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const isTaskChipAction=(action:Record<string,unknown>):boolean=>{
  const kind=String(action.operation??action.type??'');
  return !['create_note','update_note','create_habit','complete_habit','update_habit','delete','rebalance_today',
    'telegram_suggestion'].includes(kind) && !kind.startsWith('delete') && (
      Boolean(action.operation) || Boolean(action.type) &&
      /task|subtask|event|reminder|rename|reschedule|priority|due_date|description|complete|reopen|sphere|notification/.test(kind)
  );
};
export function taskChipInitial(
  action:Record<string,unknown>,
  task?:{title:string;description:string|null;sphereId:string|null;dueDate:Date|null;
    importance:number;urgency:number;status:string;location:string|null;notifyBeforeMinutes:number|null;
    parentTaskId:string|null}
):TaskChipValues | null {
  if(!isTaskChipAction(action))return null;
  const op=String(action.operation??action.type??'');
  const creating=/^create_/.test(op);
  const data:TaskChipValues=task?{
    title:task.title,description:task.description??'',sphereId:task.parentTaskId?null:task.sphereId,
    dueDate:task.dueDate?.toISOString()??null,importance:task.importance,urgency:task.urgency,
    status:task.status,location:task.location??'',notifyBeforeMinutes:task.notifyBeforeMinutes??0
  }:{
    title:String(action.title??'Новая задача'),description:'',sphereId:null,dueDate:null,
    importance:3,urgency:3,status:'TODO',location:'',notifyBeforeMinutes:0
  };
  const fields=['title','description','sphereId','dueDate','importance','urgency',
    'status','location','notifyBeforeMinutes'] as const;
  for(const key of fields) {
    const val=action[key];
    if(val!==undefined && (creating || ['rename','rename_task','rename_subtask'].includes(op)&&key==='title' ||
      op==='set_description'&&key==='description' || ['reschedule','reschedule_task','reschedule_subtask'].includes(op)&&key==='dueDate' ||
      op==='set_priority'&&['importance','urgency'].includes(key) ||
      op==='set_notification'&&key==='notifyBeforeMinutes' ||
      ['change_sphere','change_task_sphere'].includes(op)&&key==='sphereId' ||
      op==='update_task'||op==='update_subtask'||op==='create_subtask')) {
      (data as unknown as Record<string,unknown>)[key]=iso(val);
    }
  }
  if(op==='complete'||op==='complete_task'||op==='complete_subtask')data.status='DONE';
  if(op==='reopen'||op==='reopen_subtask')data.status='TODO';
  if(op==='clear_due_date')data.dueDate=null;
  if(creating && op==='create_reminder')data.notifyBeforeMinutes=0;
  if(task?.parentTaskId || op==='create_subtask')delete data.sphereId;
  return data;
}
export function validateTaskChipValues(raw:unknown,base:TaskChipValues):TaskChipValues {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Неверные поля задачи.');
  const values=raw as Record<string,unknown>;
  if(Object.keys(values).length!==Object.keys(base).length ||
    Object.keys(values).some(k=>!selectable.has(k)||!(k in base)))
    throw new Error('Карточка содержит недопустимые поля.');
  const result:TaskChipValues={};
  for(const key of Object.keys(base) as TaskChipField[]){
    const v=values[key];
    if(key==='title'){
      if(typeof v!=='string'||!v.trim()||v.length>180)throw new Error('Название задачи должно быть от 1 до 180 символов.');
      result.title=v.trim();
    }else if(key==='description'){
      if(typeof v!=='string'||v.length>4000)throw new Error('Слишком длинное описание задачи.');
      result.description=v;
    }else if(key==='location'){
      if(typeof v!=='string'||v.length>500)throw new Error('Слишком длинное место встречи.');
      result.location=v;
    }else if(key==='sphereId'){
      if(v!==null && (typeof v!=='string'||!/^[-_A-Za-z0-9]{8,128}$/.test(v)))
        throw new Error('Недопустимый сектор.');
      result.sphereId=v as string|null;
    }else if(key==='dueDate'){
      if(v!==null&&(typeof v!=='string'||v.length>40||
        !/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v))))
        throw new Error('Некорректная дата и время.');
      result.dueDate=v===null?null:new Date(v as string).toISOString();
    }else if(key==='status'){
      if(!['TODO','IN_PROGRESS','DONE'].includes(String(v)))throw new Error('Недопустимый статус задачи.');
      result.status=v as string;
    }else if(key==='importance'||key==='urgency'){
      if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>5)
        throw new Error('Важность и срочность должны быть от 1 до 5.');
      result[key]=v;
    }else if(key==='notifyBeforeMinutes'){
      if(typeof v!=='number'||!Number.isInteger(v)||v<0||v>10080)
        throw new Error('Некорректный срок уведомления.');
      result.notifyBeforeMinutes=v;
    }
  }
  return result;
}
export function chipChanged(base:TaskChipValues,newValues:TaskChipValues):TaskChipValues{
  return Object.fromEntries(Object.entries(newValues).filter(([key,value])=>
    !same(value,base[key as TaskChipField]))) as TaskChipValues;
}
export async function validateChipReferences(userId:string,changes:TaskChipValues){
  if(changes.sphereId){
    const sphere=await prisma.sphere.findFirst({
      where:{id:changes.sphereId,userId},select:{id:true}
    });
    if(!sphere)throw new Error('Сектор отсутствует или недоступен.');
  }
}
export async function applyChipEdits(userId:string,taskId:string,changes:TaskChipValues) {
  if(!Object.keys(changes).length)return;
  await validateChipReferences(userId,changes);
  const existing=await prisma.task.findFirst({
    where:{id:taskId,AND:[taskAccessWhere(userId)]},select:{id:true}
  });
  if(!existing)throw new Error('Задача больше недоступна.');
  await taskService.update(taskId,userId,{
    title:changes.title,description:changes.description,location:changes.location,
    sphereId:changes.sphereId,
    status:changes.status as 'TODO'|'IN_PROGRESS'|'DONE'|undefined,
    importance:changes.importance,urgency:changes.urgency,
    notifyBeforeMinutes:changes.notifyBeforeMinutes,
    dueDate:changes.dueDate===undefined?undefined:
      changes.dueDate?new Date(changes.dueDate):null
  });
}
export function chipDbPatch(current:{
  importance:number;urgency:number;status:string;dueDate:Date|null;notifyBeforeMinutes:number|null
},changes:TaskChipValues):Prisma.TaskUncheckedUpdateManyInput {
  const patch:Prisma.TaskUncheckedUpdateManyInput={};
  for(const [key,value] of Object.entries(changes)){
    if(key==='dueDate')patch.dueDate=value?new Date(value as string):null;
    else if(key==='sphereId')patch.sphereId=value as string|null;
    else if(key==='title')patch.title=value as string;
    else if(key==='description')patch.description=value as string;
    else if(key==='location')patch.location=value as string|null;
    else if(key==='status')patch.status=value as 'TODO'|'IN_PROGRESS'|'DONE';
    else if(key==='importance')patch.importance=value as number;
    else if(key==='urgency')patch.urgency=value as number;
    else if(key==='notifyBeforeMinutes')patch.notifyBeforeMinutes=value as number;
  }
  if(changes.importance!==undefined||changes.urgency!==undefined){
    const importance=changes.importance??current.importance;
    const urgency=changes.urgency??current.urgency;
    patch.priorityScore=Number((importance*.6+urgency*.4).toFixed(2));
  }
  if(changes.dueDate!==undefined||changes.status!==undefined||
    changes.notifyBeforeMinutes!==undefined)patch.telegramNotifiedAt=null;
  return patch;
}
