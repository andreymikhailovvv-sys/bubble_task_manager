import { useEffect, useState, type FormEvent } from 'react';
import { Archive, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, FolderKanban, Plus, Trash2 } from 'lucide-react';
import { api, type WorkCompanyTask, type WorkProject, type WorkTaskStatus, type WorkTaskPriority, type WorkWorkspace } from './lib/api';

const statusNames: Record<WorkTaskStatus,string>={TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Готово'};
const priorityNames: Record<WorkTaskPriority,string>={LOW:'Низкий',NORMAL:'Обычный',HIGH:'Высокий',CRITICAL:'Критический'};
const readable=(e:unknown)=>e instanceof Error?e.message:'Операция не выполнена';
const dateInput=(date:string|null)=>{ if(!date)return '';const time=new Date(date);return new Date(time.getTime()-time.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const managerRole=(role:WorkWorkspace['organization']['role'])=>['OWNER','ADMIN','MANAGER'].includes(role);

export default function WorkProjectsView({organizationId,workspace,currentUserId}:{organizationId:string;workspace:WorkWorkspace;currentUserId:string}) {
  const [projects,setProjects]=useState<WorkProject[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [tasks,setTasks]=useState<WorkCompanyTask[]>([]);
  const [loading,setLoading]=useState(true);
  const [loadingTasks,setLoadingTasks]=useState(false);
  const [truncated,setTruncated]=useState(false);
  const [taskTruncated,setTaskTruncated]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [name,setName]=useState('');
  const [projectDescription,setProjectDescription]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [priority,setPriority]=useState<WorkTaskPriority>('NORMAL');
  const [due,setDue]=useState('');
  const [assignee,setAssignee]=useState('');
  const [filter,setFilter]=useState<'open'|'archived'>('open');
  const canManage=managerRole(workspace.organization.role);
  const selfMember=workspace.members.find(m=>m.userId===currentUserId);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');setSelected(null);
    void api.listWorkProjects(organizationId).then(value=>{
      if(!live)return;
      setProjects(value.projects);setTruncated(value.hasMore);
    }).catch(e=>{if(live)setError(readable(e));})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[organizationId]);
  useEffect(()=>{
    if(!selected){setTasks([]);return;}
    let live=true;setLoadingTasks(true);setError('');
    void api.listWorkProjectTasks(organizationId,selected).then(result=>{
      if(live){setTasks(result.tasks);setTaskTruncated(result.hasMore);}
    }).catch(e=>{if(live)setError(readable(e));})
      .finally(()=>{if(live)setLoadingTasks(false);});
    return()=>{live=false;};
  },[organizationId,selected]);
  const run=async(callback:()=>Promise<void>)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await callback();}catch(e){setError(readable(e));}finally{setBusy(false);}
  };
  const selectedProject=projects.find(p=>p.id===selected);
  const refreshProjects=async()=>{
    const response=await api.listWorkProjects(organizationId);
    setProjects(response.projects);setTruncated(response.hasMore);
  };
  const createProject=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    void run(async()=>{
      const response=await api.createWorkProject(organizationId,name,projectDescription);
      await refreshProjects();setName('');setProjectDescription('');setSelected(response.project.id);
    });
  };
  const createTask=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!selected)return;
    void run(async()=>{
      await api.createWorkProjectTask(organizationId,selected,{
        title,description,priority,dueAt:due?new Date(due).toISOString():null,
        assignedMemberId:assignee||null
      });
      const response=await api.listWorkProjectTasks(organizationId,selected);
      setTasks(response.tasks);setTaskTruncated(response.hasMore);
      setTitle('');setDescription('');setDue('');setPriority('NORMAL');setAssignee('');
      await refreshProjects();
    });
  };
  const patchTask=(task:WorkCompanyTask,changes:Partial<Pick<WorkCompanyTask,'title'|'description'|'priority'|'dueAt'|'assignedMemberId'|'status'>>)=>{
    if(!selected)return;
    void run(async()=>{
      const result=await api.updateWorkProjectTask(organizationId,selected,task.id,changes);
      setTasks(prev=>prev.map(item=>item.id===task.id?result.task:item));
    });
  };
  const showName=(id:string|null)=>id
    ? (()=>{const member=workspace.members.find(m=>m.id===id);return member?.name||member?.username||'Сотрудник';})()
    : 'Не назначен';
  return <div className="work-projects">
    <div className="work-company-panel">
      <div className="work-company-panel-title"><div><h2>Проекты компании</h2><p>Проекты принадлежат организации. Личные задачи сотрудников остаются отдельно.</p></div><span>{projects.filter(p=>!p.isArchived).length} активных</span></div>
      {error && <p className="work-project-error" role="alert">{error}</p>}
      {canManage&&<form onSubmit={createProject} className="work-project-form">
        <label htmlFor="work-project-title">Новый проект</label>
        <input id="work-project-title" required minLength={2} maxLength={120} placeholder="Название проекта" value={name} onChange={e=>setName(e.target.value)}/>
        <textarea aria-label="Описание проекта" maxLength={20000} value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} rows={2} placeholder="Описание (необязательно)"/>
        <button type="submit" disabled={busy||name.trim().length<2}><Plus size={16}/> Создать проект</button>
      </form>}
      <div className="work-project-switch"><button type="button" className={filter==='open'?'selected':''} onClick={()=>setFilter('open')}>Активные</button><button type="button" className={filter==='archived'?'selected':''} onClick={()=>setFilter('archived')}>Архив</button></div>
      {loading?<p className="work-muted">Загружаем проекты…</p>:
        <div className="work-project-list">{projects.filter(p=>p.isArchived===(filter==='archived')).map(project=><button type="button" key={project.id} className={'work-project-item '+(selected===project.id?'selected':'')} onClick={()=>setSelected(project.id)}>
          <FolderKanban size={19}/><span><strong>{project.name}</strong><small>{project.description||'Без описания'}</small></span><em>{project.taskCount??0} задач</em><ArrowRight size={15}/>
        </button>)}
        {!projects.some(p=>p.isArchived===(filter==='archived'))&&<p className="work-muted">Здесь пока нет проектов.</p>}
        {truncated&&<p className="work-project-error">Показаны первые 200 проектов. Для полного перечня понадобится постраничная навигация.</p>}
        </div>}
    </div>
    {selectedProject&&<div className="work-company-panel">
      <div className="work-company-panel-title"><div><h2>{selectedProject.name}</h2><p>{selectedProject.description||'Командные задачи и поручения'}</p></div>
        {canManage&&<button type="button" className="work-project-archive" disabled={busy} onClick={()=>{void run(async()=>{await api.updateWorkProject(organizationId,selectedProject.id,{isArchived:!selectedProject.isArchived});await refreshProjects();});}}><Archive size={15}/>{selectedProject.isArchived?'Вернуть':'Архивировать'}</button>}
      </div>
      {canManage&&!selectedProject.isArchived&&<form onSubmit={createTask} className="work-task-form">
        <h3>Новое поручение</h3>
        <input required minLength={2} maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Что необходимо сделать?"/>
        <textarea aria-label="Описание поручения" rows={2} maxLength={20000} placeholder="Детали задачи (необязательно)" value={description} onChange={e=>setDescription(e.target.value)}/>
        <div className="work-task-fields">
          <label>Исполнитель<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Не назначен</option>{workspace.members.map(m=><option key={m.id} value={m.id}>{m.name||m.username||'Сотрудник'}</option>)}</select></label>
          <label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value as WorkTaskPriority)}>{(['LOW','NORMAL','HIGH','CRITICAL'] as WorkTaskPriority[]).map(key=><option key={key} value={key}>{priorityNames[key]}</option>)}</select></label>
          <label>Срок<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
        </div>
        <button type="submit" disabled={busy||title.trim().length<2}><Plus size={16}/> Добавить задачу</button>
      </form>}
      {loadingTasks?<p className="work-muted">Загружаем задачи…</p>:<div className="work-task-list">
        {tasks.map(task=><article className="work-task-item" key={task.id}>
          <div className="work-task-item-heading"><ClipboardList size={19}/><div><strong>{task.title}</strong><small>{task.description||'Без описания'}</small></div><span className={'work-task-priority '+task.priority.toLowerCase()}>{priorityNames[task.priority]}</span></div>
          <div className="work-task-fields">
            <label>Статус<select value={task.status} disabled={busy||selectedProject.isArchived||(!canManage&&(workspace.organization.role!=='MEMBER'||task.assignedMemberId!==selfMember?.id))}
              onChange={e=>patchTask(task,{status:e.target.value as WorkTaskStatus})}>{(['TODO','IN_PROGRESS','REVIEW','DONE'] as WorkTaskStatus[]).map(status=><option value={status} key={status}>{statusNames[status]}</option>)}</select></label>
            <label>Исполнитель<select value={task.assignedMemberId||''} disabled={busy||!canManage||selectedProject.isArchived} onChange={e=>patchTask(task,{assignedMemberId:e.target.value||null})}>
              <option value="">Не назначен</option>{workspace.members.map(m=><option value={m.id} key={m.id}>{m.name||m.username||'Сотрудник'}</option>)}
            </select></label>
            <label>Срок<input type="datetime-local" disabled={busy||!canManage||selectedProject.isArchived} value={dateInput(task.dueAt)} onChange={e=>patchTask(task,{dueAt:e.target.value?new Date(e.target.value).toISOString():null})}/></label>
          </div>
          <div className="work-task-footer"><span><CalendarDays size={14}/> {task.dueAt?new Date(task.dueAt).toLocaleString('ru-RU'):'Без срока'}</span><span><CheckCircle2 size={14}/> {showName(task.assignedMemberId)}</span>
            {canManage&&!selectedProject.isArchived&&<button type="button" disabled={busy} onClick={()=>{if(!window.confirm('Удалить задачу из проекта?'))return;void run(async()=>{await api.deleteWorkProjectTask(organizationId,selectedProject.id,task.id);setTasks(prev=>prev.filter(t=>t.id!==task.id));await refreshProjects();});}}><Trash2 size={15}/> Удалить</button>}
          </div>
        </article>)}
        {!tasks.length&&<p className="work-muted">Задач пока нет.</p>}
        {taskTruncated&&<p className="work-project-error">Показаны первые 500 задач. Для полного перечня понадобится постраничная навигация.</p>}
      </div>}
    </div>}
  </div>;
}
