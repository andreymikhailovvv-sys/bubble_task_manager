import { useEffect, useId, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Bot, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type TelegramAiChatPolicy, type TelegramAiChatSettings, type TelegramChatCapability, type TelegramSendTargetList } from '../lib/api';
import './TelegramIntegrationsMenu.css';

type Props = { onClose: () => void };

const MODES = ['OBSERVE', 'SUGGEST', 'AUTO'] as const;
const TASK_MODES = ['NONE', 'SUGGEST', 'AUTO'] as const;
const CHECK_INTERVALS = [5, 30, 180] as const;
const DAILY_LIMITS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, null] as const;

const DEFAULTS: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  taskMode: 'SUGGEST',
  checkIntervalMinutes: 30,
  dailyCreditLimitMilli: 50_000,
  instructions: '',
  notifyImportant: true
};
const kindName = (kind: string) => kind === 'user' ? 'Личный чат' : kind === 'group' ? 'Группа' : 'Супергруппа';

const MODE_NAMES = ['Наблюдение и сводки', 'Предлагать ответы', 'Автоответы'] as const;
const TASK_NAMES = ['Не добавлять задачи', 'Предлагать задачи', 'Автодобавление задач'] as const;
const CHECK_NAMES = ['Каждые 5 минут', 'Каждые 30 минут', 'Каждые 3 часа'] as const;
const CREDIT_NAMES = ['50', '100', '250', '500', '1 000', '2 500', '5 000', 'Без ограничения'] as const;

function indexOfValue<T>(options: readonly T[], value: T): number {
  const found = options.indexOf(value);
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
        <div className="telegram-ai-slider-setting__labels" aria-hidden="true">
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
      checkIntervalMinutes: existing.checkIntervalMinutes,
      dailyCreditLimitMilli: existing.dailyCreditLimitMilli,
      instructions: existing.instructions,
      notifyImportant: existing.notifyImportant
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

  const save = async () => {
    if (!selectedId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.telegramAssistantSavePolicy(selectedId, draft);
      const updated = await api.telegramAssistantPolicies();
      setPolicies(updated.policies);
      setNotice('Настройки сохранены. Мониторинг ещё не запущен.');
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
            <strong>Настройки без запуска</strong>
            <p className="integration-menu__muted mt-1 text-xs leading-relaxed">Сейчас вы задаёте правила. Мониторинг, автоответы и автосоздание задач пока выключены и потребуют отдельного включения после следующих обновлений.</p>
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
                  <span className="integration-menu__muted mt-1 block text-xs">{kindName(policy.chatKind)} · Не запущено</span>
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
                  <SettingSlider title="Режим работы" description="Как ассистент реагирует на сообщения"
                    index={indexOfValue(MODES, draft.mode)} options={MODE_NAMES}
                    shortLabels={['Наблюдение', 'Предлагать', 'Автоответы']}
                    onChange={i => update('mode', MODES[i] ?? MODES[0])}/>
                  <SettingSlider title="Добавление задач" description="Что делать с договорённостями и поручениями"
                    index={indexOfValue(TASK_MODES, draft.taskMode)} options={TASK_NAMES}
                    shortLabels={['Не добавлять', 'Предлагать', 'Автоматически']}
                    onChange={i => update('taskMode', TASK_MODES[i] ?? TASK_MODES[0])}/>
                  <SettingSlider title="Интенсивность проверки" description="Как часто проверять новые сообщения"
                    index={indexOfValue(CHECK_INTERVALS, draft.checkIntervalMinutes)} options={CHECK_NAMES}
                    shortLabels={['5 минут', '30 минут', '3 часа']}
                    onChange={i => update('checkIntervalMinutes', CHECK_INTERVALS[i] ?? CHECK_INTERVALS[0])}/>
                  <SettingSlider title="Дневной предел кредитов" description="Максимальный расход ИИ по этой переписке за день"
                    index={indexOfValue(DAILY_LIMITS, draft.dailyCreditLimitMilli)} options={CREDIT_NAMES}
                    onChange={i => update('dailyCreditLimitMilli', DAILY_LIMITS[i] ?? null)}/>
                  <p className="integration-menu__muted text-xs leading-relaxed">
                    «Без ограничения» отменяет только дневной предел для этого чата. Общий баланс кредитов и ограничения безопасности сохраняются. Реальное списание и контроль расходов появятся с мониторингом.
                  </p>
                  {(draft.mode === 'AUTO' || draft.taskMode === 'AUTO') && (
                    <p className="telegram-integrations-modal__warning text-xs">Автоматические действия ещё недоступны. Этот выбор только сохраняет желаемый режим и не разрешает ни отправку сообщений, ни создание задач.</p>
                  )}
                  <label className="block text-sm font-semibold">Инструкции ассистенту
                    <textarea rows={3} maxLength={3000} value={draft.instructions}
                      onChange={e => update('instructions', e.target.value)}
                      placeholder="Например: выделяй договорённости и сроки, не обещай скидки без моего разрешения."
                      className="telegram-integrations-modal__input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm font-normal"/>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.notifyImportant} onChange={e => update('notifyImportant', e.target.checked)} className="mt-1"/>
                    Уведомлять о важных событиях и рисках
                  </label>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button type="button" disabled={busy || !canConfigure}
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
