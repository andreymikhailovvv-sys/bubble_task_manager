import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { authorizeWorkAi, askCompanyAi, workAiHistory, MAX_WORK_AI_QUESTION } from '../services/work-ai-assistant.service.js';
import { getCompanyCreditSnapshot, CompanyInsufficientCreditsError } from '../services/work-ai-wallet.service.js';
import { configureWorkTaskMonitoring, createWorkFollowup } from '../services/work-ai-monitoring.service.js';
import { applyWorkChangeProposal, getWorkChangeProposal, rejectWorkChangeProposal } from '../services/work-ai-actions.service.js';

export const workAiRouter=Router();
workAiRouter.use(requireAuth,(_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
const admin=(role:string)=>role==='OWNER'||role==='ADMIN';
const manager=(role:string)=>admin(role)||role==='MANAGER';
async function check(req:any,res:any){
  const id=req.params.organizationId;
  const member=await authorizeWorkAi(req.user.id,id);
  if(!member){res.status(404).json({error:'Организация не найдена'});return null;}
  return member;
}
async function scopedTask(req:any,res:any,member:{id:string;role:string}){
  if(!req.params.taskId)return null;
  const task=await prisma.organizationWorkTask.findFirst({
    where:{id:req.params.taskId,project:{organizationId:req.params.organizationId}},
    select:{id:true,assignedMemberId:true,createdByMemberId:true,aiMonitoringEnabled:true,status:true}
  });
  if(!task){res.status(404).json({error:'Задача не найдена'});return null;}
  if(member.role==='VIEWER'||(!manager(member.role)&&task.assignedMemberId!==member.id&&task.createdByMemberId!==member.id)){
    res.status(403).json({error:'Нет доступа к ИИ этой задачи'});return null;
  }
  return task;
}
workAiRouter.get('/:organizationId/ai/balance',asyncHandler(async(req,res)=>{
  if(!await check(req,res))return;
  res.json({credits:await getCompanyCreditSnapshot(req.params.organizationId)});
}));
workAiRouter.patch('/:organizationId/ai/model',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!admin(member.role)){res.status(403).json({error:'Изменять модель может администратор компании'});return;}
  const value=req.body?.model;
  if(!['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol'].includes(value)){
    res.status(400).json({error:'Неизвестная модель'});return;
  }
  await prisma.organization.update({where:{id:req.params.organizationId},data:{aiModel:value}});
  res.json({model:value});
}));
// Quick requests have a private thread per member. Never expose the
// company-wide dispatcher or unrelated project tasks to ordinary employees.
workAiRouter.get('/:organizationId/ai/quick/history',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(member.role==='VIEWER'){res.status(403).json({error:'Только чтение'});return;}
  res.json({messages:await workAiHistory(req.params.organizationId,null,member.id,member.id)});
}));
workAiRouter.post('/:organizationId/ai/quick/chat',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(member.role==='VIEWER'){res.status(403).json({error:'Только чтение'});return;}
  if(typeof req.body?.question!=='string'||!req.body.question.trim()||
    req.body.question.length>MAX_WORK_AI_QUESTION){
    res.status(400).json({error:'Некорректный вопрос'});return;
  }
  try{
    res.json(await askCompanyAi({organizationId:req.params.organizationId,
      userId:req.user!.id,question:req.body.question,feature:'quick_chat'}));
  }catch(error){
    if(error instanceof CompanyInsufficientCreditsError){res.status(402).json({error:error.message});return;}
    throw error;
  }
}));
workAiRouter.get('/:organizationId/ai/history',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!manager(member.role)){res.status(403).json({error:'Доступ к диспетчеру ограничен'});return;}
  res.json({messages:await workAiHistory(req.params.organizationId,null,null,member.id)});
}));
workAiRouter.post('/:organizationId/ai/chat',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!manager(member.role)){res.status(403).json({error:'Доступ к диспетчеру ограничен'});return;}
  if(typeof req.body?.question!=='string'||!req.body.question.trim()||
     req.body.question.length>MAX_WORK_AI_QUESTION){res.status(400).json({error:'Некорректный вопрос'});return;}
  try{
    const answer=await askCompanyAi({organizationId:req.params.organizationId,userId:req.user!.id,
      question:req.body.question,feature:'company_chat'});
    res.json(answer);
  }catch(error){
    if(error instanceof CompanyInsufficientCreditsError){res.status(402).json({error:error.message});return;}
    throw error;
  }
}));
// Human participant messages bypass provider usage and company wallet.
// Recipient must be the task creator or the current assignee, not an
// arbitrary organization member.
workAiRouter.post('/:organizationId/ai/tasks/:taskId/human-messages',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  const task=await scopedTask(req,res,member);if(!task)return;
  const recipientId=req.body?.recipientMemberId;
  const content=req.body?.content;
  if(typeof content!=='string'||!content.trim()||content.length>4000){
    res.status(400).json({error:'Сообщение должно содержать 1–4000 символов'});return;
  }
  if(typeof recipientId!=='string'||recipientId===member.id){
    res.status(400).json({error:'Выберите другого участника'});return;
  }
  const recipient=await prisma.organizationMember.findFirst({
    where:{id:recipientId,organizationId:req.params.organizationId},
    select:{id:true,role:true}
  });
  if(!recipient){res.status(404).json({error:'Получатель не найден в организации'});return;}
  // A task participant can write to the company owner/leadership even when
  // the manager was not recorded as this legacy task's creator.
  if(!manager(recipient.role)&&![task.assignedMemberId,task.createdByMemberId].includes(recipient.id)){
    res.status(403).json({error:'Получатель не является участником задачи или руководителем'});return;
  }
  const message=await prisma.organizationAiMessage.create({
    data:{
      organizationId:req.params.organizationId,
      taskId:task.id,role:'human',senderMemberId:member.id,
      recipientMemberId:recipient.id,content:content.trim()
    },
    include:{
      sender:{select:{role:true,user:{select:{name:true,username:true}}}},
      recipient:{select:{user:{select:{name:true,username:true}}}}
    }
  });
  res.status(201).json({message});
}));
workAiRouter.get('/:organizationId/ai/tasks/:taskId/history',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!await scopedTask(req,res,member))return;
  res.json({messages:await workAiHistory(req.params.organizationId,req.params.taskId,null,member.id)});
}));
workAiRouter.post('/:organizationId/ai/tasks/:taskId/chat',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!await scopedTask(req,res,member))return;
  if(typeof req.body?.question!=='string'||!req.body.question.trim()||
     req.body.question.length>MAX_WORK_AI_QUESTION){res.status(400).json({error:'Некорректный вопрос'});return;}
  try{
    res.json(await askCompanyAi({organizationId:req.params.organizationId,userId:req.user!.id,
      taskId:req.params.taskId,question:req.body.question,feature:'task_chat'}));
  }catch(error){
    if(error instanceof CompanyInsufficientCreditsError){res.status(402).json({error:error.message});return;}
    throw error;
  }
}));
workAiRouter.get('/:organizationId/ai/tasks/:taskId/monitoring',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  const task=await scopedTask(req,res,member);if(!task)return;
  const jobs=await prisma.organizationAiMonitoringJob.findMany({where:{
    organizationId:req.params.organizationId,taskId:task.id
  },orderBy:{createdAt:'desc'},take:80,
    select:{id:true,dueAt:true,instruction:true,state:true,createdAt:true}});
  res.json({enabled:task.aiMonitoringEnabled,jobs});
}));
workAiRouter.patch('/:organizationId/ai/tasks/:taskId/monitoring',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!manager(member.role)){res.status(403).json({error:'Недостаточно прав'});return;}
  if(!await scopedTask(req,res,member))return;
  if(typeof req.body?.enabled!=='boolean'){res.status(400).json({error:'Нужен enabled: true/false'});return;}
  res.json(await configureWorkTaskMonitoring(req.params.organizationId,req.params.taskId,req.body.enabled));
}));
workAiRouter.post('/:organizationId/ai/tasks/:taskId/triggers',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!manager(member.role)){res.status(403).json({error:'Недостаточно прав'});return;}
  if(!await scopedTask(req,res,member))return;
  const instruction=req.body?.instruction;
  const raw=req.body?.dueAt;
  const dueAt=typeof raw==='string'?new Date(raw):new Date(NaN);
  if(typeof instruction!=='string'||instruction.trim().length<5||instruction.length>700||
     !Number.isFinite(dueAt.getTime())||dueAt.getTime()<=Date.now()||
     dueAt.getTime()>Date.now()+90*86400000){
    res.status(400).json({error:'Укажите инструкцию и время проверки в пределах 90 дней'});return;
  }
  const existing=await prisma.organizationAiMonitoringJob.count({where:{
    organizationId:req.params.organizationId,taskId:req.params.taskId,state:'PENDING',eventKey:{startsWith:'work:trigger:'}
  }});
  if(existing>=5){res.status(409).json({error:'Не больше пяти активных триггеров у задачи'});return;}
  res.status(201).json({job:await createWorkFollowup(req.params.organizationId,req.params.taskId,dueAt,instruction.trim())});
}));
workAiRouter.delete('/:organizationId/ai/tasks/:taskId/triggers/:jobId',asyncHandler(async(req,res)=>{
  const member=await check(req,res);if(!member)return;
  if(!manager(member.role)){res.status(403).json({error:'Недостаточно прав'});return;}
  if(!await scopedTask(req,res,member))return;
  const updated=await prisma.organizationAiMonitoringJob.updateMany({where:{
    id:req.params.jobId,organizationId:req.params.organizationId,taskId:req.params.taskId,
    eventKey:{startsWith:'work:trigger:'},state:'PENDING'
  },data:{state:'CANCELLED'}});
  if(!updated.count){res.status(404).json({error:'Активный триггер не найден'});return;}
  res.json({ok:true});
}));

/* Explicit approval is required for every Work AI mutation. The member is
   resolved from the authenticated session, never from request body fields. */
async function ownProposal(req:any,res:any){
  const member=await check(req,res);
  if(!member)return null;
  const proposal=await prisma.organizationAiChangeProposal.findFirst({
    where:{id:req.params.proposalId,organizationId:req.params.organizationId,actorMemberId:member.id},
    select:{id:true}
  });
  if(!proposal){res.status(404).json({error:'Предложение не найдено'});return null;}
  return member;
}
workAiRouter.get('/:organizationId/ai/proposals/:proposalId',asyncHandler(async(req,res)=>{
  const member=await ownProposal(req,res);if(!member)return;
  res.json({proposal:await getWorkChangeProposal(req.params.organizationId,member,req.params.proposalId)});
}));
workAiRouter.post('/:organizationId/ai/proposals/:proposalId/approve',asyncHandler(async(req,res)=>{
  const member=await ownProposal(req,res);if(!member)return;
  res.json({proposal:await applyWorkChangeProposal(req.params.organizationId,member,req.params.proposalId)});
}));
workAiRouter.post('/:organizationId/ai/proposals/:proposalId/reject',asyncHandler(async(req,res)=>{
  const member=await ownProposal(req,res);if(!member)return;
  res.json({proposal:await rejectWorkChangeProposal(req.params.organizationId,member,req.params.proposalId)});
}));
