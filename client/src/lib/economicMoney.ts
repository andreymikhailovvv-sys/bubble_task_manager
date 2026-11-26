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
  return (n < 0n ? '-' : '') + groupMoneyInput(String(absolute / 100n)) +
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

/** Group each integer operand without changing decimals, operators or partially typed input. */
export function groupMoneyInput(value: string): string {
  return value.replace(/[\s\u00a0\u202f]/g, '').replace(/\d+(?:[,.]\d*)?/g, token => {
    const [whole, fraction] = token.split(/[,.]/);
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') +
      (fraction === undefined ? '' : token.includes(',') ? ',' + fraction : '.' + fraction);
  });
}
export function isMoneyExpression(value: string): boolean {
  return /[+*/:xXхХ×÷−-]/.test(value.trim().replace(/^[+-]/, ''));
}
/** Exact rational arithmetic; round only the final result to kopecks. No eval. */
export function calculateMoneyInput(value: string): string {
  if (!isMoneyExpression(value)) return rublesToMinor(value);
  const input = value.replace(/\s/g, '').replace(/,/g, '.').replace(/[xXхХ×]/g, '*').replace(/[:÷]/g, '/').replace(/−/g, '-');
  if (input.length > 240 || !/^\d{1,12}(?:\.\d{1,2})?(?:[+\-*/]\d{1,12}(?:\.\d{1,2})?)+$/.test(input))
    throw new Error('Завершите выражение калькулятора');
  const tokens = input.match(/\d+(?:\.\d+)?|[+\-*/]/g)!;
  type Fraction = [bigint, bigint];
  const literal = (s: string): Fraction => [BigInt(rublesToMinor(s)), 100n];
  const add = ([a,b]: Fraction, [c,d]: Fraction, sign: bigint): Fraction => [a*d+sign*c*b,b*d];
  let total: Fraction = [0n,1n], current = literal(tokens[0]), sign = 1n;
  for (let i=1; i<tokens.length; i+=2) {
    const op=tokens[i], [c,d]=literal(tokens[i+1]), [a,b]=current;
    if (op==='*') current=[a*c,b*d];
    else if (op==='/') {
      if (c===0n) throw new Error('Деление на ноль невозможно');
      current=[a*d,b*c];
    } else { total=add(total,current,sign); current=[c,d]; sign=op==='+'?1n:-1n; }
  }
  const [n,d]=add(total,current,sign);
  if(n<=0n) throw new Error('Сумма должна быть положительной');
  const result=(n*200n+d)/(2n*d);
  if(result<=0n||result>999999999999999n) throw new Error('Сумма вне допустимого диапазона');
  return result.toString();
}
export function moneyCalculationPreview(value: string): string | null {
  if(!isMoneyExpression(value)) return null;
  try { return '= ' + formatMinorRub(calculateMoneyInput(value)); }
  catch { return 'Введите корректное выражение'; }
}
export type EconomicPosition = {name: string; amountMinor: string};
export function readEconomicPositions(raw?: string | null): EconomicPosition[] {
  try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
