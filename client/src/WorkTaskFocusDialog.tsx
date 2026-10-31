import {useEffect,useState} from 'react';
import {X,PanelRight,CalendarClock,Flag,UserRound,CheckCircle2} from 'lucide-react';
import {api,type WorkCompanyTask,type WorkDashboardTask,type WorkTaskStatus,type WorkTaskPriority,type WorkWorkspace} from './lib/api';
import WorkAiPanel from './WorkAiPanel';

const statuses:Record<WorkTaskStatus,string>={TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Готово'};
const priorities:Record<WorkTaskPriority,string>={LOW:'Низкий',NORMAL:'Обычный',HIGH:'Высокий',CRITICAL:'Критический'};
const localDate=(iso:string|null)=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function WorkTaskFocusDialog({organizationId,task,workspace,currentUserId,onClose,onChange}:
 {organizationId:string;task:WorkCompanyTask|WorkDashboardTask;workspace:WorkWorkspace;currentUserId:string;
 onClose:()=>void;onChange?:(updated:WorkCompanyTask)=>void}) {
  const [current,setCurrent]=useState(task);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [draftTitle,setDraftTitle]=useState(task.title);
  const [draftDescription,setDraftDescription]=useState(task.description||'');
  const [edit,setEdit]=useState(false);
  const [aiShown,setAiShown]=useState(true);
  const projectName=('project' in task ? task.project.name : '');
  const role=workspace.organization.role;
  const manager=['OWNER','ADMIN','MANAGER'].includes(role);
  const member=workspace.members.find(m=>m.userId===currentUserId);
  const joint=Boolean(member&&[current.assignedMemberId,current.createdByMemberId].includes(member.id));
  const mayChangeStatus=manager||(role==='MEMBER'&&joint);
  const name=(id:string|null)=>workspace.members.find(m=>m.id===id)?.name||
     workspace.members.find(m=>m.id===id)?.username||'Не назначен';
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    document.addEventListener('keydown',listener);
    const old=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',listener);document.body.style.overflow=old;};
  },[onClose]);
  const patch=async(changes:Partial<Pick<WorkCompanyTask,'title'|'description'|'status'|'priority'|'dueAt'|'assignedMemberId'>>)=>{
    if(busy)return;setBusy(true);setError('');
    try{
      const response=await api.updateWorkProjectTask(organizationId,current.projectId,current.id,changes);
      setCurrent(response.task);onChange?.(response.task);
      setDraftTitle(response.task.title);setDraftDescription(response.task.description||'');
      setEdit(false);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось обновить задачу');}
    finally{setBusy(false);}
  };
  return <div className="work-focus-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={'Фокус задачи: '+current.title} className="work-focus-window">
      <header className="work-focus-header"><div><span>ФОКУС ЗАДАЧИ · {projectName||'Корпоративный проект'}</span><strong>{current.title}</strong></div>
        <div><button type="button" onClick={()=>setAiShown(!aiShown)} title="Показать или скрыть помощь ИИ"><PanelRight size={19}/></button>
        <button type="button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></div></header>
      <div className={'work-focus-columns '+(!aiShown?'work-focus-single':'')}>
        <div className="work-focus-details">
          <p className="work-focus-meta">Совместная корпоративная задача</p>
          <div className="work-focus-participants">
            <span><UserRound size={16}/> Создатель: <strong>{name(current.createdByMemberId)}</strong></span>
            <span><UserRound size={16}/> Исполнитель: <strong>{name(current.assignedMemberId)}</strong></span>
          </div>
          <div className="work-focus-field"><label>Статус</label><select value={current.status} disabled={busy||!mayChangeStatus}
             onChange={e=>void patch({status:e.target.value as WorkTaskStatus})}>
             {(Object.keys(statuses) as WorkTaskStatus[]).map(k=><option key={k} value={k}>{statuses[k]}</option>)}
          </select></div>
          <div className="work-focus-field"><label><Flag size={15}/> Приоритет</label><select value={current.priority} disabled={!manager||busy}
             onChange={e=>void patch({priority:e.target.value as WorkTaskPriority})}>
             {(Object.keys(priorities) as WorkTaskPriority[]).map(k=><option key={k} value={k}>{priorities[k]}</option>)}
          </select></div>
          <div className="work-focus-field"><label><CalendarClock size={15}/> Deadline</label><input type="datetime-local"
            value={localDate(current.dueAt)} disabled={!manager||busy}
            onChange={e=>void patch({dueAt:e.target.value?new Date(e.target.value).toISOString():null})}/></div>
          {manager&&<div className="work-focus-field"><label>Назначить исполнителя</label>
            <select value={current.assignedMemberId||''} disabled={busy} onChange={e=>void patch({assignedMemberId:e.target.value||null})}>
              <option value="">Не назначен</option>{workspace.members.map(m=><option key={m.id} value={m.id}>{m.name||m.username||'Сотрудник'}</option>)}
            </select>
          </div>}
          <div className="work-focus-description"><div><h3>Описание</h3>{manager&&<button type="button" onClick={()=>setEdit(!edit)}>{edit?'Отмена':'Редактировать'}</button>}</div>
            {edit&&manager?<form onSubmit={e=>{e.preventDefault();void patch({title:draftTitle,description:draftDescription});}}>
              <input value={draftTitle} onChange={e=>setDraftTitle(e.target.value)} minLength={2} maxLength={240} required/>
              <textarea rows={7} value={draftDescription} onChange={e=>setDraftDescription(e.target.value)} maxLength={20000}/>
              <button type="submit" disabled={busy||draftTitle.trim().length<2}>Сохранить</button>
            </form>:<p>{current.description||'Описание пока не добавлено.'}</p>}
          </div>
          {error&&<p role="alert" className="work-ai-error">{error}</p>}
          {current.status==='DONE'&&<div className="work-focus-done"><CheckCircle2 size={17}/> Задача завершена</div>}
        </div>
        {aiShown&&role!=='VIEWER'&&<div className="work-focus-ai"><WorkAiPanel key={current.id} organizationId={organizationId}
          taskId={current.id} canManage={manager}/></div>}
      </div>
    </section>
  </div>;
}
