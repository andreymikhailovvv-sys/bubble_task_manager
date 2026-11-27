import { useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronRight, GripVertical, LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { useScrollFade } from '../hooks/useScrollFade';
import { FULLSCREEN_AUXILIARY_OPTIONS, fullscreenPanelTitle, requiresCompanionPanel, type FullscreenWorkspacePanel } from '../lib/fullscreenWorkspacePanels';

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
  const selectMode = (value: FullscreenWorkspaceMode) => onChange([value]);

  return (
    <div className="fullscreen-mode-picker display-mode-toggle-group inline-flex shrink-0 items-center rounded-xl border p-1"
      role="group" aria-label="Режим рабочего пространства">
      {VIEW_OPTIONS.map(option => {
        const selected = modes[0] === option.value;
        const Icon = option.icon;
        return (
          <button type="button" key={option.value} data-view-mode={option.value} aria-pressed={selected} onClick={() => selectMode(option.value)}
            className={`fullscreen-mode-picker-option display-mode-toggle-button inline-flex cursor-pointer items-center rounded-lg text-sm font-semibold transition ${selected ? 'display-mode-toggle-button-active is-selected' : ''}`}
            title={option.label}>
            <Icon size={16} aria-hidden="true" />
            <span className="fullscreen-mode-picker-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type FullscreenTaskChoice = { id: string; title: string };

type BlockMenuProps = {
  forceOpen?: boolean;
  tasks: readonly FullscreenTaskChoice[];
  onSelect: (panel: FullscreenWorkspacePanel) => void;
  onDragStart: (panel: FullscreenWorkspacePanel) => void;
  onDragEnd: () => void;
};

export function FullscreenBlockMenu({ tasks, onSelect, onDragStart, onDragEnd, forceOpen = false }: BlockMenuProps) {
  const [open, setOpen] = useState(false);
  const [chooseTask, setChooseTask] = useState(false);
  const [query, setQuery] = useState('');
  const dragging = useRef(false);
  const option = (panel: FullscreenWorkspacePanel, label: string, detail?: string) => (
    <button type="button" role="menuitem" key={panel.kind === 'mode' ? panel.mode : panel.kind === 'task-ai' ? panel.taskId : panel.kind}
      className="workspace-block-option fullscreen-add-window-option" draggable
      onClick={() => { setOpen(false); onSelect(panel); }}
      onDragStart={event => {
        dragging.current = true;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-planirovych-block', 'workspace-block');
        onDragStart(panel);
      }}
      onDragEnd={() => { dragging.current = false; setOpen(false); onDragEnd(); }}>
      <span><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
      <GripVertical size={16} aria-label="Можно перетащить" />
    </button>
  );
  return <div className="workspace-block-menu relative"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => { if (!dragging.current) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open || forceOpen}
      className="add-menu-option mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold"
      onClick={() => setOpen(true)}><LayoutGrid size={14}/> Добавить блок <ChevronRight size={14} className="ml-auto"/></button>
    {(open || forceOpen) && <div className="workspace-block-submenu topbar-dropdown rounded-2xl border p-2 shadow-2xl" role="menu" aria-label="Доступные блоки">
      {chooseTask ? <>
        <button type="button" className="workspace-block-option" onClick={() => { setChooseTask(false); setQuery(''); }}>← Все блоки</button>
        <label className="fullscreen-add-window-search mb-2 flex items-center gap-2 rounded-xl border px-3 py-2">
          <Search size={14}/><input type="search" autoFocus className="w-full min-w-0 bg-transparent text-sm outline-none" value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Поиск по задачам" aria-label="Поиск задачи для блока"/>
        </label>
        {tasks.filter(task => task.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))).slice(0, 60)
          .map(task => option({ kind: 'task-ai', taskId: task.id }, task.title))}
      </> : <>
        {VIEW_OPTIONS.map(view => option({ kind: 'mode', mode: view.value }, view.label))}
        {FULLSCREEN_AUXILIARY_OPTIONS.map(item => item.kind === 'task-ai' ?
          <button key={item.kind} type="button" role="menuitem" className="workspace-block-option fullscreen-add-window-option" onClick={() => setChooseTask(true)}>
            <span><strong>{item.title}</strong><small>{item.description} · только в паре</small></span><ChevronRight size={16}/>
          </button> : option({ kind: item.kind }, item.title, item.description + (item.kind === 'general-ai' ? ' · только в паре' : '')))}
      </>}
    </div>}
  </div>;
}

function BlockDropTarget({ add = false, onPlace }: { add?: boolean; onPlace: () => void }) {
  const [over, setOver] = useState(false);
  const isBlock = (event: DragEvent) => event.dataTransfer.types.includes('application/x-planirovych-block');
  return <button type="button" className={`workspace-block-target ${over ? 'is-over' : ''}`}
    onClick={onPlace}
    onDragOver={event => { if (isBlock(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; setOver(true); } }}
    onDragLeave={() => setOver(false)}
    onDrop={event => { if (!isBlock(event)) return; event.preventDefault(); event.stopPropagation(); setOver(false); onPlace(); }}>
    <span className="workspace-block-target-plus"><Plus size={25}/></span>
    <span>{add ? 'Добавить блок' : 'Нажмите, чтобы заменить блок'}</span>
  </button>;
}

export function FullscreenWorkspaceSingle({ panel, renderPanel, onChoose, onReplace, placement }: {
  panel: FullscreenWorkspacePanel;
  renderPanel: (panel: FullscreenWorkspacePanel) => ReactNode;
  onChoose: (side: 'left' | 'right', panel: FullscreenWorkspacePanel) => void;
  onReplace: (panel: FullscreenWorkspacePanel) => void;
  placement: FullscreenWorkspacePanel | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollFade(rootRef);
  return (
    <div ref={rootRef} className={`fullscreen-workspace-single ${panel.kind === 'mode' && panel.mode !== 'bubbles' ? 'fullscreen-workspace-single--open' : ''}`}>
      {placement && <aside className="fullscreen-workspace-single-rail fullscreen-workspace-single-rail--left workspace-placement-rail"><BlockDropTarget add onPlace={() => onChoose('left', placement)}/></aside>}
      <section className="fullscreen-workspace-single-content min-h-0 min-w-0 flex-1">
        {renderPanel(panel)}
        {placement && !requiresCompanionPanel(placement) && <BlockDropTarget onPlace={() => onReplace(placement)}/>}
      </section>
      {placement && <aside className="fullscreen-workspace-single-rail fullscreen-workspace-single-rail--right workspace-placement-rail"><BlockDropTarget add onPlace={() => onChoose('right', placement)}/></aside>}
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

export function FullscreenWorkspaceSplit({ panels, renderPanel, ratio, onRatioChange, onChoose, placement, onSwap }: {
  panels: [FullscreenWorkspacePanel, FullscreenWorkspacePanel];
  renderPanel: (panel: FullscreenWorkspacePanel) => ReactNode;
  onChoose: (side: 0 | 1, panel: FullscreenWorkspacePanel) => void;
  placement: FullscreenWorkspacePanel | null;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  onSwap: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollFade(rootRef);
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
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSwap(); return; }
    else return;
    event.preventDefault();
    onRatioChange(clampSplit(next));
  };

  return (
    <div ref={rootRef} className="fullscreen-workspace-split"
      style={{ '--fullscreen-split-ratio': `${ratio}%` } as CSSProperties}
      aria-label="Рабочее пространство с двумя режимами">
      <section key={JSON.stringify(panels[0])} className="fullscreen-workspace-pane" data-fullscreen-pane-index="0" aria-label={`Окно: ${fullscreenPanelTitle(panels[0])}`}>
        {renderPanel(panels[0])}
        {placement && <BlockDropTarget onPlace={() => onChoose(0, placement)}/>}
      </section>
      <div className="fullscreen-workspace-divider" role="separator" tabIndex={0} key="workspace-divider"
        aria-label="Изменить размер областей рабочего пространства" aria-valuemin={25} aria-valuemax={75}
        aria-valuenow={ratio} title="Перетащите для изменения размера. Двойной клик или Enter меняет окна местами."
        onPointerDown={onDividerDown} onPointerMove={onDividerMove}
        onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={onDividerKeyDown}
        onDoubleClick={onSwap}>
        <span className="fullscreen-workspace-divider-grip"><GripVertical size={16} /></span>
      </div>
      <section key={JSON.stringify(panels[1])} className="fullscreen-workspace-pane" data-fullscreen-pane-index="1" aria-label={`Окно: ${fullscreenPanelTitle(panels[1])}`}>
        {renderPanel(panels[1])}
        {placement && <BlockDropTarget onPlace={() => onChoose(1, placement)}/>}
      </section>
    </div>
  );
}
