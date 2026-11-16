import { prisma } from '../db/prisma.js';
import { EconomicActionError, type EconomicEntity } from './economic-ai-action-validation.service.js';

export function parseFinanceLookupArgs(value:unknown):{entity:EconomicEntity;query:string}{
  const row=value&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown>:{};
  if(!['account','operation','debt','loan','category'].includes(String(row.entity)))
    throw new EconomicActionError('Неизвестный тип финансовой записи.');
  if(typeof row.query!=='string'||row.query.trim().length<2||row.query.trim().length>100)
    throw new EconomicActionError('Укажите поисковый запрос длиной от 2 до 100 символов.');
  return {entity:row.entity as EconomicEntity,query:row.query.trim()};
}
export type SearchedEconomicRecord={
  id:string;entity:EconomicEntity;title:string;
  amountMinor?:string;kind?:string;accountId?:string|null;
  updatedAt?:string;createdAt?:string;
  categoryName?:string;categoryKind?:string;
  debtLinked?:boolean;
};
/** Owner-scoped, bounded read-only lookup. Older items stay outside the
 * recurring prompt budget until the model asks for an exact record. */
export async function findEconomicRecords(owner:string,args:unknown):Promise<SearchedEconomicRecord[]>{
  const {entity,query}=parseFinanceLookupArgs(args);
  if(entity==='account'){
    const rows=await prisma.economicAccount.findMany({where:{userId:owner,
      OR:[{name:{contains:query,mode:'insensitive'}},{id:query}]},
      take:10,orderBy:{updatedAt:'desc'}});
    return rows.map(x=>({entity,id:x.id,title:x.name,
      amountMinor:x.openingBalanceMinor.toString(),updatedAt:x.updatedAt.toISOString()}));
  }
  if(entity==='operation'){
    const rows=await prisma.economicOperation.findMany({where:{userId:owner,
      OR:[{title:{contains:query,mode:'insensitive'}},{category:{contains:query,mode:'insensitive'}},{id:query}]},
      take:10,orderBy:{occurredAt:'desc'}});
    return rows.map(x=>({entity,id:x.id,title:x.title,kind:x.kind,
      debtLinked:Boolean(x.debtId),amountMinor:x.amountMinor.toString(),
      accountId:x.sourceAccountId,updatedAt:x.updatedAt.toISOString()}));
  }
  if(entity==='debt'){
    const rows=await prisma.economicDebt.findMany({where:{userId:owner,
      OR:[{counterparty:{contains:query,mode:'insensitive'}},{id:query}]},
      take:10,orderBy:{updatedAt:'desc'}});
    return rows.map(x=>({entity,id:x.id,title:x.counterparty,kind:x.direction,
      amountMinor:x.amountMinor.toString(),accountId:x.accountId,
      updatedAt:x.updatedAt.toISOString()}));
  }
  if(entity==='loan'){
    const rows=await prisma.economicLoan.findMany({where:{userId:owner,
      OR:[{name:{contains:query,mode:'insensitive'}},{lender:{contains:query,mode:'insensitive'}},{id:query}]},
      take:10,orderBy:{updatedAt:'desc'}});
    return rows.map(x=>({entity,id:x.id,title:x.name,
      amountMinor:x.principalMinor.toString(),updatedAt:x.updatedAt.toISOString()}));
  }
  const rows=await prisma.economicCategory.findMany({where:{userId:owner,
    OR:[{name:{contains:query,mode:'insensitive'}},{id:query}]},
    take:10,orderBy:{createdAt:'desc'}});
  return rows.map(x=>({entity,id:x.id,title:x.name,categoryName:x.name,
    categoryKind:x.kind,createdAt:x.createdAt.toISOString()}));
}
