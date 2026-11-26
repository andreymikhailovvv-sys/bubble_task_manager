import { useState } from 'react';
import type { PracticeKind } from '../lib/guidedTraining';
import { TRAINING_ANIMATIONS, TRAINING_SKINS } from '../lib/guidedTraining';
import type { PlanikMode } from './PlanikMascot';

type Mode = Exclude<PlanikMode, 'showcase'>;
type Props = {
  kind: PracticeKind; skin: string; onSkin: (skin: string) => void; onAnimation: (mode: Mode) => void;
  onReady: () => void; onNext: () => void;
};
const FOCUS_TASKS = ['Подготовить план проекта', 'Проверить материалы', 'Разобрать заметки'];
const textExercises = {
  quick: { placeholder: 'Например: Какие задачи у меня на сегодня?', button: 'Отправить учебный запрос', result: 'Запрос принят. В обычном чате я ответил бы на него с учётом твоих задач.' },
  recurrence: { placeholder: 'Каждый понедельник и среду в 12:00', button: 'Проверить расписание', result: 'Так задаётся повторение обычными словами. В настоящей задаче ИИ предложит расписание для подтверждения.' },
  optimize: { placeholder: 'Распредели задачи равномерно, не позже 18:00', button: 'Попробовать оптимизацию', result: 'Пожелание принято. В настоящем таймлайне ИИ предложит изменения, которые можно проверить.' }
};
export function TrainingPractice({ kind, skin, onSkin, onAnimation, onReady, onNext }: Props) {
  const [draft, setDraft] = useState(kind === 'telegram' ? 'Привет! Отправляю материалы по проекту.' : '');
  const [choice, setChoice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [changedSkin, setChangedSkin] = useState(false);
  const [played, setPlayed] = useState(false);
  const [message, setMessage] = useState('');
  const finish = (result: string) => { setMessage(result); setComplete(true); onReady(); };
  const example = kind === 'quick' || kind === 'recurrence' || kind === 'optimize' ? textExercises[kind] : null;
  return <div className="basic-planik-practice" aria-label="Учебное упражнение">
    <span className="basic-planik-practice-label">Учебный пример · без сохранения</span>
    {example && <><textarea aria-label="Учебный запрос" value={draft} onChange={e => setDraft(e.target.value)} placeholder={example.placeholder} rows={2} maxLength={400} disabled={complete}/>
      <button type="button" disabled={!draft.trim() || complete} onClick={() => finish(example.result)}>{example.button}</button></>}
    {kind === 'monitor' && <><div className="basic-planik-practice-options">{['Быстрая модель', 'Мощная модель'].map(item => <button key={item} type="button" aria-pressed={choice === item} onClick={() => setChoice(item)}>{item}</button>)}</div>
      <button type="button" disabled={!choice || complete} onClick={() => finish('Модель выбрана. Настоящий мониторинг не запущен.')}>Выбрать модель</button></>}
    {kind === 'checkup' && <><label>Время чекапа<input type="time" value={choice} onChange={e => setChoice(e.target.value)} /></label>
      <button type="button" disabled={!choice || complete} onClick={() => finish('Готово! Это учебное время, реальные уведомления не изменились.')}>Подтвердить время</button></>}
    {kind === 'focus' && <><div className="basic-planik-practice-options">{FOCUS_TASKS.map(item => <button key={item} type="button" aria-pressed={selected.includes(item)} onClick={() => setSelected(prev => prev.includes(item) ? prev.filter(value => value !== item) : [...prev, item])}>{selected.includes(item) ? '✓ ' : ''}{item}</button>)}</div>
      <button type="button" disabled={!selected.length || complete} onClick={() => finish('Задачи выбраны. В настоящем фокусе можно переключаться между ними.')}>Подтвердить задачи</button></>}
    {kind === 'focus-timer' && <><div className="basic-planik-practice-options">{['15', '25', '45', '60'].map(item => <button key={item} type="button" aria-pressed={choice === item} onClick={() => setChoice(item)}>{item} мин</button>)}</div>
      <button type="button" disabled={!choice || complete} onClick={() => finish('Длительность выбрана. Реальный таймер не запущен.')}>Установить время</button></>}
    {kind === 'telegram' && <><label>Получатель<input readOnly value="Учебный контакт"/></label><label>Текст сообщения<textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2}/></label>
      <button type="button" disabled={!draft.trim() || complete} onClick={() => finish('Подтверждение принято. Ни одно сообщение не отправлено.')}>Подтвердить пример</button></>}
    {kind === 'skins' && <>
      <label>Образ<select value={skin} onChange={e => { onSkin(e.target.value); setChangedSkin(true); setPlayed(false); setComplete(false); }}>
        {TRAINING_SKINS.map(item => <option key={item.id} value={item.id}>{item.name} · {item.rank === 0 ? 'Бесплатно' : item.rank === 2 ? 'Про' : 'Максимум'}</option>)}
      </select></label>
      <div className="basic-planik-practice-options">{TRAINING_ANIMATIONS.map(item => <button type="button" key={item.id} onClick={() => { onAnimation(item.id); setPlayed(true); if (changedSkin) { setComplete(true); onReady(); } }}>{item.name}</button>)}</div>
      <p className="basic-planik-hint">{!changedSkin ? 'Выбери другой образ.' : !played ? 'Теперь запусти любую анимацию.' : 'Отлично! Можно попробовать ещё.'}</p>
    </>}
    {message && <p className="basic-planik-notice" role="status">{message}</p>}
    {complete && <button type="button" className="basic-planik-practice-next" onClick={onNext}>Далее</button>}
  </div>;
}
