import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Clock3, Layers3, SlidersHorizontal, X } from 'lucide-react';
import type { Sphere } from '../lib/types';
import type { FullscreenWorkspaceMode } from './FullscreenWorkspaceLayout';

export type WorkspaceTimeFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus';
export type WorkspacePaneFilter = {
  /** null means every sector; an empty array deliberately means none. */
  sphereIds: string[] | null;
  timeFilter: WorkspaceTimeFilter;
};
export const createDefaultWorkspacePaneFilter = (): WorkspacePaneFilter => ({
  sphereIds: null,
  timeFilter: 'all'
});
export const FULLSCREEN_TIME_FILTERS: ReadonlyArray<{ value: WorkspaceTimeFilter; label: string }> = [
  { value: 'all', label: 'Всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'focus', label: 'Фокус' }
];

const MODE_LABELS: Record<FullscreenWorkspaceMode, string> = {
  bubbles: 'Пузыри', list: 'Список', timeline: 'Таймлайн'
};

function popupPosition(button: HTMLButtonElement): CSSProperties {
  const rect = button.getBoundingClientRect();
  const width = Math.min(310, window.innerWidth - 20);
  const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10));
  const panelHeight = 470;
  const below = window.innerHeight - rect.bottom;
  return {
    position: 'fixed',
    width,
    left,
    top: below < panelHeight && rect.top > below
      ? Math.max(10, rect.top - Math.min(panelHeight, rect.top - 15))
      : rect.bottom + 9,
    maxHeight: Math.min(panelHeight, window.innerHeight - 20)
  };
}

export function FullscreenPaneFilters({ mode, filter, spheres, onChange, theme }: {
  mode: FullscreenWorkspaceMode;
  filter: WorkspacePaneFilter;
  spheres: Sphere[];
  onChange: (next: WorkspacePaneFilter) => void;
  theme: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (buttonRef.current?.contains(event.target as Node) || panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const closeOnScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnKey);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [open]);

  const activeCount = Number(filter.timeFilter !== 'all') + Number(filter.sphereIds !== null);
  const setSectors = (sphereIds: string[] | null) => onChange({ ...filter, sphereIds });
  const toggleSphere = (id: string) => {
    const selected = filter.sphereIds === null
      ? spheres.map(sphere => sphere.id)
      : filter.sphereIds;
    setSectors(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  };
  const toggle = () => {
    if (!open && buttonRef.current) setPosition(popupPosition(buttonRef.current));
    setOpen(value => !value);
  };

  return (
    <div className="fullscreen-pane-filters-anchor" data-fullscreen-filter-mode={mode}>
      <button ref={buttonRef} type="button" onClick={toggle}
        className={`fullscreen-pane-filter-trigger ${activeCount ? 'has-active-filters' : ''}`}
        aria-label={`Фильтры режима «${MODE_LABELS[mode]}»`}
        title={`Фильтры: ${MODE_LABELS[mode]}`}
        aria-haspopup="dialog" aria-expanded={open}>
        <SlidersHorizontal size={17} />
        {activeCount > 0 ? <span className="fullscreen-pane-filter-count">{activeCount}</span> : null}
        <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open ? createPortal(
        <div ref={panelRef} data-theme={theme}
          className="fullscreen-pane-filter-popover surface-popover light-dropdown rounded-2xl border p-3 shadow-2xl"
          role="dialog" aria-label={`Настройки фильтров: ${MODE_LABELS[mode]}`}
          style={position}>
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--panel-border)] pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <SlidersHorizontal size={17} className="text-violet-400" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">Фильтры · {MODE_LABELS[mode]}</p>
                <p className="text-[11px] text-muted">Только для этого режима</p>
              </div>
            </div>
            <button type="button" className="surface-muted rounded-lg p-1.5 text-muted"
              onClick={() => setOpen(false)} aria-label="Закрыть фильтры"><X size={15} /></button>
          </div>
          <section className="mt-3" aria-label="Фильтр секторов">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Layers3 size={14} /> Сектора</span>
              <button type="button" className="fullscreen-pane-filter-reset text-[11px]"
                onClick={() => setSectors(null)}>Все сектора</button>
            </div>
            <div className="fullscreen-pane-filter-sector-list max-h-32 space-y-1 overflow-y-auto">
              {spheres.length ? spheres.map(sphere => {
                const checked = filter.sphereIds === null || filter.sphereIds.includes(sphere.id);
                return (
                  <label key={sphere.id} className="fullscreen-pane-filter-sector flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs">
                    <input type="checkbox" checked={checked} onChange={() => toggleSphere(sphere.id)} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sphere.color }} />
                    <span className="min-w-0 flex-1 truncate">{sphere.name}</span>
                    {checked ? <Check size={12} className="text-violet-400" /> : null}
                  </label>
                );
              }) : <p className="px-2 text-xs text-muted">Секторов пока нет</p>}
            </div>
          </section>
          <section className="mt-3" aria-label="Фильтр времени">
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Clock3 size={14} /> Период</p>
            <div className="fullscreen-pane-filter-times grid grid-cols-2 gap-1.5">
              {FULLSCREEN_TIME_FILTERS.map(option => (
                <button key={option.value} type="button" onClick={() => onChange({ ...filter, timeFilter: option.value })}
                  className={`fullscreen-pane-filter-time rounded-lg px-2 py-2 text-xs ${filter.timeFilter === option.value ? 'is-active' : ''}`}
                  aria-pressed={filter.timeFilter === option.value}>{option.label}</button>
              ))}
            </div>
          </section>
          <button type="button" className="fullscreen-pane-filter-clear mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold"
            onClick={() => onChange(createDefaultWorkspacePaneFilter())}>Сбросить фильтры режима</button>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
