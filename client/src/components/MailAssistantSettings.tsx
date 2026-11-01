import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CircleHelp, Inbox, Loader2, Mail, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type MailAccount, type MailAccountSettings, type MailAnalysisEvent } from '../lib/api';
import { AiTaskProposalCard } from './AiTaskProposalCard';
import './TelegramIntegrationsMenu.css';
import './MailAssistantSettings.css';

type Provider = 'yandex' | 'mailru';
type Props = { onClose: () => void };
const initial: MailAccountSettings = {
  enabled: true, intervalMinutes: 5, taskMode: 'SUGGEST', instructions: ''
};
const providerLabel = (value: string) => value === 'yandex' ? 'Яндекс Почта' : 'Почта Mail.ru';
const humanDate = (value: string) => new Date(value).toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

export function MailAssistantSettings({ onClose }: Props) {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [available, setAvailable] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('yandex');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<MailAccountSettings>(initial);
  const [events, setEvents] = useState<MailAnalysisEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(true);
  const selected = accounts.find(a => a.id === selectedId) || null;
  const refresh = async () => {
    const data = await api.mailAccounts();
    setAccounts(data.accounts); setAvailable(data.available);
    return data.accounts;
  };
  useEffect(() => {
    let live = true;
    api.mailAccounts().then(data => {
      if (!live) return;
      setAccounts(data.accounts); setAvailable(data.available);
      if (data.accounts.length) setSelectedId(data.accounts[0].id);
    }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Не удалось загрузить почту'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    const account = accounts.find(x => x.id === selectedId);
    if (account) {
      setSettings({ enabled: account.enabled, intervalMinutes: account.intervalMinutes,
        taskMode: account.taskMode, instructions: account.instructions });
    }
    let live = true;
    const fetchEvents = () => api.mailEvents(selectedId).then(data => {
      if (live) setEvents(data.events);
    }).catch(() => {});
    void fetchEvents();
    const id = window.setInterval(fetchEvents, 15_000);
    return () => { live = false; clearInterval(id); };
  }, [selectedId, accounts.map(a => a.id).join(',')]);
  const execute = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await job(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Операция не выполнена'); }
    finally { setBusy(false); }
  };
  const connect = (event: FormEvent) => {
    event.preventDefault();
    void execute(async () => {
      const result = await api.mailConnect({ provider, email: email.trim(), password, ...settings });
      setPassword(''); setEmail('');
      const list = await refresh();
      setSelectedId(result.account.id);
      setNotice(list.length ? 'Почта подключена. Старые письма не анализируются автоматически.' : 'Почта подключена.');
    });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void execute(async () => {
      await api.mailUpdate(selectedId, settings);
      await refresh();
      setNotice('Настройки сохранены.');
    });
  };
  const remove = () => {
    if (!selectedId || !window.confirm('Отключить ящик и удалить его сводки из Планировыча?')) return;
    void execute(async () => {
      await api.mailRemove(selectedId);
      const list = await refresh();
      setSelectedId(list[0]?.id ?? null); setEvents([]);
      setNotice('Подключение удалено. Пароль приложения отозвать можно также в настройках почты.');
    });
  };
  const newAccount = () => {
    setSelectedId(null); setSettings(initial); setEmail(''); setPassword('');
    setHelp(true); setError(''); setNotice('');
  };
  return createPortal(
    <div className="telegram-integrations-modal fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Почтовый ИИ-ассистент"
        className="telegram-integrations-modal__panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--integration-border)] p-5">
          <div className="min-w-0">
            <p className="telegram-integrations-modal__accent flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><Mail size={15}/> Интеграции</p>
            <h2 className="mt-1 text-xl font-bold">Почтовый ИИ-ассистент</h2>
            <p className="integration-menu__muted mt-1 text-xs">Яндекс Почта и Mail.ru · Сводки, обязательства и задачи</p>
          </div>
          <button type="button" className="integration-menu__icon-button rounded-xl p-2" onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
        </div>
        <div className="telegram-ai-settings-scroll min-h-0 overflow-y-auto p-5">
          {loading ? <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/> Загружаем подключения...</div> : (
            <>
              {!available && <div role="alert" className="telegram-integrations-modal__warning mb-4 text-sm">
                Сервер ещё не настроен. Администратору нужно добавить MAIL_ASSISTANT_ENCRYPTION_KEY (64 шестнадцатеричных символа) на Timeweb.
              </div>}
              <div className="telegram-ai-profile-list mb-5">
                {accounts.map(account => (
                  <button type="button" key={account.id} onClick={() => { setSelectedId(account.id); setError(''); setNotice(''); }}
                    className={'telegram-ai-profile telegram-ai-profile--tag min-w-0 rounded-xl border px-4 py-3 text-left text-sm ' +
                      (selectedId === account.id ? 'telegram-ai-profile--active' : '')}>
                    <span className="block truncate font-semibold">{account.email}</span>
                    <span className="integration-menu__muted mt-1 block text-xs">{providerLabel(account.provider)} · {account.enabled ? 'Мониторинг включён' : 'Остановлен'}</span>
                  </button>
                ))}
                <button type="button" className="telegram-ai-add-profile min-h-14 rounded-xl px-4 py-3 text-sm font-semibold"
                  onClick={newAccount}><Plus size={16} className="inline"/> Добавить почту</button>
              </div>
              {selected ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="telegram-ai-settings-section">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-base font-semibold">{selected.email}</p><p className="integration-menu__muted text-xs">{providerLabel(selected.provider)}</p></div>
                        <span className="text-xs">{selected.enabled ? <span className="telegram-integrations-modal__success inline-flex items-center gap-1"><CheckCircle2 size={14}/> Активно</span> : 'Остановлено'}</span>
                      </div>
                      {selected.lastCheckedAt && <p className="integration-menu__muted text-xs">Последняя проверка: {humanDate(selected.lastCheckedAt)}</p>}
                      {selected.lastError && <p role="alert" className="telegram-integrations-modal__warning text-xs">{selected.lastError}</p>}
                      {!selected.sentFolder && <p className="integration-menu__muted text-xs">Папка отправленных не обнаружена. Пока анализируются только входящие письма.</p>}
                      <form onSubmit={save} className="space-y-4">
                        <SettingsFields settings={settings} setSettings={setSettings}/>
                        <button type="submit" disabled={busy || !available} className="integration-menu__action w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                          {busy ? 'Сохраняем...' : 'Сохранить настройки'}
                        </button>
                      </form>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy || !selected.enabled} onClick={() => void execute(async () => {
                          await api.mailCheck(selected.id); setNotice('Проверка поставлена в очередь.');
                        })} className="telegram-integrations-modal__secondary rounded-xl border px-3 py-2 text-xs disabled:opacity-50">
                          <RefreshCw size={13} className="mr-1 inline"/> Проверить сейчас
                        </button>
                        <button type="button" disabled={busy} onClick={remove} className="telegram-integrations-modal__danger rounded-xl border px-3 py-2 text-xs">
                          <Trash2 size={13} className="mr-1 inline"/> Отключить почту
                        </button>
                      </div>
                    </div>
                    <p className="integration-menu__muted text-xs leading-relaxed">Чтение почты без отправки. Письма, которые уже были в ящике при подключении, не обрабатываются. Текст писем не хранится в базе Планировыча, сохраняются только краткие результаты анализа.</p>
                  </div>
                  <div className="telegram-ai-settings-section">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold"><Inbox size={16} className="mr-1 inline"/> Результаты анализа</h3>
                      <span className="integration-menu__muted text-xs">{events.length} событий</span>
                    </div>
                    <div className="mail-assistant-events">
                      {!events.length && <p className="integration-menu__muted text-sm">Новых обработанных писем пока нет. Следующие письма появятся здесь после проверки.</p>}
                      {events.map(item => <div key={item.id} className="mail-assistant-event rounded-xl border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{item.subject}</span>
                          <span className="integration-menu__muted text-xs">{humanDate(item.createdAt)}</span>
                        </div>
                        <p className="integration-menu__muted mt-1 truncate text-xs">{item.folder === 'SENT' ? 'Отправлено' : 'Получено'} · {item.from}</p>
                        {item.status === 'PROCESSING' && <p className="integration-menu__muted mt-2 text-xs">Анализируется...</p>}
                        {item.status === 'FAILED' && <p className="telegram-integrations-modal__warning mt-2 text-xs">{item.error || 'Ошибка анализа'}</p>}
                        {item.summary && <div className="mt-2 space-y-2">
                          <p className="text-sm leading-relaxed">{item.summary.summary}</p>
                          {item.summary.obligations.length > 0 && <div className="text-xs"><b>Обязательства:</b> {item.summary.obligations.join('; ')}</div>}
                          {item.summary.risks.length > 0 && <div className="text-xs"><b>Риски:</b> {item.summary.risks.join('; ')}</div>}
                        </div>}
                        {item.taskProposal && <div className="mt-3"><AiTaskProposalCard key={item.taskProposal.id} proposal={item.taskProposal}/></div>}
                      </div>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-2xl space-y-4">
                  <div className="telegram-ai-settings-section">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">Подключить почтовый ящик</h3>
                      <button type="button" onClick={() => setHelp(v => !v)} className="telegram-integrations-modal__secondary rounded-lg border px-2.5 py-1.5 text-xs">
                        <CircleHelp size={14} className="mr-1 inline"/> Инструкция
                      </button>
                    </div>
                    <div className="mail-assistant-provider-toggle">
                      <button type="button" className={provider === 'yandex' ? 'active' : ''} onClick={() => setProvider('yandex')}>Яндекс Почта</button>
                      <button type="button" className={provider === 'mailru' ? 'active' : ''} onClick={() => setProvider('mailru')}>Mail.ru</button>
                    </div>
                    {help && <div className="integration-menu__instructions rounded-xl border p-4 text-sm leading-relaxed">
                      <p className="mb-2 font-semibold">Как подключить {providerLabel(provider)}</p>
                      {provider === 'yandex' ? (
                        <ol className="list-inside list-decimal space-y-1.5">
                          <li>Откройте Яндекс Почту → Настройки → Почтовые программы. Включите IMAP и «Пароли приложений и OAuth-токены».</li>
                          <li>В <a className="telegram-integrations-modal__accent underline" href="https://id.yandex.ru/security/app-passwords" target="_blank" rel="noopener noreferrer">настройках Яндекс ID</a> создайте отдельный пароль приложения типа «Почта» с названием «Планировыч».</li>
                          <li>Скопируйте пароль приложения в поле ниже. Обычный пароль от Яндекс ID не подходит.</li>
                        </ol>
                      ) : (
                        <ol className="list-inside list-decimal space-y-1.5">
                          <li>Откройте Mail.ru → Настройки → Все настройки → Безопасность → Пароли для внешних приложений.</li>
                          <li>Создайте отдельный пароль «Планировыч» и выберите протокол IMAP. Убедитесь, что доступ по IMAP разрешён.</li>
                          <li>Скопируйте пароль приложения в поле ниже. Обычный пароль от Mail.ru не нужен.</li>
                        </ol>
                      )}
                      <p className="integration-menu__muted mt-2 text-xs">
                        IMAP-сервер: {provider === 'yandex' ? 'imap.yandex.ru' : 'imap.mail.ru'} · SSL/TLS · порт 993
                      </p>
                      <a className="telegram-integrations-modal__accent mt-2 inline-block text-xs underline"
                        href={provider === 'yandex'
                          ? 'https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others.html'
                          : 'https://help.mail.ru/mail/login/mailer/'} target="_blank" rel="noopener noreferrer">Официальная инструкция</a>
                    </div>}
                    <form onSubmit={connect} className="space-y-4">
                      <label className="block text-sm font-medium">Адрес почты
                        <input className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"
                          autoComplete="email" type="email" required maxLength={254}
                          value={email} onChange={e => setEmail(e.target.value)} placeholder={provider === 'yandex' ? 'name@yandex.ru' : 'name@mail.ru'}/>
                      </label>
                      <label className="block text-sm font-medium">Пароль приложения
                        <input className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"
                          autoComplete="new-password" type="password" required maxLength={256}
                          value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль для внешнего приложения"/>
                      </label>
                      <p className="integration-menu__muted flex items-start gap-2 text-xs"><ShieldCheck size={16} className="shrink-0"/> Пароль приложения шифруется на сервере. Его нельзя посмотреть в интерфейсе. Планировыч не изменяет и не отправляет письма.</p>
                      <SettingsFields settings={settings} setSettings={setSettings}/>
                      <button type="submit" disabled={busy || !available || !email.trim() || !password}
                        className="integration-menu__action w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
                        {busy ? <Loader2 size={16} className="mr-1 inline animate-spin"/> : <Mail size={16} className="mr-1 inline"/>} Проверить и подключить
                      </button>
                    </form>
                  </div>
                </div>
              )}
              {error && <p role="alert" className="telegram-integrations-modal__warning mt-4 text-sm">{error}</p>}
              {notice && <p role="status" className="telegram-integrations-modal__success mt-4 text-sm">{notice}</p>}
            </>
          )}
        </div>
      </section>
    </div>, document.body
  );
}
function SettingsFields({ settings, setSettings }: {
  settings: MailAccountSettings; setSettings: (v: MailAccountSettings) => void;
}) {
  const update = (next: Partial<MailAccountSettings>) => setSettings({ ...settings, ...next });
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 accent-sky-600" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })}/>
        <span><strong>Включить мониторинг</strong><span className="integration-menu__muted mt-0.5 block text-xs">Читать новые письма и отправленные сообщения для анализа ИИ</span></span>
      </label>
      <label className="block text-sm">Периодичность проверки
        <select className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"
          value={settings.intervalMinutes} onChange={e => update({ intervalMinutes: Number(e.target.value) as MailAccountSettings['intervalMinutes'] })}>
          <option value={5}>Каждые 5 минут</option><option value={15}>Каждые 15 минут</option>
          <option value={30}>Каждые 30 минут</option><option value={60}>Каждый час</option>
        </select>
      </label>
      <label className="block text-sm">Работа с задачами
        <select className="telegram-integrations-modal__input mt-1.5 w-full rounded-xl border px-3 py-2.5"
          value={settings.taskMode} onChange={e => update({ taskMode: e.target.value as MailAccountSettings['taskMode'] })}>
          <option value="NONE">Не создавать задачи</option>
          <option value="SUGGEST">Предлагать задачи на подтверждение</option>
          <option value="AUTO">Автоматически создавать задачи</option>
        </select>
      </label>
      {settings.taskMode === 'AUTO' && <p className="telegram-integrations-modal__warning text-xs">Автосоздание включится только после сохранения. Оно касается исключительно новых входящих писем.</p>}
      <label className="block text-sm">Дополнительные инструкции ИИ
        <textarea rows={3} maxLength={2500} className="telegram-integrations-modal__input mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5"
          placeholder="Например: Предлагай задачи только из писем от клиентов. Игнорируй рассылки."
          value={settings.instructions} onChange={e => update({ instructions: e.target.value })}/>
      </label>
    </div>
  );
}
