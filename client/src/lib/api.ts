import type { AiChatModel, ChatAttachmentPayload, ChatMessage, ChatMode, Habit, Sphere, Task, TaskAttachment, WebCitation, WebSource } from './types';

type ApiError = Error & { status?: number };
type UnauthorizedHandler = () => void;
export type AiBilling = { mode: 'dynamic' | 'legacy'; creditsSpentMilli: number };
export type AiChatProgressStatus = 'analyzing_request' | 'using_chat_history' | 'searching_tasks' | 'listing_tasks' | 'reading_task' | 'checking_sectors' | 'analyzing_retrieved_context' | 'applying_changes' | 'reading_attachment' | 'searching_web' | 'analyzing_web_results' | 'forming_answer';
export type TaskAiProgressStatus = 'analyzing_request' | 'using_chat_history' | 'searching_subtasks' | 'analyzing_subtasks' | 'reading_subtask' | 'searching_files' | 'reading_file' | 'analyzing_retrieved_context' | 'forming_answer' | 'applying_changes';
export type TaskAssistantResult = { answer: string; model: string; actionReports?: string[]; billing?: AiBilling };
type TaskAiStreamEvent = { type: 'status'; status: TaskAiProgressStatus } | { type: 'result'; result: TaskAssistantResult } | { type: 'error'; message: string } | { type: 'ping' };

let unauthorizedHandler: UnauthorizedHandler | null = null;
const USER_TIMEZONE_STORAGE_KEY = 'btm:user-timezone';
export const INSUFFICIENT_AI_CREDITS_MESSAGE = 'Системное сообщение: у пользователя недостаточно кредитов для использования ИИ-функции.';
const DEFAULT_TIMEZONE = 'Europe/Moscow';

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function resolveUserTimeZone(): string {
  const saved = typeof window !== 'undefined' ? localStorage.getItem(USER_TIMEZONE_STORAGE_KEY) : null;
  if (saved?.trim()) return saved.trim();
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected?.trim()) return detected.trim();
  } catch {
    // ignore timezone detection failures
  }
  return DEFAULT_TIMEZONE;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json() as { error?: unknown; message?: unknown };
        const candidate = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : null;
        if (candidate?.trim()) {
          errorMessage = candidate.trim() === 'Недостаточно AI кредитов' ? INSUFFICIENT_AI_CREDITS_MESSAGE : candidate.trim();
        }
      } else {
        const payload = await response.text();
        const looksLikeHtml = /<\s*(?:!doctype\s+html|html|head|body)\b/i.test(payload);
        if (payload.trim() && !looksLikeHtml) {
          errorMessage = payload.trim().slice(0, 500);
        } else if (response.status >= 500) {
          errorMessage = 'Сервис временно недоступен. Попробуйте ещё раз';
        }
      }
    } catch {
      // ignore response parsing errors
    }

    const error = new Error(errorMessage) as ApiError;
    error.status = response.status;
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw error;
  }

  return response.json();
}

export async function readTaskAssistantNdjson(stream: ReadableStream<Uint8Array>, onStatus?: (status: TaskAiProgressStatus) => void): Promise<TaskAssistantResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: TaskAssistantResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as TaskAiStreamEvent;
    if (event.type === 'status') onStatus?.(event.status);
    else if (event.type === 'result') result = event.result;
    else if (event.type === 'error') throw new Error(event.message);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffer);
  if (!result) throw new Error('Сервер не вернул результат чата ИИ');
  return result;
}

async function askTaskAssistantStreaming(taskId: string, payload: { question: string; userMessage?: string; model?: AiChatModel; mode?: ChatMode; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean; interactionContext?: 'chat' | 'focus' | 'smart_postpone'; clientSurface?: 'web' | 'miniapp' }, options?: { onStatus?: (status: TaskAiProgressStatus) => void }): Promise<TaskAssistantResult> {
  const response = await fetch(`/api/tasks/${taskId}/ai-chat`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() }) });
  if (response.status === 401) unauthorizedHandler?.();
  if (!response.body) throw new Error(response.ok ? 'Поток ответа чата ИИ недоступен' : `HTTP ${response.status}`);
  try {
    return await readTaskAssistantNdjson(response.body, options?.onStatus);
  } catch (error) {
    if (!response.ok && error instanceof SyntaxError) throw new Error(`HTTP ${response.status}`);
    throw error;
  }
}

export type AiChatResult = { answer: string; model: string; taskDataChanged: boolean; actionReports?: string[]; undoOperations?: Array<{ taskId: string; previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' } }>; webSearchUsed: boolean; webSources?: WebSource[]; webCitations?: WebCitation[]; billing?: AiBilling };
export async function readAiChatNdjson(stream: ReadableStream<Uint8Array>, onStatus?: (status: AiChatProgressStatus) => void): Promise<AiChatResult> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let result: AiChatResult | null = null;
  const consume = (line: string) => { if (!line.trim()) return; const event = JSON.parse(line) as { type: string; status?: AiChatProgressStatus; result?: AiChatResult; message?: string }; if (event.type === 'status' && event.status) onStatus?.(event.status); else if (event.type === 'result' && event.result) result = event.result; else if (event.type === 'error') throw new Error(event.message || 'Ошибка чата ИИ'); };
  while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; lines.forEach(consume); if (done) break; }
  consume(buffer); if (!result) throw new Error('Сервер не вернул результат чата ИИ'); return result;
}
async function askAiChatStreaming(payload: { question: string; history: ChatMessage[]; model?: AiChatModel; projectTitle?: string; chatTitle?: string; projectId?: string; chatId?: string; clientSurface?: 'web' | 'miniapp'; attachments?: ChatAttachmentPayload[] }, options?: { onStatus?: (status: AiChatProgressStatus) => void }) {
  const response = await fetch('/api/ai-chat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() }) });
  if (response.status === 401) unauthorizedHandler?.(); if (!response.body) throw new Error(`HTTP ${response.status}`); return readAiChatNdjson(response.body, options?.onStatus);
}

export type CurrentUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
  aiCredits?: number;
  aiCreditsMilli?: number;
  aiCreditsPeriod?: string;
  aiEfficiencyCreditsSpent?: number;
  aiEfficiencyCreditsPeriod?: string;
  timeZone?: string | null;
  morningAiCheckupEnabled?: boolean;
  morningAiCheckupTime?: string;
  efficiencyResetAt?: string;
  efficiencyScore?: number;
  efficiencyTaskScore?: number;
  efficiencyHabitScore?: number;
  efficiencyAiScore?: number;
  efficiencyFocusScore?: number;
  efficiencyLastActivityAt?: string | Date | null;
  completedLessonIds?: string[];
  hasPassword?: boolean;
};
export type SubscriptionLinks = { start: string; pro: string; max: string };
export type CreditPackKey = 'credit_start' | 'credit_pro' | 'credit_max';
export type CreditPack = { key: CreditPackKey; name: string; creditsAmount: number; price: number; paymentUrl: string; isActive: boolean };
export type CreditPackLinks = Record<CreditPackKey, string>;

type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  aiCredits: number;
  aiCreditsPeriod: string;
  createdAt: string;
};

export const api = {
  getMe: () => request<{ user: CurrentUser }>('/api/auth/me'),
  getAiChatProjects: <T>() => request<{ projects: T[] | null }>('/api/ai-chat/projects'),
  getSystemNotifications: () => request<{ notifications: Array<{ id: string; taskId?: string | null; content: string; readAt?: string | null; createdAt: string }>; unreadCount: number }>('/api/system-notifications'),
  markSystemNotificationsRead: () => request<{ ok: true }>('/api/system-notifications/read', { method: 'POST' }),
  saveAiChatProjects: <T>(projects: T[]) => request<{ projects: T[] }>('/api/ai-chat/projects', {
    method: 'PUT',
    body: JSON.stringify({ projects })
  }),
  updateUserSettings: (payload: { timeZone?: string; morningAiCheckupEnabled?: boolean; morningAiCheckupTime?: string }) =>
    request<{ user: CurrentUser }>('/api/user/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  register: (payload: { login: string; password: string; name?: string; consentAccepted: boolean }) => request<{ user: CurrentUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { login: string; password: string }) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  updateProfile: (payload: { name: string; email: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: CurrentUser }>('/api/user/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  loginTelegramMiniApp: (payload: { initData: string }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-miniapp', { method: 'POST', body: JSON.stringify(payload) }),
  loginTelegramWeb: (payload: { initData: string; login: string; password: string }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-web-login', { method: 'POST', body: JSON.stringify(payload) }),
  registerTelegramWeb: (payload: { initData: string; login: string; password: string; name: string; consentAccepted: boolean }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-web-register', { method: 'POST', body: JSON.stringify(payload) }),
  logMiniAppClientEvent: (payload: { event: string; data?: Record<string, unknown> }) =>
    request<{ ok: true }>('/api/miniapp/client-log', { method: 'POST', body: JSON.stringify(payload) }),
  loginWithGoogle: () => {
    window.location.href = '/api/auth/google';
  },
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  deleteAccount: () => request<{ ok: true }>('/api/user/account', { method: 'DELETE' }),
  createTelegramLinkToken: () =>
    request<{ deepLinkUrl: string; expiresInSeconds: number }>('/api/telegram/link-token', { method: 'POST' }),
  getSpheres: () => request<Sphere[]>('/api/spheres'),
  createSphere: (payload: Partial<Sphere>) => request<Sphere>('/api/spheres', { method: 'POST', body: JSON.stringify(payload) }),
  updateSphere: (id: string, payload: Partial<Sphere>) => request<Sphere>(`/api/spheres/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSphere: (id: string) => request<{ ok: true }>(`/api/spheres/${id}`, { method: 'DELETE' }),
  getTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: Partial<Task>) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: Partial<Task>) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  createTaskCalendarIcsLink: (id: string, payload: { startAt: string; durationMinutes: 30 | 60 | 90 | 120; reminderMinutes: 10 | 30 | 60 | null }) =>
    request<{ url: string }>(`/api/tasks/${id}/calendar/ics-link`, { method: 'POST', body: JSON.stringify(payload) }),
  recordEfficiencyEvent: (payload: { delta: number; bucket: 'task' | 'habit' | 'ai' | 'focus' }) =>
    request<Pick<CurrentUser, 'efficiencyScore' | 'efficiencyTaskScore' | 'efficiencyHabitScore' | 'efficiencyAiScore' | 'efficiencyFocusScore' | 'efficiencyLastActivityAt'>>('/api/efficiency/events', { method: 'POST', body: JSON.stringify(payload) }),
  completeTrainingLesson: (lessonId: string) =>
    request<{ awarded: boolean; reward: number; user: CurrentUser }>(`/api/training/lessons/${lessonId}/complete`, { method: 'POST' }),
  getHabits: () => request<Habit[]>('/api/habits'),
  createHabit: (payload: Partial<Habit>) => request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(payload) }),
  updateHabit: (id: string, payload: Partial<Habit>) => request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  completeHabit: (id: string, payload: { dateKey: string; amount?: number; completedAt?: string }) =>
    request<Habit>(`/api/habits/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),
  uncompleteHabit: (id: string, payload: { dateKey: string; amount?: number }) =>
    request<Habit>(`/api/habits/${id}/uncomplete`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteHabit: (id: string) => request<{ ok: true }>(`/api/habits/${id}`, { method: 'DELETE' }),
  getInsights: () => request<{ id: string; text: string }[]>('/api/dashboard/insights'),
  getTaskAttachments: (taskId: string) => request<TaskAttachment[]>(`/api/tasks/${taskId}/attachments`),
  getTaskAttachmentDownloadUrl: (taskId: string, attachmentId: string) => `/api/tasks/${taskId}/attachments/${attachmentId}/download`,
  createTaskAttachmentDownloadLink: (taskId: string, attachmentId: string) =>
    request<{ url: string; fileName: string }>(`/api/tasks/${taskId}/attachments/${attachmentId}/download-link`, { method: 'POST' }),
  createTaskAttachment: (taskId: string, payload: ChatAttachmentPayload) =>
    request<TaskAttachment>(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTaskAttachment: (taskId: string, attachmentId: string) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  getTaskAssistantHistory: (taskId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/tasks/${taskId}/ai-chat?userTimeZone=${encodeURIComponent(resolveUserTimeZone())}`),
  askTaskAssistant: (taskId: string, payload: { question: string; userMessage?: string; model?: AiChatModel; mode?: ChatMode; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean; interactionContext?: 'chat' | 'focus' | 'smart_postpone'; clientSurface?: 'web' | 'miniapp' }) =>
    request<TaskAssistantResult>(`/api/tasks/${taskId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  askTaskAssistantStreaming,
  appendTaskAssistantMessages: (taskId: string, payload: { messages: ChatMessage[] }) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/ai-chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  generateTaskSubtasks: (taskId: string, payload?: { note?: string }) =>
    request<{ createdCount: number; model: string; billing?: AiBilling }>(`/api/tasks/${taskId}/ai-subtasks`, {
      method: 'POST',
      body: JSON.stringify({ ...(payload ?? {}), userTimeZone: resolveUserTimeZone() })
    }),
  generateOverdueTaskNudge: (taskId: string) =>
    request<{ sent: boolean; answer?: string; model?: string }>(`/api/tasks/${taskId}/ai-overdue-nudge`, {
      method: 'POST',
      body: JSON.stringify({ userTimeZone: resolveUserTimeZone() })
    }),
  generateTaskFromAi: (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments?: ChatAttachmentPayload[] }) =>
    request<{
      model: string;
      suggestedSphereId: string | null;
      task: {
        title: string;
        description: string;
        dueDate: string | null;
        importance: number;
        urgency: number;
        notifyBeforeMinutes: number | null;
        subtasks: Array<{ title: string; description: string; dueDate: string | null }>;
      };
      firstAssistantMessage: string;
      billing?: AiBilling;
    }>('/api/tasks/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  askAiChat: (payload: { question: string; history: ChatMessage[]; model?: AiChatModel; projectTitle?: string; chatTitle?: string; projectId?: string; chatId?: string; clientSurface?: 'web' | 'miniapp'; attachments?: ChatAttachmentPayload[] }) =>
    request<AiChatResult>('/api/ai-chat', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  askAiChatStreaming,
  getGeneralAssistantHistory: () =>
    request<{ messages: ChatMessage[] }>(`/api/ai-general-chat?userTimeZone=${encodeURIComponent(resolveUserTimeZone())}`),
  askGeneralAssistant: (payload: { question: string }) =>
    request<{
      answer: string;
      model: string;
      actionReports: string[];
      undoOperations: Array<{
        taskId: string;
        previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
      }>;
      billing?: AiBilling;
    }>('/api/ai-general-chat', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  parseRecurrence: (payload: { text: string; taskId?: string }) =>
    request<{ summary: string; schedule: { rrule: string; timezone: string; until: string | null }; model: string; nextDueDate: string | null; billing?: AiBilling }>('/api/ai/parse-recurrence', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  undoGeneralAssistantAction: (payload: {
    operations: Array<{
      taskId: string;
      previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
    }>;
  }) =>
    request<{ ok: true }>('/api/ai-general-chat/undo', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  optimizeTimeline: (payload: { scope: 'day' | 'week' | 'month'; periodStartIso: string; periodEndIso: string; userNote?: string }) =>
    request<{ model: string; summary: string; plan: Array<{ taskId: string; dueDate: string | null }>; billing?: AiBilling }>('/api/timeline/ai-optimize', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  applyTimelineOptimization: (payload: { plan: Array<{ taskId: string; dueDate: string | null }> }) =>
    request<{ ok: true }>('/api/timeline/ai-optimize/apply', { method: 'POST', body: JSON.stringify(payload) }),
  postponeOverdueWithAi: () =>
    request<{ ok: true; model: string; summary: string; updatedTaskIds: string[]; billing?: AiBilling }>('/api/timeline/overdue-postpone-ai', { method: 'POST' }),

  reportClientError: (payload: {
    source: 'error-boundary' | 'window-error' | 'unhandledrejection' | 'timeline-render';
    message: string;
    stack?: string;
    details?: string;
    url?: string;
  }) =>
    request<{ ok: true }>('/api/client-errors', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getSubscriptionLinks: () => request<{ links: SubscriptionLinks }>('/api/subscription-links'),
  getCreditPacks: () => request<{ packs: CreditPack[] }>('/api/credit-packs'),
  adminGetUsers: (payload: { password: string }) =>
    request<{ users: AdminUser[] }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminSaveSubscriptionLinks: (payload: { password: string; links: SubscriptionLinks }) =>
    request<{ links: SubscriptionLinks }>('/api/admin/subscription-links', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminSaveCreditPackLinks: (payload: { password: string; links: CreditPackLinks }) =>
    request<{ links: CreditPackLinks }>('/api/admin/credit-packs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminAddCredits: (payload: { password: string; userId: string; creditsToAdd: number }) =>
    request<{ user: { id: string; aiCredits: number; aiCreditsMilli: number; aiCreditsPeriod: string } }>(`/api/admin/users/${payload.userId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ password: payload.password, creditsToAdd: payload.creditsToAdd })
    })
};
