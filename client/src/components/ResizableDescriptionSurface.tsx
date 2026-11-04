import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';

type Props = {
  children: ReactNode;
  className?: string;
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Optional user-scoped preference, shared by focus tasks and retained across reloads. */
  storageKey?: string;
};

export const clampDescriptionHeight = (height: number, minHeight: number, maxHeight: number) =>
  Math.max(minHeight, Math.min(maxHeight, Math.round(height)));

/** Only used in web task/focus editors. Preview and textarea share one fixed, bounded viewport. */
export function ResizableDescriptionSurface({
  children, className = '', initialHeight = 128, minHeight = 96, maxHeight = 320, storageKey
}: Props) {
  const readSavedHeight = () => {
    if (!storageKey || typeof window === 'undefined') return clampDescriptionHeight(initialHeight, minHeight, maxHeight);
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored === null ? NaN : Number(stored);
      return Number.isFinite(parsed) ? clampDescriptionHeight(parsed, minHeight, maxHeight)
        : clampDescriptionHeight(initialHeight, minHeight, maxHeight);
    } catch { return clampDescriptionHeight(initialHeight, minHeight, maxHeight); }
  };
  const [height, setHeight] = useState(readSavedHeight);
  useEffect(() => { setHeight(readSavedHeight()); }, [storageKey, initialHeight, minHeight, maxHeight]);
  const updateHeight = (value: number) => {
    const next = clampDescriptionHeight(value, minHeight, maxHeight);
    setHeight(next);
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, String(next)); } catch { /* Storage can be disabled. */ }
  };
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateHeight(drag.startHeight + event.clientY - drag.startY);
  };
  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={'resizable-description-surface relative flex min-w-0 flex-col ' + className}
      style={{ height, minHeight, maxHeight }}>
      {children}
      <div role="separator" aria-label="Изменить высоту описания" aria-orientation="horizontal"
        aria-valuemin={minHeight} aria-valuemax={maxHeight} aria-valuenow={height}
        tabIndex={0} title="Потяните, чтобы изменить высоту описания"
        className="resizable-description-grip absolute bottom-[-7px] left-1/2 z-[2] flex h-4 w-11 -translate-x-1/2 items-center justify-center rounded-full"
        onPointerDown={startResize} onPointerMove={moveResize}
        onPointerUp={endResize} onPointerCancel={endResize}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          updateHeight(event.key === 'Home' ? minHeight : event.key === 'End' ? maxHeight
            : height + (event.key === 'ArrowDown' ? 16 : -16));
        }}>
        <GripHorizontal size={17} strokeWidth={1.8} aria-hidden="true"/>
      </div>
    </div>
  );
}
