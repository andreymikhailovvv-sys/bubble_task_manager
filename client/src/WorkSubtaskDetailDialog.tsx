import {useMemo,useState} from 'react';
import {TaskEditor} from './components/TaskEditor';
import {api,type WorkSubtask,type WorkWorkspace} from './lib/api';
import type {Task} from './lib/types';

/* This is deliberately the original personal TaskEditor, not a reconstructed
   corporate lookalike. Only its persistence adapter differs. */
export default function WorkSubtaskDetailDialog({organizationId,projectId,taskId,subtask,workspace,selfMemberId,
 onClose,onUpdated,onDeleted,parentTaskTitle}:{
 organizationId:string;projectId:string;taskId:string;subtask:WorkSubtask;
 workspace:WorkWorkspace;selfMemberId:string|null;onClose:()=>void;
 onUpdated:(next:WorkSubtask)=>void;onDeleted:(id:string)=>void;parentTaskTitle?:string;
}){
 const manager=['OWNER','ADMIN','MANAGER'].includes(workspace.organization.role);
 const canEdit=manager||(workspace.organization.role==='MEMBER'&&!!selfMemberId&&subtask.createdByMemberId===selfMemberId);
 const [error,setError]=useState('');
 const personalTask=useMemo<Task>(()=>({
   id:subtask.id,title:subtask.title,description:subtask.description||'',
   parentTaskId:taskId,taskType:'TASK',
   importance:subtask.importance??3,urgency:2,priorityScore:2,
   dueDate:subtask.dueAt,status:subtask.isDone?'DONE':'TODO',
   createdAt:subtask.createdAt,updatedAt:subtask.updatedAt
 }),[subtask,taskId]);
 const save=async(patch:Partial<Task>)=>{
   if(!canEdit)return;
   const data:Partial<Pick<WorkSubtask,'title'|'description'|'importance'|'dueAt'>>={};
   if(patch.title!==undefined)data.title=patch.title;
   if(patch.description!==undefined)data.description=patch.description;
   if(patch.importance!==undefined)data.importance=patch.importance;
   if(patch.dueDate!==undefined)data.dueAt=patch.dueDate;
   if(!Object.keys(data).length)return;
   setError('');
   try{
     const result=await api.workUpdateSubtask(organizationId,projectId,taskId,subtask.id,data);
     onUpdated(result.subtask);
   }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить подзадачу');throw e;}
 };
 const complete=async()=>{
   const result=await api.workUpdateSubtask(organizationId,projectId,taskId,subtask.id,{isDone:!subtask.isDone});
   onUpdated(result.subtask);onClose();
 };
 const del=async()=>{
   if(!canEdit||!window.confirm('Удалить подзадачу?'))return;
   await api.workDeleteSubtask(organizationId,projectId,taskId,subtask.id);
   onDeleted(subtask.id);onClose();
 };
 return <>
   <TaskEditor key={subtask.id} task={personalTask} spheres={[]} externalSubtask externalReadOnly={!canEdit}
     defaultAiNotificationsEnabled={false} parentTaskTitle={parentTaskTitle}
     onOpenParentTask={onClose}
     onSave={async patch=>{await save(patch);}}
     onAutoSave={canEdit?save:undefined}
     onGenerateWithAi={async()=>undefined}
     onCancel={onClose} onComplete={complete} onDelete={canEdit?del:undefined}/>
   {error&&<div className="fixed bottom-5 left-1/2 z-[300] -translate-x-1/2 rounded-xl border border-rose-500 bg-slate-900 p-3 text-xs text-rose-200" role="alert">{error}</div>}
 </>;
}
