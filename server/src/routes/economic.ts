import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { answerEconomicAssistant } from '../services/economic-assistant.service.js';
import { applyEconomicProposal, rejectEconomicProposal, undoEconomicProposal, editEconomicProposal, economicProposalOptions, getEconomicProposalView, economicProposalView } from '../services/economic-ai-proposals.service.js';
import { EconomicActionError } from '../services/economic-ai-action-validation.service.js';
import { economicAccountMovementMinor, recordEconomicBalanceAdjustment } from '../services/economic-account-balance.service.js';
import { telegramChatRequestIsSameOrigin } from '../lib/telegram-chat-origin.js';
import { debtOperationKind, debtOperationTitle, economicSourceDelta, ECONOMIC_DEBT_OPERATION_KINDS, type EconomicDebtDirection } from '../lib/economic-debt.js';

export const economicRouter = Router();
economicRouter.use(requireAuth);
economicRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !telegramChatRequestIsSameOrigin(req.get('origin'), req.get('host'), req.get('sec-fetch-site'))) {
    res.status(403).json({ error: 'Недопустимый источник запроса' }); return;
  }
  next();
});

const userId = (req: Request) => req.user!.id;
const text = (value: unknown, max = 120): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const optionalText = (value: unknown, max = 500): string | null | undefined =>
  value == null || value === '' ? null : text(value, max) ?? undefined;
const money = (value: unknown, allowZero = false, allowNegative = false): bigint | null => {
  if (typeof value !== 'string' || !/^-?\d{1,15}$/.test(value)) return null;
  const n = BigInt(value);
  return (!allowNegative && n < 0n) || (!allowZero && n === 0n) || n > 999999999999999n || n < -999999999999999n ? null : n;
};
const toDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.length > 40) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2200 ? date : null;
};
const error = (res: Response, message: string, status = 400) => res.status(status).json({ error: message });
const conflict = (cause: unknown, res: Response) => {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    error(res, 'Такое название уже используется', 409); return true;
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2003') {
    error(res, 'Нельзя удалить запись, пока с ней связаны операции', 409); return true;
  }
  return false;
};
const accountOut = (row: { openingBalanceMinor: bigint; creditLimitMinor: bigint | null; [key: string]: unknown }) =>
  ({ ...row, openingBalanceMinor: row.openingBalanceMinor.toString(), creditLimitMinor: row.creditLimitMinor?.toString() ?? null });
const operationOut = (row: { amountMinor: bigint; [key: string]: unknown }) =>
  ({ ...row, amountMinor: row.amountMinor.toString() });
const debtOut = (row: { amountMinor: bigint; paidMinor: bigint; [key: string]: unknown }) =>
  ({ ...row, amountMinor: row.amountMinor.toString(), paidMinor: row.paidMinor.toString() });
// Same rounded monthly-annuity convention as the client calculator.
function loanTotalMinor(principal: bigint, annualRateBps: number, termMonths: number): bigint {
  if (!Number.isSafeInteger(annualRateBps) || !Number.isSafeInteger(termMonths) ||
      annualRateBps < 0 || annualRateBps > 100000 || termMonths < 1 || termMonths > 600) return 0n;
  const monthlyRate = annualRateBps / 10000 / 12;
  const amount = Number(principal);
  const monthly = monthlyRate
    ? amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : amount / termMonths;
  const total = BigInt(Math.round(monthly)) * BigInt(termMonths);
  return total > principal ? total : principal;
}
const loanOut = (row: { principalMinor: bigint; paidMinor: bigint; monthlyPaymentOverrideMinor: bigint | null; [key: string]: unknown }) =>
  ({ ...row, principalMinor: row.principalMinor.toString(), paidMinor: row.paidMinor.toString(), monthlyPaymentOverrideMinor: row.monthlyPaymentOverrideMinor?.toString() ?? null });

async function ensureMain(user: string) {
  return prisma.economicAccount.upsert({
    where: { userId_name: { userId: user, name: 'Основной счёт' } },
    create: { userId: user, name: 'Основной счёт', isPrimary: true },
    update: {}
  });
}


// A debt is financed from the current primary account. Existing accounts are
// never renamed or recreated; only a completely empty ledger gets its default.
async function primaryAccountId(tx: Prisma.TransactionClient, owner: string) {
  const account = await tx.economicAccount.findFirst({
    where: { userId: owner }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { id: true }
  });
  if (account) return account.id;
  return (await tx.economicAccount.upsert({
    where: { userId_name: { userId: owner, name: 'Основной счёт' } },
    create: { userId: owner, name: 'Основной счёт', isPrimary: true }, update: {}
  })).id;
}

// Tiny auth/status endpoint: Economic does not need the planner's user bootstrap.
economicRouter.get('/session', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: userId(req) },
    select: { id: true, name: true, username: true, timeZone: true, telegramChatId: true }
  });
  if (!user) { error(res, 'Необходима авторизация', 401); return; }
  res.json({ user: {
    id: user.id, name: user.name, username: user.username, timeZone: user.timeZone,
    telegramLinked: Boolean(user.telegramChatId)
  } });
}));

economicRouter.get('/snapshot', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const existing = await prisma.economicAccount.findFirst({ where: { userId: owner }, select: { id: true } });
  if (!existing) await ensureMain(owner);
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const [accounts, sources, incoming, monthKinds, recent, categories, debts, loans, operationCount, messages] = await Promise.all([
    prisma.economicAccount.findMany({ where: { userId: owner }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] }),
    prisma.economicOperation.groupBy({ by: ['sourceAccountId', 'kind'], where: { userId: owner }, _sum: { amountMinor: true } }),
    prisma.economicOperation.groupBy({ by: ['targetAccountId'], where: { userId: owner, kind: 'TRANSFER', targetAccountId: { not: null } }, _sum: { amountMinor: true } }),
    prisma.economicOperation.groupBy({ by: ['kind'], where: { userId: owner, isAdjustment: false, kind: { in: ['INCOME', 'EXPENSE'] }, occurredAt: { gte: monthStart, lt: monthEnd } }, _sum: { amountMinor: true } }),
    prisma.economicOperation.findMany({ where: { userId: owner }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 8 }),
    prisma.economicCategory.findMany({ where: { userId: owner }, orderBy: { createdAt: 'asc' } }),
    prisma.economicDebt.findMany({ where: { userId: owner }, orderBy: [{ isClosed: 'asc' }, { createdAt: 'desc' }], take: 200 }),
    prisma.economicLoan.findMany({ where: { userId: owner }, orderBy: [{ isClosed: 'asc' }, { createdAt: 'desc' }], take: 200 }),
    prisma.economicOperation.count({ where: { userId: owner } }),
    prisma.economicAssistantMessage.findMany({ where: { userId: owner }, orderBy: [{ createdAt: 'desc' }, { role: 'asc' }, { id: 'desc' }], take: 24, include: { proposals: { orderBy: { createdAt: 'asc' } } } })
  ]);
  const balances = new Map(accounts.map(a => [a.id, a.openingBalanceMinor]));
  for (const group of sources) {
    const sum = group._sum.amountMinor ?? 0n;
    balances.set(group.sourceAccountId, (balances.get(group.sourceAccountId) ?? 0n) + economicSourceDelta(group.kind, sum));
  }
  for (const group of incoming) if (group.targetAccountId) {
    balances.set(group.targetAccountId, (balances.get(group.targetAccountId) ?? 0n) + (group._sum.amountMinor ?? 0n));
  }
  // A credit line is borrowed purchasing power, not an owned asset.
  const totalMinor = accounts.filter(a => a.accountType !== 'CREDIT_CARD')
    .reduce((sum, a) => sum + (balances.get(a.id) ?? 0n), 0n);
  const monthSum = (kind: string) => (monthKinds.find(row => row.kind === kind)?._sum.amountMinor ?? 0n).toString();
  res.json({
    accounts: accounts.map(a => ({ ...accountOut(a), balanceMinor: (balances.get(a.id) ?? 0n).toString() })),
    totals: { balanceMinor: totalMinor.toString(), monthIncomeMinor: monthSum('INCOME'), monthExpenseMinor: monthSum('EXPENSE'), operationCount },
    recent: recent.map(operationOut), categories, debts: debts.map(debtOut), loans: loans.map(loanOut),
    assistantMessages: messages.reverse().map(m => ({...m,proposals:m.proposals.map(economicProposalView)}))
  });
}));


/** Category drill-down shared by website, Telegram Mini App and native Android.
 * Uses raw minor units. Corrections, debt movements and transfers never inflate reports. */
economicRouter.get('/report', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const period = String(req.query.period ?? 'month');
  const offset = Number(req.query.offset ?? 0);
  if (!['week', 'month', 'year', 'all', 'custom'].includes(period) ||
      !Number.isInteger(offset) || offset < -120 || offset > 120) {
    error(res, 'Недопустимый период отчёта'); return;
  }
  const today = new Date(), year = today.getUTCFullYear(), month = today.getUTCMonth();
  let start: Date, end: Date;
  if (period === 'custom') {
    const first = String(req.query.start ?? ''), last = String(req.query.end ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last)) {
      error(res, 'Для произвольного периода укажите две даты'); return;
    }
    start = new Date(first + 'T00:00:00Z');
    end = new Date(last + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
        start.toISOString().slice(0,10) !== first ||
        end <= start || end.getTime() - start.getTime() > 3660 * 86400000) {
      error(res, 'Некорректный диапазон дат'); return;
    }
  } else if (period === 'all') {
    start = new Date('2000-01-01T00:00:00Z'); end = new Date('2200-01-01T00:00:00Z');
  } else if (period === 'year') {
    start = new Date(Date.UTC(year + offset, 0, 1));
    end = new Date(Date.UTC(year + offset + 1, 0, 1));
  } else if (period === 'month') {
    start = new Date(Date.UTC(year, month + offset, 1));
    end = new Date(Date.UTC(year, month + offset + 1, 1));
  } else {
    const monday = new Date(Date.UTC(year, month, today.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + offset * 7);
    start = monday; end = new Date(monday); end.setUTCDate(end.getUTCDate() + 7);
  }
  const groups = await prisma.economicOperation.groupBy({
    by: ['kind', 'category'],
    where: { userId: owner, isAdjustment: false,
      kind: { in: ['INCOME', 'EXPENSE'] }, occurredAt: { gte: start, lt: end } },
    _sum: { amountMinor: true }
  });
  function collect(kind: 'INCOME' | 'EXPENSE') {
    const categories = groups.filter(g => g.kind === kind).map(g => ({
      name: g.category?.trim() || 'Без категории', amountMinor: g._sum.amountMinor ?? 0n
    }));
    const combined = new Map<string, bigint>();
    for (const item of categories) combined.set(item.name, (combined.get(item.name) ?? 0n) + item.amountMinor);
    const ordered = [...combined.entries()].sort((a,b) => a[1] === b[1] ? a[0].localeCompare(b[0],'ru') : a[1] > b[1] ? -1 : 1);
    return { totalMinor: ordered.reduce((total, [,amount]) => total + amount, 0n).toString(),
      categories: ordered.map(([name,amount]) => ({ name, amountMinor: amount.toString() })) };
  }
  res.json({ period, offset, start: start.toISOString(), end: end.toISOString(),
    expense: collect('EXPENSE'), income: collect('INCOME') });
}));

economicRouter.post('/accounts', asyncHandler(async (req, res) => {
  const name = text(req.body?.name, 60);
  if (req.body?.balanceMinor !== undefined && req.body?.openingBalanceMinor !== undefined) {
    error(res, 'Передайте только текущий баланс'); return;
  }
  // Old clients may still send openingBalanceMinor; new clients use balanceMinor.
  const balance = money(req.body?.balanceMinor ?? req.body?.openingBalanceMinor ?? '0', true, true);
  const accountType = req.body?.accountType ?? 'STANDARD';
  const creditLimitMinor = accountType === 'CREDIT_CARD' ? money(req.body?.creditLimitMinor) : null;
  if (!name || balance === null || !['STANDARD','CREDIT_CARD'].includes(accountType) ||
      (accountType === 'CREDIT_CARD' && (creditLimitMinor === null || balance < 0n || balance > creditLimitMinor))) {
    error(res, 'Укажите название, тип, лимит и доступный остаток счёта'); return;
  }
  try {
    const account = await prisma.economicAccount.create({
      data: { userId: userId(req), name, openingBalanceMinor: balance, accountType, creditLimitMinor }
    });
    res.status(201).json({ account: accountOut(account) });
  } catch (cause) { if (!conflict(cause, res)) throw cause; }
}));
economicRouter.patch('/accounts/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  if (req.body?.balanceMinor !== undefined && req.body?.openingBalanceMinor !== undefined) {
    error(res, 'Передайте только текущий баланс'); return;
  }
  const desired = req.body?.balanceMinor === undefined ? undefined : money(req.body.balanceMinor, true, true);
  const legacy = req.body?.openingBalanceMinor === undefined ? undefined : money(req.body.openingBalanceMinor, true, true);
  if (desired === null || legacy === null) { error(res, 'Некорректный баланс'); return; }
  try {
    await prisma.$transaction(async tx => {
      const found = await tx.economicAccount.findFirst({ where: { id: req.params.id, userId: owner } });
      if (!found) throw new EconomicActionError('Счёт не найден',404);
      const name = req.body?.name === undefined ? found.name : text(req.body.name, 60);
      if (!name) throw new EconomicActionError('Некорректное название счёта');
      const accountType = req.body?.accountType ?? found.accountType;
      const creditLimitMinor = accountType === 'CREDIT_CARD'
        ? (req.body?.creditLimitMinor === undefined ? found.creditLimitMinor : money(req.body.creditLimitMinor))
        : null;
      if (!['STANDARD','CREDIT_CARD'].includes(accountType) ||
          (accountType === 'CREDIT_CARD' && (creditLimitMinor === null || creditLimitMinor <= 0n))) {
        throw new EconomicActionError('Для кредитной карты требуется положительный лимит');
      }
      if (accountType !== found.accountType) {
        const count = await tx.economicOperation.count({
          where: { userId: owner, OR: [{ sourceAccountId: found.id }, { targetAccountId: found.id }] }
        });
        if (count) throw new EconomicActionError('Тип счёта с операциями изменять нельзя',409);
      }
      const target = desired ?? (legacy === undefined ? undefined : legacy + await economicAccountMovementMinor(tx, owner, found.id));
      const current = found.openingBalanceMinor + await economicAccountMovementMinor(tx, owner, found.id);
      if (accountType === 'CREDIT_CARD' && (target ?? current) > creditLimitMinor!)
        throw new EconomicActionError('Доступный остаток превышает кредитный лимит');
      if (accountType === 'CREDIT_CARD' && (target ?? current) < 0n)
        throw new EconomicActionError('Доступный остаток не может быть отрицательным');
      if (req.body?.isPrimary === true && accountType === 'CREDIT_CARD')
        throw new EconomicActionError('Кредитная карта не может быть основным денежным счётом');
      if (req.body?.isPrimary === true)
        await tx.economicAccount.updateMany({ where: { userId: owner }, data: { isPrimary: false } });
      await tx.economicAccount.update({ where: { id: found.id, userId: owner },
        data: { name, accountType, creditLimitMinor, ...(req.body?.isPrimary === true ? { isPrimary: true } : {}) } });
      if (target !== undefined)
        await recordEconomicBalanceAdjustment(tx, owner, found.id, found.openingBalanceMinor, target);
    },{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json({ ok: true });
  } catch (cause) {
    if (cause instanceof EconomicActionError) { error(res,cause.message,cause.status); return; }
    if (!conflict(cause, res)) throw cause;
  }
}));
economicRouter.delete('/accounts/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const found = await prisma.economicAccount.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!found) { error(res, 'Счёт не найден', 404); return; }
  if (found.isPrimary) { error(res, 'Основной счёт удалить нельзя'); return; }
  const count = await prisma.economicOperation.count({ where: { userId: owner, OR: [{ sourceAccountId: found.id }, { targetAccountId: found.id }] } });
  const linkedDebts = await prisma.economicDebt.count({ where: { userId: owner, accountId: found.id } });
  if (count > 0 || linkedDebts > 0) { error(res, 'Сначала перенесите или удалите связанные операции', 409); return; }
  await prisma.economicAccount.deleteMany({ where: { id: found.id, userId: owner } });
  res.json({ ok: true });
}));

economicRouter.get('/operations', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const rawKind = String(req.query.kind ?? '');
  const kind = ['INCOME', 'EXPENSE', 'TRANSFER', ...ECONOMIC_DEBT_OPERATION_KINDS].includes(rawKind) ? rawKind : undefined;
  const debtKinds = rawKind === 'DEBTS' ? { in: [...ECONOMIC_DEBT_OPERATION_KINDS] } : undefined;
  const category = typeof req.query.category === 'string' && req.query.category.length <= 80 ? req.query.category : undefined;
  const accountId = typeof req.query.accountId === 'string' && req.query.accountId.length <= 120 ? req.query.accountId : undefined;
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length <= 120 ? req.query.cursor : undefined;
  const found = cursor ? await prisma.economicOperation.findFirst({ where: { id: cursor, userId: owner }, select: { id: true } }) : null;
  if (cursor && !found) { error(res, 'Неверный курсор', 400); return; }
  const rows = await prisma.economicOperation.findMany({
    where: { userId: owner, ...(kind ? { kind } : debtKinds ? { kind: debtKinds } : {}), ...(category ? { category } : {}),
      ...(accountId ? { OR: [{ sourceAccountId: accountId }, { targetAccountId: accountId }] } : {}) },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  res.json({ operations: rows.slice(0, 50).map(operationOut), nextCursor: rows.length > 50 ? rows[49].id : null });
}));
economicRouter.post('/operations', asyncHandler(async (req, res) => {
  const owner = userId(req), body = req.body ?? {};
  const kind = body.kind;
  const amountMinor = money(body.amountMinor), title = text(body.title, 160);
  const note = optionalText(body.note, 500);
  const occurredAt = body.occurredAt ? toDate(body.occurredAt) : new Date();
  if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(kind) || amountMinor === null || !title || note === undefined || !occurredAt) {
    error(res, 'Укажите тип, сумму, название и дату операции'); return;
  }
  const sourceAccountId = typeof body.sourceAccountId === 'string' ? body.sourceAccountId : '';
  const targetAccountId = kind === 'TRANSFER' && typeof body.targetAccountId === 'string' ? body.targetAccountId : null;
  if (targetAccountId && targetAccountId === sourceAccountId) { error(res, 'Нельзя переводить на тот же счёт'); return; }
  if (kind === 'TRANSFER' && !targetAccountId) { error(res, 'Укажите счёт получателя'); return; }
  const accountIds = [sourceAccountId, ...(targetAccountId ? [targetAccountId] : [])];
  const linked = await prisma.economicAccount.findMany({ where: { userId: owner, id: { in: accountIds } }, select: { id: true, currency: true } });
  if (linked.length !== accountIds.length || linked.some(a => a.currency !== 'RUB')) { error(res, 'Один из счетов не принадлежит пользователю'); return; }
  const category = kind === 'TRANSFER' ? null : optionalText(body.category, 80);
  if (category === undefined) { error(res, 'Некорректная категория'); return; }
  const operation = await prisma.economicOperation.create({
    data: { userId: owner, kind, amountMinor, sourceAccountId, targetAccountId, category, title, note, occurredAt }
  });
  res.status(201).json({ operation: operationOut(operation) });
}));
economicRouter.patch('/operations/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const found = await prisma.economicOperation.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!found) { error(res, 'Операция не найдена', 404); return; }
  if (found.debtId || found.isAdjustment) { error(res, 'Долговые и корректирующие операции нельзя редактировать напрямую', 409); return; }
  const body = { ...found, ...req.body };
  // Reuse POST-like validation without ever trusting client-supplied ownership.
  if (!['INCOME','EXPENSE','TRANSFER'].includes(body.kind)) { error(res,'Некорректный тип'); return; }
  const amountMinor = money(String(body.amountMinor));
  const title = text(body.title, 160), note = optionalText(body.note, 500);
  const category = body.kind === 'TRANSFER' ? null : optionalText(body.category, 80);
  const occurredAt = body.occurredAt instanceof Date ? body.occurredAt : toDate(body.occurredAt);
  const sourceAccountId = body.sourceAccountId, targetAccountId = body.kind === 'TRANSFER' ? body.targetAccountId : null;
  const ids = [sourceAccountId, ...(targetAccountId ? [targetAccountId] : [])];
  if (!amountMinor || !title || note === undefined || category === undefined || !occurredAt ||
      (body.kind === 'TRANSFER' && (!targetAccountId || sourceAccountId === targetAccountId))) {
    error(res, 'Некорректные данные операции'); return;
  }
  const count = await prisma.economicAccount.count({ where: { userId: owner, id: { in: ids } } });
  if (count !== ids.length) { error(res, 'Один из счетов не найден'); return; }
  await prisma.economicOperation.updateMany({ where: { id: found.id, userId: owner },
    data: { kind: body.kind, amountMinor, title, note, category, occurredAt, sourceAccountId, targetAccountId } });
  res.json({ ok: true });
}));
economicRouter.delete('/operations/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  // Linked debt entries can only be removed by deleting the debt itself;
  // otherwise the register and the account balance would disagree.
  const found = await prisma.economicOperation.findFirst({
    where: { id: req.params.id, userId: owner }, select: { id: true, debtId: true }
  });
  if (!found) { error(res, 'Операция не найдена', 404); return; }
  if (found.debtId) { error(res, 'Долговая операция удаляется вместе с долгом', 409); return; }
  await prisma.economicOperation.deleteMany({ where: { id: found.id, userId: owner, debtId: null } });
  res.json({ ok: true });
}));

economicRouter.post('/categories', asyncHandler(async (req, res) => {
  const name = text(req.body?.name, 60), kind = req.body?.kind;
  if (!name || !['INCOME', 'EXPENSE'].includes(kind)) { error(res, 'Некорректная категория'); return; }
  try {
    const category = await prisma.economicCategory.create({ data: { userId: userId(req), name, kind } });
    res.status(201).json({ category });
  } catch (cause) { if (!conflict(cause, res)) throw cause; }
}));
economicRouter.delete('/categories/:id', asyncHandler(async (req, res) => {
  const removed = await prisma.economicCategory.deleteMany({ where: { id: req.params.id, userId: userId(req) } });
  if (!removed.count) { error(res, 'Категория не найдена', 404); return; }
  res.json({ ok: true });
}));

// Only linked debt operations change balances. The amount repaid is posted as
// a partial settlement and never double-counted as earned income/expenses.
economicRouter.post('/debts', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const direction = req.body?.direction, counterparty = text(req.body?.counterparty, 100);
  const amountMinor = money(req.body?.amountMinor);
  const paidMinor = money(req.body?.paidMinor ?? '0', true);
  const note = optionalText(req.body?.note, 500);
  const dueAt = req.body?.dueAt ? toDate(req.body.dueAt) : null;
  const postedToAccount = req.body?.postedToAccount !== false;
  if (!['OWE', 'OWED_TO_ME'].includes(direction) || !counterparty || !amountMinor ||
      paidMinor === null || paidMinor > amountMinor || note === undefined ||
      (req.body?.dueAt && !dueAt) || (req.body?.postedToAccount !== undefined && typeof req.body.postedToAccount !== 'boolean')) {
    error(res, 'Укажите корректные данные долга и сумму погашения'); return;
  }
  const accountId = postedToAccount && typeof req.body?.accountId === 'string' ? req.body.accountId : null;
  if (accountId && !(await prisma.economicAccount.count({ where: { id: accountId, userId: owner } }))) {
    error(res, 'Счёт не найден'); return;
  }
  const created = await prisma.$transaction(async tx => {
    const selectedAccountId = postedToAccount ? (accountId || await primaryAccountId(tx, owner)) : null;
    const debt = await tx.economicDebt.create({
      data: {
        userId: owner, direction, counterparty, amountMinor, paidMinor, note, dueAt,
        postedToAccount, accountId: selectedAccountId, isClosed: paidMinor === amountMinor
      }
    });
    if (selectedAccountId) {
      await tx.economicOperation.create({
        data: {
          userId: owner, sourceAccountId: selectedAccountId, debtId: debt.id, debtPhase: 'FUNDING',
          kind: debtOperationKind(direction as EconomicDebtDirection, 'FUNDING'), amountMinor,
          title: debtOperationTitle(direction as EconomicDebtDirection, 'FUNDING', counterparty),
          category: 'Долги', occurredAt: debt.createdAt
        }
      });
      if (paidMinor > 0n) await tx.economicOperation.create({
        data: {
          userId: owner, sourceAccountId: selectedAccountId, debtId: debt.id, debtPhase: 'SETTLEMENT',
          kind: debtOperationKind(direction as EconomicDebtDirection, 'SETTLEMENT'), amountMinor: paidMinor,
          title: debtOperationTitle(direction as EconomicDebtDirection, 'SETTLEMENT', counterparty),
          category: 'Долги'
        }
      });
    }
    return debt;
  });
  res.status(201).json({ debt: debtOut(created) });
}));

economicRouter.patch('/debts/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const found = await prisma.economicDebt.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!found) { error(res, 'Долг не найден', 404); return; }
  const body = { ...found, ...req.body };
  const counterparty = text(body.counterparty, 100), amountMinor = money(String(body.amountMinor));
  const note = optionalText(body.note, 500);
  const dueAt = body.dueAt ? (body.dueAt instanceof Date ? body.dueAt : toDate(body.dueAt)) : null;
  const postedToAccount = body.postedToAccount;
  let paidMinor = money(String(body.paidMinor), true);
  if (!amountMinor || paidMinor === null || !['OWE','OWED_TO_ME'].includes(body.direction) ||
      !counterparty || note === undefined || (body.dueAt && !dueAt) ||
      typeof body.isClosed !== 'boolean' || typeof postedToAccount !== 'boolean') {
    error(res, 'Некорректные данные долга'); return;
  }
  // The old "mark as closed" action still means 100% repaid.
  if (body.isClosed && req.body?.paidMinor === undefined) paidMinor = amountMinor;
  if (paidMinor > amountMinor || (body.isClosed && paidMinor !== amountMinor)) {
    error(res, 'Погашение не может превышать сумму долга'); return;
  }
  const isClosed = paidMinor === amountMinor;
  const accountId = postedToAccount && typeof body.accountId === 'string' ? body.accountId : null;
  if (accountId && !(await prisma.economicAccount.count({ where: { id: accountId, userId: owner } }))) {
    error(res, 'Счёт не найден'); return;
  }
  await prisma.$transaction(async tx => {
    const selectedAccountId = postedToAccount ? (accountId || await primaryAccountId(tx, owner)) : null;
    await tx.economicDebt.updateMany({
      where: { id: found.id, userId: owner },
      data: {
        direction: body.direction, counterparty, amountMinor, paidMinor, note, dueAt,
        postedToAccount, accountId: selectedAccountId, isClosed
      }
    });
    if (!selectedAccountId) {
      await tx.economicOperation.deleteMany({ where: { userId: owner, debtId: found.id } });
      return;
    }
    const direction = body.direction as EconomicDebtDirection;
    const funding = await tx.economicOperation.findFirst({ where: { userId: owner, debtId: found.id, debtPhase: 'FUNDING' } });
    const fundingData = {
      sourceAccountId: selectedAccountId, kind: debtOperationKind(direction, 'FUNDING'),
      amountMinor, title: debtOperationTitle(direction, 'FUNDING', counterparty)
    };
    if (funding) await tx.economicOperation.update({ where: { id: funding.id }, data: fundingData });
    else await tx.economicOperation.create({
      data: { ...fundingData, userId: owner, debtId: found.id, debtPhase: 'FUNDING', category: 'Долги' }
    });
    const settlement = await tx.economicOperation.findFirst({ where: { userId: owner, debtId: found.id, debtPhase: 'SETTLEMENT' } });
    if (paidMinor > 0n) {
      const settlementData = {
        sourceAccountId: selectedAccountId, kind: debtOperationKind(direction, 'SETTLEMENT'),
        amountMinor: paidMinor, title: debtOperationTitle(direction, 'SETTLEMENT', counterparty)
      };
      if (settlement) await tx.economicOperation.update({ where: { id: settlement.id }, data: settlementData });
      else await tx.economicOperation.create({
        data: { ...settlementData, userId: owner, debtId: found.id, debtPhase: 'SETTLEMENT', category: 'Долги' }
      });
    } else if (settlement) {
      await tx.economicOperation.delete({ where: { id: settlement.id } });
    }
  });
  res.json({ ok: true });
}));

economicRouter.delete('/debts/:id', asyncHandler(async (req, res) => {
  // PostgreSQL cascade removes linked cash entries in the same transaction.
  // Balances are computed from the ledger, so this reverses the original
  // effect without introducing fake income/expense entries.
  const removed = await prisma.economicDebt.deleteMany({ where: { id: req.params.id, userId: userId(req) } });
  if (!removed.count) { error(res,'Долг не найден',404); return; }
  res.json({ ok: true });
}));

economicRouter.post('/loans', asyncHandler(async (req, res) => {
  const owner = userId(req), body = req.body ?? {};
  const name = text(body.name, 100), lender = optionalText(body.lender, 100);
  const principalMinor = money(body.principalMinor), paidMinor = money(body.paidMinor ?? '0', true);
  const monthlyPaymentOverrideMinor = body.monthlyPaymentOverrideMinor == null ? null : money(body.monthlyPaymentOverrideMinor);
  const annualRateBps = body.annualRateBps, termMonths = body.termMonths;
  const startDate = toDate(body.startDate);
  const paymentDate = body.paymentDate ? toDate(body.paymentDate) : null;
  const remindersEnabled = body.remindersEnabled === true;
  if (!name || lender === undefined || !principalMinor || paidMinor === null ||
      monthlyPaymentOverrideMinor === null && body.monthlyPaymentOverrideMinor != null ||
      !Number.isInteger(annualRateBps) || annualRateBps < 0 || annualRateBps > 100000 ||
      !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600 || !startDate ||
      paidMinor > loanTotalMinor(principalMinor, annualRateBps, termMonths) ||
      (body.paymentDate && !paymentDate) || (body.remindersEnabled !== undefined && typeof body.remindersEnabled !== 'boolean') ||
      (remindersEnabled && !paymentDate)) {
    error(res, 'Укажите корректные параметры кредита, сумму выплаты и дату напоминания'); return;
  }
  if (remindersEnabled && !(await prisma.user.count({ where: { id: owner, telegramChatId: { not: null } } }))) {
    error(res, 'Подключите Telegram-бот Планировыч AI для напоминаний'); return;
  }
  const loan = await prisma.economicLoan.create({
    data: {
      userId: owner, name, lender, principalMinor, paidMinor, monthlyPaymentOverrideMinor,
      annualRateBps, termMonths, startDate, paymentDate, remindersEnabled
    }
  });
  res.status(201).json({ loan: loanOut(loan) });
}));
economicRouter.patch('/loans/:id', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const found = await prisma.economicLoan.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!found) { error(res, 'Кредит не найден', 404); return; }
  const body = { ...found, ...req.body };
  const name = text(body.name, 100), lender = optionalText(body.lender, 100);
  const principalMinor = money(String(body.principalMinor)), paidMinor = money(String(body.paidMinor), true);
  const monthlyPaymentOverrideMinor = body.monthlyPaymentOverrideMinor == null ? null : money(String(body.monthlyPaymentOverrideMinor));
  const startDate = body.startDate instanceof Date ? body.startDate : toDate(body.startDate);
  const paymentDate = body.paymentDate ? (body.paymentDate instanceof Date ? body.paymentDate : toDate(body.paymentDate)) : null;
  if (!name || lender === undefined || !principalMinor || paidMinor === null ||
      (body.monthlyPaymentOverrideMinor != null && monthlyPaymentOverrideMinor === null) ||
      !Number.isInteger(body.annualRateBps) || body.annualRateBps < 0 || body.annualRateBps > 100000 ||
      !Number.isInteger(body.termMonths) || body.termMonths < 1 || body.termMonths > 600 ||
      paidMinor > loanTotalMinor(principalMinor, body.annualRateBps, body.termMonths) ||
      !startDate || (body.paymentDate && !paymentDate) || typeof body.remindersEnabled !== 'boolean' ||
      (body.remindersEnabled && !paymentDate) || typeof body.isClosed !== 'boolean') {
    error(res, 'Некорректные данные кредита'); return;
  }
  if (body.remindersEnabled && !(await prisma.user.count({ where: { id: owner, telegramChatId: { not: null } } }))) {
    error(res, 'Подключите Telegram-бот Планировыч AI для напоминаний'); return;
  }
  await prisma.economicLoan.updateMany({ where: { id: found.id, userId: owner },
    data: {
      name, lender, principalMinor, paidMinor, monthlyPaymentOverrideMinor, paymentDate,
      remindersEnabled: body.remindersEnabled, annualRateBps: body.annualRateBps, termMonths: body.termMonths,
      startDate, isClosed: body.isClosed
    } });
  res.json({ ok: true });
}));
economicRouter.delete('/loans/:id', asyncHandler(async (req, res) => {
  const removed = await prisma.economicLoan.deleteMany({ where: { id: req.params.id, userId: userId(req) } });
  if (!removed.count) { error(res,'Кредит не найден',404); return; }
  res.json({ ok: true });
}));

// AI actions are always persisted as owner-bound proposals; the model cannot
// call these endpoints without an authenticated, same-origin user session.
const proposalFailure = (res: Response, cause: unknown) => {
  if(cause instanceof EconomicActionError){error(res,cause.message,cause.status);return;}
  if(cause instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002','P2003','P2025','P2034'].includes(cause.code)){
    error(res,'Данные изменились или действие конфликтует с существующими записями. Обновите чат.',409);return;
  }
  console.error('[Economic] proposal operation failed',cause instanceof Error?cause.message:'unknown');
  error(res,'Не удалось изменить финансовые данные. Повторите попытку.',503);
};
economicRouter.get('/assistant/preferences',asyncHandler(async(req,res)=>{
  const row=await prisma.user.findUnique({where:{id:userId(req)},select:{economicAiAutoApply:true}});
  if(!row){error(res,'Пользователь не найден',404);return;}
  res.json({autoApply:row.economicAiAutoApply});
}));
economicRouter.put('/assistant/preferences',asyncHandler(async(req,res)=>{
  if(typeof req.body?.autoApply!=='boolean'){error(res,'Настройка должна быть включена или выключена');return;}
  const updated=await prisma.user.update({where:{id:userId(req)},
    data:{economicAiAutoApply:req.body.autoApply},select:{economicAiAutoApply:true}});
  res.json({autoApply:updated.economicAiAutoApply});
}));
economicRouter.get('/assistant/proposals/:id',asyncHandler(async(req,res)=>{
  try{res.json(await getEconomicProposalView(userId(req),req.params.id));}
  catch(cause){proposalFailure(res,cause);}
}));
economicRouter.get('/assistant/options',asyncHandler(async(req,res)=>{
  try{res.json(await economicProposalOptions(userId(req)));}
  catch(cause){proposalFailure(res,cause);}
}));
economicRouter.put('/assistant/proposals/:id',asyncHandler(async(req,res)=>{
  try{res.json(await editEconomicProposal(userId(req),req.params.id,req.body));}
  catch(cause){proposalFailure(res,cause);}
}));
economicRouter.post('/assistant/proposals/:id/approve',asyncHandler(async(req,res)=>{
  try{res.json(await applyEconomicProposal(userId(req),req.params.id));}
  catch(cause){proposalFailure(res,cause);}
}));
economicRouter.post('/assistant/proposals/:id/reject',asyncHandler(async(req,res)=>{
  try{res.json(await rejectEconomicProposal(userId(req),req.params.id));}
  catch(cause){proposalFailure(res,cause);}
}));
economicRouter.post('/assistant/proposals/:id/undo',asyncHandler(async(req,res)=>{
  try{res.json(await undoEconomicProposal(userId(req),req.params.id));}
  catch(cause){proposalFailure(res,cause);}
}));

// The assistant uses real billing and explicit model-proposed finance actions. Each provider call uses the same
// real token/markup wallet path as the Planner, including history retrieval.
const assistantCooldown = new Map<string, number>();
economicRouter.post('/assistant/chat', asyncHandler(async (req, res) => {
  const owner = userId(req);
  const questionValue = req.body?.question;
  const question = typeof questionValue === 'string' && questionValue.trim().length <= 2000
    ? questionValue.trim() : null;
  const rawFiles = req.body?.attachments;
  if (!question && (!Array.isArray(rawFiles) || rawFiles.length === 0)) {
    error(res, 'Введите вопрос или прикрепите файл (до 2000 символов)'); return;
  }
  if (!process.env.OPENAI_API_KEY) { error(res, 'ИИ-помощник временно не настроен', 503); return; }
  const now = Date.now();
  if (now - (assistantCooldown.get(owner) ?? 0) < 5000) { error(res, 'Повторите запрос через несколько секунд', 429); return; }
  assistantCooldown.set(owner, now);
  const streaming = req.get('accept')?.includes('text/event-stream') === true;
  const emit = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) res.write('event: ' + event + '\n' + 'data: ' + JSON.stringify(data) + '\n\n');
  };
  if (streaming) {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive'
    });
    res.flushHeaders();
  }
  try {
    const output = await answerEconomicAssistant({
      owner, question: question || 'Изучи приложенные документы и объясни основные факты.',
      attachments: rawFiles,
      onStatus: (stage) => { if (streaming) emit('status', { stage }); }
    });
    if (streaming) {
      emit('result', output); res.end();
    } else res.json(output);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Ошибка ИИ';
    console.error('[Economic] assistant request failed', {
      userId: owner, error: message.slice(0, 180)
    });
    const invalid = /вложен|файл|формат|размер|UTF-8|больше трёх/i.test(message);
    const insufficient = /Недостаточно.*кредит/i.test(message);
    const publicMessage = insufficient ? 'Недостаточно ИИ-кредитов'
      : invalid ? message
      : /пустой ответ|токенов|не настроен/i.test(message) ? message
      : 'Не удалось получить ответ Экономыча AI. Попробуйте ещё раз.';
    if (streaming) { emit('error', { error: publicMessage }); res.end(); }
    else error(res, publicMessage, insufficient ? 402 : invalid ? 400 : 503);
  }
}));
