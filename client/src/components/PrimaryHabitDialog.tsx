import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, ClipboardList, Loader2, Minus, Plus, Trash2, X } from 'lucide-react';
import type { Habit, HabitDurationMode, HabitRecurrenceType } from '../lib/types';
import './PrimaryHabitDialog.css';

type Props = {
  habit?: Habit | null;
  onClose: () => void;
  onSave: (payload: Partial<Habit>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onFinish?: () => Promise<void>;
};

const icons = ['💧', '🏃', '📚', '🧘', '🥗', '📝', '💪', '🎯', '✨', '🏆', '🚴', '🌿'];
const colors = ['#22c55e', '#38bdf8', '#a78bfa', '#f97316', '#f43f5e', '#eab308', '#14b8a6'];
const weekdays = [{ value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 0, label: 'Вс' }];
const normalizedTimes = (values: string[]) =>
  [...new Set(values.filter(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)))].sort();

export function PrimaryHabitDialog({ habit, onClose, onSave, onDelete, onFinish }: Props) {
  const [name, setName] = useState(habit?.name || '');
  const [icon, setIcon] = useState(habit?.icon || '✨');
  const [color, setColor] = useState(habit?.color || '#22c55e');
  const [targetCount, setTargetCount] = useState(habit?.targetCount || 1);
  const [times, setTimes] = useState<string[]>(habit?.reminderTimes?.length
    ? habit.reminderTimes : habit?.reminderTime ? [habit.reminderTime] : []);
  const [recurrenceType, setRecurrenceType] = useState<HabitRecurrenceType>(habit?.recurrenceType || 'DAILY');
  const [weekdaysSelection, setWeekdaysSelection] = useState<number[]>(habit?.weekdays?.length ? habit.weekdays : [1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState(habit?.intervalDays || 2);
  const [durationMode, setDurationMode] = useState<HabitDurationMode>(habit?.durationMode || 'FOREVER');
  const [endDate, setEndDate] = useState(habit?.endDate?.slice(0, 10) || '');
  const [repeatTarget, setRepeatTarget] = useState(habit?.totalRepeatTarget || 7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) { setError('Укажите название привычки.'); return; }
    if (recurrenceType === 'WEEKDAYS' && weekdaysSelection.length === 0) {
      setError('Выберите дни повторения.'); return;
    }
    if (durationMode === 'UNTIL_DATE' && !endDate) {
      setError('Укажите дату завершения.'); return;
    }
    setSaving(true); setError('');
    try {
      const reminders = normalizedTimes(times);
      await onSave({
        name: name.trim(), icon, color, targetCount: Math.max(1, Math.min(99, targetCount)),
        reminderTimes: reminders, reminderTime: reminders[0] || null,
        recurrenceType,
        weekdays: recurrenceType === 'WEEKDAYS' ? weekdaysSelection : [],
        intervalDays: recurrenceType === 'INTERVAL' ? Math.max(1, Math.min(365, intervalDays)) : null,
        durationMode,
        endDate: durationMode === 'UNTIL_DATE' ? endDate : null,
        totalRepeatTarget: durationMode === 'REPEAT_COUNT' ? Math.max(1, Math.min(9999, repeatTarget)) : null
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить привычку.');
    } finally { setSaving(false); }
  };
  const destructive = async (action: () => Promise<void>, label: string) => {
    if (!window.confirm(label)) return;
    setSaving(true); setError('');
    try { await action(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить привычку.');
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="primary-habit-backdrop" onMouseDown={event => {
      if (event.currentTarget === event.target && !saving) onClose();
    }}>
      <section className="primary-habit-dialog dialog-surface" role="dialog" aria-modal="true"
        aria-label={habit ? 'Настройки привычки' : 'Создание привычки'}>
        <header className="primary-habit-dialog-header">
          <h2>{habit ? 'Настройки привычки' : 'Новая привычка'}</h2>
          <button type="button" className="primary-habit-icon-button" onClick={onClose} disabled={saving} aria-label="Закрыть"><X size={19}/></button>
        </header>
        <form className="primary-habit-form" onSubmit={event => void save(event)}>
          {error && <p className="primary-habit-error" role="alert">{error}</p>}
          <label className="primary-habit-title-pill">
            <ClipboardList size={18} aria-hidden="true"/>
            <input autoFocus required aria-label="Название привычки" maxLength={160}
              value={name} placeholder="Название привычки"
              onChange={event => setName(event.target.value)}/>
          </label>
          <div className="primary-habit-field"><span>Иконка</span>
            <div className="primary-habit-icon-grid">
              {icons.map(item => <button type="button" key={item} aria-label={'Выбрать ' + item}
                aria-pressed={icon === item} className={icon === item ? 'is-selected' : ''}
                onClick={() => setIcon(item)}>{item}</button>)}
            </div>
            <input className="primary-habit-custom-icon" aria-label="Другой эмодзи" maxLength={8}
              value={icons.includes(icon) ? '' : icon} placeholder="Или свой эмодзи"
              onChange={event => setIcon(Array.from(event.target.value).slice(0, 2).join(''))}/>
          </div>
          <div className="primary-habit-field"><span>Цвет привычки</span>
            <div className="primary-habit-color-grid">{colors.map(item =>
              <button type="button" key={item} aria-label={'Выбрать цвет ' + item} aria-pressed={color === item}
                style={{ backgroundColor: item }} onClick={() => setColor(item)}/>)}
              <label className="primary-habit-color-custom" title="Выбрать другой цвет">
                <input type="color" value={color} onChange={event => setColor(event.target.value)} aria-label="Другой цвет"/>
              </label>
            </div>
          </div>
          <div className="primary-habit-field"><span>Повторов в день: {targetCount}</span>
            <div className="primary-habit-target-presets" role="group" aria-label="Количество повторений за день">
              {[1, 2, 3, 4, 5].map(value =>
                <button type="button" key={value} className={targetCount === value ? 'is-selected' : ''}
                  aria-pressed={targetCount === value} onClick={() => setTargetCount(value)}>{value}</button>)}
              <div className="primary-habit-stepper">
                <button type="button" onClick={() => setTargetCount(value => Math.max(1, value - 1))}
                  disabled={targetCount <= 1} aria-label="Меньше повторений"><Minus size={16}/></button>
                <button type="button" onClick={() => setTargetCount(value => Math.min(99, value + 1))}
                  disabled={targetCount >= 99} aria-label="Больше повторений"><Plus size={16}/></button>
              </div>
            </div>
          </div>
          <div className="primary-habit-field"><span><Clock3 size={15}/> Время напоминаний</span>
            <div className="primary-habit-times">{times.map(time => <span key={time} className="primary-habit-time-pill">
              {time}<button type="button" onClick={() => setTimes(values => values.filter(value => value !== time))} aria-label={'Удалить ' + time}><X size={13}/></button></span>)}
              <label className="primary-habit-time-add"><Plus size={15}/> Добавить
                <input type="time" aria-label="Добавить время напоминания" onChange={event => {
                  if (event.target.value) setTimes(previous => normalizedTimes([...previous, event.target.value]));
                  event.target.value = '';
                }}/></label>
            </div>
          </div>
          <div className="primary-habit-select-grid">
            <label className="primary-habit-field"><span>Периодичность</span>
              <select value={recurrenceType} onChange={event => setRecurrenceType(event.target.value as HabitRecurrenceType)}>
                <option value="DAILY">Каждый день</option><option value="WEEKDAYS">По дням недели</option>
                <option value="INTERVAL">Каждые N дней</option>
              </select>
            </label>
            <label className="primary-habit-field"><span>Продолжительность</span>
              <select value={durationMode} onChange={event => setDurationMode(event.target.value as HabitDurationMode)}>
                <option value="FOREVER">Постоянно</option><option value="UNTIL_DATE">До даты</option>
                <option value="REPEAT_COUNT">До количества повторов</option>
              </select>
            </label>
          </div>
          {recurrenceType === 'WEEKDAYS' && <div className="primary-habit-weekdays">{weekdays.map(day =>
            <button key={day.value} type="button" className={weekdaysSelection.includes(day.value) ? 'is-selected' : ''}
              aria-pressed={weekdaysSelection.includes(day.value)}
              onClick={() => setWeekdaysSelection(current => current.includes(day.value)
                ? current.filter(item => item !== day.value) : [...current, day.value])}>{day.label}</button>)}</div>}
          {recurrenceType === 'INTERVAL' && <label className="primary-habit-field"><span>Интервал в днях</span>
            <input type="number" min={1} max={365} value={intervalDays}
              onChange={event => setIntervalDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}/></label>}
          {durationMode === 'UNTIL_DATE' && <label className="primary-habit-field"><span>Дата окончания</span>
            <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)}/></label>}
          {durationMode === 'REPEAT_COUNT' && <label className="primary-habit-field"><span>Всего повторений</span>
            <input type="number" min={1} max={9999} value={repeatTarget}
              onChange={event => setRepeatTarget(Math.max(1, Math.min(9999, Number(event.target.value) || 1)))}/></label>}
          <footer className="primary-habit-dialog-footer">
            {habit && onDelete && <button type="button" className="primary-habit-danger" disabled={saving}
              onClick={() => void destructive(onDelete, 'Удалить привычку «' + habit.name + '»?')}><Trash2 size={15}/> Удалить</button>}
            {habit && onFinish && <button type="button" className="primary-habit-secondary" disabled={saving}
              onClick={() => void destructive(onFinish, 'Завершить привычку «' + habit.name + '»?')}><Check size={15}/> Завершить</button>}
            <span className="primary-habit-footer-spacer"/>
            <button type="button" className="primary-habit-secondary" disabled={saving} onClick={onClose}>Отмена</button>
            <button type="submit" className="primary-habit-save" disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>} Сохранить</button>
          </footer>
        </form>
      </section>
    </div>, document.body
  );
}
