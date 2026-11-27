import {useEffect,useRef,useState} from 'react';
import {api,type AssistantSettingsProposal} from '../lib/api';
const labels:Record<string,string>={summaryInstructions:'Как делать сводки',suggestWhen:'Когда предлагать ответы',suggestHow:'Как предлагать ответы',autoReplyWhen:'Когда отвечать автоматически',autoReplyHow:'Как отвечать автоматически',taskCreationWhen:'Когда создавать задачи',replyMode:'Режим ответов'};
const modeLabels:Record<string,string>={OBSERVE:'Наблюдение',SUGGEST:'Предлагать ответы',AUTO:'Автоответы'};
export function AssistantSettingsProposalCard({id}:{id:string}){
  const [proposal,setProposal]=useState<AssistantSettingsProposal|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  useEffect(()=>{let alive=true;const refresh=()=>void api.getAssistantSettingsProposal(id).then(p=>{if(alive)setProposal(p)}).catch(()=>{if(alive)setError('Не удалось загрузить изменения')});refresh();const timer=window.setInterval(refresh,15000);return()=>{alive=false;window.clearInterval(timer)}},[id]);
  async function apply(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{const next=await api.applyAssistantSettingsProposal(id);setProposal(next)}catch(e){setError(e instanceof Error?e.message:'Не удалось применить изменения')}finally{inFlight.current=false;setBusy(false)}}
  return <div className="mt-2 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
    <div className="font-semibold text-sm">Настройки {proposal?.kind==='mail'?'почтового':'Telegram'} ассистента</div>
    {proposal&&<><div className="mt-1 opacity-70 break-words">{proposal.targetLabel}</div>{proposal.changes.map(c=><div className="mt-2 border-t border-current/10 pt-2" key={c.field}><div className="font-semibold">{labels[c.field]??c.field}</div><div className="mt-1 opacity-60 whitespace-pre-wrap break-words">Было: {modeLabels[c.before]??(c.before||'Не задано')}</div><div className="mt-1 whitespace-pre-wrap break-words">Станет: {modeLabels[c.after]??(c.after||'Не задано')}</div></div>)}
    <button type="button" disabled={busy||proposal.status!=='PENDING'} onClick={()=>void apply()} className="mt-3 rounded-xl bg-sky-500/15 border border-sky-500/40 px-3 py-2 font-semibold text-sky-500 disabled:opacity-60">{proposal.status==='APPLIED'?'✓ Применено':proposal.status==='CONFLICT'?'Настройки уже изменились':busy?'Применяем…':'Подтвердить изменения'}</button></>}
    {error&&<div className="mt-2 text-rose-500">{error}</div>}
  </div>
}
