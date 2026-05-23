import { CalendarDays, Check, Clock3, PanelsTopLeft, X } from 'lucide-react';
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
  timelineTasks?: Array<{ id: string; title: string; dueDate?: string | null }>;
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
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((date, index) => (
                <button key={`${date?.toISOString() ?? `empty-${index}`}`} type="button" disabled={!date} className={`min-h-14 rounded border p-1 text-left text-xs ${date ? 'border-slate-700 bg-slate-800 hover:border-cyan-400' : 'border-transparent bg-transparent'} ${selectedPreviewDate && date && selectedPreviewDate.toDateString() === date.toDateString() ? 'border-cyan-400 bg-cyan-900/30' : ''}`} onClick={() => date && setSelectedPreviewDate(date)}>
                  {date ? <p>{date.getDate()}</p> : null}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {Array.from({ length: 24 }, (_, hour) => (
                <button key={hour} type="button" className="rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700" onClick={() => {
                  if (!selectedPreviewDate) return;
                  const picked = new Date(selectedPreviewDate); picked.setHours(hour, 0, 0, 0);
                  const parts = toLocalParts(picked.toISOString());
                  setDraftDate(parts.date); setDraftTime(parts.time);
                  setIsTimelinePreviewOpen(false);
                }}><span className="inline-flex items-center gap-1"><Clock3 size={12} />{`${hour.toString().padStart(2, '0')}:00`}</span></button>
              ))}
            </div>
            <div className="mt-3 rounded bg-slate-800 p-2 text-xs text-slate-300">
              <p className="mb-1 font-medium text-slate-200">Задачи на выбранный день:</p>
              {selectedDayTasks.length > 0 ? selectedDayTasks.slice(0, 8).map((task) => <p key={task.id}>• {task.title}</p>) : <p>Нет задач на выбранную дату.</p>}
            </div>
          </div>
        </div>, document.body) : null}
    </div>
  );
}
