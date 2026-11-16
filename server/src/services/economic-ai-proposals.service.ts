import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { debtOperationKind, debtOperationTitle, type EconomicDebtDirection } from '../lib/economic-debt.js';
import { canonicalEconomicAction, EconomicActionError, type EconomicAction, type EconomicEntity } from './economic-ai-action-validation.service.js';

type Tx = Prisma.TransactionClient;
type Snapshot = Record<string,string|number|boolean|null>;
function no(message:string,status=409):never { throw new EconomicActionError(message,status); }
const iso=(d:Date|null)=>d?.toISOString()??null;
const snapshot = (entity:EconomicEntity,row:any):Snapshot => {
  if(entity==='account')return {id:row.id,name:row.name,openingBalanceMinor:row.openingBalanceMinor.toString(),updatedAt:iso(row.updatedAt)};
  if(entity==='operation')return {id:row.id,kind:row.kind,amountMinor:row.amountMinor.toString(),
    sourceAccountId:row.sourceAccountId,targetAccountId:row.targetAccountId,category:row.category,
    title:row.title,note:row.note,occurredAt:iso(row.occurredAt),updatedAt:iso(row.updatedAt)};
  if(entity==='category')return {id:row.id,kind:row.kind,name:row.name,createdAt:iso(row.createdAt)};
  if(entity==='debt')return {id:row.id,direction:row.direction,counterparty:row.counterparty,amountMinor:row.amountMinor.toString(),
    paidMinor:row.paidMinor.toString(),note:row.note,dueAt:iso(row.dueAt),
    postedToAccount:row.postedToAccount,accountId:row.accountId,updatedAt:iso(row.updatedAt)};
  return {id:row.id,name:row.name,lender:row.lender,principalMinor:row.principalMinor.toString(),
    paidMinor:row.paidMinor.toString(),annualRateBps:row.annualRateBps,termMonths:row.termMonths,
    startDate:iso(row.startDate),monthlyPaymentOverrideMinor:row.monthlyPaymentOverrideMinor?.toString()??null,
    paymentDate:iso(row.paymentDate),remindersEnabled:row.remindersEnabled,
    isClosed:row.isClosed,updatedAt:iso(row.updatedAt)};
};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const owned=async(tx:Tx,owner:string,ids:string[])=>{
  const unique=[...new Set(ids)];
  if(unique.length!==ids.length)no('Счета операции должны различаться.');
  const rows=await tx.economicAccount.findMany({where:{userId:owner,id:{in:unique}},select:{id:true,currency:true}});
  if(rows.length!==unique.length||rows.some(x=>x.currency!=='RUB'))no('Счёт не найден или не принадлежит пользователю.');
};
export async function readEconomicEntity(tx:Tx,owner:string,entity:EconomicEntity,id:string):Promise<Snapshot|null>{
  if(entity==='account'){const row=await tx.economicAccount.findFirst({where:{id,userId:owner}});return row?snapshot(entity,row):null;}
  if(entity==='operation'){const row=await tx.economicOperation.findFirst({where:{id,userId:owner}});
    if(row?.debtId)no('Связанную с долгом операцию меняйте через сам долг.');
    return row?snapshot(entity,row):null;}
  if(entity==='category'){const row=await tx.economicCategory.findFirst({where:{id,userId:owner}});return row?snapshot(entity,row):null;}
  if(entity==='debt'){const row=await tx.economicDebt.findFirst({where:{id,userId:owner}});return row?snapshot(entity,row):null;}
  const row=await tx.economicLoan.findFirst({where:{id,userId:owner}});return row?snapshot(entity,row):null;
}
const without=(data:Record<string,unknown>,keys:string[]):EconomicAction['payload'] =>
  Object.fromEntries(Object.entries(data).filter(([key])=>keys.includes(key))) as EconomicAction['payload'];
const dates=(input:unknown)=>input===null||input===undefined?null:new Date(String(input));
function checkLoan(body:Record<string,unknown>){
  const amount=BigInt(String(body.principalMinor));
  const rate=Number(body.annualRateBps)/10000/12;
  const term=Number(body.termMonths);
  const monthly=rate?Number(amount)*rate/(1-Math.pow(1+rate,-term)):Number(amount)/term;
  const total=BigInt(Math.round(monthly))*BigInt(term);
  if(BigInt(String(body.paidMinor??'0'))>(total>amount?total:amount))
    no('Сумма погашения превышает стоимость кредита.');
  if(body.remindersEnabled && !body.paymentDate)no('Для напоминаний нужна дата платежа.');
}
async function checkReminders(tx:Tx,owner:string,body:Record<string,unknown>){
  if(body.remindersEnabled && !await tx.user.count({where:{id:owner,telegramChatId:{not:null}}}))
    no('Для напоминаний подключите Telegram-бот Планировыча.');
}
const primary=async(tx:Tx,owner:string)=>{
  const row=await tx.economicAccount.findFirst({where:{userId:owner},orderBy:[{isPrimary:'desc'},{createdAt:'asc'}]});
  if(!row)no('Сначала создайте счёт.');
  return row.id;
};
async function mutateDebt(tx:Tx,owner:string,targetId:string|null,body:Record<string,unknown>):Promise<string>{
  const posted=body.postedToAccount===true;
  const account=posted ? (typeof body.accountId==='string'?body.accountId:await primary(tx,owner)) : null;
  if(account)await owned(tx,owner,[account]);
  const amountMinor=BigInt(String(body.amountMinor));
  const paidMinor=BigInt(String(body.paidMinor??'0'));
  if(paidMinor>amountMinor)no('Погашение превышает сумму долга.');
  const direction=String(body.direction) as EconomicDebtDirection;
  const counterparty=String(body.counterparty);
  const data={
    direction,counterparty,amountMinor,paidMinor,note:body.note===undefined?null:body.note as string|null,
    dueAt:dates(body.dueAt),postedToAccount:posted,accountId:account,isClosed:paidMinor===amountMinor
  };
  const debt=targetId
    ? await tx.economicDebt.update({where:{id:targetId,userId:owner},data})
    : await tx.economicDebt.create({data:{userId:owner,...data}});
  if(!account){
    await tx.economicOperation.deleteMany({where:{userId:owner,debtId:debt.id}});
    return debt.id;
  }
  const funding=await tx.economicOperation.findFirst({where:{userId:owner,debtId:debt.id,debtPhase:'FUNDING'}});
  const fundingData={sourceAccountId:account,kind:debtOperationKind(direction,'FUNDING'),amountMinor,
    title:debtOperationTitle(direction,'FUNDING',counterparty)};
  if(funding)await tx.economicOperation.update({where:{id:funding.id},data:fundingData});
  else await tx.economicOperation.create({data:{
    ...fundingData,userId:owner,debtId:debt.id,debtPhase:'FUNDING',
    category:'Долги',occurredAt:debt.createdAt
  }});
  const settlement=await tx.economicOperation.findFirst({where:{userId:owner,debtId:debt.id,debtPhase:'SETTLEMENT'}});
  if(paidMinor>0n){
    const settleData={sourceAccountId:account,kind:debtOperationKind(direction,'SETTLEMENT'),
      amountMinor:paidMinor,title:debtOperationTitle(direction,'SETTLEMENT',counterparty)};
    if(settlement)await tx.economicOperation.update({where:{id:settlement.id},data:settleData});
    else await tx.economicOperation.create({data:{
      ...settleData,userId:owner,debtId:debt.id,debtPhase:'SETTLEMENT',category:'Долги'
    }});
  }else if(settlement)await tx.economicOperation.delete({where:{id:settlement.id}});
  return debt.id;
}
async function mutate(tx:Tx,owner:string,action:EconomicAction,record:Snapshot|null):Promise<string>{
  const d={...record,...action.payload} as Record<string,unknown>;
  if(action.entity==='account'){
    if(typeof d.name!=='string'||!d.name.trim())no('Укажите название счёта.');
    const values={name:d.name as string,openingBalanceMinor:BigInt(String(d.openingBalanceMinor??'0'))};
    if(action.action==='create')return (await tx.economicAccount.create({data:{userId:owner,...values}})).id;
    await tx.economicAccount.update({where:{id:action.targetId!,userId:owner},data:values});
    return action.targetId!;
  }
  if(action.entity==='category'){
    if(!['INCOME','EXPENSE'].includes(String(d.kind))||typeof d.name!=='string')no('Некорректная категория.');
    const values={name:d.name as string,kind:String(d.kind)};
    if(action.action==='create')return (await tx.economicCategory.create({data:{userId:owner,...values}})).id;
    await tx.economicCategory.update({where:{id:action.targetId!,userId:owner},
      data:{name:values.name}});return action.targetId!;
  }
  if(action.entity==='operation'){
    if(!['INCOME','EXPENSE','TRANSFER'].includes(String(d.kind)))no('Недопустимый тип операции.');
    if(typeof d.sourceAccountId!=='string'||!d.title||!d.amountMinor)no('Укажите счёт, название и сумму.');
    const transferred=d.kind==='TRANSFER';
    const target=transferred?String(d.targetAccountId??''):null;
    if(transferred&&!target)no('Для перевода нужен счёт получателя.');
    const sourceAccountId=d.sourceAccountId as string;
    await owned(tx,owner,[sourceAccountId,...(target?[target]:[])]);
    const values={
      kind:String(d.kind),sourceAccountId,targetAccountId:target,
      amountMinor:BigInt(String(d.amountMinor)),title:String(d.title),
      note:d.note==null?null:String(d.note),category:transferred?null:d.category==null?null:String(d.category),
      occurredAt:dates(d.occurredAt)??new Date()
    };
    if(action.action==='create')return (await tx.economicOperation.create({data:{userId:owner,...values}})).id;
    await tx.economicOperation.update({where:{id:action.targetId!,userId:owner},data:values});
    return action.targetId!;
  }
  if(action.entity==='debt'){
    if(!['OWE','OWED_TO_ME'].includes(String(d.direction))||!d.counterparty||!d.amountMinor)no('Некорректный долг.');
    return mutateDebt(tx,owner,action.targetId,d);
  }
  if(!d.name||!d.startDate||!d.principalMinor||d.annualRateBps===undefined||d.termMonths===undefined)
    no('Недостаточно параметров кредита.');
  checkLoan(d);await checkReminders(tx,owner,d);
  const values={
    name:String(d.name),lender:d.lender==null?null:String(d.lender),
    principalMinor:BigInt(String(d.principalMinor)),
    paidMinor:BigInt(String(d.paidMinor??'0')),annualRateBps:Number(d.annualRateBps),
    termMonths:Number(d.termMonths),startDate:dates(d.startDate)!,
    monthlyPaymentOverrideMinor:d.monthlyPaymentOverrideMinor==null?null:BigInt(String(d.monthlyPaymentOverrideMinor)),
    paymentDate:dates(d.paymentDate),remindersEnabled:d.remindersEnabled===true,
    isClosed:d.isClosed===true
  };
  if(action.action==='create')return (await tx.economicLoan.create({data:{userId:owner,...values}})).id;
  await tx.economicLoan.update({where:{id:action.targetId!,userId:owner},data:values});
  return action.targetId!;
}
const TITLES:Record<EconomicEntity,string>={
  account:'счёта',operation:'операции',debt:'долга',loan:'кредита',category:'категории'
};
export function economicProposalView(row:{
  id:string;messageId:string|null;entity:string;action:string;targetId:string|null;
  payload:unknown;before:unknown;after:unknown;status:string;autoApplied:boolean;error:string|null;
  createdAt:Date;appliedEntityId:string|null;
}){
  const d=(row.payload&&typeof row.payload==='object'?row.payload:{}) as Record<string,unknown>;
  const old=(row.before&&typeof row.before==='object'?row.before:{}) as Record<string,unknown>;
  const name=String(d.name??d.title??d.counterparty??old.name??old.title??old.counterparty??'');
  const value=d.amountMinor??d.principalMinor??d.openingBalanceMinor??d.paidMinor;
  const amount=typeof value==='string'&&/^-?\d+$/.test(value)
    ? (Number(BigInt(value))/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽' : null;
  const description=[name,amount].filter(Boolean).join(' · ');
  const fieldNames:Record<string,string>={
    name:'Название',title:'Название',counterparty:'Контрагент',
    kind:'Тип',direction:'Направление',openingBalanceMinor:'Начальный остаток',
    amountMinor:'Сумма',principalMinor:'Сумма кредита',paidMinor:'Выплачено',
    category:'Категория',note:'Примечание',dueAt:'Срок возврата',
    annualRateBps:'Ставка (б.п.)',termMonths:'Срок (месяцев)',startDate:'Дата начала',
    occurredAt:'Дата операции',lender:'Кредитор',paymentDate:'Дата платежа',
    postedToAccount:'Проводка по счёту',remindersEnabled:'Напоминания',isClosed:'Закрыт'
  };
  const display=(key:string,value:unknown)=>{
    if(value===null)return 'не указано';
    if(typeof value==='boolean')return value?'да':'нет';
    if(key.endsWith('Minor')&&typeof value==='string'&&/^-?\d+$/.test(value))
      return (Number(BigInt(value))/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
    return String(value);
  };
  const details=Object.entries(d).filter(([k])=>fieldNames[k]).map(([key,value])=>
    (fieldNames[key]??key)+': '+
      (row.action==='update'&&old[key]!==undefined?display(key,old[key])+' → ':'')+
      display(key,value)
  ).slice(0,8);
  return {id:row.id,messageId:row.messageId,entity:row.entity,action:row.action,
    status:row.status,autoApplied:row.autoApplied,error:row.error,description,
    title:(row.action==='create'?'Создание ':'Изменение ')+(TITLES[row.entity as EconomicEntity]??'данных'),details,
    createdAt:row.createdAt.toISOString(),appliedEntityId:row.appliedEntityId};
}
export type PreparedEconomicProposal={action:EconomicAction;before:Snapshot|null};
export async function prepareEconomicProposals(owner:string,actions:EconomicAction[]):Promise<PreparedEconomicProposal[]>{
  if(actions.length>5)no('Не больше пяти действий за один запрос.');
  const result:PreparedEconomicProposal[]=[];
  for(const action of actions){
    const before=action.action==='update'?await readEconomicEntity(prisma,owner,action.entity,action.targetId!):null;
    if(action.action==='update'&&!before)no('Запись не найдена или недоступна.');
    if(action.action==='update'&&action.entity==='operation'&&!before)no('Нельзя редактировать долговую операцию.');
    result.push({action,before});
  }
  return result;
}
export async function saveEconomicProposals(tx:Tx,owner:string,messageId:string,prepared:PreparedEconomicProposal[]){
  const rows=[];
  for(const item of prepared){
    rows.push(await tx.economicAiProposal.create({
      data:{
        userId:owner,messageId,entity:item.action.entity,action:item.action.action,
        targetId:item.action.targetId,payload:item.action.payload as Prisma.InputJsonValue,
        ...(item.before?{before:item.before as Prisma.InputJsonValue}:{})
      }
    }));
  }
  return rows.map(economicProposalView);
}
export async function listEconomicProposalViews(owner:string,messageId:string){
  const rows=await prisma.economicAiProposal.findMany({
    where:{userId:owner,messageId},orderBy:{createdAt:'asc'}
  });
  return rows.map(economicProposalView);
}
export async function getEconomicProposalView(owner:string,id:string){
  const row=await prisma.economicAiProposal.findFirst({where:{userId:owner,id}});
  if(!row)no('Предложение не найдено.',404);
  return economicProposalView(row);
}
export async function applyEconomicProposal(owner:string,id:string,auto=false){
  return prisma.$transaction(async tx=>{
    const row=await tx.economicAiProposal.findFirst({where:{id,userId:owner}});
    if(!row)no('Предложение не найдено.',404);
    if(row.status!=='PENDING')return economicProposalView(row);
    const claim=await tx.economicAiProposal.updateMany({
      where:{id,userId:owner,status:'PENDING'},data:{status:'APPLYING'}
    });
    if(claim.count!==1)no('Предложение уже обрабатывается.');
    const action=canonicalEconomicAction({
      entity:row.entity,action:row.action,targetId:row.targetId,payload:row.payload
    });
    const before=action.action==='update'
      ? await readEconomicEntity(tx,owner,action.entity,action.targetId!):null;
    if(action.action==='update'&&(!before||!same(before,row.before)))
      no('Данные изменились после предложения. Обновите запрос, чтобы избежать перезаписи.');
    const entityId=await mutate(tx,owner,action,before);
    const after=await readEconomicEntity(tx,owner,action.entity,entityId);
    if(!after)no('Не удалось проверить результат применения.');
    const updated=await tx.economicAiProposal.update({
      where:{id},data:{status:'APPLIED',before:before as Prisma.InputJsonValue ?? Prisma.JsonNull,
        after:after as Prisma.InputJsonValue,appliedEntityId:entityId,
        autoApplied:auto,appliedAt:new Date(),error:null}
    });
    return economicProposalView(updated);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
export async function rejectEconomicProposal(owner:string,id:string){
  const row=await prisma.economicAiProposal.findFirst({where:{id,userId:owner}});
  if(!row)no('Предложение не найдено.',404);
  if(row.status==='PENDING'){
    await prisma.economicAiProposal.updateMany({where:{id,userId:owner,status:'PENDING'},data:{status:'REJECTED'}});
  }
  return getEconomicProposalView(owner,id);
}
export async function undoEconomicProposal(owner:string,id:string){
  return prisma.$transaction(async tx=>{
    const row=await tx.economicAiProposal.findFirst({where:{id,userId:owner}});
    if(!row)no('Предложение не найдено.',404);
    if(row.status!=='APPLIED')return economicProposalView(row);
    const claim=await tx.economicAiProposal.updateMany({
      where:{id,userId:owner,status:'APPLIED'},data:{status:'UNDOING'}
    });
    if(claim.count!==1)no('Предложение уже обрабатывается.');
    const action=canonicalEconomicAction({
      entity:row.entity,action:row.action,targetId:row.targetId,payload:row.payload
    });
    const entityId=row.appliedEntityId;
    if(!entityId)no('Нельзя восстановить запись: нет ID результата.');
    const current=await readEconomicEntity(tx,owner,action.entity,entityId);
    if(!current||!same(current,row.after))
      no('Запись уже изменена после действия ИИ. Отмена перезаписала бы новые изменения.');
    if(action.action==='create'){
      if(action.entity==='account'){
        const operations=await tx.economicOperation.count({where:{userId:owner,OR:[{sourceAccountId:entityId},{targetAccountId:entityId}]}});
        const debts=await tx.economicDebt.count({where:{userId:owner,accountId:entityId}});
        if(operations||debts)no('Счёт уже используется. Удаление отменено.');
        await tx.economicAccount.delete({where:{id:entityId,userId:owner,isPrimary:false}});
      }else if(action.entity==='operation')
        await tx.economicOperation.delete({where:{id:entityId,userId:owner,debtId:null}});
      else if(action.entity==='debt')
        await tx.economicDebt.delete({where:{id:entityId,userId:owner}});
      else if(action.entity==='loan')
        await tx.economicLoan.delete({where:{id:entityId,userId:owner}});
      else await tx.economicCategory.delete({where:{id:entityId,userId:owner}});
    }else{
      if(!row.before||typeof row.before!=='object'||Array.isArray(row.before))
        no('Нет предыдущей версии записи для отмены.');
      const before=row.before as Record<string,unknown>;
      const revertFields:Record<EconomicEntity,string[]>={
        account:['name','openingBalanceMinor'],
        operation:['kind','amountMinor','sourceAccountId','targetAccountId','category','title','note','occurredAt'],
        debt:['direction','counterparty','amountMinor','paidMinor','note','dueAt','postedToAccount','accountId'],
        loan:['name','lender','principalMinor','paidMinor','annualRateBps','termMonths',
          'startDate','monthlyPaymentOverrideMinor','paymentDate','remindersEnabled','isClosed'],
        category:['name']
      };
      await mutate(tx,owner,{entity:action.entity,action:'update',targetId:entityId,
        payload:without(before,revertFields[action.entity]) as EconomicAction['payload']},current);
    }
    const updated=await tx.economicAiProposal.update({
      where:{id},data:{status:'UNDONE',undoneAt:new Date(),error:null}
    });
    return economicProposalView(updated);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
