import { useEffect, useState } from 'react';
import type { Sphere, Task } from '../lib/types';

type Props = {
  task?: Task;
  initialSphereId?: string;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
};

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function TaskEditor({ task, initialSphereId, spheres, onSave, onDelete, onCancel }: Props) {
  const [form, setForm] = useState<Partial<Task>>({ importance: 3, sphereId: initialSphereId ?? null });

  useEffect(() => {
    setForm(task ?? { importance: 3, sphereId: initialSphereId ?? null });
  }, [task, initialSphereId]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4" onClick={onCancel}>
      <aside className="w-full max-w-xl space-y-3 rounded-2xl border border-slate-700/50 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-100">{task ? 'Редактирование задачи' : 'Новая задача'}</h3>
        <input className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="Название" value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        <textarea className="min-h-20 w-full rounded bg-slate-800 p-2 text-sm" placeholder="Описание" value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <select className="w-full rounded bg-slate-800 p-2 text-sm" value={form.sphereId ?? ''} onChange={(e) => setForm((p) => ({ ...p, sphereId: e.target.value || null }))}>
          <option value="">Без сектора</option>
          {spheres.map((sphere) => (
            <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
          ))}
        </select>
        <label className="block text-xs">Важность: {form.importance ?? 3}
          <input className="mt-1 w-full" type="range" min={1} max={5} value={form.importance ?? 3} onChange={(e) => setForm((p) => ({ ...p, importance: Number(e.target.value) }))} />
        </label>
        <label className="block text-xs">Срок (дата и время)
          <input
            type="datetime-local"
            className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
            value={toDateTimeLocal(form.dueDate)}
            onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
          />
        </label>
        <div className="rounded bg-slate-800/60 p-2 text-xs text-slate-300">Срочность рассчитывается автоматически: чем ближе срок к текущему времени в Москве, тем задача срочнее.</div>
        <div className="flex gap-2">
          <button className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm" onClick={() => onSave(form)}>Сохранить</button>
          {task ? <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={() => onDelete?.()}>Удалить</button> : null}
          <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
      </aside>
    </div>
  );
}
