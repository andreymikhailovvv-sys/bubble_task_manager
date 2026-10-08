export type TaskAiRecipientSelection = Record<string, string>;

const TASK_AI_RECIPIENT_STORAGE_PREFIX = 'btm:task-ai-recipient:v1';

const getStorageKey = (userId: string) => `${TASK_AI_RECIPIENT_STORAGE_PREFIX}:${userId}`;

export const loadTaskAiRecipientSelection = (userId: string): TaskAiRecipientSelection => {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([taskId, recipientId]) => taskId.trim().length > 0 && typeof recipientId === 'string' && recipientId.trim().length > 0)
        .map(([taskId, recipientId]) => [taskId, String(recipientId)])
    );
  } catch {
    return {};
  }
};

export const saveTaskAiRecipientSelection = (userId: string, selection: TaskAiRecipientSelection) => {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(selection));
  } catch {
    // Recipient persistence is a convenience feature. Sending must keep working
    // even when localStorage is unavailable (private mode/quota/browser policy).
  }
};
