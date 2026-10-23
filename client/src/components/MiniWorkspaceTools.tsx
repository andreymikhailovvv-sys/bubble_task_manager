import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, List, ListFilter, Loader2, Sparkles, StickyNote } from 'lucide-react';
import type { Sphere } from '../lib/types';

type TimeFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'month';
type SortMode = 'importance' | 'urgency';

const timeOptions: Array<{ value: TimeFilter; label: string }> = [
  { value: 'all', label: 'За всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' }
];

type Props = {
  mode: 'list' | 'timeline';
  timeFilter: TimeFilter;
  onTimeFilterChange: (value: TimeFilter) => void;
  sortMode: SortMode;
  onSortChange: (value: SortMode) => void;
  spheres: Sphere[];
  selectedSphereIds: string[] | null;
  onSelectAllSpheres: (all: boolean) => void;
  onToggleSphere: (id: string) => void;
  timelineSphereId: string;
  onTimelineSphereChange: (id: string) => void;
  onNotesOpen: () => void;
  onDisplayModeChange: (mode: 'list' | 'timeline') => void;
  onPostpone: () => void;
  postponing: boolean;
  canPostpone: boolean;
};

/**
 * One toolbar used by Telegram Mini App and the compact browser workspace.
 * The menu changes the existing filter state; it does not maintain its own copy.
 */
export function MiniWorkspaceTools({
  mode, timeFilter, onTimeFilterChange, sortMode, onSortChange,
  spheres, selectedSphereIds, onSelectAllSpheres, onToggleSphere,
  timelineSphereId, onTimelineSphereChange, onNotesOpen,
  onDisplayModeChange, onPostpone, postponing, canPostpone
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const allSpheres = selectedSphereIds === null || selectedSphereIds.length === spheres.length;
  const hasFilters = timeFilter !== 'all' || (mode === 'list'
    ? sortMode !== 'urgency' || !allSpheres
    : timelineSphereId !== 'all');

  return (
    <div className={`miniapp-workspace-tools ${open ? 'is-filter-menu-open' : ''}`}>
      <div className="miniapp-workspace-primary">
        <div className="display-mode-toggle-group miniapp-workspace-display-mode" role="group" aria-label="Режим отображения">
          <button type="button" className={`display-mode-toggle-button ${mode === 'list' ? 'display-mode-toggle-button-active' : ''}`}
            aria-pressed={mode === 'list'} onClick={() => onDisplayModeChange('list')}>
            <List size={16} aria-hidden="true" /><span>Список</span>
          </button>
          <button type="button" className={`display-mode-toggle-button ${mode === 'timeline' ? 'display-mode-toggle-button-active' : ''}`}
            aria-pressed={mode === 'timeline'} onClick={() => onDisplayModeChange('timeline')}>
            <CalendarDays size={16} aria-hidden="true" /><span>Таймлайн</span>
          </button>
        </div>
        <div ref={rootRef} className="miniapp-workspace-filter-anchor relative justify-self-end">
        <button type="button"
          className={`miniapp-workspace-tool miniapp-workspace-tool-filter ${hasFilters ? 'is-filtered' : ''}`}
          onClick={() => setOpen(value => !value)}
          aria-label="Фильтры задач" aria-controls="miniapp-workspace-filter-panel"
          aria-expanded={open} aria-haspopup="dialog">
          <ListFilter size={17} aria-hidden="true" />
          {hasFilters ? <span className="miniapp-workspace-filter-dot" aria-hidden="true" /> : null}
          <span className="sr-only">Фильтры задач</span>
        </button>
        {open ? (
          <div id="miniapp-workspace-filter-panel" role="dialog" aria-label="Фильтры задач"
            className="miniapp-workspace-filter-panel absolute right-0 top-[calc(100%+8px)] z-[180] w-[min(19rem,calc(100vw-32px))] rounded-2xl border p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <strong className="text-sm">Фильтры задач</strong>
              {hasFilters ? <button type="button" className="miniapp-workspace-filter-reset text-xs"
                onClick={() => {
                  onTimeFilterChange('all');
                  if (mode === 'list') { onSortChange('urgency'); onSelectAllSpheres(true); }
                  else onTimelineSphereChange('all');
                }}>Сбросить</button> : null}
            </div>
            <label className="miniapp-workspace-filter-field">
              <span>Период</span>
              <select value={timeFilter} onChange={(event) => onTimeFilterChange(event.target.value as TimeFilter)}>
                {timeOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            {mode === 'list' ? <>
              <label className="miniapp-workspace-filter-field">
                <span>Сортировка</span>
                <select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>
                  <option value="urgency">По срочности</option>
                  <option value="importance">По важности</option>
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </label>
              <fieldset className="mt-3">
                <legend className="mb-2 text-xs font-semibold">Сектора</legend>
                <label className="miniapp-workspace-sphere-option">
                  <input type="checkbox" checked={allSpheres}
                    onChange={(event) => onSelectAllSpheres(event.target.checked)} />
                  <span>Все сектора</span>
                  {allSpheres ? <Check size={14} aria-hidden="true" /> : null}
                </label>
                <div className="miniapp-workspace-sphere-list">
                  {spheres.map(sphere => (
                    <label key={sphere.id} className="miniapp-workspace-sphere-option">
                      <input type="checkbox" checked={selectedSphereIds === null || selectedSphereIds.includes(sphere.id)}
                        onChange={() => onToggleSphere(sphere.id)} />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sphere.color }} />
                      <span className="min-w-0 flex-1 truncate">{sphere.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </> : <label className="miniapp-workspace-filter-field">
              <span>Сектор</span>
              <select value={timelineSphereId} onChange={event => onTimelineSphereChange(event.target.value)}>
                <option value="all">Все сектора</option>
                <option value="without-sphere">Без сектора</option>
                {spheres.map(sphere => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>}
          </div>
        ) : null}
      </div>
      </div>
      <div className="miniapp-workspace-actions">
        <button type="button" className="miniapp-workspace-tool miniapp-workspace-tool-notes"
          onClick={onNotesOpen} aria-label="Открыть заметки">
          <StickyNote size={16} aria-hidden="true" /><span>Заметки</span>
        </button>
        <button type="button" className="miniapp-postpone-button miniapp-workspace-tool-postpone"
          onClick={onPostpone} disabled={postponing || !canPostpone}
          title="Перенести просроченные задачи на сегодня на это же время"
          aria-label="Перенести просроченные задачи на сегодня на это же время">
          {postponing ? <Loader2 size={15} className="animate-spin" /> : <Clock3 size={15} />}
          <span>Отложить</span>
        </button>
        <button type="button" className="miniapp-workspace-tool miniapp-workspace-tool-optimize"
          disabled aria-disabled="true" title="Оптимизация пока недоступна">
          <Sparkles size={16} aria-hidden="true" /><span>Оптимизировать</span>
        </button>
      </div>
    </div>
  );
}
