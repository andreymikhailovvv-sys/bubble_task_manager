/** Financial values in Economic are integer kopecks, never floating-point ledger amounts. */
export function rublesToMinor(raw: string, allowNegative = false): string {
  const cleaned = raw.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const pattern = allowNegative ? /^-?\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}(?:\.\d{1,2})?$/;
  if (!pattern.test(cleaned)) throw new Error('Введите сумму в рублях, не более двух знаков после запятой');
  const negative = cleaned.startsWith('-');
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  return String(negative ? -result : result);
}
export function formatMinorRub(minor: string | number | bigint): string {
  const n = BigInt(minor);
  const absolute = n < 0n ? -n : n;
  return (n < 0n ? '−' : '') + (absolute / 100n).toLocaleString('ru-RU') +
    ',' + String(absolute % 100n).padStart(2, '0') + ' ₽';
}
export function minorToRublesInput(minor: string | number | bigint): string {
  const n = BigInt(minor);
  const absolute = n < 0n ? -n : n;
  return (n < 0n ? '-' : '') + String(absolute / 100n) +
    ',' + String(absolute % 100n).padStart(2, '0');
}
export function annuityEstimate(input: { principalMinor: string; annualRateBps: number; termMonths: number }) {
  const { principalMinor, annualRateBps, termMonths } = input;
  const principal = BigInt(principalMinor);
  if (principal <= 0n || !Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 600 ||
      !Number.isSafeInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000) {
    throw new RangeError('Некорректные параметры кредита');
  }
  const monthlyRate = annualRateBps / 10000 / 12;
  const rubles = Number(principal) / 100;
  const payment = monthlyRate
    ? rubles * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : rubles / termMonths;
  const monthlyMinor = BigInt(Math.round(payment * 100));
  // Banks typically adjust the final installment. Preserve at least the principal
  // in the estimated sum even if rounded installments fall short by kopecks.
  const totalMinor = monthlyMinor * BigInt(termMonths) > principal ? monthlyMinor * BigInt(termMonths) : principal;
  return { monthly: String(monthlyMinor), total: String(totalMinor), overpay: String(totalMinor - principal) };
}
