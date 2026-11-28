import './PrimaryWorkspaceSidebar.css';
import type { CSSProperties } from 'react';
import type { CurrentUser, SubscriptionWindow } from '../lib/api';
export const PLAN_FEATURES = {"start":["Базовый месячный лимит ×1","Модель Luna","Запросы и управление задачами","Создание Word и Excel","Поиск в интернете"],"pro":["Месячный лимит ×2","Модели Luna, Terra","Все функции Старта","Создание изображений","Почтовый ИИ-ассистент","Живое общение с ИИ","Набор образов для Планика и Экономыча"],"max":["Месячный лимит ×4,33","Модели Luna, Terra, Sol; Astra (готовится)","Все функции Про","Telegram ИИ-ассистент","Автомониторинг задач","Расширенный набор образов для Планика и Экономыча"]} as const;

export function subscriptionDailyRemaining(limit: CurrentUser['subscriptionLimit']): number | undefined {
  if (!limit) return undefined;
  return Math.max(0, Math.min(100, limit.daily?.remainingPercent ?? 100 - limit.usedPercent));
}
export function SubscriptionDailyRing({ limit, compact = false }: { limit: CurrentUser['subscriptionLimit']; compact?: boolean }) {
  const remaining = subscriptionDailyRemaining(limit);
  return <span className={'subscription-daily-ring' + (compact ? ' subscription-daily-ring--compact' : '')}
    title={remaining === undefined ? 'Загрузка дневного лимита' : `Дневной лимит: осталось ${remaining}%`}
    aria-label={remaining === undefined ? 'Дневной лимит загружается' : `Осталось ${remaining}% дневного лимита`}>
    <span className="subscription-daily-ring__indicator" style={{ '--daily-remaining': `${remaining ?? 0}%` } as CSSProperties} aria-hidden="true"/>
    <span className="subscription-daily-ring__text"><span className="subscription-daily-ring__label">Лимит </span>{remaining === undefined ? '…' : remaining + '%'}</span>
  </span>;
}

function WindowProgress({ title, window }: { title: string; window: SubscriptionWindow }) {
  const left = Math.max(0, Math.min(100, window.remainingPercent));
  return <div className="mt-3">
    <div className="flex items-center justify-between gap-2 text-sm text-secondary"><strong>{title}</strong><span>Осталось {left}%</span></div>
    <div className="primary-widget-progress mt-2" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}>
      <span style={{ width: left + '%', background: 'var(--accent-strong)' }}/>
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
    {Math.min(limit.daily.remainingMilli,limit.weekly.remainingMilli) <= 0 && <p className="mt-3 text-sm text-secondary">Дорогие модели, веб-поиск и изображения недоступны до обновления лимита. Luna и базовые функции продолжают работать в пределах месячного баланса.</p>}
  </div>;
}
