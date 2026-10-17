import { useEffect, useId, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bot, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type TelegramAiChatPolicy, type TelegramAiChatSettings, type TelegramChatCapability, type TelegramSendTargetList } from '../lib/api';
import './TelegramIntegrationsMenu.css';

type Props = { onClose: () => void };

const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE', 'SUGGEST', 'AUTO'] as const;
const CHECK_INTERVALS = [0, 5, 10, 30, 180, 360, 1440] as const;
const SUMMARY_INTERVALS = [-1, 5, 10, 30, 180, 360, 1440] as const;
const DAILY_LIMITS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null] as const;

const DEFAULTS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  taskMode: 'SUGGEST',
  interactionIntervalMinutes: 5,
  autoReplyIntervalMinutes: 5,
  summaryIntervalMinutes: 30,
  summaryInstructions: '',
  suggestWhen: '',
  suggestHow: '',
  monitorModel: 'gpt-6-luna',
  dailyCreditLimitMilli: 50_000,
   autoReplyWhen: '',
  autoReplyHow: '',
  notifyImportant: true,
  reviewAttachments: true
};
const kindName = (kind: string) => kind === 'user' ? 'Личный чат' : kind === 'group' ? 'Группа' : 'Супергруппа';

const MODE_NAMES = ['Не участвовать', 'Предлагать ответы', 'Автоответы'] as const;
const TASK_NAMES = ['Не добавлять задачи', 'Предлагать задачи', 'Автодобавление задач'] as const;
const CHECK_NAMES = ['Сразу', 'Каждые 5 минут', 'Каждые 10 минут', 'Каждые 30 минут', 'Каждые 3 часа', 'Каждые 6 часов', 'Каждые 24 часа'] as const;
const SUMMARY_NAMES = ['Не делать сводки', ...CHECK_NAMES.slice(1)] as const;
const CHECK_SHORT = ['Сразу', '5м', '10м', '30м', '3ч', '6ч', '24ч'] as const;
const SUMMARY_SHORT = ['Выкл.', '5м', '10м', '30м', '3ч', '6ч', '24ч'] as const;
const CREDIT_NAMES = ['50', '100', '250', '500', '1 000', '2 500', '5 000', 'Без ограничения'] as const;

function indexOfValue<T extends string | number | null>(options: readonly T[], value: string | number | null): number {
  const found = options.findIndex(option => option === value);
  return found < 0 ? 0 : found;
}

type SliderProps = {
  title: string;
  description: string;
  index: number;
  options: readonly string[];
  shortLabels?: readonly string[];
  onChange: (index: number) => void;
};

function SettingSlider({ title, description, index, options, shortLabels, onChange }: SliderProps) {
  const id = useId();
  const progress = options.length > 1 ? (index / (options.length - 1)) * 100 : 0;
  return (
    <div className="telegram-ai-slider-setting">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-semibold">{title}</label>
        <span className="telegram-ai-slider-setting__value" aria-live="polite">{options[index]}</span>
      </div>
      <p className="integration-menu__muted mt-1 text-xs">{description}</p>
      <input
        id={id} type="range" min={0} max={options.length - 1} step={1} value={index}
        className="telegram-ai-slider-setting__range"
        style={{ '--slider-progress': `${progress}%` } as CSSProperties}
        aria-valuetext={options[index]}
        onChange={event => onChange(Number(event.currentTarget.value))}
      />
      <div className="telegram-ai-slider-setting__marks" aria-hidden="true">
        {options.map((option, i) => (
          <span key={option} className={i <= index ? 'telegram-ai-slider-setting__mark--active' : ''}/>
        ))}
      </div>
      {shortLabels ? (
        <div className="telegram-ai-slider-setting__labels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${shortLabels.length}, minmax(0, 1fr))` }}>
          {shortLabels.map(label => <span key={label}>{label}</span>)}
        </div>
      ) : (
        <div className="telegram-ai-slider-setting__ends" aria-hidden="true">
          <span>50 кредитов</span><span>∞ без лимита</span>
        </div>
      )}
    </div>
  );
}

export function TelegramAiAssistantSettings({ onClose }: Props) {
  const [policies, setPolicies] = useState<TelegramAiChatPolicy[]>([]);
  const [capability, setCapability] = useState<TelegramChatCapability | null>(null);
  const [available, setAvailable] = useState<TelegramSendTargetList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TelegramAiChatSettings>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([api.telegramAssistantPolicies(), api.telegramChatCapability()])
      .then(([list, access]) => {
        if (!live) return;
        setPolicies(list.policies);
        setCapability(access);
      })
      .catch(err => { if (live) setError(err instanceof Error ? err.message : 'Не удалось открыть настройки'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api.telegramAssistantPolicies().then(data => setPolicies(data.policies)).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const canConfigure = Boolean(capability?.connected && capability?.readEnabled);
  const selected = policies.find(policy => policy.chatId === selectedId);
  const availableSelected = available?.dialogs.find(dialog => dialog.id === selectedId);
  const selectedName = selected?.chatTitle ?? availableSelected?.name ?? null;

  const pick = (id: string) => {
    setSelectedId(id);
    const existing = policies.find(policy => policy.chatId === id);
    setDraft(existing ? {
      mode: existing.mode,
      taskMode: existing.taskMode,
      interactionIntervalMinutes: existing.interactionIntervalMinutes ?? 5,
      autoReplyIntervalMinutes: existing.autoReplyIntervalMinutes ?? 5,
      summaryIntervalMinutes: existing.summaryIntervalMinutes ?? 30,
      summaryInstructions: existing.summaryInstructions ?? '',
      suggestWhen: existing.suggestWhen ?? '',
      suggestHow: existing.suggestHow ?? '',
      monitorModel: existing.monitorModel,
      dailyCreditLimitMilli: existing.dailyCreditLimitMilli,
       autoReplyWhen: existing.autoReplyWhen ?? '',
      autoReplyHow: existing.autoReplyHow ?? '',
      notifyImportant: existing.notifyImportant,
      reviewAttachments: existing.reviewAttachments !== false
    } : { ...DEFAULTS });
    setError('');
    setNotice('');
  };
  const update = <K extends keyof TelegramAiChatSettings>(key: K, value: TelegramAiChatSettings[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const loadChats = async () => {
    setLoadingChats(true); setError(''); setNotice('');
    try {
      const targets = await api.telegramChatSendTargets();
      setAvailable(targets);
      if (!selectedId && targets.dialogs.length > 0) {
        const first = targets.dialogs.find(dialog => !policies.some(p => p.chatId === dialog.id));
        if (first) pick(first.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить список чатов');
    } finally { setLoadingChats(false); }
  };

  const monitorAction = async (action: 'start' | 'stop' | 'summarize') => {
    if (!selectedId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'start') await api.telegramAssistantStart(selectedId);
      else if (action === 'stop') await api.telegramAssistantStop(selectedId);
      else await api.telegramAssistantSummarize(selectedId);
      const list = await api.telegramAssistantPolicies();
      setPolicies(list.policies);
      setNotice(action === 'start' ? 'Мониторинг включён. Новые сообщения будут проверяться по расписанию.' :
        action === 'stop' ? 'Мониторинг остановлен.' :
          'Запрошена сводка. Результат появится после обработки.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!selectedId || busy) return;
    if (draft.mode === 'SUGGEST' && (!draft.suggestWhen.trim() || !draft.suggestHow.trim())) {
      setError('Заполните оба поля для предложений ответов');
      return;
    }
    if (draft.mode === 'AUTO' && (!draft.autoReplyWhen.trim() || !draft.autoReplyHow.trim())) {
      setError('Заполните оба поля для автоответов');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      // The explicit Save/Add click also grants monitoring consent. Do not
      // require a second "Start" action after creating or editing a policy.
      await api.telegramAssistantSavePolicy(selectedId, draft);
      window.dispatchEvent(new Event('telegram-ai-assistant-updated'));
      try {
        await api.telegramAssistantStart(selectedId);
      } catch (startError) {
        const updated = await api.telegramAssistantPolicies();
        setPolicies(updated.policies);
        setError('Настройки сохранены, но включить мониторинг не удалось: ' +
          (startError instanceof Error ? startError.message : 'ошибка подключения Telegram') +
          '. Повторите включение кнопкой выше.');
        return;
      }
      const updated = await api.telegramAssistantPolicies();
      setPolicies(updated.policies);
      setNotice('Настройки сохранены. Мониторинг переписки включён.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!selectedId || !selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.telegramAssistantDeletePolicy(selectedId);
      setPolicies(current => current.filter(item => item.chatId !== selectedId));
      setSelectedId(null);
      setDraft({ ...DEFAULTS });
      window.dispatchEvent(new Event('telegram-ai-assistant-updated'));
      setNotice('Переписка удалена из настроек ассистента.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить профиль');
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="telegram-integrations-modal fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="ИИ-ассистент Telegram"
        className="telegram-integrations-modal__panel max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="telegram-integrations-modal__accent flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><Bot size={15}/> Интеграции</p>
            <h2 className="mt-1 text-xl font-bold">ИИ-ассистент в Telegram</h2>
            <p className="integration-menu__muted mt-1 text-sm">Настройки отдельно для каждого чата или группы.</p>
          </div>
          <button aria-label="Закрыть" type="button" className="integration-menu__icon-button rounded-xl p-2" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="integration-menu__instructions mt-4 flex items-start gap-2 rounded-2xl border p-3 text-sm">
          <ShieldCheck size={17} className="mt-0.5 shrink-0"/>
          <div>
            <strong>Контроль остаётся за вами</strong>
            <p className="integration-menu__muted mt-1 text-xs leading-relaxed">Мониторинг включается при сохранении настроек конкретного чата. ИИ анализирует новые сообщения, включая небольшие фотографии, PDF и текстовые вложения, и передаёт их OpenAI. Предложения ответов всегда требуют вашего подтверждения, а автоматическая отправка возможна только в режиме «Автоответы». Сводки и автосоздание задач настраиваются отдельно.</p>
          </div>
        </div>
        {loading && <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16}/> Загружаем настройки…</p>}
        {!loading && <>
          {!canConfigure && <p role="status" className="telegram-integrations-modal__warning mt-4 text-sm">Для выбора чатов сначала подключите личный Telegram в «Интеграции → Отправка в Telegram» и разрешите чтение на сервере.</p>}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <p className="text-sm font-semibold">Переписки ({policies.length}/25)</p>
              <button type="button" disabled={!canConfigure || loadingChats}
                className="integration-menu__action flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => void loadChats()}>
                {loadingChats ? <Loader2 size={15} className="animate-spin"/> : <Plus size={15}/>}
                {available ? 'Обновить список' : 'Выбрать переписку'}
              </button>
              {policies.map(policy => (
                <button key={policy.chatId} type="button" onClick={() => pick(policy.chatId)}
                  aria-pressed={selectedId === policy.chatId}
                  className={`telegram-ai-profile w-full rounded-xl border p-3 text-left text-sm ${selectedId === policy.chatId ? 'telegram-ai-profile--active' : ''}`}>
                  <span className="block truncate font-semibold">{policy.chatTitle}</span>
                  <span className="integration-menu__muted mt-1 block text-xs">{kindName(policy.chatKind)} · {policy.isEnabled ? 'Мониторинг включён' : 'Остановлен'}</span>
                </button>
              ))}
              {available && <>
                <label className="integration-menu__muted block text-xs" htmlFor="telegram-ai-chat-choice">Доступные чаты Telegram</label>
                <select id="telegram-ai-chat-choice" className="telegram-integrations-modal__input w-full rounded-xl border px-2 py-2 text-sm"
                  value={selectedId ?? ''} onChange={event => pick(event.target.value)}>
                  <option value="" disabled>Выберите переписку</option>
                  {available.dialogs.map(dialog => <option key={dialog.id} value={dialog.id}>{dialog.name} · {kindName(dialog.kind)}</option>)}
                </select>
                {available.limited && <p className="integration-menu__muted text-xs">Telegram вернул ограниченный список чатов.</p>}
              </>}
            </aside>
            <div className="min-w-0">
              {!selectedId ? (
                <div className="integration-menu__instructions rounded-2xl border p-5 text-sm">Выберите переписку. Открытие списка не передаёт её сообщения ИИ.</div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold">{selectedName ?? 'Выбранная переписка'}</h3>
                    <p className="integration-menu__muted mt-1 text-xs">Передвигайте бегунки. Выбранное значение показано справа.</p>
                  </div>
                  {selected && (
                    <div className="telegram-ai-monitor-status space-y-2 rounded-2xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{selected.isEnabled ? '● Мониторинг включён' : '○ Мониторинг остановлен'}</span>
                        <span className="integration-menu__muted text-xs">Потрачено сегодня: {(selected.spentTodayMilli / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кр.</span>
                      </div>
                      <p className="integration-menu__muted text-xs">
                        {selected.lastCheckedAt ? 'Проверено: ' + new Date(selected.lastCheckedAt).toLocaleString('ru-RU') : 'Проверок ещё не было'}
                        {' · '}Всего израсходовано: {(selected.totalSpentMilli / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кр.
                      </p>
                      {selected.lastError && <p role="status" className="telegram-integrations-modal__warning text-xs">{selected.lastError}</p>}
                      <div className="flex flex-wrap gap-2">
                        {selected.isEnabled ? (
                          <button type="button" disabled={busy} onClick={() => void monitorAction('stop')}
                            className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs font-semibold">Остановить мониторинг</button>
                        ) : (
                          <button type="button" disabled={busy || !canConfigure} onClick={() => void monitorAction('start')}
                            className="integration-menu__action rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50">Включить мониторинг</button>
                        )}
                        {selected.isEnabled && <button type="button" disabled={busy} onClick={() => void monitorAction('summarize')}
                          className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs font-semibold">Обновить сводку</button>}
                        <button type="button" disabled={busy} onClick={() => {
                          void api.telegramAssistantPolicies().then(data => setPolicies(data.policies)).catch(() => setError('Не удалось обновить данные'));
                        }} className="telegram-integrations-modal__secondary rounded-lg border px-3 py-2 text-xs">Обновить статус</button>
                      </div>
                      {!selected.isEnabled && <p className="integration-menu__muted text-xs">При сохранении настроек ассистент получит разрешение проверять новые сообщения этого конкретного чата и передавать их OpenAI для анализа. При обычной проверке старые сообщения автоматически не анализируются; кнопка «Обновить сводку» отдельно анализирует ограниченный фрагмент истории, включая поддерживаемые вложения.</p>}
                      {selected.lastSummary && (
                        <details className="telegram-ai-monitor-summary rounded-xl border p-3" open>
                          <summary className="cursor-pointer text-sm font-semibold">Последняя сводка {selected.lastSummaryAt ? '· ' + new Date(selected.lastSummaryAt).toLocaleString('ru-RU') : ''}</summary>
                          <p className="mt-3 text-sm leading-relaxed">{selected.lastSummary.summary}</p>
                          {([
                            ['Решения', selected.lastSummary.decisions],
                            ['Обязательства', selected.lastSummary.obligations],
                            ['Открытые вопросы', selected.lastSummary.openQuestions],
                            ['Риски', selected.lastSummary.risks],
                            ['Предложения задач', selected.lastSummary.taskSuggestions]
                          ] as const).filter(([, items]) => items.length).map(([heading, items]) => (
                            <div key={heading} className="mt-3">
                              <p className="text-xs font-semibold">{heading}</p>
                              <ul className="mt-1 list-inside list-disc space-y-1 text-xs">{items.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  )}
                  <SettingSlider title="Участие в переписке" description="Ассистент не участвует, предлагает ответ с подтверждением или отвечает автоматически"
                    index={indexOfValue(MODES, draft.mode)} options={MODE_NAMES}
                    shortLabels={['Не участвовать', 'Предлагать', 'Автоответы']}
                    onChange={i => update('mode', MODES[i] ?? MODES[0])}/>
                  {draft.mode === 'SUGGEST' && (
                    <div className="telegram-ai-monitor-status space-y-3 rounded-2xl border p-3">
                      <p className="text-sm font-semibold">Правила предложений ответов</p>
                      <p className="integration-menu__muted text-xs">Ассистент предложит текст в соответствующем чате проекта «Телеграм ассистент». Без вашего нажатия «Отправить» сообщение в Telegram не уйдёт.</p>
                      {!capability?.sendEnabled && <p className="telegram-integrations-modal__warning text-xs">Чтобы отправлять одобренные предложения, необходимо разрешить отправку Telegram в интеграциях.</p>}
                      <label className="block text-sm font-semibold">В каких случаях предлагать ответы
                        <textarea rows={3} maxLength={2000} required value={draft.suggestWhen}
                          onChange={event => update('suggestWhen', event.target.value)}
                          placeholder="Например: когда меня спрашивают о сроках или упоминают через @мой_ник."
                          className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                      </label>
                      <label className="block text-sm font-semibold">Формат предлагаемых ответов
                        <textarea rows={3} maxLength={2000} required value={draft.suggestHow}
                          onChange={event => update('suggestHow', event.target.value)}
                          placeholder="Например: коротко и вежливо от моего лица, без непроверенных обещаний."
                          className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                      </label>
                      <SettingSlider title="Частота предложений ответов" description="«Сразу» означает проверку при ближайшем цикле мониторинга"
                        index={indexOfValue(CHECK_INTERVALS, draft.interactionIntervalMinutes)}
                        options={CHECK_NAMES} shortLabels={CHECK_SHORT}
                        onChange={i => update('interactionIntervalMinutes', CHECK_INTERVALS[i] ?? CHECK_INTERVALS[0])}/>
                    </div>
                  )}
                  {draft.mode === 'AUTO' && (
                    <div className="telegram-ai-monitor-status space-y-3 rounded-2xl border p-3">
                      <p className="text-sm font-semibold">Правила автоматических ответов</p>
                      <p className="integration-menu__muted text-xs">Ответы отправляются от вашего имени в эту переписку только при выполнении заданных условий, без дополнительного подтверждения каждого сообщения. Укажите условия максимально конкретно.</p>
                      {!capability?.sendEnabled && <p className="telegram-integrations-modal__warning text-xs">Отправка Telegram недоступна. Проверьте разрешение на отправку в интеграциях и настройки сервера.</p>}
                      <label className="block text-sm font-semibold">В каких случаях ассистент отвечает
                        <textarea rows={3} maxLength={2000} required value={draft.autoReplyWhen}
                          onChange={event => update('autoReplyWhen', event.target.value)}
                          placeholder={'Например: отвечай, когда меня упоминают через @мой_ник и задают вопрос; или когда обсуждают сроки по проекту.'}
                          className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                      </label>
                      <label className="block text-sm font-semibold">Что именно должен отвечать ассистент
                        <textarea rows={3} maxLength={2000} required value={draft.autoReplyHow}
                          onChange={event => update('autoReplyHow', event.target.value)}
                          placeholder="Например: отвечай кратко и дружелюбно от моего лица; если спрашивают о сроках, сообщай, что я уточню их позже. Ничего не обещай без подтверждения."
                          className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                      </label>
                      <SettingSlider title="Частота автоответов" description="«Сразу» означает проверку при ближайшем цикле мониторинга"
                        index={indexOfValue(CHECK_INTERVALS, draft.autoReplyIntervalMinutes)}
                        options={CHECK_NAMES} shortLabels={CHECK_SHORT}
                        onChange={i => update('autoReplyIntervalMinutes', CHECK_INTERVALS[i] ?? CHECK_INTERVALS[0])}/>
                    </div>
                  )}
                  <SettingSlider title="Добавление задач" description="Что делать с договорённостями и поручениями"
                    index={indexOfValue(TASK_MODES, draft.taskMode)} options={TASK_NAMES}
                    shortLabels={['Не добавлять', 'Предлагать', 'Автоматически']}
                    onChange={i => update('taskMode', TASK_MODES[i] ?? TASK_MODES[0])}/>
                  <SettingSlider title="Частота сводок" description="Как часто ассистент составляет аналитические сводки переписки"
                    index={indexOfValue(SUMMARY_INTERVALS, draft.summaryIntervalMinutes)} options={SUMMARY_NAMES}
                    shortLabels={SUMMARY_SHORT}
                    onChange={i => update('summaryIntervalMinutes', SUMMARY_INTERVALS[i] ?? SUMMARY_INTERVALS[0])}/>
                  {draft.summaryIntervalMinutes !== -1 && (
                    <label className="block text-sm font-semibold">Какие именно сводки делать
                      <textarea rows={3} maxLength={2000} value={draft.summaryInstructions}
                        onChange={e => update('summaryInstructions', e.target.value)}
                        placeholder="Например: выделяй сроки, решения, договорённости и ответственных; не повторяй несущественное."
                        className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                    </label>
                  )}
                  <label className="block text-sm font-semibold">
                    Модель фонового мониторинга
                    <p className="integration-menu__muted mt-1 text-xs font-normal">Используется для фонового анализа, предложений ответов, автоответов, сводок и задач. Модель ручных запросов выбирается отдельно.</p>
                    <select className="telegram-integrations-modal__input mt-2 w-full rounded-xl border px-3 py-2 text-sm font-normal"
                      value={draft.monitorModel}
                      onChange={e => update('monitorModel', e.target.value as TelegramAiChatSettings['monitorModel'])}>
                      <option value="gpt-6-luna">GPT-6 Luna</option>
                      <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
                      <option value="gpt-6.1-sol">GPT-6.1 Sol</option>
                    </select>
                  </label>
                  <SettingSlider title="Дневной предел кредитов" description="Максимальный расход ИИ по этой переписке за день"
                    index={indexOfValue(DAILY_LIMITS, draft.dailyCreditLimitMilli)} options={CREDIT_NAMES}
                    onChange={i => update('dailyCreditLimitMilli', DAILY_LIMITS[i] ?? null)}/>
                  <p className="integration-menu__muted text-xs leading-relaxed">
                    «Без ограничения» отменяет только дневной предел для этого чата. Расходы учитываются по фактическим токенам модели и списываются из общего баланса. При нехватке кредитов новые анализы не выполняются.
                  </p>
                  {draft.taskMode === 'AUTO' && (
                    <p className="integration-menu__muted text-xs">Автодобавление задач работает по настройке «Добавление задач» и не зависит от автоответов.</p>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.notifyImportant} onChange={e => update('notifyImportant', e.target.checked)} className="mt-1"/>
                    Уведомлять о важных событиях и рисках
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.reviewAttachments} onChange={e => update('reviewAttachments', e.target.checked)} className="mt-1" />
                    <span><span className="block font-semibold">Просматривать вложения</span>
                      <span className="integration-menu__muted mt-1 block text-xs">Фото, PDF и поддерживаемые документы будут анализироваться ИИ. Это увеличивает расход кредитов. По умолчанию включено.</span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button type="button" disabled={busy || !canConfigure || (draft.mode === 'AUTO' && (!capability?.sendEnabled || !draft.autoReplyWhen.trim() || !draft.autoReplyHow.trim())) || (draft.mode === 'SUGGEST' && (!draft.suggestWhen.trim() || !draft.suggestHow.trim()))}
                      onClick={() => void save()}
                      className="integration-menu__action rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
                      {busy ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Добавить переписку'}
                    </button>
                    {selected && <button type="button" disabled={busy}
                      onClick={() => void remove()}
                      className="telegram-integrations-modal__danger flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"><Trash2 size={15}/> Удалить</button>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>}
        {error && <p role="alert" className="telegram-integrations-modal__warning mt-4 text-sm">{error}</p>}
        {notice && <p role="status" className="telegram-integrations-modal__success mt-4 flex items-center gap-1.5 text-sm"><CheckCircle2 size={15}/>{notice}</p>}
      </section>
    </div>, document.body
  );
}
