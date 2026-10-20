/**
 * Browser delivery mirrors the existing persisted system-notification feed.
 * No separate notification producer, push subscription or additional AI call.
 * This only works while the website remains open in a background tab.
 */

export type BrowserSystemNotification = {
  id: string;
  content: string;
  readAt?: string | null;
};

const SEEN_LIMIT = 150;
const SEEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const memorySeen = new Set<string>();

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true
    && typeof Notification !== 'undefined';
}

export function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  return browserNotificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!browserNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** A notification is an OS message ONLY when the Planivorych tab is hidden. */
export function shouldShowBrowserNotification(
  notification: BrowserSystemNotification,
  input: { enabled: boolean; pageHidden: boolean; permission: NotificationPermission | 'unsupported' }
): boolean {
  return input.enabled && input.pageHidden && input.permission === 'granted'
    && notification.readAt == null && Boolean(notification.id?.trim()) && Boolean(notification.content?.trim());
}

const storageKey = (userId: string) => 'btm:browser-system-notifications:seen:' + userId;

function claimNotification(userId: string, id: string): boolean {
  const key = storageKey(userId);
  const memoryKey = userId + ':' + id;
  if (memorySeen.has(memoryKey)) return false;
  const now = Date.now();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]') as unknown;
    const existing: Array<[string, number]> = Array.isArray(saved)
      ? saved.filter((row): row is [string, number] => Array.isArray(row) &&
          typeof row[0] === 'string' && typeof row[1] === 'number' &&
          now - row[1] < SEEN_TTL_MS && row[1] <= now)
      : [];
    if (existing.some(([seenId]) => seenId === id)) {
      memorySeen.add(memoryKey);
      return false;
    }
    const next = [...existing, [id, now] as [string, number]].slice(-SEEN_LIMIT);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Incognito/storage disabled: retain at least this tab's in-memory dedupe.
  }
  memorySeen.add(memoryKey);
  return true;
}

export async function showBrowserSystemNotification(
  userId: string,
  notification: BrowserSystemNotification,
  onClick: () => void
): Promise<boolean> {
  if (!shouldShowBrowserNotification(notification, {
    enabled: true,
    pageHidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    permission: browserNotificationPermission()
  })) return false;

  const deliver = (): boolean => {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden' ||
        browserNotificationPermission() !== 'granted') return false;
    if (!claimNotification(userId, notification.id)) return false;
    try {
      const instance = new Notification('Планировыч', {
        body: notification.content,
        tag: 'planirovych-system-' + notification.id
      });
      instance.onclick = () => {
        instance.close();
        window.focus();
        onClick();
      };
      return true;
    } catch {
      // Notification constructor can be restricted by browser/OS policy.
      return false;
    }
  };

  // Web Locks serializes claims across different tabs; localStorage remembers
  // deliveries over reloads. Unsupported browsers use the local fallback.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    try {
      return await navigator.locks.request('planirovych-system-notifications-' + userId, () => deliver());
    } catch {
      return false;
    }
  }
  return deliver();
}
