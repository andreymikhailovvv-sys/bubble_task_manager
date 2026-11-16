import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { canonicalEconomicAction, EconomicActionError, type EconomicAction, type EconomicEntity } from './economic-ai-action-validation.service.js';
import { findEconomicRecords, type SearchedEconomicRecord } from './economic-ai-record-search.service.js';
import { applyEconomicProposal, economicProposalView, prepareEconomicProposals, type PreparedEconomicProposal } from './economic-ai-proposals.service.js';

export const GENERAL_ECONOMIC_TOOLS = [
  { type:'function',name:'get_economic_overview',strict:true,
    description:'Прочитать финансовый обзор пользователя: счета, какой счёт основной, идентификаторы счетов, расходы, доходы, категории, долги, кредиты и последние операции. Используй перед финансовым изменением, особенно если нужно определить основной или названный счёт.',
    parameters:{type:'object',properties:{},required:[],additionalProperties:false}},
  { type:'function',name:'find_economic_records',strict:true,
    description:'Найти более старую финансовую запись пользователя для редактирования. Не придумывай идентификатор. Только чтение.',
    parameters:{type:'object',properties:{
      entity:{type:'string',enum:['account','operation','debt','loan','category']},
      query:{type:'string',description:'Часть названия записи или контрагента (2-100 символов)'}
    },required:['entity','query'],additionalProperties:false}},
  { type:'function',name:'propose_economic_changes',strict:true,
    description:'Подготовить оранжевые карточки финансовых изменений, НЕ выполнять запись напрямую. Используй при просьбе создать или изменить операции/расходы/доходы, счета, долги, кредиты и категории; а также при присланном чеке или скриншоте с покупкой даже БЕЗ текста. Прежде прочитай get_economic_overview. Не записывай по фото, если сумма или факт покупки неясны. Максимум 5 действий.',
    parameters:{type:'object',properties:{
      actions_json:{type:'string',description:'JSON-массив из 1-5 объектов {entity:"operation"|"account"|"debt"|"loan"|"category",action:"create"|"update",targetId:null для создания либо проверенный id, payload:{...}}. Денежные суммы указывай СТРОКОЙ В КОПЕЙКАХ, например 950 ₽ = "95000". Для операции create поля kind (EXPENSE|INCOME|TRANSFER), title, amountMinor. sourceAccountId можно ОПУСТИТЬ: сервер подставит ОСНОВНОЙ счёт. Если пользователь назвал счёт, передай sourceAccountName с точным названием для безопасного разрешения; targetAccountName для переводов. Для категории kind и name; счёта name,openingBalanceMinor; долга direction,counterparty,amountMinor,paidMinor,postedToAccount; кредита name,principalMinor,annualRateBps,termMonths,startDate. Для редактирования укажи targetId, полученный из поиска.'}
    },required:['actions_json'],additionalProperties:false}}
] as const;
type ReadVersion = {updatedAt?:string;createdAt?:string;kind?:string;name?:string};
export class GeneralFinanceSession {
  private observed=new Map<string,ReadVersion>();
  private prepared:PreparedEconomicProposal[]=[];
  constructor(private readonly owner:string){}
  hasActions(){return this.prepared.length>0;}
  async overview(){
    const [accounts,categories,debts,loans,operations,today]=await Promise.all([
      prisma.economicAccount.findMany({where:{userId:this.owner},orderBy:[{isPrimary:'desc'},{createdAt:'asc'}],
        select:{id:true,name:true,currency:true,isPrimary:true,openingBalanceMinor:true,updatedAt:true},take:40}),
      prisma.economicCategory.findMany({where:{userId:this.owner},
        select:{id:true,name:true,kind:true,createdAt:true},take:80}),
      prisma.economicDebt.findMany({where:{userId:this.owner,isClosed:false},
        select:{id:true,counterparty:true,direction:true,amountMinor:true,paidMinor:true,updatedAt:true},take:25}),
      prisma.economicLoan.findMany({where:{userId:this.owner,isClosed:false},
        select:{id:true,name:true,principalMinor:true,paidMinor:true,annualRateBps:true,termMonths:true,updatedAt:true},take:25}),
      prisma.economicOperation.findMany({where:{userId:this.owner},
        orderBy:{occurredAt:'desc'},select:{id:true,title:true,kind:true,amountMinor:true,category:true,
          sourceAccountId:true,targetAccountId:true,debtId:true,updatedAt:true},take:25}),
      Promise.resolve(new Date())
    ]);
    const start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
    const byKind=await prisma.economicOperation.groupBy({by:['kind'],where:{userId:this.owner,
      kind:{in:['INCOME','EXPENSE']},occurredAt:{gte:start}},_sum:{amountMinor:true}});
    for(const a of accounts)this.observed.set('account:'+a.id,{updatedAt:a.updatedAt.toISOString()});
    for(const c of categories)this.observed.set('category:'+c.id,{createdAt:c.createdAt.toISOString(),kind:c.kind,name:c.name});
    for(const d of debts)this.observed.set('debt:'+d.id,{updatedAt:d.updatedAt.toISOString()});
    for(const l of loans)this.observed.set('loan:'+l.id,{updatedAt:l.updatedAt.toISOString()});
    for(const o of operations)this.observed.set('operation:'+o.id,{updatedAt:o.updatedAt.toISOString()});
    return {
      currency:'RUB',minorUnit:'копейки (100 копеек = 1 рубль)',
      primaryAccountId:accounts.find(a=>a.isPrimary)?.id??accounts[0]?.id??null,
      accounts:accounts.map(a=>({id:a.id,name:a.name,isPrimary:a.isPrimary,currency:a.currency,
        openingBalanceMinor:a.openingBalanceMinor.toString(),updatedAt:a.updatedAt.toISOString()})),
      categories,
      debts:debts.map(d=>({...d,amountMinor:d.amountMinor.toString(),paidMinor:d.paidMinor.toString()})),
      loans:loans.map(l=>({...l,principalMinor:l.principalMinor.toString(),paidMinor:l.paidMinor.toString()})),
      recentOperations:operations.map(o=>({...o,amountMinor:o.amountMinor.toString()})),
      thisMonth:byKind.map(k=>({kind:k.kind,amountMinor:(k._sum.amountMinor??0n).toString()}))
    };
  }
  async find(args:unknown){
    const rows=await findEconomicRecords(this.owner,args);
    for(const row of rows){
      if(row.updatedAt)this.observed.set(row.entity+':'+row.id,{updatedAt:row.updatedAt});
      if(row.entity==='category' && row.categoryName && row.categoryKind && row.createdAt)
        this.observed.set('category:'+row.id,{createdAt:row.createdAt,kind:row.categoryKind,name:row.categoryName});
    }
    return rows;
  }
  async propose(value:unknown){
    if(this.prepared.length)throw new EconomicActionError('Карточки для этого ответа уже подготовлены. Не создавайте дубли.');
    const row=value && typeof value==='object' && !Array.isArray(value)
      ? value as Record<string,unknown> : {};
    if(typeof row.actions_json!=='string'||row.actions_json.length>12000)
      throw new EconomicActionError('Некорректный список изменений.');
    let raw:unknown;
    try{raw=JSON.parse(row.actions_json);}catch{throw new EconomicActionError('Некорректный JSON финансовых действий.');}
    if(!Array.isArray(raw)||raw.length<1||raw.length>5)throw new EconomicActionError('Допускается от 1 до 5 финансовых действий.');
    const accounts=await prisma.economicAccount.findMany({where:{userId:this.owner},
      orderBy:[{isPrimary:'desc'},{createdAt:'asc'}],
      select:{id:true,name:true,isPrimary:true,currency:true}});
    const primary=accounts.find(a=>a.isPrimary)??accounts[0];
    const resolveAccount=(name:unknown)=>{
      if(typeof name!=='string'||name.trim().length===0)throw new EconomicActionError('Укажите название счёта.');
      const exact=accounts.filter(a=>a.name.trim().toLocaleLowerCase('ru-RU')===name.trim().toLocaleLowerCase('ru-RU'));
      if(exact.length!==1)throw new EconomicActionError('Счёт «'+String(name).slice(0,80)+'» не найден. Уточните название.');
      return exact[0].id;
    };
    const actions:EconomicAction[]=raw.map((item:unknown)=>{
      if(!item||typeof item!=='object'||Array.isArray(item))throw new EconomicActionError('Действие должно быть объектом.');
      const candidate=item as Record<string,unknown>;
      if(!candidate.payload||typeof candidate.payload!=='object'||Array.isArray(candidate.payload))
        throw new EconomicActionError('Отсутствуют параметры действия.');
      const payload={...(candidate.payload as Record<string,unknown>)};
      if(candidate.entity==='operation' && candidate.action==='create'){
        if(payload.sourceAccountName!==undefined){
          payload.sourceAccountId=resolveAccount(payload.sourceAccountName);
          delete payload.sourceAccountName;
        } else if(payload.sourceAccountId==null){
          if(!primary)throw new EconomicActionError('Сначала создайте счёт: основного счёта пока нет.');
          payload.sourceAccountId=primary.id;
        }
        if(payload.targetAccountName!==undefined){
          payload.targetAccountId=resolveAccount(payload.targetAccountName);
          delete payload.targetAccountName;
        }
        if(payload.kind==='TRANSFER'&&!payload.targetAccountId)
          throw new EconomicActionError('Для перевода укажите счёт получателя.');
      }
      if(candidate.entity==='operation' && candidate.action==='update' && payload.sourceAccountName!==undefined){
        payload.sourceAccountId=resolveAccount(payload.sourceAccountName);
        delete payload.sourceAccountName;
      }
      return canonicalEconomicAction({...candidate,payload});
    });
    for(const action of actions){
      if(action.action!=='update')continue;
      const read=this.observed.get(action.entity+':'+action.targetId);
      if(!read)throw new EconomicActionError('Перед изменением найдите и прочитайте запись через инструменты финансового обзора.');
    }
    const prepared=await prepareEconomicProposals(this.owner,actions);
    for(const item of prepared){
      if(item.action.action!=='update')continue;
      const before=item.before!;
      const read=this.observed.get(item.action.entity+':'+item.action.targetId)!;
      if(item.action.entity==='category'){
        if(read.createdAt!==before.createdAt||read.kind!==before.kind||read.name!==before.name)
          throw new EconomicActionError('Категория изменилась после чтения. Повторите запрос.');
      }else if(read.updatedAt!==before.updatedAt)
        throw new EconomicActionError('Запись изменилась после чтения. Повторите запрос.');
    }
    this.prepared=prepared;
    return {ok:true,confirmationRequired:true,count:prepared.length,
      descriptions:prepared.map(p=>({entity:p.action.entity,action:p.action.action,
        targetId:p.action.targetId,payload:p.action.payload})),
      message:'Финансовые изменения подготовлены в оранжевых карточках, но ещё не применены.'};
  }
  async persist(requestId:string){
    if(!this.prepared.length)return [];
    const preference=await prisma.user.findUnique({where:{id:this.owner},select:{economicAiAutoApply:true}});
    const autoApply=preference?.economicAiAutoApply===true;
    const ids:string[]=[];
    for(let index=0;index<this.prepared.length;index++){
      const p=this.prepared[index];
      const id=createHash('sha256').update('finance:'+this.owner+':'+requestId+':'+index).digest('hex').slice(0,32);
      // Deterministic ID provides idempotent retry after a partially persisted response.
      await prisma.economicAiProposal.create({
        data:{id,userId:this.owner,messageId:null,entity:p.action.entity,
          action:p.action.action,targetId:p.action.targetId,
          payload:p.action.payload as Prisma.InputJsonValue,
          ...(p.before?{before:p.before as Prisma.InputJsonValue}:{})}
      }).catch(async error=>{
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002'){
          const existing=await prisma.economicAiProposal.findFirst({where:{id,userId:this.owner}});
          if(existing)return;
        }
        throw error;
      });
      ids.push(id);
    }
    if(autoApply){
      for(const id of ids){
        try{await applyEconomicProposal(this.owner,id,true);}
        catch(error){
          const message=error instanceof Error?error.message:'Ошибка автоматического применения';
          await prisma.economicAiProposal.updateMany({where:{id,userId:this.owner,status:'PENDING'},
            data:{error:('Автоприменение не удалось: '+message).slice(0,500)}});
        }
      }
    }
    const rows=await prisma.economicAiProposal.findMany({where:{userId:this.owner,id:{in:ids}}});
    return ids.map(id=>rows.find(r=>r.id===id)).filter((v):v is NonNullable<typeof v>=>Boolean(v)).map(economicProposalView);
  }
}
