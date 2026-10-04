export const CREDIT_PACKS = [
  { key: 'credit_start', name: 'Старт', creditsAmount: 1800, price: 199, amountKopecks: 19_900 },
  { key: 'credit_pro', name: 'Про', creditsAmount: 6200, price: 690, amountKopecks: 69_000 },
  { key: 'credit_max', name: 'Макс', creditsAmount: 14000, price: 1490, amountKopecks: 149_000 }
] as const;

export type CreditPackKey = typeof CREDIT_PACKS[number]['key'];

export const getCreditPackByKey = (key: string) => CREDIT_PACKS.find((pack) => pack.key === key);
