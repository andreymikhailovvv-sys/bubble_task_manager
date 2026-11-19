import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, ShieldCheck, Sparkles, X } from 'lucide-react';
import { generalGroups, taskGroups } from './components/AiChatWelcome';

const TelegramSettings=lazy(()=>import('./components/TelegramAiAssistantSettings')
  .then(module=>({default:module.TelegramAiAssistantSettings})));
const MailSettings=lazy(()=>import('./components/MailAssistantSettings')
  .then(module=>({default:module.MailAssistantSettings})));

type Props = {
  kind:'task'|'general';
  theme:'light'|'dark';
  onClose:()=>void;
  onOpenCheckups?:()=>void;
};
export function TestPageCapabilities({kind,theme,onClose,onOpenCheckups}:Props) {
  const titleId=useId();
  const [integration,setIntegration]=useState<'telegram'|'mail'|null>(null);
  const groups=kind==='task'?taskGroups:generalGroups;
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.stopPropagation();onClose();}
    };
    document.addEventListener('keydown',escape,true);
    return()=>document.removeEventListener('keydown',escape,true);
  },[onClose]);
  const open=(action:'telegram'|'mail'|'checkups')=>{
    onClose();
    if(action==='checkups')onOpenCheckups?.();
    else setIntegration(action);
  };
  return <>
    {createPortal(<div className={'tp-root tp-capabilities-overlay '+(theme==='light'?'tp-light':'tp-dark')}
      data-theme={theme} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section className="tp-capabilities-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><span className="tp-capabilities-header-icon"><Sparkles size={24}/></span>
          <div><span className="tp-eyebrow">ВОЗМОЖНОСТИ ПЛАНИРОВЫЧА</span>
            <h2 id={titleId}>{kind==='task'?'Что умеет ИИ в чате задачи':'Что умеет ИИ в общем чате'}</h2>
            <p>Выберите направление или просто опишите свой запрос в чате.</p></div>
          <button type="button" aria-label="Закрыть" onClick={onClose}><X size={20}/></button></header>
        <div className="tp-capabilities-content">
          {groups.map(group=><section className="tp-capabilities-group" key={group.label}>
            <h3>{group.label}</h3>
            <div className="tp-capabilities-grid">{group.items.map(item=>{
              const Icon=item.icon;
              return <article className="tp-capability" key={item.title}>
                <span className="tp-capability-icon"><Icon size={20}/></span>
                <div><strong>{item.title}</strong><p>{item.description}</p>
                  {item.action&&(item.action!=='checkups'||onOpenCheckups)&&
                    <button type="button" onClick={()=>open(item.action!)}>{item.action==='checkups'?'Настроить чекапы':'Настроить интеграцию'}<ArrowUpRight size={14}/></button>}
                </div>
              </article>;
            })}</div>
          </section>)}
          <footer><ShieldCheck size={17}/><span>Доступность функций зависит от подключений, тарифных ограничений и разрешений пользователя. Для некоторых действий требуется подтверждение.</span></footer>
        </div>
      </section>
    </div>,document.body)}
    {integration&&<Suspense fallback={<div className="tp-capabilities-loading">Загрузка настроек…</div>}>
      {integration==='telegram'?<TelegramSettings onClose={()=>setIntegration(null)}/>:<MailSettings onClose={()=>setIntegration(null)}/>}
    </Suspense>}
  </>;
}
