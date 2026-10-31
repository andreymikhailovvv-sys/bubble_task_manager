import type {Ref} from 'react';
import {DateTimePickerWithApply} from './DateTimePickerWithApply';

/** Original Focus Task add-subtask row extracted from personal App.tsx.
 * Both personal and Work now share the same actual controls and spacing. */
export function FocusedSubtaskComposer({title,dueAt,onTitleChange,onDueChange,onAdd,onCancel,disabled=false,
  monitoringEnabled=false,inputRef,popupZIndex,timelineTasks,canAdd=true}:{
  title:string;dueAt:string|null;onTitleChange:(s:string)=>void;onDueChange:(s:string|null)=>void;
  onAdd:()=>void;onCancel:()=>void;disabled?:boolean;monitoringEnabled?:boolean;
  inputRef?:Ref<HTMLInputElement>;popupZIndex?:number;canAdd?:boolean;
  timelineTasks?:Array<{id:string;title:string;dueDate?:string|null;isSubtask?:boolean;sphereColor?:string|null;taskType?:'TASK'|'EVENT'|'REMINDER'}>;
}){
 return <div className="flex items-center gap-2">
   <input ref={inputRef} autoFocus
     className="form-field min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs"
     placeholder="Название доп задачи" value={title} disabled={disabled}
     onChange={event=>onTitleChange(event.target.value)}
     onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(canAdd&&!disabled)onAdd();}}}/>
   <button type="button" disabled={disabled||!canAdd}
     className="primary-button rounded-lg px-2.5 py-1.5 text-xs font-semibold" onClick={onAdd}>Добавить</button>
   {!monitoringEnabled&&<DateTimePickerWithApply value={dueAt}
     title="Выбрать дату и время подзадачи" detachedPopup iconOnly popupAlign="right"
     popupZIndex={popupZIndex} timelineTasks={timelineTasks}
     buttonClassName="focused-task-inline-subtask-button"
     onChange={onDueChange}/>}
   <button type="button" className="secondary-button rounded-lg px-2.5 py-1.5 text-xs font-semibold"
     onClick={onCancel}>Отмена</button>
 </div>;
}
