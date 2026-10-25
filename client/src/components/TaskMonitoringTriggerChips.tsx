import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { api, type TaskMonitoringTrigger } from '../lib/api';

/** A small read-only server-backed pill in the monitored task chat. */
export function TaskMonitoringTriggerChips({ taskId, enabled }: { taskId: string; enabled: boolean }) {
  const [triggers, setTriggers] = useState<TaskMonitoringTrigger[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) { setTriggers([]); return; }
    let alive = true;
    let requestRevision = 0;
    const load = async () => {
      const revision = ++requestRevision;
      try {
        const rows = await api.getTaskMonitoringTriggers(taskId);
        // Slow older HTTP responses must not roll a fresh trigger back.
        if (alive && revision === requestRevision) {
          setTriggers(rows);
          setNow(Date.now());
        }
      } catch {
        // Keep the last confirmed pending trigger through a transient outage.
        // A failed poll does not mean the server cancelled it.
      }
    };
    const onUpdated = (event: Event) => {
      if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) {
        void load();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
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
  }, [taskId, enabled]);
  if (!enabled || triggers.length === 0) return null;
  return <div className="flex flex-wrap gap-2" aria-live="polite">
    {triggers.map(trigger => {
      const seconds = Math.max(0, Math.ceil((new Date(trigger.dueAt).getTime() - now) / 1000));
      const label = seconds >= 3600 ? `${Math.floor(seconds / 3600)} ч ${Math.ceil(seconds % 3600 / 60)} мин` :
        seconds >= 60 ? `${Math.ceil(seconds / 60)} мин` : 'скоро';
      return <span key={trigger.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-500" title={trigger.question}>
        <Clock3 size={13} aria-hidden="true" /> Триггер запущен · {label}
      </span>;
    })}
  </div>;
}
