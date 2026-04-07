export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

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
  importance: number;
  urgency: number;
  priorityScore: number;
  status: TaskStatus;
  dueDate?: string | null;
};

export type Insight = {
  id: string;
  text: string;
};
