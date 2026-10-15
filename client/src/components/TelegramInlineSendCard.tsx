import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, Send, X } from 'lucide-react';
import { api, type TelegramSendTarget, type TelegramQuickSendJob } from '../lib/api';
import type { TelegramInlineSendDraft } from '../lib/types';
import './TelegramMessageQuickShare.css';
import './TelegramInlineSendCard.css';

type Props = { draft: TelegramInlineSendDraft };

/** Always a client-side *proposal*. No message is sent without pressing Send. */
export function TelegramInlineSendCard({ draft }: Props) {
  const [recipientId, setRecipientId] = useState<string | null>(draft.recipientId);
  const [recipientName, setRecipientName] = useState(draft.recipientName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recipients, setRecipients] = useState<TelegramSendTarget[]>([]);
  const [search, setSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<TelegramQuickSendJob | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => {
    let active = true;
    // A queued job can be rediscovered after reload; the same server-generated
    // UUID is reused for all clicks and subsequent requests.
    void api.telegramQuickSendStatus(draft.requestId).then((result) => {
      if (active) setJob(result);
    }).catch(() => { /* 404 = no job yet */ });
    return () => { active = false; };
  }, [draft.requestId]);
  useEffect(() => {
    if (job?.state !== 'QUEUED' && job?.state !== 'PROCESSING') return;
    let active = true;
    const timer = window.setInterval(() => {
      void api.telegramQuickSendStatus(draft.requestId).then((result) => {
        if (active) setJob(result);
      }).catch(() => { /* Do not duplicate an uncertain remote send. */ });
    }, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [draft.requestId, job?.state]);

  const openPicker = async () => {
    if (sending || job || loadingContacts) return;
    setPickerOpen((value) => !value);
    if (recipients.length) return;
    setLoadingContacts(true);
    setError('');
    try {
      const list = await api.telegramChatSendTargets();
      if (mounted.current) setRecipients(list.dialogs);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить контакты');
    } finally { if (mounted.current) setLoadingContacts(false); }
  };

  const send = async () => {
    if (!recipientId || pending.current || job) return;
    pending.current = true;
    setSending(true);
    setError('');
    try {
      const result = await api.telegramQuickSend({
        requestId: draft.requestId,
        recipientIds: [recipientId],
        text: draft.text,
        mode: 'DIRECT'
      });
      if (mounted.current) { setJob(result); setPickerOpen(false); }
    } catch (cause) {
      if (mounted.current) {
        // A network failure can occur after the server accepted the job.
        // Query its stable id before enabling any resubmit.
        try {
          const previous = await api.telegramQuickSendStatus(draft.requestId);
          if (mounted.current) setJob(previous);
        } catch {
          if (mounted.current) setError(cause instanceof Error ? cause.message : 'Не удалось принять отправку');
        }
      }
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const all: TelegramSendTarget[] = [{ id: 'saved', name: 'Избранное', username: null, kind: 'user' }, ...recipients];
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  const filtered = all.filter((person) => person.id === 'saved' ||
    person.name.toLocaleLowerCase('ru-RU').includes(needle) ||
    (person.username ?? '').toLocaleLowerCase('ru-RU').includes(needle));
  const completed = job?.state === 'DONE';
  const doneText = job?.state === 'FAILED' ? 'Отправку выполнить не удалось' :
    completed
      ? (job?.sentCount ? 'Отправлено в Telegram' : job?.unknownCount ? 'Результат отправки неизвестен. Проверьте Telegram.' : 'Сообщение не отправлено')
      : job ? 'Отправка поставлена в очередь…' : '';

  return (
    <div className="telegram-quick-share telegram-ai-send-card mt-3 rounded-2xl border p-3 text-sm" data-telegram-send-card="true">
      <div className="flex items-center gap-2">
        <span className="telegram-ai-send-card__logo flex h-8 w-8 items-center justify-center rounded-xl">
          <Send size={16}/>
        </span>
        <strong className="min-w-0 flex-1">Сообщение в Telegram</strong>
        {job?.state === 'DONE' && job.sentCount > 0 ? <Check size={17} className="text-emerald-500" /> : null}
      </div>
      <p className="telegram-ai-send-card__muted mt-2 text-xs">Получатель</p>
      <div className="relative mt-1">
        <button type="button" disabled={sending || !!job}
          onClick={() => void openPicker()}
          aria-expanded={pickerOpen}
          aria-label="Изменить получателя Telegram"
          className="telegram-ai-send-card__recipient flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left font-semibold disabled:opacity-60">
          <span className="min-w-0 truncate">{recipientName ?? `Выбрать: ${draft.requestedRecipient}`}</span>
          <ChevronDown size={16} className="shrink-0"/>
        </button>
        {pickerOpen && (
          <div className="telegram-ai-send-card__menu absolute inset-x-0 top-full z-30 mt-1 rounded-xl border p-2 shadow-xl">
            <div className="telegram-ai-send-card__search flex items-center gap-2 rounded-lg border px-3">
              <Search size={14}/>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск человека или беседы"
                aria-label="Поиск человека или беседы Telegram"
                className="telegram-ai-send-card__search-input min-w-0 w-full py-2.5 text-sm" />
              <button type="button" aria-label="Закрыть список" onClick={() => setPickerOpen(false)}><X size={14}/></button>
            </div>
            <div className="mt-1 max-h-44 overflow-y-auto">
              {filtered.map((person) => (
                <button type="button" key={person.id} className="telegram-ai-send-card__option block w-full rounded-lg px-3 py-2 text-left"
                  onClick={() => { setRecipientId(person.id); setRecipientName(person.name); setPickerOpen(false); setError(''); }}>
                  <span className="block truncate">{person.name}</span>
                  <span className="telegram-ai-send-card__muted block truncate text-xs">
                    {person.id === 'saved' ? 'Сохранённые сообщения' : person.kind === 'user' ? 'Личный чат' : person.kind === 'group' ? 'Группа' : 'Супергруппа'}
                    {person.username ? ` · ${person.username}` : ''}
                  </span>
                </button>
              ))}
              {!recipients.length && loadingContacts && <p className="telegram-ai-send-card__muted p-2 text-xs"><Loader2 className="mr-1 inline animate-spin" size={13}/> Загружаем чаты…</p>}
            </div>
          </div>
        )}
      </div>
      {draft.match === 'ambiguous' && !recipientId && (
        <p className="telegram-ai-send-card__muted mt-1 text-xs">Найдено несколько похожих контактов. Укажите нужного.</p>
      )}
      {draft.match === 'not_found' && !recipientId && (
        <p className="telegram-ai-send-card__muted mt-1 text-xs">Контакт не определён. Выберите его из списка.</p>
      )}
      <p className="telegram-ai-send-card__muted mt-3 text-xs">Текст сообщения</p>
      <div tabIndex={0} className="telegram-ai-send-card__message mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border p-3 leading-relaxed">{draft.text}</div>
      {error && <p role="alert" className="telegram-ai-send-card__error mt-2 text-xs">{error}</p>}
      {job && <p role="status" className="telegram-ai-send-card__muted mt-2 text-xs">{doneText}</p>}
      <button type="button" disabled={!recipientId || sending || !!job} onClick={() => void send()}
        className="telegram-ai-send-card__send mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {sending || job?.state === 'QUEUED' || job?.state === 'PROCESSING' ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
        {job ? 'Отправка оформлена' : 'Отправить'}
      </button>
    </div>
  );
}
