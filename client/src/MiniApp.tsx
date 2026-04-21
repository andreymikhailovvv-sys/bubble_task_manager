import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { api } from './lib/api';
import type { Sphere, Task } from './lib/types';

type TimeFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'month';

type TaskDraft = {
  title: string;
  description: string;
  dueDate: string;
};

const timeFilterLabel: Record<TimeFilter, string> = {
  all: 'Все сроки',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: '7 дней',
  month: '30 дней'
};

function formatDueDate(value?: string | null) {
  if (!value) return 'Без дедлайна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без дедлайна';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRemaining(value?: string | null) {
  if (!value) return 'Срок не задан';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return 'Срок не задан';
  const diffMs = due.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);

  if (absMinutes < 1) {
    return diffMs >= 0 ? 'Дедлайн прямо сейчас' : 'Просрочено только что';
  }

  const days = Math.floor(absMinutes / (60 * 24));
  const hours = Math.floor((absMinutes % (60 * 24)) / 60);
  const minutes = absMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}м`);
  const text = parts.join(' ');
  return diffMs >= 0 ? `Через ${text}` : `Просрочено на ${text}`;
}

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - timezoneOffset);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function MiniApp() {
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [draftByTaskId, setDraftByTaskId] = useState<Record<string, TaskDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.getMe();
      const [sphereList, taskList] = await Promise.all([api.getSpheres(), api.getTasks()]);
      setSpheres(sphereList);
      setTasks(taskList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить мини-приложение');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    return tasks.filter((task) => {
      if (task.parentTaskId) return false;
      if (timeFilter === 'all') return true;
      if (!task.dueDate) return false;

      const due = new Date(task.dueDate);
      if (Number.isNaN(due.getTime())) return false;

      if (timeFilter === 'today') {
        return due >= startOfToday && due < endOfToday;
      }
      if (timeFilter === 'tomorrow') {
        const tomorrowStart = new Date(endOfToday);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        return due >= tomorrowStart && due < tomorrowEnd;
      }
      if (timeFilter === 'week') {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return due >= now && due <= weekEnd;
      }
      const monthEnd = new Date(now);
      monthEnd.setDate(monthEnd.getDate() + 30);
      return due >= now && due <= monthEnd;
    });
  }, [tasks, timeFilter]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      if (!map[task.parentTaskId]) map[task.parentTaskId] = [];
      map[task.parentTaskId].push(task);
    }
    return map;
  }, [tasks]);

  const groupedBySphere = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      const key = task.sphereId ?? 'without-sphere';
      const current = map.get(key) ?? [];
      current.push(task);
      map.set(key, current);
    }
    return Array.from(map.entries()).map(([sphereId, sphereTasks]) => ({
      sphereId,
      sphereName: sphereId === 'without-sphere' ? 'Без сектора' : (spheres.find((item) => item.id === sphereId)?.name ?? 'Без сектора'),
      tasks: sphereTasks.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    }));
  }, [filteredTasks, spheres]);

  const toggleExpanded = (task: Task) => {
    setExpandedTaskIds((prev) => {
      if (prev.includes(task.id)) {
        return prev.filter((id) => id !== task.id);
      }
      setDraftByTaskId((drafts) => ({
        ...drafts,
        [task.id]: {
          title: task.title,
          description: task.description ?? '',
          dueDate: toInputDateTime(task.dueDate)
        }
      }));
      for (const subtask of subtasksByParent[task.id] ?? []) {
        setDraftByTaskId((drafts) => ({
          ...drafts,
          [subtask.id]: {
            title: subtask.title,
            description: subtask.description ?? '',
            dueDate: toInputDateTime(subtask.dueDate)
          }
        }));
      }
      return [...prev, task.id];
    });
  };

  const onChangeDraft = (taskId: string, patch: Partial<TaskDraft>) => {
    setDraftByTaskId((prev) => ({
      ...prev,
      [taskId]: {
        title: prev[taskId]?.title ?? '',
        description: prev[taskId]?.description ?? '',
        dueDate: prev[taskId]?.dueDate ?? '',
        ...patch
      }
    }));
  };

  const saveTask = async (taskId: string) => {
    const draft = draftByTaskId[taskId];
    if (!draft) return;
    setSavingId(taskId);
    setError(null);
    try {
      await api.updateTask(taskId, {
        title: draft.title.trim() || 'Задача без названия',
        description: draft.description.trim() || null,
        dueDate: fromInputDateTime(draft.dueDate)
      });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить задачу');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-950 p-4 text-sm text-slate-100">Загружаем мини-приложение…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Мини-приложение задач</h1>
          <p className="text-sm text-slate-300">Список задач с секторами, фильтром по времени и редактированием карточек.</p>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <label className="mb-1 block text-xs text-slate-300">Фильтр по времени</label>
          <select
            value={timeFilter}
            onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
          >
            {(Object.keys(timeFilterLabel) as TimeFilter[]).map((value) => (
              <option key={value} value={value}>
                {timeFilterLabel[value]}
              </option>
            ))}
          </select>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {groupedBySphere.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">Задачи не найдены.</div>
        ) : null}

        {groupedBySphere.map((group) => (
          <section key={group.sphereId} className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h2 className="text-lg font-semibold">Сектор: {group.sphereName}</h2>

            {group.tasks.map((task) => {
              const isExpanded = expandedTaskIds.includes(task.id);
              const taskDraft = draftByTaskId[task.id] ?? {
                title: task.title,
                description: task.description ?? '',
                dueDate: toInputDateTime(task.dueDate)
              };
              const subtasks = subtasksByParent[task.id] ?? [];

              return (
                <article key={task.id} className="rounded-lg border border-slate-700 bg-slate-800/80 p-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => toggleExpanded(task)}
                  >
                    <div>
                      <h3 className="font-medium">{task.title}</h3>
                      <p className="mt-1 text-xs text-slate-300">Дедлайн: {formatDueDate(task.dueDate)}</p>
                      <p className="text-xs text-sky-200">{formatRemaining(task.dueDate)}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {isExpanded ? (
                    <div className="mt-3 space-y-3 border-t border-slate-700 pt-3">
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-300">Название задачи</label>
                        <input
                          value={taskDraft.title}
                          onChange={(event) => onChangeDraft(task.id, { title: event.target.value })}
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-300">Описание</label>
                        <textarea
                          value={taskDraft.description}
                          onChange={(event) => onChangeDraft(task.id, { description: event.target.value })}
                          className="min-h-20 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-300">Срок</label>
                        <input
                          type="datetime-local"
                          value={taskDraft.dueDate}
                          onChange={(event) => onChangeDraft(task.id, { dueDate: event.target.value })}
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void saveTask(task.id)}
                        disabled={savingId === task.id}
                        className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                      >
                        <Save size={14} />
                        {savingId === task.id ? 'Сохраняем…' : 'Сохранить задачу'}
                      </button>

                      <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/60 p-3">
                        <h4 className="text-sm font-semibold">Подзадачи</h4>
                        {subtasks.length === 0 ? <p className="text-xs text-slate-400">Подзадач пока нет.</p> : null}
                        {subtasks.map((subtask) => {
                          const subtaskDraft = draftByTaskId[subtask.id] ?? {
                            title: subtask.title,
                            description: subtask.description ?? '',
                            dueDate: toInputDateTime(subtask.dueDate)
                          };
                          return (
                            <div key={subtask.id} className="space-y-2 rounded-md border border-slate-700 bg-slate-800 p-2">
                              <input
                                value={subtaskDraft.title}
                                onChange={(event) => onChangeDraft(subtask.id, { title: event.target.value })}
                                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm"
                                placeholder="Название подзадачи"
                              />
                              <textarea
                                value={subtaskDraft.description}
                                onChange={(event) => onChangeDraft(subtask.id, { description: event.target.value })}
                                className="min-h-16 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm"
                                placeholder="Описание подзадачи"
                              />
                              <input
                                type="datetime-local"
                                value={subtaskDraft.dueDate}
                                onChange={(event) => onChangeDraft(subtask.id, { dueDate: event.target.value })}
                                className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => void saveTask(subtask.id)}
                                disabled={savingId === subtask.id}
                                className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium disabled:opacity-60"
                              >
                                {savingId === subtask.id ? 'Сохраняем…' : 'Сохранить подзадачу'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
