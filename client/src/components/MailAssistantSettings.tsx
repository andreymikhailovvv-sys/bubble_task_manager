import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Loader2, Mail, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type MailAccount, type MailAccountSettings } from '../lib/api';
import { SettingSlider, TimeFrequencySlider, CreditLimitSlider } from './TelegramAiAssistantSettings';
import './TelegramIntegrationsMenu.css';
import './TelegramMessageQuickShare.css';
import './MailAssistantSettings.css';

const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE','SUGGEST','AUTO'] as const;
const defaultSettings: MailAccountSettings = {
  enabled: true, intervalMinutes: 5,
  replyMode: 'OBSERVE', taskMode: 'SUGGEST',
  suggestWhen: '', suggestHow: '', autoReplyWhen: '', autoReplyHow: '',
  replyIntervalMinutes: 5, taskCreationWhen: '', taskIntervalMinutes: 30,
  summaryIntervalMinutes: 30, summaryInstructions: '',
  monitorModel: 'gpt-6-luna', dailyCreditLimitMilli: 50_000, notifyImportant: true, instructions: ''
};
const formatDate = (date: string) => new Date(date).toLocaleString('ru-RU');
const providerName = (value: string) => value === 'yandex' ? 'Яндекс Почта' : 'Почта Mail.ru';
const accountTitle = (account: MailAccount) => (account.provider === 'yandex' ? 'Письма Яндекс' : 'Письма Mail.ru') + ' · ' + account.email;

export function MailAssistantSettings({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [available, setAvailable] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<'mailru'|'yandex'>('yandex');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState<MailAccountSettings>({ ...defaultSettings });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showHelp, setShowHelp] = useState(true);
  const selected = accounts.find(a => a.id === selectedId) ?? null;
  const update = <K extends keyof MailAccountSettings>(key: K, value: MailAccountSettings[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));

  const refresh = async () => {
    const result = await api.mailAccounts();
    setAccounts(result.accounts);
    setAvailable(result.available);
    return result.accounts;
  };
  useEffect(() => {
    let live = true;
    api.mailAccounts().then(data => {
      if (!live) return;
      setAccounts(data.accounts);
      setAvailable(data.available);
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'Не удалось открыть почтовые интеграции'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const fn = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);
  const pick = (account: MailAccount) => {
    setSelectedId(account.id); setAdding(false); setError(''); setNotice('');
    setDraft({
      enabled: account.enabled, intervalMinutes: account.intervalMinutes,
      replyMode: account.replyMode, taskMode: account.taskMode,
      suggestWhen: account.suggestWhen, suggestHow: account.suggestHow,
      autoReplyWhen: account.autoReplyWhen, autoReplyHow: account.autoReplyHow,
      replyIntervalMinutes: account.replyIntervalMinutes,
      taskCreationWhen: account.taskCreationWhen, taskIntervalMinutes: account.taskIntervalMinutes,
      summaryIntervalMinutes: account.summaryIntervalMinutes, summaryInstructions: account.summaryInstructions,
      monitorModel: account.monitorModel, dailyCreditLimitMilli: account.dailyCreditLimitMilli,
      notifyImportant: account.notifyImportant, instructions: account.instructions
    });
  };
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Действие не выполнено'); }
    finally { setBusy(false); }
  };
  const connect = (event: FormEvent) => {
    event.preventDefault();
    void action(async () => {
      const { account } = await api.mailConnect({ ...draft, provider, email: email.trim(), password });
      setPassword(''); setEmail(''); setAdding(false);
      await refresh(); pick(account);
      setNotice('Почта подключена. Новые письма будут анализироваться согласно настройкам.');
      window.dispatchEvent(new Event('mail-ai-assistant-updated'));
    });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void action(async () => {
      const { account } = await api.mailUpdate(selectedId, draft);
      await refresh(); pick(account); setNotice('Настройки сохранены.');
    });
  };
  const toggle = () => {
    if (!selected) return;
    void action(async () => {
      const { account } = await api.mailUpdate(selected.id, { ...draft, enabled: !selected.enabled });
      await refresh(); pick(account);
      setNotice(account.enabled ? 'Мониторинг включён.' : 'Мониторинг остановлен.');
    });
  };
  const remove = () => {
    if (!selected || !window.confirm('Удалить подключение ' + selected.email + ' и историю анализа?')) return;
    void action(async () => {
      await api.mailRemove(selected.id); await refresh();
      setSelectedId(null); setAdding(false); setDraft({ ...defaultSettings });
      setNotice('Почтовый ассистент удалён. Пароль приложения можно отозвать у провайдера.');
      window.dispatchEvent(new Event('mail-ai-assistant-updated'));
    });
  };
  return createPortal(
    <div className="telegram-integrations-modal fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
      onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Почтовый ИИ-ассистент"
        className="telegram-integrations-modal__panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        onClick={event => event.stopPropagation()}>
        <div className="telegram-ai-settings-scroll min-h-0 overflow-y-auto px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="telegram-integrations-modal__accent flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><Mail size={15}/> Интеграции</p>
              <h2 className="mt-1 text-xl font-bold">Почтовый ИИ-ассистент</h2>
              <p className="integration-menu__muted mt-1 text-sm">Отдельные настройки для каждого почтового ящика.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Закрыть" className="integration-menu__icon-button rounded-xl p-2"><X size={18}/></button>
          </div>
          <div className="integration-menu__instructions mt-4 flex items-start gap-2 rounded-2xl border p-3 text-sm">
            <ShieldCheck size={17} className="mt-0.5 shrink-0"/>
            <div><strong>Контроль остаётся за вами</strong>
              <p className="integration-menu__muted mt-1 text-xs leading-relaxed">
                Ассистент читает новые входящие и исходящие письма выбранного ящика. Тексты передаются OpenAI для анализа. Предложения ответов отправляются только после вашего подтверждения. В режиме «Автоответы» письма могут уходить без дополнительного подтверждения. Вложения пока не анализируются.
              </p>
            </div>
          </div>
          {loading ? <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16}/> Загружаем подключения…</p> : <>
            {!available && <p className="telegram-integrations-modal__warning mt-4 text-sm">На сервере не настроено шифрование почты: MAIL_ASSISTANT_ENCRYPTION_KEY.</p>}
            <div className="mt-5 space-y-5">
              <nav aria-label="Подключённые почтовые ящики" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Почтовые ящики ({accounts.length}/8)</p>
                  <p className="integration-menu__muted text-xs">Выберите ассистента для настройки</p>
                </div>
                <div className="telegram-ai-profile-list">
                  {accounts.map(account => <button key={account.id} type="button" onClick={() => pick(account)}
                    aria-pressed={selectedId === account.id}
                    className={'telegram-ai-profile telegram-ai-profile--tag min-w-0 rounded-xl border px-4 py-3 text-left text-sm ' +
                      (selectedId === account.id ? 'telegram-ai-profile--active' : '')}>
                    <span className="block truncate font-semibold">{account.email}</span>
                    <span className="integration-menu__muted mt-1 block truncate text-xs">{providerName(account.provider)} · {account.enabled ? 'Мониторинг включён' : 'Остановлен'}</span>
                  </button>)}
                  <button type="button" disabled={!available || accounts.length >= 8} onClick={() => {
                    setSelectedId(null); setAdding(true); setDraft({ ...defaultSettings }); setError(''); setNotice('');
                  }} className="telegram-ai-add-profile inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50">
                    <Plus size={17}/> Добавить почту
                  </button>
                </div>
              </nav>
              {selected && !adding ? <div className="space-y-3">
                <h3 className="font-semibold">{accountTitle(selected)}</h3>
                <p className="integration-menu__muted text-xs">Передвигайте бегунки. Выбранное значение показано справа.</p>
                <div className={'telegram-ai-monitor-status telegram-ai-monitor-status--' + (selected.enabled ? 'active' : 'paused') + ' space-y-2 rounded-2xl border p-4'}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="telegram-ai-monitor-status__headline flex items-center gap-2 text-sm font-semibold">
                      <span className="telegram-ai-monitor-status__indicator" aria-hidden="true"/>
                      {selected.enabled ? 'Мониторинг включён' : 'Мониторинг приостановлен'}
                    </span>
                    <span className="integration-menu__muted text-xs">Потрачено сегодня: {(selected.spentTodayMilli / 1000).toLocaleString('ru-RU',{maximumFractionDigits:3})} кр.</span>
                  </div>
                  <p className="integration-menu__muted text-xs">
                    {selected.lastCheckedAt ? 'Проверено: ' + formatDate(selected.lastCheckedAt) : 'Проверок ещё не было'}
                    {' · '}Всего израсходовано: {(selected.totalSpentMilli / 1000).toLocaleString('ru-RU',{maximumFractionDigits:3})} кр.
                  </p>
                  {selected.lastError && <p role="alert" className="telegram-integrations-modal__warning text-xs">{selected.lastError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={toggle} className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs font-semibold">
                      {selected.enabled ? 'Остановить мониторинг' : 'Включить мониторинг'}
                    </button>
                    <button type="button" disabled={busy || !selected.enabled} onClick={() => void action(async () => {
                      await api.mailCheck(selected.id); setNotice('Проверка запланирована.');
                    })} className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs font-semibold">Обновить сводку</button>
                    <button type="button" disabled={busy} onClick={() => void action(async () => {
                      const updated = await refresh(); const item = updated.find(x => x.id === selected.id); if (item) pick(item);
                    })} className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs">Обновить статус</button>
                  </div>
                  {selected.lastSummary && <details className="telegram-ai-monitor-summary rounded-xl border p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Последняя сводка {selected.lastSummaryAt ? '· ' + formatDate(selected.lastSummaryAt) : ''}</summary>
                    <p className="mt-3 text-sm leading-relaxed">{selected.lastSummary.summary}</p>
                    {(['decisions','obligations','risks'] as const).map(key => selected.lastSummary?.[key]?.length ?
                      <p key={key} className="mt-2 text-xs">{selected.lastSummary[key].join('; ')}</p> : null)}
                  </details>}
                </div>
                <form onSubmit={save} className="space-y-3">
                  <details key={selected.id+'-reply'} className="telegram-ai-settings-section telegram-ai-settings-section--conversation">
                    <summary className="telegram-ai-settings-section__header">
                      <span className="telegram-ai-settings-section__number">1</span><span className="telegram-ai-settings-section__header-copy"><span className="telegram-ai-settings-section__title">Ответы на письма</span><span className="telegram-ai-settings-section__description">Когда ассистент предлагает ответы или отправляет их автоматически</span></span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                      <SettingSlider title="Ответы на письма" description="Не отвечать, предлагать с подтверждением или отправлять автоматически"
                        index={MODES.indexOf(draft.replyMode)}
                        options={['Не отвечать','Предлагать ответы','Автоответы']}
                        shortLabels={['Не отвечать','Предлагать','Автоответы']}
                        onChange={i=>update('replyMode',MODES[i])}/>
                      {draft.replyMode !== 'OBSERVE' && <div className="telegram-ai-monitor-status space-y-3 rounded-2xl border p-3">
                        <p className="text-sm font-semibold">{draft.replyMode === 'SUGGEST' ? 'Правила предложений ответов' : 'Правила автоматических ответов'}</p>
                        <p className="integration-menu__muted text-xs">{draft.replyMode === 'SUGGEST'
                          ? 'ИИ предложит ответ в чате проекта «Почтовый ассистент». Отправка только после нажатия «Отправить».'
                          : 'Ответы могут отправляться из подключённого ящика без ручного подтверждения. Проверьте правила перед сохранением.'}</p>
                        <label className="block text-sm font-semibold">{draft.replyMode === 'SUGGEST' ? 'В каких случаях предлагать ответы' : 'В каких случаях ассистент отвечает'}
                          <textarea rows={3} maxLength={2000} className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 font-normal"
                            value={draft.replyMode === 'SUGGEST' ? draft.suggestWhen : draft.autoReplyWhen}
                            onChange={e=>update(draft.replyMode === 'SUGGEST'?'suggestWhen':'autoReplyWhen',e.target.value)}/>
                        </label>
                        <label className="block text-sm font-semibold">{draft.replyMode === 'SUGGEST' ? 'Формат предлагаемых ответов' : 'Формат автоматических ответов'}
                          <textarea rows={3} maxLength={2000} className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 font-normal"
                            value={draft.replyMode === 'SUGGEST' ? draft.suggestHow : draft.autoReplyHow}
                            onChange={e=>update(draft.replyMode === 'SUGGEST'?'suggestHow':'autoReplyHow',e.target.value)}/>
                        </label>
                        <TimeFrequencySlider key={selected.id+'-replyfreq'} title="Частота предложений ответов" description="«Сразу» означает проверку новых писем примерно раз в 15 секунд"
                          minutes={draft.replyIntervalMinutes} months={null} onChange={minutes=>update('replyIntervalMinutes',minutes)}/>
                      </div>}
                    </div>
                  </details>
                  <details key={selected.id+'-tasks'} className="telegram-ai-settings-section telegram-ai-settings-section--tasks">
                    <summary className="telegram-ai-settings-section__header"><span className="telegram-ai-settings-section__number">2</span>
                      <span className="telegram-ai-settings-section__header-copy"><span className="telegram-ai-settings-section__title">Добавление задач</span><span className="telegram-ai-settings-section__description">Предложения, автосоздание и частота проверки поручений</span></span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                      <SettingSlider title="Добавление задач" description="Что делать с договорённостями и поручениями"
                        index={TASK_MODES.indexOf(draft.taskMode)} options={['Не добавлять задачи','Предлагать задачи','Автодобавление задач']}
                        shortLabels={['Не добавлять','Предлагать','Автоматически']}
                        onChange={i=>update('taskMode',TASK_MODES[i])}/>
                      {draft.taskMode !== 'NONE' && <>
                        <label className="block text-sm font-semibold">В каких случаях создавать или предлагать задачи
                          <p className="integration-menu__muted mt-1 text-xs font-normal">Необязательно. При пустом поле ИИ определяет подходящие договорённости самостоятельно.</p>
                          <textarea rows={3} maxLength={2000} className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 font-normal"
                            value={draft.taskCreationWhen} onChange={e=>update('taskCreationWhen',e.target.value)}/>
                        </label>
                        <TimeFrequencySlider key={selected.id+'-taskfreq'} title="Частота добавления задач" description="Как часто проверять новые поручения"
                          minutes={draft.taskIntervalMinutes} months={null} onChange={minutes=>update('taskIntervalMinutes',minutes)}/>
                      </>}
                    </div>
                  </details>
                  <details key={selected.id+'-summaries'} className="telegram-ai-settings-section telegram-ai-settings-section--summaries">
                    <summary className="telegram-ai-settings-section__header"><span className="telegram-ai-settings-section__number">3</span>
                      <span className="telegram-ai-settings-section__header-copy"><span className="telegram-ai-settings-section__title">Частота сводок</span><span className="telegram-ai-settings-section__description">Когда собирать итоги переписки и что в них включать</span></span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                      <TimeFrequencySlider key={selected.id+'-sumfreq'} title="Частота сводок" description="«Сразу» означает проверку примерно раз в 15 секунд"
                        disabledOption minutes={draft.summaryIntervalMinutes} months={null}
                        onChange={minutes=>update('summaryIntervalMinutes',minutes)}/>
                      {draft.summaryIntervalMinutes !== -1 &&
                        <label className="block text-sm font-semibold">Какие именно сводки делать
                          <textarea rows={3} maxLength={2000} className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 font-normal"
                            value={draft.summaryInstructions} onChange={e=>update('summaryInstructions',e.target.value)}/>
                        </label>}
                    </div>
                  </details>
                  <details key={selected.id+'-general'} className="telegram-ai-settings-section telegram-ai-settings-section--general">
                    <summary className="telegram-ai-settings-section__header"><span className="telegram-ai-settings-section__number">4</span>
                      <span className="telegram-ai-settings-section__header-copy"><span className="telegram-ai-settings-section__title">Общие параметры</span><span className="telegram-ai-settings-section__description">Модель ИИ, дневной предел кредитов и уведомления</span></span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                      <label className="block text-sm font-semibold">Модель фонового мониторинга
                        <p className="integration-menu__muted mt-1 text-xs font-normal">Используется для анализа писем, сводок, ответов и задач.</p>
                        <select className="telegram-integrations-modal__input mt-2 w-full rounded-xl border px-3 py-2 font-normal"
                          value={draft.monitorModel} onChange={e=>update('monitorModel',e.target.value as MailAccountSettings['monitorModel'])}>
                          <option value="gpt-6-luna">GPT-6 Luna</option><option value="gpt-6.1-terra">GPT-6.1 Terra</option><option value="gpt-6.1-sol">GPT-6.1 Sol</option>
                        </select>
                      </label>
                      <CreditLimitSlider key={selected.id+'-credits'} value={draft.dailyCreditLimitMilli}
                        onChange={value=>update('dailyCreditLimitMilli',value)}/>
                      <p className="integration-menu__muted text-xs">Лимит касается только этого ящика. Используются кредиты общего баланса Планировыча.</p>
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.notifyImportant}
                        onChange={e=>update('notifyImportant',e.target.checked)} className="mt-1"/> Уведомлять о важных событиях и рисках</label>
                      <p className="integration-menu__muted text-xs">Содержимое вложений пока не поддерживается. Письма остаются в исходном ящике.</p>
                    </div>
                  </details>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button type="submit" disabled={busy || !available} className="integration-menu__action rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50">
                      {busy ? 'Сохранение...' : 'Сохранить изменения'}</button>
                    <button type="button" disabled={busy} onClick={remove} className="telegram-integrations-modal__danger rounded-xl border px-4 py-3 text-sm">
                      <Trash2 size={15} className="mr-1 inline"/> Удалить</button>
                  </div>
                </form>
              </div> : adding ? <div className="space-y-4">
                <h3 className="font-semibold">Подключить почту</h3>
                <div className="mail-assistant-provider-toggle">
                  {(['yandex','mailru'] as const).map(item => <button type="button" key={item}
                    className={provider === item ? 'active' : ''} onClick={()=>setProvider(item)}>{providerName(item)}</button>)}
                </div>
                <button type="button" className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs"
                  onClick={()=>setShowHelp(v=>!v)}>{showHelp ? 'Скрыть инструкцию' : 'Как подключить'}</button>
                {showHelp && <div className="integration-menu__instructions rounded-2xl border p-4 text-sm leading-relaxed">
                  <p className="font-semibold">Подключение {providerName(provider)}</p>
                  {provider === 'yandex'
                    ? <ol className="mt-2 list-inside list-decimal space-y-1"><li>Разрешите IMAP в настройках Яндекс Почты.</li><li>Создайте отдельный пароль приложения «Почта» в <a href="https://id.yandex.ru/security/app-passwords" target="_blank" rel="noopener noreferrer" className="underline">Яндекс ID</a>.</li><li>Введите адрес и созданный пароль ниже.</li></ol>
                    : <ol className="mt-2 list-inside list-decimal space-y-1"><li>В Mail.ru откройте Настройки → Безопасность → Пароли для внешних приложений.</li><li>Создайте пароль приложения для IMAP.</li><li>Введите адрес и созданный пароль ниже.</li></ol>}
                  <p className="integration-menu__muted mt-2 text-xs">{provider === 'yandex' ? 'imap.yandex.ru' : 'imap.mail.ru'} · SSL/TLS · порт 993</p>
                </div>}
                <form onSubmit={connect} className="space-y-3">
                  <label className="block text-sm font-semibold">Адрес почты
                    <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}
                      className="telegram-integrations-modal__input mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"
                      placeholder={provider === 'yandex' ? 'name@yandex.ru' : 'name@mail.ru'}/>
                  </label>
                  <label className="block text-sm font-semibold">Пароль приложения
                    <input required type="password" autoComplete="new-password" maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}
                      className="telegram-integrations-modal__input mt-2 w-full rounded-xl border px-3 py-2.5 font-normal"/>
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e=>update('enabled',e.target.checked)}/> Включить мониторинг после подключения</label>
                  <button type="submit" disabled={busy || !available || !email.trim() || !password}
                    className="integration-menu__action rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50">
                    {busy ? 'Проверяем подключение…' : 'Проверить и подключить'}</button>
                </form>
                <p className="integration-menu__muted text-xs">После подключения выберите ящик в верхнем списке для детальной настройки ответов, задач и сводок.</p>
              </div> : <div className="integration-menu__instructions rounded-2xl border p-5 text-sm">Выберите почтовый ящик. Открытие настроек не передаёт письма ИИ.</div>}
            </div>
            {error && <p role="alert" className="telegram-integrations-modal__warning mt-4 text-sm">{error}</p>}
            {notice && <p role="status" className="telegram-integrations-modal__success mt-4 text-sm">{notice}</p>}
          </>}
        </div>
      </section>
    </div>, document.body
  );
}
