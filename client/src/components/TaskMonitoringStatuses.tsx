import { useEffect, useState } from 'react';
import { ChevronDown, History, Plus, X } from 'lucide-react';
import { api, type TaskMonitoringStatus } from '../lib/api';

/** Read/write status milestones from the actual task AI chat, not settings. */
export function TaskMonitoringStatuses({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TaskMonitoringStatus[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setOpen(false); setItems([]); setDraft(''); setError(''); }, [taskId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void api.getTaskMonitoringStatuses(taskId).then(rows => {
      if (active) setItems(rows);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить статусы.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, open]);

  const add = async () => {
    if (!draft.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const item = await api.addTaskMonitoringStatus(taskId, { label: draft.trim() });
      setItems(previous => [item, ...previous]);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить статус.');
    } finally { setLoading(false); }
  };
  return <div className="task-monitor-status-anchor relative shrink-0">
    <button type="button" className="task-monitor-status-button inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-500" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Статусы мониторинга">
      <History size={14} aria-hidden="true" /> Статусы
    </button>
    {open ? <div className="task-monitor-status-popover absolute right-0 top-full z-[85] mt-2 flex w-[min(85vw,325px)] flex-col overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[var(--panel-background,var(--surface-card,#172338))] p-3 text-primary shadow-2xl" role="dialog" aria-label="История статусов задачи">
      <div className="mb-3 flex items-center justify-between gap-2">
        <strong className="text-sm">История статусов</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть историю статусов" className="rounded-lg p-1.5 text-muted"><X size={16} /></button>
      </div>
      <form className="mb-3 flex gap-2" onSubmit={event => { event.preventDefault(); void add(); }}>
        <input className="surface-input min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm text-primary" value={draft} onChange={event => setDraft(event.target.value)} maxLength={160} placeholder="Новый статус" aria-label="Новый статус задачи" />
        <button type="submit" className="rounded-lg border border-[color:var(--panel-border)] px-2.5 text-violet-500 disabled:opacity-40" disabled={loading || !draft.trim()} aria-label="Добавить статус"><Plus size={17} /></button>
      </form>
      {error ? <p role="alert" className="mb-2 text-xs text-rose-500">{error}</p> : null}
      <div className="task-monitor-status-timeline min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
        {loading && items.length === 0 ? <p className="text-xs text-muted">Загрузка…</p> : null}
        {!loading && items.length === 0 ? <p className="text-xs text-muted">Пока нет статусов. Добавьте первый результат работы.</p> : null}
        {items.map((item, i) => <div key={item.id} className="flex flex-col items-center">
          <div className="w-full rounded-xl border border-[color:var(--panel-border)] p-3">
            <p className="text-xs font-semibold leading-snug">{item.label}</p>
            {item.detail ? <p className="mt-1 text-xs text-muted">{item.detail}</p> : null}
            <time dateTime={item.createdAt} className="mt-1.5 block text-[11px] text-muted">{new Date(item.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
          </div>
          {i < items.length - 1 ? <ChevronDown size={15} className="my-1 shrink-0 text-violet-400" aria-hidden="true" /> : null}
        </div>)}
      </div>
    </div> : null}
  </div>;
}
