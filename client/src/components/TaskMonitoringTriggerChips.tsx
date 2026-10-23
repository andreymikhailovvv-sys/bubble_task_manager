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
    const load = async () => {
      try { const rows = await api.getTaskMonitoringTriggers(taskId); if (alive) setTriggers(rows); }
      catch { if (alive) setTriggers([]); }
    };
    void load();
    const interval = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => { alive = false; window.clearInterval(interval); };
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
