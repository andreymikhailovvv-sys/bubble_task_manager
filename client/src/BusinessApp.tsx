import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, BriefcaseBusiness, CheckCircle2, ChevronRight, FolderKanban, LayoutDashboard, Layers3, LoaderCircle, LockKeyhole, LogOut, Settings2, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { api, type CurrentUser } from './lib/api';
import './BusinessApp.css';

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
export default function BusinessApp() {
  const [access, setAccess] = useState<Access>({ phase: 'loading' });
  const [section, setSection] = useState<Section>('overview');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    // React has committed the actual Work page (including its login/checking state).
    // Only now dismiss the host-specific HTML splash, even before bootstrap responds.
    document.documentElement.classList.remove('work-workspace-preload');
    document.title = 'Планировыч Work · Корпоративная платформа';
    let mounted = true;
    void checkAccess().then(result => { if (mounted) setAccess(result); });
    return () => { mounted = false; };
  }, []);
  async function logout() {
    setSigningOut(true);
    try { await api.logout(); setAccess({phase:'login'}); }
    catch { setAccess({phase:'error', message:'Не удалось завершить сеанс.'}); }
    finally { setSigningOut(false); }
  }
  if (access.phase !== 'ready' || !access.user) return <AccessPage access={access} onAccess={setAccess} onLogout={()=>{ void logout(); }}/>;
  const active = sections.find(item=>item.id===section) || sections[0];
  const name = access.user.name || access.user.username || 'Администратор';
  const ActiveIcon = active.icon;
  return <div className="work-root work-shell">
    <aside className="work-sidebar">
      <Brand/>
      <div className="work-side-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <div className="work-org"><BriefcaseBusiness size={20}/><span><strong>Планировыч Work</strong><small>Администратор платформы</small></span><ChevronRight size={16}/></div>
      <nav aria-label="Разделы Планировыч Work">{sections.map(item=>{const Icon=item.icon;return <button type="button" key={item.id} className={section===item.id?'work-nav selected':'work-nav'} onClick={()=>setSection(item.id)} aria-current={section===item.id?'page':undefined}><Icon size={18}/>{item.title}</button>;})}</nav>
      <div className="work-side-footer"><span><ShieldCheck size={15}/> Закрытая версия</span><a href="https://planirovych.ru/">Личный Планировыч <ArrowRight size={14}/></a></div>
    </aside>
    <div className="work-body">
      <header className="work-topbar"><div>Планировыч Work <ChevronRight size={14}/><strong>{active.title}</strong></div><div className="work-user"><span>{name.charAt(0).toUpperCase()}</span><strong>{name}</strong><button type="button" onClick={()=>{void logout();}} disabled={signingOut} title="Выйти" aria-label="Выйти"><LogOut size={17}/></button></div></header>
      <main className="work-content">
        <div className="work-kicker">КОРПОРАТИВНОЕ ПРОСТРАНСТВО</div><h1>{section==='overview'?'Рабочая панель':active.title}</h1><p className="work-lead">{section==='overview'?'Новая основа Планировыча для командной работы и управления бизнесом.':active.summary}</p>
        {section==='overview' ? <>
          <section className="work-hero">
            <div className="work-hero-copy"><div className="work-kicker"><Sparkles size={15}/> ПЛАНИРОВЫЧ WORK</div><h2>Бизнес-процессы.<br/><span>Под контролем.</span></h2><p>Сначала надёжная архитектура, затем команды, проекты, гибкая конфигурация и интеллектуальный диспетчер.</p><div className="work-status"><i/> Корпоративная версия в разработке</div></div>
            <div className="work-orbit" aria-hidden="true"><div className="work-ring ring-outer"/><div className="work-ring ring-inner"/><div className="work-core"><Layers3 size={35}/></div></div>
          </section>
          <div className="work-section-label">НАПРАВЛЕНИЯ РАЗРАБОТКИ</div>
          <div className="work-cards">
            <article><div className="work-card-icon purple"><FolderKanban size={22}/></div><h3>Проекты и задачи</h3><p>Поручения, сроки, совместная работа и приёмка результатов.</p><small>Запланировано</small></article>
            <article><div className="work-card-icon teal"><UsersRound size={22}/></div><h3>Команда</h3><p>Сотрудники, отделы, рабочие пространства и права доступа.</p><small>Запланировано</small></article>
            <article><div className="work-card-icon orange"><Bot size={22}/></div><h3>ИИ-диспетчер</h3><p>Контроль процессов, аналитика и действия с подтверждением.</p><small>Запланировано</small></article>
          </div>
          <div className="work-bottom-note"><CheckCircle2 size={19}/><div><strong>Точка старта готова</strong><span>Следующим этапом станут организации, роли и корпоративная модель данных.</span></div><b>Этап 1</b></div>
        </> : <section className="work-placeholder"><div><ActiveIcon size={30}/></div><h2>Раздел в разработке</h2><p>Навигация подготовлена. Данные и действия этого модуля пока не подключены.</p><span><ShieldCheck size={16}/> Без имитации рабочих функций</span></section>}
      </main>
    </div>
  </div>;
}
