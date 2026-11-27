import { prisma } from '../db/prisma.js';
import { featureAccessError, getSubscriptionRank } from './subscription-access.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
type Context = {kind:'telegram';policyId:string}|{kind:'mail';mailboxId:string};
const textFields = ['summaryInstructions','suggestWhen','suggestHow','autoReplyWhen','autoReplyHow','taskCreationWhen'] as const;
type Field = typeof textFields[number] | 'replyMode';
type Change = {field:Field;before:string;after:string};
const select = {summaryInstructions:true,suggestWhen:true,suggestHow:true,autoReplyWhen:true,autoReplyHow:true,taskCreationWhen:true} as const;
const fields = [...textFields,'replyMode'] as const;
export const READ_ASSISTANT_SETTINGS_TOOL = {type:'function',name:'read_assistant_settings',strict:true,description:'Прочитать действующие постоянные инструкции только текущего ассистента.',parameters:{type:'object',properties:{},required:[],additionalProperties:false}} as const;
export const PROPOSE_ASSISTANT_SETTINGS_TOOL = {type:'function',name:'propose_assistant_settings',strict:true,description:'Подготовить изменения постоянных правил текущего ассистента для подтверждения владельцем. null оставляет поле неизменным; для дополнения передай весь старый текст с дополнением. Не отправляет сообщения и не меняет настройки без подтверждения.',parameters:{type:'object',additionalProperties:false,required:fields,properties:{
summaryInstructions:{type:['string','null'],description:'Правила сводок'},suggestWhen:{type:['string','null'],description:'Когда предлагать ответ'},suggestHow:{type:['string','null'],description:'Как предлагать ответ'},autoReplyWhen:{type:['string','null'],description:'Когда отвечать автоматически'},autoReplyHow:{type:['string','null'],description:'Как отвечать автоматически'},taskCreationWhen:{type:['string','null'],description:'Когда создавать задачи'},replyMode:{type:['string','null'],enum:['OBSERVE','SUGGEST','AUTO',null],description:'Менять только по явной просьбе владельца'}}}} as const;
async function target(userId:string,context:Context) {
  if (context.kind==='telegram') {
    const row=await prisma.telegramAiChatPolicy.findFirst({where:{id:context.policyId,userId,isEnabled:true},select:{...select,id:true,chatTitle:true,mode:true,monitorRevision:true}});
    if(!row)return null;
    const {id,chatTitle,mode,monitorRevision,...rules}=row;
    return {id,label:chatTitle,revision:monitorRevision,settings:{...rules,replyMode:mode}};
  }
  const row=await prisma.emailMailbox.findFirst({where:{id:context.mailboxId,userId,enabled:true},select:{...select,id:true,email:true,replyMode:true,revision:true}});
  if(!row)return null;
  const {id,email,revision,...settings}=row;
  return {id,label:email,revision,settings};
}
export async function readAssistantSettings(userId:string,context:Context) {
  const row=await target(userId,context);
  return row?{ok:true,settings:row.settings}:{ok:false,code:'ASSISTANT_UNAVAILABLE'};
}
export function buildAssistantChanges(settings:Record<Field,string>,input:unknown):Change[] {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некорректные настройки');
  const args=input as Record<string,unknown>;
  const changes:Change[]=[];
  for(const field of fields){
    const value=args[field];
    if(value===null||value===undefined)continue;
    if(typeof value!=='string'||value.length>2000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw Error('Недопустимая инструкция');
    if(field==='replyMode'&&!['OBSERVE','SUGGEST','AUTO'].includes(value))throw Error('Недопустимый режим');
    const after=value.trim();
    if(after!==settings[field])changes.push({field,before:settings[field],after});
  }
  return changes;
}
export async function prepareAssistantSettings(userId:string,context:Context,input:unknown) {
  const row=await target(userId,context);
  if(!row)return {ok:false as const,code:'ASSISTANT_UNAVAILABLE'};
  let changes:Change[];
  try{changes=buildAssistantChanges(row.settings,input)}catch(e){return {ok:false as const,code:'INVALID_SETTINGS',message:(e as Error).message}}
  if(!changes.length)return {ok:false as const,code:'NO_CHANGES'};
  const proposal=await prisma.assistantSettingsProposal.create({data:{userId,kind:context.kind,targetId:row.id,targetLabel:row.label,revision:row.revision,changes}});
  return {ok:true as const,id:proposal.id,changes,confirmationRequired:true};
}
function view(p:{id:string;kind:string;targetLabel:string;status:string;changes:unknown}) {
  return {id:p.id,kind:p.kind,targetLabel:p.targetLabel,status:p.status,changes:p.changes};
}
export async function getAssistantSettingsProposal(userId:string,id:string) {
  const row=await prisma.assistantSettingsProposal.findFirst({where:{id,userId}});
  return row?view(row):null;
}
export async function applyAssistantSettingsProposal(userId:string,id:string) {
  const row=await prisma.assistantSettingsProposal.findFirst({where:{id,userId}});
  if(!row)return null;
  if(row.status!=='PENDING')return view(row);
  const kind=row.kind==='telegram'?'telegram':'mail';
  const denied=featureAccessError(await getSubscriptionRank(userId),kind);
  if(denied)throw Error(denied.message);
  const changes=row.changes as Change[];
  const patch:Partial<Record<Field,string>>={};
  for(const c of changes){if(fields.includes(c.field))patch[c.field]=c.after}
  if(kind==='telegram'){
    const cap=await telegramUserChatCapability(userId);
    if(!cap.connected||!cap.readEnabled||(patch.replyMode==='AUTO'&&!cap.sendEnabled))throw Error('Недоступны разрешения Telegram');
  }
  const {replyMode,...rules}=patch;
  return prisma.$transaction(async tx=>{
    const claimed=await tx.assistantSettingsProposal.updateMany({where:{id,userId,status:'PENDING'},data:{status:'APPLYING'}});
    if(!claimed.count)return view(await tx.assistantSettingsProposal.findUniqueOrThrow({where:{id}}));
    const now=new Date();
    const updated=kind==='telegram'
      ? await tx.telegramAiChatPolicy.updateMany({where:{id:row.targetId,userId,isEnabled:true,monitorRevision:row.revision},data:{...rules,...(replyMode?{mode:replyMode,nextInteractionAt:replyMode==='OBSERVE'?null:now}:{}),monitorRevision:{increment:1},leaseToken:null,leasedUntil:null,nextCheckAt:now}})
      : await tx.emailMailbox.updateMany({where:{id:row.targetId,userId,enabled:true,revision:row.revision},data:{...rules,...(replyMode?{replyMode}:{}),revision:{increment:1},leaseToken:null,leasedUntil:null,nextCheckAt:now}});
    return view(await tx.assistantSettingsProposal.update({where:{id},data:{status:updated.count?'APPLIED':'CONFLICT'}}));
  });
}
