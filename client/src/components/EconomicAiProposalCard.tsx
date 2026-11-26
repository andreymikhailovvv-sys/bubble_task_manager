import { announceEconomicOperation } from './EconomicMoneyGesture';
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Loader2, RotateCcw, Pencil, X } from 'lucide-react';
import { minorToRublesInput, rublesToMinor, groupMoneyInput, readEconomicPositions, formatMinorRub } from '../lib/economicMoney';
import './EconomicAiProposalCard.css';

type Value = string | number | boolean | null;
type Payload = Record<string, Value>;
export type EconomicAiProposal = {
  id:string;messageId:string|null;entity:string;action:string;
  title:string;description:string;details:string[];
  status:string;autoApplied:boolean;error:string|null;createdAt:string;
  appliedEntityId:string|null;payload?:Payload;before?:Payload;
};
type Options = { accounts:Array<{id:string;name:string;isPrimary:boolean}>;
  categories:Array<{kind:string;name:string}> };
type Props = {
  initial:EconomicAiProposal;autoApply:boolean;
  onAutoApplyChange:(next:boolean)=>Promise<void>;
  onRefresh:()=>Promise<void>;
};
const STATUS:Record<string,string>={
  PENDING:'Ожидает подтверждения',APPLYING:'Применяется',
  APPLIED:'Применено',REJECTED:'Отклонено',CONFLICT:'Конфликт изменений',
  UNDONE:'Отменено',UNDOING:'Отменяется'
};
const LABELS:Record<string,string>={
  name:'Название',title:'Название',counterparty:'Контрагент',
  kind:'Тип',direction:'Направление',balanceMinor:'Баланс, ₽',
  openingBalanceMinor:'Баланс, ₽',amountMinor:'Сумма, ₽',
  accountType:'Тип счёта',creditLimitMinor:'Кредитный лимит, ₽',
  principalMinor:'Сумма кредита, ₽',paidMinor:'Выплачено, ₽',
  sourceAccountId:'Счёт',targetAccountId:'Счёт зачисления',accountId:'Счёт долга',
  category:'Категория',note:'Примечание',calculation:'Калькуляция',dueAt:'Срок возврата',
  annualRateBps:'Ставка, базисных пунктов',termMonths:'Срок, мес.',
  startDate:'Дата начала',occurredAt:'Дата операции',lender:'Кредитор',
  paymentDate:'Дата платежа',postedToAccount:'Проводка по счёту',
  remindersEnabled:'Напоминания',isClosed:'Закрыт'
};
const BASE_CATEGORIES:Record<string,string[]>={
  INCOME:['Зарплата','Подработка','Бизнес','Подарки','Проценты','Другое'],
  EXPENSE:['Продукты','Кафе и рестораны','Транспорт','Жильё','Покупки','Здоровье',
    'Развлечения','Путешествия','Образование','Другое']
};
const root='/api/economic/assistant';
async function read<T>(path:string,method:'GET'|'POST'|'PUT'='GET',body?:unknown):Promise<T>{
  const response=await fetch(root+path,{
    method,credentials:'include',cache:'no-store',
    headers:{Accept:'application/json',...(method!=='GET'?{'Content-Type':'application/json'}:{})},
    ...(method!=='GET'?{body:JSON.stringify(body??{})}:{})
  });
  const json=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(json.error||'Не удалось выполнить действие.');
  return json;
}
function editable(proposal:EconomicAiProposal):Payload{
  const incoming=proposal.payload??{};
  // Show the full operation so account/category can be corrected even when
  // the AI originally proposed changing just one field.
  if(proposal.entity==='operation'&&proposal.action==='update'&&proposal.before){
    const keys=['kind','title','amountMinor','sourceAccountId','targetAccountId',
      'category','note','occurredAt','positionsJson','calculation'];
    return Object.fromEntries(keys.filter(key=>key in incoming||key in proposal.before!)
      .map(key=>[key,key in incoming?incoming[key]:proposal.before![key]])) as Payload;
  }
  if(proposal.entity==='operation'){
    const d={...incoming};
    if(!('category' in d)&&d.kind!=='TRANSFER')d.category=null;
    return d;
  }
  return {...incoming};
}
function inputValue(key:string,value:Value):string{
  if(value==null)return '';
  if(key.endsWith('Minor'))return minorToRublesInput(String(value));
  if(['occurredAt','dueAt','startDate','paymentDate'].includes(key))
    return String(value).slice(0,10);
  return String(value);
}
function displayDraft(proposal:EconomicAiProposal):Payload{
  return Object.fromEntries(Object.entries(editable(proposal))
    .map(([key,value])=>[key,key.endsWith('Minor')||['occurredAt','dueAt','startDate','paymentDate'].includes(key)
      ? inputValue(key,value):value])) as Payload;
}
function normalizedDraft(draft:Payload,reference:Payload):Payload{
  return Object.fromEntries(Object.entries(draft).map(([key,value])=>{
    if(key.endsWith('Minor'))return [key,rublesToMinor(String(value),key==='balanceMinor'||key==='openingBalanceMinor')];
    if(['occurredAt','dueAt','startDate','paymentDate'].includes(key))
      return [key,value
        ? String(reference[key]??'').startsWith(String(value).slice(0,10))&&
            String(reference[key]??'').includes('T')
          ? reference[key] : new Date(String(value).slice(0,10)+'T12:00:00.000Z').toISOString()
        : null];
    if(['annualRateBps','termMonths'].includes(key))return [key,Number(value)];
    if(['category','note','calculation','lender','accountId','targetAccountId'].includes(key)&&value==='')
      return [key,null];
    return [key,value];
  })) as Payload;
}
export function EconomicAiProposalCard({initial,autoApply,onAutoApplyChange,onRefresh}:Props){
  const [proposal,setProposal]=useState(initial);
  const [draft,setDraft]=useState<Payload>(()=>displayDraft(initial));
  const [options,setOptions]=useState<Options|null>(null);
  const [busy,setBusy]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    setProposal(initial);
    setDraft(displayDraft(initial));
    setEditOpen(false);
  },[initial.id,initial.status,JSON.stringify(initial.payload)]);
  useEffect(()=>{
    let active=true;
    read<Options>('/options').then(value=>{if(active)setOptions(value);})
      .catch(()=>{if(active)setError('Не удалось загрузить счета и категории.');});
    return ()=>{active=false;};
  },[initial.id]);
  const setField=(key:string,value:Value)=>setDraft(prev=>({...prev,[key]:value}));
  const act=async(action:'approve'|'reject'|'undo'|'revise')=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const path='/proposals/'+encodeURIComponent(proposal.id);
      let updated=proposal;
      if(action==='approve'||action==='revise'){
        const payload=normalizedDraft(draft,editable(proposal));
        // Never alter the original object in place: the server checks the
        // previous payload to reject edits from an outdated tab.
        updated=await read<EconomicAiProposal>(path,'PUT',{
          payload,expectedPayload:proposal.payload??{}
        });
        setProposal(updated);
      }
      if(action!=='revise')updated=await read<EconomicAiProposal>(path+'/'+action,'POST');
      setProposal(updated);
      setDraft(displayDraft(updated));
      if(action==='approve'&&updated.status==='APPLIED'&&updated.entity==='operation'&&updated.action==='create')announceEconomicOperation(updated.payload?.kind);
      if(updated.status==='APPLIED'||updated.status==='UNDONE')await onRefresh();
      if(action==='revise')setEditOpen(false);
    }catch(cause){
      // A response can be lost after a successful mutation: reconcile first.
      try{
        const latest=await read<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id));
        setProposal(latest);setDraft(displayDraft(latest));
      }catch{setError('Не удалось проверить результат. Обновите страницу перед повтором.');}
      if(!error)setError(cause instanceof Error?cause.message:'Не удалось применить изменения.');
    }finally{setBusy(false);}
  };
  const openEditor=()=>{setDraft(displayDraft(proposal));setError('');setEditOpen(true);};
  const toggle=async(enabled:boolean)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await onAutoApplyChange(enabled);}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить настройку.');}
    finally{setBusy(false);}
  };
  const applied=proposal.status==='APPLIED';
  const editableStatus=proposal.status==='PENDING'||applied;
  const entries=Object.entries(draft).filter(([key])=>key in LABELS).slice(0,15);
  const kind=String(draft.kind??proposal.before?.kind??'EXPENSE');
  // Shared with the native card: the action heading stays above, while the
  // operation description belongs INSIDE the single editable detail tile.
  const innerLabel=proposal.entity==='operation'
    ? (proposal.action==='create'?'Новая операция':'Изменение операции')
    : proposal.entity==='account'?(proposal.action==='create'?'Новый счёт':'Изменение счёта')
    : proposal.entity==='category'?(proposal.action==='create'?'Новая категория':'Изменение категории')
    : proposal.entity==='loan'?(proposal.action==='create'?'Новый кредит':'Изменение кредита')
    : proposal.entity==='debt'?(proposal.action==='create'?'Новый долг':'Изменение долга')
    : (proposal.action==='create'?'Новая запись':'Изменение записи');
  const previewValue=(key:string,value:Value)=>{
    if(value==null||value==='')return 'Не указано';
    if(['sourceAccountId','targetAccountId','accountId'].includes(key))
      return options?.accounts.find(account=>account.id===value)?.name??'Выбранный счёт';
    if(key==='kind')return ({EXPENSE:'Расход',INCOME:'Доход',TRANSFER:'Перевод'} as Record<string,string>)[String(value)]??String(value);
    if(key==='direction')return value==='OWE'?'Я должен':'Мне должны';
    if(key==='accountType')return value==='CREDIT_CARD'?'Кредитная карта':'Денежный счёт';
    if(typeof value==='boolean')return value?'Да':'Нет';
    if(key.endsWith('Minor'))return String(value)+' ₽';
    return String(value);
  };
  const renderField=(key:string,value:Value)=>{
    if(key==='accountType'){
      return <select aria-label="Тип счёта" value={String(value??'STANDARD')}
        disabled={!editableStatus||busy} onChange={e=>setField(key,e.target.value)}>
        <option value="STANDARD">Денежный счёт</option>
        <option value="CREDIT_CARD">Кредитная карта</option>
      </select>;
    }
    if(key==='kind'||key==='direction'){
      const pairs=key==='direction'
        ? [['OWE','Я должен'],['OWED_TO_ME','Мне должны']]
        : proposal.entity==='category'
          ? [['EXPENSE','Расход'],['INCOME','Доход']]
          : [['EXPENSE','Расход'],['INCOME','Доход'],['TRANSFER','Перевод']];
      return <select aria-label={LABELS[key]} value={String(value??'')} disabled={!editableStatus||busy}
        onChange={e=>{
          if(key!=='kind'){setField(key,e.target.value);return;}
          const next=e.target.value;
          setDraft(prev=>({...prev,kind:next,
            ...(proposal.entity==='operation'?{
              category:null,
              ...(next==='TRANSFER'&&!('targetAccountId' in prev)?{targetAccountId:null}:{})
            }:{} )}));
        }}>
        {pairs.map(([v,label])=><option key={v} value={v}>{label}</option>)}
      </select>;
    }
    if(['sourceAccountId','targetAccountId','accountId'].includes(key)){
      return <select aria-label={LABELS[key]} value={String(value??'')} disabled={!editableStatus||busy||!options}
        onChange={e=>setField(key,e.target.value||null)}>
        <option value="">{options?'Выберите счёт':'Загрузка счетов'}</option>
        {options?.accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}
      </select>;
    }
    if(key==='category'){
      const values=Array.from(new Set([...(BASE_CATEGORIES[kind]??[]),
        ...(options?.categories.filter(c=>c.kind===kind).map(c=>c.name)??[]),
        ...(value?[String(value)]:[])]));
      return <select aria-label="Категория" value={String(value??'')} disabled={!editableStatus||busy||kind==='TRANSFER'}
        onChange={e=>setField(key,e.target.value||null)}>
        <option value="">Без категории</option>
        {values.map(name=><option key={name} value={name}>{name}</option>)}
      </select>;
    }
    if(['postedToAccount','remindersEnabled','isClosed'].includes(key)){
      return <select aria-label={LABELS[key]} value={String(value)} disabled={!editableStatus||busy}
        onChange={e=>setField(key,e.target.value==='true')}>
        <option value="true">Да</option><option value="false">Нет</option>
      </select>;
    }
    const isDate=['occurredAt','dueAt','startDate','paymentDate'].includes(key);
    return <input aria-label={LABELS[key]} disabled={!editableStatus||busy}
      type={isDate?'date':'text'} inputMode={key.endsWith('Minor')?'decimal':undefined}
      value={String(value??'')} maxLength={key==='note'?500:key==='calculation'?240:160}
      onChange={e=>setField(key,key.endsWith('Minor')?groupMoneyInput(e.target.value):e.target.value)}/>;
  };
  return <div className="econ-finance-proposal" data-economic-proposal={proposal.id}>
    <div className="econ-finance-proposal-head">
      <span className="econ-finance-proposal-icon"><ClipboardCheck size={17}/></span>
      <div className="econ-finance-proposal-title">
        <strong>{proposal.title}</strong>
        <small>{proposal.autoApplied&&applied?'Применено автоматически':STATUS[proposal.status]||proposal.status}</small>
      </div>
      {applied?<CheckCircle2 size={17} className="econ-finance-success"/>:null}
      {error||proposal.error?<AlertTriangle size={16} className="econ-finance-warn"/>:null}
    </div>
    {entries.length>0||proposal.description||proposal.details?.length>0
      ? <div className="econ-finance-proposal-details econ-finance-proposal-inner">
        <span className="econ-finance-inner-label">{innerLabel}</span>
        {proposal.description&&<p className="econ-finance-description">{proposal.description}</p>}
        {entries.length>0 ? <div className="econ-finance-summary-fields">{entries.slice(0,5).map(([key,value])=><div key={key} className="econ-finance-summary-row"><span>{LABELS[key]}</span><strong>{previewValue(key,value)}</strong></div>)}</div>
          : proposal.details?.map((item,index)=><div key={index}>{item}</div>)}
        {readEconomicPositions(String(draft.positionsJson??'[]')).map((position,index)=><div key={index} className="econ-finance-summary-row"><span>{position.name}</span><strong>{formatMinorRub(position.amountMinor)}</strong></div>)}
      </div> : null}
    {error||proposal.error?<div role="alert" className="econ-finance-proposal-error">{error||proposal.error}</div>:null}
    {proposal.status==='PENDING'&&entries.length>0?<button type="button" className="econ-finance-edit-link" disabled={busy} onClick={openEditor}><Pencil size={13}/>Изменить поля</button>:null}
    {proposal.status==='PENDING'&&<div className="econ-finance-proposal-actions">
      <button type="button" className="econ-finance-primary" disabled={busy} onClick={()=>void act('approve')}>
        {busy?<Loader2 className="econ-spin" size={15}/>:<Check size={15}/>}Применить
      </button>
      <button type="button" className="econ-finance-secondary" disabled={busy} onClick={()=>void act('reject')}>
        <X size={14}/>Отклонить
      </button>
    </div>}
    {applied&&<div className="econ-finance-proposal-actions">
      <button type="button" className="econ-finance-primary" disabled={busy} onClick={openEditor}>
        {busy?<Loader2 className="econ-spin" size={15}/>:<Pencil size={15}/>}Изменить
      </button>
      <button type="button" className="econ-finance-secondary econ-finance-undo" disabled={busy} onClick={()=>void act('undo')}>
        {busy?<Loader2 className="econ-spin" size={14}/>:<RotateCcw size={14}/>}Отменить
      </button>
    </div>}
    {editOpen?<div className="econ-finance-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setEditOpen(false)}}><div className="econ-finance-modal" role="dialog" aria-modal="true" aria-label="Изменение финансовой операции">
      <div className="econ-finance-modal-head"><strong>Изменить поля</strong><button type="button" disabled={busy} aria-label="Закрыть" onClick={()=>setEditOpen(false)}><X size={18}/></button></div>
      <div className="econ-finance-editable-fields">{entries.map(([key,value])=><label key={key} className="econ-finance-edit-row"><span>{LABELS[key]}</span>{renderField(key,value)}</label>)}</div>
      {error?<p role="alert" className="econ-finance-proposal-error">{error}</p>:null}
      <div className="econ-finance-modal-actions"><button type="button" disabled={busy} onClick={()=>setEditOpen(false)}>Отмена</button><button type="button" disabled={busy} onClick={()=>void act('revise')}>{busy?'Сохраняем…':'Сохранить'}</button></div>
    </div></div>:null}
    <label className="econ-finance-autoapply">
      <input type="checkbox" checked={autoApply} disabled={busy}
        onChange={event=>void toggle(event.target.checked)}/>
      Автоматически применять новые изменения
    </label>
  </div>;
}
