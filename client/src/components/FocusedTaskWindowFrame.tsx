import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** One shared Focus interface. In fullscreen mode the existing Focus panels
 * are portaled into the selected workspace slot and stacked vertically. */
export function FocusedTaskWindowFrame({ children, aiChatOpen = false, focusModeOpen = false, inlineTarget, embedded = false }: {
  children: ReactNode;
  aiChatOpen?: boolean;
  focusModeOpen?: boolean;
  inlineTarget?: HTMLElement | null;
  embedded?: boolean;
}) {
  if (embedded && !inlineTarget) return null;
  const surface = (
    <div className={`focused-task-modal-backdrop fixed inset-0 ${aiChatOpen ? 'z-[180]' : focusModeOpen ? 'z-[150]' : 'z-40'} flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm ${embedded ? 'fullscreen-task-embedded' : ''}`}>
      <div className="focused-task-modal-layout flex w-full max-w-[1380px] items-stretch justify-center gap-3">
        {children}
      </div>
    </div>
  );
  return embedded && inlineTarget ? createPortal(surface, inlineTarget) : surface;
}
