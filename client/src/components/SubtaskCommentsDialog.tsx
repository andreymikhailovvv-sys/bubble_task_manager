import type {CSSProperties,RefObject} from 'react';
import {X,Loader2,SendHorizontal} from 'lucide-react';

export type SharedSubtaskComment={id:string;authorName:string;authorColor?:string;content:string;createdAt:string;parentCommentId?:string|null};
export function SubtaskCommentsDialog({title,comments,loading,replyTo,draft,onDraftChange,onReply,onDismissReply,
 onSend,onClose,error,sending,autoFocus=false,scrollRef}:{
 title:string;comments:SharedSubtaskComment[];loading:boolean;replyTo:SharedSubtaskComment|null;
 draft:string;onDraftChange:(s:string)=>void;onReply:(c:SharedSubtaskComment)=>void;onDismissReply:()=>void;
 onSend:()=>void;onClose:()=>void;error?:string|null;sending:boolean;autoFocus?:boolean;
 scrollRef?:RefObject<HTMLDivElement|null>;
}){
 return <div className="modal-backdrop fixed inset-0 z-[270] flex items-center justify-center p-4 backdrop-blur-sm"
   onClick={onClose}>
   <section className="collaboration-comment-panel flex max-h-[min(72vh,620px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border shadow-2xl"
     onClick={event=>event.stopPropagation()}>
     <div className="collaboration-comment-header flex items-start justify-between gap-3 border-b px-5 py-4">
       <div className="min-w-0">
         <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">Комментарии к подзадаче</p>
         <h3 className="mt-1 truncate text-base font-semibold text-primary">{title}</h3>
       </div>
       <button type="button" className="focused-task-icon-button h-8 w-8 shrink-0 border"
         onClick={onClose} aria-label="Закрыть комментарии"><X size={14}/></button>
     </div>
     <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
       {loading&&<div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-violet-500"/></div>}
       {!loading&&!comments.length&&<p className="collaboration-comment-empty rounded-xl px-3 py-4 text-center text-sm">Комментариев пока нет.</p>}
       {!loading&&comments.map(comment=><article key={comment.id}
         className={`collaboration-comment-card rounded-2xl border px-3 py-2.5 shadow-sm ${comment.parentCommentId?'ml-5':''}`}
         style={{'--comment-author-color':comment.authorColor??'#64748b'} as CSSProperties}>
         <div className="flex items-center justify-between gap-2">
           <span className="collaboration-comment-author truncate text-xs font-semibold">{comment.authorName}</span>
           <time className="collaboration-comment-time shrink-0 text-[10px]">{new Date(comment.createdAt).toLocaleString('ru-RU')}</time>
         </div>
         <p className="collaboration-comment-text mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
         <button type="button" className="collaboration-comment-reply mt-1.5 text-[11px] font-semibold"
           onClick={()=>onReply(comment)}>Ответить</button>
       </article>)}
     </div>
     <div className="collaboration-comment-composer border-t px-4 py-3">
       {replyTo&&<div className="collaboration-comment-reply-preview mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
         <span className="min-w-0 truncate">Ответ для {replyTo.authorName}: {replyTo.content}</span>
         <button type="button" className="shrink-0" onClick={onDismissReply} aria-label="Отменить ответ"><X size={13}/></button>
       </div>}
       <textarea className="collaboration-comment-input min-h-20 w-full resize-y rounded-2xl border px-3 py-2 text-sm outline-none"
         placeholder={replyTo?'Напишите ответ…':'Оставьте комментарий…'} value={draft} autoFocus={autoFocus}
         maxLength={3000} onChange={event=>onDraftChange(event.target.value)}
         onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();onSend();}}}/>
       {error&&<p className="mt-1 text-xs text-rose-500">{error}</p>}
       <div className="mt-2 flex items-center justify-between gap-3">
         <p className="text-[10px] text-muted">Ctrl/Cmd + Enter для отправки</p>
         <button type="button" className="primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
           disabled={!draft.trim()||sending} onClick={onSend}>
           {sending?<Loader2 size={14} className="animate-spin"/>:<SendHorizontal size={14}/>} Отправить
         </button>
       </div>
     </div>
   </section>
 </div>;
}
