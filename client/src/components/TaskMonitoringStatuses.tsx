import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Radar, Plus, X } from 'lucide-react';
import { api, type TaskMonitoringStatus } from '../lib/api';
import type { Task } from '../lib/types';
import { TaskMonitoringControls } from './TaskMonitoringControls';

type Layout = { left: number; top: number; width: number; maxHeight: number; theme: 'light' | 'dark' };
const GUTTER = 12;
const GAP = 8;
const MAX_WIDTH = 390;
const MAX_HEIGHT = 555;

/** A task-owned monitoring panel anchored to the AI-chat title, shared across clients. */
export function TaskMonitoringStatuses({ taskId, enabled, allowed = true, onTaskUpdated }: {
  taskId: string;
  enabled: boolean;
  allowed?: boolean;
  onTaskUpdated?: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [monitorEnabled, setMonitorEnabled] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<TaskMonitoringStatus[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState<Layout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => { setMonitorEnabled(enabled); }, [enabled]);
  useEffect(() => {
    setOpen(false); setUnread(0); setItems([]); setDraft(''); setError(''); setLayout(null);
  }, [taskId]);

  useEffect(() => {
    if (!allowed) { setUnread(0); return; }
    let active = true;
    const refresh = () => {
      void api.getTaskMonitoringUnread(taskId).then(result => {
        if (active && !open) setUnread(result.unreadCount);
      }).catch(() => undefined);
    };
    refresh();
    const interval = window.setInterval(refresh, 20_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [taskId, allowed, open]);

  const reposition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, window.innerWidth - 2 * GUTTER);
    const below = Math.max(0, window.innerHeight - bounds.bottom - GAP - GUTTER);
    const above = Math.max(0, bounds.top - GAP - GUTTER);
    const useAbove = below < 280 && above > below;
    const maxHeight = Math.min(MAX_HEIGHT, useAbove ? above : below);
    const left = Math.max(GUTTER, Math.min(bounds.right - width, window.innerWidth - width - GUTTER));
    const top = useAbove
      ? Math.max(GUTTER, bounds.top - GAP - maxHeight)
      : Math.min(bounds.bottom + GAP, window.innerHeight - GUTTER - maxHeight);
    setLayout({
      left, top, width, maxHeight,
      theme: button.closest('.miniapp-light') || document.body.dataset.theme === 'light' ? 'light' : 'dark'
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
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
  }, [open, reposition]);

  const loadStatuses = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.getTaskMonitoringStatuses(taskId);
      setItems(list);
      await api.markTaskMonitoringSeen(taskId);
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось получить статусы.');
    } finally { setLoading(false); }
  }, [taskId, allowed]);

  useEffect(() => {
    if (open) void loadStatuses();
  }, [open, loadStatuses]);

  const toggle = async (next: boolean) => {
    if (!allowed || saving) return;
    setSaving(true); setError('');
    try {
      const task = await api.updateTask(taskId, { aiMonitoringEnabled: next });
      setMonitorEnabled(task.aiMonitoringEnabled === true);
      onTaskUpdated?.(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить автомониторинг.');
    } finally { setSaving(false); }
  };

  const add = async () => {
    if (!monitorEnabled || !draft.trim() || loading || !allowed) return;
    setLoading(true); setError('');
    try {
      const item = await api.addTaskMonitoringStatus(taskId, { label: draft.trim() });
      setItems(previous => [item, ...previous]); setDraft('');
      await api.markTaskMonitoringSeen(taskId);
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить статус.');
    } finally { setLoading(false); }
  };

  return <>
    <div className="task-monitor-status-anchor relative inline-flex shrink-0">
      <button ref={buttonRef} type="button" onClick={() => { setLayout(null); setOpen(value => !value); }}
        className={`task-monitor-button ${allowed && monitorEnabled ? 'task-monitor-button-active' : ''} inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold`}
        aria-label={monitorEnabled && allowed ? 'Автомониторинг задачи включён' : 'Автомониторинг задачи выключен'} aria-expanded={open} aria-controls={open ? popoverId : undefined}>
        <Radar size={14} aria-hidden="true" /> <span>Автомониторинг</span>
      </button>
      {allowed && unread > 0 ? <span className="task-monitor-unread absolute -right-1 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
        aria-label={`Новых статусов: ${unread}`}>{unread > 99 ? '99+' : unread}</span> : null}
    </div>
    {open && layout && typeof document !== 'undefined' ? createPortal(
      <div ref={popoverRef} id={popoverId}
        className="task-monitor-status-popover task-monitor-status-portal fixed z-[300] flex flex-col overflow-hidden rounded-2xl border p-3 text-primary shadow-2xl"
        data-status-theme={layout.theme}
        style={{ left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight }}
        role="dialog" aria-label="Автомониторинг и история статусов задачи">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <strong className="text-sm">Автомониторинг <span className="ml-1 text-[10px] font-medium text-muted">beta</span></strong>
          <button type="button" aria-label="Закрыть окно автомониторинга" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
            className="rounded-lg p-1.5 text-muted"><X size={16} /></button>
        </div>
        <div className="task-monitor-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <TaskMonitoringControls enabled={monitorEnabled} onChange={value => void toggle(value)} taskId={taskId}
            allowed={allowed && !saving} />
          {saving ? <p role="status" className="mt-2 text-xs text-muted">Сохраняем режим…</p> : null}
          <div className="mt-4 border-t border-[color:var(--panel-border)] pt-3">
            <h3 className="mb-2 text-xs font-semibold text-primary">История статусов</h3>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">Новые статусы появляются здесь, когда вы или ИИ фиксируете результат. Сначала последние.</p>
            {allowed && monitorEnabled ? <form className="mb-3 flex gap-2" onSubmit={event => { event.preventDefault(); void add(); }}>
              <input className="surface-input min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm text-primary"
                value={draft} onChange={event => setDraft(event.target.value)} maxLength={160}
                placeholder="Новый статус" aria-label="Новый статус задачи" />
              <button type="submit" className="task-monitor-add rounded-lg border px-2.5 disabled:opacity-40"
                disabled={loading || !draft.trim()} aria-label="Добавить статус"><Plus size={17} /></button>
            </form> : null}
            {error ? <p role="alert" className="mb-2 text-xs text-rose-500">{error}</p> : null}
            {loading && items.length === 0 ? <p className="text-xs text-muted">Загрузка…</p> : null}
            {!loading && items.length === 0 ? <p className="text-xs text-muted">Пока нет статусов.</p> : null}
            <div className="space-y-0">
              {items.map((item, i) => <div key={item.id} className="flex flex-col items-center">
                <div className="w-full rounded-xl border border-[color:var(--panel-border)] p-3">
                  <p className="break-words text-xs font-semibold leading-snug">{item.label}</p>
                  {item.detail ? <p className="mt-1 break-words text-xs text-muted">{item.detail}</p> : null}
                  <time dateTime={item.createdAt} className="mt-1.5 block text-[11px] text-muted">
                    {new Date(item.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
                {i < items.length - 1 ? <ChevronDown size={14} className="my-1 shrink-0 text-muted" aria-hidden="true" /> : null}
              </div>)}
            </div>
          </div>
        </div>
      </div>, document.body
    ) : null}
  </>;
}
