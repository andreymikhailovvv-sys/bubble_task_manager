import type { ChatAttachmentPayload, ChatMessage, ChatMode, Habit, Sphere, Task, TaskAttachment } from './types';

type ApiError = Error & { status?: number };
type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
const USER_TIMEZONE_STORAGE_KEY = 'btm:user-timezone';
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
          errorMessage = candidate.trim();
        }
      } else {
        const payload = await response.text();
        if (payload.trim()) {
          errorMessage = payload.trim().slice(0, 500);
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

export type CurrentUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
  aiCredits?: number;
  aiCreditsPeriod?: string;
  timeZone?: string | null;
  morningAiCheckupEnabled?: boolean;
  morningAiCheckupTime?: string;
  efficiencyResetAt?: string;
  efficiencyScore?: number;
};
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
  updateUserSettings: (payload: { timeZone?: string; morningAiCheckupEnabled?: boolean; morningAiCheckupTime?: string }) =>
    request<{ user: CurrentUser }>('/api/user/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  register: (payload: { login: string; password: string; name?: string }) => request<{ user: CurrentUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { login: string; password: string }) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  loginTelegramMiniApp: (payload: { initData: string }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-miniapp', { method: 'POST', body: JSON.stringify(payload) }),
  loginWithGoogle: () => {
    window.location.href = '/api/auth/google';
  },
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
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
  getHabits: () => request<Habit[]>('/api/habits'),
  createHabit: (payload: Partial<Habit>) => request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(payload) }),
  updateHabit: (id: string, payload: Partial<Habit>) => request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  completeHabit: (id: string, payload: { dateKey: string; amount?: number; completedAt?: string }) =>
    request<Habit>(`/api/habits/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteHabit: (id: string) => request<{ ok: true }>(`/api/habits/${id}`, { method: 'DELETE' }),
  getInsights: () => request<{ id: string; text: string }[]>('/api/dashboard/insights'),
  getTaskAttachments: (taskId: string) => request<TaskAttachment[]>(`/api/tasks/${taskId}/attachments`),
  getTaskAttachmentDownloadUrl: (taskId: string, attachmentId: string) => `/api/tasks/${taskId}/attachments/${attachmentId}/download`,
  createTaskAttachment: (taskId: string, payload: ChatAttachmentPayload) =>
    request<TaskAttachment>(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTaskAttachment: (taskId: string, attachmentId: string) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  getTaskAssistantHistory: (taskId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/tasks/${taskId}/ai-chat?userTimeZone=${encodeURIComponent(resolveUserTimeZone())}`),
  askTaskAssistant: (taskId: string, payload: { question: string; userMessage?: string; mode: ChatMode; attachments?: ChatAttachmentPayload[] }) =>
    request<{ answer: string; model: string; actionReports?: string[] }>(`/api/tasks/${taskId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  appendTaskAssistantMessages: (taskId: string, payload: { messages: ChatMessage[] }) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/ai-chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  generateTaskSubtasks: (taskId: string, payload?: { note?: string }) =>
    request<{ createdCount: number; model: string }>(`/api/tasks/${taskId}/ai-subtasks`, {
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
    }>('/api/tasks/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
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
    }>('/api/ai-general-chat', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  parseRecurrence: (payload: { text: string }) =>
    request<{ summary: string; schedule: { rrule: string; timezone: string; until: string | null }; model: string; nextDueDate: string | null }>('/api/ai/parse-recurrence', {
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
    request<{ model: string; summary: string; plan: Array<{ taskId: string; dueDate: string | null }> }>('/api/timeline/ai-optimize', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  applyTimelineOptimization: (payload: { plan: Array<{ taskId: string; dueDate: string | null }> }) =>
    request<{ ok: true }>('/api/timeline/ai-optimize/apply', { method: 'POST', body: JSON.stringify(payload) }),
  postponeOverdueWithAi: () =>
    request<{ ok: true; model: string; summary: string; updatedTaskIds: string[] }>('/api/timeline/overdue-postpone-ai', { method: 'POST' }),

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
  adminGetUsers: (payload: { password: string }) =>
    request<{ users: AdminUser[] }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminAddCredits: (payload: { password: string; userId: string; creditsToAdd: number }) =>
    request<{ user: { id: string; aiCredits: number; aiCreditsPeriod: string } }>(`/api/admin/users/${payload.userId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ password: payload.password, creditsToAdd: payload.creditsToAdd })
    })
};
