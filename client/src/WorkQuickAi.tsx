import {useEffect,useState} from 'react';
import {Bot,ChevronRight,ChevronDown,Maximize2,MessageSquare,Send,X,FolderKanban,Wallet,PanelLeftClose} from 'lucide-react';
import {api,type WorkDashboard,type WorkAiCredits,type WorkAiMessage} from './lib/api';
import WorkAiPanel from './WorkAiPanel';

const formatCredits=(milli:number)=>(milli/1000).toLocaleString('ru-RU',{maximumFractionDigits:3});
export default function WorkQuickAi({organizationId,dashboard}:{organizationId:string;dashboard:WorkDashboard}){
  const [full,setFull]=useState(false);
  const [hover,setHover]=useState(false);
  const [sidebar,setSidebar]=useState(true);
  const [activeProject,setActiveProject]=useState<string|null>(null);
  const [activeTask,setActiveTask]=useState<string|null>(null);
  const [messages,setMessages]=useState<WorkAiMessage[]>([]);
  const [credits,setCredits]=useState<WorkAiCredits|null>(null);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const viewer=dashboard.role==='VIEWER';
  useEffect(()=>{
    let live=true;
    setFull(false);setActiveProject(null);setActiveTask(null);setMessages([]);setCredits(null);setError('');
    setLoading(true);
    if(viewer){setLoading(false);return;}
    void Promise.all([api.workQuickAiHistory(organizationId),api.workAiBalance(organizationId)]).then(([history,balance])=>{
      if(live){setMessages(history.messages);setCredits(balance.credits);}
    }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Ошибка истории');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[organizationId,viewer]);
  useEffect(()=>{
    if(!full)return;
    const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape')setFull(false);};
    document.addEventListener('keydown',keyboard);
    return()=>document.removeEventListener('keydown',keyboard);
  },[full]);
  const submit=async()=>{
    if(busy||viewer||!draft.trim())return;
    const question=draft.trim();setBusy(true);setError('');
    try{
      const response=await api.workQuickAiAsk(organizationId,question);
      const history=await api.workQuickAiHistory(organizationId);
      setMessages(history.messages);setCredits(response.credits);setDraft('');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить запрос');}
    finally{setBusy(false);}
  };
  const thread=<>{loading?<p className="work-muted">Загружаем сообщения…</p>:messages.length?messages.map(item=>
    <div className={'work-quick-message '+(item.role==='assistant'?'assistant':'user')} key={item.id}>
      <small>{item.role==='assistant'?'ИИ':'Вы'}</small><div>{item.content}</div>
    </div>):<div className="work-quick-empty">Задайте вопрос по своим задачам и проектам компании.</div>}</>;
  const editor=<form className="work-quick-composer" onSubmit={e=>{e.preventDefault();void submit();}}>
    <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2} maxLength={3000} placeholder="Быстрый запрос к ИИ…" disabled={busy||viewer}
      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(draft.trim())void submit(e);}}}/>
    <button aria-label="Отправить запрос" disabled={busy||!draft.trim()||viewer}><Send size={18}/></button>
  </form>;
  const selectedProject=dashboard.projects.find(x=>x.id===activeProject);
  const selectedTask=dashboard.tasks.find(x=>x.id===activeTask);
  return <>
    <div className="work-quick-anchor" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}>
      {hover&&!full&&!viewer&&<div className="work-quick-peek">
        <div className="work-quick-peek-head"><Bot size={17}/><strong>Быстрые запросы</strong>
          <button type="button" onClick={()=>setFull(true)} aria-label="Развернуть"><Maximize2 size={16}/></button>
        </div>
        <div className="work-quick-peek-thread">{thread}</div>
        {error&&<p role="alert" className="work-ai-error">{error}</p>}
        {editor}
      </div>}
      <button className="work-quick-fab" type="button" aria-label="Открыть общий чат с ИИ" onClick={()=>setFull(true)} title="Быстрые запросы">
        <Bot size={23}/><span>ИИ</span>
      </button>
    </div>
    {full&&<div className="work-quick-modal" role="dialog" aria-modal="true" aria-label="Корпоративный чат с ИИ">
      <div className="work-quick-window">
        <header className="work-quick-header">
          <button type="button" aria-label="Переключить список проектов" onClick={()=>setSidebar(!sidebar)}><PanelLeftClose size={18}/></button>
          <div><strong>Планировыч.Work · ИИ</strong><small>{selectedTask?.title||selectedProject?.name||'Быстрые запросы'}</small></div>
          <button type="button" aria-label="Закрыть чат" onClick={()=>setFull(false)}><X size={20}/></button>
        </header>
        <div className="work-quick-body">
          {sidebar&&<aside className="work-quick-sidebar">
            <div className="work-quick-sidebar-head">ПРОЕКТЫ</div>
            <button type="button" className={!activeTask?'selected':''} onClick={()=>{setActiveProject(null);setActiveTask(null);}}>
              <MessageSquare size={17}/> Быстрые запросы
            </button>
            {dashboard.projects.map(project=><div key={project.id}>
              <button type="button" className={activeProject===project.id?'selected':''} onClick={()=>{
                setActiveProject(activeProject===project.id?null:project.id);setActiveTask(null);
              }}><FolderKanban size={16}/><span>{project.name}</span>
                {activeProject===project.id?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
              </button>
              {activeProject===project.id&&<div className="work-quick-sidebar-tasks">
                {dashboard.tasks.filter(task=>task.projectId===project.id).map(task=>
                <button key={task.id} type="button" className={activeTask===task.id?'selected':''}
                  onClick={()=>setActiveTask(task.id)}><MessageSquare size={14}/>{task.title}</button>)}
                {!dashboard.tasks.some(t=>t.projectId===project.id)&&<span className="work-muted">Нет поручений</span>}
              </div>}
            </div>)}
          </aside>}
          <main className="work-quick-main">
            {activeTask?<WorkAiPanel key={activeTask} organizationId={organizationId} taskId={activeTask} canManage={['OWNER','ADMIN','MANAGER'].includes(dashboard.role)}/>:
              <><div className="work-quick-main-subtitle"><Bot size={17}/>
                <span>{selectedProject?'Выберите чат задачи в проекте слева':'Ваши быстрые запросы по выбранной организации'}</span></div>
              <div className="work-quick-thread">{thread}</div>
              {error&&<p role="alert" className="work-ai-error">{error}</p>}
              {credits&&<div className="work-quick-balance"><Wallet size={14}/> Баланс компании: {formatCredits(credits.aiCreditsMilli)} кр.</div>}
              {editor}</>}
          </main>
        </div>
      </div>
    </div>}
  </>;
}
