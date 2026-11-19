import { useState, type FormEvent } from 'react';
import { Check, Loader2, Minus, Palette, Plus, Trash2, X } from 'lucide-react';
import type { Habit, HabitDurationMode, HabitRecurrenceType } from './lib/types';

type Props = {
  habit?: Habit | null;
  onClose: () => void;
  onSave: (payload: Partial<Habit>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onFinish?: () => Promise<void>;
};
const icons = ['💧','🏃','📚','🧘','💊','🥗','📝','💪','🎯','✨'];
const colors = ['#22c55e','#38bdf8','#a78bfa','#f97316','#f43f5e','#eab308'];
const days = [{day:1,label:'Пн'},{day:2,label:'Вт'},{day:3,label:'Ср'},{day:4,label:'Чт'},
  {day:5,label:'Пт'},{day:6,label:'Сб'},{day:0,label:'Вс'}];
function uniqueTimes(values:string[]) {
  return [...new Set(values.filter(value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))].sort();
}
export function TestPageHabitDialog({habit,onClose,onSave,onDelete,onFinish}:Props) {
  const [name,setName]=useState(habit?.name||'');
  const [icon,setIcon]=useState(habit?.icon||'✨');
  const [customIcon,setCustomIcon]=useState(false);
  const [color,setColor]=useState(habit?.color||'#22c55e');
  const [targetCount,setTargetCount]=useState(habit?.targetCount||1);
  const [times,setTimes]=useState<string[]>(habit?.reminderTimes?.length?habit.reminderTimes:
    habit?.reminderTime?[habit.reminderTime]:[]);
  const [newTime,setNewTime]=useState('');
  const [durationMode,setDurationMode]=useState<HabitDurationMode>(habit?.durationMode||'FOREVER');
  const [endDate,setEndDate]=useState(habit?.endDate?.slice(0,10)||'');
  const [totalRepeats,setTotalRepeats]=useState(habit?.totalRepeatTarget||7);
  const [recurrenceType,setRecurrenceType]=useState<HabitRecurrenceType>(habit?.recurrenceType||'DAILY');
  const [intervalDays,setIntervalDays]=useState(habit?.intervalDays||2);
  const [weekdays,setWeekdays]=useState<number[]>(habit?.weekdays?.length?habit.weekdays:[1,2,3,4,5]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const handleSave=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!name.trim()){setError('Введите название привычки.');return;}
    if(recurrenceType==='WEEKDAYS'&&!weekdays.length){setError('Выберите хотя бы один день недели.');return;}
    if(durationMode==='UNTIL_DATE'&&!endDate){setError('Укажите дату окончания.');return;}
    setBusy(true);setError('');
    try{
      const reminders=uniqueTimes(times);
      await onSave({
        name:name.trim(),icon,color,targetCount:Math.max(1,Math.min(99,targetCount)),
        reminderTimes:reminders,reminderTime:reminders[0]||null,
        durationMode,endDate:durationMode==='UNTIL_DATE'?endDate:null,
        totalRepeatTarget:durationMode==='REPEAT_COUNT'?Math.max(1,Math.min(9999,totalRepeats)):null,
        recurrenceType,intervalDays:recurrenceType==='INTERVAL'?Math.max(1,Math.min(365,intervalDays)):null,
        weekdays:recurrenceType==='WEEKDAYS'?weekdays:[]
      });
    }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить привычку.');}
    finally{setBusy(false);}
  };
  const destructive=async(action:()=>Promise<void>,message:string)=>{
    if(!window.confirm(message))return;
    setBusy(true);setError('');
    try{await action();}
    catch(cause){setError(cause instanceof Error?cause.message:'Не удалось изменить привычку.');}
    finally{setBusy(false);}
  };
  return <div className="tp-overlay tp-habit-settings-overlay" onMouseDown={event=>{
    if(event.currentTarget===event.target&&!busy)onClose();
  }}>
    <section className="tp-dialog tp-habit-settings-dialog" role="dialog" aria-modal="true"
      aria-label={habit?'Настройки привычки':'Создание привычки'}>
      <header><div><span className="tp-eyebrow">ПРИВЫЧКИ</span><h2>{habit?'Настроить привычку':'Новая привычка'}</h2></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть"><X size={19}/></button></header>
      <form onSubmit={event=>void handleSave(event)} className="tp-habit-settings-form">
        {error&&<p className="tp-alert" role="alert">{error}</p>}
        <div className="tp-task-settings-row"><label htmlFor="tp-habit-name">Название</label>
          <input id="tp-habit-name" required maxLength={160} autoFocus value={name}
            onChange={e=>setName(e.target.value)} placeholder="Название привычки"/></div>
        <div className="tp-task-settings-row"><label>Иконка</label><div className="tp-habit-icon-options">
          {icons.map(item=><button key={item} type="button" aria-label={'Выбрать '+item}
            className={icon===item?'selected':''} onClick={()=>{setIcon(item);setCustomIcon(false);}}>{item}</button>)}
          <button type="button" aria-label="Свой эмодзи" onClick={()=>setCustomIcon(x=>!x)}><Plus size={18}/></button>
          {customIcon&&<input aria-label="Свой эмодзи" maxLength={8} value={icon} onChange={e=>setIcon(Array.from(e.target.value).slice(0,2).join(''))}/>}
        </div></div>
        <div className="tp-task-settings-row"><label>Цвет круга</label><div className="tp-habit-color-options">
          {colors.map(item=><button type="button" key={item} aria-label={'Цвет '+item} aria-pressed={color===item}
            style={{backgroundColor:item}} onClick={()=>setColor(item)}/>)}
          <label className="tp-habit-color-picker" title="Свой цвет"><Palette size={18}/>
            <input type="color" value={color} aria-label="Свой цвет" onChange={e=>setColor(e.target.value)}/></label>
        </div></div>
        <div className="tp-task-settings-row"><label>Повторов в день</label>
          <div className="tp-habit-stepper">
            <button type="button" disabled={targetCount<=1} onClick={()=>setTargetCount(x=>Math.max(1,x-1))} aria-label="Уменьшить"><Minus size={16}/></button>
            <strong>{targetCount}</strong>
            <button type="button" disabled={targetCount>=99} onClick={()=>setTargetCount(x=>Math.min(99,x+1))} aria-label="Увеличить"><Plus size={16}/></button>
          </div></div>
        <div className="tp-task-settings-row"><label>Уведомления</label><div className="tp-habit-times">
          {times.map(time=><span key={time} className="tp-habit-time-chip">{time}<button type="button" title="Удалить"
            aria-label={'Убрать уведомление '+time} onClick={()=>setTimes(values=>values.filter(x=>x!==time))}><X size={12}/></button></span>)}
          <label className="tp-habit-time-add"><Plus size={14}/> Добавить
            <input type="time" aria-label="Время нового уведомления" value={newTime} onChange={e=>{
              const value=e.target.value;setNewTime('');if(value)setTimes(old=>uniqueTimes([...old,value]));
            }}/></label>
        </div></div>
        <div className="tp-task-settings-row"><label htmlFor="tp-habit-duration">Продолжительность</label>
          <select className="tp-task-native-select" id="tp-habit-duration" value={durationMode}
            onChange={e=>setDurationMode(e.target.value as HabitDurationMode)}>
            <option value="FOREVER">Постоянно</option><option value="UNTIL_DATE">До даты</option>
            <option value="REPEAT_COUNT">По количеству повторов</option>
          </select></div>
        {durationMode==='UNTIL_DATE'&&<div className="tp-task-settings-row"><label htmlFor="tp-habit-end">Дата завершения</label>
          <input id="tp-habit-end" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></div>}
        {durationMode==='REPEAT_COUNT'&&<div className="tp-task-settings-row"><label htmlFor="tp-habit-total">Всего повторов</label>
          <input id="tp-habit-total" type="number" min={1} max={9999} value={totalRepeats}
            onChange={e=>setTotalRepeats(Math.max(1,Math.min(9999,Number(e.target.value)||1)))}/></div>}
        <div className="tp-task-settings-row"><label htmlFor="tp-habit-recurrence">Как часто повторяется</label>
          <select className="tp-task-native-select" id="tp-habit-recurrence" value={recurrenceType}
            onChange={e=>setRecurrenceType(e.target.value as HabitRecurrenceType)}>
            <option value="DAILY">Каждый день</option><option value="INTERVAL">Через интервал</option>
            <option value="WEEKDAYS">По конкретным дням</option>
          </select></div>
        {recurrenceType==='INTERVAL'&&<div className="tp-task-settings-row"><label htmlFor="tp-habit-interval">Каждые N дней</label>
          <input id="tp-habit-interval" type="number" min={1} max={365} value={intervalDays}
            onChange={e=>setIntervalDays(Math.max(1,Math.min(365,Number(e.target.value)||1)))}/></div>}
        {recurrenceType==='WEEKDAYS'&&<div className="tp-task-settings-row"><label>Дни недели</label>
          <div className="tp-habit-weekdays">{days.map(item=><button key={item.day} type="button"
            className={weekdays.includes(item.day)?'selected':''} aria-pressed={weekdays.includes(item.day)}
            onClick={()=>setWeekdays(old=>old.includes(item.day)?old.filter(x=>x!==item.day):[...old,item.day])}>
            {item.label}</button>)}</div></div>}
        <footer className="tp-task-settings-actions">
          {habit&&onDelete&&<button type="button" disabled={busy} className="tp-task-settings-danger"
            onClick={()=>void destructive(onDelete,'Удалить привычку «'+habit.name+'»?')}><Trash2 size={15}/> Удалить</button>}
          {habit&&onFinish&&<button type="button" disabled={busy} className="tp-secondary"
            onClick={()=>void destructive(onFinish,'Завершить привычку «'+habit.name+'»?')}><Check size={15}/> Завершить</button>}
          <span className="tp-task-settings-space"/>
          <button type="button" className="tp-secondary" disabled={busy} onClick={onClose}>Отмена</button>
          <button type="submit" className="tp-primary" disabled={busy}>
            {busy?<Loader2 className="tp-spin" size={15}/>:<Check size={15}/>} Сохранить</button>
        </footer>
      </form>
    </section>
  </div>;
}
