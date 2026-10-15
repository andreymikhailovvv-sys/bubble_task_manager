import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, MessageCircle, Search, Sparkles, X } from 'lucide-react';
import { api, type TelegramPrivateDialog, type TelegramQuickSendJob } from '../lib/api';

type Mode = 'recipients' | 'edit' | 'preview';
type Props = { text: string; compact?: boolean };

export function TelegramMessageQuickShare({ text, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('recipients');
  const [busy, setBusy] = useState(false);
  const [dialogs, setDialogs] = useState<TelegramPrivateDialog[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const [baseText, setBaseText] = useState(text);
  const [modifiedText, setModifiedText] = useState('');
  const [job, setJob] = useState<TelegramQuickSendJob | null>(null);
  const [toast, setToast] = useState('');
  const submittingRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (!job || (job.state !== 'QUEUED' && job.state !== 'PROCESSING')) return;
    let active = true;
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const next = await api.telegramQuickSendStatus(job.id);
        if (!active || !alive.current) return;
        setJob(next);
        if (next.state === 'DONE') {
          setToast(next.unknownCount
            ? `Telegram: отправлено ${next.sentCount}; результат неизвестен для ${next.unknownCount}. Проверьте вручную.`
            : next.failedCount
              ? `Telegram: отправлено ${next.sentCount}, не отправлено ${next.failedCount}.`
              : `Telegram: отправлено ${next.sentCount} из ${next.recipientCount}.`);
        }
        if (next.state === 'FAILED') {
          setToast('Telegram: выполнить отправку не удалось. Сообщения не отправлены либо проверьте статус вручную.');
        }
      } catch {
        // Network response can be temporarily unavailable; the durable job
        // does not depend on this browser poll.
      } finally { running = false; }
    };
    const interval = window.setInterval(() => { void check(); }, 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [job?.id, job?.state]);

  const show = async () => {
    if (busy || open) return;
    setOpen(true);
    setMode('recipients');
    setError('');
    setSearch('');
    setChosen([]);
    setInstruction('');
    setModifiedText('');
    setBaseText(text);
    setDialogs([]);
    setBusy(true);
    try {
      const capability = await api.telegramChatCapability();
      if (!alive.current) return;
      if (!capability.connected) {
        setError('Чтобы отправлять сообщения в Telegram, сначала привяжите личный аккаунт Telegram к Планировычу.');
        return;
      }
      if (!capability.readEnabled || !capability.sendEnabled) {
        setError('Telegram подключён, но отправка пока не разрешена для этого аккаунта.');
        return;
      }
      const result = await api.telegramChatDialogs();
      if (alive.current) setDialogs(result.dialogs);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Не удалось получить список чатов Telegram');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setError('');
    setChosen((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      return current.length < 3 ? [...current, id] : current;
    });
  };

  const close = () => { if (!busy) setOpen(false); };
  const selectedNames = dialogs.filter((dialog) => chosen.includes(dialog.id)).map((dialog) => dialog.name);
  const filter = search.trim().toLocaleLowerCase('ru-RU');
  const visible = dialogs.filter((dialog) => !filter ||
    dialog.name.toLocaleLowerCase('ru-RU').includes(filter) ||
    (dialog.username ?? '').toLocaleLowerCase('ru-RU').includes(filter));

  const submit = async (sendText: string, modeToSend: 'DIRECT' | 'REWRITE_AND_SEND', directions?: string) => {
    if (submittingRef.current || !chosen.length) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    try {
      // A single client UUID is sent exactly once per click; backend persists
      // an audit and returns a durable job, never retries unknown delivery.
      const accepted = await api.telegramQuickSend({
        requestId: crypto.randomUUID(),
        text: sendText, recipientIds: chosen, mode: modeToSend,
        ...(modeToSend === 'REWRITE_AND_SEND' ? { instruction: directions } : {})
      });
      if (!alive.current) return;
      setJob(accepted);
      setToast(modeToSend === 'REWRITE_AND_SEND'
        ? 'Запрос будет обработан ИИ и отправлен выбранным пользователям.'
        : 'Сообщение принято к отправке в Telegram.');
      setOpen(false);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Не удалось принять запрос на отправку');
    } finally {
      submittingRef.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const acceptRewrite = async () => {
    if (busy || !instruction.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.telegramQuickRewrite({ text: baseText, instruction });
      if (!alive.current) return;
      setModifiedText(result.text);
      setMode('preview');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Не удалось изменить сообщение');
    } finally { if (alive.current) setBusy(false); }
  };

  const modal = open ? (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Отправить сообщение в Telegram"
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageCircle size={18} className="text-sky-400" /> Отправить в Telegram</h3>
          <button type="button" aria-label="Закрыть" disabled={busy}
            onClick={close} className="rounded-xl p-2 text-slate-300 hover:bg-slate-700 disabled:opacity-40"><X size={17} /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {mode === 'recipients' ? (
            <>
              <p className="line-clamp-4 whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                {text}
              </p>
              {dialogs.length > 0 ? (
                <>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
                    <Search size={16} className="text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск человека" aria-label="Поиск получателя Telegram"
                      className="w-full bg-transparent py-3 text-sm outline-none" />
                  </label>
                  <p className="text-xs text-slate-400">Выберите до трёх получателей · {chosen.length}/3</p>
                  <div className="max-h-60 space-y-1 overflow-y-auto">
                    {visible.map((dialog) => (
                      <button type="button" key={dialog.id}
                        disabled={busy || (chosen.length === 3 && !chosen.includes(dialog.id))}
                        onClick={() => toggle(dialog.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-40 ${chosen.includes(dialog.id) ? 'border-sky-500/70 bg-sky-950/40' : 'border-slate-700 bg-slate-950 hover:bg-slate-800'}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${chosen.includes(dialog.id) ? 'border-sky-400 bg-sky-500 text-white' : 'border-slate-600'}`}>
                          {chosen.includes(dialog.id) ? <Check size={13} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{dialog.name}
                          {dialog.username ? <span className="block truncate text-[11px] text-slate-400">{dialog.username}</span> : null}
                        </span>
                      </button>
                    ))}
                    {visible.length === 0 && <p className="p-3 text-sm text-slate-400">Ничего не найдено.</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button type="button" disabled={busy || chosen.length === 0}
                      onClick={() => void submit(text, 'DIRECT')}
                      className="flex-1 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40">Отправить</button>
                    <button type="button" disabled={busy || chosen.length === 0}
                      onClick={() => { setMode('edit'); setBaseText(text); setError(''); }}
                      className="flex-1 rounded-xl bg-violet-600 px-3 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Изменить и отправить</button>
                  </div>
                </>
              ) : null}
              {!busy && !error && dialogs.length === 0 && <p className="text-sm text-slate-400">Доступных личных чатов пока нет.</p>}
            </>
          ) : mode === 'edit' ? (
            <>
              <p className="text-xs text-slate-400">Получатели: {selectedNames.join(', ')}</p>
              <p className="line-clamp-4 whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs text-slate-300">{baseText}</p>
              <label className="block text-sm font-medium">
                Что нужно изменить в сообщении?
                <textarea value={instruction} maxLength={700} rows={4}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Например: сделай формальнее и короче"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none focus:border-violet-400" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !instruction.trim()} onClick={() => void submit(baseText, 'REWRITE_AND_SEND', instruction)}
                  className="flex-1 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40">
                  Отправить пользователю
                </button>
                <button type="button" disabled={busy || !instruction.trim()} onClick={() => void acceptRewrite()}
                  className="flex-1 rounded-xl bg-violet-600 px-3 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
                  {busy ? 'Обрабатываем…' : 'Принять'}
                </button>
              </div>
              <p className="text-xs text-slate-400">«Отправить пользователю» запускает обработку и отправку в фоне. «Принять» сначала покажет результат ИИ.</p>
              <button type="button" disabled={busy} onClick={() => setMode('recipients')}
                className="text-xs text-slate-300 underline">Назад к получателям</button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-200"><Sparkles size={16} /> Изменённое сообщение</p>
              <p className="text-xs text-slate-400">Получатели: {selectedNames.join(', ')}</p>
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-sm">{modifiedText}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void submit(modifiedText, 'DIRECT')}
                  className="flex-1 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40">Отправить пользователю</button>
                <button type="button" disabled={busy} onClick={() => { setBaseText(modifiedText); setInstruction(''); setMode('edit'); }}
                  className="flex-1 rounded-xl bg-violet-600 px-3 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Изменить</button>
              </div>
            </>
          )}
          {busy && <p role="status" className="flex items-center gap-2 text-xs text-sky-300"><Loader2 className="animate-spin" size={15} /> Выполняем запрос…</p>}
          {error && <p role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</p>}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => void show()} title="Отправить это сообщение в Telegram"
        aria-label="Отправить сообщение в Telegram"
        className={`inline-flex items-center justify-center rounded-full text-sky-500 transition hover:bg-sky-500/10 hover:text-sky-400 ${compact ? 'h-5 w-5' : 'h-6 w-6'}`}>
        <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.6 2.5a1.2 1.2 0 0 0-1.24-.15L2.5 9.85a1.15 1.15 0 0 0 .15 2.17l4.42 1.47 1.72 5.26a1.16 1.16 0 0 0 1.88.5l2.6-2.35 4.66 3.43a1.2 1.2 0 0 0 1.9-.76l2.15-15.94a1.2 1.2 0 0 0-.38-1.13ZM9.3 12.93l8.38-6.3-6.75 8.26-.28 2.04-1.35-4Z" />
        </svg>
      </button>
      {modal ? createPortal(modal, document.body) : null}
      {toast && !open ? createPortal(
        <div role="status" className="fixed bottom-5 right-4 z-[310] max-w-sm rounded-2xl border border-sky-500/40 bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl">
          <div className="flex items-start gap-2">
            <MessageCircle className="mt-0.5 shrink-0 text-sky-400" size={17} />
            <span className="flex-1">{toast}</span>
            <button type="button" onClick={() => setToast('')} aria-label="Скрыть уведомление"><X size={15} /></button>
          </div>
          {job && (job.state === 'QUEUED' || job.state === 'PROCESSING') && (
            <p className="mt-2 text-xs text-slate-400">Отправка выполняется в фоне. Закрытие окна её не отменит.</p>
          )}
        </div>, document.body
      ) : null}
    </>
  );
}
