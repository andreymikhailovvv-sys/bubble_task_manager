import type { ChatMessage, ChatMode, Sphere, Task } from './types';

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
    const error = new Error(`HTTP ${response.status}`) as ApiError;
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

  askTaskAssistant: (taskId: string, payload: { question: string; history: ChatMessage[]; mode: ChatMode }) =>
    request<{ answer: string; model: string }>(`/api/tasks/${taskId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
};
