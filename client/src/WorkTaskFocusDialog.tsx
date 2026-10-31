import {useEffect,useState} from 'react';
import {CalendarPlus,Check,CheckCircle2,Eye,EyeOff,PenLine,Plus,SendHorizontal,Settings,Trash2,X} from 'lucide-react';
import {FocusedTaskWindowFrame} from './components/FocusedTaskWindowFrame';
import {DateTimePickerWithApply} from './components/DateTimePickerWithApply';
import {TaskMonitoringBadge} from './components/TaskMonitoringBadge';
import {api,type WorkCompanyTask,type WorkDashboardTask,type WorkTaskStatus,type WorkTaskPriority,type WorkWorkspace,type WorkSubtask} from './lib/api';
import WorkAiPanel from './WorkAiPanel';
import {FocusedSubtaskComposer} from './components/FocusedSubtaskComposer';
import {InlineDateTimePickerIcon} from './components/InlineDateTimePickerIcon';
import WorkSubtaskDetailDialog from './WorkSubtaskDetailDialog';
import {MessageCircle} from 'lucide-react';
import './styles.css';

const statuses:Record<WorkTaskStatus,string>={TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Выполнена'};
const priorities:Record<WorkTaskPriority,string>={LOW:'Низкая',NORMAL:'Обычная',HIGH:'Высокая',CRITICAL:'Критическая'};
const toError=(e:unknown)=>e instanceof Error?e.message:'Не удалось сохранить изменение';
export default function WorkTaskFocusDialog({organizationId,task,workspace,currentUserId,onClose,onChange}:
  {organizationId:string;task:WorkCompanyTask|WorkDashboardTask;workspace:WorkWorkspace;currentUserId:string;
   onClose:()=>void;onChange?:(updated:WorkCompanyTask)=>void}){
  const [current,setCurrent]=useState<WorkCompanyTask>(task);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [title,setTitle]=useState(task.title);
  const [description,setDescription]=useState(task.description||'');
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [editingDescription,setEditingDescription]=useState(false);
  const [showParticipants,setShowParticipants]=useState(false);
  const [monitorEnabled,setMonitorEnabled]=useState(false);
  const [subtasks,setSubtasks]=useState<WorkSubtask[]>([]);
  const [subtaskLoading,setSubtaskLoading]=useState(true);
  const [subtaskBusy,setSubtaskBusy]=useState(false);
  const [subtaskError,setSubtaskError]=useState('');
  const [subtaskTitle,setSubtaskTitle]=useState('');
  const [subtaskDue,setSubtaskDue]=useState<string|null>(null);
  const [addingSubtask,setAddingSubtask]=useState(false);
  const [hideCompleted,setHideCompleted]=useState(false);
  const [editSubtaskId,setEditSubtaskId]=useState<string|null>(null);
  const [editSubtaskTitle,setEditSubtaskTitle]=useState('');
  const [subtaskDetail,setSubtaskDetail]=useState<WorkSubtask|null>(null);
  const role=workspace.organization.role;
  const manager=['OWNER','ADMIN','MANAGER'].includes(role);
  const member=workspace.members.find(m=>m.userId===currentUserId);
  const joint=Boolean(member&&(current.assignedMemberId===member.id||current.createdByMemberId===member.id));
  const mayComplete=manager||(role==='MEMBER'&&joint);
  const canCreateSubtask=mayComplete;
  const projectName='project' in task?task.project.name:'';
  const memberName=(id:string|null)=>{
    const found=workspace.members.find(m=>m.id===id);
    return found?.name||found?.username||'Не назначен';
  };
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){
        if(settingsOpen){setSettingsOpen(false);return;}
        onClose();
      }
    };
    window.addEventListener('keydown',handler);
    const original=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{window.removeEventListener('keydown',handler);document.body.style.overflow=original;};
  },[onClose,settingsOpen]);
  useEffect(()=>{
    let live=true;
    void api.workMonitoringStatus(organizationId,current.id).then(state=>{if(live)setMonitorEnabled(state.enabled);}).catch(()=>{});
    return()=>{live=false;};
  },[organizationId,current.id]);
  useEffect(()=>{
    let live=true;setSubtaskLoading(true);
    void api.workListSubtasks(organizationId,current.projectId,current.id).then(result=>{
      if(live)setSubtasks(result.subtasks);
    }).catch(err=>{if(live)setSubtaskError(toError(err));})
      .finally(()=>{if(live)setSubtaskLoading(false);});
    return()=>{live=false;};
  },[organizationId,current.projectId,current.id]);
  const patch=async(changes:Partial<Pick<WorkCompanyTask,'title'|'description'|'status'|'priority'|'dueAt'|'assignedMemberId'>>)=>{
    if(busy)return;setBusy(true);setError('');
    try{
      const result=await api.updateWorkProjectTask(organizationId,current.projectId,current.id,changes);
      setCurrent(result.task);onChange?.(result.task);
      setTitle(result.task.title);setDescription(result.task.description||'');
      setEditingDescription(false);
    }catch(err){setError(toError(err));}
    finally{setBusy(false);}
  };
  const saveTitle=()=>{if(manager&&title.trim().length>=2&&title.trim()!==current.title)void patch({title:title.trim()});};
  const updateSubtask=async(id:string,changes:Partial<Pick<WorkSubtask,'title'|'dueAt'|'isDone'>>)=>{
    if(subtaskBusy)return;setSubtaskBusy(true);setSubtaskError('');
    try{
      const result=await api.workUpdateSubtask(organizationId,current.projectId,current.id,id,changes);
      setSubtasks(prev=>prev.map(st=>st.id===id?result.subtask:st));
      setEditSubtaskId(null);
    }catch(err){setSubtaskError(toError(err));}
    finally{setSubtaskBusy(false);}
  };
  const createSubtask=async()=>{
    if(!canCreateSubtask||subtaskTitle.trim().length<2||subtaskBusy)return;
    setSubtaskBusy(true);setSubtaskError('');
    try{
      const result=await api.workAddSubtask(organizationId,current.projectId,current.id,subtaskTitle.trim(),subtaskDue);
      setSubtasks(prev=>[...prev,result.subtask]);
      setSubtaskTitle('');setSubtaskDue(null);setAddingSubtask(false);
    }catch(err){setSubtaskError(toError(err));}
    finally{setSubtaskBusy(false);}
  };
  const deleteSubtask=async(subtask:WorkSubtask)=>{
    if(!window.confirm('Удалить подзадачу?')||subtaskBusy)return;
    setSubtaskBusy(true);setSubtaskError('');
    try{
      await api.workDeleteSubtask(organizationId,current.projectId,current.id,subtask.id);
      setSubtasks(prev=>prev.filter(st=>st.id!==subtask.id));
    }catch(err){setSubtaskError(toError(err));}
    finally{setSubtaskBusy(false);}
  };
  const visibleSubtasks=hideCompleted?subtasks.filter(st=>!st.isDone):subtasks;
  return <FocusedTaskWindowFrame>
    <aside data-tour="ai-task-help"
      className="ai-chat-lightweight app-side-panel focused-task-ai-panel focused-task-modal-panel-height relative order-2 hidden min-h-0 w-[450px] shrink-0 flex-col overflow-hidden rounded-[2rem] border p-4 lg:flex">
      {role!=='VIEWER'?<WorkAiPanel key={current.id} organizationId={organizationId} taskId={current.id}
        canManage={manager} canSetModel={role==='OWNER'||role==='ADMIN'} personalFocus onCloseFocus={onClose} workspace={workspace} currentUserId={currentUserId}/>:
        <><p className="text-sm text-muted">Наблюдатель не может отправлять запросы ИИ.</p>
          <button className="focused-task-ai-icon-button absolute right-4 top-4" onClick={onClose} aria-label="Закрыть окно"><X size={16}/></button></>}
    </aside>
    <aside className="focused-task-editor-shell focus-mode-shell focused-task-modal-panel-height order-1 relative min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border p-5">
      <div className="work-focus-toolbar absolute right-5 top-4 z-30 flex items-center gap-1.5">
        <button type="button" disabled className="focused-task-icon-button focused-task-calendar-like-button"
          title="Пересылка корпоративной задачи пока недоступна" aria-label="Переслать задачу (недоступно)">
          <SendHorizontal size={16}/></button>
        {manager&&<DateTimePickerWithApply value={current.dueAt}
          title="Выбрать срок" iconOnly detachedPopup popupAlign="right" popupZIndex={1400}
          onChange={value=>void patch({dueAt:value})}/>}
        <button type="button" className="focused-task-icon-button focused-task-calendar-like-button" title="Настройки задачи"
          aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(v=>!v)}><Settings size={16}/></button>

      </div>
      {settingsOpen&&<div role="dialog" aria-label="Настройки задачи" className="surface-popover work-focus-settings absolute right-5 top-16 z-[80] w-80 max-w-[calc(100%-2rem)] rounded-2xl border p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-sm">Настройки задачи</strong>
          <button type="button" aria-label="Закрыть настройки" onClick={()=>setSettingsOpen(false)}><X size={15}/></button>
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs">Статус
          <select className="form-field min-w-0 flex-1 rounded-lg border p-2" value={current.status}
            disabled={!mayComplete||busy} onChange={e=>void patch({status:e.target.value as WorkTaskStatus})}>
            {(Object.keys(statuses) as WorkTaskStatus[]).map(k=><option value={k} key={k}>{statuses[k]}</option>)}
          </select>
        </label>
        <label className="mb-3 flex items-center gap-2 text-xs">Приоритет
          <select className="form-field min-w-0 flex-1 rounded-lg border p-2" value={current.priority}
            disabled={!manager||busy} onChange={e=>void patch({priority:e.target.value as WorkTaskPriority})}>
            {(Object.keys(priorities) as WorkTaskPriority[]).map(k=><option key={k} value={k}>{priorities[k]}</option>)}
          </select>
        </label>
        {manager&&<label className="flex items-center gap-2 text-xs">Исполнитель
          <select className="form-field min-w-0 flex-1 rounded-lg border p-2"
            value={current.assignedMemberId||''} disabled={busy} onChange={e=>void patch({assignedMemberId:e.target.value||null})}>
            <option value="">Не назначен</option>{workspace.members.map(m=><option value={m.id} key={m.id}>
              {m.name||m.username||'Сотрудник'}</option>)}
          </select></label>}
        <div className="mt-3 border-t border-slate-500/20 pt-3">
          <button type="button" aria-expanded={showParticipants} onClick={()=>setShowParticipants(v=>!v)}
            className="surface-muted flex w-full items-center justify-between rounded-lg p-2 text-left text-xs">Участники совместной задачи <span>{showParticipants?'−':'+'}</span></button>
          {showParticipants&&<div className="work-focus-participants mt-2 grid gap-2 rounded-xl border p-3 text-xs text-muted">
            <span>Создатель: <strong>{memberName(current.createdByMemberId)}</strong></span>
            <span>Исполнитель: <strong>{memberName(current.assignedMemberId)}</strong></span>
            <span>Компания: {workspace.organization.name}</span>
          </div>
        </div>
      </div>}
      <div className="flex h-full min-h-0 flex-col">
        <div className="focus-main-card flex min-h-0 flex-1 flex-col overflow-visible rounded-[2rem] border-0 p-0 shadow-none">
          <div className="work-focus-content invisible-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
            <div className="work-focus-heading flex items-center gap-2 pr-32">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус задачи</p>
              <span className="work-shared-task-badge rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Совместная задача</span>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <textarea className="focused-task-title-input invisible-scrollbar min-w-0 w-full flex-1 resize-none border-0 bg-transparent p-0 text-left text-3xl font-bold leading-tight shadow-none outline-none"
                value={title} rows={title.length>38?2:1} maxLength={240} disabled={!manager||busy}
                onChange={e=>setTitle(e.target.value)} onBlur={saveTitle}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}}/>
              {mayComplete&&<button type="button" className="success-button shrink-0 rounded-xl px-3 py-2 text-sm font-semibold"
                disabled={busy||current.status==='DONE'} onClick={()=>void patch({status:'DONE'})}>
                {current.status==='DONE'?'Выполнено':'Выполнить'}</button>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-violet-500">
              <span>Дедлайн:</span>
              {monitorEnabled?<><TaskMonitoringBadge/><span className="text-muted">На усмотрение ИИ</span></>:
                <span>{current.dueAt?new Date(current.dueAt).toLocaleString('ru-RU'):'Не установлен'}</span>}
            </div>
            <div className="work-focus-description-card mt-4 rounded-2xl border p-3 text-sm">
              {editingDescription&&manager?<div className="grid gap-2">
                <textarea className="form-field w-full min-h-24 resize-y rounded-xl border p-3 text-sm"
                  maxLength={20000} value={description} onChange={e=>setDescription(e.target.value)}/>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={()=>setEditingDescription(false)} className="surface-muted rounded-lg px-3 py-1 text-xs">Отмена</button>
                  <button type="button" disabled={busy} onClick={()=>void patch({description})}
                    className="primary-button rounded-lg px-3 py-1 text-xs">Сохранить</button>
                </div>
              </div>:<button type="button" disabled={!manager} className="w-full whitespace-pre-wrap text-left text-sm leading-6 text-muted"
                onClick={()=>setEditingDescription(true)}>{current.description||'Описание не заполнено.'}</button>}
            </div>
            <div className="work-focus-subtask-section mt-4 flex min-h-0 flex-1 flex-col border-t border-slate-500/20 pt-3">
              <div className="work-focus-subtasks-header mb-3 flex shrink-0 items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-primary">Подзадачи</h3>
                  {canCreateSubtask&&<button type="button" className="focused-task-add-subtask-button focused-task-calendar-like-button" title="Добавить подзадачу"
                    onClick={()=>setAddingSubtask(true)} aria-label="Добавить подзадачу"><Plus size={16}/></button>}
                  <button type="button" title={hideCompleted?'Показывать выполненные':'Скрыть выполненные'} aria-label="Скрыть или показать выполненные" className="focused-task-icon-button"
                    onClick={()=>setHideCompleted(v=>!v)}>{hideCompleted?<Eye size={15}/>:<EyeOff size={15}/>}</button>
                </div>
                <span className="text-[11px] text-muted">{subtasks.filter(st=>st.isDone).length} из {subtasks.length}</span>
              </div>
              {addingSubtask&&<FocusedSubtaskComposer
                 title={subtaskTitle} dueAt={subtaskDue}
                 onTitleChange={setSubtaskTitle} onDueChange={setSubtaskDue}
                 onAdd={()=>void createSubtask()} canAdd={subtaskTitle.trim().length>=2}
                 disabled={subtaskBusy} monitoringEnabled={monitorEnabled} popupZIndex={1600}
                 onCancel={()=>{setAddingSubtask(false);setSubtaskTitle('');setSubtaskDue(null);}}
               />}
               {subtaskError&&<p className="mb-2 text-xs text-rose-400" role="alert">{subtaskError}</p>}
              <div className="work-focus-subtasks-list min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
                {subtaskLoading?<p className="text-xs text-muted">Загружаем подзадачи…</p>:visibleSubtasks.map(st=>{
                  const mayEdit=manager||(role==='MEMBER'&&joint&&st.createdByMemberId===member?.id);
                  return <div className="work-focus-subtask-row flex min-w-0 items-center gap-2 rounded-xl px-3 py-2" key={st.id}>
                    <input type="checkbox" checked={st.isDone} disabled={!mayComplete||subtaskBusy}
                      onChange={e=>void updateSubtask(st.id,{isDone:e.target.checked})}
                      aria-label={'Выполнена: '+st.title}/>
                    <button type="button" className={`min-w-0 flex-1 truncate text-left text-sm ${st.isDone?'line-through opacity-60':''}`}
                       onClick={()=>setSubtaskDetail(st)}>{st.title}</button>
                     <button type="button" className="task-card-meta-indicator task-card-meta-action relative shrink-0"
                       title="Открыть комментарии подзадачи" onClick={()=>setSubtaskDetail(st)}><MessageCircle size={15}/>
                       {Boolean(st.commentCount)&&<span className="ml-1 text-[10px]">{st.commentCount}</span>}</button>
                     {st.createdByMemberId&&<span className="work-subtask-author shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        title={'Добавил: '+memberName(st.createdByMemberId)}>
                        {memberName(st.createdByMemberId)} · {['OWNER','ADMIN','MANAGER'].includes(workspace.members.find(m=>m.id===st.createdByMemberId)?.role||'')?'Руководитель':'Сотрудник'}
                       </span>}
                     {st.dueAt&&<span className="work-subtask-date whitespace-nowrap text-[10px] text-muted">{new Date(st.dueAt).toLocaleDateString('ru-RU')}</span>}
                     {mayEdit&&<InlineDateTimePickerIcon detachedPopup value={st.dueAt} title="Изменить срок подзадачи"
                       onChange={value=>updateSubtask(st.id,{dueAt:value})}/>}
                   </div>;
                })}
                {!subtaskLoading&&!visibleSubtasks.length&&<p className="text-xs text-subtle">Пока нет подзадач</p>}
              </div>
            </div>
            {error&&<p className="mt-2 text-xs text-rose-400" role="alert">{error}</p>}
          </div>
        </div>
      </div>
    </aside>
    {subtaskDetail&&<WorkSubtaskDetailDialog
      key={subtaskDetail.id} organizationId={organizationId} projectId={current.projectId}
      taskId={current.id} subtask={subtaskDetail} workspace={workspace}
      selfMemberId={member?.id||null} onClose={()=>setSubtaskDetail(null)}
      onUpdated={updated=>{setSubtasks(prev=>prev.map(st=>st.id===updated.id?updated:st));setSubtaskDetail(updated);}}
      onDeleted={id=>setSubtasks(prev=>prev.filter(st=>st.id!==id))}
    />}
  </FocusedTaskWindowFrame>;
}
