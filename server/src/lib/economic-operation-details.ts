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
