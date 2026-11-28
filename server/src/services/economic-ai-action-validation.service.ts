import { normalizeEconomicPositions } from '../lib/economic-operation-details.js';
/** Strict allowlist for every AI-proposed financial mutation.
 * The LLM is untrusted: numbers, links and identities are verified again at
 * apply time inside the user's DB transaction.
 */
export type EconomicEntity = 'account' | 'operation' | 'debt' | 'loan' | 'category';
export type EconomicChange = 'create' | 'update';
export type EconomicAction = {
  entity: EconomicEntity;
  action: EconomicChange;
  targetId: string | null;
  payload: Record<string, string | number | boolean | null>;
};
export class EconomicActionError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
const FIELDS: Record<EconomicEntity, readonly string[]> = {
  account: ['name','openingBalanceMinor','balanceMinor','accountType','creditLimitMinor'],
  operation: ['kind','amountMinor','sourceAccountId','targetAccountId','category','title','note','occurredAt','positionsJson','calculation'],
  debt: ['direction','counterparty','amountMinor','paidMinor','note','dueAt','postedToAccount','accountId'],
  loan: ['name','lender','principalMinor','paidMinor','annualRateBps','termMonths','startDate',
    'monthlyPaymentOverrideMinor','paymentDate','remindersEnabled','isClosed'],
  category: ['kind','name']
};
const REQUIRED: Record<EconomicEntity, readonly string[]> = {
  account: ['name'],
  operation: ['kind','amountMinor','sourceAccountId','title'],
  debt: ['direction','counterparty','amountMinor'],
  loan: ['name','principalMinor','annualRateBps','termMonths','startDate'],
  category: ['kind','name']
};
const STRING_LIMITS: Record<string, number> = {
  name:100, title:160, counterparty:100, lender:100, category:80, note:500, calculation:240,
  sourceAccountId:128,targetAccountId:128,accountId:128
};
const OPTIONAL_NULL = new Set(['calculation','note','category','targetAccountId','accountId','dueAt','lender','monthlyPaymentOverrideMinor','paymentDate','creditLimitMinor']);
const enumAllowed: Record<string,readonly string[]> = {
  kind:['INCOME','EXPENSE','TRANSFER'], direction:['OWE','OWED_TO_ME'], accountType:['STANDARD','CREDIT_CARD']
};
function plain(value:unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function canonicalEconomicAction(value:unknown):EconomicAction {
  if(!plain(value))throw new EconomicActionError('Неверная структура финансового действия.');
  const entity=value.entity, action=value.action;
  if(!['account','operation','debt','loan','category'].includes(String(entity)) ||
    !['create','update'].includes(String(action)))
    throw new EconomicActionError('Неизвестный тип финансового действия.');
  const target=entity as EconomicEntity, operation=action as EconomicChange;
  const targetId=value.targetId === null || value.targetId === undefined ? null : value.targetId;
  if(operation==='update' && (typeof targetId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(targetId)))
    throw new EconomicActionError('Для редактирования нужен ID существующей записи.');
  if(operation==='create' && targetId !== null)
    throw new EconomicActionError('Для создания записи ID не задаётся.');
  const payload=typeof value.payload_json==='string'
    ? (()=>{try{return JSON.parse(value.payload_json) as unknown}catch{throw new EconomicActionError('Неверный JSON финансовых данных.')}})()
    : value.payload;
  if(!plain(payload))throw new EconomicActionError('Финансовые данные должны быть объектом.');
  const properties=Object.keys(payload);
  if(properties.length===0 || properties.length>15)throw new EconomicActionError('Изменения не указаны.');
  const allowed=FIELDS[target];
  if(properties.some(key=>!allowed.includes(key)))
    throw new EconomicActionError('Финансовое действие содержит недопустимые поля.');
  if(operation==='create' && REQUIRED[target].some(key=>!properties.includes(key)))
    throw new EconomicActionError('Для создания не хватает обязательных полей.');
  if(operation==='update' && target==='category' && properties.includes('kind'))
    throw new EconomicActionError('Тип категории нельзя менять, только название.');
  const result: Record<string,string|number|boolean|null>={};
  for(const [key,raw] of Object.entries(payload)){
    if(key==='positionsJson'){
      try { result[key]=normalizeEconomicPositions(raw); } catch(cause) { throw new EconomicActionError((cause as Error).message); }
      continue;
    }
    if(raw===null && OPTIONAL_NULL.has(key)){result[key]=null;continue;}
    if(key.endsWith('Minor')){
      if(typeof raw!=='string' || !/^-?\d{1,15}$/.test(raw))throw new EconomicActionError('Укажите сумму в копейках строкой.');
      const minor=BigInt(raw);
      if(key==='openingBalanceMinor'||key==='balanceMinor' ? minor < -999999999999999n || minor>999999999999999n :
        (key==='paidMinor' ? minor<0n : minor<=0n))
        throw new EconomicActionError('Недопустимая сумма.');
      result[key]=minor.toString();continue;
    }
    if(['annualRateBps','termMonths'].includes(key)){
      if(typeof raw!=='number'||!Number.isInteger(raw)||
        (key==='annualRateBps' ? raw<0||raw>100000 : raw<1||raw>600))
        throw new EconomicActionError('Некорректный процент или срок кредита.');
      result[key]=raw;continue;
    }
    if(['postedToAccount','remindersEnabled','isClosed'].includes(key)){
      if(typeof raw!=='boolean')throw new EconomicActionError('Некорректное значение переключателя.');
      result[key]=raw;continue;
    }
    if(['occurredAt','dueAt','paymentDate','startDate'].includes(key)){
      if(typeof raw!=='string'||raw.length>40||!/^\d{4}-\d\d-\d\d/.test(raw))
        throw new EconomicActionError('Неверный формат даты.');
      const parsed=new Date(raw);
      if(!Number.isFinite(parsed.getTime())||parsed.getUTCFullYear()<2000||parsed.getUTCFullYear()>2200)
        throw new EconomicActionError('Дата находится за пределами допустимого периода.');
      result[key]=parsed.toISOString();continue;
    }
    const limit=key==='name' && target==='account' ? 60 : key==='name' && target==='category' ? 60 : STRING_LIMITS[key]??128;
    if(typeof raw!=='string'||raw.trim().length===0||raw.trim().length>limit||
      /[\u0000-\u001f\u007f]/.test(raw))
      throw new EconomicActionError('Некорректный текст в поле «'+key+'».');
    if(enumAllowed[key] && !enumAllowed[key].includes(raw))throw new EconomicActionError('Недопустимое значение «'+key+'».');
    if((key.endsWith('Id')||key==='accountId') && !/^[A-Za-z0-9_-]{8,128}$/.test(raw))
      throw new EconomicActionError('Неверный идентификатор счёта.');
    result[key]=raw.trim();
  }
  if(target==='account' && result.balanceMinor !== undefined && result.openingBalanceMinor !== undefined)
    throw new EconomicActionError('Укажите только текущий баланс, не одновременно начальный остаток.');
  if(target==='account' && operation==='create' && result.accountType==='CREDIT_CARD' &&
      (!result.creditLimitMinor || result.balanceMinor === undefined ||
       BigInt(String(result.balanceMinor))<0n ||
       BigInt(String(result.balanceMinor))>BigInt(String(result.creditLimitMinor))))
    throw new EconomicActionError('Для кредитной карты укажите кредитный лимит и доступный остаток.');
  if(target==='category' && result.kind && !['INCOME','EXPENSE'].includes(String(result.kind)))
    throw new EconomicActionError('Категория может быть только доходом или расходом.');
  if(target==='operation' && result.kind==='TRANSFER' && operation==='create' &&
    (!result.targetAccountId || result.targetAccountId===result.sourceAccountId))
    throw new EconomicActionError('Для перевода нужны два разных счёта.');
  if(target==='debt' && result.amountMinor!==undefined && result.paidMinor!==undefined &&
    BigInt(String(result.paidMinor))>BigInt(String(result.amountMinor)))
    throw new EconomicActionError('Погашение не может превышать долг.');
  if(target==='loan' && result.remindersEnabled===true && operation==='create' && !result.paymentDate)
    throw new EconomicActionError('Для напоминаний нужна дата платежа.');
  return {entity:target,action:operation,targetId:targetId as string|null,payload:result};
}

export function parseEconomicToolActions(raw:unknown):EconomicAction[]{
  if(typeof raw!=='string'||raw.length>12000)throw new EconomicActionError('Слишком много изменений.');
  let list:unknown;
  try{list=JSON.parse(raw)}catch{throw new EconomicActionError('Не удалось прочитать предложения ИИ.');}
  if(!Array.isArray(list)||list.length<1||list.length>5)
    throw new EconomicActionError('В одном запросе допускается от 1 до 5 изменений.');
  return list.map(canonicalEconomicAction);
}
