import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, X, Loader2 } from 'lucide-react';
import { api, type TaskMonitoringTrigger } from '../lib/api';

type Tooltip = { id: string; left: number; top: number; theme: 'light' | 'dark' };
const formatRemaining = (dueAt: string, now: number) => {
  const minutes = Math.max(0, Math.ceil((new Date(dueAt).getTime() - now) / 60_000));
  if (!minutes) return 'скоро';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours} ч${mins ? ` ${mins} мин` : ''}` : `${minutes} мин`;
};

/** Up to three independently scheduled actions, visible in every task AI chat. */
export function TaskMonitoringTriggerChips({ taskId }: { taskId: string }) {
  const [triggers, setTriggers] = useState<TaskMonitoringTrigger[]>([]);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const tooltipId = useRef(`task-followup-detail-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    setTriggers([]);
    setTooltip(null);
    setCancellingId(null);
    let alive = true;
    let requestRevision = 0;
    const load = async () => {
      const revision = ++requestRevision;
      try {
        const rows = await api.getTaskMonitoringTriggers(taskId);
        // An older HTTP response must never restore a replaced list.
        if (alive && revision === requestRevision) {
          setTriggers(rows);
          setNow(Date.now());
        }
      } catch {
        // Transient connection errors do not cancel persisted actions.
      }
    };
    const onUpdated = (event: Event) => {
      if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) void load();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const onFocus = () => { void load(); };
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
      setNow(Date.now());
    }, 10_000);
    window.addEventListener('task-monitoring-triggers-updated', onUpdated);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      requestRevision++;
      window.clearInterval(interval);
      window.removeEventListener('task-monitoring-triggers-updated', onUpdated);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [taskId]);

  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tooltip]);

  const showTooltip = (id: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const width = Math.min(332, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = rect.bottom + 132 > window.innerHeight && rect.top > 144
      ? rect.top - 132 : rect.bottom + 8;
    const mobileRoot = element.closest('.miniapp-shell');
    const isLight = mobileRoot
      ? mobileRoot.classList.contains('miniapp-light')
      : document.body.dataset.theme === 'light';
    setTooltip({ id, left, top, theme: isLight ? 'light' : 'dark' });
  };
  const cancel = async (triggerId: string) => {
    if (cancellingId) return;
    setCancellingId(triggerId);
    try {
      await api.cancelTaskMonitoringTrigger(taskId, triggerId);
      setTooltip(null);
      setTriggers(current => current.filter(item => item.id !== triggerId));
      window.dispatchEvent(new CustomEvent('task-monitoring-triggers-updated', { detail: { taskId } }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось убрать напоминание');
    } finally {
      setCancellingId(null);
    }
  };
  if (triggers.length === 0) return null;
  const selected = triggers.find(item => item.id === tooltip?.id);
  return <>
    <div className="task-followups flex flex-wrap gap-2" aria-label="Запланированные действия ИИ" aria-live="polite">
      {triggers.map((trigger, index) => (
        <span key={trigger.id}
          tabIndex={0}
          role="note"
          aria-describedby={tooltip?.id === trigger.id ? tooltipId.current : undefined}
          className="task-followup-chip inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
          data-tone={index % 3}
          onMouseEnter={event => showTooltip(trigger.id, event.currentTarget)}
          onMouseLeave={() => setTooltip(null)}
          onFocus={event => showTooltip(trigger.id, event.currentTarget)}
          onBlur={() => setTooltip(null)}>
          <Clock3 size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{trigger.title || 'Уточнить по задаче'}</span>
          <span className="task-followup-time shrink-0">· {formatRemaining(trigger.dueAt, now)}</span>
          <button type="button" className="task-followup-cancel ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            title={`Отменить: ${trigger.title || 'запланированное действие'}`}
            aria-label={`Отменить: ${trigger.title || 'запланированное действие'}`}
            disabled={cancellingId !== null}
            onMouseEnter={event => { event.stopPropagation(); setTooltip(null); }}
            onFocus={event => { event.stopPropagation(); setTooltip(null); }}
            onClick={event => { event.stopPropagation(); void cancel(trigger.id); }}>
            {cancellingId === trigger.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} aria-hidden="true" />}
          </button>
        </span>
      ))}
    </div>
    {selected && tooltip && typeof document !== 'undefined' ? createPortal(
      <div id={tooltipId.current} role="tooltip" className="task-followup-tooltip fixed z-[400] rounded-xl border p-3 shadow-xl"
        data-status-theme={tooltip.theme}
        style={{ left: tooltip.left, top: tooltip.top, width: Math.min(332, window.innerWidth - 24) }}>
        <strong className="block text-xs font-semibold">{selected.title || 'Запланированное действие'}</strong>
        <p className="mt-1.5 text-xs leading-relaxed">{selected.description || selected.question}</p>
        <div className="task-followup-tooltip-due mt-2 text-[11px]">
          {new Date(selected.dueAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>, document.body
    ) : null}
  </>;
}
