import { memo, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, GripVertical, Maximize2, Minus, Plus, Settings2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Habit, Sphere, Task } from '../lib/types';
import { resolveSphereIcon } from '../lib/sphereIcons';
import { MiniAppHabitTracker } from './MiniAppHabitTracker';
import { StandaloneNotesWorkspace } from './StandaloneNotesWorkspace';
import { PrimaryHabitDialog } from './PrimaryHabitDialog';
import './PrimaryWorkspaceSidebar.css';

const DEFAULT_ORDER = ['upcoming', 'completed', 'habits', 'progress', 'sectors', 'notes'] as const;
type WidgetId = typeof DEFAULT_ORDER[number];

const SidebarNotes = memo(function SidebarNotes({ userId, requestedNote }: {
  userId: string; requestedNote: { id: string; serial: number } | null;
}) {
  return <StandaloneNotesWorkspace userId={userId} requestedNote={requestedNote} compactWidget/>;
});

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

function Widget({ id, title, headingExtra, children, onMove }: {
  id: WidgetId; title: string; headingExtra?: ReactNode; children: ReactNode; onMove: (direction: -1 | 1) => void;
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
      {headingExtra}
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
  hideToggle?: boolean;
  forceOpen?: boolean;
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
  const isOpen = props.forceOpen || (visible && !autoCollapsed);
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
  // For today's metric, match the main task count but also include dated
  // subtasks. Events and reminders are not tasks.
  const todayTasks = tasks.filter(task => (task.taskType ?? 'TASK') === 'TASK'
    && task.dueDate && Number.isFinite(new Date(task.dueDate).getTime())
    && localDateKey(new Date(task.dueDate), timeZone) === todayKey);
  const todayDone = todayTasks.filter(task => task.status === 'DONE').length;
  const upcoming = tasks.filter(task => task.parentTaskId && task.status !== 'DONE' && task.dueDate)
    .filter(task => Number.isFinite(new Date(task.dueDate!).getTime()))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 3);
  const completed = taskItems.filter(task => task.status === 'DONE')
    .filter(task => completedFilter === 'all' || (task.updatedAt && localDateKey(new Date(task.updatedAt), timeZone) === todayKey))
    .slice().sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
  const activeHabits = habits.filter(habit => !habit.isArchived && !habit.finishedAt);
  const todayHabits = activeHabits.filter(habit => scheduledToday(habit, now, todayKey, timeZone));
  const otherDayHabits = activeHabits.filter(habit => !todayHabits.includes(habit));
  const orderedHabits = [...todayHabits, ...otherDayHabits];
  const completedHabitCount = todayHabits.filter(habit =>
    (habit.stats.find(stat => stat.dateKey === todayKey)?.amount ?? 0) >= Math.max(1, habit.targetCount)).length;
  const nextScheduledDate = (habit: Habit): Date | null => {
    for (let day = 1; day <= 370; day++) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      if (scheduledToday(habit, candidate, localDateKey(candidate, timeZone), timeZone)) return candidate;
    }
    return null;
  };
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
      <div className="primary-widget-habit-strip" aria-label="Ваши привычки">
        {orderedHabits.map((habit, index) => {
          const planned = index < todayHabits.length;
          const nextDate = planned ? null : nextScheduledDate(habit);
          const amount = habit.stats.find(stat => stat.dateKey === todayKey)?.amount ?? 0;
          const target = Math.max(1, habit.targetCount);
          const completed = planned ? Math.min(amount, target) : 0;
          const progress = planned ? Math.round(completed / target * 100) : 0;
          const complete = planned && completed >= target;
          const dayLabel = nextDate ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone }).format(nextDate).replace('.', '').toUpperCase() : '—';
          return <div key={habit.id} className="primary-widget-habit-circle-unit">
            {index === todayHabits.length && todayHabits.length > 0 &&
              <span className="primary-widget-habit-divider" aria-hidden="true"/>}
            <div className="primary-widget-habit-circle-wrap">
              <button type="button" className={`primary-widget-habit-circle ${planned ? '' : 'is-offday'} ${complete ? 'is-complete' : ''}`}
                onClick={() => { setHabitError(null); setSelectedHabitId(habit.id); }}
                aria-label={`Открыть привычку «${habit.name}», ${planned ? completed + ' из ' + target : 'не на сегодня'}`}
                title={planned ? `${habit.name}: ${completed} из ${target}` :
                  `${habit.name}: следующий день ${nextDate?.toLocaleDateString('ru-RU') ?? 'не запланирован'}`}
                style={{ '--habit-color': habit.color || '#06b6d4', '--habit-progress': progress + '%' } as CSSProperties}>
                <span className="primary-widget-habit-circle-core">
                  <span className="primary-widget-habit-emoji">{habit.icon || '✨'}</span>
                  <span className="primary-widget-habit-fraction">{completed}/{target}</span>
                </span>
              </button>
              {!planned && <span className="primary-widget-habit-day-badge" aria-hidden="true">{dayLabel}</span>}
            </div>
          </div>;
        })}
        <button type="button" className="primary-widget-habit-add-circle"
          onClick={() => setEditingHabitId('new')} aria-label="Создать привычку"
          title="Создать привычку"><Plus size={24} strokeWidth={1.7}/></button>
      </div>
      {habitError && <p role="alert" className="primary-widget-error">{habitError}</p>}
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
      <SidebarNotes userId={userId} requestedNote={requestedNote}/>
    </div>
  };

  return <aside className={`primary-workspace-sidebar ${isOpen ? 'is-open' : 'is-collapsed'}`}
    aria-label="Дополнительные блоки рабочего пространства" data-no-field-zoom="true">
    <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder}
      className="primary-workspace-sidebar-list" aria-hidden={!isOpen}
      aria-label="Блоки рабочего пространства. Перетаскивайте за маркер в заголовке">
      {order.map(id => <Widget key={id} id={id}
        title={{ upcoming: 'Ближайшие подзадачи', completed: 'Выполненные задания', habits: 'Привычки',
          progress: 'Статистика выполнения', sectors: 'Управление секторами', notes: 'Заметки' }[id]}
        headingExtra={id === 'habits' ?
          <span className="primary-habit-summary-badge">Выполнено {completedHabitCount} из {todayHabits.length}</span>
          : undefined}
        onMove={direction => updateOrder(direction, id)}>{widgetBodies[id]}</Widget>)}
    </Reorder.Group>
    <div className="primary-workspace-sidebar-toggle-slot" hidden={props.hideToggle} style={props.hideToggle ? {display:"none"} : undefined}>
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
    {selectedHabit && createPortal(
      <div className="primary-habit-backdrop" onMouseDown={event => {
        if (event.currentTarget === event.target) {
          setSelectedHabitId(null);
          setEditingHabitId(null);
        }
      }}>
        <section className="primary-habit-dialog primary-habit-detail-dialog dialog-surface"
          role="dialog" aria-modal="true" aria-label={'Привычка ' + selectedHabit.name}>
          <header className="primary-habit-dialog-header">
            <p className="primary-habit-eyebrow">ПРИВЫЧКА</p>
            <div className="primary-habit-detail-actions">
              <button type="button" className="primary-habit-detail-settings-trigger"
                onClick={() => setEditingHabitId(current => current === selectedHabit.id ? null : selectedHabit.id)}
                aria-expanded={editingHabitId === selectedHabit.id} title="Настройки привычки"
                aria-label="Настройки привычки"><Settings2 size={17}/></button>
              <button type="button" onClick={() => { setSelectedHabitId(null); setEditingHabitId(null); }}
                aria-label="Закрыть привычку"><X size={18}/></button>
            </div>
          </header>
          {editingHabitId === selectedHabit.id &&
            <PrimaryHabitDialog key={editingHabitId} embedded habit={editingHabit}
              onClose={() => setEditingHabitId(null)} onSave={saveHabit}
              onDelete={editingHabit ? deleteHabit : undefined}
              onFinish={editingHabit ? finishHabit : undefined}/>}
          <div className="primary-habit-detail-content">
            <div className="primary-habit-detail-overview">
              <div className="primary-habit-detail-ring" style={{
                '--habit-color': selectedHabit.color || '#06b6d4',
                '--habit-progress': Math.min(100, Math.round(((selectedHabit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0) /
                  Math.max(1, selectedHabit.targetCount)) * 100)) + '%'
              } as CSSProperties}>
                <span className="primary-habit-detail-ring-core">{selectedHabit.icon || '✨'}</span>
              </div>
              <div className="primary-habit-detail-main">
                <span className="primary-habit-detail-name-label">Название привычки</span>
                <div className="primary-habit-detail-name">{selectedHabit.name}</div>
                <div className="primary-habit-detail-completion">
                  <div className="primary-habit-detail-completion-label">
                    <span>Сегодня выполнено</span>
                    <strong>{Math.min(selectedHabit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0, selectedHabit.targetCount)} из {selectedHabit.targetCount}</strong>
                  </div>
                  <div className="primary-habit-detail-controls">
                    <button type="button" onClick={() => void changeHabit(selectedHabit, -1)}
                      disabled={busyHabitId !== null || (selectedHabit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0) <= 0}
                      aria-label="Убрать выполнение"><Minus size={19}/></button>
                    <button type="button" className="primary-habit-detail-complete"
                      onClick={() => void changeHabit(selectedHabit, 1)}
                      disabled={busyHabitId !== null || (selectedHabit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0) >= Math.max(1, selectedHabit.targetCount)}>
                      Выполнить
                    </button>
                    <button type="button" onClick={() => void changeHabit(selectedHabit, 1)}
                      disabled={busyHabitId !== null || (selectedHabit.stats.find(s => s.dateKey === todayKey)?.amount ?? 0) >= Math.max(1, selectedHabit.targetCount)}
                      aria-label="Добавить выполнение"><Plus size={19}/></button>
                  </div>
                </div>
              </div>
            </div>
            {habitError && <p role="alert" className="primary-widget-error">{habitError}</p>}
            <MiniAppHabitTracker habit={selectedHabit} onHabitChanged={props.onHabitUpsert}/>
          </div>
        </section>
      </div>, document.body
    )}
    {editingHabitId && editingHabitId !== selectedHabitId && <PrimaryHabitDialog key={editingHabitId}
      habit={editingHabit} onClose={() => setEditingHabitId(null)} onSave={saveHabit}
      onDelete={editingHabit ? deleteHabit : undefined}
      onFinish={editingHabit ? finishHabit : undefined}/>}
  </aside>;
}
