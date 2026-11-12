import { useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import type { Task } from '../lib/types';
import { noteHtmlToPlainText } from '../lib/notes';

type Period = 'all' | 'today' | 'week';

export function FullscreenUpcomingTasksPanel({ tasks, onOpenTask, onComplete }: {
  tasks: readonly Task[];
  onOpenTask: (task: Task) => void;
  onComplete: (task: Task) => void | Promise<void>;
}) {
  const [period, setPeriod] = useState<Period>('all');
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrow = start + 86400000;
  const week = start + 7 * 86400000;
  const sorted = tasks
    .filter(task => task.status !== 'DONE' && task.dueDate)
    .filter(task => {
      const due = new Date(task.dueDate!).getTime();
      if (!Number.isFinite(due)) return false;
      return period === 'all' || (period === 'today' ? due < tomorrow : due < week);
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  return (
    <section className="fullscreen-upcoming-panel workspace-widget-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border"
      aria-label="Ближайшие задачи и подзадачи">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-primary"><CalendarDays size={18}/> Ближайшие задачи</h2>
        <div className="flex gap-1">
          {([{ value: 'all', label: 'Все' }, { value: 'today', label: 'Сегодня' }, { value: 'week', label: 'Неделя' }] as const).map(option =>
            <button type="button" key={option.value} aria-pressed={period === option.value}
              className={`fullscreen-upcoming-filter rounded-lg border px-2.5 py-1.5 text-xs ${period === option.value ? 'is-active' : ''}`}
              onClick={() => setPeriod(option.value)}>{option.label}</button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
        {sorted.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">Задач с ближайшими сроками нет</p> : null}
        {sorted.map(task => {
          const date = new Date(task.dueDate!);
          const overdue = date.getTime() < Date.now();
          return <article key={task.id} className="workspace-list-row list-item-surface flex items-start gap-3 rounded-xl border px-3 py-3">
            <button type="button" className="fullscreen-upcoming-complete shrink-0 rounded-lg border p-1.5"
              onClick={() => void onComplete(task)} title="Выполнить" aria-label={`Выполнить: ${task.title}`}>
              <CheckCircle2 size={17}/>
            </button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenTask(task)}>
              <div className="break-words text-sm font-semibold text-primary">{task.title}</div>
              {task.description ? <p className="mt-1 line-clamp-2 text-xs text-muted">{noteHtmlToPlainText(task.description)}</p> : null}
              <div className={`mt-2 flex items-center gap-1 text-xs ${overdue ? 'text-rose-400' : 'text-muted'}`}>
                <Clock3 size={13}/>{date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          </article>;
        })}
      </div>
    </section>
  );
}
