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
