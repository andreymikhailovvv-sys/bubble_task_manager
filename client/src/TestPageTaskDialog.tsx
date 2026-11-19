import { useState, type FormEvent } from 'react';
import { BellRing, Check, Clock3, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { Task, Sphere, AiChatModel } from './lib/types';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { buildManualRecurrence, defaultRecurrenceSlots, loadManualRecurrence, recurrenceWeekdays, type RecurrencePeriod, type RecurrenceSlot } from './lib/recurrenceSchedule';

type Props = {
  task?: Task;
  parentTask?: Task;
  spheres: Sphere[];
  timeZone: string;
  onClose: () => void;
  onSave: (payload: Partial<Task> & { collaborationScope?: 'me' | 'all' }) => Promise<void>;
  onDelete?: () => Promise<void>;
};
const levels = [1, 2, 3, 4, 5];
const models: Array<{value: AiChatModel; label: string}> = [
  {value:'gpt-6-luna',label:'GPT-6 Luna'},
  {value:'gpt-6.1-terra',label:'GPT-6.1 Terra'},
  {value:'gpt-6.1-sol',label:'GPT-6.1 Sol'}
];
const reminders = [
  {value:'',label:'Без напоминания'}, {value:'0',label:'В момент срока'},
  {value:'5',label:'За 5 минут'}, {value:'15',label:'За 15 минут'},
  {value:'30',label:'За 30 минут'}, {value:'60',label:'За час'},
  {value:'180',label:'За 3 часа'}, {value:'1440',label:'За день'}
];
const periods: Array<{value:RecurrencePeriod;label:string}> = [
  {value:'DAILY',label:'Каждый день'},
  {value:'WEEKLY',label:'Каждую неделю'},
  {value:'MONTHLY',label:'Каждый месяц'}
];
function localDate(value?:string|null) {
  if(!value)return '';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return '';
  const pad=(n:number)=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function toIso(value:string) {
  if(!value)return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error('Проверьте дату и время.');
  return date.toISOString();
}
export function TestPageTaskDialog({task,parentTask,spheres,timeZone,onSave,onClose,onDelete}:Props) {
  const isSubtask=Boolean(parentTask||task?.parentTaskId);
  const [title,setTitle]=useState(task?.title||'');
  const [description,setDescription]=useState(task?.description||'');
  const [dueDate,setDueDate]=useState(localDate(task?.dueDate));
  const [importance,setImportance]=useState(task?.importance??3);
  const [sphereId,setSphereId]=useState(task?.sphereId??parentTask?.sphereId??'');
  const [reminder,setReminder]=useState(task?.notifyBeforeMinutes==null?'':String(task.notifyBeforeMinutes));
  const [monitoring,setMonitoring]=useState(Boolean(task?.aiMonitoringEnabled));
  const [monitoringModel,setMonitoringModel]=useState<AiChatModel>(task?.aiMonitoringModel||'gpt-6-luna');
  const [recurring,setRecurring]=useState(Boolean(task?.isRecurring));
  const [recurrenceUntil,setRecurrenceUntil]=useState(localDate(task?.recurrenceUntil));
  const parsed=loadManualRecurrence(task?.recurrenceJson);
  const [period,setPeriod]=useState<RecurrencePeriod>(parsed?.period||'DAILY');
  const [slots,setSlots]=useState<RecurrenceSlot[]>(parsed?.slots||defaultRecurrenceSlots());
  const [ruleChanged,setRuleChanged]=useState(false);
  const [scope,setScope]=useState<'me'|'all'>('me');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const editSlot=(index:number,patch:Partial<RecurrenceSlot>)=>{
    setRuleChanged(true);
    setSlots(items=>items.map((item,i)=>i===index?{...item,...patch}:item));
  };
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!title.trim()) {setError('Введите название.');return;}
    setBusy(true);setError('');
    try {
      // Only send fields that this dialog actually exposes. Hidden properties
      // (urgency, status, collaboration, location, AI notifications) survive.
      const payload:Partial<Task> & {collaborationScope?:'me'|'all'}={
        title:title.trim(), description,
        dueDate:toIso(dueDate),
        importance,
        notifyBeforeMinutes:reminder===''?null:Number(reminder)
      };
      if(isSubtask){
        if(!task&&parentTask)payload.parentTaskId=parentTask.id;
      }else{
        payload.sphereId=sphereId||null;
        payload.aiMonitoringEnabled=monitoring;
        if(monitoring)payload.aiMonitoringModel=monitoringModel;
        if(recurring){
          payload.isRecurring=true;
          if(ruleChanged||!task?.recurrenceJson){
            const rule=buildManualRecurrence(period,slots,timeZone);
            payload.recurrenceJson=rule.schedule;
            payload.recurrenceText=rule.summary;
            payload.recurrenceSummary=rule.summary;
          }
          payload.recurrenceUntil=toIso(recurrenceUntil);
          payload.dueDate=null;
        } else if(task?.isRecurring){
          Object.assign(payload,{isRecurring:false,recurrenceJson:null,recurrenceText:null,recurrenceSummary:null,recurrenceUntil:null});
        }
        if(task?.isCollaborative&&task.collaborationOwner)payload.collaborationScope=scope;
      }
      await onSave(payload);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Не удалось сохранить задачу.');
    }finally{setBusy(false);}
  };
  return <div className="tp-overlay tp-task-settings-overlay" onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}>
    <section className="tp-dialog tp-task-settings-dialog" role="dialog" aria-modal="true"
      aria-label={isSubtask?'Настройки подзадачи':'Настройки задачи'}>
      <header><div><span className="tp-eyebrow">{isSubtask?'ПОДЗАДАЧА':'ЗАДАЧА'}</span>
        <h2>{task?'Настроить '+(isSubtask?'подзадачу':'задачу'):isSubtask?'Новая подзадача':'Новая задача'}</h2>
        {isSubtask&&<p className="tp-settings-parent">{parentTask?.title||'Параметры подзадачи'}</p>}</div>
        <button type="button" onClick={onClose} aria-label="Закрыть"><X size={19}/></button></header>
      <form className="tp-task-settings-form" onSubmit={event=>void submit(event)}>
        {error&&<p className="tp-alert" role="alert">{error}</p>}
        <div className="tp-task-settings-row"><label htmlFor="tp-task-name">Название</label>
          <input id="tp-task-name" value={title} maxLength={180} required autoFocus onChange={e=>setTitle(e.target.value)}
            placeholder={isSubtask?'Что нужно сделать?':'Название задачи'}/></div>
        <div className="tp-task-settings-row tp-task-description-row"><label>Описание</label>
          <TaskDescriptionInput className="tp-task-settings-description" value={description}
            onChange={setDescription} richInlineEditing placeholder="Краткое описание или заметки к задаче…"/></div>
        {!isSubtask&&<div className="tp-task-settings-row"><label htmlFor="tp-task-sphere">Сектор</label>
          <select id="tp-task-sphere" className="tp-task-native-select" value={sphereId||''}
            onChange={e=>setSphereId(e.target.value)}>
            <option value="">Без сектора</option>{spheres.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>}
        <div className="tp-task-settings-row"><label htmlFor="tp-task-due">Дата и время</label>
          <input id="tp-task-due" type="datetime-local" disabled={!isSubtask&&recurring} value={dueDate}
            onChange={e=>setDueDate(e.target.value)}/></div>
        <div className="tp-task-settings-row"><label htmlFor="tp-task-importance">Важность</label>
          <select id="tp-task-importance" className="tp-task-native-select" value={importance}
            onChange={e=>setImportance(Number(e.target.value))}>
            {levels.map(i=><option key={i} value={i}>{i}</option>)}
          </select></div>
        <div className="tp-task-settings-row"><label htmlFor="tp-task-reminder"><BellRing size={15}/> Уведомление</label>
          <select id="tp-task-reminder" className="tp-task-native-select" value={reminder}
            onChange={e=>setReminder(e.target.value)}>
            {reminders.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
          </select></div>
        {!isSubtask&&<>
          <div className="tp-task-settings-row"><label htmlFor="tp-task-monitoring">Автомониторинг ИИ</label>
            <button id="tp-task-monitoring" type="button" className={'tp-setting-toggle'+(monitoring?' on':'')}
              role="switch" aria-checked={monitoring} onClick={()=>setMonitoring(x=>!x)}>
              {monitoring?'Включён':'Выключен'}</button></div>
          {monitoring&&<div className="tp-task-settings-row"><label htmlFor="tp-task-monitor-model">Модель автомониторинга</label>
            <select id="tp-task-monitor-model" className="tp-task-native-select" value={monitoringModel}
              onChange={e=>setMonitoringModel(e.target.value as AiChatModel)}>
              {models.map(m=><option value={m.value} key={m.value}>{m.label}</option>)}
            </select></div>}
          <div className="tp-task-settings-row"><label htmlFor="tp-task-repeat"><Clock3 size={15}/> Повторение</label>
            <button id="tp-task-repeat" type="button" className={'tp-setting-toggle'+(recurring?' on':'')}
              role="switch" aria-checked={recurring} onClick={()=>setRecurring(x=>!x)}>
              {recurring?'Включено':'Выключено'}</button></div>
          {recurring&&<div className="tp-task-recurrence">
            <div className="tp-task-settings-row"><label htmlFor="tp-task-period">Периодичность</label>
              <select id="tp-task-period" className="tp-task-native-select" value={period}
                onChange={e=>{setPeriod(e.target.value as RecurrencePeriod);setRuleChanged(true);}}>
                {periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select></div>
            {slots.map((slot,index)=><div key={index} className="tp-task-repeat-slot">
              <label>Повторение {index+1}</label>
              <input type="time" aria-label={'Время повторения '+(index+1)} value={slot.time}
                onChange={e=>editSlot(index,{time:e.target.value})}/>
              {period==='WEEKLY'&&<select className="tp-task-native-select" aria-label="День недели"
                value={slot.weekday||1} onChange={e=>editSlot(index,{weekday:Number(e.target.value)})}>
                {recurrenceWeekdays.map(w=><option key={w.value} value={w.value}>{w.label}</option>)}
              </select>}
              {period==='MONTHLY'&&<select className="tp-task-native-select" aria-label="Число месяца"
                value={slot.monthDay||1} onChange={e=>editSlot(index,{monthDay:Number(e.target.value)})}>
                {Array.from({length:31},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}
              </select>}
              <button type="button" title="Удалить повторение" aria-label="Удалить повторение" disabled={slots.length===1}
                onClick={()=>{setSlots(items=>items.filter((_,i)=>i!==index));setRuleChanged(true);}}><Trash2 size={16}/></button>
            </div>)}
            <button type="button" className="tp-secondary" disabled={slots.length>=31}
              onClick={()=>{setSlots(items=>[...items,{...defaultRecurrenceSlots()[0]}]);setRuleChanged(true);}}>
              <Plus size={15}/> Добавить время</button>
            <div className="tp-task-settings-row"><label htmlFor="tp-task-until">Повторять до</label>
              <input type="datetime-local" id="tp-task-until" value={recurrenceUntil}
                onChange={e=>setRecurrenceUntil(e.target.value)}/></div>
            {task?.recurrenceJson&&!parsed&&!ruleChanged&&
              <p className="tp-task-settings-hint">Существующее расписание сохранится до изменения периодичности.</p>}
          </div>}
          {task?.isCollaborative&&task.collaborationOwner&&<div className="tp-task-settings-row">
            <label htmlFor="tp-task-collaboration-scope">Применить изменения для</label>
            <select id="tp-task-collaboration-scope" className="tp-task-native-select" value={scope}
              onChange={e=>setScope(e.target.value as 'me'|'all')}>
              <option value="me">Только для меня</option><option value="all">Для всех участников</option>
            </select>
          </div>}
        </>}
        <footer className="tp-task-settings-actions">
          {onDelete&&<button type="button" className="tp-task-settings-danger" disabled={busy}
            onClick={()=>void onDelete()}><Trash2 size={15}/> Удалить</button>}
          <span className="tp-task-settings-space"/>
          <button type="button" className="tp-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="tp-primary" disabled={busy}>
            {busy?<Loader2 className="tp-spin" size={16}/>:<Check size={16}/>} Сохранить
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
