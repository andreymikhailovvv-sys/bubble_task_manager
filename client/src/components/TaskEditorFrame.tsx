import type {ReactNode} from 'react';

/** Exact outer modal/backdrop of the personal TaskEditor, shared by Work
 * subtask details without coupling Work to the personal Task persistence API. */
export function TaskEditorFrame({children,className,onClose}:{children:ReactNode;className:string;onClose:()=>void}){
 return <div className="modal-backdrop fixed inset-0 z-[180] flex items-center justify-center p-3 backdrop-blur-sm"
   onClick={onClose}>
   <aside className={className} onClick={event=>event.stopPropagation()}>{children}</aside>
 </div>;
}
