import { useEffect, useState } from 'react';
import { SPHERE_ICON_OPTIONS } from '../lib/sphereIcons';
import type { Sphere } from '../lib/types';

type Props = {
  sphere?: Sphere;
  onCancel: () => void;
  onSave: (payload: Partial<Sphere>) => Promise<void>;
};

export const HARMONIOUS_COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#22c55e'];

export function SectorEditor({ sphere, onCancel, onSave }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(HARMONIOUS_COLORS[0]);
  const [icon, setIcon] = useState('briefcase');

  useEffect(() => {
    setName(sphere?.name ?? '');
    setColor(sphere?.color ?? HARMONIOUS_COLORS[0]);
    setIcon(sphere?.icon ?? 'briefcase');
  }, [sphere]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4" onClick={onCancel}>
      <aside className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700/50 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-100">Настройка сектора</h3>
        <input className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="Название сектора" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="mb-2 text-sm text-slate-200">Цвет</p>
          <div className="grid grid-cols-6 gap-2">
            {HARMONIOUS_COLORS.map((item) => (
              <button
                key={item}
                className={`h-10 rounded border-2 ${color === item ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
                aria-label={item}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-slate-200">Иконка</p>
          <div className="grid grid-cols-5 gap-2">
            {SPHERE_ICON_OPTIONS.map(({ key, Icon }) => (
              <button
                key={key}
                className={`flex h-11 items-center justify-center rounded border text-slate-100 ${icon === key ? 'border-cyan-300 bg-slate-700' : 'border-slate-600 bg-slate-800'}`}
                onClick={() => setIcon(key)}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm" onClick={() => onSave({ name, color, icon })}>Сохранить</button>
          <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
      </aside>
    </div>
  );
}
