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

  const popupPositionClass = popupAlign === 'right' ? 'right-0' : 'left-0';
  const monthStart = new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth(), 1);
  const monthDays = new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth() + 1, 0).getDate();
  const firstWeekDay = (monthStart.getDay() + 6) % 7;
  const monthCells = Array.from({ length: firstWeekDay + monthDays }, (_, index) => {
    if (index < firstWeekDay) return null;
    return new Date(previewMonthDate.getFullYear(), previewMonthDate.getMonth(), index - firstWeekDay + 1);
  });
  const selectedDayTasks = selectedPreviewDate
    ? timelineTasks.filter((task) => task.dueDate && new Date(task.dueDate).toDateString() === selectedPreviewDate.toDateString())
    : [];
  const selectedDayTasksByHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    tasks: selectedDayTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const date = new Date(task.dueDate);
        return !Number.isNaN(date.getTime()) && date.getHours() === hour;
      })
      .sort((a, b) => new Date(a.dueDate ?? '').getTime() - new Date(b.dueDate ?? '').getTime())
  }));

  const popupContent = (
    <div
      ref={popupRef}
      className={`z-[120] w-72 rounded-xl border border-slate-600 bg-slate-900 p-3 shadow-2xl ${
        detachedPopup ? 'fixed' : `absolute ${popupPositionClass} mt-2`
      }`}
      style={detachedPopup && detachedPosition ? { top: detachedPosition.top, left: detachedPosition.left } : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="mb-2 text-xs text-slate-300">Выбор даты и времени</p>
      <div className="space-y-2">
        <input
          type="date"
          className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm"
          value={draftDate}
          onChange={(event) => setDraftDate(event.target.value)}
        />
        <input
          type="time"
          className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm"
          value={draftTime}
          onChange={(event) => setDraftTime(event.target.value)}
        />
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded bg-pink-600/90 px-2 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
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
          className="flex-1 rounded bg-slate-700 px-2 py-1.5 text-xs hover:bg-slate-600"
          onClick={() => {
            void onChange(null);
            setIsOpen(false);
          }}
        >
          <span className="inline-flex items-center gap-1"><X size={12} /> Очистить</span>
        </button>
        <button
          type="button"
          className="flex-1 rounded bg-emerald-600 px-2 py-1.5 text-xs font-semibold hover:bg-emerald-500"
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
        className={`flex ${iconOnly ? 'w-auto' : 'w-full'} items-center justify-between gap-2 rounded bg-slate-800 px-2 py-2 text-sm text-slate-100 hover:bg-slate-700 ${buttonClassName}`}
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
        <CalendarDays size={14} className="shrink-0 text-cyan-300" />
      </button>

      {isOpen
        ? (detachedPopup && detachedPosition ? createPortal(popupContent, document.body) : popupContent)
        : null}
      {isTimelinePreviewOpen ? createPortal(
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4">
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
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((date, index) => {
                  const dayTasks = date
                    ? timelineTasks.filter((task) => task.dueDate && new Date(task.dueDate).toDateString() === date.toDateString())
                    : [];
                  return (
                    <button key={`${date?.toISOString() ?? `empty-${index}`}`} type="button" disabled={!date} className={`min-h-24 rounded border p-1 text-left text-xs ${date ? 'border-slate-700 bg-slate-800 hover:border-cyan-400' : 'border-transparent bg-transparent'} ${selectedPreviewDate && date && selectedPreviewDate.toDateString() === date.toDateString() ? 'border-cyan-400 bg-cyan-900/30' : ''}`} onClick={() => {
                      if (!date) return;
                      setSelectedPreviewDate(date);
                      setPreviewMode('day');
                    }}>
                      {date ? <p className="mb-1">{date.getDate()}</p> : null}
                      <div className="space-y-1">
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
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <button type="button" className="rounded bg-slate-800 px-2 py-1 text-xs" onClick={() => setPreviewMode('month')}>← К месяцу</button>
                  <p className="text-xs text-slate-300">{selectedPreviewDate?.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
                  {selectedDayTasksByHour.map(({ hour, tasks }) => (
                    <button key={hour} type="button" className="flex w-full items-start gap-2 rounded border border-slate-700 bg-slate-800/70 p-2 text-left hover:border-cyan-400" onClick={() => {
                      if (!selectedPreviewDate) return;
                      const picked = new Date(selectedPreviewDate);
                      picked.setHours(hour, 0, 0, 0);
                      const parts = toLocalParts(picked.toISOString());
                      setDraftDate(parts.date);
                      setDraftTime(parts.time);
                      void onChange(picked.toISOString());
                      setIsTimelinePreviewOpen(false);
                      setIsOpen(false);
                    }}>
                      <span className="w-14 shrink-0 text-xs text-cyan-200">{`${hour.toString().padStart(2, '0')}:00`}</span>
                      <div className="min-h-6 flex-1 space-y-1">
                        {tasks.length === 0 ? <p className="text-xs text-slate-500">Свободный слот</p> : tasks.slice(0, 3).map((task) => (
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
            )}
          </div>
        </div>, document.body) : null}
    </div>
  );
}
