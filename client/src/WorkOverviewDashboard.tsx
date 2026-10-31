import {useEffect,useState} from 'react';
import {ArrowUpRight,CalendarDays,CheckCircle2,Clock3,FolderKanban,LayoutDashboard,ListTodo,UsersRound,AlertTriangle,ChevronRight} from 'lucide-react';
import {api,type WorkDashboard,type WorkDashboardTask,type WorkCompanyTask,type WorkWorkspace} from './lib/api';
import WorkTaskFocusDialog from './WorkTaskFocusDialog';
import WorkQuickAi from './WorkQuickAi';

const statusName:Record<string,string>={TODO:'Новая',IN_PROGRESS:'В работе',REVIEW:'На проверке',DONE:'Выполнена'};
const day=(value:string|null)=>value?new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'Без срока';
const isLate=(task:WorkDashboardTask)=>Boolean(task.dueAt&&task.status!=='DONE'&&Date.parse(task.dueAt)<Date.now());
const errorText=(error:unknown)=>error instanceof Error?error.message:'Не удалось загрузить рабочую панель';

export default function WorkOverviewDashboard({organizationId,workspace,userId,onOpenCompanyCard,onOpenProjects}:
 {organizationId:string;workspace:WorkWorkspace;userId:string;onOpenCompanyCard:()=>void;onOpenProjects:()=>void}){
  const [dashboard,setDashboard]=useState<WorkDashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [focus,setFocus]=useState<WorkDashboardTask|null>(null);
  const role=workspace.organization.role;
  const manager=['OWNER','ADMIN','MANAGER'].includes(role);
  const owner=role==='OWNER'||role==='ADMIN';
  useEffect(()=>{
    let mounted=true;setDashboard(null);setError('');setLoading(true);setFocus(null);
    void api.workDashboard(organizationId).then(d=>{if(mounted)setDashboard(d);})
      .catch(e=>{if(mounted)setError(errorText(e));})
      .finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[organizationId]);
  useEffect(()=>{
    const refresh=()=>{void api.workDashboard(organizationId).then(setDashboard).catch(e=>setError(errorText(e)));};
    window.addEventListener('work-ai-proposal-applied',refresh);
    return()=>window.removeEventListener('work-ai-proposal-applied',refresh);
  },[organizationId]);
  if(loading)return <div className="work-company-state" role="status">Загружаем рабочую панель…</div>;
  if(!dashboard)return <div className="work-company-state" role="alert">{error||'Нет данных организации'}</div>;
  const tasks=dashboard.tasks;
  const overdue=tasks.filter(isLate);
  const active=tasks.filter(task=>task.status!=='DONE');
  const done=tasks.filter(task=>task.status==='DONE');
  const mine=tasks.filter(task=>task.assignedMemberId===dashboard.memberId);
  const focusChange=(next:WorkCompanyTask)=>{
    setDashboard(previous=>previous?{...previous,tasks:previous.tasks.map(t=>t.id===next.id?{...t,...next}:t)}:previous);
    setFocus(prev=>prev&&prev.id===next.id?{...prev,...next}:prev);
  };
  const card=(task:WorkDashboardTask)=> <article className={'work-overview-task '+(isLate(task)?'late':'')} key={task.id}>
    <div className="work-overview-task-top"><span>{statusName[task.status]}</span>
      {isLate(task)&&<span className="late-indicator"><AlertTriangle size={13}/> Просрочена</span>}</div>
    <strong>{task.title}</strong>
    <div className="work-overview-task-info"><span><CalendarDays size={14}/>{day(task.dueAt)}</span><span>
      <UsersRound size={14}/>{task.assignee?.user.name||task.assignee?.user.username||'Не назначен'}</span></div>
    <button type="button" onClick={()=>setFocus(task)}>Открыть фокус задачи <ArrowUpRight size={15}/></button>
  </article>;
  return <div className="work-overview">
    <div className="work-overview-head">
      <div><span className="work-kicker"><LayoutDashboard size={16}/> РАБОЧАЯ ПАНЕЛЬ</span>
        <h1>{manager?'Контроль работы компании':'Моя рабочая панель'}</h1>
        <p>{manager?'Проекты, задачи команды и просроченные поручения.':'Проекты, в которых вы участвуете, и ваши поручения.'}</p></div>
      <button type="button" className="work-overview-company-link" onClick={onOpenCompanyCard}>
        <ArrowUpRight size={17}/> Открыть карточку компании</button>
    </div>
    <div className="work-overview-metrics">
      {manager?<><article><FolderKanban size={18}/><strong>{dashboard.stats.projects}</strong><span>Проектов</span></article>
        <article><ListTodo size={18}/><strong>{dashboard.stats.open}</strong><span>Задач в работе</span></article>
        <article className={dashboard.stats.overdue?'attention':''}><Clock3 size={18}/><strong>{dashboard.stats.overdue}</strong><span>Просрочено</span></article>
        <article><CheckCircle2 size={18}/><strong>{dashboard.stats.tasks-dashboard.stats.open}</strong><span>Завершено</span></article></>:
        <><article><FolderKanban size={18}/><strong>{dashboard.stats.projects}</strong><span>Мои проекты</span></article>
        <article><ListTodo size={18}/><strong>{mine.filter(t=>t.status!=='DONE').length}</strong><span>Мои поручения в работе</span></article>
        <article className={dashboard.stats.overdue?'attention':''}><Clock3 size={18}/><strong>{dashboard.stats.overdue}</strong><span>Просроченные задачи</span></article>
        <article><CheckCircle2 size={18}/><strong>{dashboard.stats.tasks-dashboard.stats.open}</strong><span>Выполнено</span></article></>}
    </div>
    {manager&&overdue.length>0&&<section className="work-overview-section">
      <div className="work-overview-section-head"><h2><AlertTriangle size={18}/> Требует внимания</h2><span>{overdue.length} в списке</span></div>
      <div className="work-overview-task-grid">{overdue.slice(0,6).map(card)}</div>
    </section>}
    {!manager&&active.length>0&&<section className="work-overview-section">
      <div className="work-overview-section-head"><h2><ListTodo size={18}/> Мои активные задачи</h2><span>{active.length} в списке</span></div>
      <div className="work-overview-task-grid">{active.slice(0,8).map(card)}</div>
    </section>}
    <section className="work-overview-section">
      <div className="work-overview-section-head"><h2><FolderKanban size={18}/> {manager?'Проекты организации':'Мои проекты'}</h2>
        <button type="button" onClick={onOpenProjects}>Все проекты <ChevronRight size={16}/></button></div>
      {dashboard.projects.length? <div className="work-overview-projects">{dashboard.projects.map(project=>{
        const projectTasks=tasks.filter(t=>t.projectId===project.id);
        const incomplete=projectTasks.filter(t=>t.status!=='DONE');
        return <article key={project.id} className="work-overview-project">
          <div className="work-overview-project-head"><div className="work-overview-project-icon"><FolderKanban size={20}/></div>
            <div><h3>{project.name}</h3><p>{project.description||'Рабочий проект'}</p></div>
            <span>{projectTasks.length} задач в списке</span></div>
          <div className="work-overview-progress"><div style={{width:projectTasks.length?((projectTasks.length-incomplete.length)/projectTasks.length*100)+'%':'0%'}}/></div>
          <div className="work-overview-project-tasks">{projectTasks.slice(0,8).map(task=><button type="button" key={task.id} onClick={()=>setFocus(task)}>
            <span className={task.status==='DONE'?'completed':''}><span className="work-overview-status-dot"/>{task.title}</span>
            <span>{day(task.dueAt)} <ArrowUpRight size={13}/></span>
          </button>)}
            {!projectTasks.length&&<p>Пока нет задач, доступных вашему аккаунту.</p>}
          </div></article>;
      })}</div>:<div className="work-company-panel work-overview-empty">Пока нет доступных проектов. После назначения сотрудника на задачу она появится здесь автоматически.</div>}
    </section>
    {manager&&done.length>0&&<p className="work-overview-footnote">Завершено задач в показанной выборке: {done.length}.</p>}
    {dashboard.hasMoreTasks&&<p className="work-overview-footnote">Показаны первые 200 задач. Полный список доступен во вкладке «Проекты».</p>}
    {role!=='VIEWER'&&<WorkQuickAi organizationId={organizationId} dashboard={dashboard}/>}
    {focus&&<WorkTaskFocusDialog key={focus.id} organizationId={organizationId} task={focus}
      workspace={workspace} currentUserId={userId} onClose={()=>setFocus(null)} onChange={focusChange}/>}
  </div>;
}
