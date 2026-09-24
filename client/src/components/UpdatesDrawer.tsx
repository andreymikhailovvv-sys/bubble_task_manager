import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowRight, BookOpen, Newspaper, Sparkles, X } from 'lucide-react';
import { api, type ProductUpdateBlock } from '../lib/api';

const steps = [
  { selector: '[data-tour="new-task"]', text: 'Здесь вы можете добавить новую задачу и настроить ее', setup: 'add' },
  { selector: '[data-tour="new-event"]', text: 'События фиксируются в календаре. Их проще настраивать и для них можно указать локацию.', setup: 'add' },
  { selector: '[data-tour="new-sector"]', text: 'Вы можете добавлять новые сектора задач, а также изменять стандартные. Для каждого сектора можно задать уникальный промпт', setup: 'add' },
  { selector: '[data-tour="sphere-add"]', text: 'Вы можете добавить задачу сразу с нужным сектором', setup: 'bubbles' },
  { selector: '[data-tour="timeline-slot"]', text: 'А также сразу в нужное время, если нажмёте правую кнопку мыши в режиме таймлайна', setup: 'timeline' },
  { selector: '[data-tour="quick-ai"]', text: 'Также вы можете попросить создать, удалить или перенести задачу ИИ в чате быстрых запросов или других чатах с ИИ', setup: 'ai' }
] as const;

export function UpdatesDrawer({ open, onClose, prepareTour }: { open: boolean; onClose: () => void; prepareTour: (mode: string) => void }) {
  const [tab, setTab] = useState<'learn' | 'news'>('learn');
  const [news, setNews] = useState<ProductUpdateBlock[]>([]);
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => { if (open) void api.getProductUpdates().then((result) => setNews(result.blocks)).catch(() => setNews([])); }, [open]);
  useLayoutEffect(() => {
    if (step === null) return;
    prepareTour(steps[step].setup);
    const timer = window.setTimeout(() => {
      const element = document.querySelector(steps[step].selector);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setRect(element?.getBoundingClientRect() ?? null);
    }, 180);
    return () => clearTimeout(timer);
  }, [step, prepareTour]);

  const finish = () => { setStep(null); setRect(null); prepareTour('finish'); };
  return <>
    {open && step === null ? <div className="fixed inset-0 z-[170] bg-slate-950/55 backdrop-blur-sm" onClick={onClose}>
      <aside className="updates-drawer h-full w-[min(440px,92vw)] overflow-y-auto border-r border-violet-300/20 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Планировыч AI</p><h2 className="mt-1 text-3xl font-black leading-tight">Обновления<br/>и изменения</h2></div><button aria-label="Закрыть" className="rounded-full bg-white/10 p-2" onClick={onClose}><X/></button></div>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1.5">
          <button className={`rounded-xl px-3 py-2 text-sm font-bold ${tab === 'learn' ? 'bg-violet-600' : ''}`} onClick={() => setTab('learn')}><BookOpen className="mr-1 inline" size={16}/> Обучение</button>
          <button className={`rounded-xl px-3 py-2 text-sm font-bold ${tab === 'news' ? 'bg-fuchsia-600' : ''}`} onClick={() => setTab('news')}><Newspaper className="mr-1 inline" size={16}/> Новости</button>
        </div>
        {tab === 'learn' ? <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-300">Короткие интерактивные уроки помогут быстрее освоить сервис.</p>
          {[['Работа с задачами', true], ['Возможности ИИ', false], ['Фишки и интеграции', false]].map(([title, active]) => <article key={String(title)} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-violet-500/10 p-4"><div className="flex items-center justify-between gap-3"><div><Sparkles size={16} className="mb-2 text-cyan-300"/><h3 className="text-lg font-extrabold">{title}</h3>{!active && <p className="mt-1 text-xs text-slate-400">Скоро появится</p>}</div><button disabled={!active} onClick={() => { onClose(); setStep(0); }} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:bg-white/10 disabled:text-slate-500">Пройти</button></div></article>)}
        </div> : <div className="mt-6 space-y-5">{news.length ? news.map((block, index) => <article key={block.id ?? index} className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{block.text}</p>{block.imageData && <img className="mt-4 w-full rounded-xl border border-white/10" src={block.imageData} alt="Иллюстрация обновления"/>}</article>) : <div className="rounded-2xl border border-dashed border-white/20 p-8 text-center text-slate-400">Здесь скоро появятся новости сервиса.</div>}</div>}
      </aside>
    </div> : null}
    {step !== null ? <div className="pointer-events-none fixed inset-0 z-[200]">
      {rect ? <div className="absolute rounded-xl ring-4 ring-cyan-300" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(2,6,23,.88)' }}/>: <div className="absolute inset-0 bg-slate-950/90"/>}
      <div className="pointer-events-auto fixed bottom-6 left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 rounded-3xl border border-cyan-300/40 bg-slate-900 p-5 text-white shadow-2xl"><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Работа с задачами · {step + 1}/{steps.length}</p><p className="mt-2 text-base font-bold leading-6">{steps[step].text}</p><div className="mt-4 flex justify-between"><button onClick={finish} className="text-sm text-slate-400">Завершить</button><button onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)} className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950">{step === steps.length - 1 ? 'Готово' : 'Дальше'} <ArrowRight size={16}/></button></div></div>
    </div> : null}
  </>;
}
