import type { CurrentUser } from '../lib/api';
export const PLAN_FEATURES = {"start":["Базовый месячный лимит ×1","Модель Luna","Запросы и управление задачами","Создание Word и Excel","Поиск в интернете"],"pro":["Месячный лимит ×2","Модели Luna, Terra","Все функции Старта","Создание изображений","Почтовый ИИ-ассистент","Живое общение с ИИ","Набор аксессуаров для Планика"],"max":["Месячный лимит ×4,33","Модели Luna, Terra, Sol, Astra","Все функции Про","Telegram ИИ-ассистент","Автомониторинг задач","Расширенные аксессуары Планика и Экономыча"]} as const;
export function SubscriptionLimitPanel({ limit }: { limit: CurrentUser['subscriptionLimit'] }) {
  if (!limit) return null;
  const left = Math.max(0, Math.min(100, 100 - limit.usedPercent));
  return <div className="subscription-limit-panel mt-3 rounded-2xl border border-slate-500/20 p-4">
    <div className="flex items-center justify-between gap-2 text-sm text-secondary"><strong>{limit.planName}</strong><span>Осталось {left}%</span></div>
    <div className="subscription-limit-track mt-3" role="progressbar" aria-label="Остаток лимита ИИ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}><span style={{width: left + '%'}}/></div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted"><span>Использовано {limit.usedPercent}%</span><span>До {new Date(limit.expiresAt).toLocaleDateString('ru-RU')}</span></div>
  </div>;
}
