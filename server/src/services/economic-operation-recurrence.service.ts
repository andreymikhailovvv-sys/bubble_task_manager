import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { computeNextSlotRecurrenceDueDate, validateManualRecurrenceSchedule, makeManualRecurrenceSchedule, type RecurrenceSchedule } from './recurrence-slots.service.js';
import { saveEconomicProposals } from './economic-ai-proposals.service.js';
import { canonicalEconomicAction } from './economic-ai-action-validation.service.js';
import { telegramService } from './telegram.service.js';

/** Persist only normalized manual slots; absent means leave an existing schedule alone. */
export function operationRecurrenceData(input: unknown, now = new Date()): {
  recurrenceJson?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  nextRepeatAt?: Date | null;
} {
  if (input === undefined) return {};
  if (input === null) return { recurrenceJson: Prisma.DbNull, nextRepeatAt: null };
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректное расписание операции');
  const { freq, zone, slots } = validateManualRecurrenceSchedule(input as RecurrenceSchedule);
  const schedule = makeManualRecurrenceSchedule(freq, slots, zone);
  return { recurrenceJson: JSON.parse(JSON.stringify(schedule)) as Prisma.InputJsonValue,
    nextRepeatAt: computeNextSlotRecurrenceDueDate(schedule, now) };
}

let running = false;
/** One owner-bound pending chip shared by both chat surfaces. A conditional
 * claim and all persistent writes are in one transaction; no balance changes. */
export async function dispatchEconomicOperationRepeats(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let count = 0;
  try {
    const due = await prisma.economicOperation.findMany({
      where: { nextRepeatAt: { lte: now }, debtId: null, isAdjustment: false,
        kind: { in: ['INCOME','EXPENSE','TRANSFER'] } },
      orderBy: { nextRepeatAt: 'asc' }, take: 100,
      include: { user: { select: { telegramChatId: true } } }
    });
    for (const op of due) {
      if (!op.nextRepeatAt || !op.recurrenceJson) continue;
      const slot = op.nextRepeatAt;
      try {
        const next = computeNextSlotRecurrenceDueDate(op.recurrenceJson as RecurrenceSchedule, slot);
        const content = 'Повтор операции «' + op.title + '»';
        const amount = (op.amountMinor / 100n).toLocaleString('ru-RU') + ',' + String(op.amountMinor % 100n).padStart(2,'0') + ' ₽';
        const action = canonicalEconomicAction({ entity: 'operation', action: 'create', targetId: null,
          payload: { kind: op.kind, amountMinor: op.amountMinor.toString(), title: op.title, note: op.note,
            sourceAccountId: op.sourceAccountId, targetAccountId: op.targetAccountId, category: op.category,
            occurredAt: slot.toISOString(), positionsJson: op.positionsJson, calculation: op.calculation } });
        const eventKey = 'economic-repeat:' + op.id + ':' + slot.toISOString();
        const committed = await prisma.$transaction(async tx => {
          const claimed = await tx.economicOperation.updateMany({
            where: { id: op.id, userId: op.userId, nextRepeatAt: slot, updatedAt: op.updatedAt },
            data: { nextRepeatAt: next }
          });
          if (!claimed.count) return false;
          const msg = await tx.economicAssistantMessage.create({ data: { userId: op.userId, role: 'assistant', content } });
          const proposals = await saveEconomicProposals(tx, op.userId, msg.id, [{ action, before: null }]);
          await tx.generalAiMessage.create({ data: { userId: op.userId, role: 'assistant', content,
            creditsSpentMilli: 0, economicProposalIds: proposals.map(item => item.id) } });
          await tx.systemNotification.create({ data: { userId: op.userId, eventKey, content: content + '. ' + amount } });
          return true;
        });
        if (!committed) continue;
        count++;
        if (op.user.telegramChatId && telegramService.isEnabled()) {
          await telegramService.sendAdminBroadcast(op.user.telegramChatId, { text: content + '. Подробности в чипе.' });
        }
      } catch (cause) {
        console.error('[Economic] repeat dispatch failed', { operationId: op.id, cause });
      }
    }
    return count;
  } finally { running = false; }
}
