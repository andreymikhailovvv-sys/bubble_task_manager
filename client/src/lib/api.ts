import type { ChatAttachmentPayload, ChatMessage, ChatMode, Sphere, Task, TaskAttachment } from './types';

type ApiError = Error & { status?: number };
type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
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
};

export const api = {
  getMe: () => request<{ user: CurrentUser }>('/api/auth/me'),
  register: (payload: { login: string; password: string; name?: string }) => request<{ user: CurrentUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { login: string; password: string }) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  loginWithGoogle: () => {
    window.location.href = '/api/auth/google';
  },
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  getSpheres: () => request<Sphere[]>('/api/spheres'),
  createSphere: (payload: Partial<Sphere>) => request<Sphere>('/api/spheres', { method: 'POST', body: JSON.stringify(payload) }),
  updateSphere: (id: string, payload: Partial<Sphere>) => request<Sphere>(`/api/spheres/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSphere: (id: string) => request<{ ok: true }>(`/api/spheres/${id}`, { method: 'DELETE' }),
  getTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: Partial<Task>) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: Partial<Task>) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  getInsights: () => request<{ id: string; text: string }[]>('/api/dashboard/insights'),
  getTaskAttachments: (taskId: string) => request<TaskAttachment[]>(`/api/tasks/${taskId}/attachments`),
  getTaskAttachmentDownloadUrl: (taskId: string, attachmentId: string) => `/api/tasks/${taskId}/attachments/${attachmentId}/download`,
  createTaskAttachment: (taskId: string, payload: ChatAttachmentPayload) =>
    request<TaskAttachment>(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTaskAttachment: (taskId: string, attachmentId: string) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  askTaskAssistant: (taskId: string, payload: { question: string; history: ChatMessage[]; mode: ChatMode; attachments?: ChatAttachmentPayload[] }) =>
    request<{ answer: string; model: string }>(`/api/tasks/${taskId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  generateTaskSubtasks: (taskId: string) =>
    request<{ createdCount: number; model: string }>(`/api/tasks/${taskId}/ai-subtasks`, {
      method: 'POST'
    }),
  generateOverdueTaskNudge: (taskId: string) =>
    request<{ sent: boolean; answer?: string; model?: string }>(`/api/tasks/${taskId}/ai-overdue-nudge`, {
      method: 'POST'
    }),
  generateTaskFromAi: (payload: { prompt: string; sphereId?: string | null; attachments?: ChatAttachmentPayload[] }) =>
    request<{
      model: string;
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
      body: JSON.stringify(payload)
    }),
};
