import {useState} from 'react';
import {ChevronDown} from 'lucide-react';

export type TaskAiRecipientMember={id:string;name:string;color:string};
export function TaskAiRecipientPicker({members,value,onChange,disabled=false}:{
 members:TaskAiRecipientMember[];value:string;onChange:(memberId:string)=>void;disabled?:boolean;
}){
 const [open,setOpen]=useState(false);
 return <div className="relative mb-1 flex justify-end">
   <button type="button"
     className="task-ai-recipient-trigger inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
     disabled={disabled} onClick={()=>setOpen(prev=>!prev)} aria-haspopup="menu" aria-expanded={open}>
     <span className="task-ai-recipient-label">Получатель:</span>
     <span>{value==='ai'?'ИИ':members.find(m=>m.id===value)?.name||'ИИ'}</span>
     <ChevronDown size={12}/>
   </button>
   {open&&<div className="task-ai-recipient-menu absolute bottom-full right-0 z-30 mb-1 min-w-48 rounded-xl border p-1.5 shadow-2xl" role="menu">
     <button type="button" role="menuitem" className={`task-ai-recipient-item block w-full rounded-lg px-3 py-2 text-left text-xs ${value==='ai'?'task-ai-recipient-item-active':''}`}
       onClick={()=>{onChange('ai');setOpen(false);}}>ИИ</button>
     {members.map(member=><button type="button" role="menuitem" key={member.id}
       className={`task-ai-recipient-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${value===member.id?'task-ai-recipient-item-active':''}`}
       onClick={()=>{onChange(member.id);setOpen(false);}}>
       <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:member.color}}/>
       <span className="truncate">{member.name}</span>
     </button>)}
   </div>}
 </div>;
}
