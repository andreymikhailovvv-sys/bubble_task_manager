import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { deductEfficiencyPenalty } from './efficiency-rating.service.js';

export const AI_CHAT_RATING_BONUS = 0.1;
const rounded = (value: number) => Number(Math.max(0, value).toFixed(6));

/** Exactly one bonus per successful human request, even when a response is replayed.
 * Use serializable isolation because another device may change the same buckets.
 */
export async function grantAiChatRequestRating(userId: string, requestKey: string) {
  if (!requestKey || requestKey.length > 190) throw new TypeError('Invalid AI rating request key');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.aiRequestRatingGrant.findUnique({
          where: { userId_requestKey: { userId, requestKey } }, select: { id: true }
        });
        if (existing) return false;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { efficiencyTaskScore: true, efficiencyHabitScore: true, efficiencyAiScore: true,
            efficiencyFocusScore: true, efficiencyLastActivityAt: true, timeZone: true }
        });
        if (!user) return false;
        const now = new Date();
        let scores = {
          task: rounded(user.efficiencyTaskScore), habit: rounded(user.efficiencyHabitScore),
          ai: rounded(user.efficiencyAiScore), focus: rounded(user.efficiencyFocusScore)
        };
        const fromMs = (user.efficiencyLastActivityAt ?? now).getTime();
        const hourMs = 60 * 60_000;
        const zone = user.timeZone || 'Europe/Moscow';
        const elapsedHours = Math.max(0, Math.floor((now.getTime() - fromMs) / hourMs) - 3);
        for (let i = 1; i <= elapsedHours; i++) {
          const at = fromMs + (i + 3) * hourMs;
          let hour: number;
          try {
            hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone,
              hour: '2-digit', hour12: false }).format(new Date(at))) % 24;
          } catch { hour = new Date(at).getUTCHours(); }
          scores = deductEfficiencyPenalty(scores, (hour < 8 ? 0.5 : 1) * 4);
        }
        const total = scores.task + scores.habit + scores.ai + scores.focus;
        const applied = rounded(Math.min(AI_CHAT_RATING_BONUS, Math.max(0, 100 - total)));
        scores.ai = rounded(scores.ai + applied);
        await tx.aiRequestRatingGrant.create({ data: { userId, requestKey } });
        await tx.user.update({ where: { id: userId }, data: {
          efficiencyTaskScore: scores.task, efficiencyHabitScore: scores.habit,
          efficiencyAiScore: scores.ai, efficiencyFocusScore: scores.focus,
          efficiencyScore: rounded(Math.min(100, total + applied)),
          efficiencyLastActivityAt: now
        } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') return false;
        if (error.code === 'P2034' && attempt < 3) continue;
      }
      throw error;
    }
  }
  return false;
}
