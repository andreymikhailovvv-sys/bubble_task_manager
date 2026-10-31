import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CalendarPlus,CheckCircle2,MessageCircle,Reply,SendHorizontal,Trash2,X} from 'lucide-react';
import {DateTimePickerWithApply} from './components/DateTimePickerWithApply';
import {TaskEditorFrame} from './components/TaskEditorFrame';
import {AutoGrowingTextarea} from './components/AutoGrowingTextarea';
import {api,type WorkSubtask,type WorkSubtaskComment,type WorkWorkspace} from './lib/api';
import './styles.css';

const name=(member:WorkWorkspace['members'][number]|undefined)=>member?.name||member?.username||'Участник';
const roleName=(role:string|undefined)=>role==='OWNER'?'Владелец':role==='ADMIN'?'Администратор':role==='MANAGER'?'Руководитель':role==='MEMBER'?'Сотрудник':'Участник';

export default function WorkSubtaskDetailDialog({organizationId,projectId,taskId,subtask,workspace,selfMemberId,
 onClose,onUpdated,onDeleted}:{
 organizationId:string;projectId:string;taskId:string;subtask:WorkSubtask;
 workspace:WorkWorkspace;selfMemberId:string|null;onClose:()=>void;
 onUpdated:(next:WorkSubtask)=>void;onDeleted:(id:string)=>void;
}){
 const manager=['OWNER','ADMIN','MANAGER'].includes(workspace.organization.role);
 const canEdit=manager||subtask.createdByMemberId===selfMemberId&&workspace.organization.role==='MEMBER';
 const [title,setTitle]=useState(subtask.title);
 const [comments,setComments]=useState<WorkSubtaskComment[]>([]);
 const [replyTo,setReplyTo]=useState<WorkSubtaskComment|null>(null);
 const [draft,setDraft]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const commentsRef=useRef<HTMLDivElement>(null);
 const reload=async()=>{
   const result=await api.workSubtaskComments(organizationId,projectId,taskId,subtask.id);
   setComments(result.comments);
 };
 useEffect(()=>{
  let live=true;setLoading(true);
  void api.workSubtaskComments(organizationId,projectId,taskId,subtask.id).then(result=>{
   if(live)setComments(result.comments);
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Ошибка комментариев');})
    .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[organizationId,projectId,taskId,subtask.id]);
 useEffect(()=>{commentsRef.current?.scrollTo({top:commentsRef.current.scrollHeight,behavior:'smooth'});},[comments.length]);
 const patch=async(changes:Partial<Pick<WorkSubtask,'title'|'dueAt'|'isDone'>>)=>{
  setBusy(true);setError('');
  try{
   const result=await api.workUpdateSubtask(organizationId,projectId,taskId,subtask.id,changes);
   onUpdated(result.subtask);setTitle(result.subtask.title);
  }catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения');}
  finally{setBusy(false);}
 };
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(busy||!draft.trim())return;setBusy(true);setError('');
  try{
   await api.workPostSubtaskComment(organizationId,projectId,taskId,subtask.id,draft.trim(),replyTo?.id||null);
   setDraft('');setReplyTo(null);await reload();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось отправить комментарий');}
  finally{setBusy(false);}
 };
 const del=async()=>{if(!window.confirm('Удалить подзадачу?'))return;setBusy(true);
  try{await api.workDeleteSubtask(organizationId,projectId,taskId,subtask.id);onDeleted(subtask.id);onClose();}
  catch(e){setError(e instanceof Error?e.message:'Ошибка удаления');setBusy(false);}
 };
 return <TaskEditorFrame onClose={onClose}
   className="task-edit-shell focused-task-editor-shell work-subtask-editor relative h-[min(710px,calc(100dvh-24px))] w-full max-w-3xl overflow-hidden rounded-[2.3rem] border p-5 shadow-2xl">
     <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-5 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full"
       onClick={onClose} title="Закрыть" aria-label="Закрыть окно"><X size={18}/></button>
     <main className="focus-main-card task-edit-card flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] p-3">
       <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Редактирование подзадачи</p>
       <div className="task-editor-scroll-content invisible-scrollbar mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 pr-1">
         <textarea className="task-edit-title-input invisible-scrollbar min-h-[2.8rem] w-full resize-none border-0 bg-transparent px-0 text-2xl font-bold leading-tight text-primary"
           rows={title.length>46?2:1} maxLength={240} disabled={!canEdit||busy} value={title} onChange={e=>setTitle(e.target.value)}
           onBlur={()=>{if(canEdit&&title.trim().length>=2&&title.trim()!==subtask.title)void patch({title:title.trim()});}}/>
         <div className="mt-3 flex items-center gap-2 text-sm text-muted">
           <CalendarPlus size={15}/> Срок
           {canEdit?<DateTimePickerWithApply value={subtask.dueAt} iconOnly detachedPopup popupAlign="right" popupZIndex={1600}
             onChange={value=>patch({dueAt:value})}/>:null}
           <span>{subtask.dueAt?new Date(subtask.dueAt).toLocaleString('ru-RU'):'Не установлен'}</span>
         </div>
         <div className="mt-3 text-xs text-muted">Добавил: {name(workspace.members.find(m=>m.id===subtask.createdByMemberId))}
           {' · '}{roleName(workspace.members.find(m=>m.id===subtask.createdByMemberId)?.role)}</div>
         <section className="work-subtask-comments mt-5 flex min-h-0 flex-1 flex-col border-t pt-3">
           <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><MessageCircle size={16}/> Комментарии · {comments.length}</h3>
           <div ref={commentsRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto">
             {loading?<p className="text-xs text-muted">Загружаем комментарии…</p>:comments.map(c=>{
               const author=workspace.members.find(m=>m.id===c.authorMemberId);
               const parent=comments.find(m=>m.id===c.parentCommentId);
               const deleteAllowed=manager||c.authorMemberId===selfMemberId;
               return <div className="work-subtask-comment rounded-xl border px-3 py-2" key={c.id}>
                 <div className="flex items-center justify-between gap-2"><strong className="text-xs">{name(author)} <span className="text-muted">· {roleName(author?.role)}</span></strong><time className="text-[10px] text-muted">{new Date(c.createdAt).toLocaleString('ru-RU')}</time></div>
                 {parent&&<div className="work-subtask-quote mt-1 rounded-lg border-l-2 px-2 py-1 text-[11px] text-muted">{parent.content.slice(0,180)}</div>}
                 <p className="mt-2 whitespace-pre-wrap break-words text-xs text-primary">{c.content}</p>
                 <div className="mt-2 flex items-center gap-3">
                   <button type="button" className="text-[11px] text-violet-400" onClick={()=>setReplyTo(c)}><Reply size={13} className="inline"/> Ответить</button>
                   {deleteAllowed&&<button type="button" className="text-[11px] text-rose-400" onClick={async()=>{
                     if(!window.confirm('Удалить комментарий?'))return;
                     try{await api.workDeleteSubtaskComment(organizationId,projectId,taskId,subtask.id,c.id);await reload();}
                     catch(err){setError(err instanceof Error?err.message:'Ошибка удаления');}
                   }}>Удалить</button>}
                 </div>
               </div>;
             })}
             {!loading&&!comments.length&&<p className="text-xs text-subtle">Комментариев пока нет</p>}
           </div>
           {replyTo&&<div className="work-subtask-quote mt-2 flex justify-between gap-2 rounded-lg px-2 py-1 text-xs text-muted">
             <span>Ответ: {replyTo.content.slice(0,90)}</span><button onClick={()=>setReplyTo(null)} title="Отменить ответ"><X size={13}/></button></div>}
           <form onSubmit={submit} className="ai-chat-composer mt-3 flex items-end gap-2 rounded-3xl border p-2">
             <AutoGrowingTextarea className="form-field min-h-10 flex-1 resize-none border-0 bg-transparent p-2 text-xs"
               value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Написать комментарий…"/>
             <button disabled={!draft.trim()||busy} className="rounded-full bg-violet-600 p-3 text-white" title="Отправить комментарий"><SendHorizontal size={16}/></button>
           </form>
         </section>
       </div>
       {error&&<p role="alert" className="text-xs text-rose-400">{error}</p>}
       <div className="task-edit-subtask-footer mt-2 flex shrink-0 gap-2 border-t border-violet-100/20 pt-3">
         <button type="button" className="success-button inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
           disabled={busy||workspace.organization.role==='VIEWER'} onClick={()=>void patch({isDone:!subtask.isDone})}>
           <CheckCircle2 size={16}/>{subtask.isDone?'Вернуть':'Выполнить'}</button>
         {canEdit&&<button type="button" className="danger-button inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
           disabled={busy} onClick={()=>void del()}><Trash2 size={15}/> Удалить</button>}
       </div>
     </main>
 </TaskEditorFrame>;
}
