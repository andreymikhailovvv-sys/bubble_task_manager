/** Data-only Android FCM contract. Never create a second local deadline timer. */
export function buildAndroidPushData(event: {
  id: string; userId: string; content: string; taskId: string | null; eventKey: string; androidActions?: string;
}): Record<string, string> {
  const payload: Record<string, string> = {
    notificationId: event.id,
    userId: event.userId,
    // FCM data messages are limited to 4 KiB, including envelope metadata.
    content: [...event.content].slice(0, 1000).join(''),
    taskId: event.taskId ?? '',
    eventKey: event.eventKey.slice(0, 500),
    ...(event.androidActions ? { androidActions: event.androidActions } : {})
  };
  // FCM measures UTF-8 bytes including the metadata; trim only display text.
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3500 && payload.content.length) {
    payload.content = [...payload.content].slice(0, -32).join('');
  }
  return payload;
}

export function validateAndroidPushRegistration(value: unknown): value is {
  installationId: string; token: string;
} {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.installationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.installationId)
    && typeof v.token === 'string'
    && v.token.length >= 20 && v.token.length <= 4096
    && !/[\s\x00-\x1f]/.test(v.token);
}
