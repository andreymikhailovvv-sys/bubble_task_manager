import { useState } from 'react';
import { Link2, Loader2, Send, X } from 'lucide-react';
import { TelegramIntegrationsMenu } from './components/TelegramIntegrationsMenu';
import { api } from './lib/api';

export function TestPageIntegrationsDialog({onClose}:{onClose:()=>void}) {
  const [botOpen,setBotOpen]=useState(false);
  const [botUrl,setBotUrl]=useState<string|null>(null);
  const [expiresIn,setExpiresIn]=useState<number|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const openBot=async()=>{
    setBotOpen(true);setLoading(true);setError('');
    try{
      const result=await api.createTelegramLinkToken();
      setBotUrl(result.deepLinkUrl);
      setExpiresIn(result.expiresInSeconds);
    }catch(cause){
      setBotUrl(null);
      setError(cause instanceof Error?cause.message:'Не удалось получить ссылку подключения.');
    }finally{setLoading(false);}
  };
  return <div className="tp-overlay tp-integrations-overlay" onMouseDown={event=>{
    if(event.target===event.currentTarget)onClose();
  }}>
    <section className="tp-dialog tp-integrations-dialog" role="dialog" aria-modal="true" aria-label="Интеграции">
      <header><div><span className="tp-eyebrow">ПОДКЛЮЧЕНИЯ</span><h2>Интеграции</h2></div>
        <button type="button" aria-label="Закрыть" onClick={onClose}><X size={19}/></button></header>
      <div className="tp-integrations-content">
        <TelegramIntegrationsMenu embedded onConnectBot={()=>void openBot()}/>
      </div>
    </section>
    {botOpen&&<div className="tp-overlay tp-bot-link-overlay" onMouseDown={event=>{
      if(event.target===event.currentTarget)setBotOpen(false);
    }}>
      <section className="tp-dialog tp-bot-link-dialog" role="dialog" aria-modal="true" aria-label="Подключение Telegram-бота">
        <header><div><span className="tp-eyebrow">TELEGRAM</span><h2>Подключить Telegram-бота</h2></div>
          <button type="button" onClick={()=>setBotOpen(false)} aria-label="Закрыть"><X size={18}/></button></header>
        <div className="tp-dialog-content">
          <p>Перейдите по персональной ссылке и запустите бота в Telegram, чтобы привязать аккаунт.</p>
          {loading&&<p className="tp-integrations-link-status"><Loader2 size={16} className="tp-spin"/> Получаем ссылку…</p>}
          {error&&<p className="tp-alert" role="alert">{error}</p>}
          {botUrl&&<a className="tp-primary tp-bot-link" href={botUrl} target="_blank" rel="noopener noreferrer"><Send size={16}/> Открыть Telegram</a>}
          {expiresIn&&botUrl&&<p>Срок действия ссылки: {Math.max(1,Math.ceil(expiresIn/60))} мин.</p>}
          {!loading&&<button type="button" className="tp-secondary" onClick={()=>void openBot()}><Link2 size={15}/> Новая ссылка</button>}
        </div>
      </section>
    </div>}
  </div>;
}
