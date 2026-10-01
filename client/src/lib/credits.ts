export function formatCreditsSpent(creditsSpentMilli: number): string {
  const roundedCredits = Math.round(Math.abs(creditsSpentMilli) / 10) / 100;
  if (roundedCredits === 0) return '<0,01 кредита';

  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(roundedCredits);
  if (!Number.isInteger(roundedCredits)) return `${formatted} кредита`;

  const modulo100 = roundedCredits % 100;
  const modulo10 = roundedCredits % 10;
  const noun = modulo100 >= 11 && modulo100 <= 14
    ? 'кредитов'
    : modulo10 === 1
      ? 'кредит'
      : modulo10 >= 2 && modulo10 <= 4
        ? 'кредита'
        : 'кредитов';
  return `${formatted} ${noun}`;
}
