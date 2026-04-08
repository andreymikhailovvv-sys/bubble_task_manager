import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Bot, Brain, GripVertical, Maximize2, Minimize2, Plus, SendHorizontal, Sparkles, X } from 'lucide-react';
import { BubbleField } from './components/BubbleField';
import { InlineDateTimePickerIcon } from './components/InlineDateTimePickerIcon';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { api } from './lib/api';
import { calcScore } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { ChatMessage, Insight, Sphere, Task } from './lib/types';

const MIN_SPHERES = 3;
const DEFAULT_SPHERES = [
  { name: 'Работа', color: HARMONIOUS_COLORS[0], icon: 'briefcase' },
  { name: 'Личное', color: HARMONIOUS_COLORS[1], icon: 'heart' },
  { name: 'Здоровье', color: HARMONIOUS_COLORS[5], icon: 'dumbbell' }
];
const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;

function suggestPriority(task: Partial<Task>) {
  const title = (task.title ?? '').toLowerCase();
  let importance = task.importance ?? 3;

  if (/релиз|клиент|налог|экзамен/.test(title)) importance = Math.min(5, importance + 1);

  return { importance };
}

export default function App() {
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<'global' | 'sectors'>('sectors');
  const [search, setSearch] = useState('');
  const [sphereFilter, setSphereFilter] = useState('ALL');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [editorState, setEditorState] = useState<{ task?: Task; initialSphereId?: string } | null>(null);
  const [sectorEditorSphere, setSectorEditorSphere] = useState<Sphere | null>(null);
  const [poppingTaskId, setPoppingTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedDraft, setFocusedDraft] = useState<Partial<Task> | null>(null);
  const [focusedNotifyPreset, setFocusedNotifyPreset] = useState('60');
  const [aiDraft, setAiDraft] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [subtaskOrderMap, setSubtaskOrderMap] = useState<Record<string, string[]>>({});
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(() => localStorage.getItem('btm-background-image'));

  async function load() {
    let sphereData = await api.getSpheres();
    if (sphereData.length < MIN_SPHERES) {
      for (let i = sphereData.length; i < MIN_SPHERES; i += 1) {
        const preset = DEFAULT_SPHERES[i] ?? { name: `Сектор ${i + 1}`, color: HARMONIOUS_COLORS[i % HARMONIOUS_COLORS.length], icon: 'star' };
        await api.createSphere(preset);
      }
      sphereData = await api.getSpheres();
    }

    const [taskData, insightData] = await Promise.all([api.getTasks(), api.getInsights()]);
    setSpheres(sphereData);
    setTasks(taskData);
    setInsights(insightData);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (backgroundImage) {
      localStorage.setItem('btm-background-image', backgroundImage);
      return;
    }
    localStorage.removeItem('btm-background-image');
  }, [backgroundImage]);

  const rootTasks = useMemo(() => tasks.filter((task) => !task.parentTaskId), [tasks]);
  const subtasks = useMemo(() => tasks.filter((task) => Boolean(task.parentTaskId)), [tasks]);
  const sortedSubtasks = useMemo(() => {
    const baseMap = subtasks.reduce<Record<string, Task[]>>((acc, task) => {
      const key = task.parentTaskId as string;
      (acc[key] ??= []).push(task);
      return acc;
    }, {});

    return Object.entries(baseMap).reduce<Record<string, Task[]>>((acc, [parentId, items]) => {
      const order = subtaskOrderMap[parentId];
      if (!order?.length) {
        acc[parentId] = items;
        return acc;
      }
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      acc[parentId] = [...items].sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      return acc;
    }, {});
  }, [subtasks, subtaskOrderMap]);
  const subtaskMap = sortedSubtasks;
  const activeTasks = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE'), [rootTasks]);
  const completedTasks = useMemo(() => rootTasks.filter((task) => task.status === 'DONE'), [rootTasks]);
  const completedTasksForPanel = useMemo(() => {
    if (completedFilter === 'all') return completedTasks;
    const now = new Date();
    return completedTasks.filter((task) => {
      const updatedAt = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;
      return updatedAt.getDate() === now.getDate()
        && updatedAt.getMonth() === now.getMonth()
        && updatedAt.getFullYear() === now.getFullYear();
    });
  }, [completedFilter, completedTasks]);
  const focusedTask = useMemo(() => rootTasks.find((task) => task.id === focusedTaskId) ?? null, [rootTasks, focusedTaskId]);
  const focusedAiDialog = useMemo(
    () => (focusedTask ? aiDialogByTask[focusedTask.id] ?? [] : []),
    [aiDialogByTask, focusedTask]
  );

  useEffect(() => {
    if (!focusedTask) {
      setFocusedDraft(null);
      setAiDraft('');
      setAiError(null);
      setIsAiExpanded(false);
      return;
    }
    setFocusedDraft(focusedTask);
    if (focusedTask.notifyBeforeMinutes === null) {
      setFocusedNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(focusedTask.notifyBeforeMinutes ?? 60)) {
      setFocusedNotifyPreset(String(focusedTask.notifyBeforeMinutes ?? 60));
    } else {
      setFocusedNotifyPreset('60');
    }
  }, [focusedTask]);

  const sendFocusedAiQuestion = async () => {
    if (!focusedTask) return;
    const question = aiDraft.trim();
    if (!question) return;

    const taskId = focusedTask.id;
    const previousDialog = aiDialogByTask[taskId] ?? [];
    const nextDialog = [...previousDialog, { role: 'user' as const, content: question }];
    setAiDialogByTask((prev) => ({ ...prev, [taskId]: nextDialog }));
    setAiDraft('');
    setAiError(null);
    setAiLoadingTaskId(taskId);

    try {
      const result = await askTaskAssistant(taskId, { question, history: previousDialog });
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { role: 'assistant', content: result.answer }]
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
      setAiError(message);
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.' }]
      }));
    } finally {
      setAiLoadingTaskId(null);
    }
  };

  const visibleTasks = useMemo(
    () =>
      activeTasks.filter((task) => {
        if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (sphereFilter !== 'ALL' && task.sphereId !== sphereFilter) return false;
        return true;
      }),
    [activeTasks, search, sphereFilter]
  );

  const persistTask = async (payload: Partial<Task>) => {
    const normalized = {
      ...payload,
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3,
      status: payload.status ?? 'TODO'
    };
    const score = calcScore(normalized.importance, normalized.urgency);

    if (editorState?.task?.id) {
      await api.updateTask(editorState.task.id, { ...normalized, priorityScore: score });
    } else {
      await api.createTask({ ...normalized, priorityScore: score });
    }
    setEditorState(null);
    await load();
  };

  const completeTask = async (task: Task) => {
    setPoppingTaskId(task.id);
    await new Promise((resolve) => setTimeout(resolve, 320));
    await api.updateTask(task.id, { status: 'DONE' });
    setPoppingTaskId(null);
    setEditorState(null);
    setFocusedTaskId(null);
    await load();
  };

  const saveFocusedTask = async () => {
    if (!focusedTask || !focusedDraft) return;
    const normalized = {
      ...focusedDraft,
      importance: focusedDraft.importance ?? 3,
      urgency: focusedDraft.urgency ?? 3,
      status: focusedDraft.status ?? 'TODO'
    };
    const score = calcScore(normalized.importance, normalized.urgency);
    await api.updateTask(focusedTask.id, { ...normalized, priorityScore: score });
    setFocusedTaskId(null);
    await load();
  };

  const shouldTaskGlow = (task: Task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const diff = due.getTime() - Date.now();
    if (diff < 0) return true;
    if (task.notifyBeforeMinutes === null) return false;
    const notifyBefore = (task.notifyBeforeMinutes ?? 60) * 60_000;
    return diff <= notifyBefore;
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return due.getTime() < Date.now();
  };

  const syncParentStatusBySubtasks = async (parentTaskId: string) => {
    const allTasks = await api.getTasks();
    const nextSubtasks = allTasks.filter((task) => task.parentTaskId === parentTaskId);
    if (nextSubtasks.length === 0) return;
    const allDone = nextSubtasks.every((task) => task.status === 'DONE');
    const parentTask = allTasks.find((task) => task.id === parentTaskId);
    if (!parentTask) return;
    if (allDone && parentTask.status !== 'DONE') {
      await api.updateTask(parentTaskId, { status: 'DONE' });
    }
    if (!allDone && parentTask.status === 'DONE') {
      await api.updateTask(parentTaskId, { status: 'TODO' });
    }
  };

  const toggleSubtaskDone = async (subtask: Task) => {
    const nextStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    await api.updateTask(subtask.id, { status: nextStatus });
    if (subtask.parentTaskId) {
      await syncParentStatusBySubtasks(subtask.parentTaskId);
    }
    await load();
  };

  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const askTaskAssistant = async (taskId: string, payload: { question: string; history: ChatMessage[] }) => {
    return api.askTaskAssistant(taskId, payload);
  };

  return (
    <main
      className="flex h-screen flex-col overflow-hidden p-4 text-slate-100 lg:p-6"
      style={{
        backgroundImage: backgroundImage
          ? `linear-gradient(rgba(2,6,23,0.58), rgba(2,6,23,0.72)), url(${backgroundImage})`
          : undefined,
        backgroundSize: backgroundImage ? 'cover' : undefined,
        backgroundPosition: backgroundImage ? 'center' : undefined
      }}
    >
      <header className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 backdrop-blur">
        <h1 className="mr-3 text-xl font-semibold">Bubble Task Manager</h1>
        <input className="min-w-52 flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm" placeholder="Поиск по задачам" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => setMode((m) => (m === 'global' ? 'sectors' : 'global'))}>{mode === 'global' ? 'Сектора' : 'Общий круг'}</button>
        <button className="flex items-center gap-1 rounded bg-cyan-700 px-3 py-2 text-sm" onClick={() => setEditorState({ initialSphereId: spheres[0]?.id })}><Plus size={16} /> Задача</button>
        <button className="flex items-center gap-1 rounded bg-indigo-700 px-3 py-2 text-sm" onClick={() => setSectorEditorSphere({ id: '', name: '', color: HARMONIOUS_COLORS[0], icon: 'briefcase' })}>
          <Plus size={16} /> Сектор
        </button>
      </header>

      <section className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <select className="rounded bg-slate-800 p-2 text-sm" value={sphereFilter} onChange={(e) => setSphereFilter(e.target.value)}>
          <option value="ALL">Все сектора</option>
          {spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
        </select>
        <button
          className="flex items-center justify-center gap-2 rounded bg-fuchsia-700 px-3 py-2 text-sm"
          onClick={async () => {
            if (!editorState?.task) return;
            const next = suggestPriority(editorState.task);
            setEditorState({ ...editorState, task: { ...editorState.task, ...next } });
          }}
        >
          <Sparkles size={16} /> AI-оценка важности
        </button>
        <button className="flex items-center justify-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => alert('AI-разбор будет подключен позже через backend endpoint')}>
          <Brain size={16} /> AI-разобрать задачу
        </button>
      </section>

      <div className="relative min-h-0 flex-1 overflow-hidden pr-[320px]">
        <BubbleField
          className="h-full"
          tasks={visibleTasks}
          spheres={spheres}
          subtaskMap={subtaskMap}
          mode={mode}
          poppingTaskId={poppingTaskId}
          selectedId={editorState?.task?.id}
          onSelect={(task) => setFocusedTaskId(task.id)}
          onSelectSubtask={(subtask) => setEditorState({ task: subtask })}
          onCreateSubtask={async (parentTask, payload) => {
            await api.createTask({
              ...payload,
              importance: 3,
              urgency: 3,
              priorityScore: 3,
              status: 'TODO',
              sphereId: null,
              parentTaskId: parentTask.id
            });
            if (parentTask.status === 'DONE') {
              await api.updateTask(parentTask.id, { status: 'TODO' });
            }
            await load();
          }}
          onToggleSubtaskDone={toggleSubtaskDone}
          onUpdateSubtaskDueDate={async (subtask, dueDate) => {
            await api.updateTask(subtask.id, { dueDate });
            await load();
          }}
          onReorderSubtasks={(parentTaskId, sourceIndex, targetIndex) => {
            setSubtaskOrderMap((prev) => {
              const current = prev[parentTaskId] ?? (subtaskMap[parentTaskId] ?? []).map((task) => task.id);
              if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || sourceIndex >= current.length || targetIndex >= current.length) {
                return prev;
              }
              const next = [...current];
              const [moved] = next.splice(sourceIndex, 1);
              next.splice(targetIndex, 0, moved);
              return { ...prev, [parentTaskId]: next };
            });
          }}
          onAddTaskToSphere={(sphere) => setEditorState({ initialSphereId: sphere.id })}
          onRenameSphere={(sphere) => setSectorEditorSphere(sphere)}
        />
        <aside
          className="absolute right-0 top-0 z-10 h-full w-[320px] space-y-4 overflow-y-auto overscroll-contain border-l border-slate-700/60 bg-slate-950/90 p-4 backdrop-blur-sm"
          data-no-field-zoom="true"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">AI suggestions</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.map((insight) => <li key={insight.id}>• {insight.text}</li>)}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Выполненные задания</h3>
              <div className="flex items-center gap-1 rounded-lg bg-slate-800/80 p-1 text-[11px]">
                <button
                  className={`rounded px-2 py-0.5 ${completedFilter === 'today' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('today')}
                >
                  сегодня
                </button>
                <button
                  className={`rounded px-2 py-0.5 ${completedFilter === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('all')}
                >
                  все
                </button>
              </div>
            </div>
            <ul className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 text-xs text-slate-200">
              {completedTasksForPanel.length === 0 ? <li className="text-slate-400">Нет выполненных задач для выбранного фильтра</li> : null}
              {completedTasksForPanel.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1">
                  <input
                    type="checkbox"
                    checked
                    onChange={async () => {
                      await api.updateTask(task.id, { status: 'TODO' });
                      await load();
                    }}
                  />
                  <span className="truncate">{task.title}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Фон рабочего пространства</h3>
            <label className="mb-2 block rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700/80">
              <span className="block font-medium">Загрузить изображение</span>
              <span className="mt-1 block text-[11px] text-slate-400">Рекомендуемый размер: от 1920×1080 (лучше 2560×1440).</span>
              <input type="file" accept="image/*" className="mt-2 block w-full text-[11px]" onChange={handleBackgroundUpload} />
            </label>
            <button
              className="w-full rounded bg-slate-700 px-3 py-1.5 text-xs disabled:opacity-50"
              disabled={!backgroundImage}
              onClick={() => setBackgroundImage(null)}
            >
              Сбросить фон
            </button>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Управление секторами</h3>
            <ul className="space-y-2 text-xs">
              {spheres.map((sphere) => {
                const Icon = resolveSphereIcon(sphere.icon);
                return (
                  <li key={sphere.id} className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1">
                    <span className="flex items-center gap-1" style={{ color: sphere.color }}>{Icon ? <Icon size={13} /> : null}{sphere.name}</span>
                    <button
                      className="text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={spheres.length <= MIN_SPHERES}
                      onClick={async () => {
                        if (spheres.length <= MIN_SPHERES) return;
                        if (!confirm(`Удалить сектор ${sphere.name}?`)) return;
                        await api.deleteSphere(sphere.id);
                        await load();
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Минимум секторов: {MIN_SPHERES}.</p>
          </section>
        </aside>
      </div>
      {editorState ? (
        <TaskEditor
          task={editorState.task}
          initialSphereId={editorState.initialSphereId}
          spheres={spheres}
          onCancel={() => setEditorState(null)}
          onSave={persistTask}
          onComplete={editorState.task?.id ? () => completeTask(editorState.task!) : undefined}
          onDelete={editorState.task?.id ? async () => {
            await api.deleteTask(editorState.task!.id);
            setEditorState(null);
            await load();
          } : undefined}
        />
      ) : null}

      {focusedTask && focusedDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" onClick={() => setFocusedTaskId(null)}>
          <div className="flex w-full max-w-[1320px] items-stretch justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <aside className="hidden w-[360px] shrink-0 flex-col rounded-[2rem] border border-violet-300/30 bg-slate-950/92 p-4 shadow-2xl lg:flex">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-violet-100"><Bot size={16} /> Помощь ИИ</p>
                  <p className="mt-1 text-xs text-slate-300">{focusedTask.title}</p>
                </div>
                <button
                  className="rounded bg-slate-700/80 p-1.5 text-slate-200 hover:bg-slate-600"
                  onClick={() => setIsAiExpanded(true)}
                  title="Развернуть диалог"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
              <div className="mb-3 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-900/90 p-3">
                {focusedAiDialog.length === 0 ? <p className="text-xs text-slate-400">Спросите ИИ, как быстрее и качественнее выполнить задачу.</p> : null}
                {focusedAiDialog.map((message, index) => (
                  <div
                    key={`focused-ai-${message.role}-${index}`}
                    className={`max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                    <p>{message.content}</p>
                  </div>
                ))}
                {aiLoadingTaskId === focusedTask.id ? <p className="text-xs text-violet-200">ИИ думает…</p> : null}
              </div>
              <textarea
                className="mb-2 min-h-24 w-full resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm leading-relaxed"
                placeholder="Например: предложи пошаговый план с оценкой времени"
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendFocusedAiQuestion();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="min-h-4 text-[11px] text-rose-300">{aiError ?? ''}</p>
                <button
                  className="flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 text-xs disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void sendFocusedAiQuestion()}
                >
                  <SendHorizontal size={13} />
                  Отправить
                </button>
              </div>
            </aside>
            <aside className="w-full max-w-3xl rounded-[2.3rem] border border-cyan-200/30 bg-slate-900 p-5 shadow-2xl">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-slate-100">Фокус задачи</h3>
                <input className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.title ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), title: e.target.value }))} />
                <textarea className="min-h-24 w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.description ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), description: e.target.value }))} />
                <select className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.sphereId ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), sphereId: e.target.value || null }))}>
                  <option value="">Без сектора</option>
                  {spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
                </select>
                <label className="block text-xs">Срок (дата и время)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
                    value={focusedDraft.dueDate ? new Date(new Date(focusedDraft.dueDate).getTime() - new Date(focusedDraft.dueDate).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  />
                </label>
                <label className="block text-xs">Уведомлять за
                  <select
                    className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
                    value={focusedNotifyPreset}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFocusedNotifyPreset(value);
                      setFocusedDraft((p) => ({ ...(p ?? {}), notifyBeforeMinutes: value === 'null' ? null : Number(value) }));
                    }}
                  >
                    {NOTIFY_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="mb-1 text-xs">Важность: {focusedDraft.importance ?? 3}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button key={level} className={`rounded border px-2 py-1 text-sm ${focusedDraft.importance === level ? 'border-cyan-300 bg-cyan-600' : 'border-slate-600 bg-slate-800'}`} onClick={() => setFocusedDraft((p) => ({ ...(p ?? {}), importance: level }))}>{level}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded bg-cyan-600 px-3 py-2 text-sm" onClick={saveFocusedTask}>Сохранить</button>
                  <button className="rounded bg-emerald-600 px-3 py-2 text-sm" onClick={() => completeTask(focusedTask)}>Выполнена</button>
                  <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={async () => { await api.deleteTask(focusedTask.id); setFocusedTaskId(null); await load(); }}>Удалить</button>
                  <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => setFocusedTaskId(null)}>Закрыть</button>
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-slate-700/60 bg-slate-950/70 p-3">
                <h4 className="text-sm font-semibold">Подзадачи</h4>
                <button className="rounded bg-cyan-700 px-3 py-1 text-xs" onClick={() => setEditorState({ task: { id: '', title: '', description: '', dueDate: null, importance: 3, urgency: 3, priorityScore: 3, status: 'TODO', sphereId: null, parentTaskId: focusedTask.id, notifyBeforeMinutes: 60 } })}>
                  + Добавить подзадачу
                </button>
                <ul className="space-y-2 text-sm">
                  {(subtaskMap[focusedTask.id] ?? []).map((subtask, index) => (
                    <li
                      key={subtask.id}
                      className="flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1"
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                        if (Number.isNaN(sourceIndex)) return;
                        setSubtaskOrderMap((prev) => {
                          const current = prev[focusedTask.id] ?? (subtaskMap[focusedTask.id] ?? []).map((task) => task.id);
                          const next = [...current];
                          const [moved] = next.splice(sourceIndex, 1);
                          next.splice(index, 0, moved);
                          return { ...prev, [focusedTask.id]: next };
                        });
                      }}
                      style={isOverdue(subtask)
                        ? { boxShadow: '0 0 10px rgba(239,68,68,0.55), inset 0 0 8px rgba(239,68,68,0.2)' }
                        : shouldTaskGlow(subtask)
                          ? { boxShadow: '0 0 10px rgba(56,189,248,0.5), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
                          : undefined}
                    >
                      <span className="cursor-grab text-slate-400 active:cursor-grabbing"><GripVertical size={14} /></span>
                      <input type="checkbox" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      <span className={`flex-1 ${subtask.status === 'DONE' ? 'line-through opacity-60' : ''}`}>{subtask.title}</span>
                      <InlineDateTimePickerIcon
                        value={subtask.dueDate}
                        title="Изменить срок подзадачи"
                        onChange={async (dueDate) => {
                          await api.updateTask(subtask.id, { dueDate });
                          await load();
                        }}
                      />
                    </li>
                  ))}
                  {(subtaskMap[focusedTask.id] ?? []).length === 0 ? <li className="text-xs text-slate-400">Пока нет подзадач</li> : null}
                </ul>
              </div>
            </div>
            </aside>
          </div>
        </div>
      ) : null}

      {focusedTask && isAiExpanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setIsAiExpanded(false)}>
          <div className="w-full max-w-4xl rounded-3xl border border-violet-200/40 bg-slate-950/99 p-5 shadow-[0_35px_100px_rgba(2,6,23,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold text-violet-100"><Bot size={18} /> Полноэкранный диалог с ИИ</p>
                <p className="text-xs text-slate-300">{focusedTask.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600" onClick={() => setIsAiExpanded(false)} title="Свернуть">
                  <Minimize2 size={14} />
                </button>
                <button className="rounded bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600" onClick={() => { setIsAiExpanded(false); setFocusedTaskId(null); }} title="Закрыть">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="mb-3 h-[60vh] space-y-3 overflow-y-auto rounded-2xl bg-slate-900/95 p-4">
              {focusedAiDialog.length === 0 ? <p className="text-sm text-slate-400">Спросите ИИ, как эффективнее выполнить задачу.</p> : null}
              {focusedAiDialog.map((message, index) => (
                <div
                  key={`expanded-ai-${message.role}-${index}`}
                  className={`max-w-[72ch] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-line break-words ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                  <p>{message.content}</p>
                </div>
              ))}
              {aiLoadingTaskId === focusedTask.id ? <p className="text-sm text-violet-200">ИИ думает…</p> : null}
            </div>
            <textarea
              className="mb-2 min-h-28 w-full resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm leading-relaxed"
              placeholder="Опишите вопрос подробнее…"
              value={aiDraft}
              onChange={(event) => setAiDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendFocusedAiQuestion();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="min-h-5 text-xs text-rose-300">{aiError ?? ''}</p>
              <button
                className="flex items-center gap-1 rounded bg-violet-600 px-3 py-2 text-sm disabled:opacity-50"
                disabled={aiLoadingTaskId === focusedTask.id}
                onClick={() => void sendFocusedAiQuestion()}
              >
                <SendHorizontal size={14} />
                Отправить в ИИ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sectorEditorSphere ? (
        <SectorEditor
          sphere={sectorEditorSphere.id ? sectorEditorSphere : undefined}
          onCancel={() => setSectorEditorSphere(null)}
          onSave={async (payload) => {
            if (sectorEditorSphere.id) {
              await api.updateSphere(sectorEditorSphere.id, payload);
            } else {
              await api.createSphere(payload);
            }
            setSectorEditorSphere(null);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}
