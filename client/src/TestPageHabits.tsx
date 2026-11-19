import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check, ChevronDown, ChevronRight, Flame, Loader2, Minus, Plus, Target, X } from 'lucide-react';
import { api } from './lib/api';
import type { Habit } from './lib/types';
import { MiniAppHabitTracker } from './components/MiniAppHabitTracker';

const dateKey = (timeZone:string, d:Date) => {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
};
const dayNumber=(key:string)=>Date.parse(key+'T00:00:00Z')/86_400_000;
function scheduled(habit:Habit,key:string,timeZone:string,day:Date) {
  if(habit.isArchived||habit.isAutoCompleted||habit.finishedAt)return false;
  if(habit.createdAt&&key<dateKey(timeZone,new Date(habit.createdAt)))return false;
  if(habit.durationMode==='UNTIL_DATE'&&habit.endDate&&key>habit.endDate.slice(0,10))return false;
  if(habit.durationMode==='REPEAT_COUNT'&&habit.totalRepeatTarget!=null
    && (habit.completedTotal??0)>=habit.totalRepeatTarget)return false;
  if(habit.recurrenceType==='WEEKDAYS') {
    // Convert the calendar date into the requested user's timezone.
    const weekday=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short'}).format(day);
    const index=({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6} as Record<string,number>)[weekday];
    return habit.weekdays.includes(index);
  }
  if(habit.recurrenceType==='INTERVAL'){
    const start=habit.createdAt?dateKey(timeZone,new Date(habit.createdAt)):key;
    return (dayNumber(key)-dayNumber(start))%Math.max(1,habit.intervalDays||1)===0;
  }
  return true;
}
const getAmount=(habit:Habit,key:string)=>habit.stats.find(stat=>stat.dateKey===key)?.amount||0;
export function TestPageHabits({timeZone}:{timeZone:string}) {
  const [habits,setHabits]=useState<Habit[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Habit|null>(null);
  const [expanded,setExpanded]=useState(false);
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{
    let active=true;
    void api.getHabits().then(items=>{if(active)setHabits(items);})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Не удалось загрузить привычки.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    const interval=window.setInterval(()=>setClock(new Date()),60_000);
    return()=>window.clearInterval(interval);
  },[]);
  const key=dateKey(timeZone,clock);
  const items=useMemo(()=>habits.filter(h=>!h.isArchived&&!h.finishedAt),[habits]);
  const eligible=items.filter(h=>scheduled(h,key,timeZone,clock));
  const complete=eligible.filter(h=>getAmount(h,key)>=Math.max(1,h.targetCount)).length;
  const change=async(habit:Habit,amount:1|-1)=>{
    if(busy)return;
    setBusy(habit.id);setError('');
    try{
      const updated=amount>0
        ? await api.completeHabit(habit.id,{dateKey:key,amount:1})
        : await api.uncompleteHabit(habit.id,{dateKey:key,amount:1});
      setHabits(current=>current.map(h=>h.id===updated.id?updated:h));
      setSelected(current=>current?.id===updated.id?updated:current);
      if(amount>0)void api.recordEfficiencyEvent({delta:1,bucket:'habit'}).catch(()=>undefined);
    }catch(cause){setError(cause instanceof Error?cause.message:'Не удалось изменить выполнение привычки.');}
    finally{setBusy(null);}
  };
  return <section className="tp-card tp-habits-card" aria-label="Привычки">
    <div className="tp-card-head tp-habits-heading">
      <div><h2><Flame size={19}/> Мои привычки</h2><p>Выполнение привычек на сегодня</p></div>
      <div className="tp-habits-count"><strong>{complete} / {eligible.length}</strong><span>выполнено</span></div>
    </div>
    {loading?<div className="tp-loading tp-habits-loading"><Loader2 className="tp-spin" size={18}/> Загружаем привычки…</div>:
      error&&!items.length?<p className="tp-alert" role="alert">{error}</p>:
      !items.length?<p className="tp-empty">Пока нет привычек. Создать их можно в основном Планировыче.</p>:<>
        {error&&<p className="tp-alert" role="alert">{error}</p>}
        <div className="tp-habits-grid">
          {(expanded?items:items.slice(0,6)).map(habit=>{
            const amount=getAmount(habit,key), target=Math.max(1,habit.targetCount);
            const progress=Math.min(1,amount/target);
            const isToday=scheduled(habit,key,timeZone,clock);
            const style={'--tp-habit-color':habit.color||'#63aee9','--tp-habit-progress':Math.round(progress*100)+'%'} as CSSProperties;
            return <article className={'tp-habit-item'+(isToday?'':' tp-habit-not-today')+(amount>=target&&isToday?' is-complete':'')}
              key={habit.id} style={style}>
              <button type="button" className="tp-habit-open" onClick={()=>setSelected(habit)} aria-label={'Статистика привычки '+habit.name}>
                <span className="tp-habit-ring"><span>{habit.icon||'✓'}</span>{amount>=target&&isToday&&<Check size={11} className="tp-habit-ring-check"/>}</span>
                <span className="tp-habit-info"><strong>{habit.name}</strong>
                  <small>{isToday?amount+' из '+target+' за сегодня':'Не запланировано на сегодня'}</small></span>
                <ChevronRight size={15} className="tp-habit-chevron"/>
              </button>
              {isToday&&<div className="tp-habit-controls">
                {amount>0&&<button type="button" onClick={()=>void change(habit,-1)} disabled={busy!==null} aria-label={'Уменьшить выполнение '+habit.name}><Minus size={15}/></button>}
                <button type="button" onClick={()=>void change(habit,1)} disabled={busy!==null||amount>=target}
                  aria-label={'Отметить выполнение '+habit.name}>
                  {busy===habit.id?<Loader2 size={14} className="tp-spin"/>:<Plus size={15}/>}</button>
              </div>}
            </article>;
          })}
        </div>
        {items.length>6&&<button type="button" className="tp-habits-show-more" onClick={()=>setExpanded(x=>!x)}>
          {expanded?'Свернуть':'Показать все привычки ('+items.length+')'}<ChevronDown size={16} className={expanded?'rotate-180':''}/>
        </button>}
      </>}
    {selected&&<div className="tp-overlay tp-habit-detail-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)setSelected(null);}}>
      <section className="tp-dialog tp-habit-detail" role="dialog" aria-modal="true" aria-label={'Статистика '+selected.name}>
        <header><div><span className="tp-eyebrow">ПРИВЫЧКА</span><h2>{selected.name}</h2></div>
          <button type="button" onClick={()=>setSelected(null)} aria-label="Закрыть"><X size={19}/></button></header>
        <div className="tp-habit-detail-content"><MiniAppHabitTracker habit={selected} onHabitChanged={updated=>{
          setSelected(updated);setHabits(current=>current.map(h=>h.id===updated.id?updated:h));
        }}/></div>
      </section>
    </div>}
  </section>;
}
