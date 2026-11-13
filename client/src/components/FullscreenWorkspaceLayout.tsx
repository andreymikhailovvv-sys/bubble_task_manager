import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, GripVertical, LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
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

export type FullscreenTaskChoice = { id: string; title: string };

/** One menu for the solo right rail and either side of the split divider.
 * All popups live in a body portal, so narrow panes never clip the selector. */
export function FullscreenAddWindowMenu({ onChoose, tasks, side, compact = true }: {
  onChoose: (panel: FullscreenWorkspacePanel) => void;
  tasks: readonly FullscreenTaskChoice[];
  side: 'left' | 'right';
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [chooseTask, setChooseTask] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.max(12, Math.min(
        side === 'left' ? rect.right - width : rect.left, window.innerWidth - width - 12
      ));
      const above = window.innerHeight - rect.bottom < 320 && rect.top > 320;
      setPosition({
        position: 'fixed',
        width,
        left,
        top: above ? undefined : rect.bottom + 10,
        bottom: above ? window.innerHeight - rect.top + 10 : undefined,
        maxHeight: Math.min(470, Math.max(150, above ? rect.top - 24 : window.innerHeight - rect.bottom - 24))
      });
    };
    reposition();
    const outside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, side]);

  const choose = (panel: FullscreenWorkspacePanel) => {
    onChoose(panel);
    setOpen(false);
    setChooseTask(false);
    setQuery('');
  };
  const matchingTasks = tasks
    .filter(task => task.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
    .slice(0, 60);

  return (
    <div ref={rootRef} className={`fullscreen-add-window relative shrink-0 ${compact ? 'fullscreen-add-window--compact' : ''}`}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}>
      <button type="button" className="fullscreen-add-window-trigger topbar-action-button inline-flex items-center justify-center gap-1.5 rounded-xl border p-1.5 text-sm font-semibold"
        aria-label={`Добавить или заменить ${side === 'left' ? 'левое' : 'правое'} окно`}
        title={`Добавить или заменить ${side === 'left' ? 'левое' : 'правое'} окно`}
        aria-haspopup="menu" aria-expanded={open}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); setOpen(value => !value); setChooseTask(false); setQuery(''); }}>
        <Plus size={15} aria-hidden="true" />
        {!compact ? <span>Добавить окно</span> : null}
      </button>
      {open ? createPortal(
        <div ref={popupRef} style={position}
          className="fullscreen-add-window-menu topbar-dropdown fixed z-[2147483640] flex flex-col overflow-hidden rounded-2xl border p-2 shadow-2xl"
          role="menu" aria-label="Выбрать окно рабочего пространства">
          {chooseTask ? (
            <>
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <button type="button" className="text-xs font-semibold text-muted" onClick={() => setChooseTask(false)}>← Назад</button>
                <span className="text-xs font-semibold text-primary">Выберите задачу</span>
              </div>
              <label className="fullscreen-add-window-search mb-2 flex items-center gap-2 rounded-xl border px-3 py-2">
                <Search size={14} className="shrink-0" />
                <input type="search" autoFocus className="w-full min-w-0 bg-transparent text-sm outline-none"
                  value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск по задачам" aria-label="Поиск задачи для окна Focus" />
              </label>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {matchingTasks.map(task => (
                  <button key={task.id} type="button" role="menuitem"
                    className="fullscreen-add-window-option block w-full truncate rounded-lg px-3 py-2 text-left text-sm"
                    title={task.title} onClick={() => choose({ kind: 'task-ai', taskId: task.id })}>{task.title}</button>
                ))}
                {matchingTasks.length === 0 ? <p className="p-3 text-xs text-muted">Задачи не найдены</p> : null}
              </div>
            </>
          ) : (
            <div className="min-h-0 space-y-1 overflow-y-auto">
              <div className="px-2 pb-1 pt-1 text-[11px] font-semibold text-muted">Отображение</div>
              {VIEW_OPTIONS.map(option => (
                <button type="button" role="menuitem" key={option.value}
                  className="fullscreen-add-window-option flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
                  onClick={() => choose({ kind: 'mode', mode: option.value })}>
                  <option.icon size={15} /> {option.label}
                </button>
              ))}
              <div className="my-2 border-t" style={{ borderColor: 'var(--panel-border)' }} />
              <div className="px-2 pb-1 text-[11px] font-semibold text-muted">Рабочие окна</div>
              {FULLSCREEN_AUXILIARY_OPTIONS.map(option => (
                <button type="button" key={option.kind} role="menuitem"
                  className="fullscreen-add-window-option flex w-full flex-col rounded-lg px-3 py-2 text-left transition"
                  onClick={() => option.kind === 'task-ai'
                    ? setChooseTask(true)
                    : choose({ kind: option.kind } as FullscreenWorkspacePanel)}>
                  <span className="text-sm font-semibold">{option.title}</span>
                  <span className="text-[11px] text-muted">{option.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>, document.body
      ) : null}
    </div>
  );
}

/** In solo mode the user may add a new window on EITHER side of the current one.
 * The left plus inserts before the active pane; the right plus appends after it. */
export function FullscreenWorkspaceSingle({ panel, renderPanel, onChoose, tasks }: {
  panel: FullscreenWorkspacePanel;
  renderPanel: (panel: FullscreenWorkspacePanel) => ReactNode;
  onChoose: (side: 'left' | 'right', panel: FullscreenWorkspacePanel) => void;
  tasks: readonly FullscreenTaskChoice[];
}) {
  return (
    <div className={`fullscreen-workspace-single ${panel.kind === 'mode' && panel.mode !== 'bubbles' ? 'fullscreen-workspace-single--open' : ''}`}>
      <aside className="fullscreen-workspace-single-rail fullscreen-workspace-single-rail--left" aria-label="Добавить окно слева">
        <FullscreenAddWindowMenu side="left" tasks={tasks} onChoose={next => onChoose('left', next)} />
      </aside>
      <section className="fullscreen-workspace-single-content min-h-0 min-w-0 flex-1">
        {renderPanel(panel)}
      </section>
      <aside className="fullscreen-workspace-single-rail fullscreen-workspace-single-rail--right" aria-label="Добавить окно справа">
        <FullscreenAddWindowMenu side="right" tasks={tasks} onChoose={next => onChoose('right', next)} />
      </aside>
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

export function FullscreenWorkspaceSplit({ panels, renderPanel, ratio, onRatioChange, onChoose, tasks }: {
  panels: [FullscreenWorkspacePanel, FullscreenWorkspacePanel];
  renderPanel: (panel: FullscreenWorkspacePanel) => ReactNode;
  onChoose: (side: 0 | 1, panel: FullscreenWorkspacePanel) => void;
  tasks: readonly FullscreenTaskChoice[];
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
    if (event.button !== 0 || (event.target as HTMLElement).closest('.fullscreen-add-window')) return;
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
      <section className="fullscreen-workspace-pane" data-fullscreen-pane-index="0" aria-label={`Окно: ${fullscreenPanelTitle(panels[0])}`}>
        {renderPanel(panels[0])}
      </section>
      <div className="fullscreen-workspace-divider" role="separator" tabIndex={0}
        aria-label="Изменить размер областей рабочего пространства" aria-valuemin={25} aria-valuemax={75}
        aria-valuenow={ratio} title="Перетащите для изменения размера. Стрелки на клавиатуре тоже работают."
        onPointerDown={onDividerDown} onPointerMove={onDividerMove}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={onDividerKeyDown}
        onDoubleClick={() => onRatioChange(50)}>
        <FullscreenAddWindowMenu side="left" tasks={tasks} onChoose={next => onChoose(0, next)} />
        <span className="fullscreen-workspace-divider-grip"><GripVertical size={16} /></span>
        <FullscreenAddWindowMenu side="right" tasks={tasks} onChoose={next => onChoose(1, next)} />
      </div>
      <section className="fullscreen-workspace-pane" data-fullscreen-pane-index="1" aria-label={`Окно: ${fullscreenPanelTitle(panels[1])}`}>
        {renderPanel(panels[1])}
      </section>
    </div>
  );
}
