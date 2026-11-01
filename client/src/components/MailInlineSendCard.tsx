import {useEffect,useRef,useState} from 'react';
import {Check,Loader2,Mail,Send,Search,Sparkles} from 'lucide-react';
import {api,type MailAccount,type MailSendDraft} from '../lib/api';
import './TelegramInlineSendCard.css';

export function MailInlineSendCard({draft}:{draft:MailSendDraft}){
  const [accounts,setAccounts]=useState<MailAccount[]>([]);
  const [recipients,setRecipients]=useState<string[]>([]);
  const [mailboxId,setMailboxId]=useState(draft.mailboxId);
  const [recipient,setRecipient]=useState(draft.recipient);
  const [subject,setSubject]=useState(draft.subject);
  const [body,setBody]=useState(draft.text);
  const [instruction,setInstruction]=useState('');
  const [showRewrite,setShowRewrite]=useState(false);
  const [status,setStatus]=useState('PENDING');
  const [busy,setBusy]=useState(false);
  const [rewriting,setRewriting]=useState(false);
  const [error,setError]=useState('');
  const [rewriteCost,setRewriteCost]=useState(0);
  const pending=useRef(false);
  useEffect(()=>{
    let live=true;
    void api.mailRecentRecipients().then(x=>{if(live)setRecipients(x.addresses)}).catch(()=>{});
    void Promise.all([
      api.mailAccounts(),
      api.mailDraftStatus(draft.id)
    ]).then(([list,remote])=>{
      if (!live)return;
      setAccounts(list.accounts);
      setStatus(remote.draft.status);
      if(remote.draft.status!=='PENDING'){
        setMailboxId(remote.draft.mailboxId);
        setRecipient(remote.draft.recipient);
        setSubject(remote.draft.subject);
        setBody(remote.draft.text);
      }
    }).catch(()=>{});
    return ()=>{live=false;};
  },[draft.id]);
  const locked=(status!=='PENDING'&&status!=='FAILED')||busy||rewriting;
  const rewrite=async()=>{
    if(locked||!body.trim()||!instruction.trim())return;
    setRewriting(true);setError('');
    try{
      const result=await api.mailRewriteText(body,instruction);
      setBody(result.text);setRewriteCost(c=>c+result.creditsSpentMilli);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить письмо с ИИ')}
    finally{setRewriting(false)}
  };
  const send=async()=>{
    if(locked||pending.current||!mailboxId||!recipient.trim()||!body.trim())return;
    pending.current=true;setBusy(true);setError('');
    try {
      const result=await api.mailSendDraft(draft.id,{mailboxId,recipient,subject,text:body});
      setStatus(result.status);
      if(!result.ok)setError(result.message||'Отправка не подтверждена');
    } catch(e) {
      try{
        const result=await api.mailDraftStatus(draft.id);
        setStatus(result.draft.status);
        if(result.draft.status==='PENDING')setError(e instanceof Error?e.message:'Ошибка отправки');
        else if(result.draft.status!=='SENT')setError('Результат отправки не подтверждён. Проверьте «Отправленные».');
      }catch {
        setStatus('UNKNOWN');
        setError('Нет подтверждения от сервера. Проверьте почту перед повторной отправкой.');
      }
    }finally{pending.current=false;setBusy(false)}
  };
  return <div className="telegram-quick-share telegram-ai-send-card mt-3 rounded-2xl border p-3 text-sm" data-mail-send-card="true">
    <div className="flex items-center gap-2">
      <span className="telegram-ai-send-card__logo flex h-8 w-8 items-center justify-center rounded-xl"><Mail size={16}/></span>
      <strong className="flex-1">Новое письмо</strong>
      {status==='SENT'&&<Check size={18} className="text-emerald-500"/>}
    </div>
    <label className="mt-3 block text-xs font-semibold">От кого
      <select value={mailboxId} onChange={e=>setMailboxId(e.target.value)} disabled={locked}
        className="telegram-ai-send-card__recipient mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
        {!accounts.length&&<option value={mailboxId}>{draft.sender}</option>}
        {accounts.map(x=><option key={x.id} value={x.id}>{x.email}</option>)}
      </select>
    </label>
    <label className="mt-3 block text-xs font-semibold">Кому
      <input type="email" multiple list={"mail-recipient-options-"+draft.id} value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={locked}
        placeholder="recipient@example.com, second@example.com" className="telegram-ai-send-card__recipient mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" />
      <datalist id={'mail-recipient-options-'+draft.id}>{recipients.map(x=><option key={x} value={x}/>)}</datalist>
    </label>
    <label className="mt-3 block text-xs font-semibold">Тема
      <input value={subject} maxLength={200} onChange={e=>setSubject(e.target.value)} disabled={locked}
        placeholder="Тема письма" className="telegram-ai-send-card__recipient mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"/>
    </label>
    <label className="mt-3 block text-xs font-semibold">Текст письма
      <textarea rows={5} maxLength={6000} value={body} onChange={e=>setBody(e.target.value)} disabled={locked}
        className="telegram-ai-send-card__message mt-1 w-full resize-y rounded-xl border p-3 text-sm leading-relaxed"/>
    </label>
    <button type="button" disabled={locked} onClick={()=>setShowRewrite(x=>!x)}
      className="telegram-integrations-modal__secondary mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold">
      <Sparkles size={14}/> Изменить с ИИ
    </button>
    {showRewrite&&<div className="mt-2 flex flex-col gap-2">
      <textarea rows={2} value={instruction} onChange={e=>setInstruction(e.target.value)} disabled={locked}
        placeholder="Например: сделай короче и официальнее"
        className="telegram-ai-send-card__message w-full resize-y rounded-xl border p-3 text-sm"/>
      <button type="button" disabled={locked||!instruction.trim()} onClick={()=>void rewrite()}
        className="telegram-ai-send-card__send rounded-xl px-4 py-2 text-xs font-semibold">
        {rewriting?'Редактирование…':'Применить'}
      </button>
    </div>}
    {rewriteCost>0&&<p className="telegram-ai-send-card__muted mt-2 text-xs">Редактирование с ИИ: {(rewriteCost/1000).toLocaleString('ru-RU',{maximumFractionDigits:3})} кредитов.</p>}
    {error&&<p role="alert" className="telegram-ai-send-card__error mt-2 text-xs">{error}</p>}
    {status==='SENT'&&<p role="status" className="telegram-ai-send-card__muted mt-2 text-xs">Письмо отправлено.</p>}
    {status==='UNKNOWN'&&<p role="status" className="telegram-ai-send-card__error mt-2 text-xs">Нет подтверждения приёма письма SMTP. Повтор заблокирован, чтобы не отправить дубликат.</p>}
    <button type="button" disabled={locked||!mailboxId||!recipient.trim()||!body.trim()} onClick={()=>void send()}
      className="telegram-ai-send-card__send mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50">
      {busy?<Loader2 size={15} className="animate-spin"/>:<Send size={15}/>}
      {status==='SENT'?'Отправлено':status==='FAILED'?'Повторить отправку':status==='PENDING'?'Отправить письмо':'Отправка недоступна'}
    </button>
    <p className="telegram-ai-send-card__muted mt-2 text-xs">Письмо уйдёт только после нажатия кнопки. Проверьте адресата перед отправкой.</p>
  </div>;
}
