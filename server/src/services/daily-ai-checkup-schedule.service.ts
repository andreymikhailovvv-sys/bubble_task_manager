import type { CheckupMove } from './daily-ai-checkup.service.js';

export type CheckupScheduleItem = {
  id: string; title: string; dueDate: string | null;
  taskType?: string; importance?: number; urgency?: number; parentTaskId?: string | null;
};

const QUARTER = 15 * 60_000;
const nextQuarter = (time: number) => Math.ceil((time + 1) / QUARTER) * QUARTER;

export const checkupLocalDateKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(p => [p.type, p.value])) as Record<string, string>;
  return byType.year + '-' + byType.month + '-' + byType.day;
};

function localParts(date: Date, timeZone: string) {
  const items = new Intl.DateTimeFormat('en-GB', { timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit' }).formatToParts(date);
  return Object.fromEntries(items.map(x => [x.type, Number(x.value)])) as
    Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

/** Set 09:00 tomorrow in the user's timezone, including DST transitions. */
export function tomorrowMorningUtc(now: Date, timeZone: string) {
  const p = localParts(now, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 9, 0, 0));
  const requested = next.getTime();
  let estimate = requested;
  for (let i = 0; i < 3; i++) {
    const at = localParts(new Date(estimate), timeZone);
    const observed = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second);
    estimate += requested - observed;
  }
  return Math.max(nextQuarter(now.getTime()), estimate);
}

function isMoveable(item: CheckupScheduleItem) {
  return !item.taskType || item.taskType === 'TASK';
}

/**
 * Server-side completeness pass over ALL overdue tasks/subtasks and all dated
 * tasks in the supplied scheduling horizon. This is a proposal, never a write.
 * No missing AI suggestion can hide an overdue item or a 15-minute collision.
 */
export function completeCheckupScheduleMoves(
  suggested: CheckupMove[], items: CheckupScheduleItem[], now: Date, timeZone: string
): CheckupMove[] {
  const deadline = now.getTime();
  const byId = new Map(items.map(item => [item.id, item]));
  const suggestions = new Map(suggested.filter(move =>
    byId.has(move.taskId) && isMoveable(byId.get(move.taskId)!) &&
    Number.isFinite(Date.parse(move.newDueAt)) && Date.parse(move.newDueAt) > deadline
  ).map(move => [move.taskId, move]));
  const reserved = items.filter(item => !isMoveable(item) && item.dueDate &&
    Date.parse(item.dueDate) > deadline).map(item => Date.parse(item.dueDate!));
  const selected = new Map<string, CheckupMove>();
  const active = items.filter(isMoveable).sort((a, b) => {
    const first = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const second = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    const lateA = first < deadline, lateB = second < deadline;
    if (lateA !== lateB) return lateA ? -1 : 1;
    if (lateA && lateB) return (b.importance ?? 3) - (a.importance ?? 3) ||
      (b.urgency ?? 3) - (a.urgency ?? 3) || first - second;
    return first - second || (b.importance ?? 3) - (a.importance ?? 3) || a.id.localeCompare(b.id);
  });
  const tomorrowMorning = tomorrowMorningUtc(now, timeZone);
  for (const item of active) {
    const due = item.dueDate ? Date.parse(item.dueDate) : NaN;
    const late = Number.isFinite(due) && due < deadline;
    const preferred = suggestions.get(item.id);
    if (!Number.isFinite(due) && !preferred) continue;
    const highPriority = (item.importance ?? 3) >= 4 || (item.urgency ?? 3) >= 4;
    let target = late
      ? (highPriority ? nextQuarter(deadline) : tomorrowMorning)
      : (preferred ? Date.parse(preferred.newDueAt) : due);
    // High-priority overdue work belongs in the nearest slots; lower-priority
    // overdue work belongs tomorrow. An AI suggestion cannot override this rule.
    if (late && highPriority) target = nextQuarter(deadline);
    if (late && !highPriority) target = tomorrowMorning;
    const mustMove = late || Boolean(preferred);
    if (mustMove) target = nextQuarter(target - 1);
    if (target <= deadline) target = nextQuarter(deadline);
    let conflict = reserved.some(value => Math.abs(value - target) < QUARTER);
    if (conflict || (Number.isFinite(due) && target !== due) || late || preferred) {
      target = nextQuarter(target - 1);
      conflict = reserved.some(value => Math.abs(value - target) < QUARTER);
      let iterations = 0;
      while (conflict && iterations < 200_000) {
        target += QUARTER;
        conflict = reserved.some(value => Math.abs(value - target) < QUARTER);
        iterations++;
      }
    }
    reserved.push(target);
    if (Number.isFinite(due) && target === due) continue;
    // A same-day collision is fixed as a 15-minute proposal. A low-priority
    // overdue task can be spilled later as the tomorrow queue fills.
    selected.set(item.id, {
      taskId: item.id, newDueAt: new Date(target).toISOString(),
      reason: late ? (highPriority ? 'Просрочено: ближайшее свободное время' : 'Просрочено: перенести на завтра') :
        (preferred?.reason?.trim().slice(0, 140) || (Number.isFinite(due) ? 'Устранить пересечение: интервал 15 минут' : 'Выделить время в расписании'))
    });
  }
  return [...selected.values()];
}
