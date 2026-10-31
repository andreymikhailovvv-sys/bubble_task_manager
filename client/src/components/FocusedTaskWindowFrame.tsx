import { type ReactNode } from 'react';

/**
 * The exact two-panel frame from the personal Focus Task modal in App.tsx.
 * A shared component keeps layout, stacking and responsive behavior identical
 * while personal Task and Work company-task data remain isolated.
 */
export function FocusedTaskWindowFrame({children,aiChatOpen=false,focusModeOpen=false}:
  {children:ReactNode;aiChatOpen?:boolean;focusModeOpen?:boolean}){
  return <div className={`focused-task-modal-backdrop fixed inset-0 ${aiChatOpen ? 'z-[180]' : focusModeOpen ? 'z-[150]' : 'z-40'} flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`}>
    <div className="focused-task-modal-layout flex w-full max-w-[1380px] items-stretch justify-center gap-3">
      {children}
    </div>
  </div>;
}
