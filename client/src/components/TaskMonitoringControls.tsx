import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, Plus } from 'lucide-react';
import { api } from '../lib/api';

export type TaskMonitoringStatus = { id: string; label: string; detail?: string | null; createdAt: string };

export function TaskMonitoringControls({ enabled, onChange, taskId, allowed = true }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  taskId?: string;
  allowed?: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [statusesOpen, setStatusesOpen] = useState(false);
  const [statuses, setStatuses] = useState<TaskMonitoringStatus[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setStatusesOpen(false); setStatuses([]); setError(''); }, [taskId]);
  useEffect(() => {
    if (!enabled) { setStatusesOpen(false); setStatuses([]); }
  }, [enabled]);
  const openStatuses = async () => {
    if (statusesOpen) { setStatusesOpen(false); return; }
    setStatusesOpen(true);
    if (!taskId) return;
    setLoading(true); setError('');
    try { setStatuses(await api.getTaskMonitoringStatuses(taskId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось получить статусы.'); }
    finally { setLoading(false); }
  };
  const add = async () => {
    if (!taskId || !label.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const item = await api.addTaskMonitoringStatus(taskId, { label: label.trim() });
      setStatuses(prev => [item, ...prev]); setLabel('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось добавить статус.'); }
    finally { setLoading(false); }
  };
  return <section className="task-monitoring-settings rounded-xl border border-[color:var(--panel-border)] p-3 text-primary">
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        Автомониторинг <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-500">beta</span>
        <button type="button" onClick={() => setHelpOpen(v => !v)} aria-label="Что такое автомониторинг?" title="Что такое автомониторинг?" aria-expanded={helpOpen}><HelpCircle size={16} /></button>
      </span>
      <input type="checkbox" checked={enabled} disabled={!allowed} onChange={event => onChange(event.target.checked)} aria-label="Включить автомониторинг" className="h-4 w-4 shrink-0 accent-violet-500" />
    </div>
    {helpOpen ? <p className="mt-2 text-xs leading-relaxed text-muted">Если включить beta-режим, Планировыч сможет самостоятельно анализировать просрочки задачи и её подзадач, писать в чат задачи, задавать вопросы и напоминать об ответах. В следующих этапах мониторинг сможет создавать подзадачи и корректировать важность. Использование ИИ расходует кредиты. При отключении новые автоматические действия прекращаются. Мониторинг переписок из почты и мессенджеров пока недоступен.</p> : null}
    {!allowed ? <p className="mt-2 text-xs text-muted">Пока доступно только для личных основных задач.</p> : null}
    {enabled ? <>
      <button type="button" className="mt-3 flex w-full items-center justify-between rounded-lg border border-[color:var(--panel-border)] px-3 py-2 text-xs font-semibold" onClick={() => void openStatuses()} aria-expanded={statusesOpen}>
        История статусов {statusesOpen ? <ChevronUp size={15} /> : <ChevronDown size={15}/>}
      </button>
      {statusesOpen ? <div className="mt-2 space-y-2">
        {taskId ? <>
          <div className="flex gap-2"><input value={label} maxLength={160} onChange={event => setLabel(event.target.value)} placeholder="Что сделано или изменилось?" className="surface-input min-w-0 flex-1 rounded-lg border px-2 py-2 text-sm" aria-label="Новый статус задачи" />
            <button type="button" aria-label="Добавить статус" onClick={() => void add()} disabled={loading || !label.trim()} className="rounded-lg border border-[color:var(--panel-border)] px-2 disabled:opacity-40"><Plus size={16} /></button>
          </div>
          {loading ? <p className="text-xs text-muted">Загрузка…</p> : null}
          {!loading && statuses.length === 0 ? <p className="text-xs text-muted">Пока нет статусов.</p> : null}
          {statuses.map((status, i) => <div key={status.id} className="relative rounded-lg border border-[color:var(--panel-border)] px-3 py-2">
            <strong className="block text-xs">{status.label}</strong>
            {status.detail ? <p className="text-xs text-muted">{status.detail}</p> : null}
            <time className="mt-1 block text-[11px] text-muted" dateTime={status.createdAt}>{new Date(status.createdAt).toLocaleString('ru-RU')}</time>
            {i < statuses.length - 1 ? <ChevronDown size={12} className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 text-muted" /> : null}
          </div>)}
        </> : <p className="text-xs text-muted">Сохраните задачу, чтобы добавлять статусы.</p>}
      </div> : null}
    </> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-rose-500">{error}</p> : null}
  </section>;
}
