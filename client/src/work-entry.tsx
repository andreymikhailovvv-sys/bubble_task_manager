import React,{useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import './work-entry.css';

const BusinessApp=React.lazy(()=>import('./BusinessApp'));
const WorkInvitationJoin=React.lazy(()=>import('./WorkInvitationJoin'));
type WorkUser={id:string;name?:string|null;username?:string|null};
const routeInvite=/^\/join\/([a-f0-9]{64})\/?$/.exec(window.location.pathname);
async function request(url:string,options?:RequestInit):Promise<{user?:WorkUser;error?:string}>{
  const response=await fetch(url,{credentials:'include',cache:'no-store',...options});
  const data=await response.json().catch(()=>({})) as {user?:WorkUser;error?:string};
  if(!response.ok)throw new Error(data.error||('HTTP '+response.status));
  return data;
}
function WorkEntry(){
  const [user,setUser]=useState<WorkUser|null>(null);
  const [login,setLogin]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [fatal,setFatal]=useState(false);
  // The public login form paints immediately. The corporate chunk is not
  // imported or requested until the existing session is confirmed.
  useEffect(()=>{
    if(routeInvite)return;
    let live=true;
    void request('/api/business/bootstrap').then(response=>{
      if(!live||!response.user)return;
      document.documentElement.classList.add('work-workspace-preload');
      setUser(response.user);
    }).catch(()=>{});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    if(!user)return;
    const timer=window.setTimeout(()=>{
      if(document.documentElement.classList.contains('work-workspace-preload')){
        document.documentElement.classList.remove('work-workspace-preload');
        setFatal(true);
      }
    },25000);
    return()=>window.clearTimeout(timer);
  },[user]);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');
    document.documentElement.classList.add('work-workspace-preload');
    try{
      await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({login:login.trim(),password})});
      const response=await request('/api/business/bootstrap');
      if(!response.user)throw new Error('Не удалось подтвердить доступ к корпоративному пространству');
      setPassword('');
      setUser(response.user);
    }catch(e){
      document.documentElement.classList.remove('work-workspace-preload');
      setError(e instanceof Error?e.message:'Ошибка авторизации');
    }finally{setBusy(false);}
  };
  if(routeInvite)return <React.Suspense fallback={<div className="work-entry" role="status" style={{padding:30}}>Открываем приглашение…</div>}><WorkInvitationJoin token={routeInvite[1]}/></React.Suspense>;
  if(fatal)return <main className="work-entry" style={{alignItems:'center',justifyContent:'center',padding:24}}>
    <h1>Не удалось загрузить корпоративный кабинет</h1>
    <p>Попробуйте обновить страницу.</p>
    <button className="work-entry-submit" onClick={()=>location.reload()}>Обновить страницу</button>
  </main>;
  if(user)return <React.Suspense fallback={null}><BusinessApp initialUser={user}/></React.Suspense>;
  return <main className="work-entry">
    <header><div className="work-entry-brand"><div className="work-entry-mark">W</div><div><strong>Планировыч.<span>Work</span></strong><small>Корпоративное пространство</small></div></div></header>
    <div className="work-entry-layout">
      <section className="work-entry-intro"><div className="kicker">ЕДИНОЕ ПРОСТРАНСТВО ДЛЯ БИЗНЕСА</div>
        <h1>Управлять компанией.<br/><span>Работать с умом.</span></h1>
        <p>Единое пространство для проектов, сотрудников, поручений и искусственного интеллекта.</p>
        <div className="work-entry-points"><span><b>✓</b> Отдельные данные каждой компании</span><span><b>✓</b> Управление командой и ролями</span><span><b>✓</b> Общий аккаунт с личным Планировычем</span></div>
      </section>
      <section className="work-entry-panel"><div className="work-entry-lock">◈</div><div className="work-entry-tag">КОРПОРАТИВНЫЙ ДОСТУП</div>
        <h2>Вход в Планировыч.Work</h2><p>Используйте логин и пароль своего аккаунта Планировыча.</p>
        <form onSubmit={submit} className="work-entry-form"><label htmlFor="work-entry-login">Логин</label>
          <input id="work-entry-login" autoComplete="username" required value={login} onChange={e=>setLogin(e.target.value)} placeholder="Логин Планировыча" disabled={busy}/>
          <label htmlFor="work-entry-password">Пароль</label>
          <input id="work-entry-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль" disabled={busy}/>
          <button type="submit" className="work-entry-submit" disabled={busy}>{busy?'Входим…':'Войти в пространство'} <span aria-hidden="true">→</span></button>
        </form>
        {error&&<p className="work-entry-error" role="alert">{error}</p>}
        <footer>◇ Доступ определяется правами компании на сервере</footer>
      </section>
    </div>
  </main>;
}
class EntryErrorBoundary extends React.Component<React.PropsWithChildren,{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed){
      document.documentElement.classList.remove('work-workspace-preload');
      return <div className="work-entry" style={{padding:35}}><h1>Ошибка загрузки кабинета</h1><p>Обновите страницу и повторите вход.</p><button className="work-entry-submit" onClick={()=>location.reload()}>Обновить</button></div>;
    }
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<EntryErrorBoundary><WorkEntry/></EntryErrorBoundary>);
