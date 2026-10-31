import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { askCompanyAi } from './work-ai-assistant.service.js';
import { CompanyInsufficientCreditsError } from './work-ai-wallet.service.js';

const MAX_BATCH=3;
let processing=false;
export const workDeadlineEventKey=(taskId:string,revision:number)=>'work:deadline:'+taskId+':'+revision;
export async function configureWorkTaskMonitoring(organizationId:string,taskId:string,enabled:boolean){
  return prisma.$transaction(async tx=>{
    const task=await tx.organizationWorkTask.findFirst({where:{id:taskId,project:{organizationId}},
      select:{id:true,dueAt:true,status:true,aiMonitoringRevision:true}});
    if(!task)throw new Error('Задача не найдена');
    const revision=task.aiMonitoringRevision+1;
    await tx.organizationWorkTask.update({where:{id:taskId},data:{aiMonitoringEnabled:enabled,aiMonitoringRevision:revision}});
    await tx.organizationAiMonitoringJob.updateMany({where:{taskId,state:'PENDING'},data:{state:'CANCELLED'}});
    if(enabled&&task.dueAt&&task.status!=='DONE'){
      await tx.organizationAiMonitoringJob.create({data:{
        organizationId,taskId,eventKey:workDeadlineEventKey(taskId,revision),
        dueAt:task.dueAt,instruction:'Проверь просроченную корпоративную задачу и предложи один следующий шаг.'
      }});
    }
    return {enabled,revision};
  });
}
export async function rescheduleWorkMonitoringAfterTaskChange(organizationId:string,taskId:string){
  return prisma.$transaction(async tx=>{
    const task=await tx.organizationWorkTask.findFirst({where:{id:taskId,project:{organizationId}},
      select:{dueAt:true,status:true,aiMonitoringEnabled:true,aiMonitoringRevision:true}});
    if(!task||!task.aiMonitoringEnabled)return;
    const revision=task.aiMonitoringRevision+1;
    await tx.organizationWorkTask.update({where:{id:taskId},data:{aiMonitoringRevision:revision}});
    await tx.organizationAiMonitoringJob.updateMany({where:{taskId,state:'PENDING'},data:{state:'CANCELLED'}});
    if(task.dueAt&&task.status!=='DONE')await tx.organizationAiMonitoringJob.create({data:{
      taskId,organizationId,dueAt:task.dueAt,eventKey:workDeadlineEventKey(taskId,revision),
      instruction:'Проверь корпоративную задачу после наступления её срока и предложи следующие шаги.'
    }});
  });
}
export async function createWorkFollowup(organizationId:string,taskId:string,dueAt:Date,instruction:string){
  const active=await prisma.organizationWorkTask.findFirst({where:{
    id:taskId,project:{organizationId},aiMonitoringEnabled:true,status:{not:'DONE'}
  },select:{id:true}});
  if(!active)throw new Error('Автомониторинг задачи не включён');
  return prisma.organizationAiMonitoringJob.create({data:{
    organizationId,taskId,eventKey:'work:trigger:'+crypto.randomUUID(),dueAt,instruction
  },select:{id:true,dueAt:true,instruction:true,state:true}});
}
export async function pollCorporateMonitoring(now=new Date()){
  if(processing)return;
  processing=true;
  try {
    const due=await prisma.organizationAiMonitoringJob.findMany({
      where:{state:'PENDING',dueAt:{lte:now}},orderBy:{dueAt:'asc'},take:MAX_BATCH
    });
    for(const job of due){
      const lock=await prisma.organizationAiMonitoringJob.updateMany({
        where:{id:job.id,state:'PENDING'},data:{state:'PROCESSING'}
      });
      if(!lock.count)continue;
      const active=await prisma.organizationWorkTask.findFirst({where:{
        id:job.taskId,project:{organizationId:job.organizationId},aiMonitoringEnabled:true,status:{not:'DONE'}
      },select:{id:true,aiMonitoringRevision:true}});
      const isDeadline=job.eventKey.startsWith('work:deadline:');
      if(!active||(isDeadline&&job.eventKey!==workDeadlineEventKey(job.taskId,active.aiMonitoringRevision))){
        await prisma.organizationAiMonitoringJob.update({where:{id:job.id},data:{state:'CANCELLED'}});
        continue;
      }
      try {
        await askCompanyAi({organizationId:job.organizationId,taskId:job.taskId,
          feature:'task_monitoring',question:job.instruction});
        await prisma.organizationAiMonitoringJob.update({where:{id:job.id},data:{state:'DONE'}});
      }catch(error){
        // No silent retry: the provider may have billed before a connection broke.
        const noCredits=error instanceof CompanyInsufficientCreditsError;
        await prisma.organizationAiMonitoringJob.update({where:{id:job.id},data:{state:noCredits?'NO_CREDITS':'FAILED'}});
        console.error('[Work Monitoring] failed',{jobId:job.id,message:error instanceof Error?error.message:'unknown'});
      }
    }
  }finally{processing=false;}
}
export async function recoverCorporateMonitoring(){
  // Never automatically retry a processing job after restart: at-most-once
  // AI billing is safer than duplicate external calls.
  await prisma.organizationAiMonitoringJob.updateMany({where:{
    state:'PROCESSING',updatedAt:{lt:new Date(Date.now()-20*60_000)}
  },data:{state:'FAILED'}});
  await pollCorporateMonitoring();
}
