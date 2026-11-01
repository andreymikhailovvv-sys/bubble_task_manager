import {useEffect,useMemo,useRef,useState} from 'react';
import {Loader2,SendHorizontal} from 'lucide-react';
import {AutoGrowingTextarea} from './components/AutoGrowingTextarea';
import {AiProgress} from './components/AiProgress';
import {WorkAiMessageBody} from './components/WorkAiMessageBody';
import {WorkAiProposalCard} from './components/WorkAiProposalCard';
import {ExpandedAiChat,type ExpandedAiChatProject} from './components/ExpandedAiChat';
import {QuickAiLauncherFrame} from './components/QuickAiLauncherFrame';
import {WorkNotificationBell} from './components/WorkNotificationBell';
import {AiReplyAction,type AiReplyTarget} from './components/AiMessageReply';
import {serializeWorkAiReply} from './components/WorkAiReply';
import {MessageActionArrow} from './components/MessageActionIcons';
import type {ChatMessage} from './lib/types';
import {api,type WorkDashboard,type WorkAiMessage,type WorkAiCredits} from './lib/api';
import type {AiChatModel} from './lib/types';
import './styles.css';

// Intentionally use the original personal Planировыч chat surfaces, their
// markup, class names, scrollbar behavior, hover boundary and expanded chat.
// Only the data source and role-aware actions are corporate.
const QUICK='work-company-quick';
const colors=['#8b5cf6','#06b6d4','#a78bfa','#4a95b2'] as const;
const labels:Record<AiChatModel,string>={'gpt-6-luna':'Luna','gpt-6.1-terra':'Terra','gpt-6.1-sol':'Sol'};
const known=(v:string):v is AiChatModel=>v in labels;
export default function WorkQuickAi({organizationId,dashboard}:{organizationId:string;dashboard:WorkDashboard}){
  const [expanded,setExpanded]=useState(false);
  const [quickMessages,setQuickMessages]=useState<WorkAiMessage[]>([]);
  const [taskMessages,setTaskMessages]=useState<WorkAiMessage[]>([]);
  const [selectedProjectId,setSelectedProjectId]=useState('work-default');
  const [selectedChatId,setSelectedChatId]=useState(QUICK);
  const [credits,setCredits]=useState<WorkAiCredits|null>(null);
  const [draft,setDraft]=useState('');
  const [replyTo,setReplyTo]=useState<AiReplyTarget|null>(null);
  const [loading,setLoading]=useState(false);
  const [fetching,setFetching]=useState(true);
  const [error,setError]=useState('');
  const [aiProgress,setAiProgress]=useState<'searching_tasks'|'forming_answer'>('searching_tasks');
  const messagesRef=useRef<HTMLDivElement|null>(null);
  const allowed=dashboard.role!=='VIEWER';
  const admin=['OWNER','ADMIN'].includes(dashboard.role);
  const [selectedModel,setSelectedModel]=useState<AiChatModel>('gpt-6-luna');
  useEffect(()=>{
    // Personal theme tokens are shared and B2B is explicitly dark.
    const old=document.body.dataset.theme;
    document.body.dataset.theme='dark';
    return()=>{if(old===undefined)delete document.body.dataset.theme;else document.body.dataset.theme=old;};
  },[]);
  useEffect(()=>{
    let mounted=true;
    setExpanded(false);setSelectedChatId(QUICK);setSelectedProjectId('work-default');
    setQuickMessages([]);setTaskMessages([]);setError('');setFetching(true);
    if(!allowed){setFetching(false);return;}
    void Promise.all([api.workQuickAiHistory(organizationId),api.workAiBalance(organizationId)])
      .then(([history,balance])=>{
        if(!mounted)return;
        setQuickMessages(history.messages);setCredits(balance.credits);
        if(known(balance.credits.aiModel))setSelectedModel(balance.credits.aiModel);
      }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Ошибка загрузки чата');})
      .finally(()=>{if(mounted)setFetching(false);});
    return()=>{mounted=false;};
  },[organizationId,allowed]);
  useEffect(()=>{
    if(selectedChatId===QUICK){setTaskMessages([]);return;}
    const task=dashboard.tasks.find(item=>item.id===selectedChatId);
    if(!task){setSelectedChatId(QUICK);return;}
    let live=true;setFetching(true);setError('');setTaskMessages([]);
    void api.workAiHistory(organizationId,task.id).then(data=>{
      if(live)setTaskMessages(data.messages);
    }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Ошибка загрузки задачи');})
      .finally(()=>{if(live)setFetching(false);});
    return()=>{live=false;};
  },[organizationId,selectedChatId,dashboard.tasks]);
  useEffect(()=>{
    const node=messagesRef.current;
    if(node)node.scrollTop=node.scrollHeight;
  },[quickMessages.length,expanded]);
  const projects=useMemo<ExpandedAiChatProject[]>(()=>[
    {id:'work-default',title:'Быстрые запросы',color:'#8b5cf6',icon:'✦',
      chats:[{id:QUICK,title:'Быстрые запросы',messages:quickMessages}]},
    ...dashboard.projects.map((project,index)=>({
      id:project.id,title:project.name,color:colors[index%colors.length],icon:'🗂️',
      chats:dashboard.tasks.filter(task=>task.projectId===project.id).map(task=>({
        id:task.id,title:task.title,messages:selectedChatId===task.id?taskMessages:[]
      }))
    }))
  ],[dashboard.projects,dashboard.tasks,quickMessages,taskMessages,selectedChatId]);
  const activeProject=projects.find(p=>p.id===selectedProjectId)||projects[0];
  const activeChat=activeProject.chats.find(t=>t.id===selectedChatId)||activeProject.chats[0];
  const visible=selectedChatId===QUICK?quickMessages:taskMessages;
  const errorText=(e:unknown)=>e instanceof Error?e.message:'ИИ не ответил';
  useEffect(()=>{
    if(!loading){setAiProgress('searching_tasks');return;}
    const timeout=window.setTimeout(()=>setAiProgress('forming_answer'),1400);
    return()=>window.clearTimeout(timeout);
  },[loading]);
  const send=async(question:string,quick:boolean)=>{
    const q=question.trim();if(!q||loading||!allowed)return;
    const request=serializeWorkAiReply(q,replyTo);
    const optimistic:WorkAiMessage={id:'pending-work-'+Date.now(),role:'user',content:request,createdAt:new Date().toISOString()};
    const savedReply=replyTo;
    if(quick){setDraft('');setQuickMessages(items=>[...items,optimistic]);}
    else setTaskMessages(items=>[...items,optimistic]);
    setReplyTo(null);setLoading(true);setError('');
    try{
      const result=quick?await api.workQuickAiAsk(organizationId,request):await api.workAiAsk(organizationId,request,selectedChatId);
      setCredits(result.credits);
      const response=quick?await api.workQuickAiHistory(organizationId):await api.workAiHistory(organizationId,selectedChatId);
      if(quick)setQuickMessages(response.messages);
      else setTaskMessages(response.messages);
    }catch(e){
      setError(errorText(e));
      const remove=(items:WorkAiMessage[])=>items.filter(item=>item.id!==optimistic.id);
      if(quick){setQuickMessages(remove);setDraft(value=>value||q);}
      else setTaskMessages(remove);
      setReplyTo(savedReply);
    }finally{setLoading(false);}
  };
  const sendQuick=()=>void send(draft,true);
  const messageActions=(item:WorkAiMessage)=><div className="ai-message-forward-actions flex justify-end">
    <AiReplyAction message={{id:item.id,role:item.role==='assistant'?'assistant':'user',content:item.content} as ChatMessage}
      onReply={target=>{setReplyTo(target);if(!expanded)setExpanded(true);}}/>
    <button type="button" className="ai-message-forward-trigger" disabled title="Пересылка будет добавлена позже"
      aria-label="Переслать сообщение (скоро)"><MessageActionArrow direction="forward"/></button>
  </div>;
  const changeModel=(model:AiChatModel)=>{
    if(!admin)return;
    setLoading(true);setError('');
    void api.workAiSetModel(organizationId,model).then(()=>setSelectedModel(model))
      .catch(e=>setError(errorText(e))).finally(()=>setLoading(false));
  };
  const selectProject=(project:ExpandedAiChatProject)=>{
    setSelectedProjectId(project.id);
    setSelectedChatId(project.chats[0]?.id||QUICK);
  };
  const selectChat=(id:string)=>{
    setSelectedChatId(id);
    const project=projects.find(p=>p.chats.some(chat=>chat.id===id));
    if(project)setSelectedProjectId(project.id);
  };
  if(!allowed)return null;
  return <>
    <QuickAiLauncherFrame work onHoverChange={hovered=>{
      if(hovered)requestAnimationFrame(()=>{const node=messagesRef.current;if(node)node.scrollTop=node.scrollHeight;});
    }}>
      <div className="absolute bottom-14 right-0 w-80 transition duration-200 pointer-events-none translate-y-2 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <div className="dialog-surface rounded-3xl border p-3 shadow-2xl backdrop-blur transition duration-200 hover:shadow-violet-500/20">
          <div ref={messagesRef} className="quick-ai-chat-messages mb-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1 text-xs">
            <div className="space-y-2">
              {quickMessages.slice(-20).map(item=><div key={item.id} className={`ai-message-forward-group w-fit max-w-[calc(100%-2rem)] ${item.role==='user'?'ml-auto':'mr-auto'}`}>
                <div className={`quick-ai-chat-message w-full rounded-2xl px-3 py-2 shadow-sm ${item.role==='user'?'quick-ai-chat-message-user':'quick-ai-chat-message-assistant'}`}>
                  <b>{item.role==='user'?'Вы':'ИИ'}:</b> <WorkAiMessageBody content={item.content}/>
                </div>
                {item.proposal&&<WorkAiProposalCard organizationId={organizationId} initial={item.proposal} onChanged={()=>void api.workQuickAiHistory(organizationId).then(r=>setQuickMessages(r.messages)).catch(e=>setError(errorText(e)))}/>}
                {messageActions(item)}
              </div>)}
              {!quickMessages.length&&<p className="text-subtle">Быстрый вопрос по проектам и задачам выбранной компании.</p>}
              {loading&&<AiProgress status={aiProgress}/>}
            </div>
          </div>
          {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex items-end gap-2">
            <AutoGrowingTextarea maxHeight={144}
              className="form-field min-h-9 min-w-0 flex-1 resize-none rounded-2xl border px-3 py-2 text-sm leading-5 transition focus:ring-2 focus:ring-violet-300"
              value={draft} onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){
                e.preventDefault();sendQuick();
              }}} placeholder="Спросить быстро…"/>
            <button type="button" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 p-2 text-white shadow-lg transition duration-200 hover:bg-violet-500 disabled:opacity-50"
              aria-label="Отправить" disabled={loading||!draft.trim()} onClick={sendQuick}>
              {loading?<Loader2 size={16} className="animate-spin"/>:<SendHorizontal size={16}/>}
            </button>
          </div>
        </div>
      </div>
       <div className="work-quick-notification"><WorkNotificationBell organizationId={organizationId}/></div>
      <button type="button"
        className="ai-chat-launcher-button flex h-14 w-14 touch-none select-none items-center justify-center rounded-full text-2xl text-white shadow-2xl transition duration-200 hover:scale-105 hover:shadow-violet-500/40 active:scale-95"
        title="Чат с ИИ" aria-label="Развернуть чат с ИИ"
        onClick={()=>{setSelectedChatId(QUICK);setSelectedProjectId('work-default');setExpanded(true);}}>
        ✦
      </button>
    </QuickAiLauncherFrame>
    {expanded&&<ExpandedAiChat
      projects={projects}
      activeProject={activeProject}
      activeChat={activeChat}
      quickChatId={QUICK}
      model={selectedModel}
      modelOptions={admin?Object.entries(labels).map(([value,label])=>({value,label})):
        [{value:selectedModel,label:labels[selectedModel]}]}
      pendingFiles={[]}
      loading={loading||fetching}
      imageGenerating={false}
      messageCount={visible.length}
      readOnlyStructure
      attachmentsEnabled={false}
      messages={visible.map(item=><div key={item.id} className={`ai-message-forward-group w-fit max-w-[92%] ${item.role==='assistant'?'mr-auto':'ml-auto'}`}>
        <div className={`chat-message w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${item.role==='assistant'?'chat-message-assistant':'chat-message-user'}`}>
          <div className="mb-1 flex items-center justify-between">
            <p className="chat-message-label text-[11px] font-semibold uppercase tracking-wide">{item.role==='assistant'?'ИИ':item.role==='system'?'Мониторинг':'Вы'}</p>
          </div><div><WorkAiMessageBody content={item.content}/></div>
        </div>
        {item.proposal&&<WorkAiProposalCard organizationId={organizationId} initial={item.proposal} onChanged={()=>void (selectedChatId===QUICK
          ?api.workQuickAiHistory(organizationId).then(r=>setQuickMessages(r.messages))
          :api.workAiHistory(organizationId,selectedChatId).then(r=>setTaskMessages(r.messages))).catch(e=>setError(errorText(e)))}/>}
        {messageActions(item)}
      </div>)}
      status={error?<p role="alert" className="text-sm text-rose-400">{error}</p>:
        loading?<AiProgress status={aiProgress}/>:
        credits?<p className="text-[11px] text-muted">Баланс организации: {(credits.aiCreditsMilli/1000).toFixed(3)} кр.</p>:null}
      onClose={()=>setExpanded(false)}
      onCreateProject={()=>undefined}
      onCreateChat={()=>undefined}
      onSelectProject={selectProject}
      onSelectChat={selectChat}
      onDeleteProject={()=>undefined}
      onDeleteChat={()=>undefined}
      onContextMenu={()=>undefined}
      onModelChange={changeModel}
      onAddFiles={()=>undefined}
      onRemoveFile={()=>undefined}
      replyTo={replyTo} onClearReply={()=>setReplyTo(null)}
      onSend={question=>void send(question,selectedChatId===QUICK)}
    />}
  </>;
}
