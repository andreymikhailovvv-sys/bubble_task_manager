import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, History, Plus, X } from 'lucide-react';
import { api, type TaskMonitoringStatus } from '../lib/api';

type PopoverLayout = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  theme: 'light' | 'dark';
};

const GUTTER = 12;
const GAP = 8;
const MAX_WIDTH = 366;
const MAX_HEIGHT = 490;

/**
 * The status history must escape task chat overflow clipping. Its position is
 * anchored to the button, but the popover itself is portaled to document.body.
 */
export function TaskMonitoringStatuses({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TaskMonitoringStatus[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<PopoverLayout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  const reposition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(MAX_WIDTH, Math.max(0, viewportWidth - 2 * GUTTER));
    const availableBelow = Math.max(0, viewportHeight - bounds.bottom - GAP - GUTTER);
    const availableAbove = Math.max(0, bounds.top - GAP - GUTTER);
    const openAbove = availableBelow < 260 && availableAbove > availableBelow;
    const maxHeight = Math.min(MAX_HEIGHT, Math.max(0, openAbove ? availableAbove : availableBelow));
    const left = Math.max(GUTTER, Math.min(bounds.right - width, viewportWidth - GUTTER - width));
    const top = openAbove
      ? Math.max(GUTTER, bounds.top - GAP - maxHeight)
      : Math.min(bounds.bottom + GAP, viewportHeight - GUTTER - maxHeight);
    const theme: 'light' | 'dark' = button.closest('.miniapp-light') ||
      document.body.dataset.theme === 'light' ? 'light' : 'dark';
    setLayout({ left, top, width, maxHeight, theme });
  }, []);

  useEffect(() => {
    setOpen(false);
    setItems([]);
    setDraft('');
    setError('');
    setLayout(null);
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (node && !buttonRef.current?.contains(node) && !popoverRef.current?.contains(node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    void api.getTaskMonitoringStatuses(taskId).then(rows => {
      if (active) setItems(rows);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить статусы.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [taskId, open]);

  const add = async () => {
    if (!draft.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const item = await api.addTaskMonitoringStatus(taskId, { label: draft.trim() });
      setItems(previous => [item, ...previous]);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить статус.');
    } finally { setLoading(false); }
  };

  return <>
    <div className="task-monitor-status-anchor relative shrink-0">
      <button ref={buttonRef} type="button"
        className="task-monitor-status-button inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-500"
        onClick={() => { setLayout(null); setOpen(value => !value); }}
        aria-expanded={open} aria-controls={open ? popoverId : undefined} aria-label="Статусы мониторинга">
        <History size={14} aria-hidden="true" /> Статусы
      </button>
    </div>
    {open && layout && typeof document !== 'undefined' ? createPortal(
      <div ref={popoverRef} id={popoverId}
        className="task-monitor-status-popover task-monitor-status-portal fixed z-[300] flex flex-col overflow-hidden rounded-2xl border p-3 text-primary shadow-2xl"
        data-status-theme={layout.theme}
        style={{ left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight }}
        role="dialog" aria-label="История статусов задачи">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <strong className="text-sm">История статусов</strong>
          <button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
            aria-label="Закрыть историю статусов" className="rounded-lg p-1.5 text-muted"><X size={16} /></button>
        </div>
        <form className="mb-3 flex shrink-0 gap-2" onSubmit={event => { event.preventDefault(); void add(); }}>
          <input className="surface-input min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm text-primary"
            value={draft} onChange={event => setDraft(event.target.value)} maxLength={160}
            placeholder="Новый статус" aria-label="Новый статус задачи" />
          <button type="submit" className="rounded-lg border border-[color:var(--panel-border)] px-2.5 text-violet-500 disabled:opacity-40"
            disabled={loading || !draft.trim()} aria-label="Добавить статус"><Plus size={17} /></button>
        </form>
        {error ? <p role="alert" className="mb-2 shrink-0 text-xs text-rose-500">{error}</p> : null}
        <div className="task-monitor-status-timeline min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain pr-1">
          {loading && items.length === 0 ? <p className="text-xs text-muted">Загрузка…</p> : null}
          {!loading && items.length === 0 ? <p className="text-xs text-muted">Пока нет статусов. Добавьте первый результат работы.</p> : null}
          {items.map((item, i) => <div key={item.id} className="flex flex-col items-center">
            <div className="w-full rounded-xl border border-[color:var(--panel-border)] p-3">
              <p className="break-words text-xs font-semibold leading-snug">{item.label}</p>
              {item.detail ? <p className="mt-1 break-words text-xs text-muted">{item.detail}</p> : null}
              <time dateTime={item.createdAt} className="mt-1.5 block text-[11px] text-muted">
                {new Date(item.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            {i < items.length - 1 ? <ChevronDown size={15} className="my-1 shrink-0 text-violet-400" aria-hidden="true" /> : null}
          </div>)}
        </div>
      </div>, document.body
    ) : null}
  </>;
}
