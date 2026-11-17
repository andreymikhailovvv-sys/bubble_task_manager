import type { AiTaskProposal } from '../lib/types';

export type TaskChipValues=NonNullable<AiTaskProposal['operations'][number]['editable']>;
type Props={value:TaskChipValues;disabled:boolean;
  spheres:Array<{id:string;name:string}>;onChange:(key:keyof TaskChipValues,value:string|number|null)=>void};
const NAMES:Record<string,string>={
  title:'Название',description:'Описание',sphereId:'Сектор',dueDate:'Дата и время',
  importance:'Важность',urgency:'Срочность',status:'Статус',
  location:'Место',notifyBeforeMinutes:'Уведомление, мин.'
};
const TYPES=['title','description','sphereId','dueDate','importance','urgency','status','location','notifyBeforeMinutes'] as const;
function localDate(value:string|null|undefined){
  if(!value)return '';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const pad=(n:number)=>String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}
export function TaskChipFields({value,disabled,spheres,onChange}:Props){
  return <div className="ai-task-proposal__editable" aria-label="Редактируемые поля задачи">
    {TYPES.filter(key=>key in value).map(key=><label className="ai-task-proposal__field" key={key}>
      <span>{NAMES[key]}</span>
      {key==='sphereId'?<select value={value.sphereId??''} disabled={disabled}
        onChange={e=>onChange(key,e.target.value||null)}>
        <option value="">Без сектора</option>
        {spheres.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>:key==='dueDate'?<input type="datetime-local" disabled={disabled}
        value={localDate(value.dueDate)} onChange={e=>onChange(key,e.target.value?new Date(e.target.value).toISOString():null)}/>:
      key==='status'?<select value={value.status??'TODO'} disabled={disabled}
        onChange={e=>onChange(key,e.target.value)}>
        <option value="TODO">Не начато</option><option value="IN_PROGRESS">В работе</option>
        <option value="DONE">Выполнено</option>
      </select>:(key==='importance'||key==='urgency')?
        <select value={value[key]??3} disabled={disabled}
          onChange={e=>onChange(key,Number(e.target.value))}>
          {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
        </select>:key==='notifyBeforeMinutes'?<input type="number" min={0} max={10080}
        value={value.notifyBeforeMinutes??0} disabled={disabled}
        onChange={e=>onChange(key,Number(e.target.value))}/>:
      key==='description'?<textarea rows={1} maxLength={4000} disabled={disabled}
        value={value.description??''} onChange={e=>onChange(key,e.target.value)}/>:
      <input type="text" maxLength={key==='title'?180:500} disabled={disabled}
        value={value[key]??''} onChange={e=>onChange(key,e.target.value)}/>}
    </label>)}
  </div>;
}
