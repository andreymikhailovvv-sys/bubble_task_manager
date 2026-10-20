import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './TelegramMessageQuickShare.css';
import { Check, ChevronRight, Send, Loader2, MessageCircle, Search, Sparkles, X } from 'lucide-react';
import { api, type TelegramSendTarget, type TelegramQuickSendJob } from '../lib/api';

const SAVED_MESSAGES_ID = 'saved';
type Mode = 'recipients' | 'edit' | 'preview';
type Props = { text: string; compact?: boolean };

export function TelegramMessageQuickShare({ text }: Props) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
  const [mode, setMode] = useState<Mode>('recipients');
  const [busy, setBusy] = useState(false);
  const [dialogs, setDialogs] = useState<TelegramSendTarget[]>([]);
  const [dialogsLoaded, setDialogsLoaded] = useState(false);
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
          setToast(`Telegram: операция остановлена. Уже отправлено ${next.sentCount} из ${next.recipientCount}. Остальные не отправлены либо требуют ручной проверки.`);
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
    setDialogsLoaded(false);
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
      const result = await api.telegramChatSendTargets();
      if (alive.current) {
        setDialogs(result.dialogs);
        setDialogsLoaded(true);
      }
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
  const selectedNames = chosen.map((id) => id === SAVED_MESSAGES_ID ? 'Избранное' : (dialogs.find((dialog) => dialog.id === id)?.name ?? 'Получатель'));
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
    <div className="telegram-quick-share fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      onClick={(e) => { e.stopPropagation(); close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Отправить сообщение в Telegram"
        className="telegram-quick-share__dialog flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <header className="telegram-quick-share__header flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageCircle size={18} className="text-sky-400" /> Отправить в Telegram</h3>
          <button type="button" aria-label="Закрыть" disabled={busy}
            onClick={close} className="telegram-quick-share__close rounded-xl p-2 disabled:opacity-40"><X size={17} /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {mode === 'recipients' ? (
            <>
              <p tabIndex={0} aria-label="Исходное сообщение" className="telegram-quick-share__message max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl p-3 text-xs">
                {text}
              </p>
              {dialogsLoaded ? (
                <>
                  <label className="telegram-quick-share__search flex items-center gap-2 rounded-xl border px-3">
                    <Search size={16} className="text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск человека или беседы" aria-label="Поиск человека или беседы Telegram"
                      className="telegram-quick-share__search-input min-w-0 w-full bg-transparent py-3 text-sm outline-none" />
                  </label>
                  <p className="telegram-quick-share__muted text-xs">Выберите до трёх получателей · {chosen.length}/3</p>
                  <div className="telegram-quick-share__recipients max-h-60 space-y-1 overflow-y-auto">
                    <button type="button" disabled={busy || (chosen.length === 3 && !chosen.includes(SAVED_MESSAGES_ID))}
                      aria-pressed={chosen.includes(SAVED_MESSAGES_ID)}
                      onClick={() => toggle(SAVED_MESSAGES_ID)}
                      className="telegram-quick-share__recipient telegram-quick-share__saved flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-40">
                      <span className={`telegram-quick-share__check flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${chosen.includes(SAVED_MESSAGES_ID) ? 'telegram-quick-share__check--selected' : ''}`}>
                        {chosen.includes(SAVED_MESSAGES_ID) ? <Check size={13} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold">Избранное
                        <span className="telegram-quick-share__muted block text-[11px]">Сохранённые сообщения Telegram</span>
                      </span>
                    </button>
                    {visible.map((dialog) => (
                      <button type="button" key={dialog.id}
                        disabled={busy || (chosen.length === 3 && !chosen.includes(dialog.id))}
                        onClick={() => toggle(dialog.id)}
                        aria-pressed={chosen.includes(dialog.id)}
                        className="telegram-quick-share__recipient flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm disabled:opacity-40">
                        <span className={`telegram-quick-share__check flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${chosen.includes(dialog.id) ? 'telegram-quick-share__check--selected' : ''}`}>
                          {chosen.includes(dialog.id) ? <Check size={13} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{dialog.name}
                          <span className="telegram-quick-share__muted block truncate text-[11px]">
                            {dialog.kind === 'user' ? 'Личный чат' : dialog.kind === 'group' ? 'Группа' : 'Супергруппа'}
                            {dialog.username ? ` · ${dialog.username}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                    {visible.length === 0 && <p className="telegram-quick-share__muted p-3 text-sm">Других людей или бесед не найдено.</p>}
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
              {!busy && !error && !dialogsLoaded && <p className="telegram-quick-share__muted text-sm">Не удалось загрузить список чатов.</p>}
            </>
          ) : mode === 'edit' ? (
            <>
              <p className="telegram-quick-share__muted text-xs">Получатели: {selectedNames.join(', ')}</p>
              <label className="block text-sm font-medium">
                Текст сообщения
                <textarea value={baseText} maxLength={4000} rows={5}
                  onChange={(e) => setBaseText(e.target.value)}
                  aria-label="Редактировать текст сообщения"
                  className="telegram-quick-share__textarea mt-2 block max-h-40 w-full resize-y overflow-y-auto rounded-xl border p-3 text-sm" />
              </label>
              <label className="block text-sm font-medium">
                Что нужно изменить в сообщении?
                <textarea value={instruction} maxLength={700} rows={4}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Например: сделай формальнее и короче"
                  className="telegram-quick-share__textarea mt-2 block w-full resize-y rounded-xl border p-3 text-sm" />
              </label>
              <div className="flex flex-wrap gap-2">
                <div className="telegram-quick-share__tooltip-anchor relative min-w-0 flex-1">
                  <button type="button" disabled={busy || !baseText.trim() || !instruction.trim()}
                    onClick={() => void submit(baseText, 'REWRITE_AND_SEND', instruction)}
                    className="telegram-quick-share__primary w-full rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-40">
                    Изменить и отправить
                  </button>
                  <span role="tooltip" className="telegram-quick-share__tooltip telegram-quick-share__tooltip--start">
                    ИИ изменит текст по запросу и сразу отправит выбранным получателям.
                  </span>
                </div>
                <div className="telegram-quick-share__tooltip-anchor relative min-w-0 flex-1">
                  <button type="button" disabled={busy || !baseText.trim() || !instruction.trim()} onClick={() => void acceptRewrite()}
                    className="telegram-quick-share__secondary w-full rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-40">
                    {busy ? 'Обрабатываем…' : 'Изменить'}
                  </button>
                  <span role="tooltip" className="telegram-quick-share__tooltip telegram-quick-share__tooltip--end">
                    ИИ изменит текст и покажет результат перед отправкой.
                  </span>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => { setMode('recipients'); setError(''); }}
                className="telegram-quick-share__back inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40">Назад</button>
            </>
          ) : (
            <>
              <p className="telegram-quick-share__subtitle flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} /> Изменённое сообщение</p>
              <p className="telegram-quick-share__muted text-xs">Получатели: {selectedNames.join(', ')}</p>
              <div className="telegram-quick-share__message max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl p-3 text-sm">{modifiedText}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void submit(modifiedText, 'DIRECT')}
                  className="flex-1 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40">Отправить пользователю</button>
                <button type="button" disabled={busy} onClick={() => { setBaseText(modifiedText); setInstruction(''); setMode('edit'); }}
                  className="flex-1 rounded-xl bg-violet-600 px-3 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Изменить</button>
              </div>
            </>
          )}
          {busy && <p role="status" className="telegram-quick-share__subtitle flex items-center gap-2 text-xs"><Loader2 className="animate-spin" size={15} /> {mode === 'recipients' && !dialogsLoaded ? 'Загружаем чаты' : mode === 'preview' ? 'Отправляем сообщение…' : mode === 'edit' ? 'Изменяем сообщение…' : 'Отправляем сообщение…'}</p>}
          {error && <p role="alert" className="telegram-quick-share__error rounded-xl border p-3 text-xs">{error}</p>}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div ref={menuRef} className="telegram-quick-share__menu-anchor">
        <button type="button" onClick={() => setMenuOpen(value => !value)}
          title="Переслать сообщение" aria-label="Переслать сообщение"
          aria-expanded={menuOpen} aria-haspopup="menu"
          className="telegram-quick-share__trigger"
          data-message-forward-trigger="true">
          <Send size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {menuOpen ? <div role="menu" className="telegram-quick-share__platform-menu">
          <div className="telegram-quick-share__menu-caption">Переслать в</div>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void show(); }}
            className="telegram-quick-share__platform-item">
            <MessageCircle size={16} className="text-sky-400" />
            <span>Telegram</span>
            <ChevronRight size={15} className="opacity-55" />
          </button>
        </div> : null}
      </div>
      {modal ? createPortal(modal, document.body) : null}
      {toast && !open ? createPortal(
        <div role="status" className="telegram-quick-share telegram-quick-share__toast fixed bottom-5 right-4 z-[310] max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-2xl">
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
