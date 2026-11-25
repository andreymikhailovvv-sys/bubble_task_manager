import './PrimaryWorkspaceSidebar.css';
import type { CurrentUser, SubscriptionWindow } from '../lib/api';
export const PLAN_FEATURES = {"start":["Базовый месячный лимит ×1","Модель Luna","Запросы и управление задачами","Создание Word и Excel","Поиск в интернете"],"pro":["Месячный лимит ×2","Модели Luna, Terra","Все функции Старта","Создание изображений","Почтовый ИИ-ассистент","Живое общение с ИИ","Образы «Полярник фокуса», «Зумер рабочего потока», «Расхититель задач» и «Хранитель бюджета» в веб-версии"],"max":["Месячный лимит ×4,33","Модели Luna, Terra, Sol; Astra (готовится)","Все функции Про","Telegram ИИ-ассистент","Автомониторинг задач","Образы «Астролог приоритетов», «Ниндзя дедлайнов» и «Космонавт продуктивности» в веб-версии"]} as const;

const remainingColor = (remaining: number) => remaining >= 70 ? '#36b982' : remaining >= 30 ? '#e6b84f' : '#e36a79';

export function SubscriptionDailyRing({ limit }: { limit: CurrentUser['subscriptionLimit'] }) {
  const remaining = limit?.daily?.remainingPercent;
  const percent = Math.max(0, Math.min(100, remaining ?? 0));
  return <span className="subscription-daily-ring" title={remaining === undefined ? 'Загрузка дневного лимита' : `Дневной лимит: осталось ${percent}%`}
    aria-label={remaining === undefined ? 'Дневной лимит загружается' : `Осталось ${percent}% дневного лимита`}>
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" opacity=".18" strokeWidth="3"/>
      <circle cx="12" cy="12" r="9" fill="none" stroke={remainingColor(percent)} strokeWidth="3" pathLength="100"
        strokeDasharray={`${percent} 100`} strokeLinecap="round" transform="rotate(-90 12 12)" opacity={percent > 0 ? 1 : 0}/>
    </svg>
    <small>{remaining === undefined ? '…' : percent + '%'}</small>
  </span>;
}

function WindowProgress({ title, window }: { title: string; window: SubscriptionWindow }) {
  const left = Math.max(0, Math.min(100, window.remainingPercent));
  return <div className="mt-3">
    <div className="flex items-center justify-between gap-2 text-sm text-secondary"><strong>{title}</strong><span>Осталось {left}%</span></div>
    <div className="primary-widget-progress mt-2" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}>
      <span style={{ width: left + '%', background: remainingColor(left) }}/>
    </div>
    <p className="mt-1 text-xs text-muted">Обновление: {new Date(window.resetsAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</p>
  </div>;
}

export function SubscriptionLimitPanel({ limit }: { limit: CurrentUser['subscriptionLimit'] }) {
  if (!limit) return null;
  // Older clients and cached account responses retain the original monthly field.
  if (!limit.daily || !limit.weekly) {
    const left = Math.max(0, Math.min(100, 100 - limit.usedPercent));
    return <div className="subscription-limit-panel mt-3 rounded-2xl border border-slate-500/20 p-4"><strong>{limit.planName}</strong>
      <div className="primary-widget-progress mt-3" role="progressbar" aria-label="Остаток лимита ИИ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}><span style={{width:left+'%'}}/></div>
      <p className="mt-2 text-xs text-muted">Осталось {left}%</p></div>;
  }
  return <div className="subscription-limit-panel mt-3 rounded-2xl border border-slate-500/20 p-4">
    <strong className="text-sm text-secondary">{limit.planName}</strong>
    <WindowProgress title="Дневной лимит" window={limit.daily}/>
    <WindowProgress title="Недельный лимит" window={limit.weekly}/>
  </div>;
}
