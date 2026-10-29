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
  instructions?: string;
}) {
  const requestId = input.requestId || 'daily-checkup:manual:' + randomUUID();
  const checkup = await aiAssistantService.generateDailyCheckup({ userId: input.userId, instructions: input.instructions });

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

  // Never present AI-recommended changes as though they can be applied when
  // a server-side ownership/snapshot error prevented creation of the chip.
  const reportText = checkup.moves.length && !proposalId
    ? checkup.text + '\n\n⚠️ Не удалось показать карточку предложенных изменений. Ничего не изменено.'
    : proposalId
      ? checkup.text + '\n\n📌 Я предложил изменения в расписании. Они собраны в карточке ниже: проверьте их и выберите, применять ли.'
      : checkup.text;

  // Persist first, before reporting success or attempting Telegram delivery.
  const stored = await aiAssistantService.appendGeneralDialogAssistantMessage({
    userId: input.userId, content: reportText,
    creditsSpentMilli: checkup.creditsSpentMilli,
    taskProposalId: proposalId
  });
  if (!stored) throw new Error('ИИ-чекап не удалось сохранить');

  // A failed Telegram send never makes an already-saved report disappear.
  if (input.sendTelegram) {
    // Scheduled reports were only announced in Telegram. The same immutable
    // event must now reach Android and browser notification consumers.
    await prisma.systemNotification.create({
      data: {
        userId: input.userId,
        eventKey: 'ai-checkup:' + stored.id,
        content: '🤖 Новый ИИ-чекап готов. Откройте «Быстрые запросы», чтобы прочитать отчёт.'
      }
    }).catch((error: unknown) => {
      if (!(typeof error === 'object' && error !== null &&
        'code' in error && error.code === 'P2002')) throw error;
    });
    try {
      await telegramService.notifyDailyAiCheckup({
        userId: input.userId, text: reportText, proposalId
      });
    } catch (error) {
      console.error('[AiCheckup] saved but Telegram delivery failed', {
        userId: input.userId, messageId: stored.id, error
      });
    }
  }
  console.info('[AiCheckup] generated and saved', {
    userId: input.userId, messageId: stored.id,
    proposalId, proposedActions: checkup.moves.length,
    manual: !input.sendTelegram, creditsSpentMilli: checkup.creditsSpentMilli
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
