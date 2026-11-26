export type EconomicDebtDirection = 'OWE' | 'OWED_TO_ME';
export type EconomicDebtPhase = 'FUNDING' | 'SETTLEMENT';

// Debt principal is a cashflow, but never earned income or consumption.
export const ECONOMIC_DEBT_OPERATION_KINDS = [
  'DEBT_BORROWED', 'DEBT_LENT', 'DEBT_REPAID', 'DEBT_RETURNED'
] as const;

export function debtOperationKind(direction: EconomicDebtDirection, phase: EconomicDebtPhase) {
  if (phase === 'FUNDING') return direction === 'OWE' ? 'DEBT_BORROWED' : 'DEBT_LENT';
  return direction === 'OWE' ? 'DEBT_REPAID' : 'DEBT_RETURNED';
}

export function debtOperationTitle(direction: EconomicDebtDirection, phase: EconomicDebtPhase, counterparty: string) {
  if (phase === 'FUNDING') return direction === 'OWE'
    ? `Получено в долг: ${counterparty}` : `Выдано в долг: ${counterparty}`;
  return direction === 'OWE' ? `Возврат долга: ${counterparty}` : `Возврат от: ${counterparty}`;
}

const ACCOUNT_CREDITS = new Set<string>(['INCOME', 'DEBT_BORROWED', 'DEBT_RETURNED']);

/** Signed change to the source account, expressed in integer kopecks. */
export function economicSourceDelta(kind: string, amountMinor: bigint): bigint {
  return ACCOUNT_CREDITS.has(kind) ? amountMinor : -amountMinor;
}

/** Totals over grouped ledger rows, never over a paginated client list. */
export function economicOperationTotals(groups:ReadonlyArray<{kind:string;_sum:{amountMinor:bigint|null}}>){
  let received=0n,spent=0n;
  for(const group of groups){
    if(group.kind==='TRANSFER')continue;
    const delta=economicSourceDelta(group.kind,group._sum.amountMinor??0n);
    if(delta>0n)received+=delta;else spent-=delta;
  }
  return {receivedMinor:received.toString(),spentMinor:spent.toString(),netMinor:(received-spent).toString()};
}
