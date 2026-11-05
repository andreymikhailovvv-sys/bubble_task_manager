import type { PrismaClient } from '@prisma/client';

// Existing eventKey is unique in PostgreSQL. Reading the already-created keys
// avoids a stream of duplicate INSERTs on every reminder poll. Keep the unique
// constraint/P2002 handling: another server replica can win the race.
type NotificationStore = Pick<PrismaClient, 'systemNotification'>;
const MAX_EVENT_KEYS_PER_QUERY = 400;

export async function findExistingSystemNotificationKeys(
  db: NotificationStore,
  eventKeys: readonly string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const uniqueKeys = [...new Set(eventKeys)];
  for (let offset = 0; offset < uniqueKeys.length; offset += MAX_EVENT_KEYS_PER_QUERY) {
    const rows = await db.systemNotification.findMany({
      where: { eventKey: { in: uniqueKeys.slice(offset, offset + MAX_EVENT_KEYS_PER_QUERY) } },
      select: { eventKey: true }
    });
    for (const row of rows) found.add(row.eventKey);
  }
  return found;
}

export async function createSystemNotificationUnlessExists(
  db: NotificationStore,
  alreadyCreated: Set<string>,
  event: { userId: string; taskId?: string | null; eventKey: string; content: string }
): Promise<void> {
  if (alreadyCreated.has(event.eventKey)) return;
  try {
    await db.systemNotification.create({ data: event });
  } catch (error) {
    // Multiple server replicas may try to create the same notification at once.
    // Preserve the pre-existing at-most-once behavior of the eventKey index.
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) {
      throw error;
    }
  }
  alreadyCreated.add(event.eventKey);
}

export function taskNotificationTiming(
  dueAtMs: number,
  nowMs: number,
  notifyBeforeMinutes: number,
  maxWindowMinutes: number
): { isShining: boolean; notificationKind: 'overdue' | 'upcoming' | null; diffMs: number } {
  const diffMs = dueAtMs - nowMs;
  const notifyWindowMs = Math.min(notifyBeforeMinutes, maxWindowMinutes) * 60_000;
  const isShining = notifyBeforeMinutes === 0
    ? diffMs <= 0
    : diffMs > 0 && diffMs <= notifyWindowMs;
  return {
    diffMs,
    isShining,
    notificationKind: diffMs <= 0 ? 'overdue' : isShining ? 'upcoming' : null
  };
}

export function taskSystemNotificationEventKey(
  taskId: string,
  dueDateKey: string,
  recipientUserId: string,
  sharedRoot: boolean,
  notificationKind: 'overdue' | 'upcoming'
): string {
  return sharedRoot
    ? taskId + ':' + recipientUserId + ':' + dueDateKey + ':' + notificationKind
    : taskId + ':' + dueDateKey + ':' + notificationKind;
}
