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
  taskType?: 'TASK' | 'EVENT';
  location?: string | null;
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
export type AiChatModel = 'gpt-5.4-nano' | 'gpt-5.4-mini' | 'gpt-5.4';

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

export type HabitRecurrenceType = 'DAILY' | 'INTERVAL' | 'WEEKDAYS';
export type HabitDurationMode = 'FOREVER' | 'UNTIL_DATE' | 'REPEAT_COUNT';

export type HabitStat = {
  dateKey: string;
  amount: number;
  events: number;
  completedAt?: string | null;
  autoCompleted?: boolean;
};

export type Habit = {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetCount: number;
  recurrenceType: HabitRecurrenceType;
  intervalDays?: number | null;
  weekdays: number[];
  reminderTime?: string | null;
  reminderTimes?: string[];
  durationMode?: HabitDurationMode;
  endDate?: string | null;
  totalRepeatTarget?: number | null;
  isAutoCompleted?: boolean;
  autoCompletedAt?: string | null;
  completedTotal?: number;
  durationRemaining?: number | null;
  isArchived?: boolean;
  stats: HabitStat[];
  createdAt?: string;
  updatedAt?: string;
};
