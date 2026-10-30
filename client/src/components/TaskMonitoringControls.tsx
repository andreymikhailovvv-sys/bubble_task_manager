import { useState } from 'react';
import { ChevronDown, Coins, HelpCircle, Lightbulb } from 'lucide-react';
import type { AiChatModel } from '../lib/types';

const MONITOR_MODELS: Array<{ value: AiChatModel; label: string; description: string; intellect: number; cost: number }> = [
  { value: 'gpt-6-luna', label: '6 Luna', description: 'Экономичная, отлично подходит для рутинных задач', intellect: 1, cost: 1 },
  { value: 'gpt-6.1-terra', label: '6.1 Terra', description: 'Рабочая лошадка. Баланс стоимости и производительности', intellect: 2, cost: 2 },
  { value: 'gpt-6.1-sol', label: '6.1 Sol', description: 'Самая мощная на сегодня модель', intellect: 3, cost: 3 }
];

export function TaskMonitoringControls({ enabled, onChange, taskId, allowed = true, model = 'gpt-6.1-terra', onModelChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  taskId?: string;
  allowed?: boolean;
  model?: AiChatModel;
  onModelChange?: (model: AiChatModel) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    {helpOpen ? <p className="mt-2 text-xs leading-relaxed text-muted">ИИ автономно помогает выполнять задачу: анализирует контекст, планирует следующие действия, пишет в чат задачи и ведёт статусы. В режиме автомониторинга нет обычных дедлайнов задачи и подзадач: время работы и уведомлений задаётся только триггерами. Если после ответа ИИ нет активных триггеров, сервер добавляет проверку через 3 часа. При включении списываются кредиты за обращения к модели. Модель выбирается только здесь.</p> : null}
    <button type="button" onClick={() => setDetailsOpen(v => !v)}
      className="mt-3 flex w-full items-center justify-between rounded-lg border border-[color:var(--panel-border)] px-2.5 py-2 text-left text-xs font-semibold" aria-expanded={detailsOpen}>
      <span>Настройки автомониторинга · модель ИИ</span>
      <ChevronDown size={15} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
    </button>
    {detailsOpen ? <div className="mt-2 space-y-2" aria-label="Выбор модели автомониторинга">
      <p className="text-[11px] leading-relaxed text-muted">Выбранная модель закрепляется за задачей и для автоматических запросов, и для её чата. Изменить её можно только в этом разделе. Лампочки обозначают относительный интеллект, монетки — относительную стоимость.</p>
      {MONITOR_MODELS.map(option => <button type="button" key={option.value}
        disabled={!allowed || !onModelChange}
        aria-pressed={model === option.value} onClick={() => onModelChange?.(option.value)}
        className={`w-full rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${model === option.value ? 'border-emerald-400 bg-emerald-500/10' : 'border-[color:var(--panel-border)]'}`}>
        <div className="flex items-center justify-between gap-2"><strong className="text-xs">{option.label}</strong>{model === option.value ? <span className="text-[10px] font-semibold text-emerald-500">Выбрана</span> : null}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{option.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
          <span className="inline-flex items-center gap-0.5" title={`Интеллект: ${option.intellect} из 3`}>
            Интеллект {Array.from({ length: 3 }, (_, index) => <Lightbulb key={index} size={13} fill={index < option.intellect ? '#facc15' : 'none'} color={index < option.intellect ? '#eab308' : '#94a3b8'} />)}
          </span>
          <span className="inline-flex items-center gap-0.5" title={`Стоимость: ${option.cost} из 3`}>
            Стоимость {Array.from({ length: 3 }, (_, index) => <Coins key={index} size={13} fill={index < option.cost ? '#fbbf24' : 'none'} color={index < option.cost ? '#d97706' : '#94a3b8'} />)}
          </span>
        </div>
      </button>)}
    </div> : null}
    {!allowed ? <p className="mt-2 text-xs text-muted">Пока доступно только для личных основных задач.</p> : null}
  </section>;
}
