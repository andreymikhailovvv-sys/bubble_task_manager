import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, FileText, MousePointer2, X } from 'lucide-react';

export type TaskTourStep = 'create-task' | 'create-event' | 'create-sector' | 'sphere-add' | 'timeline-create' | 'quick-ai' | null;
export type TaskTourConfig = { id: Exclude<TaskTourStep, null>; selector: string; text: string };

export const TASK_TOUR_STEPS: TaskTourConfig[] = [
  { id: 'create-task', selector: '[data-tour="create-task"]', text: 'Здесь вы можете добавить новую задачу и настроить ее' },
  { id: 'create-event', selector: '[data-tour="create-event"]', text: 'События фиксируются в календаре. Их проще настраивать и для них можно указать локацию.' },
  { id: 'create-sector', selector: '[data-tour="create-sector"]', text: 'Вы можете добавлять новые сектора задач, а также изменять стандартные. Для каждого сектора можно задать уникальный промпт' },
  { id: 'sphere-add', selector: '[data-tour="sphere-add"]', text: 'Вы можете добавить задачу сразу с нужным сектором' },
  { id: 'timeline-create', selector: '[data-tour="timeline-hour"]', text: 'А также сразу в нужное время, если нажмёте правую кнопку мыши в режиме таймлайна' },
  { id: 'quick-ai', selector: '[data-tour="quick-ai"]', text: 'Также вы можете попросить создать, удалить или перенести задачу ИИ в чате быстрых запросов или других чатах с ИИ' }
];

const PADDING = 8;
const MAX_SEARCH_FRAMES = 180;

export function TourOverlay({ activeStep, onNext, onFinish }: { activeStep: Exclude<TaskTourStep, null>; onNext: () => void; onFinish: () => void }) {
  const config = TASK_TOUR_STEPS.find((step) => step.id === activeStep)!;
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let attempts = 0;
    let target: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    let stopped = false;
    const measure = () => target && setRect(target.getBoundingClientRect());
    const findTarget = () => {
      if (stopped) return;
      target = document.querySelector<HTMLElement>(config.selector);
      if (!target && attempts++ < MAX_SEARCH_FRAMES) { frame = requestAnimationFrame(findTarget); return; }
      if (!target) { setRect(null); return; }
      const firstRect = target.getBoundingClientRect();
      if (firstRect.top < 0 || firstRect.bottom > window.innerHeight) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(target);
    };
    setRect(null);
    frame = requestAnimationFrame(findTarget);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { stopped = true; cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [config.selector]);

  useLayoutEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onFinish();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFinish]);

  const hole = rect ? { left: Math.max(0, rect.left - PADDING), top: Math.max(0, rect.top - PADDING), right: Math.min(innerWidth, rect.right + PADDING), bottom: Math.min(innerHeight, rect.bottom + PADDING) } : null;
  const cardStyle: CSSProperties = hole ? { left: Math.min(Math.max(16, hole.left), innerWidth - Math.min(360, innerWidth - 32)), top: hole.bottom + 16 < innerHeight - 210 ? hole.bottom + 16 : Math.max(16, hole.top - 190) } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const last = activeStep === TASK_TOUR_STEPS[TASK_TOUR_STEPS.length - 1]?.id;

  return createPortal(<div className="tour-root fixed inset-0 z-[250] pointer-events-auto" aria-live="polite">
    {hole ? <>
      <div className="tour-dim fixed left-0 right-0 top-0" style={{ height: hole.top }} />
      <div className="tour-dim fixed left-0" style={{ top: hole.top, width: hole.left, height: hole.bottom - hole.top }} />
      <div className="tour-dim fixed right-0" style={{ top: hole.top, left: hole.right, height: hole.bottom - hole.top }} />
      <div className="tour-dim fixed bottom-0 left-0 right-0" style={{ top: hole.bottom }} />
      <div className="tour-ring fixed" style={{ left: hole.left, top: hole.top, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
    </> : <div className="tour-dim fixed inset-0" />}
    <div className="tour-click-shield fixed inset-0" />
    {activeStep === 'timeline-create' && hole ? <div className="tour-timeline-demo fixed rounded-xl border p-1.5 shadow-2xl" style={{ left: Math.min(hole.right + 12, innerWidth - 210), top: Math.min(hole.top + 24, innerHeight - 120) }}><div><FileText size={14} />Добавить задачу</div><div><CalendarDays size={14} />Добавить событие</div></div> : null}
    {activeStep === 'quick-ai' && hole ? <MousePointer2 className="tour-pointer fixed" style={{ left: Math.max(8, hole.left - 12), top: hole.bottom - 8 }} size={30} /> : null}
    <section className="tour-card fixed w-[min(360px,calc(100vw-32px))] rounded-2xl border p-4 shadow-2xl" style={cardStyle}>
      <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-400">Шаг {TASK_TOUR_STEPS.findIndex((item) => item.id === activeStep) + 1} из {TASK_TOUR_STEPS.length}</span><button type="button" onClick={onFinish} aria-label="Завершить обучение" className="rounded-full p-1 text-muted"><X size={17} /></button></div>
      <p className="mt-3 text-sm leading-relaxed text-primary">{config.text}</p>
      {!rect ? <p className="mt-2 text-xs text-muted">Элемент пока недоступен — можно продолжить обучение.</p> : null}
      <div className="mt-4 flex items-center justify-between gap-2"><button type="button" className="rounded-lg px-3 py-2 text-xs text-muted hover:text-primary" onClick={onFinish}>Завершить</button><button type="button" className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500" onClick={last ? onFinish : onNext}>{last ? 'Готово' : 'Дальше'}</button></div>
    </section>
  </div>, document.body);
}
