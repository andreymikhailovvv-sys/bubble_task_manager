import { useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';

const clampFocusRatio = (value: number) => Math.max(25, Math.min(75, Math.round(value)));

/**
 * Shared Focus task modal. Only its embedded presentation receives a separate,
 * keyboard-accessible inner splitter. The original modal remains unchanged.
 * During dragging, update a CSS variable instead of rerendering expensive
 * task/AI children on every pointermove.
 */
export function FocusedTaskWindowFrame({ children, aiChatOpen = false, focusModeOpen = false, inlineTarget, embedded = false }: {
  children: ReactNode;
  aiChatOpen?: boolean;
  focusModeOpen?: boolean;
  inlineTarget?: HTMLElement | null;
  embedded?: boolean;
}) {
  const [ratio, setRatio] = useState(58);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<number | null>(null);
  const pendingRatioRef = useRef(ratio);

  const moveInnerDivider = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = clampFocusRatio(((event.clientX - rect.left) / rect.width) * 100);
    pendingRatioRef.current = next;
    rootRef.current?.style.setProperty('--focus-inner-ratio', `${next}%`);
  };
  const onDividerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    draggingIdRef.current = event.pointerId;
    pendingRatioRef.current = ratio;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveInnerDivider(event);
    event.preventDefault();
  };
  const onDividerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingIdRef.current === event.pointerId) moveInnerDivider(event);
  };
  const finishDividerDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingIdRef.current = null;
    setRatio(pendingRatioRef.current);
  };
  const onDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next = ratio;
    if (event.key === 'ArrowLeft') next -= event.shiftKey ? 10 : 5;
    else if (event.key === 'ArrowRight') next += event.shiftKey ? 10 : 5;
    else if (event.key === 'Home') next = 25;
    else if (event.key === 'End') next = 75;
    else return;
    event.preventDefault();
    setRatio(clampFocusRatio(next));
  };

  if (embedded && !inlineTarget) return null;
  const surface = (
    <div className={`focused-task-modal-backdrop fixed inset-0 ${aiChatOpen ? 'z-[180]' : focusModeOpen ? 'z-[150]' : 'z-40'} flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm ${embedded ? 'fullscreen-task-embedded' : ''}`}>
      <div ref={rootRef} className="focused-task-modal-layout flex w-full max-w-[1380px] items-stretch justify-center gap-3"
        style={embedded ? { '--focus-inner-ratio': `${ratio}%` } as CSSProperties : undefined}>
        {children}
        {embedded ? (
          <div className="fullscreen-focus-inner-divider" role="separator" tabIndex={0}
            aria-label="Изменить ширину задачи и помощи ИИ"
            aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={ratio}
            title="Перетащите для изменения ширины задачи и ИИ. Стрелки на клавиатуре тоже работают."
            onPointerDown={onDividerDown} onPointerMove={onDividerMove}
            onPointerUp={finishDividerDrag} onPointerCancel={finishDividerDrag}
            onKeyDown={onDividerKeyDown} onDoubleClick={() => setRatio(58)}>
            <span className="fullscreen-focus-inner-divider-grip"><GripVertical size={14} /></span>
          </div>
        ) : null}
      </div>
    </div>
  );
  return embedded && inlineTarget ? createPortal(surface, inlineTarget) : surface;
}
