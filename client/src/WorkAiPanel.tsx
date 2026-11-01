import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Bot, Send, RefreshCw, Radar, Plus, X, Wallet, Search, Maximize2, Minimize2, SendHorizontal, Loader2, Check, Copy, ChevronDown} from 'lucide-react';
import {AiModelChip} from './components/AiModelChip';
import {AutoGrowingTextarea} from './components/AutoGrowingTextarea';
import {TaskAiEmptyState} from './components/TaskAiEmptyState';
import {AiProgress} from './components/AiProgress';
import {WorkAiMessageBody} from './components/WorkAiMessageBody';
import {WorkAiProposalCard} from './components/WorkAiProposalCard';
import {AiReplyAction,AiReplyPreview,type AiReplyTarget} from './components/AiMessageReply';
import {serializeWorkAiReply} from './components/WorkAiReply';
import {TaskAiRecipientPicker} from './components/TaskAiRecipientPicker';
import {MessageActionArrow} from './components/MessageActionIcons';
import {WorkNotificationBell} from './components/WorkNotificationBell';
import type {AiChatModel,ChatMessage} from './lib/types';
import {api,type WorkAiMessage,type WorkAiJob,type WorkAiCredits,type WorkWorkspace} from './lib/api';
const models=[['gpt-6-luna','Luna'],['gpt-6.1-terra','Terra'],['gpt-6.1-sol','Sol']] as const;
const displayCredits=(milli:number)=> (milli/1000).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:3});
const errText=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить запрос';
export default function WorkAiPanel({organizationId,taskId,canManage,canSetModel,personalFocus=false,onCloseFocus,workspace,currentUserId,participantMemberIds}:
  {organizationId:string;taskId?:string;canManage:boolean;canSetModel?:boolean;personalFocus?:boolean;onCloseFocus?:()=>void;
  workspace?:WorkWorkspace;currentUserId?:string;participantMemberIds?:Array<string|null>}){
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
  const [progress,setProgress]=useState<'searching_tasks'|'forming_answer'>('searching_tasks');
  const [showTriggers,setShowTriggers]=useState(false);
  const [recipient,setRecipient]=useState('ai');
  const [replyTo,setReplyTo]=useState<AiReplyTarget|null>(null);
  const [composerFocused,setComposerFocused]=useState(false);
  const [pendingMessage,setPendingMessage]=useState<string|null>(null);
  const bottomRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const jump=()=>{
      const node=bottomRef.current;
      if(node){const thread=node.closest('.work-ai-history');if(thread)thread.scrollTop=thread.scrollHeight;}
      document.querySelectorAll<HTMLElement>('.work-personal-task-ai .focused-task-ai-thread-through')
        .forEach(thread=>{thread.scrollTop=thread.scrollHeight;});
    };
    jump();const raf=requestAnimationFrame(jump);return()=>cancelAnimationFrame(raf);
  },[history.length,pendingMessage,busy]);
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
  useEffect(()=>{
    if(!busy){setProgress('searching_tasks');return;}
    const timeout=window.setTimeout(()=>setProgress('forming_answer'),1400);
    return()=>window.clearTimeout(timeout);
  },[busy]);
  const send=async(event:FormEvent)=>{
    event.preventDefault();
    if(!text.trim()||busy)return;
    const question=serializeWorkAiReply(text.trim(),replyTo);
    const savedDraft=text, savedReply=replyTo;
    setText('');setReplyTo(null);setComposerFocused(false);
    setPendingMessage(text.trim());
    setBusy(true);setError('');
    try{
      if(taskId&&recipient!=='ai'){
        await api.workSendParticipantMessage(organizationId,taskId,recipient,question);
      }else{
        const result=await api.workAiAsk(organizationId,question,taskId);
        setCredits(result.credits);
      }
      const messages=await api.workAiHistory(organizationId,taskId);
      setHistory(messages.messages);
    }catch(e){setError(errText(e));setText(current=>current||savedDraft);setReplyTo(current=>current||savedReply);}
    finally{setPendingMessage(null);setBusy(false);}
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
  const selfMember=workspace?.members.find(m=>m.userId===currentUserId);
  const potentialRecipients=taskId&&workspace?workspace.members.filter(member=>
    member.id!==selfMember?.id&&(
      ['OWNER','ADMIN','MANAGER'].includes(member.role)||
      participantMemberIds?.includes(member.id)
    )):[];
  const recipientControl=taskId&&workspace&&composerFocused?<TaskAiRecipientPicker
    value={recipient} onChange={setRecipient}
    members={potentialRecipients.map(member=>({
      id:member.id,name:member.name||member.username||'Участник',
      color:['OWNER','ADMIN','MANAGER'].includes(member.role)?'#8b5cf6':'#0ea5b7'
    }))}/>:null;
  const labelFor=(m:WorkAiMessage)=>m.role==='assistant'?'ИИ':m.role==='human'?
    (m.sender?.user.name||m.sender?.user.username||'Участник') : m.role==='system'?'Мониторинг':
    (m.sender?.user.name||m.sender?.user.username||'Вы');
  const replyAction=(m:WorkAiMessage)=><><AiReplyAction
    message={{id:m.id,role:m.role==='assistant'?'assistant':'user',content:m.content} as ChatMessage}
    onReply={target=>{
      setReplyTo(target);
      if(m.role==='human'&&m.senderMemberId&&m.senderMemberId!==selfMember?.id&&
         potentialRecipients.some(member=>member.id===m.senderMemberId)){
        setRecipient(m.senderMemberId);
      }
    }}/>
    <button type="button" className="ai-message-forward-trigger" aria-label="Переслать сообщение (скоро)" title="Пересылка будет добавлена позже" disabled><MessageActionArrow direction="forward"/></button>
  </>;
  if(personalFocus){
    const modelAvailable=credits&&(['gpt-6-luna','gpt-6.1-terra','gpt-6.1-sol'].includes(credits.aiModel));
    const modelControl=(extraClass='')=>modelAvailable?<AiModelChip
      className={extraClass} value={credits.aiModel as AiChatModel}
      ariaLabel="Выбрать модель ИИ для корпоративной задачи"
      disabled={!canSetModel||monitoring}
      onChange={model=>{void api.workAiSetModel(organizationId,model).then(()=>load()).catch(e=>setError(errText(e)));}}/>:null;
    const monitoringPill=<button type="button" disabled={monitorBusy||!canManage}
      title={canManage?'Включить или выключить автомониторинг':'Управление доступно руководителю'}
      className={`work-focus-monitor-pill ${monitoring?'enabled':''}`}
      onClick={()=>void toggle()} aria-pressed={monitoring}>
      <Radar size={15}/><span>Автомониторинг</span><span className="sr-only">{monitoring?'включён':'выключен'}</span>
    </button>;
    const messageList=(expanded=false)=><>
      {searchOpen&&<label className="surface-input sticky top-0 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted">
        <Search size={12}/><input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Поиск по диалогу" className="w-full bg-transparent text-primary focus:outline-none"/>
      </label>}
      {filtered.length===0?(history.length===0?<TaskAiEmptyState/>:
        <p className="text-sm text-subtle">Сообщения не найдены</p>):filtered.map(message=><div key={message.id}
        className={`ai-message-forward-group w-fit max-w-[88%] ${message.role==='assistant'?'mr-auto':'ml-auto'}`}>
        <div className={`chat-message w-full rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role==='assistant'?'chat-message-assistant':'chat-message-user'}`}>
          <div className="mb-1 flex items-center justify-between">
            <p className="chat-message-label text-[11px] font-semibold uppercase tracking-wide">
              {labelFor(message)}{message.recipient?' → '+(message.recipient.user.name||message.recipient.user.username||'Участник'):''}</p>
            {message.role==='assistant'&&<button type="button" className="chat-message-copy transition" title="Копировать"
              onClick={()=>{void navigator.clipboard.writeText(message.content);}}><Copy size={12}/></button>}
          </div>
          <div><WorkAiMessageBody content={message.content}/></div>
        </div>
        {message.proposal&&<WorkAiProposalCard organizationId={organizationId} initial={message.proposal} onChanged={()=>void load().catch(e=>setError(errText(e)))}/>}
      <div className="ai-message-forward-actions flex justify-end">{replyAction(message)}</div></div>)}
      {pendingMessage&&<div className="ai-message-forward-group ml-auto w-fit max-w-[88%]">
        <div className="chat-message chat-message-user rounded-2xl px-4 py-3 text-[13px] break-words whitespace-pre-wrap">{pendingMessage}</div></div>}
      {busy&&<AiProgress status={progress}/>}
    </>;
    const composer=<div className="focused-task-ai-composer">
      {replyTo&&<AiReplyPreview target={replyTo} onDismiss={()=>setReplyTo(null)}/>}
      {recipientControl}
      {error&&<p role="alert" className="mb-2 shrink-0 text-xs text-rose-300">{error}</p>}
      <div className="ai-chat-composer flex items-center gap-2 rounded-3xl border p-2">
        <AutoGrowingTextarea className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm focus:ring-0"
          placeholder="Напишите сообщение…" value={text} onChange={e=>setText(e.target.value)} onFocus={()=>setComposerFocused(true)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();sendQuestion();}}}/>
        <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-500 disabled:opacity-50"
          disabled={busy||!text.trim()} onClick={sendQuestion} title="Отправить">
          {busy?<Loader2 size={17} className="animate-spin"/>:<SendHorizontal size={17}/>}
        </button>
      </div>
    </div>;
    const triggers=<div className="work-focus-monitor-triggers">
      <div className="work-focus-monitor-trigger-head"><strong>Триггеры задачи</strong>
        <button title="Закрыть" onClick={()=>setShowTriggers(false)}><X size={14}/></button></div>
      {canManage&&monitoring&&<form onSubmit={addTrigger} className="work-ai-trigger-form">
        <label>Время<input type="datetime-local" required value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
        <label>Что проверить<input value={instruction} minLength={5} maxLength={700} required
          onChange={e=>setInstruction(e.target.value)} placeholder="Инструкция для ИИ"/></label>
        <button disabled={monitorBusy||!dueAt||instruction.trim().length<5}><Plus size={14}/> Добавить</button>
      </form>}
      {jobs.filter(job=>job.state==='PENDING').map(job=><div className="work-ai-job" key={job.id}>
        <span><strong>{job.instruction}</strong><small>{new Date(job.dueAt).toLocaleString('ru-RU')}</small></span>
        {canManage&&<button type="button" disabled={monitorBusy} title="Отменить триггер"
          onClick={()=>{void cancel(job.id);}}><X size={14}/></button>}
      </div>)}
      {!jobs.some(job=>job.state==='PENDING')&&<p className="text-xs text-muted">Активных триггеров нет.</p>}
    </div>;
    return <div className="work-personal-task-ai flex h-full min-h-0 flex-col">
      <div className="work-focus-ai-toolbar">
        <p className="flex items-center gap-2 text-sm font-semibold ai-panel-title"><Bot size={16}/> Помощь ИИ</p>
        <div className="work-focus-ai-controls">
          {monitoringPill}
          <button type="button" className="focused-task-ai-icon-button" title="Управление триггерами"
            aria-expanded={showTriggers} onClick={()=>setShowTriggers(v=>!v)}><ChevronDown size={14}/></button>
          <button type="button" className={`focused-task-ai-icon-button ${searchOpen?'focused-task-ai-icon-button-active':''}`}
            title="Поиск по диалогу" onClick={()=>setSearchOpen(v=>!v)}><Search size={14}/></button>
          <button type="button" className="focused-task-ai-icon-button" title="Развернуть диалог"
            onClick={()=>setFocusExpanded(true)}><Maximize2 size={14}/></button>
          <button type="button" className="focused-task-ai-icon-button" title="Закрыть фокус задачи"
            onClick={onCloseFocus} aria-label="Закрыть окно"><X size={16}/></button>
        </div>
      </div>
      {showTriggers&&triggers}
      <div className="focused-task-ai-thread-region relative mb-2 min-h-0 flex-1">
        {modelControl('absolute left-1/2 top-0 z-20 -translate-x-1/2')}
        <div className="chat-thread focused-task-ai-thread-through h-full min-h-0 space-y-2 overflow-y-auto rounded-xl p-3 pt-12">
          {messageList()}
        </div>
      </div>
      {composer}
      {focusExpanded&&<div className="modal-backdrop fixed inset-0 z-[220] flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={()=>setFocusExpanded(false)}>
        <div className="ai-chat-lightweight ai-chat-lightweight-panel app-card focused-task-ai-expanded-panel relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border p-5"
          onClick={e=>e.stopPropagation()}>
          <div className="task-ai-fullscreen-header mb-3 flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-base font-semibold ai-panel-title"><Bot size={18}/> Полноэкранный диалог с ИИ</p>
              <p className="mt-1 truncate text-xs text-muted">Корпоративная задача</p>
            </div>
            <div className="task-ai-fullscreen-actions flex items-center justify-end gap-2">
              {monitoringPill}
              <button type="button" title="Поиск" onClick={()=>setSearchOpen(v=>!v)} className="focused-task-ai-icon-button"><Search size={14}/></button>
              <button type="button" title="Свернуть" onClick={()=>setFocusExpanded(false)} className="focused-task-ai-icon-button"><Minimize2 size={14}/></button>
              <button type="button" title="Закрыть" onClick={()=>{setFocusExpanded(false);onCloseFocus?.();}} className="focused-task-ai-icon-button"><X size={15}/></button>
            </div>
          </div>
          {modelControl('absolute left-1/2 top-[4.5rem] z-20 -translate-x-1/2')}
          <div className="chat-thread focused-task-ai-thread-through min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl p-4 pt-12">
            {messageList(true)}
          </div>
          <div className="focused-task-ai-composer focused-task-ai-composer-expanded">{composer}</div>
        </div>
      </div>}
    </div>;
  }
  return <section className={`work-ai-panel ${taskId?'work-ai-task-page':'work-ai-dispatcher'}`}>
    <header className="work-ai-dispatcher-header">
      <div className="work-ai-dispatcher-title"><Bot size={19}/><h2>{taskId?'Помощь ИИ по задаче':'ИИ-диспетчер компании'}</h2></div>
      <div className="work-ai-dispatcher-actions">
        <WorkNotificationBell organizationId={organizationId}/>
        {credits&&<div className="work-ai-dispatcher-wallet" title="Баланс организации. Точный баланс учитывается сервером" aria-label="Баланс организации">
          <Wallet size={16}/><span>{Math.floor(credits.aiCreditsMilli/1000).toLocaleString('ru-RU')} кр.</span>
        </div>}
        {credits&&<label className="work-ai-dispatcher-model" aria-label="Выбранная модель ИИ">
          <select value={credits.aiModel} disabled={!canSetModel||busy} onChange={e=>{
            void api.workAiSetModel(organizationId,e.target.value).then(()=>load()).catch(err=>setError(errText(err)));
          }}>{models.map(([id,title])=><option value={id} key={id}>{title}</option>)}</select>
        </label>}
        <button type="button" title="Обновить историю" aria-label="Обновить историю" disabled={busy}
          onClick={()=>void load().catch(e=>setError(errText(e)))}><RefreshCw size={16}/></button>
      </div>
    </header>
    {error&&<p className="work-ai-error" role="alert">{error}</p>}
    <div className="work-ai-dispatcher-thread work-ai-history" aria-live="polite">
      {loading&&<p className="work-muted">Загружаем диалог…</p>}
      {!loading&&!history.length&&<div className="work-ai-dispatcher-empty">
        <Bot size={35}/><h3>ИИ готов помочь</h3>
        <p>Спросите об активных проектах, задачах сотрудников или рисках компании.</p>
      </div>}
      {history.map(item=><div key={item.id} className={`ai-message-forward-group flex flex-col ${item.role==='assistant'?'items-start':'items-end'}`}>
        <div className={'work-ai-message '+(item.role==='assistant'?'assistant':'user')}>
        <small>{labelFor(item)}{item.recipient?' → '+(item.recipient.user.name||item.recipient.user.username||'Участник'):''} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small>
        <div><WorkAiMessageBody content={item.content}/></div>
        </div>
        {item.proposal&&<WorkAiProposalCard organizationId={organizationId} initial={item.proposal} onChanged={()=>void load().catch(e=>setError(errText(e)))}/>}
        <div className="ai-message-forward-actions flex justify-end">{replyAction(item)}</div>
      </div>)}
      {pendingMessage&&<div className="ai-message-forward-group flex flex-col items-end"><div className="work-ai-message user"><small>Вы · отправляется</small><div>{pendingMessage}</div></div></div>}
      {busy&&<AiProgress status={progress}/>}
      <div ref={bottomRef}/>
    </div>
    <div className="work-ai-dispatcher-bottom">
      {replyTo&&<AiReplyPreview target={replyTo} onDismiss={()=>setReplyTo(null)}/>}
      {recipientControl}
      <form className="ai-chat-composer work-ai-dispatcher-composer flex items-center gap-2 rounded-3xl border p-2"
        onSubmit={send}>
        <AutoGrowingTextarea className="form-field min-h-11 min-w-0 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm"
          value={text} onChange={e=>setText(e.target.value)} onFocus={()=>setComposerFocused(true)} maxLength={3000} disabled={busy}
          placeholder={taskId?'Напишите сообщение…':'Спросите о работе компании…'}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();sendQuestion();}}}/>
        <button type="submit" disabled={busy||!text.trim()} title="Отправить" aria-label="Отправить">
          {busy?<Loader2 size={17} className="animate-spin"/>:<SendHorizontal size={18}/>}
        </button>
      </form>
    </div>
    {taskId&&<div className="work-ai-monitor">
      <div className="work-ai-monitor-head"><strong><Radar size={17}/> Автомониторинг</strong>
        {canManage&&<button type="button" onClick={()=>void toggle()} disabled={monitorBusy} className={monitoring?'work-on':'work-off'}>{monitoring?'Включён':'Выключен'}</button>}</div>
      {monitoring&&canManage&&<form onSubmit={addTrigger} className="work-ai-trigger-form">
        <label>Время проверки<input type="datetime-local" required value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
        <label>Инструкция<input value={instruction} onChange={e=>setInstruction(e.target.value)} minLength={5} maxLength={700} required/></label>
        <button disabled={monitorBusy||!dueAt||instruction.trim().length<5}><Plus size={14}/> Добавить</button>
      </form>}
      <div className="work-ai-jobs">{jobs.filter(job=>job.state==='PENDING').map(job=><div key={job.id} className="work-ai-job">
        <span>{job.instruction} · {new Date(job.dueAt).toLocaleString('ru-RU')}</span>
        {canManage&&<button onClick={()=>void cancel(job.id)} title="Отменить"><X size={14}/></button>}
      </div>)}</div>
    </div>}
  </section>;
}
