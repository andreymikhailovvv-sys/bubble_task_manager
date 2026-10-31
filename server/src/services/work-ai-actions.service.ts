import { Prisma, type WorkTaskPriority, type WorkTaskStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { rescheduleWorkMonitoringAfterTaskChange } from './work-ai-monitoring.service.js';

const MANAGERS = new Set(['OWNER','ADMIN','MANAGER']);
const STATUSES: WorkTaskStatus[] = ['TODO','IN_PROGRESS','REVIEW','DONE'];
const PRIORITIES: WorkTaskPriority[] = ['LOW','NORMAL','HIGH','CRITICAL'];
const OPS = ['create_project','update_project','create_task','update_task','create_subtask','update_subtask'] as const;
type Operation = typeof OPS[number];
const FIELDS:Record<Operation,readonly string[]>={
  create_project:['op','projectKey','name','description'],
  update_project:['op','projectId','name','description'],
  create_task:['op','projectId','projectKey','taskKey','title','description','dueAt','priority','status','assigneeMemberId'],
  update_task:['op','taskId','title','description','dueAt','clearDueAt','priority','status','assigneeMemberId'],
  create_subtask:['op','taskId','taskKey','title','description','dueAt'],
  update_subtask:['op','subtaskId','title','description','dueAt','clearDueAt','isDone']
};
export type WorkChangeAction = {
  op: Operation; projectId?: string; projectKey?: string; taskId?: string; taskKey?: string;
  subtaskId?: string; name?: string; title?: string; description?: string;
  dueAt?: string; clearDueAt?: boolean; priority?: WorkTaskPriority; status?: WorkTaskStatus;
  assigneeMemberId?: string; isDone?: boolean;
};
type PlannedAction = WorkChangeAction & { baseline?: string; summary: string; details: string[] };
type Actor = { id:string; role:string };
const text = (value:unknown, max=240) => typeof value==='string' ? value.trim().slice(0,max+1) : '';
const key = (value:unknown) => typeof value==='string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value) ? value : '';
const defined = (v:unknown) => v!==undefined && v!==null;
const fail = (reason:string):never => { throw new Error(reason); };
const date = (value:unknown):Date => {
  if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/i.test(value))return fail('Срок должен содержать дату, время и часовой пояс');
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))return fail('Некорректная дата');
  return parsed;
};
const labelDate = (value:string) => new Date(value).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'});
const summary = (a:WorkChangeAction,displayTitle='') => {
  const name=a.name||a.title||displayTitle||'Объект';
  return ({
    create_project:'Новый проект', update_project:'Изменение проекта',
    create_task:'Новое поручение', update_task:'Изменение поручения',
    create_subtask:'Новая подзадача', update_subtask:'Изменение подзадачи'
  })[a.op]+': '+name;
};
const details = (a:WorkChangeAction):string[] => [
  ...(a.description?['Описание: '+a.description.slice(0,350)]:[]),
  ...(a.dueAt?['Срок: '+labelDate(a.dueAt)]:[]),
  ...(a.clearDueAt?['Удалить срок']:[]),
  ...(a.status?['Статус: '+({TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Выполнена'}[a.status])]:[]),
  ...(a.priority?['Приоритет: '+({LOW:'Низкий',NORMAL:'Обычный',HIGH:'Высокий',CRITICAL:'Критический'}[a.priority])]:[]),
  ...(a.assigneeMemberId?['Исполнитель: участник '+a.assigneeMemberId]:[]),
  ...(defined(a.isDone)?[a.isDone?'Отметить выполненной':'Возобновить']:[])
];

export const workChangesTool = {
  type:'function', name:'prepare_work_changes', strict:false,
  description:'Подготовь список корпоративных изменений, НИЧЕГО не выполняя. Изменения применяются только после нажатия человеком «Принять». Используй только реальные ID из контекста. Когда пользователь просит создать проект с поручениями, дай create_project с projectKey, затем create_task с тем же projectKey; для подзадач используй taskKey от create_task. Для изменения существующего проекта/поручения укажи их настоящие ID. Не угадывай идентификаторы, даты, сотрудников и сроки. Если данных недостаточно, задай вопрос обычным ответом. Для сотрудников допускаются только update_task (поле status) и update_subtask (поле isDone) в собственных поручениях. Не вызывай инструмент для информационных запросов.',
  parameters:{
    type:'object',additionalProperties:false,required:['actions'],
    properties:{actions:{type:'array',items:{
      type:'object',additionalProperties:false,required:['op'],
      properties:{
        op:{type:'string',enum:OPS},projectId:{type:'string'},projectKey:{type:'string'},
        taskId:{type:'string'},taskKey:{type:'string'},subtaskId:{type:'string'},
        name:{type:'string'},title:{type:'string'},description:{type:'string'},
        dueAt:{type:'string'},clearDueAt:{type:'boolean'},
        priority:{type:'string',enum:PRIORITIES},status:{type:'string',enum:STATUSES},
        assigneeMemberId:{type:'string'},isDone:{type:'boolean'}
      }
    }}}
  }
};

export function parseWorkChanges(input:unknown):WorkChangeAction[] {
  const actions=(input as {actions?:unknown})?.actions;
  if(!Array.isArray(actions)||actions.length<1||actions.length>12)throw new Error('Допустимо от 1 до 12 изменений за запрос');
  return actions.map((raw:unknown)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('Некорректная операция');
    const a=raw as Record<string,unknown>;
    if(!OPS.includes(a.op as Operation))return fail('Недопустимое действие');
    if(Object.entries(a).some(([field,value])=>defined(value)&&!FIELDS[a.op as Operation].includes(field)))return fail('Лишние поля в операции '+String(a.op));
    const out:WorkChangeAction={op:a.op as Operation};
    for(const field of ['projectId','projectKey','taskId','taskKey','subtaskId','name','title','description','dueAt','priority','status','assigneeMemberId'] as const){
      if(defined(a[field])) {
        if(typeof a[field]!=='string')return fail('Некорректный параметр '+field);
        (out as unknown as Record<string,unknown>)[field]=a[field];
      }
    }
    if(defined(a.clearDueAt)){if(typeof a.clearDueAt!=='boolean')return fail('Некорректный флаг срока');out.clearDueAt=a.clearDueAt;}
    if(defined(a.isDone)){if(typeof a.isDone!=='boolean')return fail('Некорректный статус подзадачи');out.isDone=a.isDone;}
    for(const f of ['projectId','taskId','subtaskId','assigneeMemberId'] as const){
      if(out[f]&&out[f]!.length>128)return fail('Слишком длинный идентификатор');
    }
    if(out.projectKey&&!key(out.projectKey))return fail('Некорректная ссылка на новый проект');
    if(out.taskKey&&!key(out.taskKey))return fail('Некорректная ссылка на новое поручение');
    if(out.name&& (text(out.name,120).length<2||out.name.length>120))return fail('Название проекта: 2–120 символов');
    if(out.title&&(text(out.title,240).length<2||out.title.length>240))return fail('Название: 2–240 символов');
    if(out.description&&out.description.length>20000)return fail('Слишком длинное описание');
    if(out.dueAt)date(out.dueAt);
    if(out.dueAt&&out.clearDueAt)return fail('Нельзя одновременно задать и удалить срок');
    if(out.priority&&!PRIORITIES.includes(out.priority))return fail('Недопустимый приоритет');
    if(out.status&&!STATUSES.includes(out.status))return fail('Недопустимый статус');
    return out;
  });
}
function allowed(a:WorkChangeAction,actor:Actor){
  if(MANAGERS.has(actor.role))return;
  if(actor.role!=='MEMBER')fail('Недостаточно прав');
  if(a.op==='update_task'&&a.status&&!a.title&&!defined(a.description)&&!a.dueAt&&!a.clearDueAt&&!a.priority&&!a.assigneeMemberId)return;
  if(a.op==='update_subtask'&&defined(a.isDone)&&!a.title&&!defined(a.description)&&!a.dueAt&&!a.clearDueAt)return;
  fail('Сотруднику разрешено менять только статус своего поручения и выполнение подзадачи');
}
async function projectRow(tx:typeof prisma,organizationId:string,id:string){
  const row=await tx.organizationProject.findFirst({where:{id,organizationId}});
  if(!row)fail('Проект больше недоступен');
  return row!;
}
async function taskRow(tx:typeof prisma,organizationId:string,id:string){
  const row=await tx.organizationWorkTask.findFirst({where:{id,project:{organizationId}},
    include:{project:{select:{isArchived:true}}}});
  if(!row)fail('Поручение больше недоступно');
  return row!;
}
async function subtaskRow(tx:typeof prisma,organizationId:string,id:string){
  const row=await tx.organizationWorkSubtask.findFirst({where:{id,task:{project:{organizationId}}},
    include:{task:{select:{assignedMemberId:true,createdByMemberId:true,project:{select:{isArchived:true}}}}}});
  if(!row)fail('Подзадача больше недоступна');
  return row!;
}
export async function planWorkChanges(organizationId:string,actor:Actor,input:unknown):Promise<PlannedAction[]> {
  const actions=parseWorkChanges(input);
  const projectKeys=new Set<string>(),taskKeys=new Set<string>(),updated=new Set<string>();
  const projectNames=new Map<string,string>(),taskNames=new Map<string,string>();
  const planned:PlannedAction[]=[];
  for(const a of actions){
    allowed(a,actor);
    let baseline:string|undefined;
    let displayTitle='',parentTitle='';
    if(a.op==='create_project'){
      if(!a.name||!key(a.projectKey)||projectKeys.has(a.projectKey!))fail('Новый проект должен иметь название и уникальный projectKey');
      projectKeys.add(a.projectKey!);projectNames.set(a.projectKey!,a.name);
    } else if(a.op==='update_project'){
      if(!a.projectId||(!a.name&&!defined(a.description)))fail('Укажите проект и изменения');
      const p=await projectRow(prisma,organizationId,a.projectId);
      if(updated.has('p:'+p.id))fail('Один проект изменяется лишь один раз в чипе');
      updated.add('p:'+p.id);baseline=p.updatedAt.toISOString();displayTitle=p.name;
    } else if(a.op==='create_task'){
      if(!a.title||!key(a.taskKey)||taskKeys.has(a.taskKey!))fail('Для нового поручения нужны название и уникальный taskKey');
      if(Boolean(a.projectId)===Boolean(a.projectKey))fail('Укажите существующий projectId или projectKey нового проекта');
      if(a.projectKey&&!projectKeys.has(a.projectKey))fail('Сначала создайте указанный проект');
      if(a.projectKey)parentTitle=projectNames.get(a.projectKey)||'';
      if(a.projectId){const p=await projectRow(prisma,organizationId,a.projectId);if(p.isArchived)fail('Проект архивирован');baseline=p.updatedAt.toISOString();parentTitle=p.name;}
      taskKeys.add(a.taskKey!);taskNames.set(a.taskKey!,a.title);
    } else if(a.op==='update_task'){
      if(!a.taskId||![Boolean(a.title),defined(a.description),Boolean(a.dueAt),Boolean(a.priority),Boolean(a.status),Boolean(a.assigneeMemberId),Boolean(a.clearDueAt)].some(Boolean))fail('Укажите поручение и изменение');
      const t=await taskRow(prisma,organizationId,a.taskId);
      if(t.project.isArchived)fail('Проект архивирован');
      if(!MANAGERS.has(actor.role)&&t.assignedMemberId!==actor.id&&t.createdByMemberId!==actor.id)fail('Поручение не принадлежит сотруднику');
      if(updated.has('t:'+t.id))fail('Одно поручение изменяется лишь один раз в чипе');
      updated.add('t:'+t.id);baseline=t.updatedAt.toISOString();displayTitle=t.title;
    } else if(a.op==='create_subtask'){
      if(!a.title||Boolean(a.taskId)===Boolean(a.taskKey))fail('Для подзадачи нужны название и taskId либо taskKey');
      if(a.taskKey&&!taskKeys.has(a.taskKey))fail('Сначала создайте указанное поручение');
      if(a.taskKey)parentTitle=taskNames.get(a.taskKey)||'';
      if(a.taskId){
        const t=await taskRow(prisma,organizationId,a.taskId);
        if(t.project.isArchived)fail('Проект архивирован');
        if(!MANAGERS.has(actor.role)&&t.assignedMemberId!==actor.id&&t.createdByMemberId!==actor.id)fail('Нет прав на поручение');
        baseline=t.updatedAt.toISOString();parentTitle=t.title;
      }
    } else if(a.op==='update_subtask'){
      if(!a.subtaskId||![Boolean(a.title),defined(a.description),Boolean(a.dueAt),Boolean(a.clearDueAt),defined(a.isDone)].some(Boolean))fail('Укажите подзадачу и изменение');
      const t=await subtaskRow(prisma,organizationId,a.subtaskId);
      if(t.task.project.isArchived)fail('Проект архивирован');
      if(!MANAGERS.has(actor.role)&&t.task.assignedMemberId!==actor.id&&t.task.createdByMemberId!==actor.id)fail('Нет прав на поручение');
      if(updated.has('s:'+t.id))fail('Одна подзадача изменяется лишь раз');
      updated.add('s:'+t.id);baseline=t.updatedAt.toISOString();displayTitle=t.title;
    }
    let assigneeName:string|undefined;
    if(a.assigneeMemberId){
      const member=await prisma.organizationMember.findFirst({where:{id:a.assigneeMemberId,organizationId},
        select:{id:true,user:{select:{name:true,username:true}}}});
      if(!member)fail('Исполнитель должен состоять в компании');
      assigneeName=member.user.name||member.user.username||'Сотрудник';
    }
    const descriptions=details(a).filter(d=>!d.startsWith('Исполнитель: участник '));
    if(parentTitle)descriptions.unshift((a.op==='create_task'?'Проект: ':'В поручении: ')+parentTitle);
    if(assigneeName)descriptions.push('Исполнитель: '+assigneeName);
    planned.push({...a,baseline,summary:summary(a,displayTitle),details:descriptions});
  }
  return planned;
}
const same = (actual:Date,expected?:string) => !expected||actual.toISOString()===expected;
const duePatch=(a:WorkChangeAction):{dueAt?:Date|null} =>
  a.clearDueAt?{dueAt:null}:a.dueAt?{dueAt:date(a.dueAt)}:{};
const titlePatch=(a:WorkChangeAction)=>a.title?{title:a.title.trim()}:{};
const descriptionPatch=(a:WorkChangeAction)=>defined(a.description)?{description:a.description}:{};
const ensureActive=(archived:boolean)=>{if(archived)fail('Проект перемещён в архив');};

export async function applyWorkChangeProposal(organizationId:string,actor:Actor,proposalId:string){
  const changedTaskIds:string[]=[];
  try{
    const result=await prisma.$transaction(async tx=>{
      const member=await tx.organizationMember.findFirst({where:{id:actor.id,organizationId},select:{id:true,role:true}});
      if(!member)fail('Членство в компании прекращено');
      const row=await tx.organizationAiChangeProposal.findFirst({where:{id:proposalId,organizationId,actorMemberId:actor.id}});
      if(!row)fail('Предложение не найдено');
      if(row.status!=='PENDING')return row;
      const claim=await tx.organizationAiChangeProposal.updateMany({where:{id:row.id,status:'PENDING'},data:{status:'APPLYING'}});
      if(!claim.count)fail('Предложение уже обрабатывается');
      const actions=row.operations as unknown as PlannedAction[];
      const projects=new Map<string,string>(), tasks=new Map<string,string>(),createdIds:string[]=[];
      const touchedProjects=new Set<string>(),touchedTasks=new Set<string>();
      for(const a of actions){
        allowed(a,member);
        if(a.assigneeMemberId&&!await tx.organizationMember.findFirst({where:{id:a.assigneeMemberId,organizationId}}))fail('Исполнитель больше не состоит в компании');
        if(a.op==='create_project'){
          const p=await tx.organizationProject.create({data:{organizationId,name:a.name!.trim(),description:a.description||null,createdByMemberId:member.id}});
          projects.set(a.projectKey!,p.id);createdIds.push(p.id);
        }
        if(a.op==='update_project'){
          const p=await tx.organizationProject.findFirst({where:{id:a.projectId!,organizationId}});
          if(!p||!same(p.updatedAt,a.baseline))fail('Проект изменён после подготовки чипа');
          await tx.organizationProject.update({where:{id:p.id},data:{...(a.name?{name:a.name.trim()}:{}),...descriptionPatch(a)}});
          touchedProjects.add(p.id);
        }
        if(a.op==='create_task'){
          const projectId=a.projectId||projects.get(a.projectKey!);
          if(!projectId)fail('Проект не найден');
          const p=await tx.organizationProject.findFirst({where:{id:projectId,organizationId}});
          if(!p||(!touchedProjects.has(p.id)&&!same(p.updatedAt,a.baseline)))fail('Проект изменился после подготовки чипа');
          ensureActive(p.isArchived);
          const t=await tx.organizationWorkTask.create({data:{
            projectId:p.id,title:a.title!.trim(),description:a.description||null,
            priority:a.priority||'NORMAL',status:a.status||'TODO',
            dueAt:a.dueAt?date(a.dueAt):null,assignedMemberId:a.assigneeMemberId||null,createdByMemberId:member.id
          }});
          tasks.set(a.taskKey!,t.id);createdIds.push(t.id);
        }
        if(a.op==='update_task'){
          const t=await tx.organizationWorkTask.findFirst({where:{id:a.taskId!,project:{organizationId}},
            include:{project:{select:{isArchived:true}}}});
          if(!t||(!touchedTasks.has(t.id)&&!same(t.updatedAt,a.baseline)))fail('Поручение изменилось после подготовки чипа');
          ensureActive(t.project.isArchived);
          if(!MANAGERS.has(member.role)&&t.assignedMemberId!==member.id&&t.createdByMemberId!==member.id)fail('Доступ к поручению изменился');
          await tx.organizationWorkTask.update({where:{id:t.id},data:{
            ...titlePatch(a),...descriptionPatch(a),...duePatch(a),
            ...(a.priority?{priority:a.priority}:{}),...(a.status?{status:a.status}:{}),
            ...(a.assigneeMemberId?{assignedMemberId:a.assigneeMemberId}:{})
          }});
          touchedTasks.add(t.id);
          if(a.status||a.dueAt||a.clearDueAt)changedTaskIds.push(t.id);
        }
        if(a.op==='create_subtask'){
          const taskId=a.taskId||tasks.get(a.taskKey!);
          if(!taskId)fail('Поручение не найдено');
          const t=await tx.organizationWorkTask.findFirst({where:{id:taskId,project:{organizationId}},
            include:{project:{select:{isArchived:true}}}});
          if(!t||!same(t.updatedAt,a.baseline))fail('Поручение изменилось после подготовки чипа');
          ensureActive(t.project.isArchived);
          if(!MANAGERS.has(member.role)&&t.assignedMemberId!==member.id&&t.createdByMemberId!==member.id)fail('Нет прав на поручение');
          const count=await tx.organizationWorkSubtask.count({where:{taskId:t.id}});
          if(count>=250)fail('Достигнут лимит 250 подзадач');
          const sub=await tx.organizationWorkSubtask.create({data:{
            taskId:t.id,title:a.title!.trim(),description:a.description||null,
            dueAt:a.dueAt?date(a.dueAt):null,sortOrder:count,createdByMemberId:member.id
          }});createdIds.push(sub.id);
        }
        if(a.op==='update_subtask'){
          const s=await tx.organizationWorkSubtask.findFirst({where:{id:a.subtaskId!,task:{project:{organizationId}}},
            include:{task:{select:{assignedMemberId:true,createdByMemberId:true,project:{select:{isArchived:true}}}}}});
          if(!s||!same(s.updatedAt,a.baseline))fail('Подзадача изменилась после подготовки чипа');
          ensureActive(s.task.project.isArchived);
          if(!MANAGERS.has(member.role)){
            if(s.task.assignedMemberId!==member.id&&s.task.createdByMemberId!==member.id)fail('Нет прав на поручение');
          }
          await tx.organizationWorkSubtask.update({where:{id:s.id},data:{
            ...titlePatch(a),...descriptionPatch(a),...duePatch(a),
            ...(defined(a.isDone)?{isDone:a.isDone}:{})
          }});
        }
      }
      return tx.organizationAiChangeProposal.update({where:{id:row.id},data:{
        status:'APPLIED',error:null,result:{createdIds,applied:actions.length}
      }});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:20000});
    if(result.status==='APPLIED'){
      for(const id of [...new Set(changedTaskIds)]){
        try{await rescheduleWorkMonitoringAfterTaskChange(organizationId,id);}
        catch(error){console.error('[Work AI changes] monitoring reschedule failed',{taskId:id,error});}
      }
    }
    return proposalView(result,actor.id);
  }catch(error){
    const message=error instanceof Error?error.message:'Данные изменились, повторите запрос';
    await prisma.organizationAiChangeProposal.updateMany({where:{id:proposalId,organizationId,actorMemberId:actor.id,status:'PENDING'},
      data:{status:'CONFLICT',error:message.slice(0,300)}}).catch(()=>undefined);
    const row=await prisma.organizationAiChangeProposal.findFirst({where:{id:proposalId,organizationId,actorMemberId:actor.id}});
    if(!row)throw error;
    return proposalView(row,actor.id);
  }
}
export function proposalView(row:{
  id:string;status:string;actorMemberId:string;operations:Prisma.JsonValue;result:Prisma.JsonValue|null;error:string|null;createdAt:Date
},viewerId:string){
  const actions=row.operations as unknown as PlannedAction[];
  return {id:row.id,status:row.status,canConfirm:row.actorMemberId===viewerId,
    operations:actions.map(a=>({type:a.op,title:a.summary,details:a.details})),
    result:row.result,error:row.error,createdAt:row.createdAt};
}
export async function rejectWorkChangeProposal(organizationId:string,actor:Actor,proposalId:string){
  await prisma.organizationAiChangeProposal.updateMany({
    where:{id:proposalId,organizationId,actorMemberId:actor.id,status:'PENDING'},data:{status:'REJECTED'}
  });
  const row=await prisma.organizationAiChangeProposal.findFirst({where:{id:proposalId,organizationId,actorMemberId:actor.id}});
  if(!row)fail('Предложение не найдено');
  return proposalView(row!,actor.id);
}
export async function getWorkChangeProposal(organizationId:string,actor:Actor,proposalId:string){
  const row=await prisma.organizationAiChangeProposal.findFirst({where:{id:proposalId,organizationId,actorMemberId:actor.id}});
  if(!row)fail('Предложение не найдено');
  return proposalView(row!,actor.id);
}
