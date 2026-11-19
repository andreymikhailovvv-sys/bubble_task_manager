import { useState, type FormEvent } from 'react';
import { BellRing, CalendarClock, Check, ChevronDown, Clock3, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react';
import type { Task, Sphere, AiChatModel } from './lib/types';
import { CustomSelect } from './components/CustomSelect';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { buildManualRecurrence, defaultRecurrenceSlots, loadManualRecurrence, recurrenceWeekdays, type RecurrencePeriod, type RecurrenceSlot } from './lib/recurrenceSchedule';

type Props = {
  task?: Task;
  parentTask?: Task;
  spheres: Sphere[];
  timeZone: string;
  onClose: () => void;
  onSave: (payload: Partial<Task> & {collaborationScope?: 'me' | 'all'}) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAdvanced?: () => void;
};
type Status = NonNullable<Task['status']>;
const statuses: Array<{value:Status;label:string}> = [
  {value:'TODO',label:'К выполнению'}, {value:'IN_PROGRESS',label:'В работе'}, {value:'DONE',label:'Выполнена'}
];
const levels = [1,2,3,4,5].map(value=>({value:String(value),label:String(value)}));
const models = [
  {value:'gpt-6-luna',label:'GPT-6 Luna'},
  {value:'gpt-6.1-terra',label:'GPT-6.1 Terra'},
  {value:'gpt-6.1-sol',label:'GPT-6.1 Sol'}
];
const notifyOptions = [
  {value:'',label:'Без напоминания'},{value:'0',label:'В момент срока'},
  {value:'5',label:'За 5 минут'}, {value:'15',label:'За 15 минут'},
  {value:'30',label:'За 30 минут'},{value:'60',label:'За час'},
  {value:'180',label:'За 3 часа'}, {value:'1440',label:'За день'}
];
const periodOptions = [{value:'DAILY',label:'Каждый день'},{value:'WEEKLY',label:'Каждую неделю'},{value:'MONTHLY',label:'Каждый месяц'}];
const daysOfMonth = Array.from({length:31},(_,i)=>({value:String(i+1),label:String(i+1)}));
const weekdays = recurrenceWeekdays.map(day=>({value:String(day.value),label:day.label}));
function datetime(value:string|null|undefined):string {
  if(!value)return '';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return '';
  const pad=(n:number)=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function iso(value:string):string|null {
  if(!value)return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error('Проверьте дату и время.');
  return date.toISOString();
}
function initial(task?:Task,parent?:Task) {
  return {
    title:task?.title||'',
    description:task?.description||'',
    status:(task?.status||'TODO') as Status,
    sphereId:task?.sphereId??parent?.sphereId??null,
    dueDate:datetime(task?.dueDate),
    importance:task?.importance??3,
    urgency:task?.urgency??3,
    location:task?.location||'',
    notifyBeforeMinutes:task?.notifyBeforeMinutes==null?'':String(task.notifyBeforeMinutes),
    aiNotificationsEnabled:task?.aiNotificationsEnabled!==false,
    aiMonitoringEnabled:task?.aiMonitoringEnabled===true,
    aiMonitoringModel:task?.aiMonitoringModel||('gpt-6-luna' as AiChatModel),
    isRecurring:task?.isRecurring===true,
    recurrenceUntil:datetime(task?.recurrenceUntil),
    collaborationScope:'me' as 'me'|'all'
  };
}
export function TestPageTaskDialog({task,parentTask,spheres,timeZone,onSave,onClose,onDelete,onAdvanced}:Props) {
  const [draft,setDraft]=useState(()=>initial(task,parentTask));
  const parsed=loadManualRecurrence(task?.recurrenceJson);
  const [period,setPeriod]=useState<RecurrencePeriod>(parsed?.period||'DAILY');
  const [slots,setSlots]=useState<RecurrenceSlot[]>(parsed?.slots||defaultRecurrenceSlots());
  const [recurrenceTouched,setRecurrenceTouched]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const set = <K extends keyof typeof draft>(key:K,value:(typeof draft)[K]) =>
    setDraft(current=>({...current,[key]:value}));
  const changeSlot=(index:number,patch:Partial<RecurrenceSlot>)=>{
    setRecurrenceTouched(true);
    setSlots(items=>items.map((item,i)=>i===index?{...item,...patch}:item));
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError('');
    if(!draft.title.trim()){setError('Введите название.');return;}
    setBusy(true);
    try {
      const payload:Partial<Task> & {collaborationScope?:'me'|'all'}={
        title:draft.title.trim(), description:draft.description,
        status:draft.status,sphereId:draft.sphereId,
        dueDate:iso(draft.dueDate),importance:draft.importance,urgency:draft.urgency,
        location:draft.location.trim()||null,
        notifyBeforeMinutes:draft.notifyBeforeMinutes===''?null:Number(draft.notifyBeforeMinutes),
        aiNotificationsEnabled:draft.aiNotificationsEnabled,
        aiMonitoringEnabled:draft.aiMonitoringEnabled,
        aiMonitoringModel:draft.aiMonitoringModel,
        ...(parentTask&&!task?{parentTaskId:parentTask.id}:{}),
        ...(task?.isCollaborative && task.collaborationOwner ? {collaborationScope:draft.collaborationScope}: {})
      };
      if(draft.isRecurring){
        payload.isRecurring=true;
        if(recurrenceTouched || !task?.recurrenceJson){
          const rule=buildManualRecurrence(period,slots,timeZone);
          payload.recurrenceJson=rule.schedule;
          payload.recurrenceSummary=rule.summary;
          payload.recurrenceText=rule.summary;
        }
        payload.recurrenceUntil=iso(draft.recurrenceUntil);
        payload.dueDate=null;
      }else if(task?.isRecurring){
        Object.assign(payload,{isRecurring:false,recurrenceJson:null,recurrenceSummary:null,recurrenceText:null,recurrenceUntil:null});
      }
      await onSave(payload);
    }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить параметры задачи.');}
    finally{setBusy(false);}
  };
  const isSubtask=Boolean(parentTask||task?.parentTaskId);
  return <div className="tp-overlay tp-task-settings-overlay" onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="tp-dialog tp-task-settings-dialog" role="dialog" aria-modal="true" aria-label={isSubtask?'Настройки подзадачи':'Настройки задачи'}>
      <header><div><span className="tp-eyebrow">{isSubtask?'ПОДЗАДАЧА':'ЗАДАЧА'}</span><h2>{task?'Настроить '+(isSubtask?'подзадачу':'задачу'):'Добавить подзадачу'}</h2>
        {(parentTask||task?.parentTaskId) && <p className="tp-settings-parent">{parentTask?.title||'Параметры подзадачи'}</p>}</div>
        <button type="button" onClick={onClose} aria-label="Закрыть"><X size={19}/></button></header>
      <form className="tp-task-settings-form" onSubmit={event=>void submit(event)}>
        {error&&<p className="tp-alert" role="alert">{error}</p>}
        <div className="tp-task-settings-row"><label htmlFor="tp-task-name">Название</label><input id="tp-task-name" value={draft.title} maxLength={180} required autoFocus
          onChange={event=>set('title',event.target.value)} placeholder={isSubtask?'Что нужно сделать?':'Название задачи'}/></div>
        <div className="tp-task-settings-row tp-task-description-row"><label>Описание</label>
          <TaskDescriptionInput className="tp-task-settings-description" value={draft.description} onChange={value=>set('description',value)}
            richInlineEditing placeholder="Краткое описание или заметки к задаче…"/></div>
        <div className="tp-task-settings-row"><label>Статус</label>
          <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Статус задачи"
            value={draft.status} options={statuses} onChange={value=>set('status',value as Status)}/></div>
        <div className="tp-task-settings-row"><label>Сектор</label>
          <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Сектор задачи"
            value={draft.sphereId||''} options={[{value:'',label:'Без сектора'},...spheres.map(s=>({value:s.id,label:s.name,color:s.color}))]}
            onChange={value=>set('sphereId',value||null)}/></div>
        <div className="tp-task-settings-row"><label htmlFor="tp-task-due">Дата и время</label><input id="tp-task-due" type="datetime-local" disabled={draft.isRecurring}
          value={draft.dueDate} onChange={event=>set('dueDate',event.target.value)}/></div>
        <div className="tp-task-settings-row"><label>Важность</label><CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu"
          ariaLabel="Важность" value={String(draft.importance)} options={levels} onChange={v=>set('importance',Number(v))}/></div>
        <div className="tp-task-settings-row"><label>Срочность</label><CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu"
          ariaLabel="Срочность" value={String(draft.urgency)} options={levels} onChange={v=>set('urgency',Number(v))}/></div>
        <div className="tp-task-settings-row"><label htmlFor="tp-task-location">Место</label><input id="tp-task-location"
          value={draft.location} maxLength={500} onChange={event=>set('location',event.target.value)} placeholder="Не указано"/></div>
        <div className="tp-task-settings-row"><label><BellRing size={15}/> Уведомление</label>
          <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Напоминание"
            value={draft.notifyBeforeMinutes} options={notifyOptions} onChange={v=>set('notifyBeforeMinutes',v)}/></div>
        <div className="tp-task-settings-row"><label>ИИ-уведомления</label>
          <button type="button" className={'tp-setting-toggle'+(draft.aiNotificationsEnabled?' on':'')} role="switch" aria-checked={draft.aiNotificationsEnabled}
            onClick={()=>set('aiNotificationsEnabled',!draft.aiNotificationsEnabled)}>{draft.aiNotificationsEnabled?'Включены':'Выключены'}</button></div>
        <div className="tp-task-settings-row"><label>Автомониторинг ИИ</label>
          <button type="button" className={'tp-setting-toggle'+(draft.aiMonitoringEnabled?' on':'')} role="switch" aria-checked={draft.aiMonitoringEnabled}
            onClick={()=>set('aiMonitoringEnabled',!draft.aiMonitoringEnabled)}>{draft.aiMonitoringEnabled?'Включён':'Выключен'}</button></div>
        {draft.aiMonitoringEnabled&&<div className="tp-task-settings-row"><label>Модель автомониторинга</label>
          <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Модель автомониторинга"
            value={draft.aiMonitoringModel} options={models} onChange={v=>set('aiMonitoringModel',v as AiChatModel)}/></div>}
        <div className="tp-task-settings-row"><label><Clock3 size={15}/> Повторение</label>
          <button type="button" className={'tp-setting-toggle'+(draft.isRecurring?' on':'')} role="switch" aria-checked={draft.isRecurring}
            onClick={()=>set('isRecurring',!draft.isRecurring)}>{draft.isRecurring?'Включено':'Выключено'}</button></div>
        {draft.isRecurring&&<div className="tp-task-recurrence">
          <div className="tp-task-settings-row"><label>Периодичность</label>
            <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Периодичность"
              value={period} options={periodOptions} onChange={value=>{setPeriod(value as RecurrencePeriod);setRecurrenceTouched(true);}}/></div>
          {slots.map((slot,index)=><div key={index} className="tp-task-repeat-slot">
            <label>Повторение {index+1}</label><input type="time" aria-label={'Время повторения '+(index+1)} value={slot.time} onChange={e=>changeSlot(index,{time:e.target.value})}/>
            {period==='WEEKLY'&&<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="День недели" value={String(slot.weekday||1)} options={weekdays}
              onChange={value=>changeSlot(index,{weekday:Number(value)})}/>}
            {period==='MONTHLY'&&<CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Число месяца" value={String(slot.monthDay||1)} options={daysOfMonth}
              onChange={value=>changeSlot(index,{monthDay:Number(value)})}/>}
            <button type="button" aria-label="Удалить повторение" disabled={slots.length===1} onClick={()=>{setSlots(items=>items.filter((_,i)=>i!==index));setRecurrenceTouched(true);}}><Trash2 size={16}/></button>
          </div>)}
          <button type="button" className="tp-secondary" disabled={slots.length>=31} onClick={()=>{setSlots(items=>[...items,{...defaultRecurrenceSlots()[0]}]);setRecurrenceTouched(true);}}><Plus size={15}/> Добавить время</button>
          <div className="tp-task-settings-row"><label htmlFor="tp-task-until">Повторять до</label>
            <input type="datetime-local" id="tp-task-until" value={draft.recurrenceUntil} onChange={event=>set('recurrenceUntil',event.target.value)}/></div>
          {task?.recurrenceJson&&!parsed&&!recurrenceTouched&&<p className="tp-task-settings-hint">Существующее нестандартное расписание сохранится, пока вы не измените периодичность.</p>}
        </div>}
        {task?.isCollaborative&&task.collaborationOwner&&<div className="tp-task-settings-row"><label>Применить изменения для</label>
          <CustomSelect detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu" ariaLabel="Область изменения совместной задачи"
            value={draft.collaborationScope} options={[{value:'me',label:'Только для меня'},{value:'all',label:'Для всех участников'}]}
            onChange={v=>set('collaborationScope',v as 'me'|'all')}/></div>}
        <footer className="tp-task-settings-actions">
          {onDelete&&<button type="button" className="tp-task-settings-danger" disabled={busy} onClick={()=>void onDelete()}><Trash2 size={15}/>Удалить</button>}
          {onAdvanced&&<button type="button" className="tp-task-settings-advanced" onClick={()=>setAdvancedOpen(x=>!x)}
            aria-expanded={advancedOpen}><Settings2 size={15}/>Дополнительно <ChevronDown size={14}/></button>}
          {advancedOpen&&onAdvanced&&<button type="button" className="tp-secondary" onClick={onAdvanced}>Открыть расширенный редактор</button>}
          <span className="tp-task-settings-space"/>
          <button type="button" className="tp-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="tp-primary" disabled={busy}>{busy?<Loader2 className="tp-spin" size={16}/>:<Check size={16}/>} Сохранить</button>
        </footer>
      </form>
    </section>
  </div>;
}
