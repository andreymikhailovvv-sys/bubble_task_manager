import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Loader2, RotateCcw, X } from 'lucide-react';
import './EconomicAiProposalCard.css';

export type EconomicAiProposal = {
  id:string;messageId:string|null;entity:string;action:string;
  title:string;description:string;details:string[];
  status:string;autoApplied:boolean;error:string|null;createdAt:string;
  appliedEntityId:string|null;
};
type Props={
  initial:EconomicAiProposal;
  autoApply:boolean;
  onAutoApplyChange:(next:boolean)=>Promise<void>;
  onRefresh:()=>Promise<void>;
};
const STATUS:Record<string,string>={
  PENDING:'Ожидает подтверждения',APPLYING:'Применяется',
  APPLIED:'Применено',REJECTED:'Отклонено',CONFLICT:'Конфликт изменений',
  UNDONE:'Отменено',UNDOING:'Отменяется'
};
const root='/api/economic/assistant';
async function read<T>(path:string,method:'GET'|'POST'='GET'):Promise<T>{
  const response=await fetch(root+path,{
    method,credentials:'include',cache:'no-store',
    headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body:'{}'}:{})
  });
  const json=await response.json().catch(()=>({})) as T&{error?:string};
  if(!response.ok)throw new Error(json.error||'Не удалось выполнить действие.');
  return json;
}
export function EconomicAiProposalCard({initial,autoApply,onAutoApplyChange,onRefresh}:Props){
  const [proposal,setProposal]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>setProposal(initial),[initial.id,initial.status]);
  const act=async(action:'approve'|'reject'|'undo')=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const updated=await read<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id)+'/'+action,'POST');
      setProposal(updated);
      if(updated.status==='APPLIED'||updated.status==='UNDONE')await onRefresh();
    }catch(cause){
      // A dropped connection after a committed mutation must not cause a
      // second blind attempt: reconcile the authoritative DB proposal first.
      try{
        const latest=await read<EconomicAiProposal>('/proposals/'+encodeURIComponent(proposal.id));
        setProposal(latest);
        if(latest.status==='APPLIED'||latest.status==='UNDONE')await onRefresh();
        else setError(cause instanceof Error?cause.message:'Не удалось применить изменения.');
      }catch{
        setError('Не удалось проверить результат. Обновите страницу перед повтором.');
      }
    }finally{setBusy(false);}
  };
  const toggle=async(enabled:boolean)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await onAutoApplyChange(enabled);}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить настройку.');}
    finally{setBusy(false);}
  };
  const applied=proposal.status==='APPLIED';
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
    {proposal.description&&<p className="econ-finance-description">{proposal.description}</p>}
    {proposal.details?.length>0&&<div className="econ-finance-proposal-details">
      {proposal.details.map((item,index)=><div key={index}>{item}</div>)}
    </div>}
    {error||proposal.error?<div role="alert" className="econ-finance-proposal-error">{error||proposal.error}</div>:null}
    {proposal.status==='PENDING'&&<div className="econ-finance-proposal-actions">
      <button type="button" className="econ-finance-primary" disabled={busy} onClick={()=>void act('approve')}>
        {busy?<Loader2 className="econ-spin" size={15}/>:<Check size={15}/>}Применить
      </button>
      <button type="button" className="econ-finance-secondary" disabled={busy} onClick={()=>void act('reject')}>
        <X size={14}/>Отклонить
      </button>
    </div>}
    {applied&&<button type="button" className="econ-finance-undo" disabled={busy} onClick={()=>void act('undo')}>
      {busy?<Loader2 className="econ-spin" size={14}/>:<RotateCcw size={14}/>}Отменить изменения
    </button>}
    <label className="econ-finance-autoapply">
      <input type="checkbox" checked={autoApply} disabled={busy}
        onChange={event=>void toggle(event.target.checked)}/>
      Автоматически применять новые изменения
    </label>
  </div>;
}
