import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mail } from 'lucide-react';
import { api, type MailAiSuggestedReply } from '../lib/api';
import './TelegramInlineSendCard.css';

/** One owner-approved SMTP send. Server persists UNKNOWN instead of risking duplicates. */
export function MailAiReplySuggestionCard({ reply }: { reply: MailAiSuggestedReply }) {
  const [text, setText] = useState(reply.text);
  const [status, setStatus] = useState(reply.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useEffect(() => { setText(reply.text); setStatus(reply.status); setError(''); }, [reply.eventId,reply.status,reply.text]);
  const blocked = busy || ['SENDING','SENT','UNKNOWN','AUTO_PENDING'].includes(status);
  const submit = async () => {
    if (blocked || inFlight.current || !text.trim() || text.length > 6000) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await api.mailAssistantSendReply(reply.eventId,text);
      setStatus(response.status);
      if (!response.ok) setError('Отправка не подтверждена. Проверьте папку «Отправленные».');
    } catch (cause) {
      try {
        const feed = await api.mailAssistantInbox();
        const current = feed.messages.find(x => x.id === reply.eventId)?.mailSuggestedReply;
        setStatus(current?.status ?? 'UNKNOWN');
      } catch { setStatus('UNKNOWN'); }
      setError(cause instanceof Error ? cause.message : 'Результат отправки неизвестен');
    } finally { setBusy(false); inFlight.current = false; }
  };
  return <div className="telegram-quick-share telegram-ai-send-card mt-3 rounded-2xl border p-3 text-sm">
    <div className="flex items-center gap-2">
      <span className="telegram-ai-send-card__logo flex h-8 w-8 items-center justify-center rounded-xl"><Mail size={16}/></span>
      <strong className="min-w-0 flex-1">Предложение ответа на письмо</strong>
      {status === 'SENT' && <Check size={16} className="text-emerald-500"/>}
    </div>
    <p className="telegram-ai-send-card__muted mt-2 text-xs">Получатель: {reply.recipient}</p>
    <p className="telegram-ai-send-card__muted mt-1 text-xs">Тема: {reply.subject}</p>
    <label className="mt-3 block text-xs font-semibold" htmlFor={'mail-reply-'+reply.eventId}>Текст ответа (можно изменить)</label>
    <textarea id={'mail-reply-'+reply.eventId} rows={4} maxLength={6000} value={text}
      onChange={e=>setText(e.target.value)} disabled={blocked}
      className="telegram-ai-send-card__message mt-1 w-full resize-y rounded-xl border p-3 text-sm leading-relaxed disabled:opacity-70"/>
    {status === 'SENT' && <p className="telegram-ai-send-card__muted mt-2 text-xs">Отправлено по почте</p>}
    {status === 'UNKNOWN' && <p role="status" className="telegram-ai-send-card__error mt-2 text-xs">
      Не удалось установить результат отправки. Повтор заблокирован, чтобы не отправить письмо дважды.</p>}
    {error && <p role="alert" className="telegram-ai-send-card__error mt-2 text-xs">{error}</p>}
    <button type="button" disabled={blocked || !text.trim()} onClick={()=>void submit()}
      className="telegram-ai-send-card__send mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50">
      {busy ? <Loader2 className="animate-spin" size={16}/> : <Mail size={16}/>}
      {status === 'SENT' ? 'Отправлено' : status === 'UNKNOWN' ? 'Проверить почту' : 'Отправить письмо'}
    </button>
  </div>;
}
