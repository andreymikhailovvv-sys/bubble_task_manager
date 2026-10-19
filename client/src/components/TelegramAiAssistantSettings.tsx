import { useEffect, useId, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, CheckCircle2, ChevronDown, Loader2, MessageCircle, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type TelegramAiChatPolicy, type TelegramAiChatSettings, type TelegramChatCapability, type TelegramSendTargetList } from '../lib/api';
import './TelegramIntegrationsMenu.css';
import './TelegramMessageQuickShare.css';

type Props = { onClose: () => void };

const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE', 'SUGGEST', 'AUTO'] as const;
const CHECK_INTERVALS = [0, 5, 10, 30, 180, 360, 1440] as const;
const SUMMARY_INTERVALS = [-1, 0, 5, 10, 30, 180, 360, 1440] as const;
const DAILY_LIMITS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null] as const;

const DEFAULTS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  taskMode: 'SUGGEST',
  taskCreationWhen: '',
  taskIntervalMinutes: 30,
  taskIntervalMonths: null,
  interactionIntervalMinutes: 5,
  autoReplyIntervalMinutes: 5,
  autoReplyIntervalMonths: null,
  summaryIntervalMinutes: 30,
  summaryIntervalMonths: null,
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
const SUMMARY_NAMES = ['Не делать сводки', ...CHECK_NAMES] as const;
const CHECK_SHORT = ['Сразу', '5м', '10м', '30м', '3ч', '6ч', '24ч'] as const;
const SUMMARY_SHORT = ['Выкл.', 'Сразу', '5м', '10м', '30м', '3ч', '6ч', '24ч'] as const;
const CREDIT_NAMES = ['50', '100', '250', '500', '1 000', '2 500', '5 000', 'Без ограничения'] as const;
const CUSTOM_OPTION = 'Своё';
const CUSTOM_MAX_MINUTES = 5_256_000;
const CUSTOM_MAX_MONTHS = 120;
const CUSTOM_MAX_CREDITS = 100_000;
type TimeUnit = 'minutes' | 'hours' | 'days' | 'months';
const TIME_UNITS: Array<{ value: TimeUnit; label: string; multiplier: number }> = [
  { value: 'minutes', label: 'мин', multiplier: 1 },
  { value: 'hours', label: 'часы', multiplier: 60 },
  { value: 'days', label: 'дни', multiplier: 1440 },
  { value: 'months', label: 'месяцы', multiplier: 43_200 }
];
function unitForInterval(minutes: number, months: number | null): TimeUnit {
  if (months !== null) return 'months';
  if (minutes > 0 && minutes % 1440 === 0) return 'days';
  if (minutes > 0 && minutes % 60 === 0) return 'hours';
  return 'minutes';
}
function numberForInterval(minutes: number, months: number | null, unit: TimeUnit): number {
  return unit === 'months' ? months ?? 1 : Math.max(1, minutes / (TIME_UNITS.find(v => v.value === unit)?.multiplier ?? 1));
}

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
          <span key={option} style={{ left: `${i / Math.max(1, options.length - 1) * 100}%` }}
            className={i <= index ? 'telegram-ai-slider-setting__mark--active' : ''}/>
        ))}
      </div>
      {shortLabels ? (
        <div className="telegram-ai-slider-setting__labels" aria-hidden="true">
          {shortLabels.map((label, i) => <span key={label}
            style={{ left: `${i / Math.max(1, shortLabels.length - 1) * 100}%` }}>{label}</span>)}
        </div>
      ) : (
        <div className="telegram-ai-slider-setting__ends" aria-hidden="true">
          <span>50 кредитов</span><span>∞ без лимита</span>
        </div>
      )}
    </div>
  );
}

type TimeFrequencySliderProps = {
  title: string; description: string; minutes: number; months: number | null;
  disabledOption?: boolean; onChange: (minutes: number, months: number | null) => void;
};
function TimeFrequencySlider({ title, description, minutes, months, disabledOption = false, onChange }: TimeFrequencySliderProps) {
  const fixed = disabledOption ? SUMMARY_INTERVALS : CHECK_INTERVALS;
  const names: string[] = disabledOption ? [...SUMMARY_NAMES, CUSTOM_OPTION] : [...CHECK_NAMES, CUSTOM_OPTION];
  const labels: string[] = disabledOption ? [...SUMMARY_SHORT, CUSTOM_OPTION] : [...CHECK_SHORT, CUSTOM_OPTION];
  const selected = months == null ? fixed.findIndex(v => v === minutes) : -1;
  const [editingCustom, setEditingCustom] = useState(false);
  const custom = selected === -1 || editingCustom;
  const [unit, setUnit] = useState<TimeUnit>(() => unitForInterval(minutes, months));
  const [entry, setEntry] = useState(() => String(numberForInterval(minutes, months, unitForInterval(minutes, months))));
  const apply = (raw: string, nextUnit: TimeUnit) => {
    setEntry(raw); setUnit(nextUnit);
    const amount = Number(raw.replace(',', '.'));
    const multiplier = TIME_UNITS.find(v => v.value === nextUnit)?.multiplier ?? 1;
    if (!Number.isSafeInteger(amount) || amount < 1 || (nextUnit === 'months'
      ? amount > CUSTOM_MAX_MONTHS : amount * multiplier > CUSTOM_MAX_MINUTES)) return;
    if (nextUnit === 'months') onChange(amount * 43_200, amount);
    else onChange(amount * multiplier, null);
  };
  return <div className="telegram-ai-custom-control">
    <SettingSlider title={title} description={description} options={names} shortLabels={labels}
      index={custom ? fixed.length : selected}
      onChange={index => {
        if (index === fixed.length) {
          setEditingCustom(true);
          if (!custom) apply('1', 'minutes');
        } else {
          setEditingCustom(false);
          onChange(fixed[index] ?? fixed[0], null);
        }
      }} />
    {custom && <div className="telegram-ai-custom-input" role="group" aria-label={title + ': своё значение'}>
      <label className="text-xs font-semibold">Интервал
        <input className="telegram-integrations-modal__input mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          aria-label={title + ': число'} type="number" min={1}
          max={unit === 'months' ? CUSTOM_MAX_MONTHS : CUSTOM_MAX_MINUTES}
          step={1} value={entry} onChange={event => apply(event.target.value, unit)}/>
      </label>
      <label className="text-xs font-semibold">Единица
        <select className="telegram-integrations-modal__input mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          aria-label={title + ': единица'} value={unit}
          onChange={event => {
            const next = event.target.value as TimeUnit;
            const preset = unit === 'months' ? (months ?? 1) * 43_200 : minutes;
            const multiplier = TIME_UNITS.find(v => v.value === next)?.multiplier ?? 1;
            apply(String(Math.max(1, Math.round(preset / multiplier))), next);
          }}>
          {TIME_UNITS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <p className="integration-menu__muted col-span-full text-xs">Месяцы считаются по календарю. Для коротких месяцев выбирается последний доступный день.</p>
    </div>}
  </div>;
}
function CreditLimitSlider({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const preset = DAILY_LIMITS.findIndex(v => v === value);
  const [editingCustom, setEditingCustom] = useState(false);
  const custom = preset < 0 || editingCustom;
  const [entry, setEntry] = useState(String(custom && value != null ? value / 1000 : 25));
  const apply = (raw: string) => {
    setEntry(raw);
    const amount = Number(raw.replace(',', '.'));
    const milli = Math.round(amount * 1000);
    if (!Number.isFinite(amount) || amount < 0.001 || amount > CUSTOM_MAX_CREDITS ||
        !Number.isSafeInteger(milli) || Math.abs(milli / 1000 - amount) > 0.000001) return;
    onChange(milli);
  };
  return <div className="telegram-ai-custom-control">
    <SettingSlider title="Дневной предел кредитов" description="Максимальный расход ИИ по этой переписке за день"
      index={custom ? DAILY_LIMITS.length : preset}
      options={[...CREDIT_NAMES, CUSTOM_OPTION]}
      shortLabels={[...CREDIT_NAMES.map(s => s === 'Без ограничения' ? '∞' : s.replace(/ /g, '')), CUSTOM_OPTION]}
      onChange={index => {
        if (index === DAILY_LIMITS.length) {
          setEditingCustom(true);
          if (!custom) apply('25');
        } else {
          setEditingCustom(false);
          onChange(DAILY_LIMITS[index] ?? null);
        }
      }}/>
    {custom && <div className="telegram-ai-custom-input telegram-ai-custom-input--credits">
      <label className="text-xs font-semibold">Кредитов в день
        <input className="telegram-integrations-modal__input mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          type="number" min={0.001} max={CUSTOM_MAX_CREDITS} step={0.001}
          value={entry} onChange={event => apply(event.target.value)}
          aria-label="Своё количество кредитов" />
      </label>
      <p className="integration-menu__muted text-xs">От 0,001 до 100 000 кредитов.</p>
    </div>}
  </div>;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerChoice, setPickerChoice] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState('');
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pickerOpen) {
        if (!pickerBusy) setPickerOpen(false);
      } else onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, pickerOpen, pickerBusy]);

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
      taskCreationWhen: existing.taskCreationWhen ?? '',
      taskIntervalMinutes: existing.taskIntervalMinutes ?? 30,
      taskIntervalMonths: existing.taskIntervalMonths ?? null,
      interactionIntervalMinutes: existing.interactionIntervalMinutes ?? 5,
      autoReplyIntervalMinutes: existing.autoReplyIntervalMinutes ?? 5,
      autoReplyIntervalMonths: existing.autoReplyIntervalMonths ?? null,
      summaryIntervalMinutes: existing.summaryIntervalMinutes ?? 30,
      summaryIntervalMonths: existing.summaryIntervalMonths ?? null,
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
    if (!canConfigure || policies.length >= 25) return;
    setPickerOpen(true); setPickerError(''); setPickerChoice(null); setPickerSearch('');
    setAvailable(null);
    setLoadingChats(true);
    try { setAvailable(await api.telegramChatSendTargets()); }
    catch (err) { setPickerError(err instanceof Error ? err.message : 'Не удалось загрузить переписки'); }
    finally { setLoadingChats(false); }
  };

  const addAssistant = async () => {
    if (!pickerChoice || pickerBusy || policies.some(p => p.chatId === pickerChoice)) return;
    setPickerBusy(true); setPickerError('');
    try {
      // The add button is an explicit opt-in. Use the same save+start path
      // as the existing settings form, not an unsaved placeholder profile.
      await api.telegramAssistantSavePolicy(pickerChoice, { ...DEFAULTS });
      try {
        await api.telegramAssistantStart(pickerChoice);
      } catch (startError) {
        const updated = await api.telegramAssistantPolicies();
        setPolicies(updated.policies);
        pick(pickerChoice);
        setPickerOpen(false);
        setError('Ассистент добавлен, но мониторинг не включён: ' +
          (startError instanceof Error ? startError.message : 'ошибка Telegram'));
        return;
      }
      const updated = await api.telegramAssistantPolicies();
      setPolicies(updated.policies);
      pick(pickerChoice);
      setPickerOpen(false);
      setNotice('Ассистент добавлен. Настройки можно изменить ниже.');
      window.dispatchEvent(new Event('telegram-ai-assistant-updated'));
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Не удалось добавить ассистента');
    } finally { setPickerBusy(false); }
  };
  const pickerDialogs = (available?.dialogs ?? [])
    .filter(dialog => !policies.some(p => p.chatId === dialog.id))
    .filter(dialog => (dialog.name + ' ' + (dialog.username ?? '')).toLocaleLowerCase('ru-RU')
      .includes(pickerSearch.trim().toLocaleLowerCase('ru-RU')));
  // Do not alphabetize. Telegram sends dialogs by recent activity, and
  // this is the same order as the existing forwarding dialog.

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

  return <>
    {createPortal(
    <div className="telegram-integrations-modal fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="ИИ-ассистент Telegram"
        className="telegram-integrations-modal__panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="telegram-ai-settings-scroll min-h-0 overflow-y-auto px-5 py-5">
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
          <div className="mt-5 space-y-5">
            <nav aria-label="Ассистенты по перепискам" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold">Переписки ({policies.length}/25)</p>
                <p className="integration-menu__muted text-xs">Выберите ассистента для настройки</p>
              </div>
              <div className="telegram-ai-profile-list">
                {policies.map(policy => (
                  <button key={policy.chatId} type="button" onClick={() => pick(policy.chatId)}
                    aria-pressed={selectedId === policy.chatId}
                    className={`telegram-ai-profile telegram-ai-profile--tag min-w-0 rounded-xl border px-4 py-3 text-left text-sm ${selectedId === policy.chatId ? 'telegram-ai-profile--active' : ''}`}>
                    <span className="block truncate font-semibold">{policy.chatTitle}</span>
                    <span className="integration-menu__muted mt-1 block truncate text-xs">{kindName(policy.chatKind)} · {policy.isEnabled ? 'Мониторинг включён' : 'Остановлен'}</span>
                  </button>
                ))}
                <button type="button" disabled={!canConfigure || loadingChats || policies.length >= 25}
                  className="telegram-ai-add-profile inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  onClick={() => void loadChats()}>
                  <Plus size={17} /> Добавить переписку
                </button>
              </div>
            </nav>
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
                    <div role="status" aria-live="polite"
                      className={`telegram-ai-monitor-status telegram-ai-monitor-status--${selected.isEnabled ? 'active' : 'paused'} space-y-2 rounded-2xl border p-4`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="telegram-ai-monitor-status__headline flex items-center gap-2 text-sm font-semibold">
                          <span className="telegram-ai-monitor-status__indicator" aria-hidden="true"/>
                          {selected.isEnabled ? 'Мониторинг включён' : 'Мониторинг приостановлен'}
                        </span>
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
                        <details className="telegram-ai-monitor-summary rounded-xl border p-3">
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
                              <ul className="mt-1 list-inside list-disc space-y-1 text-xs">{items.map((item, idx) => <li key={idx}>{typeof item === 'string' ? item : item.title || 'Действие над задачей'}</li>)}</ul>
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  )}
                  <details key={`${selectedId}-conversation`} className="telegram-ai-settings-section telegram-ai-settings-section--conversation" aria-label="Настройки участия в переписке">
                    <summary className="telegram-ai-settings-section__header">
                      <span className="telegram-ai-settings-section__header-copy">
                        <span className="telegram-ai-settings-section__title">Участие в переписке</span>
                        <span className="telegram-ai-settings-section__description">Когда ассистент предлагает ответы или отправляет их автоматически</span>
                      </span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron" aria-hidden="true"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
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
                      <SettingSlider title="Частота предложений ответов" description="«Сразу» означает проверку примерно раз в 15 секунд"
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
                      <TimeFrequencySlider key={selectedId + '-reply'} title="Частота автоответов" description="«Сразу» означает проверку примерно раз в 15 секунд"
                        minutes={draft.autoReplyIntervalMinutes} months={draft.autoReplyIntervalMonths}
                        onChange={(minutes, months) => setDraft(current => ({
                          ...current, autoReplyIntervalMinutes: minutes, autoReplyIntervalMonths: months
                        }))}/>
                    </div>
                  )}
                    </div>
                  </details>
                  <details key={`${selectedId}-tasks`} className="telegram-ai-settings-section telegram-ai-settings-section--tasks" aria-label="Настройки добавления задач">
                    <summary className="telegram-ai-settings-section__header">
                      <span className="telegram-ai-settings-section__header-copy">
                        <span className="telegram-ai-settings-section__title">Добавление задач</span>
                        <span className="telegram-ai-settings-section__description">Предложения, автосоздание и частота проверки новых поручений</span>
                      </span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron" aria-hidden="true"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                  <SettingSlider title="Добавление задач" description="Что делать с договорённостями и поручениями"
                    index={indexOfValue(TASK_MODES, draft.taskMode)} options={TASK_NAMES}
                    shortLabels={['Не добавлять', 'Предлагать', 'Автоматически']}
                    onChange={i => update('taskMode', TASK_MODES[i] ?? TASK_MODES[0])}/>
                  {draft.taskMode !== 'NONE' ? (
                    <label className="block text-sm font-semibold">
                      В каких случаях создавать или предлагать задачи
                      <p className="integration-menu__muted mt-1 text-xs font-normal">
                        Необязательно. Если поле пустое, ассистент сам определяет, какие договорённости и поручения заслуживают задачи.
                      </p>
                      <textarea rows={3} maxLength={2000}
                        value={draft.taskCreationWhen}
                        onChange={event => update('taskCreationWhen', event.target.value)}
                        placeholder="Например: только когда меня прямо просят что-то сделать или мы согласовали встречу. Не создавать задачи из общих обсуждений."
                        className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal" />
                    </label>
                  ) : null}
                  {draft.taskMode !== 'NONE' && (
                    <TimeFrequencySlider key={selectedId + '-tasks'} title="Частота добавления задач" description="Как часто искать новые поручения и договорённости. «Сразу» означает проверку примерно раз в 15 секунд"
                      minutes={draft.taskIntervalMinutes} months={draft.taskIntervalMonths}
                      onChange={(minutes, months) => setDraft(current => ({
                        ...current, taskIntervalMinutes: minutes, taskIntervalMonths: months
                      }))}/>
                  )}
                  {draft.taskMode === 'AUTO' && (
                    <p className="integration-menu__muted text-xs">Автодобавление задач работает по настройке «Добавление задач» и не зависит от автоответов.</p>
                  )}
                    </div>
                  </details>
                  <details key={`${selectedId}-summaries`} className="telegram-ai-settings-section telegram-ai-settings-section--summaries" aria-label="Настройки сводок">
                    <summary className="telegram-ai-settings-section__header">
                      <span className="telegram-ai-settings-section__header-copy">
                        <span className="telegram-ai-settings-section__title">Частота сводок</span>
                        <span className="telegram-ai-settings-section__description">Когда собирать итоги переписки и что в них включать</span>
                      </span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron" aria-hidden="true"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
                  <TimeFrequencySlider key={selectedId + '-summary'} title="Частота сводок" description="Как часто ассистент составляет аналитические сводки переписки. «Сразу» — проверка примерно раз в 15 секунд"
                    disabledOption minutes={draft.summaryIntervalMinutes} months={draft.summaryIntervalMonths}
                    onChange={(minutes, months) => setDraft(current => ({
                      ...current, summaryIntervalMinutes: minutes, summaryIntervalMonths: months
                    }))}/>
                  {draft.summaryIntervalMinutes !== -1 && (
                    <label className="block text-sm font-semibold">Какие именно сводки делать
                      <textarea rows={3} maxLength={2000} value={draft.summaryInstructions}
                        onChange={e => update('summaryInstructions', e.target.value)}
                        placeholder="Например: выделяй сроки, решения, договорённости и ответственных; не повторяй несущественное."
                        className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                    </label>
                  )}
                    </div>
                  </details>
                  <details key={`${selectedId}-general`} className="telegram-ai-settings-section telegram-ai-settings-section--general" aria-label="Общие параметры ассистента">
                    <summary className="telegram-ai-settings-section__header">
                      <span className="telegram-ai-settings-section__header-copy">
                        <span className="telegram-ai-settings-section__title">Общие параметры</span>
                        <span className="telegram-ai-settings-section__description">Модель ИИ, дневной предел кредитов и уведомления</span>
                      </span>
                      <ChevronDown size={19} className="telegram-ai-settings-section__chevron" aria-hidden="true"/>
                    </summary>
                    <div className="telegram-ai-settings-section__content">
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
                  <CreditLimitSlider key={selectedId + '-credits'} value={draft.dailyCreditLimitMilli}
                    onChange={value => update('dailyCreditLimitMilli', value)}/>
                  <p className="integration-menu__muted text-xs leading-relaxed">
                    «Без ограничения» отменяет только дневной предел для этого чата. Расходы учитываются по фактическим токенам модели и списываются из общего баланса. При нехватке кредитов новые анализы не выполняются.
                  </p>
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
                    </div>
                  </details>
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
        </div>
      </section>
    </div>, document.body)}
    {pickerOpen && createPortal(
      <div className="telegram-quick-share fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
        onClick={event => { event.stopPropagation(); if (!pickerBusy) setPickerOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Выбрать переписку для Telegram-ассистента"
          className="telegram-quick-share__dialog flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border shadow-2xl"
          onClick={event => event.stopPropagation()}>
          <header className="telegram-quick-share__header flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle size={18} className="text-sky-400"/> Выбрать переписку
            </h3>
            <button type="button" aria-label="Закрыть выбор переписки" disabled={pickerBusy}
              onClick={() => setPickerOpen(false)} className="telegram-quick-share__close rounded-xl p-2 disabled:opacity-40">
              <X size={17}/>
            </button>
          </header>
          <div className="min-h-0 flex flex-col gap-3 overflow-hidden p-4">
            <label className="telegram-quick-share__search flex shrink-0 items-center gap-2 rounded-xl border px-3">
              <Search size={16} className="text-slate-400"/>
              <input autoFocus value={pickerSearch} onChange={event => setPickerSearch(event.target.value)}
                placeholder="Поиск человека или беседы" aria-label="Поиск по перепискам Telegram"
                className="telegram-quick-share__search-input min-w-0 w-full bg-transparent py-3 text-sm outline-none"/>
            </label>
            <p className="telegram-quick-share__muted shrink-0 text-xs">Переписки в порядке активности Telegram</p>
            <div className="telegram-quick-share__recipients min-h-0 flex-1 space-y-1 overflow-y-auto">
              {loadingChats ? <p role="status" className="telegram-quick-share__muted flex items-center gap-2 p-3 text-sm"><Loader2 size={16} className="animate-spin"/> Загружаем чаты…</p> : null}
              {!loadingChats && pickerDialogs.map(dialog => (
                <button type="button" key={dialog.id} onClick={() => setPickerChoice(dialog.id)}
                  aria-pressed={pickerChoice === dialog.id}
                  className="telegram-quick-share__recipient flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm">
                  <span className={`telegram-quick-share__check flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${pickerChoice === dialog.id ? 'telegram-quick-share__check--selected' : ''}`}>
                    {pickerChoice === dialog.id ? <Check size={13}/> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {dialog.name}
                    <span className="telegram-quick-share__muted block truncate text-[11px]">
                      {kindName(dialog.kind)}{dialog.username ? ' · ' + dialog.username : ''}
                    </span>
                  </span>
                </button>
              ))}
              {!loadingChats && pickerDialogs.length === 0 && <p className="telegram-quick-share__muted p-3 text-sm">Подходящих переписок не найдено.</p>}
            </div>
            {available?.limited && <p className="telegram-quick-share__muted shrink-0 text-xs">Telegram вернул ограниченный список чатов.</p>}
            {pickerError && <p role="alert" className="telegram-quick-share__error shrink-0 rounded-xl border p-3 text-xs">{pickerError}</p>}
            <button type="button" disabled={!pickerChoice || loadingChats || pickerBusy} onClick={() => void addAssistant()}
              className="telegram-quick-share__primary shrink-0 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40">
              {pickerBusy ? 'Добавляем…' : 'Добавить ассистента'}
            </button>
          </div>
        </section>
      </div>, document.body)}
    </>;
}
