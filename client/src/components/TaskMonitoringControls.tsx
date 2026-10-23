import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export function TaskMonitoringControls({ enabled, onChange, taskId, allowed = true }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  taskId?: string;
  allowed?: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return <section className="task-monitoring-settings rounded-xl border border-[color:var(--panel-border)] p-3 text-primary">
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        Автомониторинг <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-muted">beta</span>
        <button type="button" onClick={() => setHelpOpen(v => !v)} aria-label="Что такое автомониторинг?" title="Что такое автомониторинг?" aria-expanded={helpOpen}><HelpCircle size={16} /></button>
      </span>
      <button type="button" role="switch" aria-checked={enabled}
        aria-label="Автомониторинг задачи" disabled={!allowed}
        onClick={() => onChange(!enabled)}
        className={`task-monitor-mode-switch group inline-flex h-9 w-[90px] shrink-0 items-center rounded-full border p-1 text-[11px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-45 ${enabled
          ? 'justify-end border-emerald-400/40 bg-emerald-500/15 text-emerald-500'
          : 'justify-start border-slate-500/25 bg-slate-500/10 text-muted'}`}>
        {enabled ? <span className="mr-2">Вкл</span> : null}
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors duration-200 ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        {!enabled ? <span className="ml-2">Выкл</span> : null}
      </button>
    </div>
    {helpOpen ? <p className="mt-2 text-xs leading-relaxed text-muted">Если включить beta-режим, Планировыч сможет самостоятельно анализировать просрочки задачи и её подзадач, писать в чат задачи, задавать вопросы и напоминать об ответах. В режиме beta ИИ также может добавлять подзадачи, фиксировать статусы и корректировать важность. История статусов находится ниже в этом окне. Использование ИИ расходует кредиты. При отключении новые автоматические действия прекращаются. Мониторинг переписок из почты и мессенджеров пока недоступен.</p> : null}
    {!allowed ? <p className="mt-2 text-xs text-muted">Пока доступно только для личных основных задач.</p> : null}
  </section>;
}
