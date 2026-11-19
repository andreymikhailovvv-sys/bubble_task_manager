import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Copy, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { api } from './lib/api';
import type { AiChatModel, ChatMessage, Sphere, Task } from './lib/types';
import { CustomSelect } from './components/CustomSelect';
import { VoiceInputButton } from './components/VoiceInputButton';
import { WorkAiMessageBody } from './components/WorkAiMessageBody';
import { TestPageTaskProposal, TestPageFinanceProposal } from './TestPageProposalCards';
import { AiGeneratedDocumentButton } from './components/AiGeneratedDocumentButton';
import { WebCitations } from './components/WebCitations';
import { TelegramInlineSendCard } from './components/TelegramInlineSendCard';
import { MailInlineSendCard } from './components/MailInlineSendCard';
import { serializeAiReply, AiReplyPreview, type AiReplyTarget, makeAiReplyTarget } from './components/AiMessageReply';

type Props = {
  task?: Task | null;
  tasks: Task[];
  spheres: Sphere[];
  onClose: () => void;
  onOpenTask: (task: Task) => void;
  onDataChanged: () => void;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
};
const MODEL_OPTIONS = [
  {value:'gpt-6-luna',label:'GPT-6 Luna'},
  {value:'gpt-6.1-terra',label:'GPT-6.1 Terra'},
  {value:'gpt-6.1-sol',label:'GPT-6.1 Sol'}
];
const TASK_REF = /\[\[task_ref=([^\]]+)\]\]|\[\[task_ref:([^|\]]+)\|([^\]]+)\]\]/g;
function refs(content:string, tasks:Task[]):Task[] {
  const ids=new Set<string>();
  for(const m of content.matchAll(new RegExp(TASK_REF.source,'g'))){ids.add((m[1]||m[2]||'').trim());}
  return tasks.filter(task=>ids.has(task.id));
}
const messageError=(error:unknown)=>error instanceof Error?error.message:'Не удалось отправить сообщение.';

export function TestPageChat({task,tasks,spheres,onClose,onOpenTask,onDataChanged,initialMessages,onMessagesChange}:Props) {
  const [model,setModel]=useState<AiChatModel>('gpt-6-luna');
  const [draft,setDraft]=useState('');
  const [messages,setMessages]=useState<ChatMessage[]>(initialMessages||[]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(!!task);
  const [error,setError]=useState('');
  const [replyTo,setReplyTo]=useState<AiReplyTarget|null>(null);
  const [copied,setCopied]=useState<number|null>(null);
  const endRef=useRef<HTMLDivElement|null>(null);
  const inFlight=useRef(false);

  useEffect(()=>{
    setModel('gpt-6-luna');
    setDraft('');
    setReplyTo(null);
    setError('');
    if(!task){setMessages(initialMessages||[]);setLoading(false);return;}
    let active=true;
    setMessages([]);setLoading(true);
    void api.getTaskAssistantHistory(task.id).then(({messages})=>{
      if(active)setMessages(messages);
    }).catch(cause=>{if(active)setError(messageError(cause));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[task?.id]);

  useEffect(()=>{if(!task&&initialMessages)setMessages(initialMessages);},[initialMessages,task?.id]);
  useEffect(()=>{endRef.current?.scrollIntoView({block:'end',behavior:'smooth'});},[messages.length,busy,loading]);
  const taskRefs=useMemo(()=>new Map(tasks.map(task=>[task.id,task])),[tasks]);
  const submit=async (message=draft)=>{
    const question=message.trim();
    if(!question||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    const forAi=serializeAiReply(question,replyTo);
    setReplyTo(null);setDraft('');
    const previous=messages;
    const userMessage:ChatMessage={id:crypto.randomUUID(),role:'user',content:forAi};
    setMessages(old=>[...old,userMessage]);
    try{
      if(task){
        const answer=await api.askTaskAssistant(task.id,{
          question:forAi, model, clientSurface:'web', interactionContext:'focus'
        });
        // The task conversation is owned by the server. Read it back so
        // proposals and replies share the same history as the classic Focus.
        const latest=await api.getTaskAssistantHistory(task.id).catch(()=>null);
        if(latest)setMessages(latest.messages);
        else setMessages(old=>[...old,{id:crypto.randomUUID(),role:'assistant',content:answer.answer,taskProposal:answer.taskProposal||null}]);
      }else{
        const answer=await api.askAiChat({question:forAi,history:previous,model,clientSurface:'web'});
        const responseMessage:ChatMessage={
          id:crypto.randomUUID(),role:'assistant',content:answer.answer,
          taskProposal:answer.taskProposal||null,
          economicProposals:answer.economicProposals,
          generatedDocument:answer.generatedDocument||undefined,
          webSearchUsed:answer.webSearchUsed,
          webSources:answer.webSources,webCitations:answer.webCitations,
          telegramSendDraft:answer.telegramSendDraft||undefined,
          mailSendDraft:answer.mailSendDraft||undefined
        };
        setMessages(old=>[...old,responseMessage]);
        onMessagesChange?.([...previous,userMessage,responseMessage]);
        if(answer.taskDataChanged)onDataChanged();
      }
    }catch(cause){setMessages(previous);setDraft(question);setError(messageError(cause));}
    finally{inFlight.current=false;setBusy(false);}
  };
  const copy=async(content:string,index:number)=>{
    try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setError('Не удалось скопировать сообщение.');}
  };
  const title=task?'ИИ по задаче':'Планик AI';
  return <aside className={'tp-assistant '+(task?'tp-task-chat':'')} role="dialog" aria-label={title} aria-modal={!!task}>
    <header><div className="tp-chat-avatar"><MessageCircle size={19}/></div><div><strong>{title}</strong><small>{task?task.title:'Помощник по задачам'}</small></div>
      <button type="button" onClick={onClose} aria-label="Закрыть чат"><X size={18}/></button></header>
    <div className="tp-chat-model"><span>Модель ИИ</span><CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" value={model} options={MODEL_OPTIONS} onChange={value=>setModel(value as AiChatModel)} ariaLabel="Выбор модели ИИ"
      disabled={busy || (task?.aiMonitoringEnabled === true)} /></div>
    <div className="tp-chat-list">
      {loading&&<div className="tp-loading"><Loader2 className="tp-spin" size={19}/>Загрузка переписки…</div>}
      {!loading&&!messages.length&&<div className="tp-chat-welcome"><Sparkles size={24}/><strong>{task?'Спросите ИИ об этой задаче':'Чем помочь сегодня?'}</strong>
        <p>{task?'Обсудите выполнение, подзадачи и сроки. Предложения можно проверить перед применением.':'Обсудите свои задачи, план на день или следующий шаг.'}</p></div>}
      {messages.map((message,index)=><article className={'tp-chat-message '+(message.role==='user'?'mine':'')} key={message.id||index}>
        <div className="tp-message-top"><span>{message.role==='user'?'Вы':'ИИ'}</span><button type="button" aria-label="Копировать сообщение" onClick={()=>void copy(message.content,index)}>{copied===index?<Check size={13}/>:<Copy size={13}/>}</button></div>
        <div className="tp-message-body">
          <WorkAiMessageBody content={message.content.replace(TASK_REF,'').trim()}/>
        </div>
        {message.role==='assistant'&&refs(message.content,tasks).length>0&&<div className="tp-task-references">
          {refs(message.content,tasks).map(ref=><button type="button" key={ref.id}
            onClick={()=>onOpenTask(taskRefs.get(ref.id)||ref)}><ArrowUpRight size={14}/>{ref.title}</button>)}
        </div>}
        {message.role==='assistant'&&message.taskProposal&&
          <TestPageTaskProposal key={message.taskProposal.id} initial={message.taskProposal} spheres={spheres} onApplied={onDataChanged}/>}
        {message.role==='assistant'&&message.economicProposals?.map(proposal=>
          <TestPageFinanceProposal key={proposal.id} initial={proposal} onApplied={onDataChanged}/>)}
        {message.role==='assistant'&&message.generatedDocument&&<AiGeneratedDocumentButton document={message.generatedDocument}/>}
        {message.role==='assistant'&&message.webSearchUsed&&<WebCitations sources={message.webSources} searched={message.webSearchUsed}/>}
        {message.role==='assistant'&&message.telegramSendDraft&&<TelegramInlineSendCard draft={message.telegramSendDraft}/>}
        {message.role==='assistant'&&message.mailSendDraft&&<MailInlineSendCard draft={message.mailSendDraft}/>}
        <button type="button" className="tp-reply-button" onClick={()=>setReplyTo(makeAiReplyTarget(message))}>Ответить</button>
      </article>)}
      {busy&&<span className="tp-chat-loading"><Loader2 size={15} className="tp-spin"/>ИИ обрабатывает запрос…</span>}
      {error&&<p className="tp-alert" role="alert">{error}</p>}
      <div ref={endRef}/>
    </div>
    {replyTo&&<div className="tp-reply-zone"><AiReplyPreview target={replyTo} onDismiss={()=>setReplyTo(null)} compact/></div>}
    <form className="tp-chat-compose" onSubmit={(event:FormEvent)=>{event.preventDefault();void submit();}}>
      <VoiceInputButton small activationMode="transcription" disabled={busy}
        liveContext={task?{type:'task',taskId:task.id,model}:undefined}
        onTranscript={(text,immediately)=>{if(immediately)void submit([draft,text].filter(Boolean).join(' '));else setDraft(current=>(current?current+' ':'')+text);}}/>
      <textarea rows={2} aria-label="Сообщение" placeholder="Спросите ИИ…" value={draft} disabled={busy}
        onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void submit();}}}/>
      <button type="submit" disabled={busy||!draft.trim()} aria-label="Отправить"><Send size={18}/></button>
    </form>
  </aside>;
}
