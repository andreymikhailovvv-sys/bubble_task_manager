import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Coins, Loader2, Pencil, RotateCcw, X } from 'lucide-react';
import { api } from './lib/api';
import type { AiTaskProposal, Sphere } from './lib/types';
import type { EconomicAiProposal } from './components/EconomicAiProposalCard';
import { minorToRublesInput, rublesToMinor } from './lib/economicMoney';
import { WorkAiMessageBody } from './components/WorkAiMessageBody';
import './components/AiTaskProposalCard.css';
import { CustomSelect } from './components/CustomSelect';

type TaskValues = NonNullable<AiTaskProposal['operations'][number]['editable']>;
type Value = string | number | boolean | null;
type FinancePayload = Record<string, Value>;
type FinanceOptions = { accounts: Array<{id:string;name:string;isPrimary:boolean}>; categories:Array<{kind:string;name:string}> };

const taskLabels: Record<string,string> = {
  create_task:'Новая задача',create_subtask:'Новая подзадача',create_event:'Событие',
  update_task:'Изменение задачи',update_subtask:'Изменение подзадачи',
  rename:'Переименование',rename_task:'Переименование',rename_subtask:'Переименование',
  reschedule:'Изменение даты',reschedule_task:'Изменение даты',reschedule_subtask:'Изменение даты',
  complete:'Завершение',complete_task:'Завершение',complete_subtask:'Завершение',
  reopen:'Возобновление',delete:'Удаление',delete_subtask:'Удаление',
  create_note:'Новая заметка',update_note:'Изменение заметки',create_habit:'Новая привычка',
  change_sphere:'Смена сектора',set_priority:'Приоритет'
};
const taskFields: Record<string,string> = {
  title:'Название',description:'Описание',sphereId:'Сектор',dueDate:'Дата и время',
  importance:'Важность',urgency:'Срочность',status:'Статус',location:'Место',
  notifyBeforeMinutes:'Уведомление, мин.'
};
const financeFields: Record<string,string> = {
  title:'Название',name:'Название',kind:'Тип',direction:'Направление',
  amountMinor:'Сумма, ₽',balanceMinor:'Баланс, ₽',openingBalanceMinor:'Начальный баланс, ₽',
  accountType:'Тип счёта',creditLimitMinor:'Кредитный лимит, ₽',
  principalMinor:'Размер кредита, ₽',paidMinor:'Выплачено, ₽',sourceAccountId:'Счёт',
  targetAccountId:'Счёт зачисления',accountId:'Счёт долга',counterparty:'Контрагент',
  category:'Категория',note:'Примечание',lender:'Кредитор',
  dueAt:'Срок',occurredAt:'Дата операции',startDate:'Дата начала',paymentDate:'Дата платежа',
  annualRateBps:'Ставка, б.п.',termMonths:'Срок, мес.',postedToAccount:'Учитывать на счёте',
  remindersEnabled:'Напоминания',isClosed:'Закрыта'
};
const dateKeys = ['dueAt','occurredAt','startDate','paymentDate'];
const TASK_PREF_EVENT = 'planovych-ai-task-autoapply';
const ECON_ROOT = '/api/economic/assistant';
const statusLabels: Record<string,string> = {
  PENDING:'Ожидает подтверждения',APPLYING:'Применяется',APPLIED:'Применено',
  REJECTED:'Отклонено',FAILED:'Ошибка',CONFLICT:'Конфликт изменений',
  UNDONE:'Отменено',UNDOING:'Отменяется'
};
const messageOf = (error:unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';
async function economicRead<T>(path:string,method:'GET'|'POST'|'PUT'='GET',body?:unknown):Promise<T> {
  const response = await fetch(ECON_ROOT + path, {
    method, credentials:'include', cache:'no-store',
    headers:{Accept:'application/json',...(method === 'GET'?{}:{'Content-Type':'application/json'})},
    ...(method === 'GET'?{}:{body:JSON.stringify(body ?? {})})
  });
  const json = await response.json().catch(() => ({})) as T & {error?:string};
  if (!response.ok) throw new Error(json.error || 'Не удалось сохранить финансовое предложение.');
  return json;
}
const localDateTime = (value?:string|null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (v:number) => String(v).padStart(2,'0');
  return parsed.getFullYear()+'-'+pad(parsed.getMonth()+1)+'-'+pad(parsed.getDate())+'T'+pad(parsed.getHours())+':'+pad(parsed.getMinutes());
};
const financeInput = (key:string,value:Value):Value => {
  if (value == null) return '';
  if (key.endsWith('Minor')) return minorToRublesInput(String(value));
  if (dateKeys.includes(key)) return String(value).slice(0,10);
  return value;
};
const financeEditable = (p:EconomicAiProposal):FinancePayload => {
  const input=p.payload||{};
  if(p.entity==='operation'&&p.action==='update'&&p.before){
    const keys=['kind','title','amountMinor','sourceAccountId','targetAccountId','category','note','occurredAt'];
    return Object.fromEntries(keys.filter(k=>k in input||k in p.before!).map(k=>[k,k in input?input[k]:p.before![k]]));
  }
  return {...input};
};
const financeDraft = (p:EconomicAiProposal) => Object.fromEntries(
  Object.entries(financeEditable(p)).map(([key,value])=>[key,financeInput(key,value)])) as FinancePayload;
const financeNormalize = (draft:FinancePayload, original:FinancePayload):FinancePayload =>
  Object.fromEntries(Object.entries(draft).map(([key,value])=>{
    if(key.endsWith('Minor'))return [key,rublesToMinor(String(value),key==='balanceMinor'||key==='openingBalanceMinor')];
    if(dateKeys.includes(key))return [key,value ? (
      String(original[key]||'').startsWith(String(value).slice(0,10)) && String(original[key]).includes('T')
        ? original[key] : new Date(String(value).slice(0,10)+'T12:00:00.000Z').toISOString()
    ):null];
    if(['annualRateBps','termMonths'].includes(key))return [key,Number(value)];
    if(['category','note','lender','accountId','targetAccountId','sourceAccountId'].includes(key)&&value==='')return [key,null];
    return [key,value];
  })) as FinancePayload;

function EditModal({title,children,onClose,onSave,busy}:{title:string;children:ReactNode;onClose:()=>void;onSave:()=>void;busy:boolean}) {
  return <div className="tp-overlay tp-proposal-edit-overlay" onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="tp-dialog tp-proposal-edit-modal" role="dialog" aria-modal="true" aria-label={'Изменить: '+title}>
      <header><div><span className="tp-eyebrow">РЕДАКТИРОВАНИЕ ПРЕДЛОЖЕНИЯ</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><X size={18}/></button></header>
      <div className="tp-dialog-content tp-edit-fields">{children}
        <div className="tp-edit-actions"><button className="tp-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="tp-primary" type="button" onClick={onSave} disabled={busy}>
            {busy?<Loader2 className="tp-spin" size={16}/>:<Check size={16}/>}Сохранить изменения
          </button></div>
      </div>
    </section>
  </div>;
}

const priorityOptions = [1,2,3,4,5].map(n=>({value:String(n),label:String(n)}));
const statusOptions=[{value:'TODO',label:'Не начато'},{value:'IN_PROGRESS',label:'В работе'},{value:'DONE',label:'Выполнено'}];
function TaskEditFields({value,onChange,spheres,disabled}:{
  value:TaskValues;onChange:(value:TaskValues)=>void;spheres:Sphere[];disabled:boolean
}) {
  const change=(key:keyof TaskValues,input:string|number|null)=>onChange({...value,[key]:input});
  return <>{(Object.keys(taskFields) as Array<keyof TaskValues>).filter(k=>k in value).map(key=>
    <label className="tp-edit-field" key={key}><span>{taskFields[key]}</span>
      {key==='sphereId'?<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Сектор" value={value.sphereId||''}
        options={[{value:'',label:'Без сектора'},...spheres.map(s=>({value:s.id,label:s.name,color:s.color}))]}
        disabled={disabled} onChange={s=>change(key,s||null)}/>:
      key==='status'?<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Статус" value={value.status||'TODO'} options={statusOptions} disabled={disabled} onChange={s=>change(key,s)}/>:
      (key==='importance'||key==='urgency')?<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel={taskFields[key]} value={String(value[key]??3)} options={priorityOptions} disabled={disabled} onChange={s=>change(key,Number(s))}/>:
      key==='dueDate'?<input type="datetime-local" value={localDateTime(value.dueDate)} disabled={disabled} onChange={e=>change(key,e.target.value?new Date(e.target.value).toISOString():null)}/>:
      key==='description'?<textarea rows={4} maxLength={4000} value={value.description||''} disabled={disabled} onChange={e=>change(key,e.target.value)}/>:
      key==='notifyBeforeMinutes'?<input type="number" min={0} max={10080} value={value.notifyBeforeMinutes??0} disabled={disabled} onChange={e=>change(key,Number(e.target.value))}/>:
      <input value={String(value[key]??'')} maxLength={key==='title'?180:500} disabled={disabled} onChange={e=>change(key,e.target.value)}/>}
    </label>)}</>;
}

export function TestPageTaskProposal({initial,spheres,onApplied}:{initial:AiTaskProposal;spheres:Sphere[];onApplied:()=>void}) {
  const [proposal,setProposal]=useState(initial);
  const [drafts,setDrafts]=useState<Record<number,TaskValues>>(()=>Object.fromEntries(initial.operations.map((op,i)=>[i,{...op.editable}])));
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [autoApply,setAutoApply]=useState(false);
  const [selected,setSelected]=useState(initial.operations.map((_,i)=>i));
  const checkup=proposal.source==='daily_checkup';
  const telegram=['telegram_assistant','telegram_bot','telegram_bot_task'].includes(proposal.source);
  useEffect(()=>{
    let active=true;
    void api.aiTaskProposal(initial.id).then(next=>{if(active){setProposal(next);setDrafts(Object.fromEntries(next.operations.map((op,i)=>[i,{...op.editable}])));}}).catch(()=>undefined);
    if(!checkup&&!telegram)void api.aiTaskProposalPreference().then(p=>{if(active)setAutoApply(p.autoApply);}).catch(()=>undefined);
    const listen=(event:Event)=>{if(active)setAutoApply(Boolean((event as CustomEvent<boolean>).detail));};
    window.addEventListener(TASK_PREF_EVENT,listen);
    return ()=>{active=false;window.removeEventListener(TASK_PREF_EVENT,listen);};
  },[initial.id,checkup,telegram]);
  const reconcile=async()=>{const latest=await api.aiTaskProposal(proposal.id);setProposal(latest);setDrafts(Object.fromEntries(latest.operations.map((op,i)=>[i,{...op.editable}])));return latest;};
  const edit=async()=>{
    setBusy(true);setError('');
    try {
      let current=proposal;
      for(const [indexString,draft] of Object.entries(drafts)){
        const index=Number(indexString);
        if(!draft||!current.operations[index]?.editable||JSON.stringify(draft)===JSON.stringify(current.operations[index].editable))continue;
        if(!current.revision)throw new Error('У предложения нет версии. Обновите сообщение.');
        current=await api.editAiTaskProposal(current.id,index,current.revision,draft);
      }
      setProposal(current);setDrafts(Object.fromEntries(current.operations.map((op,i)=>[i,{...op.editable}])));
      setEditing(false);
      if(current.status==='APPLIED')onApplied();
    }catch(cause){await reconcile().catch(()=>undefined);setError(messageOf(cause));}
    finally{setBusy(false);}
  };
  const act=async(mode:'approve'|'reject'|'undo')=>{
    setBusy(true);setError('');
    try {
      const result=mode==='approve'?await api.approveAiTaskProposal(proposal.id,checkup?selected:undefined):
        mode==='reject'?await api.rejectAiTaskProposal(proposal.id):await api.undoAiTaskProposal(proposal.id);
      setProposal(result);
      if(result.status==='APPLIED'||result.status==='UNDONE'){
        window.dispatchEvent(new Event('standalone-notes-updated'));
        onApplied();
      }
    }catch(cause){await reconcile().catch(()=>undefined);setError(messageOf(cause));}
    finally{setBusy(false);}
  };
  const toggle=async(next:boolean)=>{
    setBusy(true);setError('');
    try{
      const answer=await api.setAiTaskProposalPreference(next);
      setAutoApply(answer.autoApply);
      window.dispatchEvent(new CustomEvent<boolean>(TASK_PREF_EVENT,{detail:answer.autoApply}));
    }catch(cause){setError(messageOf(cause));}finally{setBusy(false);}
  };
  return <div className="tp-proposal" data-test-task-proposal={proposal.id}>
    <div className="tp-proposal-head"><ClipboardCheck size={19}/><div><strong>Изменения задач</strong><small>{proposal.operations.length} действий · {statusLabels[proposal.status]||proposal.status}</small></div>{proposal.status==='APPLIED'&&<CheckCircle2 size={18}/>}</div>
    <div className="tp-proposal-items">{proposal.operations.map((item,i)=><div className="tp-proposal-item" key={i}>
      {checkup&&proposal.status==='PENDING'&&<input type="checkbox" checked={selected.includes(i)} onChange={e=>setSelected(old=>e.target.checked?[...old,i].sort((a,b)=>a-b):old.filter(k=>k!==i))}/>}
      <div><small>{taskLabels[item.type]||item.type}</small><strong>{item.editable?.title||item.title}</strong>
        {item.parentTitle&&<span>В задаче «{item.parentTitle}»</span>}
        {(item.editable?.description||item.after||item.details?.length) ? <div className="ai-proposal-description" tabIndex={0}><WorkAiMessageBody content={item.editable?.description||[item.after,...(item.details||[])].filter(Boolean).join('\n')}/></div> : null}
      </div>
    </div>)}</div>
    {(error||proposal.error)&&<p className="tp-proposal-error" role="alert">{error||proposal.error}</p>}
    <div className="tp-proposal-actions">
      {['PENDING','APPLIED'].includes(proposal.status)&&proposal.operations.some(x=>x.editable)&&
        <button type="button" className="tp-secondary" disabled={busy} onClick={()=>setEditing(true)}><Pencil size={15}/> Изменить</button>}
      {proposal.status==='PENDING'&&<><button className="tp-primary" disabled={busy||(checkup&&!selected.length)} onClick={()=>void act('approve')}><Check size={15}/>Принять</button>
        <button className="tp-secondary" disabled={busy} onClick={()=>void act('reject')}><X size={15}/>Отклонить</button></>}
      {proposal.status==='APPLIED'&&<button className="tp-secondary" disabled={busy} onClick={()=>void act('undo')}><RotateCcw size={15}/>Отменить</button>}
    </div>
    {!checkup&&!telegram&&<label className="tp-autoapply"><input type="checkbox" checked={autoApply} disabled={busy} onChange={e=>void toggle(e.target.checked)}/>Применять новые изменения автоматически</label>}
    {editing&&<EditModal title="Изменить задачи" onClose={()=>setEditing(false)} onSave={()=>void edit()} busy={busy}>
      {proposal.operations.map((op,i)=>op.editable?<fieldset key={i} className="tp-edit-group"><legend>{taskLabels[op.type]||'Задача'}: {op.title}</legend><TaskEditFields value={drafts[i]||op.editable} spheres={spheres} disabled={busy} onChange={value=>setDrafts(old=>({...old,[i]:value}))}/></fieldset>:null)}
      {error&&<p className="tp-proposal-error">{error}</p>}
    </EditModal>}
  </div>;
}

function FinanceFields({draft,proposal,options,change,disabled}:{
  draft:FinancePayload;proposal:EconomicAiProposal;options:FinanceOptions|null;
  change:(key:string,value:Value)=>void;disabled:boolean
}) {
  const kind=String(draft.kind??proposal.before?.kind??'EXPENSE');
  const choices=(key:string)=>key==='kind'?[{value:'EXPENSE',label:'Расход'},{value:'INCOME',label:'Доход'},{value:'TRANSFER',label:'Перевод'}]:
    key==='direction'?[{value:'OWE',label:'Я должен'},{value:'OWED_TO_ME',label:'Мне должны'}]:
    ['sourceAccountId','targetAccountId','accountId'].includes(key)?[{value:'',label:'Не выбран'},...(options?.accounts||[]).map(x=>({value:x.id,label:x.name}))]:
    key==='category'?[{value:'',label:'Без категории'},...(options?.categories||[]).filter(x=>x.kind===kind).map(x=>({value:x.name,label:x.name}))]:
    key==='postedToAccount'||key==='remindersEnabled'||key==='isClosed'?[{value:'true',label:'Да'},{value:'false',label:'Нет'}]:null;
  return <>{Object.entries(draft).filter(([key])=>key in financeFields).map(([key,value])=>{
    const list=choices(key);
    return <label key={key} className="tp-edit-field"><span>{financeFields[key]}</span>
      {list?<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel={financeFields[key]} options={list} disabled={disabled}
        value={typeof value==='boolean'?String(value):String(value??'')}
        onChange={input=>change(key,['postedToAccount','remindersEnabled','isClosed'].includes(key)?input==='true':input)}/>:
      dateKeys.includes(key)?<input type="date" disabled={disabled} value={String(value||'').slice(0,10)} onChange={e=>change(key,e.target.value)}/>:
      key==='note'?<textarea rows={3} disabled={disabled} value={String(value??'')} onChange={e=>change(key,e.target.value)}/>:
      <input disabled={disabled} type={key.endsWith('Minor')||['annualRateBps','termMonths'].includes(key)?'number':'text'} step={key.endsWith('Minor')?'0.01':undefined}
        value={String(value??'')} onChange={e=>change(key,e.target.value)}/>}
    </label>;
  })}</>;
}

export function TestPageFinanceProposal({initial,onApplied}:{initial:EconomicAiProposal;onApplied:()=>void}) {
  const [proposal,setProposal]=useState(initial);
  const [draft,setDraft]=useState<FinancePayload>(()=>financeDraft(initial));
  const [options,setOptions]=useState<FinanceOptions|null>(null);
  const [autoApply,setAutoApply]=useState(false);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    Promise.all([
      economicRead<EconomicAiProposal>('/proposals/'+encodeURIComponent(initial.id)),
      economicRead<{autoApply:boolean}>('/preferences'),
      economicRead<FinanceOptions>('/options')
    ]).then(([fresh,prefs,opts])=>{if(active){setProposal(fresh);setDraft(financeDraft(fresh));setAutoApply(prefs.autoApply);setOptions(opts);}}).catch(()=>{if(active)setError('Не удалось проверить предложение, обновите чат.');});
    return ()=>{active=false;};
  },[initial.id]);
  const reconcile=async()=>{
    const latest=await economicRead<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id));
    setProposal(latest);setDraft(financeDraft(latest));return latest;
  };
  const save=async()=>{
    setBusy(true);setError('');
    try{
      const latest=await economicRead<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id),'PUT',{
        payload:financeNormalize(draft,financeEditable(proposal)),
        expectedPayload:proposal.payload||{}
      });
      setProposal(latest);setDraft(financeDraft(latest));setEditing(false);
      if(latest.status==='APPLIED')onApplied();
    }catch(cause){await reconcile().catch(()=>undefined);setError(messageOf(cause));}
    finally{setBusy(false);}
  };
  const act=async(action:'approve'|'reject'|'undo')=>{
    setBusy(true);setError('');
    try{
      const latest=await economicRead<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id)+'/'+action,'POST');
      setProposal(latest);setDraft(financeDraft(latest));
      if(['APPLIED','UNDONE'].includes(latest.status))onApplied();
    }catch(cause){await reconcile().catch(()=>undefined);setError(messageOf(cause));}
    finally{setBusy(false);}
  };
  const toggle=async(next:boolean)=>{
    setBusy(true);setError('');
    try{const answer=await economicRead<{autoApply:boolean}>('/preferences','PUT',{autoApply:next});setAutoApply(answer.autoApply);}
    catch(cause){setError(messageOf(cause));}finally{setBusy(false);}
  };
  return <div className="tp-proposal" data-test-finance-proposal={proposal.id}>
    <div className="tp-proposal-head"><Coins size={19}/><div><strong>{proposal.entity==='operation'?'Финансовая операция':'Изменение финансов'}</strong><small>{statusLabels[proposal.status]||proposal.status}</small></div>{proposal.status==='APPLIED'&&<CheckCircle2 size={18}/>}</div>
    <div className="tp-proposal-items"><div className="tp-proposal-item"><div><small>{proposal.action==='create'?'Создание':'Редактирование'}</small><strong>{proposal.title}</strong>
      {proposal.description&&<span>{proposal.description}</span>}
      {(proposal.details||[]).slice(0,5).map((detail,i)=><span key={i}>{detail}</span>)}
    </div></div></div>
    {(error||proposal.error)&&<p className="tp-proposal-error" role="alert">{error||proposal.error}</p>}
    <div className="tp-proposal-actions">
      {['PENDING','APPLIED'].includes(proposal.status)&&<button className="tp-secondary" onClick={()=>setEditing(true)} disabled={busy}><Pencil size={15}/>Изменить</button>}
      {proposal.status==='PENDING'&&<><button className="tp-primary" disabled={busy} onClick={()=>void act('approve')}><Check size={15}/>Принять</button>
        <button className="tp-secondary" disabled={busy} onClick={()=>void act('reject')}><X size={15}/>Отклонить</button></>}
      {proposal.status==='APPLIED'&&<button className="tp-secondary" disabled={busy} onClick={()=>void act('undo')}><RotateCcw size={15}/>Отменить</button>}
    </div>
    <label className="tp-autoapply"><input type="checkbox" checked={autoApply} disabled={busy} onChange={e=>void toggle(e.target.checked)}/>Применять финансовые изменения автоматически</label>
    {editing&&<EditModal title="Изменить финансовую операцию" onClose={()=>setEditing(false)} onSave={()=>void save()} busy={busy}>
      <FinanceFields draft={draft} proposal={proposal} options={options} disabled={busy}
        change={(key,value)=>setDraft(prev=>({...prev,[key]:value}))}/>
      {error&&<p className="tp-proposal-error">{error}</p>}
    </EditModal>}
  </div>;
}
