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
      <input type="checkbox" checked={enabled} disabled={!allowed} onChange={event => onChange(event.target.checked)} aria-label="Включить автомониторинг" className="h-4 w-4 shrink-0 accent-sky-600" />
    </div>
    {helpOpen ? <p className="mt-2 text-xs leading-relaxed text-muted">Если включить beta-режим, Планировыч сможет самостоятельно анализировать просрочки задачи и её подзадач, писать в чат задачи, задавать вопросы и напоминать об ответах. В режиме beta ИИ также может добавлять подзадачи, фиксировать статусы и корректировать важность. История статусов находится ниже в этом окне. Использование ИИ расходует кредиты. При отключении новые автоматические действия прекращаются. Мониторинг переписок из почты и мессенджеров пока недоступен.</p> : null}
    {!allowed ? <p className="mt-2 text-xs text-muted">Пока доступно только для личных основных задач.</p> : null}
  </section>;
}
