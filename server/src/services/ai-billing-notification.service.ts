import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export function formatCreditsSpent(creditsSpentMilli: number): string {
  const rounded = Math.round(Math.abs(creditsSpentMilli) / 10) / 100;
  if (creditsSpentMilli > 0 && rounded === 0) return '<0,01 кредита';
  const value = rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  if (!Number.isInteger(rounded)) return `${value} кредита`;
  const integer = rounded;
  const suffix = integer !== null && integer % 10 === 1 && integer % 100 !== 11
    ? 'кредит'
    : integer !== null && [2, 3, 4].includes(integer % 10) && ![12, 13, 14].includes(integer % 100)
      ? 'кредита'
      : 'кредитов';
  return `${value} ${suffix}`;
}

export async function createAiBillingSystemNotification(input: {
  userId: string;
  taskId?: string | null;
  eventKey: string;
  content: (formattedCredits: string) => string;
  creditsSpentMilli?: number | null;
}) {
  if (!input.creditsSpentMilli || input.creditsSpentMilli <= 0) return;
  try {
    await prisma.systemNotification.create({
      data: {
        userId: input.userId,
        taskId: input.taskId ?? null,
        eventKey: input.eventKey,
        content: input.content(formatCreditsSpent(input.creditsSpentMilli))
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    console.error('[AI billing notification] insert failed', { eventKey: input.eventKey, error });
  }
}
