import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Sphere, Task } from '../lib/types';
import { DateTimePickerWithApply } from './DateTimePickerWithApply';

type Props = {
  task?: Task;
  initialSphereId?: string;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onComplete?: () => Promise<void>;
};
const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;

const IMPORTANCE_STYLES: Record<number, string> = {
  1: 'bg-sky-500/70 border-sky-300',
  2: 'bg-cyan-500/70 border-cyan-300',
  3: 'bg-violet-500/70 border-violet-300',
  4: 'bg-orange-500/70 border-orange-300',
  5: 'bg-rose-500/75 border-rose-300'
};

export function TaskEditor({ task, initialSphereId, spheres, onSave, onDelete, onCancel, onComplete }: Props) {
  const isEditing = Boolean(task?.id);
  const [form, setForm] = useState<Partial<Task>>({ importance: 3, sphereId: initialSphereId ?? null });
  const [notifyPreset, setNotifyPreset] = useState<string>('60');
  const dueDateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextForm = task ?? { importance: 3, sphereId: initialSphereId ?? null, status: 'TODO', notifyBeforeMinutes: 60 };
    setForm(nextForm);
    if (nextForm.notifyBeforeMinutes === null) {
      setNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(nextForm.notifyBeforeMinutes ?? 60)) {
      setNotifyPreset(String(nextForm.notifyBeforeMinutes ?? 60));
    } else {
      setNotifyPreset('60');
      setForm((prev) => ({ ...prev, notifyBeforeMinutes: 60 }));
    }
  }, [task, initialSphereId]);

  const selectedImportance = form.importance ?? 3;
  const isSubtask = Boolean(form.parentTaskId);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4" onClick={onCancel}>
      <aside className="w-full max-w-xl space-y-3 rounded-2xl border border-slate-700/50 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-100">{isEditing ? 'Редактирование задачи' : 'Новая задача'}</h3>
        <input className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="Название" value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        <textarea className="min-h-20 w-full rounded bg-slate-800 p-2 text-sm" placeholder="Описание" value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        {!isSubtask ? (
          <>
            <select className="w-full rounded bg-slate-800 p-2 text-sm" value={form.sphereId ?? ''} onChange={(e) => setForm((p) => ({ ...p, sphereId: e.target.value || null }))}>
              <option value="">Без сектора</option>
              {spheres.map((sphere) => (
                <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
              ))}
            </select>
            <div>
              <p className="mb-1 text-xs">Важность: {selectedImportance}</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    className={`rounded border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${selectedImportance === level ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'}`}
                    onClick={() => setForm((p) => ({ ...p, importance: level }))}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        <label className="block text-xs">Срок (дата и время)
          <DateTimePickerWithApply
            className="mt-1"
            value={form.dueDate}
            onChange={(nextValue) => setForm((p) => ({ ...p, dueDate: nextValue }))}
          />
        </label>
        <label className="block text-xs">Уведомлять за
          <select
            className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
            value={notifyPreset}
            onChange={(e) => {
              const value = e.target.value;
              setNotifyPreset(value);
              if (value === 'null') {
                setForm((p) => ({ ...p, notifyBeforeMinutes: null }));
              } else {
                setForm((p) => ({ ...p, notifyBeforeMinutes: Number(value) }));
              }
            }}
          >
            {NOTIFY_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm" onClick={() => onSave(form)}>Сохранить</button>
          {isEditing ? <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={() => onDelete?.()}>Удалить</button> : null}
          <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
        {isEditing ? (
          <button className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold" onClick={() => onComplete?.()}>
            Выполнена
          </button>
        ) : null}
      </aside>
    </div>
  );
}
