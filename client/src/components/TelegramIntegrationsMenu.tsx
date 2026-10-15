import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, KeyRound, Link2, Loader2, Send, Smartphone, X } from 'lucide-react';
import { api, type TelegramIntegrationStatus } from '../lib/api';
import './TelegramIntegrationsMenu.css';

type Integration = 'bot' | 'messages';
type Props = { onConnectBot: () => void };
const RUNNING = ['starting', 'qr', 'password_required', 'verifying_password'];

export function TelegramIntegrationsMenu({ onConnectBot }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Integration | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<TelegramIntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.telegramIntegrationStatus();
      if (active.current) setStatus(next);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Не удалось проверить интеграции');
    }
  }, []);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (open || dialogOpen) void refresh();
  }, [open, dialogOpen, refresh]);
  useEffect(() => {
    if (!dialogOpen || !status || !RUNNING.includes(status.status)) return;
    const timer = window.setInterval(() => { void refresh(); }, 2200);
    return () => window.clearInterval(timer);
  }, [dialogOpen, refresh, status?.status, status?.attemptId]);
  useEffect(() => {
    if (!open && !dialogOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialogOpen) setDialogOpen(false); else setOpen(false);
    };
    const onOutside = (e: PointerEvent) => {
      if (!dialogOpen && popupRef.current && !popupRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onOutside);
    return () => { document.removeEventListener('keydown', onEscape); document.removeEventListener('pointerdown', onOutside); };
  }, [open, dialogOpen]);

  const perform = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Операция Telegram не выполнена'); }
    finally { setBusy(false); }
  };

  const configure = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      await api.telegramIntegrationConfigure(apiId.trim(), apiHash.trim());
      setApiId(''); setApiHash('');
      await api.telegramIntegrationStart();
    });
  };
  const doDisconnect = async () => perform(async () => {
    const result = await api.telegramIntegrationDisconnect();
    setPassword(''); setApiId(''); setApiHash('');
    if (result.remoteLogout === 'failed') {
      setNotice('Подключение удалено из Планировыча. Дополнительно завершите его в Telegram → Настройки → Устройства.');
    } else setNotice('Интеграция отключена. Чтобы подключиться снова, введите ключи и подтвердите вход.');
  });
  const expandIntegration = (kind: Integration) => setExpanded(current => current === kind ? null : kind);
  const closeModal = () => { setDialogOpen(false); setPassword(''); setApiHash(''); setApiId(''); setError(''); };
  const connected = Boolean(status?.connected && status.sendEnabled);
  const botConnected = Boolean(status?.botConnected);

  return (
    <>
      <div className="integration-menu relative" ref={popupRef}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <button type="button" className="public-nav-link integration-menu__trigger shrink-0 px-2 py-2 text-sm"
          aria-label="Интеграции" aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          onFocus={() => setOpen(true)}>
          <Link2 size={15} /> Интеграции <ChevronDown size={14} />
        </button>
        {open && (
          <div className="integration-menu__popup absolute right-0 top-full z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-2xl">
            <h3 className="mb-2 px-1 text-sm font-bold">Интеграции</h3>
            <p className="integration-menu__muted mb-3 px-1 text-xs">Подключайте сервисы к своему аккаунту Планировыча.</p>
            {(['bot', 'messages'] as const).map(kind => {
              const isBot = kind === 'bot';
              const enabled = isBot ? botConnected : connected;
              return (
                <div key={kind} className="integration-menu__item mb-2 rounded-xl border">
                  <button type="button" className="flex w-full items-center gap-2 p-3 text-left" aria-expanded={expanded === kind}
                    onClick={() => expandIntegration(kind)}>
                    <span className="integration-menu__symbol flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">{isBot ? <Smartphone size={19}/> : <Send size={18}/>}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{isBot ? 'Telegram-бот' : 'Отправка в Telegram'}</span>
                      <span className={`mt-1 flex items-center gap-1 text-xs ${enabled ? 'integration-menu__on' : 'integration-menu__muted'}`}>
                        {enabled ? <CheckCircle2 size={12}/> : null}{enabled ? 'Подключено' : 'Не подключено'}
                      </span>
                    </span>
                    <ChevronRight size={16} className={`integration-menu__muted transition-transform ${expanded === kind ? 'rotate-90' : ''}`}/>
                  </button>
                  {expanded === kind && (
                    <div className="integration-menu__details border-t px-3 pb-3 pt-2">
                      <p className="integration-menu__muted text-xs leading-relaxed">{isBot
                        ? 'Получайте уведомления, используйте Telegram Mini App и управляйте задачами через бота Планировыча.'
                        : 'Отправляйте сообщения из ИИ-чатов Планировыча от своего имени. ИИ подготовит текст, а отправка произойдёт только по вашему подтверждению. Нужны собственные API ID и API Hash Telegram.'}</p>
                      <button type="button" className="integration-menu__action mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold"
                        onClick={() => {
                          setOpen(false);
                          if (isBot) onConnectBot();
                          else { setDialogOpen(true); setError(''); setNotice(''); }
                        }}>
                        {enabled && !isBot ? 'Управлять подключением' : isBot && enabled ? 'Открыть подключение' : 'Подключить'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {dialogOpen && (
        <div className="telegram-integrations-modal fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={closeModal}>
          <section role="dialog" aria-modal="true" aria-label="Подключить отправку в Telegram"
            className="telegram-integrations-modal__panel max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="telegram-integrations-modal__accent text-xs font-bold uppercase tracking-wider">Интеграция</p>
                <h2 className="mt-1 text-lg font-bold">Отправка сообщений в Telegram</h2></div>
              <button type="button" className="integration-menu__icon-button rounded-xl p-2" onClick={closeModal} aria-label="Закрыть"><X size={18}/></button>
            </div>
            {status?.connected ? (
              <div className="mt-4 space-y-3">
                <p className="telegram-integrations-modal__success flex items-center gap-2 text-sm"><CheckCircle2 size={16}/> Telegram подключён и готов к отправке.</p>
                <p className="integration-menu__muted text-sm">Теперь можно отправлять сообщения из ИИ-чатов. Текст и получатель всегда показываются перед отправкой.</p>
                <button type="button" className="telegram-integrations-modal__danger rounded-xl border px-4 py-2 text-sm" disabled={busy} onClick={() => void doDisconnect()}>Отключить интеграцию</button>
              </div>
            ) : (
              <>
                <div className="integration-menu__instructions mt-4 rounded-2xl border p-4">
                  <p className="font-semibold">Как подключить</p>
                  <ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-relaxed">
                    <li>Сначала подключите Telegram-бота Планировыча, если ещё не сделали этого.</li>
                    <li>Откройте <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" className="telegram-integrations-modal__accent underline">my.telegram.org/apps</a>. Удобнее открыть страницу в <strong>режиме инкогнито</strong>, чтобы избежать проблем с сохранённой авторизацией.</li>
                    <li>Войдите по номеру телефона Telegram, введите код, который пришлёт Telegram. Никому не передавайте этот код.</li>
                    <li>В разделе <strong>API development tools</strong> создайте приложение, если его ещё нет. Название можно указать «Планировыч», тип приложения выбрать Desktop.</li>
                    <li>Скопируйте <strong>App api_id</strong> и <strong>App api_hash</strong> в поля ниже. Не публикуйте их.</li>
                    <li>После продолжения откройте Telegram на телефоне: <strong>Настройки → Устройства → Подключить устройство</strong>, отсканируйте QR и подтвердите вход.</li>
                  </ol>
                </div>
                {!botConnected && <p role="status" className="telegram-integrations-modal__warning mt-3 text-xs">Сначала привяжите Telegram-бота в разделе «Интеграции → Telegram-бот». Аккаунты Telegram должны совпадать.</p>}
                {status?.enabled === false && <p className="telegram-integrations-modal__warning mt-3 text-xs">Подключение Telegram временно отключено на сервере.</p>}
                {(status?.status === 'qr' || status?.status === 'starting' || status?.status === 'password_required' || status?.status === 'verifying_password') ? (
                  <div className="mt-4 space-y-3">
                    {status.status === 'starting' && <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/> Получаем QR-код…</p>}
                    {status.status === 'qr' && status.qrDataUrl && <>
                      <img className="mx-auto w-60 rounded-xl bg-white p-3" src={status.qrDataUrl} alt="QR-код подтверждения Telegram"/>
                      <p className="integration-menu__muted text-center text-xs">Отсканируйте QR-код в Telegram → Настройки → Устройства.</p>
                    </>}
                    {status.status === 'verifying_password' && <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/> Проверяем пароль Telegram…</p>}
                    {status.status === 'password_required' && (
                      <form onSubmit={event => { event.preventDefault(); if (status.attemptId) void perform(async () => { await api.telegramIntegrationPassword(status.attemptId!, password); setPassword(''); }); }}>
                        <label className="block text-sm">Пароль двухэтапной аутентификации{status.passwordHint ? ` (подсказка: ${status.passwordHint})` : ''}
                          <input type="password" autoComplete="off" className="telegram-integrations-modal__input mt-2 w-full rounded-xl border px-3 py-2.5" value={password} onChange={e => setPassword(e.target.value)}/></label>
                        <button type="submit" disabled={busy || !password.trim()} className="integration-menu__action mt-2 w-full rounded-xl py-2.5 text-sm font-semibold">Продолжить</button>
                      </form>
                    )}
                    <button type="button" disabled={busy || !status.attemptId} className="telegram-integrations-modal__secondary rounded-xl border px-4 py-2 text-sm"
                      onClick={() => { if (status.attemptId) void perform(() => api.telegramIntegrationCancel(status.attemptId!)); }}>Отменить подключение</button>
                  </div>
                ) : (
                  <form onSubmit={event => void configure(event)} className="mt-4 space-y-3">
                    <label className="block text-sm font-medium">App api_id
                      <input type="text" inputMode="numeric" autoComplete="off" required maxLength={10}
                        value={apiId} onChange={e => setApiId(e.target.value)}
                        placeholder="Числовой API ID" className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"/>
                    </label>
                    <label className="block text-sm font-medium">App api_hash
                      <input type="password" autoComplete="off" spellCheck={false} required maxLength={32}
                        value={apiHash} onChange={e => setApiHash(e.target.value)}
                        placeholder="32 символа" className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"/>
                    </label>
                    <p className="integration-menu__muted text-xs">Ключи шифруются на сервере и не сохраняются в браузере. Для защиты привязка доступна только к тому Telegram, который связан с вашим ботом Планировыча.</p>
                    <button type="submit" disabled={busy || !botConnected || !status?.enabled || !apiId.trim() || !apiHash.trim()}
                      className="integration-menu__action flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                      {busy ? <Loader2 size={16} className="animate-spin"/> : <KeyRound size={16}/>} Сохранить ключи и подключить
                    </button>
                    {status?.credentialsSet && <button type="button" className="telegram-integrations-modal__secondary w-full rounded-xl border py-2 text-sm" disabled={busy} onClick={() => void perform(() => api.telegramIntegrationStart())}>Повторить QR-подключение с сохранёнными ключами</button>}
                    {status?.credentialsSet && <button type="button" className="telegram-integrations-modal__danger w-full rounded-xl border py-2 text-sm" disabled={busy} onClick={() => void doDisconnect()}>Удалить сохранённые ключи</button>}
                  </form>
                )}
              </>
            )}
            {error && <p role="alert" className="telegram-integrations-modal__warning mt-3 text-sm">{error}</p>}
            {status?.error && <p role="alert" className="telegram-integrations-modal__warning mt-3 text-sm">{status.error}</p>}
            {notice && <p role="status" className="telegram-integrations-modal__success mt-3 text-sm">{notice}</p>}
          </section>
        </div>
      )}
    </>
  );
}
