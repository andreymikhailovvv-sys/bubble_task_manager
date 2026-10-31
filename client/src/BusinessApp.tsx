import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, BriefcaseBusiness, CheckCircle2, ChevronRight, FolderKanban, LayoutDashboard, Layers3, LoaderCircle, LockKeyhole, LogOut, Settings2, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { api, type CurrentUser, type WorkOrganization } from './lib/api';
import './BusinessApp.css';
import WorkCompanyView from './WorkCompanyView';
import WorkInvitationJoin from './WorkInvitationJoin';

type Section = 'overview' | 'projects' | 'team' | 'ai' | 'settings';
type Phase = 'loading' | 'login' | 'ready' | 'forbidden' | 'setup' | 'error';
type Access = { phase: Phase; user?: CurrentUser; message?: string };
const sections = [
  { id: 'overview', title: 'Обзор', icon: LayoutDashboard, summary: 'Стартовая страница корпоративного пространства.' },
  { id: 'projects', title: 'Проекты', icon: FolderKanban, summary: 'Проекты, исполнители, сроки и согласования.' },
  { id: 'team', title: 'Команда', icon: UsersRound, summary: 'Сотрудники, подразделения и роли.' },
  { id: 'ai', title: 'ИИ-диспетчер', icon: Bot, summary: 'Интеллектуальное сопровождение рабочих процессов.' },
  { id: 'settings', title: 'Конфигурация', icon: Settings2, summary: 'Настройка корпоративных экранов и правил.' }
] as const;
async function checkAccess(): Promise<Access> {
  try {
    const response = await fetch('/api/business/bootstrap', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({})) as { user?: CurrentUser; error?: string };
    if (response.ok && data.user) return { phase: 'ready', user: data.user };
    if (response.status === 401) return { phase: 'login' };
    if (response.status === 403) return { phase: 'forbidden' };
    if (response.status === 503) return { phase: 'setup' };
    return { phase: 'error', message: data.error || 'Не удалось проверить доступ.' };
  } catch {
    return { phase: 'error', message: 'Нет соединения с сервером.' };
  }
}
function Brand() {
  return <div className="work-brand"><div className="work-logo"><Layers3 size={22} /></div><div><strong>Планировыч <span>Work</span></strong><small>Корпоративное пространство</small></div></div>;
}
function AccessPage({ access, onAccess, onLogout }: { access: Access; onAccess: (a: Access) => void; onLogout: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError('');
    try {
      await api.login({ login: login.trim(), password });
      setPassword('');
      onAccess(await checkAccess());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка входа'); }
    finally { setSending(false); }
  }
  return <div className="work-root work-auth">
    <header className="work-auth-header"><Brand /></header>
    <div className="work-auth-layout">
      <section className="work-auth-intro">
        <div className="work-kicker"><Sparkles size={15} /> Единое пространство для бизнеса</div>
        <h1>Управлять компанией.<br /><span>Работать с умом.</span></h1>
        <p>Привычная экосистема Планировыча с новым уровнем возможностей: проекты, сотрудники, процессы и искусственный интеллект.</p>
        <div className="work-intro-list"><div><CheckCircle2 size={17}/> Единое ядро с личным Планировычем</div><div><CheckCircle2 size={17}/> Самостоятельный корпоративный интерфейс</div><div><CheckCircle2 size={17}/> Закрытый доступ для администратора</div></div>
      </section>
      <section className="work-login-card">
        <div className="work-lock"><LockKeyhole size={22}/></div>
        <div className="work-kicker">Предварительная версия</div>
        {access.phase === 'loading'
          ? <><h2>Проверяем доступ</h2><p>Загрузка защищённого рабочего пространства.</p><LoaderCircle className="work-spinner" size={24}/></>
          : access.phase === 'login'
            ? <><h2>Вход в Планировыч Work</h2><p>Используйте логин и пароль существующего аккаунта. Регистрация пока закрыта.</p>
                <form onSubmit={submit} className="work-login-form">
                  <label htmlFor="work-login">Логин</label><input id="work-login" autoComplete="username" value={login} onChange={e=>setLogin(e.target.value)} required disabled={sending} placeholder="Логин Планировыча"/>
                  <label htmlFor="work-password">Пароль</label><input id="work-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={sending} placeholder="Пароль"/>
                  {error && <div className="work-form-error" role="alert">{error}</div>}
                  <button className="work-primary" type="submit" disabled={sending}>{sending ? 'Входим…' : 'Войти в пространство'} <ArrowRight size={17}/></button>
                </form></>
            : <><h2>{access.phase === 'forbidden' ? 'Нет доступа' : access.phase === 'setup' ? 'Доступ ещё не настроен' : 'Сервис недоступен'}</h2>
                <p>{access.phase === 'forbidden' ? 'Этот аккаунт не включён в список администраторов.' : access.phase === 'setup' ? 'Нужно указать BUSINESS_ADMIN_USER_IDS в окружении сервера.' : access.message || 'Не удалось открыть панель.'}</p>
                <div className="work-auth-buttons"><button onClick={()=>{ onAccess({phase:'loading'}); void checkAccess().then(onAccess); }}>Повторить</button><button onClick={onLogout}>Выйти</button></div></>}
        <footer><ShieldCheck size={15}/> Административный доступ проверяется на сервере</footer>
      </section>
    </div>
  </div>;
}
function BusinessAppShell({initialUser}:{initialUser?:CurrentUser}) {
  const [access,setAccess]=useState<Access>(initialUser?{phase:'ready',user:initialUser}:{phase:'loading'});
  const [section,setSection]=useState<Section>('overview');
  const [activeOrganizationId,setActiveOrganizationId]=useState<string|null>(()=>{
    const match=window.location.pathname.match(/^\/organizations\/([^/]+)\/?$/);
    return match?decodeURIComponent(match[1]):null;
  });
  const [companyCardOpen,setCompanyCardOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const [organizations,setOrganizations]=useState<WorkOrganization[]>([]);
  const [organizationName,setOrganizationName]=useState('');
  const [organizationsLoading,setOrganizationsLoading]=useState(true);
  const [organizationSaving,setOrganizationSaving]=useState(false);
  const [organizationError,setOrganizationError]=useState('');
  useEffect(()=>{
    document.documentElement.classList.remove('work-workspace-preload');
    document.title='Планировыч.Work · Рабочее пространство';
    let mounted=true;
    if(!initialUser)void checkAccess().then(result=>{if(mounted)setAccess(result);});
    return()=>{mounted=false;};
  },[]);
  useEffect(()=>{
    const navigate=()=>{
      const match=window.location.pathname.match(/^\/organizations\/([^/]+)\/?$/);
      setActiveOrganizationId(match?decodeURIComponent(match[1]):null);
      setCompanyCardOpen(false);setSection('overview');
    };
    window.addEventListener('popstate',navigate);
    return()=>window.removeEventListener('popstate',navigate);
  },[]);
  useEffect(()=>{
    if(access.phase!=='ready'){setOrganizations([]);return;}
    let live=true;setOrganizationsLoading(true);setOrganizationError('');
    void api.listWorkOrganizations().then(result=>{
      if(!live)return;
      const list=result.organizations;
      setOrganizations(list);
      setActiveOrganizationId(previous=>{
        const active=list.some(org=>org.id===previous)?previous:list[0]?.id||null;
        if(active&&window.location.pathname!==('/organizations/'+encodeURIComponent(active)))
          window.history.replaceState({},'','/organizations/'+encodeURIComponent(active));
        return active;
      });
    }).catch(error=>{if(live)setOrganizationError(error instanceof Error?error.message:'Не удалось загрузить организации');})
      .finally(()=>{if(live)setOrganizationsLoading(false);});
    return()=>{live=false;};
  },[access.phase]);
  function selectOrganization(id:string){
    if(!organizations.some(org=>org.id===id))return;
    window.history.pushState({},'','/organizations/'+encodeURIComponent(id));
    setActiveOrganizationId(id);setCompanyCardOpen(false);
  }
  async function createOrganization(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(organizationSaving||organizationName.trim().length<2)return;
    setOrganizationSaving(true);setOrganizationError('');
    try{
      const {organization}=await api.createWorkOrganization(organizationName);
      setOrganizations(previous=>[...previous,organization]);setOrganizationName('');
      window.history.pushState({},'','/organizations/'+encodeURIComponent(organization.id));
      setActiveOrganizationId(organization.id);
    }catch(error){setOrganizationError(error instanceof Error?error.message:'Не удалось создать организацию');}
    finally{setOrganizationSaving(false);}
  }
  async function logout(){
    setSigningOut(true);
    try{await api.logout();setAccess({phase:'login'});}
    catch{setAccess({phase:'error',message:'Не удалось завершить сеанс'});}
    finally{setSigningOut(false);}
  }
  if(access.phase!=='ready'||!access.user)
    return <AccessPage access={access} onAccess={setAccess} onLogout={()=>{void logout();}}/>;
  const active=sections.find(item=>item.id===section)||sections[0];
  const name=access.user.name||access.user.username||'Пользователь';
  const chosen=organizations.find(org=>org.id===activeOrganizationId);
  return <div className="work-root work-shell">
    <aside className="work-sidebar">
      <Brand/>
      <div className="work-side-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <button type="button" className="work-org work-org-selector" onClick={()=>{setSection('overview');setCompanyCardOpen(false);}}
        title="Выбрать организацию"><BriefcaseBusiness size={20}/><span><strong>{chosen?.name||'Планировыч.Work'}</strong>
        <small>Выбор компании в «Обзоре»</small></span><ChevronRight size={16}/></button>
      <nav aria-label="Разделы Планировыч Work">{sections.map(item=>{
        const Icon=item.icon;
        return <button type="button" key={item.id} className={section===item.id?'work-nav selected':'work-nav'}
          onClick={()=>{setSection(item.id);setCompanyCardOpen(false);}}
          aria-current={section===item.id?'page':undefined}><Icon size={18}/>{item.title}</button>;
      })}</nav>
      <div className="work-side-footer"><span><ShieldCheck size={15}/> Корпоративное пространство</span>
        <a href="https://planirovych.ru/">Личный Планировыч <ArrowRight size={14}/></a></div>
    </aside>
    <div className="work-body">
      <header className="work-topbar"><div>Планировыч.Work <ChevronRight size={14}/><strong>{active.title}</strong></div>
        <div className="work-user"><span>{name.charAt(0).toUpperCase()}</span><strong>{name}</strong>
          <button type="button" onClick={()=>{void logout();}} disabled={signingOut} title="Выйти" aria-label="Выйти"><LogOut size={17}/></button></div>
      </header>
      <main className="work-content">
        {section==='overview'&&organizations.length>0&&<div className="work-org-picker">
          <div><span>АКТИВНАЯ ОРГАНИЗАЦИЯ</span><strong>{chosen?.name||'Выберите компанию'}</strong></div>
          <label htmlFor="work-active-org">Переключить компанию
            <select id="work-active-org" value={activeOrganizationId||''}
              onChange={event=>selectOrganization(event.target.value)}>
              {organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
        </div>}
        {organizationsLoading?<div className="work-company-state" role="status">Загружаем организации…</div>
          :activeOrganizationId&&chosen?
          <WorkCompanyView key={activeOrganizationId} id={activeOrganizationId} section={section}
            showCompanyCard={companyCardOpen} onOpenCompanyCard={()=>setCompanyCardOpen(true)}
            onOpenProjects={()=>{setSection('projects');setCompanyCardOpen(false);}}
            currentUserId={access.user.id} onBack={()=>setCompanyCardOpen(false)}
            onRenamed={updated=>setOrganizations(prev=>prev.map(org=>org.id===updated.id?updated:org))}/>
          :<section className="work-company-panel">
            <h1>Организации</h1>
            <p>{organizations.length?'Не удалось выбрать компанию.':'Создайте первую организацию или получите приглашение от администратора.'}</p>
            <form className="work-org-create" onSubmit={createOrganization}>
              <label htmlFor="work-org-name">Название организации</label>
              <div><input id="work-org-name" maxLength={100} minLength={2} required
                placeholder="Название компании" value={organizationName} onChange={e=>setOrganizationName(e.target.value)}/>
                <button disabled={organizationSaving||organizationName.trim().length<2}>
                  {organizationSaving?'Создаём…':'Создать организацию'} <ArrowRight size={16}/></button></div>
            </form>
            {organizationError&&<p className="work-org-error" role="alert">{organizationError}</p>}
          </section>}
        {organizationError&&chosen&&<p className="work-org-error" role="alert">{organizationError}</p>}
      </main>
    </div>
  </div>;
}

/** Invite links are intentionally reachable before the ordinary Work admin gate. */
export default function BusinessApp({initialUser}:{initialUser?:CurrentUser}) {
  const inviteMatch = window.location.pathname.match(/^\/join\/([a-f0-9]{64})\/?$/);
  return inviteMatch ? <WorkInvitationJoin token={inviteMatch[1]}/> : <BusinessAppShell initialUser={initialUser}/>;
}
