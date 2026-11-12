import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, GripVertical, LayoutGrid, List, Plus, X } from 'lucide-react';
import { FULLSCREEN_AUXILIARY_OPTIONS, fullscreenPanelTitle, type FullscreenAuxiliaryKind, type FullscreenWorkspacePanel } from '../lib/fullscreenWorkspacePanels';

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

/** Dedicated slot chooser. It does not touch task data or open other global
 * dialogs; the chosen panel only reserves the secondary workspace slot. */
export function FullscreenAddWindowMenu({ onAdd }: { onAdd: (kind: FullscreenAuxiliaryKind) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className="fullscreen-add-window relative shrink-0" ref={rootRef}>
      <button type="button" className="fullscreen-add-window-trigger topbar-action-button inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-semibold"
        aria-label="Добавить окно в рабочее пространство" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(previous => !previous)}>
        <Plus size={16} aria-hidden="true" />
        <span>Окно</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="fullscreen-add-window-menu topbar-dropdown absolute left-0 top-[calc(100%+9px)] z-[80] w-64 rounded-2xl border p-2 shadow-2xl"
          role="menu" aria-label="Добавить рабочее окно">
          <div className="px-2 pb-2 pt-1 text-xs text-muted">Доступные слоты для будущих окон</div>
          {FULLSCREEN_AUXILIARY_OPTIONS.map(option => (
            <button type="button" key={option.kind} role="menuitem"
              className="fullscreen-add-window-option flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition"
              onClick={() => { onAdd(option.kind); setOpen(false); }}>
              <span className="text-sm font-semibold">{option.title}</span>
              <span className="text-xs text-muted">{option.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Temporary content while the real feature panels are being designed.
 * Makes adding, replacing and closing a slot functional without duplicating
 * existing chat sessions, task windows or notes state. */
export function FullscreenFuturePanel({ panel, onClose }: {
  panel: Exclude<FullscreenWorkspacePanel, { kind: 'mode' }>;
  onClose: () => void;
}) {
  const title = fullscreenPanelTitle(panel);
  return (
    <section className="fullscreen-future-panel relative flex h-full w-full items-center justify-center p-6"
      data-fullscreen-future-panel={panel.kind} aria-label={title}>
      <button type="button" onClick={onClose} aria-label={`Убрать окно «${title}»`}
        className="fullscreen-future-panel-close absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border">
        <X size={16} />
      </button>
      <div className="max-w-sm text-center">
        <div className="mb-2 text-base font-semibold text-primary">{title}</div>
        <p className="text-sm text-muted">
          Место для этого окна подготовлено. Содержимое и оформление добавим отдельно.
        </p>
      </div>
    </section>
  );
}

export function FullscreenWorkspaceSplit({ panels, renderPanel, ratio, onRatioChange }: {
  panels: [FullscreenWorkspacePanel, FullscreenWorkspacePanel];
  renderPanel: (panel: FullscreenWorkspacePanel) => ReactNode;
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
      <section className="fullscreen-workspace-pane" aria-label={`Окно: ${fullscreenPanelTitle(panels[0])}`}>
        {renderPanel(panels[0])}
      </section>
      <div className="fullscreen-workspace-divider" role="separator" tabIndex={0}
        aria-label="Изменить размер областей рабочего пространства" aria-valuemin={25} aria-valuemax={75}
        aria-valuenow={ratio} title="Перетащите для изменения размера. Стрелки на клавиатуре тоже работают."
        onPointerDown={onDividerDown} onPointerMove={onDividerMove}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={onDividerKeyDown}
        onDoubleClick={() => onRatioChange(50)}>
        <span className="fullscreen-workspace-divider-grip"><GripVertical size={16} /></span>
      </div>
      <section className="fullscreen-workspace-pane" aria-label={`Окно: ${fullscreenPanelTitle(panels[1])}`}>
        {renderPanel(panels[1])}
      </section>
    </div>
  );
}
