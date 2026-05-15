import { CalendarDays, Check, X } from 'lucide-react';
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
  onOpenChange
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [detachedPosition, setDetachedPosition] = useState<{ top: number; left: number } | null>(null);

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
    </div>
  );
}
