import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Check, Copy, Link2, Plus, ShieldCheck, Trash2, UserRoundPlus, UsersRound } from 'lucide-react';
import { api, type WorkDepartment, type WorkInvitation, type WorkOrganization, type WorkRole, type WorkWorkspace } from './lib/api';
import WorkProjectsView from './WorkProjectsView';
import WorkAiPanel from './WorkAiPanel';

export type WorkSection = 'overview' | 'projects' | 'team' | 'ai' | 'settings';
const labels: Record<WorkRole,string> = {
  OWNER:'Владелец', ADMIN:'Администратор', MANAGER:'Руководитель', MEMBER:'Сотрудник', VIEWER:'Наблюдатель'
};
const roles: WorkRole[] = ['OWNER','ADMIN','MANAGER','MEMBER','VIEWER'];
const manageable = (role: WorkRole) => role === 'OWNER' || role === 'ADMIN';
const readableError = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие';
const displayName = (member: WorkWorkspace['members'][number]) => member.name || member.username || member.email || 'Пользователь';

export default function WorkCompanyView({ id, section, currentUserId, onBack, onRenamed }:
  { id: string; section: WorkSection; currentUserId: string; onBack: () => void; onRenamed: (organization: WorkOrganization) => void }) {
  const [data,setData] = useState<WorkWorkspace | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [companyName,setCompanyName] = useState('');
  const [departmentName,setDepartmentName] = useState('');
  const [editingDepartment,setEditingDepartment] = useState<string | null>(null);
  const [editingName,setEditingName] = useState('');
  const [inviteRole,setInviteRole] = useState<WorkRole>('MEMBER');
  const [newInvite,setNewInvite] = useState('');
  const [copied,setCopied] = useState(false);
  const reload = async () => {
    const result = await api.getWorkWorkspace(id);
    setData(result);
    return result;
  };
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setData(null);
    setError('');
    void api.getWorkWorkspace(id).then(value => {
      if (!mounted) return;
      setData(value);
      setCompanyName(value.organization.name);
    }).catch(cause => { if (mounted) setError(readableError(cause)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  },[id]);
  const act = async (callback: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await callback(); await reload(); }
    catch (cause) { setError(readableError(cause)); }
    finally { setBusy(false); }
  };
  if (loading) return <div className="work-company-state" role="status">Открываем компанию…</div>;
  if (!data) return <div className="work-company-state"><p role="alert">{error || 'Нет доступа к компании'}</p><button type="button" onClick={onBack}>Вернуться к организациям</button></div>;
  const {organization,members,departments,invitations} = data;
  const manager = manageable(organization.role);
  const owner = organization.role === 'OWNER';
  const canEditRole = (member: WorkWorkspace['members'][number]) => manager && (owner || !['OWNER','ADMIN'].includes(member.role));
  const roleChoices = roles.filter(role => owner || !['OWNER','ADMIN'].includes(role));
  const totalDepartments = departments.length;
  const selectDepartment = (member: WorkWorkspace['members'][number], next: string) => void act(() =>
    api.updateWorkMember(id,member.id,{departmentId:next || null}));
  const selectRole = (member: WorkWorkspace['members'][number],next: WorkRole) => {
    if (next === 'OWNER' && !window.confirm('Назначить этому сотруднику права владельца компании?')) return;
    void act(() => api.updateWorkMember(id,member.id,{role:next}));
  };
  const remove = (member: WorkWorkspace['members'][number]) => {
    if (!window.confirm(member.userId === currentUserId ? 'Покинуть компанию? Вы потеряете доступ.' : 'Исключить сотрудника из компании?')) return;
    void act(async () => {
      await api.removeWorkMember(id,member.id);
      if (member.userId === currentUserId) window.location.assign('/');
    });
  };
  const makeDepartment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void act(async()=> { await api.createWorkDepartment(id,departmentName); setDepartmentName(''); });
  };
  const makeInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void act(async()=> {
      const {invitation} = await api.createWorkInvitation(id,inviteRole);
      setNewInvite(invitation.url || '');
      setCopied(false);
    });
  };
  const rename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void act(async()=> {
      const { organization: updated } = await api.renameWorkOrganization(id,companyName);
      onRenamed(updated);
    });
  };
  const sectionText = section === 'team' ? 'Команда' : section === 'settings' ? 'Настройки' : section === 'projects' ? 'Проекты' : section === 'ai' ? 'ИИ-диспетчер' : 'Обзор';
  return <div className="work-company">
    <button type="button" className="work-company-back" onClick={onBack}><ArrowLeft size={16}/> Все организации</button>
    <div className="work-company-header">
      <span className="work-company-logo"><Building2 size={26}/></span>
      <div><div className="work-kicker">КОРПОРАТИВНОЕ ПРОСТРАНСТВО</div><h1>{organization.name}</h1><p className="work-lead">{sectionText} · Ваша роль: {labels[organization.role]}</p></div>
    </div>
    {error && <div className="work-company-error" role="alert">{error}<button type="button" onClick={()=>setError('')}>Закрыть</button></div>}
    {section === 'overview' && <>
      <div className="work-company-stats">
        <article><UsersRound size={21}/><strong>{members.length}</strong><span>Участников</span></article>
        <article><Building2 size={21}/><strong>{totalDepartments}</strong><span>Подразделений</span></article>
        <article><UserRoundPlus size={21}/><strong>{manager ? invitations.length : '—'}</strong><span>Активных приглашений</span></article>
      </div>
      <div className="work-company-panel">
        <h2>Рабочее пространство создано</h2>
        <p>Данные компании отделены от личных задач пользователей. Теперь можно управлять сотрудниками, ролями и подразделениями. Корпоративные проекты и задачи подключим следующим этапом.</p>
        <div className="work-company-tags"><span><Check size={15}/> Участники</span><span><Check size={15}/> Подразделения</span><span><ShieldCheck size={15}/> Серверные права</span></div>
      </div>
    </>}
    {section === 'team' && <>
      <div className="work-company-panel">
        <div className="work-company-panel-title"><div><h2>Сотрудники</h2><p>Участники текущей компании. Права проверяются сервером.</p></div><span>{members.length} человек</span></div>
        <div className="work-members">
          {members.map(member => <div key={member.id} className="work-member">
            <div className="work-member-avatar">{displayName(member).charAt(0).toUpperCase()}</div>
            <div className="work-member-name"><strong>{displayName(member)} {member.userId === currentUserId && <small>(вы)</small>}</strong><span>{member.username ? '@'+member.username : member.email || 'Аккаунт Планировыча'}</span></div>
            <label className="work-field"><span>Роль</span><select value={member.role} disabled={busy || !canEditRole(member)}
              onChange={event=>selectRole(member,event.target.value as WorkRole)}>
                {roles.map(role=><option key={role} value={role} disabled={!roleChoices.includes(role)}>{labels[role]}</option>)}
              </select></label>
            <label className="work-field"><span>Подразделение</span><select value={member.departmentId || ''} disabled={!manager || busy} onChange={event=>selectDepartment(member,event.target.value)}>
              <option value="">Без отдела</option>{departments.map(dept=><option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select></label>
            {(canEditRole(member) || member.userId === currentUserId) && <button className="work-icon-danger" type="button" disabled={busy} onClick={()=>remove(member)} title={member.userId === currentUserId ? 'Выйти из компании' : 'Исключить сотрудника'} aria-label={member.userId === currentUserId ? 'Выйти из компании' : 'Исключить сотрудника'}><Trash2 size={16}/></button>}
          </div>)}
        </div>
      </div>
      <div className="work-company-panel">
        <div className="work-company-panel-title"><div><h2>Подразделения</h2><p>Отделы для распределения сотрудников внутри компании.</p></div><span>{totalDepartments}</span></div>
        <div className="work-departments">{departments.map((dept: WorkDepartment) => <div className="work-department" key={dept.id}>
          {editingDepartment === dept.id ? <form onSubmit={e=>{e.preventDefault();void act(async()=>{ await api.renameWorkDepartment(id,dept.id,editingName); setEditingDepartment(null); });}} className="work-dept-edit">
            <input aria-label="Новое название отдела" autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} maxLength={80} required/>
            <button type="submit" disabled={busy || editingName.trim().length<2}>Сохранить</button><button type="button" onClick={()=>setEditingDepartment(null)}>Отмена</button>
          </form> : <><span><Building2 size={16}/><strong>{dept.name}</strong><small>{members.filter(m=>m.departmentId===dept.id).length} сотрудников</small></span>
            {manager && <div className="work-department-actions"><button type="button" disabled={busy} onClick={()=>{setEditingDepartment(dept.id);setEditingName(dept.name);}}>Изменить</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Удалить подразделение? Сотрудники останутся в компании без отдела.'))void act(()=>api.deleteWorkDepartment(id,dept.id));}}>Удалить</button></div>}</>}
        </div>)}
          {!departments.length && <div className="work-muted">Подразделения ещё не созданы.</div>}
        </div>
        {manager && <form className="work-company-form" onSubmit={makeDepartment}><label htmlFor="work-new-department">Новое подразделение</label><div><input id="work-new-department" value={departmentName} onChange={event=>setDepartmentName(event.target.value)} placeholder="Например, Отдел продаж" maxLength={80} required/><button type="submit" disabled={busy || departmentName.trim().length<2}><Plus size={16}/> Создать</button></div></form>}
      </div>
      {manager && <div className="work-company-panel">
        <div className="work-company-panel-title"><div><h2>Приглашения</h2><p>Одноразовая ссылка действует 7 дней. Сотруднику нужен зарегистрированный аккаунт Планировыча.</p></div><Link2 size={20}/></div>
        <form className="work-company-form" onSubmit={makeInvite}>
          <label htmlFor="work-invite-role">Роль приглашённого</label>
          <div><select id="work-invite-role" value={inviteRole} onChange={e=>setInviteRole(e.target.value as WorkRole)}>
            {(['ADMIN','MANAGER','MEMBER','VIEWER'] as WorkRole[]).filter(r=>owner || r!=='ADMIN').map(role=><option key={role} value={role}>{labels[role]}</option>)}
          </select><button type="submit" disabled={busy}><UserRoundPlus size={16}/> Создать ссылку</button></div>
        </form>
        {newInvite && <div className="work-invite-created"><p>Ссылка создана. Скопируйте её сейчас: для безопасности она больше не будет показана.</p><div><input aria-label="Ссылка приглашения" readOnly value={newInvite}/><button type="button" onClick={()=>{void navigator.clipboard.writeText(newInvite).then(()=>setCopied(true)).catch(()=>setError('Не удалось скопировать ссылку. Выделите и скопируйте текст вручную.'));}}><Copy size={16}/>{copied?'Скопировано':'Копировать'}</button></div></div>}
        {invitations.length>0 && <><h3 className="work-subtitle">Активные приглашения</h3>{invitations.map((invitation:WorkInvitation)=><div className="work-invitation-row" key={invitation.id}><span>{labels[invitation.role]} · до {new Date(invitation.expiresAt).toLocaleDateString('ru-RU')}</span><button disabled={busy} type="button" onClick={()=>{if(window.confirm('Отозвать это приглашение?'))void act(()=>api.revokeWorkInvitation(id,invitation.id));}}>Отозвать</button></div>)}</>}
      </div>}
    </>}
    {section === 'settings' && <div className="work-company-panel">
      <h2>Настройки организации</h2><p>Название компании видят её участники. Менять его могут владелец и администратор.</p>
      <form className="work-company-form" onSubmit={rename}><label htmlFor="work-company-name">Название компании</label><div><input id="work-company-name" maxLength={100} value={companyName} onChange={e=>setCompanyName(e.target.value)} disabled={!manager || busy} required/><button type="submit" disabled={!manager || busy || companyName.trim().length<2 || companyName===organization.name}>Сохранить <ArrowRight size={15}/></button></div></form>
      <div className="work-company-details"><div>Идентификатор компании <code>{organization.id}</code></div><div>Дата создания <strong>{new Date(organization.createdAt).toLocaleDateString('ru-RU')}</strong></div><div>Твоя роль <strong>{labels[organization.role]}</strong></div></div>
    </div>}
    {section === 'projects' && <WorkProjectsView organizationId={id} workspace={data} currentUserId={currentUserId}/>}
    {section === 'ai' && (['OWNER','ADMIN','MANAGER'].includes(organization.role)
      ? <WorkAiPanel organizationId={id} canManage canSetModel={manager}/>
      : <div className="work-company-panel work-company-upcoming"><h2>ИИ-диспетчер компании</h2><p>Доступ к корпоративному ИИ-диспетчеру имеют владельцы, администраторы и руководители.</p></div>)} 
  </div>;
}
