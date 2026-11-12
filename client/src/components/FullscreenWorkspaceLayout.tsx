import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, GripVertical, LayoutGrid, List, PanelsTopLeft } from 'lucide-react';

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});
  const updateMenuPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(256, Math.max(160, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const openAbove = below < 260 && above > below;
    setMenuPosition({
      position: 'fixed', width, left,
      top: openAbove ? undefined : rect.bottom + 8,
      bottom: openAbove ? window.innerHeight - rect.top + 8 : undefined,
      maxHeight: Math.max(130, Math.min(390, openAbove ? above - 8 : below - 8)),
      overflowY: 'auto'
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const updateOnViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', updateOnViewportChange);
    window.addEventListener('scroll', updateOnViewportChange, true);
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
      window.removeEventListener('resize', updateOnViewportChange);
      window.removeEventListener('scroll', updateOnViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  const toggle = (value: FullscreenWorkspaceMode) => {
    if (modes.includes(value)) {
      if (modes.length > 1) onChange(modes.filter(mode => mode !== value));
    } else if (modes.length === 2) {
      // The first mode remains anchored; choosing a third replaces the second.
      onChange([modes[0], value]);
    } else {
      onChange([...modes, value]);
    }
  };

  return (
    <div className="fullscreen-mode-picker relative shrink-0" ref={rootRef}>
      <button ref={triggerRef} type="button" className="fullscreen-mode-picker-trigger topbar-action-button inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
        aria-label="Выбрать один или два режима отображения" aria-haspopup="true" aria-expanded={open}
        onClick={() => { if (!open) updateMenuPosition(); setOpen(value => !value); }}>
        <PanelsTopLeft size={17} />
        <span>Режимы <span className="fullscreen-mode-picker-count">{modes.length}/2</span></span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open ? createPortal(
        <div ref={panelRef} className="fullscreen-mode-picker-menu topbar-dropdown fixed z-[2147483640] rounded-2xl border p-2.5 shadow-2xl" style={menuPosition}
          role="group" aria-label="Режимы рабочего пространства">
          <div className="px-2 pb-2 pt-1">
            <p className="text-xs font-bold text-primary">Отображение пространства</p>
            <p className="mt-1 text-[11px] leading-4 text-muted">Выберите до двух режимов одновременно.</p>
          </div>
          {VIEW_OPTIONS.map(option => {
            const selected = modes.includes(option.value);
            const Icon = option.icon;
            return (
              <button key={option.value} type="button"
                className={`fullscreen-mode-picker-option flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${selected ? 'is-selected' : ''}`}
                aria-pressed={selected} onClick={() => toggle(option.value)}
                title={selected && modes.length === 1 ? 'Необходимо оставить хотя бы один режим' : option.label}>
                <Icon size={17} className="fullscreen-mode-picker-option-icon" />
                <span className="flex-1 font-semibold">{option.label}</span>
                <span className={`fullscreen-mode-picker-check flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'is-selected' : ''}`}>
                  {selected ? <Check size={13} strokeWidth={2.7} /> : null}
                </span>
              </button>
            );
          })}
          <div className="fullscreen-mode-picker-hint mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-4">
            {modes.length === 2
              ? 'Новый выбор заменит второй режим. Разделитель можно перетаскивать.'
              : 'Второй режим откроется рядом с первым.'}
          </div>
        </div>
      , document.body) : null}
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
