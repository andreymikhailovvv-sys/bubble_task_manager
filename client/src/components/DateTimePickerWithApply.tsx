import { CalendarDays, Check, PanelsTopLeft, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  value?: string | null;
  title?: string;
  className?: string;
  buttonClassName?: string;
  popupAlign?: 'left' | 'right';
  iconOnly?: boolean;
  detachedPopup?: boolean;
  detachedOffset?: number;
  onChange: (value: string | null) => void | Promise<void>;
  onOpenChange?: (isOpen: boolean) => void;
  timelineTasks?: Array<{ id: string; title: string; dueDate?: string | null; isSubtask?: boolean; sphereColor?: string | null }>;
};

function toLocalParts(value?: string | null) {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  const isoLocal = local.toISOString();
  return {
    date: isoLocal.slice(0, 10),
    time: isoLocal.slice(11, 16)
  };
}

function formatValue(value?: string | null) {
  if (!value) return 'Срок не выбран';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Срок не выбран';
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DateTimePickerWithApply({
  value,
  title = 'Выбрать срок',
  className = '',
  buttonClassName = '',
  popupAlign = 'left',
  iconOnly = false,
  detachedPopup = false,
  detachedOffset = 10,
  onChange,
  onOpenChange,
  timelineTasks = []
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [detachedPosition, setDetachedPosition] = useState<{ top: number; left: number } | null>(null);
  const [isTimelinePreviewOpen, setIsTimelinePreviewOpen] = useState(false);
  const [previewMonthDate, setPreviewMonthDate] = useState(new Date());
  const [selectedPreviewDate, setSelectedPreviewDate] = useState<Date | null>(null);
  const [previewMode, setPreviewMode] = useState<'month' | 'day'>('month');

  const formattedValue = useMemo(() => formatValue(value), [value]);


  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  useEffect(() => {
    if (!isOpen) {
      setDetachedPosition(null);
    }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const parts = toLocalParts(value);
    setDraftDate(parts.date);
    setDraftTime(parts.time);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (popupRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !detachedPopup) return;
    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const popupWidth = 288;
      const popupHeight = 220;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft = popupAlign === 'right'
        ? triggerRect.right - popupWidth
        : triggerRect.left;
      const alignedLeft = detachedPopup && popupAlign === 'right'
        ? Math.min(preferredLeft, triggerRect.left - popupWidth - detachedOffset)
        : preferredLeft;
      const clampedLeft = Math.max(8, Math.min(alignedLeft, viewportWidth - popupWidth - 8));
      const preferredTop = triggerRect.bottom + detachedOffset;
      const shouldOpenUpward = preferredTop + popupHeight > viewportHeight - 8;
      const upwardTop = triggerRect.top - popupHeight - detachedOffset;
      setDetachedPosition({
        top: shouldOpenUpward ? Math.max(8, upwardTop) : Math.max(8, preferredTop),
        left: clampedLeft
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [detachedOffset, detachedPopup, isOpen, popupAlign]);

  useEffect(() => {
    if (!isTimelinePreviewOpen) return;
    const appRoot = document.getElementById('root');
    if (!appRoot) return;

    const hadInert = appRoot.hasAttribute('inert');
    const previousAriaHidden = appRoot.getAttribute('aria-hidden');
    if (document.activeElement instanceof HTMLElement && appRoot.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    appRoot.setAttribute('inert', '');
    appRoot.setAttribute('aria-hidden', 'true');
    appRoot.classList.add('app-background-inert');

    return () => {
      if (!hadInert) {
        appRoot.removeAttribute('inert');
      }
      if (previousAriaHidden === null) {
        appRoot.removeAttribute('aria-hidden');
      } else {
        appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
      appRoot.classList.remove('app-background-inert');
    };
  }, [isTimelinePreviewOpen]);

  const popupPositionClass = popupAlign === 'right' ? 'right-0' : 'left-0';
  const today = useMemo(() => new Date(), []);
  const monthCells = useMemo(() => {
    const monthStart = new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth(), 1);
    const monthDays = new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth() + 1, 0).getDate();
    const firstWeekDay = (monthStart.getDay() + 6) % 7;
    return Array.from({ length: firstWeekDay + monthDays }, (_, index) => {
      if (index < firstWeekDay) return null;
      return new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth(), index - firstWeekDay + 1);
    });
  }, [previewMonthDate]);
  const timelineTasksByDate = useMemo(() => {
    const grouped = new Map<string, typeof timelineTasks>();
    timelineTasks.forEach((task) => {
      if (!task.dueDate) return;
      const date = new Date(task.dueDate);
      if (Number.isNaN(date.getTime())) return;
      const key = getLocalDateKey(date);
      const current = grouped.get(key);
      if (current) {
        current.push(task);
      } else {
        grouped.set(key, [task]);
      }
    });
    grouped.forEach((tasks) => tasks.sort((a, b) => new Date(a.dueDate ?? '').getTime() - new Date(b.dueDate ?? '').getTime()));
    return grouped;
  }, [timelineTasks]);
  const selectedDayTasks = useMemo(() => (
    selectedPreviewDate ? timelineTasksByDate.get(getLocalDateKey(selectedPreviewDate)) ?? [] : []
  ), [selectedPreviewDate, timelineTasksByDate]);
  const selectedDayTasksByHour = useMemo(() => {
    const groupedByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      quarters: Array.from({ length: 4 }, (_, quarterIndex) => ({
        minute: quarterIndex * 15,
        tasks: [] as typeof timelineTasks
      }))
    }));
    selectedDayTasks.forEach((task) => {
      if (!task.dueDate) return;
      const date = new Date(task.dueDate);
      if (Number.isNaN(date.getTime())) return;
      const quarterIndex = Math.min(3, Math.floor(date.getMinutes() / 15));
      groupedByHour[date.getHours()].quarters[quarterIndex].tasks.push(task);
    });
    return groupedByHour;
  }, [selectedDayTasks]);

  const popupContent = (
    <div
      ref={popupRef}
      className={`date-time-popover z-[120] w-72 rounded-xl border p-3 shadow-2xl ${
        detachedPopup ? 'fixed' : `absolute ${popupPositionClass} mt-2`
      }`}
      style={detachedPopup && detachedPosition ? { top: detachedPosition.top, left: detachedPosition.left } : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-xs text-muted">Выбор даты и времени</p>
      <div className="space-y-2">
        <input
          type="date"
          className="form-field w-full rounded border px-2 py-1.5 text-sm"
          value={draftDate}
          onChange={(event) => setDraftDate(event.target.value)}
        />
        <input
          type="time"
          className="form-field w-full rounded border px-2 py-1.5 text-sm"
          value={draftTime}
          onChange={(event) => setDraftTime(event.target.value)}
        />
        <button
          type="button"
          className="timeline-pick-button flex w-full items-center justify-center gap-2 rounded px-2 py-1.5 text-sm font-medium"
          onClick={() => {
            setIsTimelinePreviewOpen(true);
            setSelectedPreviewDate(draftDate ? new Date(`${draftDate}T00:00`) : new Date());
            setPreviewMonthDate(draftDate ? new Date(`${draftDate}T00:00`) : new Date());
            setPreviewMode('month');
          }}
        >
          <PanelsTopLeft size={14} />
          Выбрать в таймлайне
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="secondary-button flex-1 rounded px-2 py-1.5 text-xs"
          onClick={() => {
            void onChange(null);
            setIsOpen(false);
          }}
        >
          <span className="inline-flex items-center gap-1"><X size={12} /> Очистить</span>
        </button>
        <button
          type="button"
          className="success-button flex-1 rounded px-2 py-1.5 text-xs font-semibold"
          onClick={() => {
            if (!draftDate) {
              void onChange(null);
            } else {
              const nextDate = new Date(`${draftDate}T${draftTime || '00:00'}`);
              void onChange(nextDate.toISOString());
            }
            setIsOpen(false);
          }}
        >
          <span className="inline-flex items-center gap-1"><Check size={12} /> Принять</span>
        </button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`date-time-trigger flex ${iconOnly ? 'w-auto' : 'w-full'} items-center justify-between gap-2 rounded px-2 py-2 text-sm ${buttonClassName}`}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => {
            const next = !prev;
            if (next && detachedPopup) {
              setDetachedPosition(null);
            }
            return next;
          });
        }}
      >
        {iconOnly ? null : <span className="truncate text-left">{formattedValue}</span>}
        <CalendarDays size={14} className="date-time-trigger-icon shrink-0" />
      </button>

      {isOpen
        ? (detachedPopup && detachedPosition ? createPortal(popupContent, document.body) : popupContent)
        : null}
      {isTimelinePreviewOpen ? createPortal(
        <div className="timeline-preview-overlay fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-100">Предпросмотр таймлайна (месяц)</h3>
              <button type="button" className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={() => setIsTimelinePreviewOpen(false)}>Закрыть</button>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => setPreviewMonthDate((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}>←</button>
              <p>{previewMonthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</p>
              <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => setPreviewMonthDate((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}>→</button>
            </div>
            {previewMode === 'month' ? (
              <div>
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((day) => (
                    <div key={day} className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                {monthCells.map((date, index) => {
                  const dayTasks = date ? timelineTasksByDate.get(getLocalDateKey(date)) ?? [] : [];
                  const isToday = Boolean(
                    date
                    && date.getFullYear() === today.getFullYear()
                    && date.getMonth() === today.getMonth()
                    && date.getDate() === today.getDate()
                  );
                  return (
                    <button key={`${date?.toISOString() ?? `empty-${index}`}`} type="button" disabled={!date} className={`relative min-h-24 rounded border p-1 text-left text-xs ${date ? 'border-slate-700 bg-slate-800 hover:border-cyan-400' : 'border-transparent bg-transparent'} ${isToday ? 'ring-1 ring-amber-300/90 ring-inset' : ''} ${selectedPreviewDate && date && selectedPreviewDate.toDateString() === date.toDateString() ? 'border-cyan-400 bg-cyan-900/30' : ''}`} onClick={() => {
                      if (!date) return;
                      setSelectedPreviewDate(date);
                      setPreviewMode('day');
                    }}>
                      {date ? <p className="absolute left-1 top-1">{date.getDate()}</p> : null}
                      <div className="mt-5 space-y-1">
                        {dayTasks.slice(0, 3).map((task) => (
                          <div key={task.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] ${task.isSubtask ? 'bg-slate-600/80 text-slate-100' : 'text-white'}`} style={task.isSubtask ? undefined : { backgroundColor: task.sphereColor ?? '#334155' }}>
                            {task.isSubtask ? <span className="mr-1 inline-block h-2 w-0.5 rounded-sm align-middle" style={{ backgroundColor: task.sphereColor ?? '#94a3b8' }} /> : null}
                            {task.title}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <button type="button" className="rounded bg-slate-800 px-2 py-1 text-xs" onClick={() => setPreviewMode('month')}>← К месяцу</button>
                  <p className="text-xs text-slate-300">{selectedPreviewDate?.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="timeline-preview-day-scroll max-h-[50vh] space-y-1 overflow-y-auto pr-1">
                  {selectedDayTasksByHour.map(({ hour, quarters }) => (
                    <div key={hour} className="flex w-full items-start gap-2 rounded border border-slate-700 bg-slate-800/70 p-2 text-left">
                      <span className="w-14 shrink-0 pt-1 text-xs text-cyan-200">{`${hour.toString().padStart(2, '0')}:00`}</span>
                      <div className="min-h-6 flex-1 space-y-1">
                        {quarters.map(({ minute, tasks }) => (
                          <button
                            key={`${hour}-${minute}`}
                            type="button"
                            className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition hover:bg-cyan-950/40 hover:ring-1 hover:ring-cyan-400/80"
                            onClick={() => {
                              if (!selectedPreviewDate) return;
                              const picked = new Date(selectedPreviewDate);
                              picked.setHours(hour, minute, 0, 0);
                              const parts = toLocalParts(picked.toISOString());
                              setDraftDate(parts.date);
                              setDraftTime(parts.time);
                              void onChange(picked.toISOString());
                              setIsTimelinePreviewOpen(false);
                              setIsOpen(false);
                            }}
                          >
                            <span className="w-10 shrink-0 text-[11px] font-medium text-cyan-100">{`:${minute.toString().padStart(2, '0')}`}</span>
                            <div className="min-h-4 flex-1 space-y-1">
                              {tasks.length === 0 ? <p className="text-xs text-slate-500">Свободно</p> : tasks.map((task) => (
                                <div key={task.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] ${task.isSubtask ? 'bg-slate-600/80 text-slate-100' : 'text-white'}`} style={task.isSubtask ? undefined : { backgroundColor: task.sphereColor ?? '#334155' }}>
                                  {task.isSubtask ? <span className="mr-1 inline-block h-2 w-0.5 rounded-sm align-middle" style={{ backgroundColor: task.sphereColor ?? '#94a3b8' }} /> : null}
                                  {task.title}
                                </div>
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>, document.body) : null}
    </div>
  );
}
