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

export const api = {
  getMe: () => request<{ user: { id: string; email: string; name?: string | null; avatarUrl?: string | null } }>('/api/auth/me'),
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
