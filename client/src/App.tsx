import { useEffect, useMemo, useState } from 'react';
import { Brain, Plus, Sparkles } from 'lucide-react';
import { BubbleField } from './components/BubbleField';
import { TaskEditor } from './components/TaskEditor';
import { api } from './lib/api';
import { calcScore } from './lib/layout';
import type { Insight, Sphere, Task } from './lib/types';

function suggestPriority(task: Partial<Task>) {
  const title = (task.title ?? '').toLowerCase();
  let importance = task.importance ?? 3;

  if (/релиз|клиент|налог|экзамен/.test(title)) importance = Math.min(5, importance + 1);

  return { importance };
}

export default function App() {
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task>();
  const [mode, setMode] = useState<'global' | 'sectors'>('sectors');
  const [search, setSearch] = useState('');
  const [sphereFilter, setSphereFilter] = useState('ALL');
  const [insights, setInsights] = useState<Insight[]>([]);

  async function load() {
    const [sphereData, taskData, insightData] = await Promise.all([api.getSpheres(), api.getTasks(), api.getInsights()]);
    setSpheres(sphereData);
    setTasks(taskData);
    setInsights(insightData);
  }

  useEffect(() => {
    load();
  }, []);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (sphereFilter !== 'ALL' && task.sphereId !== sphereFilter) return false;
        return true;
      }),
    [tasks, search, sphereFilter]
  );

  const persistTask = async (payload: Partial<Task>) => {
    const normalized = {
      ...payload,
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3
    };
    const score = calcScore(normalized.importance, normalized.urgency);

    if (selected) {
      await api.updateTask(selected.id, { ...normalized, priorityScore: score });
    } else {
      await api.createTask({ ...normalized, priorityScore: score });
    }
    setSelected(undefined);
    await load();
  };

  return (
    <main className="min-h-screen p-4 text-slate-100 lg:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 backdrop-blur">
        <h1 className="mr-3 text-xl font-semibold">Bubble Task Manager</h1>
        <input className="min-w-52 flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm" placeholder="Поиск по задачам" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => setMode((m) => (m === 'global' ? 'sectors' : 'global'))}>{mode === 'global' ? 'Сектора' : 'Общий круг'}</button>
        <button className="flex items-center gap-1 rounded bg-cyan-700 px-3 py-2 text-sm" onClick={() => setSelected(undefined)}><Plus size={16} /> Задача</button>
        <button
          className="flex items-center gap-1 rounded bg-indigo-700 px-3 py-2 text-sm"
          onClick={async () => {
            const name = prompt('Название сферы');
            if (!name) return;
            await api.createSphere({ name, color: `hsl(${Math.round(Math.random() * 360)} 85% 65%)` });
            await load();
          }}
        >
          <Plus size={16} /> Сфера
        </button>
      </header>

      <section className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <select className="rounded bg-slate-800 p-2 text-sm" value={sphereFilter} onChange={(e) => setSphereFilter(e.target.value)}>
          <option value="ALL">Все сферы</option>
          {spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
        </select>
        <button
          className="flex items-center justify-center gap-2 rounded bg-fuchsia-700 px-3 py-2 text-sm"
          onClick={async () => {
            if (!selected) return;
            const next = suggestPriority(selected);
            setSelected({ ...selected, ...next });
          }}
        >
          <Sparkles size={16} /> AI-оценка важности
        </button>
        <button className="flex items-center justify-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => alert('AI-разбор будет подключен позже через backend endpoint')}>
          <Brain size={16} /> AI-разобрать задачу
        </button>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <BubbleField tasks={visibleTasks} spheres={spheres} mode={mode} selectedId={selected?.id} onSelect={setSelected} />
        <div className="space-y-4">
          <TaskEditor
            task={selected}
            spheres={spheres}
            onSave={persistTask}
            onDelete={selected ? async () => {
              await api.deleteTask(selected.id);
              setSelected(undefined);
              await load();
            } : undefined}
          />
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">AI suggestions</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.map((insight) => <li key={insight.id}>• {insight.text}</li>)}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Управление сферами</h3>
            <ul className="space-y-2 text-xs">
              {spheres.map((sphere) => (
                <li key={sphere.id} className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1">
                  <span>{sphere.name}</span>
                  <button className="text-rose-300" onClick={async () => {
                    if (!confirm(`Удалить сферу ${sphere.name}?`)) return;
                    await api.deleteSphere(sphere.id);
                    await load();
                  }}>Удалить</button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
