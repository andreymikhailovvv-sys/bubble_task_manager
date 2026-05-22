export type Sphere = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  sphereId?: string | null;
  parentTaskId?: string | null;
  notifyBeforeMinutes?: number | null;
  isRecurring?: boolean;
  recurrenceText?: string | null;
  recurrenceJson?: Record<string, unknown> | null;
  recurrenceSummary?: string | null;
  recurrenceUntil?: string | null;
  aiNotificationsEnabled?: boolean;
  importance: number;
  urgency: number;
  priorityScore: number;
  dueDate?: string | null;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  createdAt?: string;
  updatedAt?: string;
};

export type Insight = {
  id: string;
  text: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatMode = 'fast' | 'smart';

export type ChatAttachmentPayload = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};
