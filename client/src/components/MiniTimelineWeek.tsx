import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Habit, Sphere, Task } from '../lib/types';
import { timelineProjectionKey } from '../lib/monitoringTimeline';

type WeekDay = {
  date: Date;
  dateKey: string;
  tasks: Task[];
  habits: Array<{ habit: Habit; reminderTime: string }>;
};

type WeekEntry =
  | { kind: 'task'; time: string; task: Task }
  | { kind: 'habit'; time: string; habit: Habit; reminderTime: string };

type Props = {
  days: WeekDay[];
  anchorDate: Date;
  now: Date;
  taskById: Map<string, Task>;
  spheres: Sphere[];
  isOverdue: (task: Task) => boolean;
  formatRemaining: (due?: string | null) => string;
  onSelectDay: (day: Date) => void;
  onOpenDay: (day: Date) => void;
  onOpenTask: (task: Task) => void;
  onOpenSubtask: (task: Task) => void;
  onOpenHabit: (habit: Habit) => void;
};

/**
 * Android NativeTimeline.kt / ReadableWeekGrid parity.
 * Seven compact date buttons navigate a horizontally scrollable week of
 * readable columns. Task cards reuse the exact Day timeline card classes.
 */
export function MiniTimelineWeek({
  days, anchorDate, now, taskById, spheres, isOverdue, formatRemaining,
  onSelectDay, onOpenDay, onOpenTask, onOpenSubtask, onOpenHabit
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const initialIndex = Math.max(0, days.findIndex((day) => day.date.toDateString() === anchorDate.toDateString()));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const firstDayKey = days[0]?.dateKey;

  // A different week remounts this component from MiniApp. Align the selected
  // column before paint so the old week's scroll offset never flashes.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const columns = track?.querySelectorAll<HTMLElement>('.miniapp-native-week-column');
    if (!track || !columns?.length) return;
    const index = Math.max(0, days.findIndex((day) => day.date.toDateString() === anchorDate.toDateString()));
    setSelectedIndex(index);
    track.scrollLeft = columns[index].offsetLeft - columns[0].offsetLeft;
  }, [firstDayKey]);

  const scrollToDay = (index: number) => {
    const day = days[index];
    if (!day) return;
    setSelectedIndex(index);
    onSelectDay(day.date);
    const track = trackRef.current;
    const columns = track?.querySelectorAll<HTMLElement>('.miniapp-native-week-column');
    if (!track || !columns?.[index]) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    track.scrollTo({
      left: columns[index].offsetLeft - columns[0].offsetLeft,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  };

  const syncSelectedDayOnScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const columns = Array.from(track.querySelectorAll<HTMLElement>('.miniapp-native-week-column'));
    if (!columns.length) return;
    const origin = columns[0].offsetLeft;
    const nearest = columns.reduce((best, column, index) =>
      Math.abs(column.offsetLeft - origin - track.scrollLeft)
        < Math.abs(columns[best].offsetLeft - origin - track.scrollLeft) ? index : best, 0);
    if (nearest === selectedIndex) return;
    setSelectedIndex(nearest);
    onSelectDay(days[nearest].date);
  };

  return (
    <div className="miniapp-native-week-timeline" aria-label="Недельный таймлайн">
      <div className="miniapp-native-week-day-picker" role="group" aria-label="Выберите день недели">
        {days.map(({ date, dateKey }, index) => {
          const isToday = date.toDateString() === now.toDateString();
          const isSelected = selectedIndex === index;
          return (
            <button key={dateKey} type="button"
              className={'miniapp-native-week-day-button' + (isSelected ? ' is-selected' : '') + (isToday ? ' is-today' : '')}
              aria-pressed={isSelected}
              aria-label={'Перейти к ' + date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => scrollToDay(index)}>
              <small>{date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '')}</small>
              <span>{date.getDate()}</span>
            </button>
          );
        })}
      </div>
      <div className="miniapp-native-week-hint" aria-hidden="true">
        <ChevronLeft size={14} />
        <span>Листайте дни или выберите дату сверху</span>
        <ChevronRight size={14} />
      </div>
      <div ref={trackRef} className="miniapp-native-week-track" onScroll={syncSelectedDayOnScroll}
        aria-label="Колонки дней недели" tabIndex={0}>
        {days.map(({ date, dateKey, tasks, habits }) => {
          const isToday = date.toDateString() === now.toDateString();
          const entries: WeekEntry[] = [
            ...tasks.map((task) => ({
              kind: 'task' as const,
              task,
              time: new Date(task.dueDate as string).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            })),
            ...habits.map(({ habit, reminderTime }) => ({ kind: 'habit' as const, habit, reminderTime, time: reminderTime }))
          ].sort((a, b) => a.time.localeCompare(b.time));
          const hours = [...new Set(entries.map((entry) => entry.time.slice(0, 2)))];
          return (
            <section key={dateKey} className={'miniapp-native-week-column' + (isToday ? ' is-today' : '')}
              aria-label={date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}>
              <button type="button" className="miniapp-native-week-column-title"
                onClick={() => onOpenDay(date)}
                aria-label={'Открыть день ' + date.toLocaleDateString('ru-RU')}>
                <span>{date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <div className="miniapp-native-week-column-rule" />
              {hours.length === 0 ? <p className="miniapp-native-week-empty">Нет записей</p> : (
                <div className="miniapp-native-week-hours">
                  {hours.map((hour) => (
                    <div className="miniapp-native-week-hour" key={hour}>
                      <time>{hour}:00</time>
                      <div className="miniapp-native-week-items">
                        {entries.filter((entry) => entry.time.startsWith(hour)).map((entry) => {
                          if (entry.kind === 'habit') {
                            return (
                              <button key={'habit-' + entry.habit.id + '-' + entry.reminderTime} type="button"
                                className="miniapp-native-day-card miniapp-native-day-habit"
                                style={{ '--day-entry-accent': entry.habit.color || '#22c55e' } as CSSProperties}
                                onClick={() => onOpenHabit(entry.habit)}>
                                <span className="miniapp-native-day-card-dot" aria-hidden="true" />
                                <span className="miniapp-native-day-card-copy">
                                  <strong>{entry.habit.icon} {entry.habit.name}</strong>
                                  <small>{entry.reminderTime}</small>
                                </span>
                              </button>
                            );
                          }
                          const task = entry.task;
                          const isSubtask = Boolean(task.parentTaskId);
                          const isEvent = task.taskType === 'EVENT';
                          const isReminder = task.taskType === 'REMINDER';
                          const parent = task.parentTaskId ? taskById.get(task.parentTaskId) : null;
                          const sectorColor = spheres.find((sphere) => sphere.id === (parent ?? task).sphereId)?.color ?? '#64748b';
                          const accent = isReminder ? '#0284c7' : isEvent ? '#f59e0b' : sectorColor;
                          const overdue = isOverdue(task);
                          const dueLabel = isReminder || isEvent ? entry.time :
                            overdue ? 'Просрочено · ' + formatRemaining(task.dueDate) : formatRemaining(task.dueDate);
                          return (
                            <button type="button" key={timelineProjectionKey(task)} className={'miniapp-native-day-card'
                              + (isSubtask ? ' miniapp-native-day-subtask' : '')
                              + (isEvent ? ' miniapp-native-day-event' : '')
                              + (overdue ? ' miniapp-native-day-overdue' : '')}
                              style={{ '--day-entry-accent': accent } as CSSProperties}
                              onClick={() => {
                                if (isReminder) onOpenDay(date);
                                else if (isSubtask) onOpenSubtask(taskById.get(task.id) ?? task);
                                else onOpenTask(taskById.get(task.id) ?? task);
                              }}
                              aria-label={(isReminder ? 'Напоминание' : isEvent ? 'Событие' : isSubtask ? 'Подзадача' : 'Задача') + ': ' + task.title}>
                              <span className="miniapp-native-day-card-dot" aria-hidden="true" />
                              <span className="miniapp-native-day-card-copy">
                                <strong>{isReminder ? '🔔 ' : ''}{task.title}{task.aiMonitoringEnabled ? ' · A' : ''}</strong>
                                <small>{dueLabel}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="miniapp-native-week-open-day" onClick={() => onOpenDay(date)}>
                Открыть день
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
