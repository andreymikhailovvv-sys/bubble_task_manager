import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, CircleHelp, Copy, Loader2, MessageCircle, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { api, type AiChatProgressStatus, type TaskAiProgressStatus } from './lib/api';
import { prepareAiChatImageFile } from './lib/ai-image-upload';
import { clipboardImageFiles } from './lib/aiClipboard';
import { AiAttachmentTiles, AiMessageAttachments, splitAiMessageAttachments, makeAiAttachmentPreviews } from './components/AiAttachmentTiles';
import { AiProgress } from './components/AiProgress';
import type { AiChatModel, ChatAttachmentPayload, ChatMessage, Sphere, Task } from './lib/types';
import { CustomSelect } from './components/CustomSelect';
import { VoiceInputButton } from './components/VoiceInputButton';
import { WorkAiMessageBody } from './components/WorkAiMessageBody';
import { TestPageTaskProposal, TestPageFinanceProposal } from './TestPageProposalCards';
import { TestPageCapabilities } from './TestPageCapabilities';
import { AiGeneratedDocumentButton } from './components/AiGeneratedDocumentButton';
import { WebCitations } from './components/WebCitations';
import { TelegramInlineSendCard } from './components/TelegramInlineSendCard';
import { MailInlineSendCard } from './components/MailInlineSendCard';
import { serializeAiReply, AiReplyPreview, type AiReplyTarget, makeAiReplyTarget } from './components/AiMessageReply';

type SystemNotice={id:string;eventKey?:string;taskId?:string|null;content:string;readAt?:string|null;createdAt:string};
type Props = {
  notifications?: SystemNotice[];
  onOpenNotification?: (notification:SystemNotice)=>void;
  onActivityChange?: (activity:{busy:boolean;progress:string|null})=>void;
  task?: Task | null;
  theme: 'light' | 'dark';
  onOpenCheckups?: () => void;
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

export function TestPageChat({task,theme,onOpenCheckups,tasks,spheres,onClose,onOpenTask,onDataChanged,initialMessages,onMessagesChange,notifications=[],onOpenNotification,onActivityChange}:Props) {
  const [model,setModel]=useState<AiChatModel>('gpt-6-luna');
  const [draft,setDraft]=useState('');
  const [messages,setMessages]=useState<ChatMessage[]>(initialMessages||[]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState<AiChatProgressStatus|TaskAiProgressStatus>('analyzing_request');
  const [pendingFiles,setPendingFiles]=useState<File[]>([]);
  const [uploadProgress,setUploadProgress]=useState<number|null>(null);
  const [streamText,setStreamText]=useState('');
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const [loading,setLoading]=useState(!!task);
  const [error,setError]=useState('');
  const [replyTo,setReplyTo]=useState<AiReplyTarget|null>(null);
  const [copied,setCopied]=useState<number|null>(null);
  const [capabilitiesOpen,setCapabilitiesOpen]=useState(false);
  const endRef=useRef<HTMLDivElement|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{onActivityChange?.({busy,progress:busy?progress:null});},[busy,progress,onActivityChange]);
  useEffect(()=>()=>{onActivityChange?.({busy:false,progress:null});},[onActivityChange]);
  const addFiles=(items:File[])=>{
    if(!items.length)return;
    const allowed=items.filter(file=>/\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name)
      || ['application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain'].includes(file.type));
    if(items.length!==allowed.length)setError('Допустимы PDF, DOCX, XLS/XLSX, TXT и изображения.');
    if(allowed.some(file=>file.size>8*1024*1024)){
      setError('Размер каждого файла не должен превышать 8 МБ.');return;
    }
    setPendingFiles(current=>{
      const next=[...current,...allowed];
      if(next.length>3)setError('Можно прикрепить максимум три файла.');
      return next.slice(0,3);
    });
  };
  const encodeFile=async(file:File):Promise<ChatAttachmentPayload>=>{
    const source=await prepareAiChatImageFile(file);
    const base64=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>typeof reader.result==='string'?resolve(reader.result.split(',')[1]||''):reject(new Error('Файл не прочитан.'));
      reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));
      reader.readAsDataURL(source);
    });
    const extension=source.name.split('.').pop()?.toLowerCase()||'';
    const byExt:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc:'application/msword',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'};
    return {name:source.name,mimeType:source.type||byExt[extension]||'application/octet-stream',
      size:source.size,contentBase64:base64};
  };

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
    if((!question&&!pendingFiles.length)||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setProgress('analyzing_request');
    setUploadProgress(null);setStreamText('');
    const forAi=serializeAiReply(question||'Проанализируй прикреплённые файлы.',replyTo);
    const sendingFiles=[...pendingFiles];
    setReplyTo(null);setDraft('');
    const previous=messages;
    // Previews are display-only; the original bytes travel in attachments.
    const attachmentsPreview=await makeAiAttachmentPreviews(sendingFiles).catch(()=>[]);
    const names=sendingFiles.map(file=>file.name);
    const userMessage:ChatMessage={id:crypto.randomUUID(),role:'user',
      content:forAi+(names.length?'\n\n📎 Файлы: '+names.join(', '):''),
      attachmentPreviews:attachmentsPreview};
    setMessages(old=>[...old,userMessage]);
    try{
      const attachments=sendingFiles.length?await Promise.all(sendingFiles.map(encodeFile)):undefined;
      if(task){
        const answer=await api.askTaskAssistantStreaming(task.id,{
          question:forAi, model, clientSurface:'web', interactionContext:'focus',attachments
        },{onStatus:setProgress,onUploadProgress:setUploadProgress,
          onTextDelta:delta=>setStreamText(current=>current+delta),
          onTextReset:()=>setStreamText('')});
        // The task conversation is owned by the server. Read it back so
        // proposals and replies share the same history as the classic Focus.
        const latest=await api.getTaskAssistantHistory(task.id).catch(()=>null);
        if(latest)setMessages(latest.messages.map(message=>message.role==='user'
          &&message.content===userMessage.content?{...message,attachmentPreviews:attachmentsPreview}:message));
        else setMessages(old=>[...old,{id:crypto.randomUUID(),role:'assistant',content:answer.answer,taskProposal:answer.taskProposal||null}]);
        if(answer.taskDataChanged)onDataChanged();
      }else{
        const answer=await api.askAiChatStreaming({question:forAi,history:previous,model,clientSurface:'web',attachments},
          {onStatus:setProgress,onUploadProgress:setUploadProgress,
            onTextDelta:delta=>setStreamText(current=>current+delta),
            onTextReset:()=>setStreamText('')});
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
      setPendingFiles([]);
    }catch(cause){setMessages(previous);setDraft(question);setError(messageError(cause));}
    finally{inFlight.current=false;setBusy(false);setUploadProgress(null);setStreamText('');}
  };
  const copy=async(content:string,index:number)=>{
    try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setError('Не удалось скопировать сообщение.');}
  };
  const title=task?'ИИ по задаче':'Планик AI';
  return <>
    {task&&<div className="tp-chat-modal-backdrop" aria-hidden="true" onMouseDown={onClose}/>}
    <aside className={'tp-assistant '+(task?'tp-task-chat':'')} role="dialog" aria-label={title} aria-modal={!!task}>
      <header><div className="tp-chat-avatar"><MessageCircle size={20}/></div><div className="tp-chat-heading"><strong>{title}</strong><small title={task?.title}>{task?task.title:'Помощник по задачам'}</small></div>
        <button type="button" className="tp-chat-capabilities-button" onClick={()=>setCapabilitiesOpen(true)}
          aria-label="Возможности чата" title="Возможности чата"><CircleHelp size={19}/><span>Возможности чата</span></button>
        <button type="button" className="tp-chat-close" onClick={onClose} aria-label="Закрыть чат"><X size={19}/></button>
      </header>
    <div className="tp-chat-model"><span>Модель ИИ</span><CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" value={model} options={MODEL_OPTIONS} onChange={value=>setModel(value as AiChatModel)} ariaLabel="Выбор модели ИИ"
      disabled={busy || (task?.aiMonitoringEnabled === true)} /></div>
    <div className="tp-chat-list">
      {loading&&<div className="tp-loading"><Loader2 className="tp-spin" size={19}/>Загрузка переписки…</div>}
      {!loading&&!messages.length&&<div className="tp-chat-welcome"><Sparkles size={24}/><strong>{task?'Спросите ИИ об этой задаче':'Чем помочь сегодня?'}</strong>
        <p>{task?'Обсудите выполнение, подзадачи и сроки. Предложения можно проверить перед применением.':'Обсудите свои задачи, план на день или следующий шаг.'}</p></div>}
      {!task&&notifications.filter(item=>!item.eventKey?.startsWith('monitoring:')).map(item=>
        <button type="button" className="tp-chat-system-notice" key={item.id}
          onClick={()=>onOpenNotification?.(item)}
          title="Открыть уведомление"><span>⚙️ Системное уведомление</span>
          <strong>{item.content}</strong></button>)}
      {messages.map((message,index)=><article className={'tp-chat-message '+(message.role==='user'?'mine':'')} key={message.id||index}>
        <div className="tp-message-top"><span>{message.role==='user'?'Вы':'ИИ'}</span><button type="button" aria-label="Копировать сообщение" onClick={()=>void copy(message.content,index)}>{copied===index?<Check size={13}/>:<Copy size={13}/>}</button></div>
        <div className="tp-message-body">
          <WorkAiMessageBody content={splitAiMessageAttachments(message.content.replace(TASK_REF,'').trim()).text}/>
          {message.role==='user'&&(()=>{
            const {names}=splitAiMessageAttachments(message.content);
            return names.length?<AiMessageAttachments names={names} previews={message.attachmentPreviews} messageId={message.id}/>:null;
          })()}
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
      {busy&&<div className="tp-ai-progress"><AiProgress status={progress}/>
        {streamText&&<div className="tp-ai-stream-text" aria-live="off"><WorkAiMessageBody content={streamText}/></div>}
      </div>}
      {error&&<p className="tp-alert" role="alert">{error}</p>}
      <div ref={endRef}/>
    </div>
    {replyTo&&<div className="tp-reply-zone"><AiReplyPreview target={replyTo} onDismiss={()=>setReplyTo(null)} compact/></div>}
    {!!pendingFiles.length&&<div className="tp-chat-attachments">
      <AiAttachmentTiles files={pendingFiles} busy={busy} uploadProgress={uploadProgress}
        onRemove={file=>setPendingFiles(old=>old.filter(x=>x!==file))}/>
    </div>}
    <form className="tp-chat-compose" onSubmit={(event:FormEvent)=>{event.preventDefault();void submit();}}>
      <input type="file" ref={fileInputRef} multiple hidden
        accept=".pdf,.docx,.xls,.xlsx,.txt,image/png,image/jpeg,image/webp,image/gif"
        onChange={event=>{addFiles(Array.from(event.target.files||[]));event.target.value='';}}/>
      <button type="button" className="tp-chat-attach-button" disabled={busy} onClick={()=>fileInputRef.current?.click()}
        title="Прикрепить файл" aria-label="Прикрепить файл"><Paperclip size={18}/></button>
      <textarea rows={2} aria-label="Сообщение" placeholder="Спросите ИИ…" value={draft} disabled={busy}
        onChange={event=>setDraft(event.target.value)}
        onPaste={event=>{const images=clipboardImageFiles(event.clipboardData);
          if(images.length){event.preventDefault();addFiles(images);}}}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/>
      <VoiceInputButton small activationMode="transcription" disabled={busy}
        liveContext={task?{type:'task',taskId:task.id,model}:undefined}
        onTranscript={(text,immediately)=>{if(immediately)void submit([draft,text].filter(Boolean).join(' '));else setDraft(current=>(current?current+' ':'')+text);}}/>
      <button type="submit" disabled={busy||(!draft.trim()&&!pendingFiles.length)} aria-label="Отправить"><Send size={18}/></button>
    </form>
    </aside>
    {capabilitiesOpen&&<TestPageCapabilities kind={task?'task':'general'} theme={theme}
      onOpenCheckups={onOpenCheckups} onClose={()=>setCapabilitiesOpen(false)}/>}
  </>;
}
