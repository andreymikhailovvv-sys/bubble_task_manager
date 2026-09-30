export function formatAiCreditsSpent(creditsSpentMilli?: number | null): string | null {
  if (!creditsSpentMilli || creditsSpentMilli <= 0) return null;
  const credits = creditsSpentMilli / 1000;
  if (credits < 0.1) return '<0,1 кредита';
  if (credits < 100) return `−${credits.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} кредита`;
  return `−${Math.round(credits).toLocaleString('ru-RU')} кредитов`;
}

export function formatAiCreditBalance(credits: number): string {
  return credits < 100
    ? credits.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
    : Math.round(credits).toLocaleString('ru-RU');
}
