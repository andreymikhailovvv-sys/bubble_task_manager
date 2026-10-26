import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { buildManualRecurrence, defaultRecurrenceSlots, loadManualRecurrence, recurrenceWeekdays, type RecurrencePeriod, type RecurrenceSlot } from '../lib/recurrenceSchedule';

export type RecurrenceDraftFields = {
  recurrenceText?: string | null;
  recurrenceJson?: Record<string, unknown> | null;
  recurrenceSummary?: string | null;
  recurrenceUntil?: string | null;
  dueDate?: string | null;
};

type Props = {
  value: RecurrenceDraftFields;
  onChange: (patch: Partial<RecurrenceDraftFields>) => void;
  onParseWithAi: () => void;
  parsing: boolean;
  nextDueLabel?: string | null;
  isEvent?: boolean;
};

/** The same saved recurrenceJson slots as the desktop task editor. */
export function TaskRecurrenceConfigurator({ value, onChange, onParseWithAi, parsing, nextDueLabel, isEvent }: Props) {
  const initial = loadManualRecurrence(value.recurrenceJson);
  const [method, setMethod] = useState<'manual' | 'ai'>(initial || !value.recurrenceJson ? 'manual' : 'ai');
  const [period, setPeriod] = useState<RecurrencePeriod>(initial?.period ?? 'DAILY');
  const [slots, setSlots] = useState<RecurrenceSlot[]>(initial?.slots ?? defaultRecurrenceSlots());
  const [error, setError] = useState<string | null>(null);

  const commit = (nextPeriod: RecurrencePeriod, nextSlots: RecurrenceSlot[]) => {
    setPeriod(nextPeriod);
    setSlots(nextSlots);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
      const { schedule, summary } = buildManualRecurrence(nextPeriod, nextSlots, timezone);
      onChange({
        recurrenceJson: schedule,
        recurrenceText: summary,
        recurrenceSummary: summary,
        recurrenceUntil: null,
        dueDate: null
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Проверьте расписание.');
    }
  };
  const changePeriod = (nextPeriod: RecurrencePeriod) => {
    const time = slots[0]?.time ?? '09:00';
    const next = nextPeriod === 'DAILY' ? [{ time }]
      : nextPeriod === 'WEEKLY' ? [{ time, weekday: 1 }]
      : [{ time, monthDay: 1 }];
    commit(nextPeriod, next);
  };
  const changeDay = (day: number) => {
    const key = period === 'WEEKLY' ? 'weekday' : 'monthDay';
    const selected = slots.some(slot => slot[key] === day);
    if (selected && slots.length === 1) return;
    const next = selected
      ? slots.filter(slot => slot[key] !== day)
      : [...slots, { time: slots[0]?.time ?? '09:00', [key]: day }];
    commit(period, next.sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0)));
  };

  return <section className="recurrence-configuration mini-recurrence-configuration space-y-3 rounded-2xl border p-3 text-xs" aria-label="Настройка повторения">
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Способ настройки повторений">
      {([['manual', 'Вручную'], ['ai', 'Через ИИ']] as const).map(([option, label]) =>
        <button key={option} type="button" className="recurrence-choice-button rounded-xl border px-3 py-2 font-semibold"
          aria-pressed={method === option} onClick={() => {
            if (method === option) return;
            setMethod(option); setError(null);
            if (option === 'manual') commit(period, slots);
          }}>{label}</button>)}
    </div>
    {method === 'manual' ? <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Период повторения">
        {([['DAILY', 'В день'], ['WEEKLY', 'В неделю'], ['MONTHLY', 'В месяц']] as const).map(([kind, label]) =>
          <button key={kind} type="button" className="recurrence-choice-button rounded-xl border px-2 py-2 font-semibold"
            aria-pressed={kind === period} onClick={() => changePeriod(kind)}>{label}</button>)}
      </div>
      {period === 'DAILY' ? <div className="space-y-2">
        {slots.map((slot, index) => <div key={index} className="recurrence-time-row flex items-center justify-between gap-2 rounded-xl border p-2">
          <span className="font-medium">Время {index + 1}</span>
          <div className="flex items-center gap-1.5">
            <input type="time" className="recurrence-time-input w-[105px] rounded-lg border px-2 py-1" value={slot.time}
              aria-label={`Время повторения ${index + 1}`} onChange={e => commit(period, slots.map((entry, i) => i === index ? { ...entry, time: e.target.value } : entry))} />
            {slots.length > 1 && <button type="button" className="recurrence-remove-time-button rounded-lg border p-1.5" title="Убрать время"
              onClick={() => commit(period, slots.filter((_, i) => i !== index))}><X size={13} /></button>}
          </div>
        </div>)}
        <button type="button" className="recurrence-add-time-button inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-medium"
          disabled={slots.length >= 31} onClick={() => {
            const used = new Set(slots.map(s => s.time));
            const next = Array.from({ length: 24 * 60 }, (_, i) => {
              const minutes = (9 * 60 + i) % (24 * 60);
              return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
            }).find(candidate => !used.has(candidate));
            if (next) commit(period, [...slots, { time: next }]);
          }}><Plus size={13} /> Добавить время</button>
      </div> : <div className="space-y-2">
        <label className="recurrence-time-row flex items-center justify-between gap-2 rounded-xl border p-2">
          Время <input className="recurrence-time-input w-[105px] rounded-lg border px-2 py-1" type="time" value={slots[0]?.time ?? '09:00'}
            onChange={e => commit(period, slots.map(slot => ({ ...slot, time: e.target.value })))} />
        </label>
        <div className={period === 'WEEKLY' ? 'grid grid-cols-7 gap-1' : 'grid grid-cols-7 gap-1.5'} role="group" aria-label={period === 'WEEKLY' ? 'Дни недели' : 'Дни месяца'}>
          {(period === 'WEEKLY' ? recurrenceWeekdays.map(d => d.value) : Array.from({ length: 31 }, (_, i) => i + 1)).map(day =>
            <button type="button" key={day} className="recurrence-day-button aspect-square rounded-lg border text-[11px] font-semibold"
              aria-pressed={slots.some(slot => period === 'WEEKLY' ? slot.weekday === day : slot.monthDay === day)}
              onClick={() => changeDay(day)}>{period === 'WEEKLY' ? recurrenceWeekdays[day - 1].label : day}</button>)}
        </div>
        {period === 'MONTHLY' && <p className="text-muted">Если числа нет в месяце, повторение сработает в его последний день.</p>}
      </div>}
      <p className="text-muted">Время указано для вашего часового пояса.</p>
    </div> : <div className="space-y-2">
      <p className="text-muted">Опишите, когда должна повторяться {isEvent ? 'событие' : 'задача'}.</p>
      <textarea className="miniapp-task-text-field min-h-16 w-full rounded-xl border p-2 text-sm"
        placeholder="Например: каждый вторник и четверг в 17:00" value={value.recurrenceText ?? ''}
        onChange={e => onChange({ recurrenceText: e.target.value })} />
      <button type="button" className="recurrence-send-button rounded-lg border px-3 py-2 font-semibold disabled:opacity-50"
        onClick={onParseWithAi} disabled={!value.recurrenceText?.trim() || parsing}>{parsing ? 'Обработка…' : 'Применить расписание'}</button>
    </div>}
    {value.recurrenceSummary && <p className="text-emerald-600">{value.recurrenceSummary}</p>}
    {nextDueLabel && <p className="text-muted">Ближайший срок: {nextDueLabel}</p>}
    {error && <p className="text-rose-500" role="alert">{error}</p>}
  </section>;
}
