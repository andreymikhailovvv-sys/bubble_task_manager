import {useEffect,useState,type FormEvent} from 'react';
import {Bot, Send, RefreshCw, Radar, Plus, X, Wallet} from 'lucide-react';
import {api,type WorkAiMessage,type WorkAiJob,type WorkAiCredits} from './lib/api';
const models=[['gpt-6-luna','Luna'],['gpt-6.1-terra','Terra'],['gpt-6.1-sol','Sol']] as const;
const displayCredits=(milli:number)=> (milli/1000).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:3});
const errText=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить запрос';
export default function WorkAiPanel({organizationId,taskId,canManage,canSetModel}:
  {organizationId:string;taskId?:string;canManage:boolean;canSetModel?:boolean}){
  const [history,setHistory]=useState<WorkAiMessage[]>([]);
  const [credits,setCredits]=useState<WorkAiCredits|null>(null);
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [monitoring,setMonitoring]=useState(false);
  const [jobs,setJobs]=useState<WorkAiJob[]>([]);
  const [instruction,setInstruction]=useState('');
  const [dueAt,setDueAt]=useState('');
  const [monitorBusy,setMonitorBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const load=async()=>{
    const calls=[api.workAiHistory(organizationId,taskId),api.workAiBalance(organizationId)];
    const [messages,balance]=await Promise.all(calls);
    setHistory(messages.messages);setCredits(balance.credits);
    if(taskId){
      const state=await api.workMonitoringStatus(organizationId,taskId);
      setMonitoring(state.enabled);setJobs(state.jobs);
    }
  };
  useEffect(()=>{
    let mounted=true;
    setHistory([]);setCredits(null);setLoading(true);setError('');
    void (async()=>{
      const [messages,balance,monitor]=await Promise.all([
        api.workAiHistory(organizationId,taskId),
        api.workAiBalance(organizationId),
        taskId?api.workMonitoringStatus(organizationId,taskId):Promise.resolve(null)
      ]);
      if(!mounted)return;
      setHistory(messages.messages);setCredits(balance.credits);
      if(monitor){setMonitoring(monitor.enabled);setJobs(monitor.jobs);}
    })().catch(e=>{if(mounted)setError(errText(e));})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[organizationId,taskId]);
  const send=async(event:FormEvent)=>{
    event.preventDefault();
    if(!text.trim()||busy)return;
    const question=text.trim();
    setBusy(true);setError('');
    try{
      const result=await api.workAiAsk(organizationId,question,taskId);
      setCredits(result.credits);setText('');
      const messages=await api.workAiHistory(organizationId,taskId);
      setHistory(messages.messages);
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  };
  const toggle=async()=>{
    if(!taskId)return;
    setMonitorBusy(true);setError('');
    try{
      const result=await api.workMonitoringSet(organizationId,taskId,!monitoring);
      setMonitoring(result.enabled);
      const response=await api.workMonitoringStatus(organizationId,taskId);
      setJobs(response.jobs);
    }catch(e){setError(errText(e));}finally{setMonitorBusy(false);}
  };
  const addTrigger=async(event:FormEvent)=>{
    event.preventDefault();
    if(!taskId||!dueAt||instruction.trim().length<5)return;
    setMonitorBusy(true);setError('');
    try{
      await api.workMonitoringAddTrigger(organizationId,taskId,new Date(dueAt).toISOString(),instruction.trim());
      const result=await api.workMonitoringStatus(organizationId,taskId);
      setJobs(result.jobs);setInstruction('');setDueAt('');
    }catch(e){setError(errText(e));}finally{setMonitorBusy(false);}
  };
  const cancel=async(id:string)=>{
    if(!taskId)return;setMonitorBusy(true);setError('');
    try{
      await api.workMonitoringCancelTrigger(organizationId,taskId,id);
      const result=await api.workMonitoringStatus(organizationId,taskId);setJobs(result.jobs);
    }catch(e){setError(errText(e));}finally{setMonitorBusy(false);}
  };
  return <section className="work-ai-panel">
    <div className="work-ai-heading"><div><h2><Bot size={20}/>{taskId?'Помощь ИИ по задаче':'ИИ-диспетчер компании'}</h2>
      <p>ИИ использует только корпоративные проекты и поручения, не личные данные сотрудников.</p></div>
      <button type="button" title="Обновить" aria-label="Обновить историю" onClick={()=>{void load().catch(e=>setError(errText(e)));}} disabled={busy}><RefreshCw size={17}/></button>
    </div>
    <div className="work-ai-wallet"><Wallet size={17}/><span>Баланс организации:</span>
      <strong>{credits?displayCredits(credits.aiCreditsMilli):'…'} кредитов</strong>
      {credits&&<small>Потрачено: {displayCredits(credits.spentMilli)}</small>}
    </div>
    {canSetModel&&credits&&<label className="work-ai-model">Модель компании<select value={credits.aiModel} disabled={busy} onChange={e=>{
      void api.workAiSetModel(organizationId,e.target.value).then(()=>load()).catch(err=>setError(errText(err)));
    }}>{models.map(([id,title])=><option value={id} key={id}>{title}</option>)}</select></label>}
    {error&&<p className="work-ai-error" role="alert">{error}</p>}
    {loading?<p className="work-muted">Загружаем диалог…</p>:<div className="work-ai-history" aria-live="polite">
      {!history.length&&<div className="work-muted">Диалог пока пуст. Запросите сводку по проекту, проверьте риски или уточните следующий шаг.</div>}
      {history.map(item=><div key={item.id} className={'work-ai-message '+(item.role==='assistant'?'assistant':'user')}>
        <small>{item.role==='assistant'?'ИИ':item.role==='system'?'Автомониторинг':'Вы'} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small>
        <div>{item.content}</div>
      </div>)}
    </div>}
    <form className="work-ai-compose" onSubmit={send}>
      <textarea value={text} onChange={e=>setText(e.target.value)} maxLength={3000} rows={3}
        placeholder={taskId?'Спроси ИИ о ходе выполнения задачи…':'Например: какие проекты требуют внимания сегодня?'}
        required disabled={busy}/>
      <button type="submit" disabled={busy||!text.trim()}><Send size={16}/>{busy?'Формируем ответ…':'Отправить'}</button>
    </form>
    {taskId&&<div className="work-ai-monitor">
      <div className="work-ai-monitor-head"><strong><Radar size={18}/>Автомониторинг</strong>
        {canManage&&<button type="button" onClick={()=>{void toggle();}} disabled={monitorBusy} className={monitoring?'work-on':'work-off'}>{monitoring?'Включён':'Выключен'}</button>}
        {!canManage&&<span>{monitoring?'Включён':'Выключен'}</span>}
      </div>
      <p>При наступлении срока или времени триггера сервер запросит анализ ИИ и запишет его в этот диалог. Кредиты списываются с баланса организации.</p>
      {monitoring&&canManage&&<form onSubmit={addTrigger} className="work-ai-trigger-form">
        <label>Время проверки<input type="datetime-local" required value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
        <label>Инструкция для ИИ<input value={instruction} onChange={e=>setInstruction(e.target.value)} required minLength={5} maxLength={700} placeholder="Что проверить?"/></label>
        <button disabled={monitorBusy||instruction.trim().length<5||!dueAt}><Plus size={15}/>Добавить триггер</button>
      </form>}
      <div className="work-ai-jobs">{jobs.map(job=><div key={job.id} className="work-ai-job">
        <span><strong>{job.instruction}</strong><small>{new Date(job.dueAt).toLocaleString('ru-RU')} · {job.state}</small></span>
        {job.state==='PENDING'&&job.id&&job.instruction&&canManage&&
         <button type="button" onClick={()=>{void cancel(job.id);}} disabled={monitorBusy||!job.instruction} title="Отменить триггер"><X size={14}/></button>}
      </div>)}</div>
    </div>}
  </section>;
}
