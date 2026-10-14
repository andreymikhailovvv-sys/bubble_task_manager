import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Flame, Target, Trophy } from 'lucide-react';
import type { Habit } from '../lib/types';
import { api } from '../lib/api';

type HabitDay = {
  key: string;
  date: Date;
  scheduled: boolean;
  done: boolean;
  partial: boolean;
  amount: number;
};

const dayKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, offset: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
const utcDayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

function isScheduled(habit: Habit, date: Date, created: Date) {
  if (date < created) return false;
  if (habit.durationMode === 'UNTIL_DATE' && habit.endDate && dayKey(date) > habit.endDate.slice(0, 10)) return false;
  if (habit.recurrenceType === 'WEEKDAYS') return habit.weekdays.includes(date.getDay());
  if (habit.recurrenceType === 'INTERVAL') {
    return (utcDayNumber(date) - utcDayNumber(created)) % Math.max(1, habit.intervalDays ?? 1) === 0;
  }
  return true;
}

function getDay(habit: Habit, date: Date, created: Date, completed: Map<string, number>): HabitDay {
  const key = dayKey(date);
  const amount = completed.get(key) ?? 0;
  const scheduled = isScheduled(habit, date, created);
  return {
    key,
    date,
    scheduled,
    amount,
    done: scheduled && amount >= Math.max(1, habit.targetCount),
    partial: scheduled && amount > 0 && amount < Math.max(1, habit.targetCount)
  };
}

/** Streaks count scheduled days, so non-scheduled weekdays never interrupt a series. */
export function computeHabitTracker(habit: Habit, month: Date, todayDate = new Date()) {
  const today = startOfDay(todayDate);
  const createdRaw = habit.createdAt ? new Date(habit.createdAt) : today;
  const created = startOfDay(Number.isNaN(createdRaw.getTime()) ? today : createdRaw);
  const counts = new Map((habit.stats ?? []).map((stat) => [stat.dateKey, stat.amount]));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const firstCalendarDay = addDays(first, -((first.getDay() + 6) % 7));
  const totalCells = Math.ceil(((first.getDay() + 6) % 7 + last.getDate()) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, index) => getDay(habit, addDays(firstCalendarDay, index), created, counts));

  let eligibleMonth = 0;
  let doneMonth = 0;
  let partialMonth = 0;
  for (let date = first; date <= last && date <= today; date = addDays(date, 1)) {
    const day = getDay(habit, date, created, counts);
    if (!day.scheduled) continue;
    eligibleMonth++;
    if (day.done) doneMonth++;
    else if (day.partial) partialMonth++;
  }

  // Historical completion data is supplied by the API; do not mistake calendar
  // cells outside the requested month for additional completions.
  let longestStreak = 0;
  let runningStreak = 0;
  let currentStreak = 0;
  let countingCurrent = true;
  const scannedDays = Math.min(36525, Math.max(0, utcDayNumber(today) - utcDayNumber(created) + 1));
  for (let i = 0; i < scannedDays; i++) {
    const date = addDays(today, -i);
    const day = getDay(habit, date, created, counts);
    if (!day.scheduled) continue;
    // Incomplete today has not yet broken the streak.
    if (i === 0 && !day.done) continue;
    if (day.done && countingCurrent) currentStreak++;
    else countingCurrent = false;
  }
  for (let i = scannedDays - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const day = getDay(habit, date, created, counts);
    if (!day.scheduled) continue;
    if (day.done) runningStreak++;
    else {
      if (!(i === 0)) runningStreak = 0;
    }
    longestStreak = Math.max(longestStreak, runningStreak);
  }

  return {
    days, created, today,
    percent: eligibleMonth ? Math.round((doneMonth / eligibleMonth) * 100) : 0,
    doneMonth, eligibleMonth, partialMonth, currentStreak, longestStreak
  };
}

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function MiniAppHabitTracker({ habit }: { habit: Habit }) {
  const today = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const [history, setHistory] = useState<Habit['stats'] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const startX = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let active = true;
    setHistory(null);
    setHistoryError(false);
    void api.getHabitHistory(habit.id).then((stats) => {
      if (active) setHistory(stats);
    }).catch(() => {
      if (active) setHistoryError(true);
    });
    return () => { active = false; };
  }, [habit.id]);
  const historyHabit = useMemo(() => {
    if (history === null) return habit;
    const combined = new Map(history.map((stat) => [stat.dateKey, stat]));
    habit.stats.forEach((stat) => combined.set(stat.dateKey, stat));
    // The open editor can add/remove today's completion optimistically.
    // A removed record must override the originally fetched history too.
    const currentKey = dayKey(new Date());
    if (!habit.stats.some((stat) => stat.dateKey === currentKey)) combined.delete(currentKey);
    return { ...habit, stats: Array.from(combined.values()) };
  }, [habit, history]);
  const shownMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const tracker = useMemo(() => computeHabitTracker(historyHabit, shownMonth, today), [historyHabit, monthOffset, today.getDate(), today.getMonth(), today.getFullYear()]);
  const oldestMonth = new Date(tracker.created.getFullYear(), tracker.created.getMonth(), 1);
  const canGoBack = shownMonth > oldestMonth;
  const canGoForward = monthOffset < 0;
  const moveMonth = (direction: -1 | 1) => {
    if (direction === -1 && !canGoBack) return;
    if (direction === 1 && !canGoForward) return;
    setMonthOffset((offset) => offset + direction);
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    startX.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = startX.current;
    startX.current = null;
    if (!start || !event.changedTouches.length) return;
    const deltaX = event.changedTouches[0].clientX - start.x;
    const deltaY = event.changedTouches[0].clientY - start.y;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
    moveMonth(deltaX > 0 ? -1 : 1);
  };
  const monthLabel = shownMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return (
    <div className="miniapp-habit-tracker space-y-4" style={{ '--tracker-accent': habit.color || '#22c55e' } as CSSProperties}>
      <section className="miniapp-habit-tracker-calendar rounded-[1.6rem] border p-3 sm:p-4" aria-label="Календарь выполнения привычки">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays size={17} className="miniapp-habit-tracker-icon shrink-0" />
            <h3 className="truncate text-sm font-bold capitalize">{monthLabel}</h3>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" className="miniapp-focus-icon-button" disabled={!canGoBack} onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={16}/></button>
            <button type="button" className="miniapp-focus-icon-button" disabled={!canGoForward} onClick={() => moveMonth(1)} aria-label="Следующий месяц"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="miniapp-habit-tracker-calendar-body" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { startX.current = null; }}>
          <div className="miniapp-habit-tracker-weekdays">
            {weekdays.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="miniapp-habit-tracker-days">
            {tracker.days.map((day, index) => {
              const belongsToMonth = day.date.getMonth() === shownMonth.getMonth();
              const active = belongsToMonth && day.date <= tracker.today && day.scheduled;
              const before = index > 0 && tracker.days[index - 1].done && tracker.days[index - 1].date.getMonth() === shownMonth.getMonth();
              const after = index < tracker.days.length - 1 && tracker.days[index + 1].done && tracker.days[index + 1].date.getMonth() === shownMonth.getMonth();
              const joinedBefore = day.done && before && index % 7 !== 0;
              const joinedAfter = day.done && after && index % 7 !== 6;
              return <div
                key={day.key}
                className={['miniapp-habit-tracker-day',
                  !belongsToMonth ? 'miniapp-habit-tracker-day-outside' : '',
                  active ? 'miniapp-habit-tracker-day-scheduled' : '',
                  day.done && belongsToMonth ? 'miniapp-habit-tracker-day-done' : '',
                  day.partial && active ? 'miniapp-habit-tracker-day-partial' : '',
                  joinedBefore ? 'miniapp-habit-tracker-day-connected-left' : '',
                  joinedAfter ? 'miniapp-habit-tracker-day-connected-right' : '',
                  day.key === dayKey(tracker.today) ? 'miniapp-habit-tracker-day-today' : ''
                ].filter(Boolean).join(' ')}
                title={belongsToMonth ? `${day.date.toLocaleDateString('ru-RU')}: ${day.amount} из ${habit.targetCount}${day.scheduled ? '' : ' · не запланировано'}` : undefined}
                aria-label={belongsToMonth ? `${day.date.toLocaleDateString('ru-RU')}: ${day.done ? 'выполнено' : day.partial ? 'частично выполнено' : active ? 'не выполнено' : 'не запланировано'}` : undefined}
              >
                <span>{day.date.getDate()}</span>
              </div>;
            })}
          </div>
        </div>
        {history === null ? <p role="status" className="mt-2 text-[11px] text-muted">{historyError ? 'Полную историю получить не удалось. Показаны последние отметки.' : 'Загружаем историю выполнения…'}</p> : null}
        <div className="miniapp-habit-tracker-legend mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <span><i className="miniapp-habit-tracker-legend-dot miniapp-habit-tracker-legend-done" />Выполнено</span>
          <span><i className="miniapp-habit-tracker-legend-dot miniapp-habit-tracker-legend-partial" />Частично</span>
          <span><i className="miniapp-habit-tracker-legend-dot" />Не выполнено</span>
        </div>
      </section>
      <div className="miniapp-habit-tracker-stats grid grid-cols-2 gap-2">
        <div className="miniapp-habit-tracker-stat miniapp-habit-tracker-stat-featured rounded-2xl border p-3">
          <Target size={18} className="miniapp-habit-tracker-stat-icon" />
          <strong>{tracker.percent}%</strong>
          <span>Выполнение за месяц</span>
          <small>{tracker.doneMonth} из {tracker.eligibleMonth} плановых дней</small>
        </div>
        <div className="miniapp-habit-tracker-stat rounded-2xl border p-3">
          <Flame size={18} className="miniapp-habit-tracker-stat-icon" />
          <strong>{tracker.currentStreak}</strong>
          <span>Текущая серия</span>
          <small>плановых дней подряд</small>
        </div>
        <div className="miniapp-habit-tracker-stat rounded-2xl border p-3">
          <Trophy size={18} className="miniapp-habit-tracker-stat-icon" />
          <strong>{tracker.longestStreak}</strong>
          <span>Лучшая серия</span>
          <small>из доступной истории</small>
        </div>
        <div className="miniapp-habit-tracker-stat rounded-2xl border p-3">
          <CheckCircle2 size={18} className="miniapp-habit-tracker-stat-icon" />
          <strong>{tracker.doneMonth}</strong>
          <span>Успешных дней</span>
          <small>в выбранном месяце</small>
        </div>
      </div>
    </div>
  );
}

