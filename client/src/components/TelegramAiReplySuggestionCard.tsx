import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import { api, type TelegramAiSuggestedReply } from '../lib/api';
import './TelegramInlineSendCard.css';

/** A durable proposal, never an autonomous send. The target is server-bound. */
export function TelegramAiReplySuggestionCard({ reply }: { reply: TelegramAiSuggestedReply }) {
  const [text, setText] = useState(reply.text);
  const [sending, setSending] = useState(false);
  const [localStatus, setLocalStatus] = useState<TelegramAiSuggestedReply['status'] | null>(null);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    setText(reply.text);
    setError('');
    setLocalStatus(null);
    pending.current = false;
  }, [reply.eventId]);
  const status = reply.status === 'SENT' || reply.status === 'UNKNOWN'
    ? reply.status : localStatus ?? reply.status;
  const submit = async () => {
    if (pending.current || !text.trim() || text.length > 1000 || status === 'SENT' || status === 'UNKNOWN') return;
    pending.current = true;
    setSending(true);
    setError('');
    try {
      const result = await api.telegramAssistantSendSuggestedReply(reply.eventId, text);
      setLocalStatus(result.status);
    } catch (cause) {
      // The outcome might be unknown after a timeout; server state is
      // authoritative, so refresh the event before allowing a repeat click.
      try {
        const feed = await api.telegramAssistantInbox();
        const latest = feed.messages.find(message => message.id === reply.eventId)?.telegramSuggestedReply;
        if (latest) setLocalStatus(latest.status);
        else setLocalStatus('UNKNOWN');
      } catch { setLocalStatus('UNKNOWN'); }
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить ответ');
    } finally {
      pending.current = false;
      setSending(false);
    }
  };
  const blocked = sending || status === 'SENDING' || status === 'UNKNOWN' || status === 'SENT';
  return (
    <div className="telegram-quick-share telegram-ai-send-card mt-3 rounded-2xl border p-3 text-sm" data-telegram-reply-suggestion="true">
      <div className="flex items-center gap-2">
        <span className="telegram-ai-send-card__logo flex h-8 w-8 items-center justify-center rounded-xl"><Send size={16}/></span>
        <strong className="min-w-0 flex-1">Предложение ответа в Telegram</strong>
        {status === 'SENT' && <Check size={17} className="text-emerald-500"/>}
      </div>
      <p className="telegram-ai-send-card__muted mt-2 truncate text-xs">Переписка: {reply.chatTitle}</p>
      <label className="mt-3 block text-xs font-semibold" htmlFor={'telegram-suggestion-' + reply.eventId}>Текст ответа (можно изменить)</label>
      <textarea id={'telegram-suggestion-' + reply.eventId} rows={4} maxLength={1000}
        value={text} onChange={event => setText(event.target.value)}
        disabled={blocked}
        className="telegram-ai-send-card__message mt-1 w-full resize-y rounded-xl border p-3 text-sm leading-relaxed disabled:opacity-70"/>
      {status === 'SENT' && <p role="status" className="telegram-ai-send-card__muted mt-2 text-xs">Отправлено в Telegram</p>}
      {status === 'UNKNOWN' && <p role="status" className="telegram-ai-send-card__error mt-2 text-xs">Результат отправки неизвестен. Проверьте переписку в Telegram. Повторная отправка заблокирована.</p>}
      {error && <p role="alert" className="telegram-ai-send-card__error mt-2 text-xs">{error}</p>}
      <button type="button" disabled={blocked || !text.trim()} onClick={() => void submit()}
        className="telegram-ai-send-card__send mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {sending || status === 'SENDING' ? <Loader2 className="animate-spin" size={15}/> : <Send size={15}/>}
        {status === 'SENT' ? 'Отправлено' : status === 'UNKNOWN' ? 'Проверить Telegram' : status === 'SENDING' ? 'Отправляется…' : 'Отправить'}
      </button>
    </div>
  );
}
