import {useCallback,useEffect,useRef,useState} from 'react';
import {Bell,Check,MessageCircle,X} from 'lucide-react';
import {api,type WorkNotification} from '../lib/api';

export function WorkNotificationBell({organizationId}:{organizationId:string}){
  const [notifications,setNotifications]=useState<WorkNotification[]>([]);
  const [unread,setUnread]=useState(0);
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const [toast,setToast]=useState<WorkNotification|null>(null);
  const known=useRef<Set<string>|null>(null);
  const load=useCallback(async()=>{
    const result=await api.workNotifications(organizationId);
    const seen=known.current;
    if(seen){
      const newItem=result.notifications.find(n=>!n.readAt&&!seen.has(n.id));
      if(newItem)setToast(newItem);
    }
    known.current=new Set(result.notifications.map(n=>n.id));
    setNotifications(result.notifications);setUnread(result.unreadCount);
  },[organizationId]);
  useEffect(()=>{
    known.current=null;setNotifications([]);setUnread(0);setOpen(false);
    void load().catch(()=>{});
    const interval=window.setInterval(()=>{void load().catch(()=>{});},15000);
    const listener=()=>{void load().catch(()=>{});};
    window.addEventListener('work-notifications-updated',listener);
    return()=>{window.clearInterval(interval);window.removeEventListener('work-notifications-updated',listener);};
  },[load]);
  const read=async(item:WorkNotification)=>{
    setError('');
    if(!item.readAt){
      try{
        await api.workReadNotification(organizationId,item.id);
        await load();
      }catch(e){setError(e instanceof Error?e.message:'Не удалось отметить прочитанным');}
    }
  };
  return <div className="work-notification-control relative">
    <button type="button" className="work-notification-trigger" aria-label={unread?'Уведомления: '+unread+' непрочитанных':'Уведомления'}
      aria-expanded={open} title="Корпоративные уведомления" onClick={()=>setOpen(v=>!v)}>
      <Bell size={17}/>{unread>0&&<span className="work-notification-count">{unread>99?'99+':unread}</span>}
    </button>
    {open&&<div className="work-notification-feed" role="region" aria-label="Корпоративные уведомления">
      <div className="work-notification-feed-title">
        <strong>Уведомления</strong><button type="button" title="Закрыть" onClick={()=>setOpen(false)}><X size={15}/></button>
      </div>
      {error&&<p role="alert" className="text-xs text-rose-400">{error}</p>}
      {!notifications.length&&<p className="text-xs text-muted p-3">Уведомлений пока нет</p>}
      <div className="work-notification-feed-items">
        {notifications.map(item=><button type="button" key={item.id} className={'work-notification-item '+(!item.readAt?'unread':'')}
          onClick={()=>{void read(item);}}>
          <MessageCircle size={15} className="shrink-0"/>
          <span className="flex-1 text-left"><span className="block break-words">{item.content}</span>
            <small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small></span>
          {!item.readAt&&<Check size={14} className="shrink-0" aria-label="Отметить прочитанным"/>}
        </button>)}
      </div>
    </div>}
    {toast&&<div className="work-notification-toast" role="status">
      <div className="flex items-center justify-between gap-2"><strong>СИСТЕМНОЕ УВЕДОМЛЕНИЕ</strong>
        <button type="button" onClick={()=>setToast(null)} aria-label="Закрыть уведомление"><X size={13}/></button></div>
      <button type="button" className="text-left" onClick={()=>{setOpen(true);void read(toast);setToast(null);}}>
        <span>{toast.content}</span></button>
    </div>}
  </div>;
}
