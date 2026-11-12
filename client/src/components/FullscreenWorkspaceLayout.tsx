import { useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CalendarDays, GripVertical, LayoutGrid, List } from 'lucide-react';

export type FullscreenWorkspaceMode = 'bubbles' | 'list' | 'timeline';

const VIEW_OPTIONS = [
  { value: 'bubbles', label: 'Пузыри', icon: LayoutGrid },
  { value: 'list', label: 'Список', icon: List },
  { value: 'timeline', label: 'Таймлайн', icon: CalendarDays }
] as const;

const clampSplit = (value: number) => Math.max(25, Math.min(75, Math.round(value)));

export function FullscreenModePicker({ modes, onChange }: {
  modes: FullscreenWorkspaceMode[];
  onChange: (next: FullscreenWorkspaceMode[]) => void;
}) {
  const toggle = (value: FullscreenWorkspaceMode) => {
    if (modes.includes(value)) {
      // Keep at least one active view.
      if (modes.length > 1) onChange(modes.filter(mode => mode !== value));
    } else if (modes.length === 2) {
      // The first mode stays anchored when the third one replaces the second.
      onChange([modes[0], value]);
    } else {
      onChange([...modes, value]);
    }
  };

  return (
    <div className="fullscreen-mode-picker display-mode-toggle-group inline-flex shrink-0 items-center rounded-xl border p-1"
      role="group" aria-label="Режимы рабочего пространства, выберите один или два">
      {VIEW_OPTIONS.map(option => {
        const selected = modes.includes(option.value);
        const Icon = option.icon;
        return (
          <label key={option.value}
            className={`fullscreen-mode-picker-option display-mode-toggle-button inline-flex cursor-pointer items-center rounded-lg text-sm font-semibold transition ${selected ? 'display-mode-toggle-button-active is-selected' : ''}`}
            title={selected && modes.length === 1 ? 'Необходимо оставить хотя бы один режим' : option.label}>
            <Icon size={16} aria-hidden="true" />
            <span className="fullscreen-mode-picker-label">{option.label}</span>
            <input type="checkbox" className="fullscreen-mode-picker-checkbox" checked={selected}
              onChange={() => toggle(option.value)} aria-label={`Показать режим «${option.label}»`} />
          </label>
        );
      })}
    </div>
  );
}

export function FullscreenWorkspaceSplit({ modes, renderMode, ratio, onRatioChange }: {
  modes: [FullscreenWorkspaceMode, FullscreenWorkspaceMode];
  renderMode: (mode: FullscreenWorkspaceMode) => ReactNode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pendingRatioRef = useRef(ratio);

  const changeFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const vertical = window.matchMedia('(max-width: 900px)').matches;
    const raw = vertical ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    const next = clampSplit(raw * 100);
    pendingRatioRef.current = next;
    // Move the divider without re-rendering both expensive workspace views.
    root.style.setProperty('--fullscreen-split-ratio', `${next}%`);
  };

  const onDividerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerIdRef.current = event.pointerId;
    pendingRatioRef.current = ratio;
    event.currentTarget.setPointerCapture(event.pointerId);
    changeFromPointer(event);
    event.preventDefault();
  };
  const onDividerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === event.pointerId) changeFromPointer(event);
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    onRatioChange(pendingRatioRef.current);
  };
  const onDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const vertical = window.matchMedia('(max-width: 900px)').matches;
    const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    let next = ratio;
    if (event.key === backward) next -= event.shiftKey ? 10 : 5;
    else if (event.key === forward) next += event.shiftKey ? 10 : 5;
    else if (event.key === 'Home') next = 25;
    else if (event.key === 'End') next = 75;
    else return;
    event.preventDefault();
    onRatioChange(clampSplit(next));
  };

  return (
    <div ref={rootRef} className="fullscreen-workspace-split"
      style={{ '--fullscreen-split-ratio': `${ratio}%` } as CSSProperties}
      aria-label="Рабочее пространство с двумя режимами">
      <section className="fullscreen-workspace-pane" aria-label={`Режим: ${VIEW_OPTIONS.find(o => o.value === modes[0])?.label}`}>
        {renderMode(modes[0])}
      </section>
      <div className="fullscreen-workspace-divider" role="separator" tabIndex={0}
        aria-label="Изменить размер областей рабочего пространства" aria-valuemin={25} aria-valuemax={75}
        aria-valuenow={ratio} title="Перетащите для изменения размера. Стрелки на клавиатуре тоже работают."
        onPointerDown={onDividerDown} onPointerMove={onDividerMove}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={onDividerKeyDown}
        onDoubleClick={() => onRatioChange(50)}>
        <span className="fullscreen-workspace-divider-grip"><GripVertical size={16} /></span>
      </div>
      <section className="fullscreen-workspace-pane" aria-label={`Режим: ${VIEW_OPTIONS.find(o => o.value === modes[1])?.label}`}>
        {renderMode(modes[1])}
      </section>
    </div>
  );
}
