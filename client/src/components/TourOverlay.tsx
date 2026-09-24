import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2, X } from 'lucide-react';

export type TaskTourStep = 'create-task' | 'create-event' | 'create-sector' | 'sphere-add' | 'task-context-menu' | 'quick-ai' | null;
export type AiTourStep = 'ai-quick-chat' | 'ai-full-chat' | 'ai-task-help' | 'ai-recurrence' | 'ai-optimize' | null;
export type TaskTourConfig = { id: Exclude<TaskTourStep, null>; selector: string; text: string };
export type AiTourConfig = { id: Exclude<AiTourStep, null>; selector: string; text: string };

export const TASK_TOUR_STEPS: TaskTourConfig[] = [
  { id: 'create-task', selector: '[data-tour="create-task"]', text: 'Здесь вы можете добавить новую задачу и настроить ее.' },
  { id: 'create-event', selector: '[data-tour="create-event"]', text: 'Создавайте события, чтобы всегда помнить о важных делах. Чтобы получать уведомления о задачах и событиях на телефон — подключите нашего телеграм-бота. Подробнее об этом в уроке «Фишки и интеграции».' },
  { id: 'create-sector', selector: '[data-tour="create-sector"]', text: 'Вы можете добавлять новые сектора, а также редактировать стандартные. Для каждого сектора вы можете задать общий промпт, который будет учитываться во всех задачах этого сектора.' },
  { id: 'sphere-add', selector: '[data-tour="sphere-add"]', text: 'Чтобы сразу добавить задачу в нужный сектор, нажмите эту иконку в режиме «Пузыри».' },
  { id: 'task-context-menu', selector: '[data-tour="bubble-task-context-menu"]', text: 'Нажмите правую кнопку мыши, чтобы открыть контекстное меню. С помощью него вы можете быстрее управлять задачами: добавлять, переносить, выполнять и так далее.' },
  { id: 'quick-ai', selector: '[data-tour="quick-ai"]', text: 'Вы также можете создавать, удалять или переносить задачи в чате быстрых запросов ИИ. Для этого в свободной форме опишите в чате, что нужно сделать с вашими задачами. Подробнее об ИИ возможностях «Планировыча» вы можете узнать в уроке «Возможности ИИ».' }
];

export const AI_TOUR_STEPS: AiTourConfig[] = [
  { id: 'ai-quick-chat', selector: '[data-tour="quick-ai"]', text: 'Здесь вы можете отправить быстрый запрос к ИИ — от «Сколько живут хомяки?» до «Перечисли рабочие задачи на сегодня». В этом чате используется слабая, но быстрая модель, а ее память ограничена 20 запросами. Чтобы открыть полноценный чат, нажмите левую кнопку мыши.' },
  { id: 'ai-full-chat', selector: '[data-tour="ai-full-chat"]', text: 'Это развернутый чат с ИИ. В нем вы можете разделять запросы по проектам, чатам, а также выбирать разные модели ИИ. Разные модели тратят разное количество кредитов. В любой момент вы можете переключиться на работу с своими задачами и чат вызовет «ИИ-планировщик».' },
  { id: 'ai-task-help', selector: '[data-tour="ai-task-help"]', text: 'Внутри каждой задачи есть свой чат с ИИ, в котором вы можете отправлять запросы по этой задаче. Вы можете попросить ИИ создавать и редактировать подзадачи/описания, настройки и так далее. История чата будет сохранена до тех пор, пока вы не завершите/удалите задачу или не очистите ее вручную.' },
  { id: 'ai-recurrence', selector: '[data-tour="ai-recurrence"]', text: 'ИИ может создать расписание для вашей задачи. Для этого нажмите чекбокс «Повторить» и опишите как должна повторяться задача, например «Каждый понедельник и среду. В понедельник в 12, в среду в 14:00».' },
  { id: 'ai-optimize', selector: '[data-tour="ai-optimize"]', text: 'ИИ может оптимизировать ваше расписание. Для этого откройте режим таймлайна и нажмите кнопку «Оптимизировать». Вы можете ввести пожелания к оптимизации, например: «Распредели задачи равномерно, но не переноси их позже 18:00». ИИ оптимизирует тот промежуток времени, который у вас активен в момент нажатия кнопки «Оптимизировать» – «День/неделя/месяц».' }
];

const PADDING = 8;
const MAX_SEARCH_FRAMES = 180;

export function TourOverlay({ activeStep, steps = TASK_TOUR_STEPS, onNext, onFinish }: { activeStep: Exclude<TaskTourStep | AiTourStep, null>; steps?: Array<TaskTourConfig | AiTourConfig>; onNext: () => void; onFinish: () => void }) {
  const config = steps.find((step) => step.id === activeStep)!;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [targetResolved, setTargetResolved] = useState(false);

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
      if (!target) { setRect(null); setTargetResolved(true); return; }
      const firstRect = target.getBoundingClientRect();
      if (firstRect.top < 0 || firstRect.bottom > window.innerHeight) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      measure();
      setTargetResolved(true);
      observer = new ResizeObserver(measure);
      observer.observe(target);
    };
    setRect(null);
    setTargetResolved(false);
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

  const hole = targetResolved && rect ? { left: Math.max(0, rect.left - PADDING), top: Math.max(0, rect.top - PADDING), right: Math.min(innerWidth, rect.right + PADDING), bottom: Math.min(innerHeight, rect.bottom + PADDING) } : null;
  const cardStyle: CSSProperties = hole ? { left: Math.min(Math.max(16, hole.left), innerWidth - Math.min(360, innerWidth - 32)), top: hole.bottom + 16 < innerHeight - 210 ? hole.bottom + 16 : Math.max(16, hole.top - 190) } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const last = activeStep === steps[steps.length - 1]?.id;

  return createPortal(<div className="tour-root fixed inset-0 z-[250] pointer-events-auto" aria-live="polite">
    {hole ? <>
      <div className="tour-dim fixed left-0 right-0 top-0" style={{ height: hole.top }} />
      <div className="tour-dim fixed left-0" style={{ top: hole.top, width: hole.left, height: hole.bottom - hole.top }} />
      <div className="tour-dim fixed right-0" style={{ top: hole.top, left: hole.right, height: hole.bottom - hole.top }} />
      <div className="tour-dim fixed bottom-0 left-0 right-0" style={{ top: hole.bottom }} />
      <div className="tour-ring fixed" style={{ left: hole.left, top: hole.top, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
    </> : <div className="tour-dim fixed inset-0" />}
    <div className="tour-click-shield fixed inset-0" />
    {(activeStep === 'quick-ai' || activeStep === 'ai-quick-chat') && hole ? <MousePointer2 className="tour-pointer fixed" style={{ left: Math.max(8, hole.left - 12), top: hole.bottom - 8 }} size={30} /> : null}
    {targetResolved ? <section className="tour-card fixed w-[min(360px,calc(100vw-32px))] rounded-2xl border p-4 shadow-2xl" style={cardStyle}>
      <div className="flex items-start justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-400">Шаг {steps.findIndex((item) => item.id === activeStep) + 1} из {steps.length}</span><button type="button" onClick={onFinish} aria-label="Завершить обучение" className="rounded-full p-1 text-muted"><X size={17} /></button></div>
      <p className="mt-3 text-sm leading-relaxed text-primary">{config.text}</p>
      {!rect ? <p className="mt-2 text-xs text-muted">Элемент пока недоступен — можно продолжить обучение.</p> : null}
      <div className="mt-4 flex items-center justify-between gap-2"><button type="button" className="rounded-lg px-3 py-2 text-xs text-muted hover:text-primary" onClick={onFinish}>Завершить</button><button type="button" className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500" onClick={last ? onFinish : onNext}>{last ? 'Готово' : 'Дальше'}</button></div>
    </section> : null}
  </div>, document.body);
}
