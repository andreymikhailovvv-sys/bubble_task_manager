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
    <div className="modal-backdrop fixed inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onCancel}>
      <aside className="modal-card w-full max-w-lg space-y-4 rounded-2xl border p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-primary">Настройка сектора</h3>
        <input className="form-field w-full rounded border p-2 text-sm" placeholder="Название сектора" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="mb-2 text-sm text-muted">Цвет</p>
          <div className="grid grid-cols-6 gap-2">
            {HARMONIOUS_COLORS.map((item) => (
              <button
                key={item}
                className={`h-10 rounded border-2 ${color === item ? 'border-[color:var(--text-primary)] shadow-[0_0_0_3px_var(--focus-ring)]' : 'border-transparent'}`}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
                aria-label={item}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Иконка</p>
          <div className="grid grid-cols-5 gap-2">
            {SPHERE_ICON_OPTIONS.map(({ key, Icon }) => (
              <button
                key={key}
                className={`flex h-11 items-center justify-center rounded border text-primary ${icon === key ? 'bubble-zoom-badge border-[color:var(--accent)]' : 'secondary-button'}`}
                onClick={() => setIcon(key)}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="primary-button flex-1 rounded px-3 py-2 text-sm" onClick={() => onSave({ name, color, icon })}>Сохранить</button>
          <button className="secondary-button rounded px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
      </aside>
    </div>
  );
}
