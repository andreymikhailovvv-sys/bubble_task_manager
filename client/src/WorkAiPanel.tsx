import {useEffect,useState,type FormEvent} from 'react';
import {Bot, Send, RefreshCw, Radar, Plus, X, Wallet, Search, Maximize2, SendHorizontal, Loader2} from 'lucide-react';
import {AiModelChip} from './components/AiModelChip';
import {AutoGrowingTextarea} from './components/AutoGrowingTextarea';
import {TaskAiEmptyState} from './components/TaskAiEmptyState';
import type {AiChatModel} from './lib/types';
import {api,type WorkAiMessage,type WorkAiJob,type WorkAiCredits} from './lib/api';
const models=[['gpt-6-luna','Luna'],['gpt-6.1-terra','Terra'],['gpt-6.1-sol','Sol']] as const;
const displayCredits=(milli:number)=> (milli/1000).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:3});
const errText=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить запрос';
export default function WorkAiPanel({organizationId,taskId,canManage,canSetModel,personalFocus=false}:
  {organizationId:string;taskId?:string;canManage:boolean;canSetModel?:boolean;personalFocus?:boolean}){
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
    const [messages,balance]=await Promise.all([
      api.workAiHistory(organizationId,taskId),
      api.workAiBalance(organizationId)
    ]);
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
  const [search,setSearch]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const [focusExpanded,setFocusExpanded]=useState(false);
  const filtered=history.filter(message=>!search.trim()||message.content.toLowerCase().includes(search.trim().toLowerCase()));
  const sendQuestion=()=>{
    if(busy||!text.trim())return;
    const event={preventDefault:()=>undefined} as FormEvent;
    void send(event);
  };
  if(personalFocus){
    return <div className="work-personal-task-ai flex h-full min-h-0 flex-col">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5">
        <button type="button" className={`focused-task-ai-icon-button ${searchOpen?'focused-task-ai-icon-button-active':''}`}
          title="Поиск по диалогу" onClick={()=>setSearchOpen(!searchOpen)}><Search size={14}/></button>
        <button type="button" className="focused-task-ai-icon-button" title="Развернуть диалог"
          onClick={()=>setFocusExpanded(true)}><Maximize2 size={14}/></button>
      </div>
      <div className="mb-3 flex shrink-0 items-start justify-between gap-3 pr-32">
        <p className="flex items-center gap-2 text-sm font-semibold ai-panel-title"><Bot size={16}/> Помощь ИИ</p>
      </div>
      <div className="focused-task-ai-thread-region relative mb-2 min-h-0 flex-1">
        {credits&&(['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol'].includes(credits.aiModel))&&
          <AiModelChip className="absolute left-1/2 top-0 z-20 -translate-x-1/2"
            value={credits.aiModel as AiChatModel} ariaLabel="Модель ИИ для задачи"
            disabled={!canSetModel||monitoring} onChange={model=>{
              void api.workAiSetModel(organizationId,model).then(()=>load()).catch(e=>setError(errText(e)));
            }}/>}
        <div className="chat-thread focused-task-ai-thread-through h-full min-h-0 space-y-2 overflow-y-auto rounded-xl p-3 pt-12">
          {searchOpen&&<label className="surface-input sticky top-0 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted">
            <Search size={12}/><input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Поиск по сообщениям" className="w-full bg-transparent text-[11px] text-primary focus:outline-none"/>
          </label>}
          {filtered.length===0?<TaskAiEmptyState/>:filtered.map(message=><div key={message.id}
            className={`ai-message-forward-group w-fit max-w-[88%] ${message.role==='assistant'?'mr-auto':'ml-auto'}`}>
            <div className={`chat-message w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role==='assistant'?'chat-message-assistant':'chat-message-user'}`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="chat-message-label text-[11px] font-semibold uppercase tracking-wide">
                  {message.role==='assistant'?'ИИ':message.role==='system'?'Мониторинг':'Вы'}
                </p>
                <button type="button" className="chat-message-copy transition" title="Копировать"
                  onClick={()=>{void navigator.clipboard.writeText(message.content);}}>⧉</button>
              </div>
              <div>{message.content}</div>
            </div>
          </div>)}
          {busy&&<p className="text-xs text-muted"><Loader2 className="inline animate-spin" size={14}/> Формируем ответ…</p>}
        </div>
      </div>
      <div className="focused-task-ai-composer">
        {error&&<p role="alert" className="mb-2 shrink-0 text-[11px] text-rose-300">{error}</p>}
        <div className="ai-chat-composer mt-2 flex shrink-0 items-center gap-2 rounded-3xl border p-2">
          <AutoGrowingTextarea className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm focus:ring-0"
            placeholder="Напишите сообщение…" value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();sendQuestion();}}}/>
          <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-500 disabled:opacity-50"
            disabled={busy||!text.trim()} onClick={sendQuestion} title="Отправить">
            {busy?<Loader2 size={17} className="animate-spin"/>:<SendHorizontal size={17}/>}
          </button>
        </div>
        <div className="work-personal-task-ai-monitor">
          <div className="work-ai-monitor-head"><strong><Radar size={15}/>Автомониторинг</strong>
            {canManage&&<button type="button" className={monitoring?'work-on':'work-off'} disabled={monitorBusy}
              onClick={()=>{void toggle();}}>{monitoring?'Включён':'Выключен'}</button>}
            {!canManage&&<span>{monitoring?'Включён':'Выключен'}</span>}
          </div>
          {monitoring&&canManage&&<form onSubmit={addTrigger} className="work-ai-trigger-form">
            <label>Время<input type="datetime-local" required value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
            <label>Проверить<input value={instruction} minLength={5} maxLength={700} required
              onChange={e=>setInstruction(e.target.value)} placeholder="Инструкция для ИИ"/></label>
            <button disabled={monitorBusy||!dueAt||instruction.trim().length<5}><Plus size={14}/></button>
          </form>}
          {jobs.filter(job=>job.state==='PENDING').map(job=><div className="work-ai-job" key={job.id}>
            <span><strong>{job.instruction}</strong><small>{new Date(job.dueAt).toLocaleString('ru-RU')}</small></span>
            {canManage&&<button type="button" disabled={monitorBusy} title="Отменить триггер"
              onClick={()=>{void cancel(job.id);}}><X size={14}/></button>}
          </div>)}
        </div>
      </div>
      {focusExpanded&&<div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-3"
        onClick={()=>setFocusExpanded(false)}>
        <div className="ai-chat-lightweight-panel app-card focused-task-ai-expanded-panel flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border p-5"
          onClick={e=>e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold ai-panel-title">Помощь ИИ</h3>
            <button className="focused-task-ai-icon-button" title="Закрыть" onClick={()=>setFocusExpanded(false)}><X size={15}/></button>
          </div>
          <div className="chat-thread min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {history.map(message=><div key={message.id} className={`chat-message rounded-xl p-3 ${message.role==='assistant'?'chat-message-assistant':'chat-message-user'}`}>
              <strong>{message.role==='assistant'?'ИИ':'Вы'}</strong><p className="whitespace-pre-wrap">{message.content}</p>
            </div>)}
          </div>
          <div className="ai-chat-composer mt-2 flex items-center gap-2 rounded-3xl border p-2">
            <AutoGrowingTextarea value={text} onChange={e=>setText(e.target.value)}
              className="form-field min-h-11 flex-1 resize-none border-0 bg-transparent p-2" placeholder="Напишите сообщение…"
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();sendQuestion();}}}/>
            <button type="button" className="rounded-full bg-violet-600 p-3" disabled={!text.trim()||busy} onClick={sendQuestion}>
              <SendHorizontal size={17}/></button>
          </div>
        </div>
      </div>}
    </div>;
  }
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
