import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, type TelegramAiChatPolicy, type TelegramAiChatSettings, type TelegramChatCapability, type TelegramSendTargetList } from '../lib/api';
import './TelegramIntegrationsMenu.css';

type Props = { onClose: () => void };
const defaults: TelegramAiChatSettings = {
  mode: 'OBSERVE',
  analysisLevel: 'IMPORTANT',
  checkIntervalMinutes: 15,
  maxMessagesPerCheck: 20,
  summaryFrequency: 'DAILY',
  instructions: '',
  notifyImportant: true,
  suggestTasks: true,
  dailyCreditLimitMilli: 2000,
  monthlyCreditLimitMilli: 20000
};
const kindName = (kind: string) => kind === 'user' ? 'Личный чат' : kind === 'group' ? 'Группа' : 'Супергруппа';

export function TelegramAiAssistantSettings({ onClose }: Props) {
  const [policies, setPolicies] = useState<TelegramAiChatPolicy[]>([]);
  const [capability, setCapability] = useState<TelegramChatCapability | null>(null);
  const [available, setAvailable] = useState<TelegramSendTargetList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TelegramAiChatSettings>({ ...defaults });
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
      analysisLevel: existing.analysisLevel,
      checkIntervalMinutes: existing.checkIntervalMinutes,
      maxMessagesPerCheck: existing.maxMessagesPerCheck,
      summaryFrequency: existing.summaryFrequency,
      instructions: existing.instructions,
      notifyImportant: existing.notifyImportant,
      suggestTasks: existing.suggestTasks,
      dailyCreditLimitMilli: existing.dailyCreditLimitMilli,
      monthlyCreditLimitMilli: existing.monthlyCreditLimitMilli
    } : { ...defaults });
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
      setNotice('Профиль сохранён. Фоновый мониторинг пока не активирован.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selectedId || !selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.telegramAssistantDeletePolicy(selectedId);
      setPolicies(policies.filter(item => item.chatId !== selectedId));
      setSelectedId(null);
      setDraft({ ...defaults });
      setNotice('Переписка удалена из настроек ассистента.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить профиль');
    } finally { setBusy(false); }
  };
  const creditInput = (key: 'dailyCreditLimitMilli' | 'monthlyCreditLimitMilli', max: number) => (
    <input className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2 text-sm"
      type="number" min="0" max={max} step="1"
      value={draft[key] / 1000}
      onChange={event => update(key, Math.round(Number(event.target.value) || 0) * 1000)} />
  );

  return createPortal(
    <div className="telegram-integrations-modal fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="ИИ-ассистент Telegram"
        className="telegram-integrations-modal__panel max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="telegram-integrations-modal__accent flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"><Bot size={15}/> Интеграции</p>
            <h2 className="mt-1 text-xl font-bold">ИИ-ассистент в Telegram</h2>
            <p className="integration-menu__muted mt-1 text-sm">Индивидуальные правила для клиентов, коллег и рабочих групп.</p>
          </div>
          <button aria-label="Закрыть" type="button" className="integration-menu__icon-button rounded-xl p-2" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="integration-menu__instructions mt-4 rounded-2xl border p-3 text-sm">
          <div className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0"/>
            <div><strong>Этап 1: настройка без запуска.</strong>
              <p className="integration-menu__muted mt-1 text-xs leading-relaxed">Сохранение профиля не даёт ИИ доступ к сообщениям. Мониторинг и сводки появятся на следующем этапе, автоответы на третьем. Для их включения потребуется отдельное действие. Сейчас кредиты за фоновую работу не списываются.</p>
            </div>
          </div>
        </div>
        {loading && <p className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={16}/> Загружаем настройки…</p>}
        {!loading && <>
          {!canConfigure && <p role="status" className="telegram-integrations-modal__warning mt-4 text-sm">Сначала подключите личный Telegram в разделе «Интеграции → Отправка в Telegram». Для выбора переписок на сервере должно быть разрешено чтение.</p>}
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Переписки ({policies.length}/25)</p>
              </div>
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
                {available.limited && <p className="integration-menu__muted text-xs">Telegram вернул ограниченный список последних чатов.</p>}
              </>}
            </aside>
            <div>
              {!selectedId ? (
                <div className="integration-menu__instructions rounded-2xl border p-5 text-sm">
                  Выберите переписку. ИИ не получит её историю только от открытия списка.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold">{selectedName ?? 'Выбранная переписка'}</h3>
                    <p className="integration-menu__muted mt-1 text-xs">Режим и ограничения задаются отдельно для этого чата.</p>
                  </div>
                  <label className="block text-sm font-medium">Режим работы
                    <select value={draft.mode} onChange={e => update('mode', e.target.value as TelegramAiChatSettings['mode'])}
                      className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2">
                      <option value="OBSERVE">Наблюдение и сводки</option>
                      <option value="SUGGEST">Предлагать ответы для подтверждения</option>
                      <option value="AUTO">Автоответы по правилам (этап 3)</option>
                    </select>
                  </label>
                  {draft.mode === 'AUTO' && <p className="telegram-integrations-modal__warning text-xs">Выбор режима не разрешает автоматические отправки. Отдельное подтверждение и лимиты автоответов появятся на этапе 3.</p>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm">Глубина анализа
                      <select value={draft.analysisLevel} onChange={e => update('analysisLevel', e.target.value as TelegramAiChatSettings['analysisLevel'])}
                        className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2">
                        <option value="IMPORTANT">Только важное · экономно</option>
                        <option value="STANDARD">Стандартный анализ</option>
                        <option value="DETAILED">Подробный анализ</option>
                      </select>
                    </label>
                    <label className="block text-sm">Проверять каждые
                      <select value={draft.checkIntervalMinutes} onChange={e => update('checkIntervalMinutes', Number(e.target.value))}
                        className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2">
                        {[5, 15, 30, 60].map(value => <option key={value} value={value}>{value} минут</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">Сообщений за проверку
                      <select value={draft.maxMessagesPerCheck} onChange={e => update('maxMessagesPerCheck', Number(e.target.value))}
                        className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2">
                        {[10, 20, 30, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">Автоматические сводки
                      <select value={draft.summaryFrequency} onChange={e => update('summaryFrequency', e.target.value as TelegramAiChatSettings['summaryFrequency'])}
                        className="telegram-integrations-modal__input mt-1 w-full rounded-xl border px-3 py-2">
                        <option value="OFF">Только по запросу</option>
                        <option value="DAILY">Ежедневно</option>
                        <option value="WEEKLY">Еженедельно</option>
                      </select>
                    </label>
                    <label className="block text-sm">Дневной предел · кредиты
                      {creditInput('dailyCreditLimitMilli', 200)}
                    </label>
                    <label className="block text-sm">Месячный предел · кредиты
                      {creditInput('monthlyCreditLimitMilli', 1000)}
                    </label>
                  </div>
                  <p className="integration-menu__muted text-xs">Это жёсткие лимиты для будущей фоновой ИИ-обработки этого чата, не пополнение баланса. Значение 0 запрещает расход. Расходы и остановка при достижении лимита будут реализованы вместе с мониторингом.</p>
                  <label className="block text-sm font-medium">Инструкции ассистенту
                    <textarea rows={3} maxLength={3000} value={draft.instructions}
                      onChange={e => update('instructions', e.target.value)}
                      placeholder="Например: выделяй запросы клиента, договорённости и сроки; не обещай скидок."
                      className="telegram-integrations-modal__input mt-1 w-full resize-y rounded-xl border px-3 py-2 text-sm"/>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.notifyImportant} onChange={e => update('notifyImportant', e.target.checked)} className="mt-1"/>
                    Уведомлять о важных событиях и рисках
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={draft.suggestTasks} onChange={e => update('suggestTasks', e.target.checked)} className="mt-1"/>
                    Предлагать создание задач из договорённостей
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
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
