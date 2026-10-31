import { Router, type Request, type Response } from 'express';
import { Prisma, type WorkTaskPriority, type WorkTaskStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { canManageOrganization } from '../lib/work-company-roles.js';
import { rescheduleWorkMonitoringAfterTaskChange } from '../services/work-ai-monitoring.service.js';

export const workProjectsRouter = Router();
workProjectsRouter.use(requireAuth);
workProjectsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
const validName = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= max
   && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const validDescription = (value: unknown) =>
  value === null || (typeof value === 'string' && value.length <= 20000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
const priorities: WorkTaskPriority[] = ['LOW','NORMAL','HIGH','CRITICAL'];
const statuses: WorkTaskStatus[] = ['TODO','IN_PROGRESS','REVIEW','DONE'];
const parseDueAt = (value: unknown): Date | null | undefined => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
type Member = { id: string; role: 'OWNER'|'ADMIN'|'MANAGER'|'MEMBER'|'VIEWER' };
async function memberFor(req: Request, res: Response): Promise<Member|null> {
  const organizationId = req.params.organizationId;
  if (!organizationId || organizationId.length > 128) { res.status(404).json({error:'Организация не найдена'});return null; }
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: req.user!.id } },
    select: { id: true, role: true }
  });
  if (!member) res.status(404).json({error:'Организация не найдена'});
  return member;
}
async function managerFor(req:Request,res:Response) {
  const member = await memberFor(req,res);
  if (!member) return null;
  if (!canManageOrganization(member.role) && member.role !== 'MANAGER') {
    res.status(403).json({error:'Для действия нужны права руководителя'});return null;
  }
  return member;
}
async function projectFor(req:Request,res:Response) {
  const project = await prisma.organizationProject.findFirst({
    where: { id:req.params.projectId, organizationId:req.params.organizationId },
    select: { id:true, name:true, description:true, isArchived:true, createdAt:true, updatedAt:true }
  });
  if (!project) res.status(404).json({error:'Проект не найден'});
  return project;
}
async function assignable(req:Request, res:Response, value:unknown) {
  if (value===null) return { valid:true, memberId:null };
  if (typeof value!=='string' || value.length>128 || !value) {
    res.status(400).json({error:'Некорректный исполнитель'});return { valid:false, memberId:null };
  }
  const member = await prisma.organizationMember.findFirst({
    where:{id:value,organizationId:req.params.organizationId},select:{id:true}
  });
  if (!member) {res.status(400).json({error:'Исполнитель не состоит в компании'});return {valid:false,memberId:null};}
  return {valid:true,memberId:member.id};
}
const rejectConflicts = (error:unknown,res:Response) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2003') {
    res.status(409).json({error:'Связанная запись была изменена. Повторите операцию'});return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2025') {
    res.status(404).json({error:'Запись не найдена'});return true;
  }
  return false;
};
workProjectsRouter.use((req,res,next)=>{
  if (['POST','PATCH'].includes(req.method) && !req.is('application/json')) {
    res.status(415).json({error:'Нужен Content-Type: application/json'});return;
  }
  next();
});

// Role-specific overview: manager views company-wide tasks; employees only tasks
// in which they are an assignee or the creator. Project and task IDs never leak
// from another organization.
workProjectsRouter.get('/:organizationId/dashboard',asyncHandler(async(req,res)=>{
  const member=await memberFor(req,res);
  if(!member)return;
  const organizationId=req.params.organizationId;
  const management=canManageOrganization(member.role)||member.role==='MANAGER';
  const accessFilter=management?{}:{OR:[{assignedMemberId:member.id},{createdByMemberId:member.id}]};
  const [projects,taskRows,taskCount,overdueCount,openCount]=await Promise.all([
    prisma.organizationProject.findMany({
      where:{organizationId,isArchived:false,...(management?{}:{OR:[
        {createdByMemberId:member.id},{tasks:{some:{assignedMemberId:member.id}}},
        {tasks:{some:{createdByMemberId:member.id}}}
      ]})},
      select:{id:true,name:true,description:true,isArchived:true,createdAt:true,
        _count:{select:{tasks:management?true:{where:accessFilter}}}},
      orderBy:{createdAt:'desc'},take:100
    }),
    prisma.organizationWorkTask.findMany({
      where:{project:{organizationId,isArchived:false},...accessFilter},
      select:{id:true,title:true,description:true,status:true,priority:true,dueAt:true,
        assignedMemberId:true,createdByMemberId:true,projectId:true,updatedAt:true,
        project:{select:{id:true,name:true}},
        assignee:{select:{user:{select:{name:true,username:true}}}} },
      orderBy:[{dueAt:'asc'},{createdAt:'desc'}],take:200
    }),
    prisma.organizationWorkTask.count({where:{project:{organizationId,isArchived:false},...accessFilter}}),
    prisma.organizationWorkTask.count({where:{project:{organizationId,isArchived:false},...accessFilter,
      status:{not:'DONE'},dueAt:{lt:new Date()}}}),
    prisma.organizationWorkTask.count({where:{project:{organizationId,isArchived:false},...accessFilter,
      status:{not:'DONE'}}})
  ]);
  res.json({role:member.role,memberId:member.id,
    projects:projects.map(({_count,...project})=>({...project,taskCount:_count.tasks})),
    tasks:taskRows,stats:{projects:projects.length,tasks:taskCount,open:openCount,overdue:overdueCount},
    hasMoreTasks:taskCount>taskRows.length});
}));

workProjectsRouter.get('/:organizationId/projects',asyncHandler(async(req,res)=>{
  const member=await memberFor(req,res);
  if (!member) return;
  const managerAccess=canManageOrganization(member.role)||member.role==='MANAGER';
  const rows=await prisma.organizationProject.findMany({
    where:{organizationId:req.params.organizationId,...(managerAccess?{}:{OR:[{tasks:{some:{assignedMemberId:member.id}}},{tasks:{some:{createdByMemberId:member.id}}},{createdByMemberId:member.id}]})},
    select:{id:true,name:true,description:true,isArchived:true,createdAt:true,updatedAt:true,
      _count:{select:{tasks:managerAccess?true:{where:{OR:[{assignedMemberId:member.id},{createdByMemberId:member.id}]}}}}},
    orderBy:{createdAt:'desc'},take:201
  });
  res.json({projects:rows.slice(0,200).map(({_count,...project})=>({...project,taskCount:_count.tasks})),
    hasMore:rows.length>200});
}));

workProjectsRouter.post('/:organizationId/projects',asyncHandler(async(req,res)=>{
  const actor=await managerFor(req,res);
  if (!actor) return;
  const name=validName(req.body?.name,120);
  if (!name || (req.body?.description!==undefined&&!validDescription(req.body.description))) {
    res.status(400).json({error:'Название: 2–120 символов; описание: до 20 000 символов'});return;
  }
  const project=await prisma.organizationProject.create({
    data:{organizationId:req.params.organizationId,name,description:req.body.description??null,createdByMemberId:actor.id},
    select:{id:true,name:true,description:true,isArchived:true,createdAt:true,updatedAt:true}
  });
  res.status(201).json({project:{...project,taskCount:0}});
}));

workProjectsRouter.patch('/:organizationId/projects/:projectId',asyncHandler(async(req,res)=>{
  if (!await managerFor(req,res)) return;
  if (!await projectFor(req,res)) return;
  const data:{name?:string;description?:string|null;isArchived?:boolean}={};
  if (Object.prototype.hasOwnProperty.call(req.body||{},'name')) {
    const name=validName(req.body.name,120);
    if (!name) {res.status(400).json({error:'Название проекта: 2–120 символов'});return;}
    data.name=name;
  }
  if (Object.prototype.hasOwnProperty.call(req.body||{},'description')) {
    if (!validDescription(req.body.description)) {res.status(400).json({error:'Описание слишком длинное'});return;}
    data.description=req.body.description;
  }
  if (Object.prototype.hasOwnProperty.call(req.body||{},'isArchived')) {
    if (typeof req.body.isArchived!=='boolean') {res.status(400).json({error:'Некорректный признак архива'});return;}
    data.isArchived=req.body.isArchived;
  }
  if (!Object.keys(data).length) {res.status(400).json({error:'Нет изменений'});return;}
  const updated=await prisma.organizationProject.updateMany({
    where:{id:req.params.projectId,organizationId:req.params.organizationId},data
  });
  if (!updated.count) {res.status(404).json({error:'Проект не найден'});return;}
  const project=await projectFor(req,res);
  if (project) res.json({project});
}));

workProjectsRouter.get('/:organizationId/projects/:projectId/tasks',asyncHandler(async(req,res)=>{
  const actor=await memberFor(req,res);
  if (!actor) return;
  if (!await projectFor(req,res)) return;
  const fullAccess=canManageOrganization(actor.role)||actor.role==='MANAGER';
  const tasks=await prisma.organizationWorkTask.findMany({
    where:{projectId:req.params.projectId,project:{organizationId:req.params.organizationId},...(fullAccess?{}:{OR:[{assignedMemberId:actor.id},{createdByMemberId:actor.id}]})},
    select:{id:true,projectId:true,title:true,description:true,status:true,priority:true,
      dueAt:true,assignedMemberId:true,createdByMemberId:true,createdAt:true,updatedAt:true},
    orderBy:{createdAt:'asc'},take:501
  });
  res.json({tasks:tasks.slice(0,500),hasMore:tasks.length>500});
}));

workProjectsRouter.post('/:organizationId/projects/:projectId/tasks',asyncHandler(async(req,res)=>{
  const actor=await managerFor(req,res);
  if (!actor) return;
  const project=await projectFor(req,res);
  if (!project) return;
  if (project.isArchived) {res.status(409).json({error:'Архивный проект нельзя изменять'});return;}
  const title=validName(req.body?.title,240);
  const priority:WorkTaskPriority=req.body?.priority??'NORMAL';
  const status:WorkTaskStatus=req.body?.status??'TODO';
  const dueAt=parseDueAt(req.body?.dueAt??null);
  if (!title || !priorities.includes(priority)||!statuses.includes(status)||dueAt===undefined ||
      (req.body?.description!==undefined&&!validDescription(req.body.description))) {
    res.status(400).json({error:'Некорректные данные задачи'});return;
  }
  const assigned=await assignable(req,res,req.body?.assignedMemberId??null);
  if (!assigned.valid) return;
  try{
    const task=await prisma.organizationWorkTask.create({
      data:{projectId:project.id,title,description:req.body?.description??null,
        priority,status,dueAt,assignedMemberId:assigned.memberId,createdByMemberId:actor.id}
    });
    res.status(201).json({task});
  }catch(error){if(!rejectConflicts(error,res))throw error;}
}));

workProjectsRouter.patch('/:organizationId/projects/:projectId/tasks/:taskId',asyncHandler(async(req,res)=>{
  const member=await memberFor(req,res);
  if (!member) return;
  const project=await projectFor(req,res);
  if (!project) return;
  if (project.isArchived) {res.status(409).json({error:'Архивный проект нельзя изменять'});return;}
  const manager=canManageOrganization(member.role)||member.role==='MANAGER';
  const task=await prisma.organizationWorkTask.findFirst({
    where:{id:req.params.taskId,projectId:project.id,project:{organizationId:req.params.organizationId}},
    select:{id:true,assignedMemberId:true,createdByMemberId:true}
  });
  if (!task){res.status(404).json({error:'Задача не найдена'});return;}
  const changes=req.body||{};
  const keys=Object.keys(changes);
  if (!keys.length || keys.some(key=>!['title','description','status','priority','dueAt','assignedMemberId'].includes(key))) {
    res.status(400).json({error:'Некорректный набор изменений'});return;
  }
  if (!manager && (member.role!=='MEMBER'||(task.assignedMemberId!==member.id&&task.createdByMemberId!==member.id)||keys.some(key=>key!=='status'))) {
    res.status(403).json({error:'Можно менять только статус назначенной вам задачи'});return;
  }
  const data:{title?:string;description?:string|null;status?:WorkTaskStatus;priority?:WorkTaskPriority;
    dueAt?:Date|null;assignedMemberId?:string|null}={};
  if (keys.includes('title')) {
    const title=validName(changes.title,240);
    if (!title){res.status(400).json({error:'Название задачи: 2–240 символов'});return;}
    data.title=title;
  }
  if (keys.includes('description')) {
    if (!validDescription(changes.description)){res.status(400).json({error:'Некорректное описание'});return;}
    data.description=changes.description;
  }
  if (keys.includes('status')) {
    if (!statuses.includes(changes.status)){res.status(400).json({error:'Некорректный статус'});return;}
    data.status=changes.status;
  }
  if (keys.includes('priority')){
    if (!priorities.includes(changes.priority)){res.status(400).json({error:'Некорректный приоритет'});return;}
    data.priority=changes.priority;
  }
  if (keys.includes('dueAt')){
    const dueAt=parseDueAt(changes.dueAt);
    if (dueAt===undefined){res.status(400).json({error:'Некорректный срок'});return;}
    data.dueAt=dueAt;
  }
  if (keys.includes('assignedMemberId')){
    const assigned=await assignable(req,res,changes.assignedMemberId);
    if (!assigned.valid)return;
    data.assignedMemberId=assigned.memberId;
  }
  try{
    const changed=await prisma.organizationWorkTask.updateMany({
      where:{id:task.id,projectId:project.id,...(!manager?{OR:[{assignedMemberId:member.id},{createdByMemberId:member.id}]}:{})},
      data
    });
    if(!changed.count){res.status(409).json({error:'Назначение изменилось. Обновите задачи'});return;}
    if(keys.includes('dueAt')||keys.includes('status'))
      await rescheduleWorkMonitoringAfterTaskChange(req.params.organizationId,task.id);
    const result=await prisma.organizationWorkTask.findUnique({where:{id:task.id}});
    res.json({task:result});
  }catch(error){if(!rejectConflicts(error,res))throw error;}
}));

workProjectsRouter.delete('/:organizationId/projects/:projectId/tasks/:taskId',asyncHandler(async(req,res)=>{
  if (!await managerFor(req,res))return;
  const project=await projectFor(req,res);
  if (!project)return;
  if (project.isArchived){res.status(409).json({error:'Архивный проект нельзя изменять'});return;}
  const deleted=await prisma.organizationWorkTask.deleteMany({
    where:{id:req.params.taskId,projectId:project.id,project:{organizationId:req.params.organizationId}}
  });
  if(!deleted.count){res.status(404).json({error:'Задача не найдена'});return;}
  res.json({ok:true});
}));

/* Company subtasks use the same parent task/checkbox semantics as personal
   subtasks, but never access the personal Task table. */
async function subtaskAccess(req:Request,res:Response,write=false){
  const member=await memberFor(req,res);
  if(!member)return null;
  const manager=canManageOrganization(member.role)||member.role==='MANAGER';
  const task=await prisma.organizationWorkTask.findFirst({
    where:{id:req.params.taskId,projectId:req.params.projectId,
      project:{organizationId:req.params.organizationId}},
    select:{id:true,assignedMemberId:true,createdByMemberId:true,
      project:{select:{isArchived:true}}}
  });
  if(!task){res.status(404).json({error:'Задача не найдена'});return null;}
  const participant=task.assignedMemberId===member.id||task.createdByMemberId===member.id;
  if(!manager&&!participant){res.status(403).json({error:'Нет доступа к поручению'});return null;}
  if(write&&(task.project.isArchived||(!manager&&member.role!=='MEMBER'))){
    res.status(403).json({error:'Нет прав изменения подзадач'});return null;
  }
  return {member,task,manager};
}
workProjectsRouter.get('/:organizationId/projects/:projectId/tasks/:taskId/subtasks',asyncHandler(async(req,res)=>{
  if(!await subtaskAccess(req,res))return;
  const rows=await prisma.organizationWorkSubtask.findMany({
    where:{taskId:req.params.taskId},
    orderBy:[{sortOrder:'asc'},{createdAt:'asc'}],
    select:{id:true,taskId:true,title:true,isDone:true,dueAt:true,
      sortOrder:true,createdByMemberId:true,createdAt:true,updatedAt:true},
    take:251
  });
  res.json({subtasks:rows.slice(0,250),hasMore:rows.length>250});
}));
workProjectsRouter.post('/:organizationId/projects/:projectId/tasks/:taskId/subtasks',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res,true);if(!access)return;
  const title=validName(req.body?.title,240),dueAt=parseDueAt(req.body?.dueAt??null);
  if(!title||dueAt===undefined){res.status(400).json({error:'Название: 2–240 символов, срок должен быть корректным'});return;}
  const count=await prisma.organizationWorkSubtask.count({where:{taskId:access.task.id}});
  if(count>=250){res.status(409).json({error:'Лимит 250 подзадач'});return;}
  const subtask=await prisma.organizationWorkSubtask.create({
    data:{taskId:access.task.id,title,dueAt,sortOrder:count,
      createdByMemberId:access.member.id}
  });
  res.status(201).json({subtask});
}));
workProjectsRouter.patch('/:organizationId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res,true);if(!access)return;
  const current=await prisma.organizationWorkSubtask.findFirst({
    where:{id:req.params.subtaskId,taskId:access.task.id}
  });
  if(!current){res.status(404).json({error:'Подзадача не найдена'});return;}
  const changes=req.body||{},keys=Object.keys(changes);
  if(!keys.length||keys.some(key=>!['title','dueAt','isDone'].includes(key))){
    res.status(400).json({error:'Некорректные изменения'});return;
  }
  if(!access.manager&&keys.some(key=>key!=='isDone')&&current.createdByMemberId!==access.member.id){
    res.status(403).json({error:'Сотрудник может изменять название и срок только созданной им подзадачи'});return;
  }
  const data:{title?:string;dueAt?:Date|null;isDone?:boolean}={};
  if(keys.includes('title')){
    const title=validName(changes.title,240);
    if(!title){res.status(400).json({error:'Название: 2–240 символов'});return;}
    data.title=title;
  }
  if(keys.includes('dueAt')){
    const dueAt=parseDueAt(changes.dueAt);
    if(dueAt===undefined){res.status(400).json({error:'Некорректный срок'});return;}
    data.dueAt=dueAt;
  }
  if(keys.includes('isDone')){
    if(typeof changes.isDone!=='boolean'){res.status(400).json({error:'isDone должен быть boolean'});return;}
    data.isDone=changes.isDone;
  }
  const changed=await prisma.organizationWorkSubtask.updateMany({
    where:{id:current.id,taskId:access.task.id,
      ...(!access.manager&&keys.some(key=>key!=='isDone')?{createdByMemberId:access.member.id}:{})},
    data
  });
  if(!changed.count){res.status(409).json({error:'Доступ к подзадаче изменился'});return;}
  res.json({subtask:await prisma.organizationWorkSubtask.findUniqueOrThrow({where:{id:current.id}})});
}));
workProjectsRouter.delete('/:organizationId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res,true);if(!access)return;
  const count=await prisma.organizationWorkSubtask.deleteMany({
    where:{id:req.params.subtaskId,taskId:access.task.id,
      ...(!access.manager?{createdByMemberId:access.member.id}:{})}
  });
  if(!count.count){res.status(404).json({error:'Подзадача не найдена либо нет прав на удаление'});return;}
  res.json({ok:true});
}));

/* Work collaboration: participants can discuss subtasks. Author identity is
 * taken from authenticated membership, never from a client-supplied ID. */
workProjectsRouter.get('/:organizationId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/comments',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res);if(!access)return;
  const subtask=await prisma.organizationWorkSubtask.findFirst({
    where:{id:req.params.subtaskId,taskId:access.task.id},select:{id:true}
  });
  if(!subtask){res.status(404).json({error:'Подзадача не найдена'});return;}
  const rows=await prisma.organizationWorkSubtaskComment.findMany({
    where:{subtaskId:subtask.id},orderBy:{createdAt:'asc'},take:201,
    select:{id:true,content:true,authorMemberId:true,parentCommentId:true,createdAt:true,
      author:{select:{role:true,user:{select:{name:true,username:true}}}}}
  });
  res.json({comments:rows.slice(0,200),hasMore:rows.length>200});
}));
workProjectsRouter.post('/:organizationId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/comments',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res,true);if(!access)return;
  const content=req.body?.content;
  if(typeof content!=='string'||!content.trim()||content.length>4000){
    res.status(400).json({error:'Комментарий должен содержать 1–4000 символов'});return;
  }
  const subtask=await prisma.organizationWorkSubtask.findFirst({
    where:{id:req.params.subtaskId,taskId:access.task.id},select:{id:true}
  });
  if(!subtask){res.status(404).json({error:'Подзадача не найдена'});return;}
  const parentId=req.body?.parentCommentId??null;
  if(parentId!==null){
    if(typeof parentId!=='string'||parentId.length>128||!await prisma.organizationWorkSubtaskComment.findFirst({
      where:{id:parentId,subtaskId:subtask.id},select:{id:true}
    })){res.status(400).json({error:'Ответ должен ссылаться на комментарий этой подзадачи'});return;}
  }
  const comment=await prisma.organizationWorkSubtaskComment.create({
    data:{subtaskId:subtask.id,authorMemberId:access.member.id,
      content:content.trim(),parentCommentId:parentId},
    select:{id:true,content:true,authorMemberId:true,parentCommentId:true,createdAt:true,
      author:{select:{role:true,user:{select:{name:true,username:true}}}}}
  });
  res.status(201).json({comment});
}));
workProjectsRouter.delete('/:organizationId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId/comments/:commentId',asyncHandler(async(req,res)=>{
  const access=await subtaskAccess(req,res,true);if(!access)return;
  const deleted=await prisma.organizationWorkSubtaskComment.deleteMany({
    where:{id:req.params.commentId,subtaskId:req.params.subtaskId,
      subtask:{taskId:access.task.id},
      ...(!access.manager?{authorMemberId:access.member.id}:{})}
  });
  if(!deleted.count){res.status(404).json({error:'Комментарий не найден либо нет прав'});return;}
  res.json({ok:true});
}));
