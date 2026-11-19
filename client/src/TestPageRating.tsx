import { BrainCircuit, CheckCircle2, Flame, RefreshCw, Sparkles, Star } from 'lucide-react';
import type { CurrentUser } from './lib/api';

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const format = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
  .format(Math.max(0, Number.isFinite(value) ? value : 0));

/** The rating is the *server-supplied* efficiency score, not task completion %. */
export function TestPageRating({ user, onRefresh }: { user: CurrentUser; onRefresh: () => void }) {
  const score = clamp(user.efficiencyScore ?? 0);
  const grade = score < 30 ? 'Средний' : score < 70 ? 'Хороший' : 'Отличный';
  const details = [
    { name: 'Задачи', score: user.efficiencyTaskScore ?? 0, Icon: CheckCircle2 },
    { name: 'Привычки', score: user.efficiencyHabitScore ?? 0, Icon: Flame },
    { name: 'Работа с ИИ', score: user.efficiencyAiScore ?? 0, Icon: BrainCircuit },
    { name: 'Концентрация', score: user.efficiencyFocusScore ?? 0, Icon: Sparkles }
  ];
  return <section className="tp-card tp-rating-card" aria-label="Рейтинг эффективности">
    <div className="tp-rating-title-row">
      <div className="tp-card-eyebrow"><Star size={17}/> Рейтинг эффективности</div>
      <button type="button" aria-label="Обновить рейтинг" title="Обновить рейтинг"
        className="tp-rating-refresh" onClick={onRefresh}><RefreshCw size={17}/></button>
    </div>
    <div className="tp-rating-content">
      <div className="tp-rating-summary">
        <div className="tp-rating-gauge" role="progressbar" aria-label="Рейтинг"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
          <svg viewBox="0 0 140 140" aria-hidden="true">
            <circle className="tp-rating-track" cx="70" cy="70" r="57"/>
            <circle className="tp-rating-fill" cx="70" cy="70" r="57"
              pathLength="100" strokeDasharray={`${score} 100`} transform="rotate(-90 70 70)"/>
          </svg>
          <div className="tp-rating-gauge-value"><strong>{format(score)}</strong><span>из 100</span></div>
        </div>
        <div><strong className="tp-rating-grade">{grade} рейтинг</strong>
          <p>Рейтинг растёт благодаря завершённым задачам, привычкам, работе с ИИ и концентрации.</p></div>
      </div>
      <div className="tp-rating-details">
        {details.map(({name,score:points,Icon})=><div key={name} className="tp-rating-detail">
          <div className="tp-rating-detail-label"><Icon size={16}/><span>{name}</span></div>
          <strong>+{format(points)}</strong>
        </div>)}
      </div>
    </div>
  </section>;
}
