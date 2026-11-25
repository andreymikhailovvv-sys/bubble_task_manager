export const SUBSCRIPTION_PLANS = [
  { key: 'start', name: 'Старт', creditsAmount: 3000, price: 299, amountKopecks: 29_900 },
  { key: 'pro', name: 'Про', creditsAmount: 6000, price: 599, amountKopecks: 59_900 },
  { key: 'max', name: 'Максимум', creditsAmount: 13000, price: 1290, amountKopecks: 129_000 }
] as const;

export type SubscriptionPlanKey = typeof SUBSCRIPTION_PLANS[number]['key'];
export const getSubscriptionPlanByKey = (key: string) => SUBSCRIPTION_PLANS.find((plan) => plan.key === key);

/** A prepaid term lasts one UTC calendar month, clamping the day for shorter months. */
export function subscriptionEndDate(start: Date): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
}

export const subscriptionRank = (key: string) => SUBSCRIPTION_PLANS.findIndex(plan => plan.key === key) + 1;
export const SUBSCRIPTION_FEATURES = {
  start: ['Базовый месячный лимит (×1)', 'Модель Luna', 'Запросы и управление задачами', 'Создание Word и Excel', 'Поиск в интернете'],
  pro: ['Месячный лимит ×2', 'Модели Luna и Terra', 'Все функции Старта', 'Создание изображений', 'Почтовый ИИ-ассистент', 'Живое общение с ИИ', 'Образы «Полярник фокуса», «Зумер рабочего потока», «Расхититель задач» и «Хранитель бюджета» в веб-версии'],
  max: ['Месячный лимит ×4,33', 'Модели Luna, Terra, Sol; Astra (готовится)', 'Все функции Про', 'Telegram ИИ-ассистент', 'Автомониторинг задач', 'Образы «Астролог приоритетов», «Ниндзя дедлайнов» и «Космонавт продуктивности», «Король» в веб-версии']
} as const;
