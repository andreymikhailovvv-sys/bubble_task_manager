import {useEffect,useState} from 'react';
import {CalendarDays,CalendarPlus,Check,ChevronDown,Copy,SendHorizontal,Settings,X} from 'lucide-react';
import {FocusedTaskWindowFrame} from './components/FocusedTaskWindowFrame';
import {DateTimePickerWithApply} from './components/DateTimePickerWithApply';
import {TaskMonitoringBadge} from './components/TaskMonitoringBadge';
import {api,type WorkCompanyTask,type WorkDashboardTask,type WorkTaskStatus,type WorkTaskPriority,type WorkWorkspace} from './lib/api';
import WorkAiPanel from './WorkAiPanel';

const statuses:Record<WorkTaskStatus,string>={TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Выполнена'};
const priorities:Record<WorkTaskPriority,string>={LOW:'Низкая',NORMAL:'Обычная',HIGH:'Высокая',CRITICAL:'Критическая'};

/** Personal Focus Task markup + shared shell, with only organization-scoped
 * backend writes. Nothing is saved through personal api.updateTask. */
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
  const role=workspace.organization.role;
  const manager=['OWNER','ADMIN','MANAGER'].includes(role);
  const member=workspace.members.find(m=>m.userId===currentUserId);
  const joint=Boolean(member&&(current.assignedMemberId===member.id||current.createdByMemberId===member.id));
  const mayComplete=manager||(role==='MEMBER'&&joint);
  const projectName='project' in task?task.project.name:'';
  const memberName=(id:string|null)=>{
    const found=workspace.members.find(m=>m.id===id);
    return found?.name||found?.username||'Не назначен';
  };
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    window.addEventListener('keydown',listener);
    const before=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{window.removeEventListener('keydown',listener);document.body.style.overflow=before;};
  },[onClose]);
  useEffect(()=>{
    let live=true;
    void api.workMonitoringStatus(organizationId,current.id).then(state=>{
      if(live)setMonitorEnabled(state.enabled);
    }).catch(()=>{});
    return()=>{live=false;};
  },[organizationId,current.id]);
  const patch=async(changes:Partial<Pick<WorkCompanyTask,'title'|'description'|'status'|'priority'|'dueAt'|'assignedMemberId'>>)=>{
    if(busy)return;setBusy(true);setError('');
    try{
      const result=await api.updateWorkProjectTask(organizationId,current.projectId,current.id,changes);
      setCurrent(result.task);onChange?.(result.task);
      setTitle(result.task.title);setDescription(result.task.description||'');
      setEditingDescription(false);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить задачу');}
    finally{setBusy(false);}
  };
  const saveTitle=()=>{if(manager&&title.trim().length>=2&&title.trim()!==current.title)void patch({title:title.trim()});};
  return <FocusedTaskWindowFrame>
    <aside data-tour="ai-task-help"
      className="ai-chat-lightweight app-side-panel focused-task-ai-panel focused-task-modal-panel-height relative order-2 hidden min-h-0 w-[450px] shrink-0 flex-col overflow-hidden rounded-[2rem] border p-4 lg:flex">
      {role!=='VIEWER'?<WorkAiPanel key={current.id} organizationId={organizationId} taskId={current.id}
        canManage={manager} canSetModel={role==='OWNER'||role==='ADMIN'} personalFocus/>:
        <p className="text-sm text-muted">Наблюдатель не может отправлять запросы ИИ.</p>}
    </aside>
    <aside className="focused-task-editor-shell focus-mode-shell focused-task-modal-panel-height order-1 relative min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border p-5">
      <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-36 top-3 z-20 lg:hidden"
        onClick={onClose} title="Закрыть"><X size={16}/></button>
      <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-24 top-3 z-20"
        title="Участники совместной задачи" onClick={()=>setShowParticipants(!showParticipants)}><SendHorizontal size={16}/></button>
      <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-14 top-3 z-20"
        title="Установить дедлайн" onClick={()=>setSettingsOpen(true)}><CalendarPlus size={16}/></button>
      <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-5 top-3 z-20"
        title="Настройки задачи" onClick={()=>setSettingsOpen(!settingsOpen)}><Settings size={16}/></button>
      <div className="flex h-full min-h-0 flex-col">
        <div className="focus-main-card flex min-h-0 flex-none flex-col overflow-visible rounded-[2rem] border-0 p-0 shadow-none">
          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус задачи</p>
              <button type="button" className="rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 shadow-sm"
                onClick={()=>setShowParticipants(!showParticipants)}>Совместная задача</button>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <div className="relative min-w-0 flex-1">
                <textarea className="focused-task-title-input invisible-scrollbar min-w-0 w-full resize-none border-0 bg-transparent p-0 text-left text-3xl font-bold leading-tight text-slate-950 shadow-none outline-none"
                  value={title} rows={title.length>34?2:1} disabled={!manager||busy} maxLength={240}
                  onChange={e=>setTitle(e.target.value)} onBlur={saveTitle}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}}/>
              </div>
              {mayComplete&&<button type="button" className="success-button shrink-0 rounded-xl px-3 py-2 text-sm font-semibold"
                disabled={busy||current.status==='DONE'} onClick={()=>void patch({status:'DONE'})}>
                {current.status==='DONE'?'Выполнена':'Выполнить'}</button>}
            </div>
            <div className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-violet-500">
              {monitorEnabled?<><span>Дедлайн:</span><TaskMonitoringBadge/> На усмотрение ИИ</>:
                <span>{current.dueAt?'До дедлайна: '+new Date(current.dueAt).toLocaleString('ru-RU'):'Дедлайн не задан'}</span>}
              {manager&&<DateTimePickerWithApply value={current.dueAt} title="Изменить срок" iconOnly popupAlign="right" detachedPopup
                onChange={value=>patch({dueAt:value})}/>}
            </div>
            <div className="mt-4 flex min-h-0 items-start">
              <div className="focused-task-description w-full">
                {editingDescription&&manager?<div className="grid gap-2">
                  <textarea className="form-field w-full min-h-28 resize-y rounded-xl border p-3 text-sm"
                    maxLength={20000} value={description} onChange={e=>setDescription(e.target.value)}/>
                  <div className="flex justify-end gap-2"><button type="button" className="surface-muted rounded-xl px-3 py-2 text-sm"
                    onClick={()=>setEditingDescription(false)}>Отмена</button>
                    <button type="button" className="primary-button rounded-xl px-3 py-2 text-sm" disabled={busy}
                      onClick={()=>void patch({description})}>Сохранить</button></div>
                </div>:<button type="button" className="min-w-0 w-full text-left whitespace-pre-wrap text-sm leading-6 text-muted"
                  title={manager?'Редактировать описание':'Описание задачи'}
                  disabled={!manager} onClick={()=>setEditingDescription(true)}>{current.description||'Описание не заполнено.'}</button>}
              </div>
            </div>
            {showParticipants&&<div className="mt-3 rounded-2xl border border-amber-300/30 p-3 text-xs text-muted">
              <p>Создатель: <strong>{memberName(current.createdByMemberId)}</strong></p>
              <p className="mt-2">Исполнитель: <strong>{memberName(current.assignedMemberId)}</strong></p>
              <p className="mt-2">Компания: {workspace.organization.name}</p>
            </div>}
            {settingsOpen&&<div className="surface-popover mt-5 rounded-2xl border p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between"><strong className="text-sm">Настройки задачи</strong>
                <button title="Закрыть настройки" onClick={()=>setSettingsOpen(false)}><X size={15}/></button></div>
              <label className="mb-3 flex items-center gap-2 text-sm">Статус
                <select className="form-field min-w-0 flex-1 rounded-lg border p-2" value={current.status}
                  disabled={!mayComplete||busy} onChange={e=>void patch({status:e.target.value as WorkTaskStatus})}>
                  {(Object.keys(statuses) as WorkTaskStatus[]).map(key=><option key={key} value={key}>{statuses[key]}</option>)}
                </select>
              </label>
              <label className="mb-3 flex items-center gap-2 text-sm">Приоритет
                <select className="form-field min-w-0 flex-1 rounded-lg border p-2" value={current.priority}
                  disabled={!manager||busy} onChange={e=>void patch({priority:e.target.value as WorkTaskPriority})}>
                  {(Object.keys(priorities) as WorkTaskPriority[]).map(key=><option key={key} value={key}>{priorities[key]}</option>)}
                </select>
              </label>
              {manager&&<label className="flex items-center gap-2 text-sm">Исполнитель
                <select className="form-field min-w-0 flex-1 rounded-lg border p-2"
                  value={current.assignedMemberId||''} disabled={busy}
                  onChange={e=>void patch({assignedMemberId:e.target.value||null})}>
                  <option value="">Не назначен</option>{workspace.members.map(m=><option key={m.id} value={m.id}>
                    {m.name||m.username||'Сотрудник'}</option>)}
                </select>
              </label>}
            </div>}
            <div className="mt-5 flex items-center justify-between border-t border-violet-500/15 pt-4">
              <h3 className="text-sm font-semibold text-primary">Подзадачи</h3>
              <span className="text-xs text-muted">Раздел пока не подключён в Work</span>
            </div>
            {error&&<p className="mt-3 text-xs text-rose-400" role="alert">{error}</p>}
            <div className="mt-6 flex justify-end">
              <button className="focused-task-icon-button flex items-center gap-2" type="button" onClick={onClose}>
                <X size={15}/> Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </FocusedTaskWindowFrame>;
}
