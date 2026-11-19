import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Settings2, Sparkles, X } from 'lucide-react';
import type { Task } from './lib/types';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { ResizableDescriptionSurface } from './components/ResizableDescriptionSurface';
import { NotesEditor } from './components/NotesEditor';

type Props={
  task:Task;
  parentTask?:Task;
  userId:string;
  timeZone:string;
  completing?:boolean;
  onClose:()=>void;
  onSaveDescription:(description:string)=>Promise<void>;
  onToggleComplete:()=>Promise<void>;
  onSettings:()=>void;
  onAskAi:()=>void;
};
const dateLabel=(date:string|null|undefined,timeZone:string)=>{
  if(!date)return 'Без срока';
  try{return new Date(date).toLocaleDateString('ru-RU',{timeZone,day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});}
  catch{return 'Без срока';}
};
export function TestPageSubtaskFocus({task,parentTask,userId,timeZone,completing=false,onClose,onSaveDescription,
  onToggleComplete,onSettings,onAskAi}:Props) {
  const [description,setDescription]=useState(task.description||'');
  const descriptionRef=useRef(task.description||'');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notesOpen,setNotesOpen]=useState(false);
  // Same inline editing behavior as Focus, but no growing modal height.
  useEffect(()=>{descriptionRef.current=task.description||'';setDescription(task.description||'');},[task.id]);
  useEffect(()=>{
    if(description===(task.description||''))return;
    const timer=window.setTimeout(()=>{
      void onSaveDescription(description).catch(cause=>setError(cause instanceof Error?cause.message:'Не удалось сохранить описание.'));
    },900);
    return()=>window.clearTimeout(timer);
  },[description,task.description,task.id,onSaveDescription]);
  const flush=async()=>{
    const next=descriptionRef.current;
    if(next!==(task.description||''))await onSaveDescription(next);
  };
  const navigate=async(action:()=>void|Promise<void>)=>{
    setSaving(true);setError('');
    try{await flush();await action();}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить описание.');}
    finally{setSaving(false);}
  };
  return <div className="tp-overlay tp-subtask-focus-overlay" onMouseDown={event=>{
    if(event.target===event.currentTarget)void navigate(onClose);
  }}>
    <section className={'tp-dialog tp-subtask-focus-dialog'+(completing?' is-completing':'')}
      role="dialog" aria-modal="true" aria-label="Подзадача">
      <header><div className="tp-subtask-focus-heading">
        <span className="tp-eyebrow">ПОДЗАДАЧА</span>
        <h2>{task.title}</h2>
        <p>{parentTask?.title||'Родительская задача'} · {dateLabel(task.dueDate,timeZone)}</p>
      </div><div className="tp-subtask-header-actions">
        <button type="button" className={'tp-subtask-complete'+(task.status==='DONE'?' is-complete':'')}
          disabled={saving||completing} onClick={()=>void navigate(onToggleComplete)}
          aria-label={task.status==='DONE'?'Вернуть подзадачу в работу':'Выполнить подзадачу'}>
          <Check size={16}/>{task.status==='DONE'?'Вернуть в работу':'Выполнить'}
        </button>
        <button type="button" onClick={()=>void navigate(onClose)} aria-label="Закрыть" disabled={saving||completing}><X size={19}/></button>
      </div></header>
      {error&&<p className="tp-alert" role="alert">{error}</p>}
      <div className="tp-subtask-focus-body">
        <label className="tp-focus-description-label">Описание подзадачи</label>
        <ResizableDescriptionSurface storageKey={'btm:'+userId+':test-page:subtask-description-height'}
          initialHeight={160} minHeight={100} maxHeight={300} className="tp-focus-description-resizable tp-subtask-description-resizable">
          <TaskDescriptionInput className="tp-focus-description-editor" value={description} onChange={next=>{descriptionRef.current=next;setDescription(next);}}
            richInlineEditing enterCreatesLineBreak placeholder="Нажмите, чтобы добавить описание…"/>
        </ResizableDescriptionSurface>
        <button type="button" className="tp-description-notes-button" onClick={()=>setNotesOpen(true)}>
          <Settings2 size={15}/> Редактировать описание
        </button>
      </div>
      {notesOpen&&<NotesEditor heading="Описание подзадачи" value={description}
        onChange={next=>{descriptionRef.current=next;setDescription(next);}}
        onClose={()=>{setNotesOpen(false);void flush().catch(cause=>setError(cause instanceof Error?cause.message:'Не удалось сохранить описание.'));}}/>}
      <div className="tp-focus-actions">
        <button type="button" className="tp-secondary" disabled={saving} onClick={()=>void navigate(onSettings)}>
          <Settings2 size={16}/> Настроить подзадачу</button>
        <button type="button" className="tp-primary" disabled={saving} onClick={()=>void navigate(onAskAi)}>
          {saving?<Loader2 className="tp-spin" size={16}/>:<Sparkles size={16}/>} Спросить ИИ</button>
      </div>
    </section>
  </div>;
}
