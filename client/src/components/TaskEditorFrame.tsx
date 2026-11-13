import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { PlanikMascot } from './PlanikMascot';

/** Shared editor frame. When editing a subtask of embedded Focus, mount the
 * same editor INSIDE that Focus pane instead of covering the whole workbench. */
export function TaskEditorFrame({ children, className, onClose, showPlanik = false, inlineTarget }: {
  children: ReactNode;
  className: string;
  onClose: () => void;
  showPlanik?: boolean;
  inlineTarget?: HTMLElement | null;
}) {
  const surface = (
    <div className={`modal-backdrop fixed inset-0 z-[180] flex items-center justify-center p-3 backdrop-blur-sm ${inlineTarget ? 'task-editor-inline-backdrop' : ''}`}
      onClick={onClose}>
      <aside className={className} onClick={event=>event.stopPropagation()}>{children}</aside>
      {showPlanik ? <div className="planik-task-editor-companion" aria-hidden="true" onClick={event=>event.stopPropagation()}><PlanikMascot size="sidekick" /></div> : null}
    </div>
  );
  return inlineTarget ? createPortal(surface, inlineTarget) : surface;
}
