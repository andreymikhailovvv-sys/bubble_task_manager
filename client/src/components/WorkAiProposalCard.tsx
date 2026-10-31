import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Loader2, X } from 'lucide-react';
import { api, type WorkAiProposal } from '../lib/api';
import './AiTaskProposalCard.css';

export const workAiProposalAppliedEvent='work-ai-proposal-applied';
const statusLabel:Record<WorkAiProposal['status'],string>={
  PENDING:'Ожидает подтверждения',APPLYING:'Применяется',APPLIED:'Применено',
  REJECTED:'Отклонено',CONFLICT:'Конфликт изменений',FAILED:'Ошибка применения'
};
export function WorkAiProposalCard({organizationId,initial,onChanged}:{
  organizationId:string;initial:WorkAiProposal;onChanged?:()=>void
}){
  const [proposal,setProposal]=useState(initial);
  const [expanded,setExpanded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{setProposal(initial);setExpanded(false);setError('');},[initial.id]);
  useEffect(()=>{
    if(!initial.canConfirm)return;
    let active=true;
    void api.getWorkAiProposal(organizationId,initial.id).then(({proposal:value})=>{
      if(active)setProposal(value);
    }).catch(()=>{});
    return()=>{active=false;};
  },[organizationId,initial.id,initial.canConfirm]);
  const changed=(updated:WorkAiProposal)=>{
    setProposal(updated);
    if(updated.status==='APPLIED'){
      window.dispatchEvent(new Event(workAiProposalAppliedEvent));
      onChanged?.();
    }
  };
  const run=async(action:'approve'|'reject')=>{
    if(busy||proposal.status!=='PENDING'||!proposal.canConfirm)return;
    setBusy(true);setError('');
    try{
      const response=action==='approve'
        ?await api.approveWorkAiProposal(organizationId,proposal.id)
        :await api.rejectWorkAiProposal(organizationId,proposal.id);
      changed(response.proposal);
    }catch(cause){
      // A timed-out reply may have been committed. Read the durable status
      // before allowing another click, matching the personal proposal chip.
      try{
        const {proposal:actual}=await api.getWorkAiProposal(organizationId,proposal.id);
        changed(actual);
        if(actual.status==='PENDING')setError(cause instanceof Error?cause.message:'Не удалось выполнить запрос');
      }catch{setError('Статус не подтверждён. Обновите страницу перед повторной попыткой.');}
    }finally{setBusy(false);}
  };
  const visible=expanded?proposal.operations:proposal.operations.slice(0,4);
  return <div className="ai-task-proposal mt-3 w-full max-w-[580px] rounded-2xl border p-3 text-sm" data-work-ai-proposal={proposal.id}>
    <div className="flex items-center gap-2">
      <span className="ai-task-proposal__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"><ClipboardCheck size={17}/></span>
      <div className="min-w-0 flex-1">
        <strong className="block">Изменения проектов и поручений</strong>
        <span className="ai-task-proposal__muted text-xs">{proposal.operations.length} действий · {statusLabel[proposal.status]}</span>
      </div>
      {proposal.status==='APPLIED'&&<CheckCircle2 size={18} className="text-emerald-500"/>}
      {(proposal.status==='CONFLICT'||proposal.status==='FAILED')&&<AlertTriangle size={17} className="text-amber-500"/>}
    </div>
    <div className="mt-3 space-y-1.5">
      {visible.map((item,index)=><div key={index} className="ai-task-proposal__item rounded-xl border px-3 py-2">
        <span className="ai-task-proposal__muted block text-[11px]">{
          ({create_project:'Новый проект',update_project:'Изменение проекта',
            create_task:'Новое поручение',update_task:'Изменение поручения',
            create_subtask:'Новая подзадача',update_subtask:'Изменение подзадачи'} as Record<string,string>)[item.type]||'Изменение'
        }</span>
        <span className="block break-words font-semibold">{item.title}</span>
        {item.details?.map((detail,j)=><div key={j} className="ai-task-proposal__muted mt-1 break-words text-xs">{detail}</div>)}
      </div>)}
      {proposal.operations.length>4&&<button type="button"
        className="ai-task-proposal__expand flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold"
        onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
        {expanded?'Свернуть':'Показать все изменения'}</button>}
    </div>
    {(proposal.error||error)&&<p className="ai-task-proposal__error mt-2 text-xs" role="alert">{proposal.error||error}</p>}
    {proposal.status==='PENDING'&&proposal.canConfirm?<div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={()=>void run('approve')}
          className="ai-task-proposal__primary flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-semibold disabled:opacity-50">
          {busy?<Loader2 size={15} className="animate-spin"/>:<Check size={15}/>}Принять</button>
        <button type="button" disabled={busy} onClick={()=>void run('reject')}
          className="ai-task-proposal__secondary flex items-center justify-center gap-1 rounded-xl border px-3 py-2.5 font-medium disabled:opacity-50">
          <X size={14}/>Отклонить</button>
      </div>
      <p className="ai-task-proposal__muted text-xs">Изменения не вносятся до подтверждения.</p>
    </div>:<p className="ai-task-proposal__muted mt-3 text-xs" role="status">
      {proposal.status==='PENDING'&&!proposal.canConfirm?'Подтвердить может только автор запроса.':statusLabel[proposal.status]}
    </p>}
  </div>;
}
