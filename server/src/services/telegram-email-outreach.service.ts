import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';

/**
 * One-off, migration-snapshotted notification for Telegram-linked accounts.
 *
 * The database CAS (PENDING -> CLAIMED) happens BEFORE contacting Telegram.
 * Thus two server instances cannot send the same message. CLAIMED/FAILED
 * rows are never automatically retried because network failures may occur
 * after Telegram has already accepted the message. This intentionally offers
 * at-most-once sending, not a guarantee of delivery.
 */
export async function dispatchOneTelegramEmailVerificationOutreach(): Promise<void> {
  if (!telegramService.isEnabled()) return;

  const job = await prisma.telegramEmailVerificationOutreach.findFirst({
    where: { status: 'PENDING' },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }]
  });
  if (!job) return;

  const claim = await prisma.telegramEmailVerificationOutreach.updateMany({
    where: { userId: job.userId, status: 'PENDING' },
    data: { status: 'CLAIMED', claimedAt: new Date() }
  });
  if (claim.count !== 1) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: job.userId },
      select: {
        telegramChatId: true,
        email: true,
        pendingEmail: true,
        emailVerifiedAt: true
      }
    });

    const stillNeedsVerification = Boolean(user &&
      (!user.emailVerifiedAt || user.pendingEmail?.trim()));
    // Binding may have been moved or revoked after the migration. Never send
    // an account-specific message to a stale Telegram chat ID.
    if (!user || !stillNeedsVerification || user.telegramChatId !== job.chatId ||
        !/^[1-9][0-9]{0,19}$/.test(job.chatId)) {
      await prisma.telegramEmailVerificationOutreach.update({
        where: { userId: job.userId }, data: { status: 'SKIPPED' }
      });
      console.info('[TelegramEmailOutreach] skipped stale/verified recipient');
      return;
    }

    const hasEmail = Boolean(user.pendingEmail?.trim() || user.email?.trim());
    const accepted = await telegramService.sendEmailVerificationOutreach(job.chatId, hasEmail);
    // A rejected API call is not retried automatically: the result may be
    // ambiguous if an upstream proxy disconnected after acceptance.
    await prisma.telegramEmailVerificationOutreach.update({
      where: { userId: job.userId },
      data: accepted
        ? { status: 'SENT', sentAt: new Date() }
        : { status: 'FAILED' }
    });
    console.info('[TelegramEmailOutreach] processed status=' + (accepted ? 'SENT' : 'FAILED'));
  } catch (error) {
    await prisma.telegramEmailVerificationOutreach.update({
      where: { userId: job.userId }, data: { status: 'FAILED' }
    }).catch(() => undefined);
    // Do not include chatId, mail address, recipient name, or raw Telegram payload.
    console.warn('[TelegramEmailOutreach] send attempt failed; type=' +
      (error instanceof Error && /^[A-Za-z]{1,50}$/.test(error.name)
        ? error.name : 'Unknown'));
  }
}
