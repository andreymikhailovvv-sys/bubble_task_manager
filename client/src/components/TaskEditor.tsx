import { useEffect, useState } from 'react';
import type { Sphere, Task, TaskStatus } from '../lib/types';

type Props = {
  task?: Task;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function TaskEditor({ task, spheres, onSave, onDelete }: Props) {
  const [form, setForm] = useState<Partial<Task>>({ importance: 3, urgency: 3, status: 'TODO' });

  useEffect(() => {
    setForm(task ?? { importance: 3, urgency: 3, status: 'TODO' });
  }, [task]);

  const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

  return (
    <aside className="space-y-3 rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
      <h3 className="text-lg font-semibold text-slate-100">{task ? 'Редактирование задачи' : 'Новая задача'}</h3>
      <input className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="Название" value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
      <textarea className="min-h-20 w-full rounded bg-slate-800 p-2 text-sm" placeholder="Описание" value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      <select className="w-full rounded bg-slate-800 p-2 text-sm" value={form.sphereId ?? ''} onChange={(e) => setForm((p) => ({ ...p, sphereId: e.target.value || null }))}>
        <option value="">Без сферы</option>
        {spheres.map((sphere) => (
          <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Важность: {form.importance}
          <input type="range" min={1} max={5} value={form.importance ?? 3} onChange={(e) => setForm((p) => ({ ...p, importance: Number(e.target.value) }))} />
        </label>
        <label className="text-xs">Срочность: {form.urgency}
          <input type="range" min={1} max={5} value={form.urgency ?? 3} onChange={(e) => setForm((p) => ({ ...p, urgency: Number(e.target.value) }))} />
        </label>
      </div>
      <select className="w-full rounded bg-slate-800 p-2 text-sm" value={form.status ?? 'TODO'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TaskStatus }))}>
        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <input type="date" className="w-full rounded bg-slate-800 p-2 text-sm" value={form.dueDate ? form.dueDate.slice(0, 10) : ''} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value || null }))} />
      <div className="rounded bg-slate-800/60 p-2 text-xs text-slate-300">AI-поле: здесь будет анализ LLM. Пока локальные эвристики.</div>
      <div className="flex gap-2">
        <button className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm" onClick={() => onSave(form)}>Сохранить</button>
        {task ? <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={() => onDelete?.()}>Удалить</button> : null}
      </div>
    </aside>
  );
}
