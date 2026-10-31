import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, type WorkInvitePreview, type WorkRole } from './lib/api';
import './BusinessApp.css';

const roleLabels: Record<WorkRole,string> = { OWNER:'Владелец', ADMIN:'Администратор', MANAGER:'Руководитель', MEMBER:'Сотрудник', VIEWER:'Наблюдатель' };
export default function WorkInvitationJoin({ token }: { token:string }) {
  const [invite,setInvite] = useState<WorkInvitePreview|null>(null);
  const [loading,setLoading] = useState(true);
  const [authenticated,setAuthenticated] = useState(false);
  const [login,setLogin] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    document.documentElement.classList.remove('work-workspace-preload');
    document.title = 'Приглашение в Планировыч.Бизнес';
    let active = true;
    void Promise.allSettled([api.previewWorkInvitation(token), api.getMe()]).then(results => {
      if (!active) return;
      if (results[0].status === 'fulfilled') setInvite(results[0].value.invitation);
      else setError(results[0].reason instanceof Error ? results[0].reason.message : 'Недействительное приглашение');
      setAuthenticated(results[1].status === 'fulfilled');
      setLoading(false);
    });
    return () => { active = false; };
  },[token]);
  const accept = async () => {
    const { organizationId } = await api.acceptWorkInvitation(token);
    // Force bootstrap to re-read the freshly created membership.
    window.location.assign('/organizations/'+encodeURIComponent(organizationId));
  };
  const signInAndAccept = async(event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');
    try { await api.login({ login:login.trim(), password }); setPassword(''); await accept(); }
    catch(cause) {setError(cause instanceof Error?cause.message:'Не удалось войти');setBusy(false);}
  };
  return <div className="work-root work-auth work-join">
    <div className="work-join-card">
      <div className="work-lock"><BriefcaseBusiness size={22}/></div><div className="work-kicker"><ShieldCheck size={15}/> ПЛАНИРОВЫЧ.БИЗНЕС</div>
      <h1>Приглашение в компанию</h1>
      {loading?<p>Проверяем приглашение…</p>:invite?<><h2>{invite.name}</h2><p>Вас приглашают присоединиться к корпоративному пространству на роль «{roleLabels[invite.role]}». Приглашение действует до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}.</p>
        {authenticated ? <button type="button" className="work-primary" disabled={busy} onClick={()=>{setBusy(true);setError('');void accept().catch(cause=>{setBusy(false);setError(cause instanceof Error?cause.message:'Не удалось принять приглашение');});}}>{busy?'Присоединяем…':'Присоединиться'} <ArrowRight size={17}/></button>
          : <><p className="work-join-notice">Для входа нужен существующий зарегистрированный аккаунт Планировыча. Регистрация здесь пока недоступна.</p>
            <form className="work-login-form" onSubmit={signInAndAccept}><label htmlFor="work-join-login">Логин</label><input id="work-join-login" autoComplete="username" value={login} onChange={e=>setLogin(e.target.value)} required/>
              <label htmlFor="work-join-password">Пароль</label><input id="work-join-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
              <button className="work-primary" type="submit" disabled={busy}><LockKeyhole size={16}/>{busy?'Входим…':'Войти и присоединиться'}</button>
            </form></>}
      </>:<p>Проверьте ссылку у администратора компании. Возможно, она уже использована или истекла.</p>}
      {error && <p role="alert" className="work-company-error">{error}</p>}
      <a href="/" className="work-join-home">На главную Планировыч.Бизнес <ArrowRight size={14}/></a>
    </div>
  </div>;
}
