import { useEffect, useState } from 'react';
import { Check, Clock3, Loader2, Settings2, Sparkles, X } from 'lucide-react';
import type { Task } from './lib/types';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { ResizableDescriptionSurface } from './components/ResizableDescriptionSurface';

type Props={
  task:Task;
  parentTask?:Task;
  userId:string;
  timeZone:string;
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
export function TestPageSubtaskFocus({task,parentTask,userId,timeZone,onClose,onSaveDescription,
  onToggleComplete,onSettings,onAskAi}:Props) {
  const [description,setDescription]=useState(task.description||'');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  // Same inline editing behavior as Focus, but no growing modal height.
  useEffect(()=>setDescription(task.description||''),[task.id]);
  useEffect(()=>{
    if(description===(task.description||''))return;
    const timer=window.setTimeout(()=>{
      void onSaveDescription(description).catch(cause=>setError(cause instanceof Error?cause.message:'Не удалось сохранить описание.'));
    },900);
    return()=>window.clearTimeout(timer);
  },[description,task.description,task.id,onSaveDescription]);
  const flush=async()=>{
    if(description!==(task.description||''))await onSaveDescription(description);
  };
  const navigate=async(action:()=>void)=>{
    setSaving(true);setError('');
    try{await flush();action();}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить описание.');}
    finally{setSaving(false);}
  };
  return <div className="tp-overlay tp-subtask-focus-overlay" onMouseDown={event=>{
    if(event.target===event.currentTarget)void navigate(onClose);
  }}>
    <section className="tp-dialog tp-subtask-focus-dialog" role="dialog" aria-modal="true" aria-label="Подзадача">
      <header><div className="tp-subtask-focus-heading">
        <span className="tp-eyebrow">ПОДЗАДАЧА</span>
        <h2>{task.title}</h2>
        <p>{parentTask?.title||'Родительская задача'} · {dateLabel(task.dueDate,timeZone)}</p>
      </div><button type="button" onClick={()=>void navigate(onClose)} aria-label="Закрыть"><X size={19}/></button></header>
      {error&&<p className="tp-alert" role="alert">{error}</p>}
      <div className="tp-subtask-focus-body">
        <div className="tp-subtask-status">
          <span><Clock3 size={16}/> {task.status==='DONE'?'Подзадача выполнена':'Подзадача в работе'}</span>
          <button type="button" className={'tp-secondary'+(task.status==='DONE'?' is-complete':'')}
            disabled={saving} onClick={()=>void onToggleComplete()}>
            <Check size={16}/>{task.status==='DONE'?'Вернуть в работу':'Выполнить'}</button>
        </div>
        <label className="tp-focus-description-label">Описание подзадачи</label>
        <ResizableDescriptionSurface storageKey={'btm:'+userId+':test-page:subtask-description-height'}
          initialHeight={160} minHeight={100} maxHeight={300} className="tp-focus-description-resizable tp-subtask-description-resizable">
          <TaskDescriptionInput className="tp-focus-description-editor" value={description} onChange={setDescription}
            richInlineEditing placeholder="Нажмите, чтобы добавить описание…"/>
        </ResizableDescriptionSurface>
      </div>
      <div className="tp-focus-actions">
        <button type="button" className="tp-secondary" disabled={saving} onClick={()=>void navigate(onSettings)}>
          <Settings2 size={16}/> Настроить подзадачу</button>
        <button type="button" className="tp-primary" disabled={saving} onClick={()=>void navigate(onAskAi)}>
          {saving?<Loader2 className="tp-spin" size={16}/>:<Sparkles size={16}/>} Спросить ИИ</button>
      </div>
    </section>
  </div>;
}
