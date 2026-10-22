export type Sphere = {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  generalPrompt?: string | null;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  sphereId?: string | null;
  parentTaskId?: string | null;
  taskType?: 'TASK' | 'EVENT' | 'REMINDER';
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
  creatorName?: string;
  creatorUserId?: string;
  isCollaborative?: boolean;
  creatorColor?: string;
  collaborationColor?: string;
  collaborationOwner?: boolean;
  collaborationMembers?: CollaborationMember[];
  attachmentCount?: number;
  commentCount?: number;
  unreadCommentCount?: number;
};

export type TaskComment = {
  id: string;
  taskId: string;
  userId: string;
  authorUserId: string;
  authorName: string;
  authorColor?: string;
  parentCommentId?: string | null;
  content: string;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationMember = {
  userId: string;
  name: string;
  color: string;
  isOwner: boolean;
};

export type Insight = {
  id: string;
  text: string;
};

export type GeneratedDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type TelegramReadDraft = {
  requestId: string;
  requestedChat: string;
  chatName: string | null;
  chatId: string | null;
  match: 'exact' | 'unique' | 'ambiguous' | 'not_found';
};
export type TelegramReadApproval = { requestId: string; chatId: string; count: 10 | 20 | 30 | 50 | 100 };

export type TelegramInlineSendDraft = {
  requestId: string;
  text: string;
  requestedRecipient: string;
  recipientId: string | null;
  recipientName: string | null;
  match: 'exact' | 'unique' | 'ambiguous' | 'not_found';
};

export type AiTaskProposal = {
  id: string;
  status: 'PENDING' | 'APPLYING' | 'APPLIED' | 'REJECTED' | 'FAILED' | 'CONFLICT' | 'UNDOING' | 'UNDONE';
  source: 'planner' | 'telegram_bot' | 'task_chat' | 'telegram_bot_task' | 'legacy_general' | 'telegram_assistant' | 'daily_checkup';
  autoApplied: boolean;
  operations: Array<{ type: string; title: string; before?: string; after?: string; dueDate?: string | null; parentTitle?: string; details?: string[] }>;
  result: { reports?: string[]; createdIds?: string[] } | null;
  error: string | null;
};

export type ChatMessage = {
  id?: string;
  createdAt?: string;
  role: 'user' | 'assistant';
  content: string;
  /** Small optional display-only thumbnails, not original attachment bytes. */
  attachmentPreviews?: Array<{ name: string; thumbnail?: string }>;
  creditsSpentMilli?: number;
  webSearchUsed?: boolean;
  webSources?: WebSource[];
  webCitations?: WebCitation[];
  authorName?: string;
  authorColor?: string;
  messageKind?: 'AI' | 'HUMAN';
  recipientUserId?: string;
  recipientName?: string;
  generatedDocument?: GeneratedDocument;
  taskProposal?: AiTaskProposal | null;
  telegramSendDraft?: TelegramInlineSendDraft;
  telegramSuggestedReply?: import('./api').TelegramAiSuggestedReply;
  telegramReadDraft?: TelegramReadDraft;
};

export type WebSource = { title: string; url: string };
export type WebCitation = { startIndex: number; endIndex: number; sourceIndex: number };

export type ChatMode = 'fast' | 'smart';
export type AiChatModel = 'gpt-6-luna' | 'gpt-5.4-mini' | 'gpt-6.1-sol';

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
  finishedAt?: string | null;
  stats: HabitStat[];
  createdAt?: string;
  updatedAt?: string;
};
