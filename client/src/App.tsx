import { useEffect, useMemo, useState } from 'react';
import { Brain, Plus, Sparkles } from 'lucide-react';
import { BubbleField } from './components/BubbleField';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { api } from './lib/api';
import { calcScore } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { Insight, Sphere, Task } from './lib/types';

const MIN_SPHERES = 3;
const DEFAULT_SPHERES = [
  { name: 'Работа', color: HARMONIOUS_COLORS[0], icon: 'briefcase' },
  { name: 'Личное', color: HARMONIOUS_COLORS[1], icon: 'heart' },
  { name: 'Здоровье', color: HARMONIOUS_COLORS[5], icon: 'dumbbell' }
];

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

  const rootTasks = useMemo(() => tasks.filter((task) => !task.parentTaskId), [tasks]);
  const subtasks = useMemo(() => tasks.filter((task) => Boolean(task.parentTaskId)), [tasks]);
  const subtaskMap = useMemo(() => subtasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = task.parentTaskId as string;
    (acc[key] ??= []).push(task);
    return acc;
  }, {}), [subtasks]);
  const activeTasks = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE'), [rootTasks]);
  const completedTasks = useMemo(() => rootTasks.filter((task) => task.status === 'DONE'), [rootTasks]);

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
    await load();
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden p-4 text-slate-100 lg:p-6">
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
          onSelect={(task) => setEditorState({ task })}
          onSelectSubtask={(subtask) => setEditorState({ task: subtask })}
          onAddSubtask={(parentTask) =>
            setEditorState({
              task: {
                id: '',
                title: '',
                description: '',
                dueDate: null,
                importance: 3,
                urgency: 3,
                priorityScore: 3,
                status: 'TODO',
                sphereId: null,
                parentTaskId: parentTask.id,
                notifyBeforeMinutes: 60
              }
            })
          }
          onToggleSubtaskDone={async (subtask) => {
            await api.updateTask(subtask.id, { status: subtask.status === 'DONE' ? 'TODO' : 'DONE' });
            await load();
          }}
          onAddTaskToSphere={(sphere) => setEditorState({ initialSphereId: sphere.id })}
          onRenameSphere={(sphere) => setSectorEditorSphere(sphere)}
        />
        <aside className="absolute right-0 top-0 z-10 h-full w-[320px] space-y-4 border-l border-slate-700/60 bg-slate-950/96 p-4">
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">AI suggestions</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.map((insight) => <li key={insight.id}>• {insight.text}</li>)}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Выполненные задачи</h3>
            <ul className="space-y-2 text-xs text-slate-200">
              {completedTasks.length === 0 ? <li className="text-slate-400">Пока нет выполненных задач</li> : null}
              {completedTasks.map((task) => (
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
