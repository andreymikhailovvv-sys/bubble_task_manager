import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Clock3, Plus, Trash2 } from 'lucide-react';
import { api, type AiCheckupSchedule, type CurrentUser } from '../lib/api';

function initialSchedules(user: Pick<CurrentUser, 'aiCheckupSchedules' | 'morningAiCheckupTime'> | null): AiCheckupSchedule[] {
  return user?.aiCheckupSchedules?.length ? user.aiCheckupSchedules.map(row => ({ ...row })) :
    [{ id: 'legacy', time: user?.morningAiCheckupTime || '10:00', instructions: '' }];
}

type Props = {
  user: CurrentUser | null;
  onUserUpdated: (user: CurrentUser) => void;
  children?: ReactNode;
};

/** The same account-level schedule editor is used in desktop, Mini App and mobile web. */
export function AiCheckupScheduleSettings({ user, onUserUpdated, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(user?.morningAiCheckupEnabled === true);
  const [schedules, setSchedules] = useState<AiCheckupSchedule[]>(() => initialSchedules(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  useEffect(() => {
    setSchedules(initialSchedules(user));
    setEnabled(user?.morningAiCheckupEnabled === true);
    setExpanded(false);
    setError(null);
  }, [user?.id]);

  const commit = (patch: { aiCheckupSchedules?: AiCheckupSchedule[]; morningAiCheckupEnabled?: boolean }) => {
    pendingRef.current += 1;
    setSaving(true);
    setError(null);
    queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
      try {
        const { user: updated } = await api.updateUserSettings(patch);
        onUserUpdated(updated);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось сохранить расписание.');
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setSaving(false);
      }
    });
  };

  const update = (id: string, patch: Partial<AiCheckupSchedule>) => {
    setSchedules(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const add = () => {
    if (schedules.length >= 12) return;
    const next = [...schedules, { id: crypto.randomUUID(), time: '12:00', instructions: '' }];
    setSchedules(next);
    commit({ aiCheckupSchedules: next });
  };

  const remove = (id: string) => {
    if (schedules.length <= 1) return;
    const next = schedules.filter(row => row.id !== id);
    setSchedules(next);
    commit({ aiCheckupSchedules: next });
  };

  return (
    <section data-tour="ai-checkup-settings" className="ai-checkup-schedules mt-3 border-t border-[color:var(--panel-border)] pt-3">
      <button type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left text-primary"
        aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>
        <span className="flex items-center gap-2 text-sm font-semibold">ИИ-чекапы
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? 'bg-emerald-500/15 text-emerald-600' : 'surface-muted text-muted'}`}>
          {enabled ? 'Включены' : 'Выключены'}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-3 pt-2">
          <p className="text-xs leading-relaxed text-muted">Настройте время и пожелания отдельно для каждого чекапа. Каждый запуск учитывает инструкции своего расписания и списывает кредиты по фактическим токенам.</p>
          <label className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--panel-border)] p-3 text-sm text-primary">
            <span>Автоматические ИИ-чекапы</span>
            <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={enabled} onChange={(event) => {
              const next = event.target.checked;
              setEnabled(next);
              commit({ morningAiCheckupEnabled: next });
            }} />
          </label>
          {schedules.map((slot, index) => (
            <div key={slot.id} className="rounded-xl border border-[color:var(--panel-border)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-primary">Чекап {index + 1}</span>
                <button type="button" onClick={() => remove(slot.id)} disabled={schedules.length === 1}
                  className="rounded-lg p-1.5 text-muted disabled:opacity-30" aria-label={`Удалить чекап ${index + 1}`} title="Удалить чекап">
                  <Trash2 size={15} />
                </button>
              </div>
              <label className="block text-xs text-muted">
                <span className="mb-1 flex items-center gap-1.5"><Clock3 size={13} /> Время</span>
                <input type="time" value={slot.time} className="surface-input w-full rounded-lg border px-3 py-2 text-base text-primary"
                  onChange={(event) => update(slot.id, { time: event.target.value })}
                  onBlur={() => { if (/^([01]\\d|2[0-3]):[0-5]\\d$/.test(slot.time)) commit({ aiCheckupSchedules: schedules }); }}
                />
              </label>
              <label className="mt-3 block text-xs text-muted">
                Пожелания к этому чекапу
                <textarea value={slot.instructions} maxLength={1500} rows={3}
                  placeholder="Например: обрати особое внимание на просроченные задачи и предложи, что перенести."
                  className="surface-input mt-1 w-full resize-y rounded-lg border px-3 py-2 text-sm text-primary placeholder:text-muted"
                  onChange={(event) => update(slot.id, { instructions: event.target.value })}
                  onBlur={() => commit({ aiCheckupSchedules: schedules })} />
              </label>
            </div>
          ))}
          <button type="button" onClick={add} disabled={schedules.length >= 12}
            className="surface-muted inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--panel-border)] px-3 py-2.5 text-sm font-medium text-primary disabled:opacity-40">
            <Plus size={16} /> Добавить чекап
          </button>
          {saving ? <p role="status" className="text-xs text-muted">Сохраняем настройки…</p> : null}
          {error ? <p role="alert" className="text-xs text-rose-500">{error}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
