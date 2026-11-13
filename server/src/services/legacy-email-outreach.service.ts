import { prisma } from '../db/prisma.js';
import { accountEmailService, accountMailConfigured, accountMailFailureDiagnostic } from './account-email.service.js';

/**
 * The migration seeds exactly one row per legacy user. All replicas race
 * through an atomic PENDING -> CLAIMED CAS. Claimed rows are never picked again,
 * including after crashes or uncertain SMTP acceptance, preventing duplicates.
 */
export async function dispatchOneLegacyVerificationReminder(): Promise<void> {
  if (!accountMailConfigured()) return;
  const job = await prisma.emailVerificationOutreach.findFirst({
    where: { status: 'PENDING' },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }]
  });
  if (!job) return;
  const claim = await prisma.emailVerificationOutreach.updateMany({
    where: { userId: job.userId, status: 'PENDING' },
    data: { status: 'CLAIMED', claimedAt: new Date() }
  });
  if (!claim.count) return;

  try {
    const sent = await accountEmailService.sendLegacyVerificationReminder(job.userId, job.email);
    await prisma.emailVerificationOutreach.update({
      where: { userId: job.userId },
      data: { status: sent, ...(sent === 'SENT' ? { sentAt: new Date() } : {}) }
    });
    console.info('[AuthEmail] legacy verification reminder processed status=' + sent);
  } catch (error) {
    // Do not resend automatically: the provider may have accepted a message
    // before disconnecting. Explicit admin inspection can handle failures.
    await prisma.emailVerificationOutreach.update({
      where: { userId: job.userId }, data: { status: 'FAILED' }
    }).catch(() => undefined);
    console.warn('[AuthEmail] legacy verification reminder delivery failed; ' + accountMailFailureDiagnostic(error));
  }
}
