import { useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, ClipboardList, Loader2, Minus, Palette, Plus, Trash2, X } from 'lucide-react';
import type { Habit, HabitDurationMode, HabitRecurrenceType } from '../lib/types';
import './PrimaryHabitDialog.css';

type Props = {
  habit?: Habit | null;
  embedded?: boolean;
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

export function PrimaryHabitDialog({ habit, embedded = false, onClose, onSave, onDelete, onFinish }: Props) {
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
  const [customIconOpen, setCustomIconOpen] = useState(false);
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

  const panel = (
      <section className={`primary-habit-dialog dialog-surface ${embedded ? 'primary-habit-dialog--embedded' : !habit ? 'primary-habit-dialog--create' : ''}`} role="dialog" aria-modal={!embedded}
        aria-label={habit ? 'Настройки привычки' : 'Создание привычки'}>
        <header className="primary-habit-dialog-header">
          {habit ? <h2>Настройки привычки</h2> : <div className="primary-habit-create-heading">
            <h2>НОВАЯ ПРИВЫЧКА</h2>
            <p>Выберите параметры и создайте привычку.</p>
          </div>}
          <button type="button" className="primary-habit-icon-button" onClick={onClose} disabled={saving} aria-label="Закрыть"><X size={19}/></button>
        </header>
        <form className="primary-habit-form" onSubmit={event => void save(event)}>
          {error && <p className="primary-habit-error" role="alert">{error}</p>}
          {!habit && <div className="primary-habit-create-overview">
            <div className="primary-habit-create-ring" style={{
              '--habit-color': color, '--habit-progress': '0%'
            } as CSSProperties}><span className="primary-habit-create-ring-core">{icon || '✨'}</span></div>
            <div className="primary-habit-create-overview-main">
              <label className="primary-habit-field"><span>Название привычки</span>
                <input autoFocus required aria-label="Название привычки" maxLength={160}
                  value={name} placeholder="Например, вода или зарядка"
                  onChange={event => setName(event.target.value)}/>
              </label>
              <div className="primary-habit-create-completion">
                <div className="primary-habit-create-completion-head"><span>Выполнено</span><strong>0 из {targetCount}</strong></div>
                <div className="primary-habit-create-completion-actions">
                  <button type="button" disabled aria-label="Снять выполнение"><Minus size={16}/></button>
                  <button type="button" className="primary-habit-create-complete" disabled>Выполнить</button>
                  <button type="button" disabled aria-label="Отметить выполнение"><Plus size={16}/></button>
                </div>
              </div>
            </div>
          </div>}
          {embedded && <label className="primary-habit-field primary-habit-embedded-name"><span>Название привычки</span>
            <input autoFocus required value={name} maxLength={160} onChange={event => setName(event.target.value)}/>
          </label>
          <div className="primary-habit-field"><span>Иконка</span>
            <div className="primary-habit-icon-grid">
              {icons.map(item => <button type="button" key={item} aria-label={'Выбрать ' + item}
                aria-pressed={icon === item} className={icon === item ? 'is-selected' : ''}
                onClick={() => { setIcon(item); setCustomIconOpen(false); }}>{item}</button>)}
              <button type="button" className="primary-habit-custom-icon-trigger"
                aria-label="Свой эмодзи" title="Выбрать свой эмодзи"
                aria-expanded={customIconOpen} onClick={() => setCustomIconOpen(open => !open)}><Plus size={19}/></button>
            </div>
            {customIconOpen && <input className="primary-habit-custom-icon" aria-label="Другой эмодзи" maxLength={8}
              value={icons.includes(icon) ? '' : icon} placeholder="Вставьте свой эмодзи"
              onChange={event => setIcon(Array.from(event.target.value).slice(0, 2).join(''))}/>}
          </div>
          <div className="primary-habit-field"><span>Цвет круга</span>
            <div className="primary-habit-color-grid">{colors.map(item =>
              <button type="button" key={item} aria-label={'Выбрать цвет ' + item} aria-pressed={color === item}
                style={{ backgroundColor: item }} onClick={() => setColor(item)}/>)}
              <label className="primary-habit-color-custom" title="Другой цвет">
                <Palette size={19}/>
                <input type="color" value={color} onChange={event => setColor(event.target.value)} aria-label="Другой цвет"/>
              </label>
            </div>
          </div>
          <div className="primary-habit-field"><span>Повторов в день</span>
            <div className="primary-habit-full-stepper">
              <button type="button" onClick={() => setTargetCount(value => Math.max(1, value - 1))}
                disabled={targetCount <= 1} aria-label="Меньше повторов"><Minus size={19}/></button>
              <strong>{targetCount}</strong>
              <button type="button" onClick={() => setTargetCount(value => Math.min(99, value + 1))}
                disabled={targetCount >= 99} aria-label="Больше повторов"><Plus size={19}/></button>
            </div>
          </div>
          <div className="primary-habit-field"><span><Clock3 size={15}/> Время напоминаний</span>
            <div className="primary-habit-times">{times.map(time => <span key={time} className="primary-habit-time-pill">
              {time}<button type="button" onClick={() => setTimes(values => values.filter(value => value !== time))} aria-label={'Удалить ' + time}><X size={13}/></button></span>)}
              <label className="primary-habit-time-add">
                <Plus size={15}/><span>Добавить</span>
                <input type="time" aria-label="Выбрать время нового напоминания" title="Выберите время"
                  onChange={event => {
                    const chosenTime = event.currentTarget.value;
                    if (chosenTime) setTimes(previous => normalizedTimes([...previous, chosenTime]));
                    event.currentTarget.value = '';
                  }}/>
              </label>
            </div>
          </div>
          <div className="primary-habit-settings-card">
            <span>Продолжительность привычки</span>
            <div className="primary-habit-duration-options" role="group" aria-label="Продолжительность привычки">
              {([['FOREVER','Постоянно'],['UNTIL_DATE','До даты'],['REPEAT_COUNT','По повторам']] as const)
                .map(([value,label]) => <button key={value} type="button" className={durationMode === value ? 'is-selected' : ''}
                  onClick={() => setDurationMode(value)} aria-pressed={durationMode === value}>{label}</button>)}
            </div>
            {durationMode === 'UNTIL_DATE' && <label className="primary-habit-field"><span>Дата окончания</span>
              <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)}/></label>}
            {durationMode === 'REPEAT_COUNT' && <label className="primary-habit-field"><span>Всего повторений</span>
              <input type="number" min={1} max={9999} value={repeatTarget}
                onChange={event => setRepeatTarget(Math.max(1, Math.min(9999, Number(event.target.value) || 1)))}/></label>}
            <p className="primary-habit-duration-summary">
              {durationMode === 'FOREVER' ? 'Без ограничения срока' :
                durationMode === 'UNTIL_DATE' ? (endDate ? 'До ' + new Date(endDate + 'T12:00:00').toLocaleDateString('ru-RU') : 'Укажите дату завершения') :
                'До ' + repeatTarget + ' выполнений'}
            </p>
          </div>
          <div className="primary-habit-settings-card">
            <label className="primary-habit-field"><span>Как часто повторяется</span>
              <select value={recurrenceType} onChange={event => setRecurrenceType(event.target.value as HabitRecurrenceType)}>
                <option value="DAILY">Каждый день</option><option value="WEEKDAYS">По конкретным дням</option>
                <option value="INTERVAL">Через интервал</option>
              </select>
            </label>
            {recurrenceType === 'WEEKDAYS' && <div className="primary-habit-weekdays">{weekdays.map(day =>
              <button key={day.value} type="button" className={weekdaysSelection.includes(day.value) ? 'is-selected' : ''}
                aria-pressed={weekdaysSelection.includes(day.value)}
                onClick={() => setWeekdaysSelection(current => current.includes(day.value)
                  ? current.filter(item => item !== day.value) : [...current, day.value])}>{day.label}</button>)}</div>}
            {recurrenceType === 'INTERVAL' && <label className="primary-habit-field"><span>Каждые N дней</span>
              <input type="number" min={1} max={365} value={intervalDays}
                onChange={event => setIntervalDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}/></label>}
            <p className="primary-habit-duration-summary">
              {recurrenceType === 'DAILY' ? 'Каждый день' :
                recurrenceType === 'INTERVAL' ? 'Каждые ' + intervalDays + ' дн.' :
                'Выбранные дни недели'}
            </p>
          </div>
          <footer className="primary-habit-dialog-footer">
            {habit && onDelete && <button type="button" className="primary-habit-danger" disabled={saving}
              onClick={() => void destructive(onDelete, 'Удалить привычку «' + habit.name + '»?')}><Trash2 size={15}/> Удалить</button>}
            {habit && onFinish && <button type="button" className="primary-habit-secondary" disabled={saving}
              onClick={() => void destructive(onFinish, 'Завершить привычку «' + habit.name + '»?')}><Check size={15}/> Завершить</button>}
            <span className="primary-habit-footer-spacer"/>
            <button type="button" className="primary-habit-secondary" disabled={saving} onClick={onClose}>Отмена</button>
            <button type="submit" className="primary-habit-save" disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}
              {habit ? 'Сохранить' : 'Создать привычку'}</button>
          </footer>
        </form>
      </section>
  );
  if (embedded) return panel;
  return createPortal(
    <div className="primary-habit-backdrop" onMouseDown={event => {
      if (event.currentTarget === event.target && !saving) onClose();
    }}>{panel}</div>,
    document.body
  );
}
