import { prisma } from '../db/prisma.js';
import { sendAndroidPush } from './android-fcm.service.js';

let busy = false;

/**
 * Database-backed outbox: every existing SystemNotification producer participates,
 * including reminders, checkups, shared tasks, and monitoring. One process
 * claims an event atomically; stale claims recover after a server restart.
 */
export async function dispatchPendingAndroidPush(): Promise<void> {
  if (busy || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return;
  busy = true;
  try {
    const now = new Date();
    const staleClaim = new Date(now.getTime() - 2 * 60_000);
    const pending = await prisma.systemNotification.findMany({
      where: {
        pushDispatchedAt: null,
        pushNextAttemptAt: { lte: now },
        OR: [{ pushClaimedAt: null }, { pushClaimedAt: { lt: staleClaim } }]
      },
      orderBy: { createdAt: 'asc' },
      take: 25
    });
    for (const event of pending) {
      const claimedAt = new Date();
      const claimed = await prisma.systemNotification.updateMany({
        where: {
          id: event.id,
          pushDispatchedAt: null,
          pushNextAttemptAt: { lte: now },
          OR: [{ pushClaimedAt: null }, { pushClaimedAt: { lt: staleClaim } }]
        },
        data: { pushClaimedAt: claimedAt, pushAttempts: { increment: 1 } }
      });
      if (!claimed.count) continue;
      let retry = false;
      try {
        if (!event.readAt) {
          const devices = await prisma.androidPushDevice.findMany({
            where: {
              userId: event.userId,
              createdAt: { lte: event.createdAt },
              lastSeenAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60_000) }
            },
            select: { id: true, token: true }
          });
          for (const device of devices) {
            const result = await sendAndroidPush(device.token, event);
            if (result === 'invalid') {
              await prisma.androidPushDevice.deleteMany({
                where: { id: device.id, token: device.token }
              });
            } else if (result === 'retry') {
              retry = true;
            }
          }
        }
      } catch (error) {
        retry = true;
        console.warn('[AndroidPush] outbox error', {
          errorType: error instanceof Error ? error.name : 'unknown'
        });
      }
      if (retry) {
        const attempts = event.pushAttempts + 1;
        const waitSeconds = Math.min(900, 10 * Math.pow(2, Math.min(attempts, 6)));
        await prisma.systemNotification.updateMany({
          where: { id: event.id, pushClaimedAt: claimedAt, pushDispatchedAt: null },
          data: {
            pushClaimedAt: null,
            pushNextAttemptAt: new Date(Date.now() + waitSeconds * 1000)
          }
        });
      } else {
        await prisma.systemNotification.updateMany({
          where: { id: event.id, pushClaimedAt: claimedAt, pushDispatchedAt: null },
          data: { pushClaimedAt: null, pushDispatchedAt: new Date() }
        });
      }
    }
  } catch (error) {
    console.error('[AndroidPush] worker failure', {
      errorType: error instanceof Error ? error.name : 'unknown'
    });
  } finally {
    busy = false;
  }
}

export function startAndroidPushWorker(): void {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    console.info('[AndroidPush] Firebase credential not configured; outbox is dormant');
    return;
  }
  // This scans only the undelivered outbox. The server exclusively decides
  // when reminders become due; the phone never schedules local deadlines.
  const timer = setInterval(() => { void dispatchPendingAndroidPush(); }, 4_000);
  timer.unref();
  setTimeout(() => { void dispatchPendingAndroidPush(); }, 2_000).unref();
}
