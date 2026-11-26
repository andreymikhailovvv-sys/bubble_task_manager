/** Operation details are metadata only: ledger amounts remain integer kopecks. */
export type EconomicPosition = { name: string; amountMinor: string };

export function normalizeEconomicPositions(raw: unknown): string {
  if (raw == null) return '[]';
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 24000) throw new Error('Слишком много позиций');
    try { value = JSON.parse(raw); } catch { throw new Error('Некорректные позиции'); }
  }
  if (!Array.isArray(value) || value.length > 100) throw new Error('Не более 100 позиций');
  return JSON.stringify(value.map((item: unknown): EconomicPosition => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Некорректная позиция');
    const { name, amountMinor } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 160 || /[\u0000-\u001f\u007f]/.test(name) ||
        typeof amountMinor !== 'string' || !/^-?\d{1,15}$/.test(amountMinor)) throw new Error('Укажите название и сумму позиции');
    return { name: name.trim(), amountMinor: BigInt(amountMinor).toString() };
  }));
}

export function rublesToMinor(raw: string, allowNegative = false): string {
  const cleaned = raw.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  const pattern = allowNegative ? /^-?\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}(?:\.\d{1,2})?$/;
  if (!pattern.test(cleaned)) throw new Error('Введите сумму в рублях, не более двух знаков после запятой');
  const negative = cleaned.startsWith('-');
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  return String(negative ? -result : result);
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

export function normalizeEconomicCalculation(raw: unknown, amountMinor: bigint): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 240 || !isMoneyExpression(raw) || BigInt(calculateMoneyInput(raw)) !== amountMinor)
    throw new Error('Калькуляция не совпадает с суммой операции');
  return raw.trim();
}
