import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, GripVertical, Maximize2, Minus, Plus, Settings2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Habit, Sphere, Task } from '../lib/types';
import { resolveSphereIcon } from '../lib/sphereIcons';
import { MiniAppHabitTracker } from './MiniAppHabitTracker';
import { StandaloneNotesWorkspace } from './StandaloneNotesWorkspace';
import { TestPageHabitDialog } from '../TestPageHabitDialog';
import '../TestPage.css';
import './PrimaryWorkspaceSidebar.css';

const DEFAULT_ORDER = ['upcoming', 'completed', 'habits', 'progress', 'sectors', 'notes'] as const;
type WidgetId = typeof DEFAULT_ORDER[number];

function readOrder(userId: string): WidgetId[] {
  try {
    const saved = JSON.parse(localStorage.getItem('btm:primary-sidebar:order:' + userId) || 'null');
    if (Array.isArray(saved)) {
      const valid = saved.filter((id): id is WidgetId => DEFAULT_ORDER.includes(id) && saved.indexOf(id) === saved.lastIndexOf(id));
      return [...valid, ...DEFAULT_ORDER.filter(id => !valid.includes(id))];
    }
  } catch { /* Use the default order if local storage is unavailable or corrupt. */ }
  return [...DEFAULT_ORDER];
}

function readVisible(userId: string): boolean {
  try { return localStorage.getItem('btm:primary-sidebar:visible:' + userId) !== 'false'; }
  catch { return true; }
}

function localDateKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = (type: string) => parts.find(part => part.type === type)?.value || '';
    return value('year') + '-' + value('month') + '-' + value('day');
  } catch {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
}

function scheduledToday(habit: Habit, date: Date, dateKey: string, timeZone: string): boolean {
  if (habit.isArchived || habit.isAutoCompleted || habit.finishedAt) return false;
  if (habit.createdAt && dateKey < localDateKey(new Date(habit.createdAt), timeZone)) return false;
  if (habit.durationMode === 'UNTIL_DATE' && habit.endDate && dateKey > habit.endDate.slice(0, 10)) return false;
  if (habit.durationMode === 'REPEAT_COUNT' && habit.totalRepeatTarget != null && (habit.completedTotal ?? 0) >= habit.totalRepeatTarget) return false;
  if (habit.recurrenceType === 'WEEKDAYS') {
    const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
    return habit.weekdays.includes(({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[day]);
  }
  if (habit.recurrenceType === 'INTERVAL') {
    const start = habit.createdAt ? localDateKey(new Date(habit.createdAt), timeZone) : dateKey;
    const elapsed = (Date.parse(dateKey + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000;
    return elapsed >= 0 && elapsed % Math.max(1, habit.intervalDays ?? 1) === 0;
  }
  return true;
}

function Widget({ id, title, children, onMove }: {
  id: WidgetId; title: string; children: ReactNode; onMove: (direction: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    controls.start(event);
  };
  return <Reorder.Item as="section" value={id} dragListener={false} dragControls={controls}
    layout="position" whileDrag={{ scale: 1.015, zIndex: 10 }}
    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    className="primary-widget workspace-widget-card rounded-[1.35rem] border p-4" data-primary-widget={id}>
    <div className="primary-widget-heading">
      <h3>{title}</h3>
      <button type="button" className="primary-widget-grip" onPointerDown={startDrag}
        onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault(); onMove(event.key === 'ArrowUp' ? -1 : 1);
          }
        }} aria-label={`Переместить блок «${title}». Для клавиатуры используйте стрелки вверх и вниз`}
        title="Перетащите, чтобы изменить порядок" style={{ touchAction: 'none' }}>
        <GripVertical size={17} />
      </button>
    </div>
    {children}
  </Reorder.Item>;
}

type Props = {
  userId: string;
  windowCount: number;
  tasks: readonly Task[];
  habits: readonly Habit[];
  spheres: readonly Sphere[];
  timeZone: string;
  requestedNote: { id: string; serial: number } | null;
  onOpenTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void | Promise<void>;
  onRestoreTask: (task: Task) => void | Promise<void>;
  onOpenUpcoming: () => void;
  onEditSphere: (sphere: Sphere) => void;
  onCreateSphere: () => void;
  onDeleteSphere: (sphere: Sphere) => void | Promise<void>;
  onHabitUpsert: (habit: Habit) => void;
  onHabitRemove: (habitId: string) => void;
};

export function PrimaryWorkspaceSidebar(props: Props) {
  const { userId, windowCount, tasks, habits, spheres, timeZone, requestedNote } = props;
  const [visible, setVisible] = useState(() => readVisible(userId));
  // Automatic collapse must not overwrite the user's remembered manual choice.
  const [autoCollapsed, setAutoCollapsed] = useState(windowCount > 1);
  const isOpen = visible && !autoCollapsed;
  const [order, setOrder] = useState<WidgetId[]>(() => readOrder(userId));
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [completedLimit, setCompletedLimit] = useState(40);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<string | 'new' | null>(null);
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);
  const [habitError, setHabitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setAutoCollapsed(windowCount > 1);
  }, [windowCount]);
  useEffect(() => {
    try { localStorage.setItem('btm:primary-sidebar:visible:' + userId, String(visible)); }
    catch { /* Private mode must not break layout. */ }
  }, [visible, userId]);
  useEffect(() => {
    try { localStorage.setItem('btm:primary-sidebar:order:' + userId, JSON.stringify(order)); }
    catch { /* Private mode must not break drag-and-drop. */ }
  }, [order, userId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayKey = localDateKey(now, timeZone);
  const taskItems = tasks.filter(task => (task.taskType ?? 'TASK') === 'TASK' && !task.parentTaskId);
  const doneCount = taskItems.filter(task => task.status === 'DONE').length;
  const todayTasks = taskItems.filter(task => task.dueDate && localDateKey(new Date(task.dueDate), timeZone) === todayKey);
  const todayDone = todayTasks.filter(task => task.status === 'DONE').length;
  const upcoming = tasks.filter(task => task.parentTaskId && task.status !== 'DONE' && task.dueDate)
    .filter(task => Number.isFinite(new Date(task.dueDate!).getTime()))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 3);
  const completed = taskItems.filter(task => task.status === 'DONE')
    .filter(task => completedFilter === 'all' || (task.updatedAt && localDateKey(new Date(task.updatedAt), timeZone) === todayKey))
    .slice().sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
  const activeHabits = habits.filter(habit => !habit.isArchived && !habit.finishedAt);
  const todayHabits = activeHabits.filter(habit => scheduledToday(habit, now, todayKey, timeZone));
  const selectedHabit = habits.find(habit => habit.id === selectedHabitId) ?? null;
  const editingHabit = habits.find(habit => habit.id === editingHabitId) ?? null;

  const updateOrder = (direction: -1 | 1, id: WidgetId) => setOrder(previous => {
    const index = previous.indexOf(id);
    const destination = index + direction;
    if (destination < 0 || destination >= previous.length) return previous;
    const next = [...previous];
    [next[index], next[destination]] = [next[destination], next[index]];
    return next;
  });

  const changeHabit = async (habit: Habit, delta: -1 | 1) => {
    if (busyHabitId) return;
    setBusyHabitId(habit.id); setHabitError(null);
    try {
      const updated = delta > 0
        ? await api.completeHabit(habit.id, { dateKey: todayKey, amount: 1 })
        : await api.uncompleteHabit(habit.id, { dateKey: todayKey, amount: 1 });
      props.onHabitUpsert(updated);
      if (delta > 0) void api.recordEfficiencyEvent({ delta: 1, bucket: 'habit' }).catch(() => undefined);
    } catch (error) {
      setHabitError(error instanceof Error ? error.message : 'Не удалось отметить привычку');
    } finally { setBusyHabitId(null); }
  };

  const saveHabit = async (payload: Partial<Habit>) => {
    const updated = editingHabit ? await api.updateHabit(editingHabit.id, payload) : await api.createHabit(payload);
    props.onHabitUpsert(updated);
    setEditingHabitId(null);
  };

  const deleteHabit = async () => {
    if (!editingHabit) return;
    await api.deleteHabit(editingHabit.id);
    props.onHabitRemove(editingHabit.id);
    setSelectedHabitId(null); setEditingHabitId(null);
  };
  const finishHabit = async () => {
    if (!editingHabit) return;
    await api.finishHabit(editingHabit.id);
    props.onHabitRemove(editingHabit.id);
    setSelectedHabitId(null); setEditingHabitId(null);
  };

  const metric = (title: string, done: number, total: number, icon: ReactNode) => {
    const percent = total > 0 ? Math.round(done / total * 100) : 0;
    return <div className="primary-widget-metric" key={title}>
      <div className="primary-widget-metric-title">{icon}<span>{title}</span></div>
      <strong>{done} из {total}<small>{percent}%</small></strong>
      <div className="primary-widget-progress" role="progressbar" aria-label={title}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: percent + '%' }} />
      </div>
    </div>;
  };

  const widgetBodies: Record<WidgetId, ReactNode> = {
    upcoming: <>
      <button type="button" className="primary-widget-corner-action" onClick={props.onOpenUpcoming}
        title="Развернуть список подзадач" aria-label="Развернуть ближайшие подзадачи"><Maximize2 size={15}/></button>
      <div className="primary-widget-rows">
        {upcoming.length === 0 && <p className="primary-widget-empty">Нет подзадач с ближайшим сроком</p>}
        {upcoming.map(task => <div className="primary-widget-task" key={task.id}>
          <input type="checkbox" checked={false} aria-label={`Выполнить ${task.title}`}
            onChange={() => void props.onCompleteTask(task)} />
          <button type="button" onClick={() => props.onOpenTask(task)} className="primary-widget-task-title"
            title={task.title}>{task.title}</button>
          <span className="primary-widget-date">{new Date(task.dueDate!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
        </div>)}
      </div>
    </>,
    completed: <>
      <div className="primary-widget-filter">
        {(['today', 'all'] as const).map(value => <button type="button" key={value}
          aria-pressed={completedFilter === value} className={completedFilter === value ? 'is-active' : ''}
          onClick={() => { setCompletedFilter(value); setCompletedLimit(40); }}>
          {value === 'today' ? 'Сегодня' : 'Все'}</button>)}
      </div>
      <div className="primary-widget-rows">
        {completed.length === 0 && <p className="primary-widget-empty">Выполненных задач пока нет</p>}
        {completed.slice(0, completedLimit).map(task => <div key={task.id} className="primary-widget-task">
          <input type="checkbox" checked aria-label={`Вернуть в работу ${task.title}`}
            onChange={() => void props.onRestoreTask(task)}/>
          <button type="button" className="primary-widget-task-title" onClick={() => props.onOpenTask(task)} title={task.title}>{task.title}</button>
        </div>)}
      </div>
      {completed.length > completedLimit && <button type="button" className="primary-widget-more"
        onClick={() => setCompletedLimit(value => value + 40)}>Показать ещё ({completed.length - completedLimit})</button>}
    </>,
    habits: <>
      <div className="primary-widget-habit-summary">{todayHabits.filter(habit => (habit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0) >= Math.max(1, habit.targetCount)).length} из {todayHabits.length} выполнено сегодня</div>
      <div className="primary-widget-habits">
        {activeHabits.map(habit => {
          const planned = todayHabits.some(item => item.id === habit.id);
          const amount = habit.stats.find(stat => stat.dateKey === todayKey)?.amount ?? 0;
          const target = Math.max(1, habit.targetCount);
          const percent = Math.min(100, Math.round(amount / target * 100));
          return <div key={habit.id} className={`primary-widget-habit ${planned ? '' : 'is-unscheduled'}`}>
            <button type="button" className="primary-widget-habit-open" onClick={() => setSelectedHabitId(habit.id)}
              aria-label={`Открыть привычку ${habit.name}`}>
              <span className="primary-widget-habit-ring" style={{ '--habit-color': habit.color || '#22c55e', '--habit-progress': percent + '%' } as CSSProperties}><span>{habit.icon || '✓'}</span></span>
              <span className="primary-widget-habit-label"><strong>{habit.name}</strong><small>{planned ? amount + ' из ' + target : 'Не на сегодня'}</small></span>
            </button>
            {planned && <div className="primary-widget-habit-actions">
              {amount > 0 && <button type="button" onClick={() => void changeHabit(habit, -1)} disabled={busyHabitId !== null} aria-label={`Убрать выполнение ${habit.name}`}><Minus size={13}/></button>}
              <button type="button" onClick={() => void changeHabit(habit, 1)} disabled={busyHabitId !== null || amount >= target} aria-label={`Отметить выполнение ${habit.name}`}><Plus size={14}/></button>
            </div>}
          </div>;
        })}
        {activeHabits.length === 0 && <p className="primary-widget-empty">Привычек пока нет</p>}
      </div>
      {habitError && <p role="alert" className="primary-widget-error">{habitError}</p>}
      <button type="button" className="primary-widget-more" onClick={() => setEditingHabitId('new')}><Plus size={15}/> Создать привычку</button>
    </>,
    progress: <div className="primary-widget-metrics">
      {metric('Все задачи', doneCount, taskItems.length, <CheckCircle2 size={17}/>)}
      {metric('За сегодня', todayDone, todayTasks.length, <CalendarDays size={17}/>)}
    </div>,
    sectors: <>
      <div className="primary-widget-rows">
        {spheres.map(sphere => {
          const Icon = resolveSphereIcon(sphere.icon);
          return <div className="primary-widget-sector" key={sphere.id}>
            <button type="button" className="primary-widget-sector-name" onClick={() => props.onEditSphere(sphere)} style={{ color: sphere.color }}>
              {Icon && <Icon size={15}/>}<span>{sphere.name}</span>
            </button>
            <button type="button" className="primary-widget-sector-delete" onClick={() => void props.onDeleteSphere(sphere)} title={`Удалить сектор ${sphere.name}`} aria-label={`Удалить сектор ${sphere.name}`}><X size={14}/></button>
          </div>;
        })}
        {spheres.length === 0 && <p className="primary-widget-empty">Секторов пока нет</p>}
      </div>
      {spheres.length < 8 && <button type="button" className="primary-widget-more" onClick={props.onCreateSphere}><Plus size={15}/> Добавить сектор</button>}
    </>,
    notes: <div className="primary-widget-notes">
      <StandaloneNotesWorkspace key={userId + ':primary-sidebar-notes'} userId={userId} requestedNote={requestedNote}/>
    </div>
  };

  return <aside className={`primary-workspace-sidebar ${isOpen ? 'is-open' : 'is-collapsed'}`}
    aria-label="Дополнительные блоки рабочего пространства" data-no-field-zoom="true">
    <div className="primary-workspace-sidebar-toggle-slot">
      <button type="button" className="primary-workspace-sidebar-toggle"
        aria-label={isOpen ? 'Скрыть панель блоков' : 'Показать панель блоков'}
        title={isOpen ? 'Скрыть блоки' : 'Развернуть блоки'}
        aria-expanded={isOpen} onClick={() => {
          if (autoCollapsed) { setAutoCollapsed(false); setVisible(true); }
          else setVisible(value => !value);
        }}>
        {isOpen ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
      </button>
    </div>
    {isOpen && <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder}
      className="primary-workspace-sidebar-list" aria-label="Блоки рабочего пространства. Перетаскивайте за маркер в заголовке">
      {order.map(id => <Widget key={id} id={id}
        title={{ upcoming: 'Ближайшие подзадачи', completed: 'Выполненные задания', habits: 'Привычки',
          progress: 'Статистика выполнения', sectors: 'Управление секторами', notes: 'Заметки' }[id]}
        onMove={direction => updateOrder(direction, id)}>{widgetBodies[id]}</Widget>)}
    </Reorder.Group>}
    {(selectedHabit || editingHabitId) && <div className="tp-root primary-habit-modal-host">
      {selectedHabit && <div className="tp-overlay tp-habit-detail-overlay" onMouseDown={event => {
        if (event.currentTarget === event.target) setSelectedHabitId(null);
      }}>
        <section className="tp-dialog tp-habit-detail" role="dialog" aria-modal="true" aria-label={'Привычка ' + selectedHabit.name}>
          <header><div><span className="tp-eyebrow">ПРИВЫЧКА</span><h2>{selectedHabit.name}</h2></div>
            <div className="primary-habit-modal-actions">
              <button type="button" className="tp-secondary" onClick={() => setEditingHabitId(selectedHabit.id)}><Settings2 size={16}/> Настройки</button>
              <button type="button" onClick={() => setSelectedHabitId(null)} aria-label="Закрыть"><X size={18}/></button>
            </div>
          </header>
          <div className="tp-habit-detail-content"><MiniAppHabitTracker habit={selectedHabit} onHabitChanged={props.onHabitUpsert}/></div>
        </section>
      </div>}
      {editingHabitId && <TestPageHabitDialog key={editingHabitId} habit={editingHabit}
        onClose={() => setEditingHabitId(null)} onSave={saveHabit}
        onDelete={editingHabit ? deleteHabit : undefined}
        onFinish={editingHabit ? finishHabit : undefined}/>}
    </div>}
  </aside>;
}
