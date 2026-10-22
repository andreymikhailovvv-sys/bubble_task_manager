import { randomUUID } from 'node:crypto';
import { aiAssistantService } from './ai-assistant.service.js';
import { prepareTaskProposal, getTaskProposal } from './ai-task-proposal.service.js';
import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';

/**
 * Single delivery path for scheduled and on-demand AI checkups.
 *
 * On-demand calls do NOT inspect or mutate daily schedule settings or
 * lastMorningAiCheckupDate. Every explicit click can create a fresh paid
 * checkup with a new independent proposal. Only scheduled runs use Telegram.
 */
export async function createAiCheckup(input: {
  userId: string;
  requestId?: string;
  sendTelegram?: boolean;
}) {
  const requestId = input.requestId || 'daily-checkup:manual:' + randomUUID();
  const checkup = await aiAssistantService.generateDailyCheckup({ userId: input.userId });

  let proposalId: string | null = null;
  if (checkup.moves.length) {
    try {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: input.userId }, select: { timeZone: true }
      });
      const proposal = await prepareTaskProposal({
        userId: input.userId, requestId, source: 'daily_checkup',
        userTimeZone: user.timeZone || 'Europe/Moscow', autoApply: false,
        resolvedItemIds: checkup.moves.map(move => move.taskId),
        actions: checkup.moves.map(move => ({
          operation: 'reschedule', itemId: move.taskId, parentTaskId: null,
          title: null, description: null, dueDate: move.newDueAt,
          importance: null, urgency: null, notifyBeforeMinutes: null,
          sphereId: null, location: null
        }))
      });
      proposalId = proposal.id;
    } catch (error) {
      // A malformed/stale recommendation must not erase the paid AI report.
      console.warn('[AiCheckup] proposal unavailable; schedule unchanged', {
        userId: input.userId,
        reason: error instanceof Error ? error.message.slice(0, 140) : 'unknown'
      });
    }
  }

  // Persist first, before reporting success or attempting Telegram delivery.
  const stored = await aiAssistantService.appendGeneralDialogAssistantMessage({
    userId: input.userId, content: checkup.text,
    creditsSpentMilli: checkup.creditsSpentMilli,
    taskProposalId: proposalId
  });
  if (!stored) throw new Error('ИИ-чекап не удалось сохранить');

  // A failed Telegram send never makes an already-saved report disappear.
  if (input.sendTelegram) {
    try {
      await telegramService.notifyDailyAiCheckup({
        userId: input.userId, text: checkup.text, proposalId
      });
    } catch (error) {
      console.error('[AiCheckup] saved but Telegram delivery failed', {
        userId: input.userId, messageId: stored.id, error
      });
    }
  }
  console.info('[AiCheckup] generated and saved', {
    userId: input.userId, messageId: stored.id,
    proposalId, manual: !input.sendTelegram,
    creditsSpentMilli: checkup.creditsSpentMilli
  });

  return {
    message: {
      id: stored.id,
      createdAt: stored.createdAt.toISOString(),
      role: 'assistant' as const,
      content: stored.content,
      creditsSpentMilli: stored.creditsSpentMilli,
      ...(proposalId ? { taskProposal: await getTaskProposal(input.userId, proposalId) } : {})
    }
  };
}
