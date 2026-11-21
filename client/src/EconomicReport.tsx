import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react';
import { formatMinorRub } from './lib/economicMoney';
import './EconomicReport.css';

type Kind = 'expense' | 'income';
type Period = 'week' | 'month' | 'year' | 'all' | 'custom';
type Category = { name: string; amountMinor: string };
type Report = {
  start: string; end: string;
  expense: { totalMinor: string; categories: Category[] };
  income: { totalMinor: string; categories: Category[] };
};
const swatches = ['#F1A94C','#8887ED','#66BDB1','#EC8293','#7EAEF1','#C3A1D9',
  '#E0C064','#94C17F','#DC9670','#7DB4C2','#C5A1AE','#A5A6ED'];
const periods: {id:Period;label:string}[] = [
  {id:'week',label:'Неделя'}, {id:'month',label:'Месяц'}, {id:'year',label:'Год'},
  {id:'all',label:'Всё время'}, {id:'custom',label:'Даты'}
];
const today = () => new Date().toISOString().slice(0,10);
const startOfMonth = () => today().slice(0,7) + '-01';
const formatWholeRub = (minor:string) => {
  const value=BigInt(minor);
  const absolute=value<0n?-value:value;
  return (value<0n?'−':'')+((absolute+50n)/100n).toLocaleString('ru-RU')+' ₽';
};

export default function EconomicReport({ preview = false, collapsedByDefault = false, revision = 0 }: {preview?:boolean;collapsedByDefault?:boolean;revision?:number}) {
  const [kind, setKind] = useState<Kind>('expense');
  const [collapsed, setCollapsed] = useState(preview && collapsedByDefault);
  const [period, setPeriod] = useState<Period>('month');
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState(startOfMonth);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<Report|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({period:preview?'month':period,offset:String(preview?0:offset)});
    if (!preview && period === 'custom') { params.set('start',start);params.set('end',end); }
    setBusy(true);setError('');
    fetch('/api/economic/report?' + params, {
      signal: abort.signal, credentials:'include', cache:'no-store'
    }).then(async response => {
      const result = await response.json() as Report & {error?:string};
      if (!response.ok) throw new Error(result.error || 'Не удалось загрузить отчёт');
      if (!abort.signal.aborted) setData(result);
    }).catch(cause => {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Ошибка отчёта');
    }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [preview, period, offset, start, end, revision]);
  const selected = data?.[kind];
  const total = BigInt(selected?.totalMinor || '0');
  const segments = useMemo(() => {
    if (!selected || !total) return [];
    return selected.categories.map((item,i) => ({
      ...item, color:swatches[i % swatches.length],
      pct: Number(BigInt(item.amountMinor)*10000n/total)/100
    }));
  }, [selected, total]);
  let position = 0;
  const gradient = segments.length ? 'conic-gradient(' + segments.map(seg => {
    const first = position;position += seg.pct;
    return `${seg.color} ${first}% ${position}%`;
  }).join(',') + ')' : 'conic-gradient(var(--ec-border) 0% 100%)';
  const range = data && !preview
    ? new Date(data.start).toLocaleDateString('ru-RU') + ' – ' +
      new Date(Date.parse(data.end)-86400000).toLocaleDateString('ru-RU')
    : 'Текущий месяц';
  const ring = <div className="econ-report-ring" style={{background:gradient}} aria-label="Распределение по категориям">
    <div className="econ-report-ring-center">
      <strong>{formatWholeRub(selected?.totalMinor || '0')}</strong>
    </div>
  </div>;
  return <section className={'econ-card econ-report ' + (preview?'econ-report-preview':'')}>
    <div className="econ-card-header">
      <div><h2><PieChart size={19}/> Финансовый отчёт</h2>
        <p>{preview?'Расходы по категориям за текущий месяц':'Распределение по категориям и периодам'}</p>
      </div>
      {preview && collapsedByDefault && <button type="button" className="econ-report-expand"
        aria-expanded={!collapsed} aria-label={collapsed?'Развернуть финансовый отчёт':'Свернуть финансовый отчёт'}
        onClick={()=>setCollapsed(value=>!value)}>
        {collapsed?'Развернуть':'Свернуть'} <ChevronRight size={16} className={collapsed?'':'expanded'}/>
      </button>}
    </div>
    {!preview && <div className="econ-report-filters">
      <div className="econ-report-periods" role="group" aria-label="Период отчёта">
        {periods.map(item=><button key={item.id} type="button" className={period===item.id?'selected':''}
          onClick={()=>{setPeriod(item.id);setOffset(0);}}>{item.label}</button>)}
      </div>
      {period==='custom' ? <div className="econ-report-dates">
        <label>С<input type="date" value={start} max={end} onChange={event=>setStart(event.target.value)}/></label>
        <label>По<input type="date" value={end} min={start} onChange={event=>setEnd(event.target.value)}/></label>
      </div> : period!=='all' && <div className="econ-report-range">
        <button type="button" aria-label="Предыдущий период" onClick={()=>setOffset(o=>o-1)} disabled={offset<=-120}><ChevronLeft size={17}/></button>
        <span>{range}</span>
        <button type="button" aria-label="Следующий период" onClick={()=>setOffset(o=>o+1)} disabled={offset>=0}><ChevronRight size={17}/></button>
      </div>}
    </div>}
    {!preview && <div className="econ-report-types" role="group" aria-label="Тип операций">
      <button type="button" className={kind==='expense'?'selected':''} onClick={()=>setKind('expense')}>Расходы</button>
      <button type="button" className={kind==='income'?'selected':''} onClick={()=>setKind('income')}>Доходы</button>
    </div>}
    {error && <p className="econ-report-error" role="alert">{error}</p>}
    {preview && collapsed ? <div className="econ-report-compact" aria-busy={busy}>
      {ring}
      <div className="econ-report-compact-legend">
        {segments.length ? segments.map(seg=><div className="econ-report-compact-category" key={seg.name}>
          <i style={{background:seg.color}}/><span>{seg.name}</span>
        </div>) : <p className="econ-report-empty">{busy?'Загрузка…':'Категорий пока нет'}</p>}
      </div>
    </div> : <div className="econ-report-body" aria-busy={busy}>
      {ring}
      <div className="econ-report-breakdown">
        <div className="econ-report-breakdown-title">
          <span>Категории</span><small>{preview?'Текущий месяц':range}</small>
        </div>
        {segments.length ? segments.map(seg=><div className="econ-report-category" key={seg.name}>
          <div className="econ-report-category-row">
            <span><i style={{background:seg.color}}/>{seg.name}</span>
            <strong>{formatMinorRub(seg.amountMinor)}</strong>
          </div>
          <div className="econ-report-category-track"><div style={{width:seg.pct+'%',background:seg.color}}/></div>
          <small>{seg.pct.toLocaleString('ru-RU',{maximumFractionDigits:2})}%</small>
        </div>) : <p className="econ-report-empty">{busy?'Загрузка…':'За выбранный период операций нет'}</p>}
      </div>
    </div>}
  </section>;
}
