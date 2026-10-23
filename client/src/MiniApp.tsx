import { prepareAiChatImageFile } from './lib/ai-image-upload';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Bot, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Coins, Copy, Eye, EyeOff, FileText, Gauge, List, Loader2, Maximize2, Menu, MessageCircle, Minus, Palette, Paperclip, Plus, Save, Search, SendHorizontal, Settings, Sparkles, StickyNote, Ticket, Trash2, X } from 'lucide-react';
import { INSUFFICIENT_AI_CREDITS_MESSAGE, formatAiRequestError, api, stripAiChatProjectDisplayPreviews, type CreditPack, type CreditUsageStatistics, type CurrentUser, type TaskAiProgressStatus, type AiChatProgressStatus, type StandaloneNote } from './lib/api';
import { NotesEditor } from './components/NotesEditor';
import { TaskCompletionReportDialog } from './components/TaskCompletionReportDialog';
import { TaskAiEmptyState } from './components/TaskAiEmptyState';
import { MiniAppHabitTracker } from './components/MiniAppHabitTracker';
import { TaskMonitoringControls } from './components/TaskMonitoringControls';
import { TaskMonitoringTriggerChips } from './components/TaskMonitoringTriggerChips';
import { AiCheckupScheduleSettings } from './components/AiCheckupScheduleSettings';
import { MiniAppStandaloneNoteEditor } from './components/MiniAppStandaloneNoteEditor';
import { StandaloneNotesWorkspace } from './components/StandaloneNotesWorkspace';
import { WorkspaceGlobalSearch } from './components/WorkspaceGlobalSearch';
import { matchesWorkspaceText } from './lib/workspaceSearch';
import { MiniWorkspaceTools } from './components/MiniWorkspaceTools';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { measureTitleTextareaRows } from './lib/titleTextareaRows';
import { newestFocusSubtaskFirst, urgentFocusSubtaskFirst } from './lib/focusSubtaskSort';
import { loadThemePreference, resolveThemeMode, type ThemePreference } from './lib/autoTheme';
import { CustomSelect } from './components/CustomSelect';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { renderAiContentBlocks } from './components/AiCodeBlocks';
import { noteHtmlToPlainText } from './lib/notes';
import { CalendarExportDialog } from './components/CalendarExportDialog';
import { AutoGrowingTextarea } from './components/AutoGrowingTextarea';
import { MiniAiChatComposer, type MiniAiChatComposerHandle } from './components/MiniAiChatComposer';
import type { AiChatModel, AiTaskProposal, ChatAttachmentPayload, ChatMessage, GeneratedDocument, Habit, HabitDurationMode, HabitRecurrenceType, Sphere, Task, TaskAttachment, TaskComment } from './lib/types';
import { formatCreditsSpent } from './lib/credits';
import { getCreatorInitial } from './lib/creatorInitial';
import { TaskAiProgress } from './components/TaskAiProgress';
import { AiProgress } from './components/AiProgress';
import { AiAttachmentTiles, AiMessageAttachments, splitAiMessageAttachments, makeAiAttachmentPreviews } from './components/AiAttachmentTiles';
import type { AiAttachmentPreview } from './components/AiAttachmentTiles';
import { WebCitations } from './components/WebCitations';
import { AiInlineMarkup } from './components/AiInlineMarkup';
import { attachChatMessageId } from './lib/chatMessages';
import { useCreditPurchase } from './lib/useCreditPurchase';
import { CollapsibleUserMessage } from './components/CollapsibleUserMessage';
import { CreditUsageStats } from './components/CreditUsageStats';
import { AiGeneratedDocumentButton } from './components/AiGeneratedDocumentButton';
import { TelegramMessageQuickShare } from './components/TelegramMessageQuickShare';
import { AiReplyAction, AiReplyPreview, AiReplyMessageBody, serializeAiReply, type AiReplyTarget } from './components/AiMessageReply';
import { AiTaskProposalCard, proposalAppliedEvent } from './components/AiTaskProposalCard';
import { isolateTaskProposalChips, reconcileActiveAiChatMessages, reconcileAiChatProjectOutline, mergeTelegramManagedMessages, reconcileAiChatMessagesWithChips, sanitizeCachedTelegramAssistantProjects, isTelegramAssistantProjectLike } from './lib/ai-chat-reconciliation';
import { persistAiChatProjectsCache } from './lib/ai-chat-storage';
import { DEFAULT_MOBILE_PROJECT_CHAT_MODEL, DEFAULT_QUICK_AI_CHAT_MODEL, readSavedAiChatModel } from './lib/ai-chat-model';
import { TelegramInlineSendCard } from './components/TelegramInlineSendCard';
import { TelegramAiReplySuggestionCard } from './components/TelegramAiReplySuggestionCard';
import { TelegramReadConsentCard } from './components/TelegramReadConsentCard';
import { loadTaskAiRecipientSelection, saveTaskAiRecipientSelection } from './lib/taskAiRecipientStorage';
import { changedDraftFields, mergeRemoteDraftFields } from './lib/taskDraftSync';

const MINIAPP_EFFICIENCY_BONUSES = {
  doneHabit: 3,
  createdHabit: 3.35,
  completedHabit: 20.1
} as const;

type TelegramWebApp = {
  initData?: string;
  version?: string;
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string) => void;
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export type MiniAppRuntime = 'telegram' | 'web';

type MiniAppProps = {
  runtime?: MiniAppRuntime;
};

const extractInitDataFromUrl = () => {
  const fromSearch = new URLSearchParams(window.location.search).get('tgWebAppData');
  if (fromSearch?.trim()) return fromSearch.trim();

  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const fromHash = new URLSearchParams(rawHash).get('tgWebAppData');
  if (fromHash?.trim()) return fromHash.trim();

  return '';
};

type TimeFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'month';
type DisplayMode = 'list' | 'timeline';
type TimelineView = 'day' | 'week' | 'month';
type ListSortMode = 'importance' | 'urgency';
type SubtaskFilterMode = 'none' | 'urgency' | 'importance';
const SUBTASK_FILTER_OPTIONS: Array<{ mode: SubtaskFilterMode; label: string }> = [
  { mode: 'urgency', label: 'По срочности' },
  { mode: 'importance', label: 'По важности' },
  { mode: 'none', label: 'Без фильтра' }
];
const MAX_SHINE_WINDOW_MINUTES = 180;
const HOURS_IN_DAY = 24;
const TIMELINE_QUARTERS_PER_HOUR = 4;
const TIMELINE_QUARTER_HEIGHT = 24;
const TIMELINE_CARD_HEIGHT = 52;
const TIMELINE_SUBTASK_CARD_HEIGHT = 42;
const TIMELINE_CARD_GAP = 8;
const TIMELINE_QUARTER_PADDING = 8;
const TIMELINE_HOUR_EDGE_PADDING = 6;
const MAX_AI_ATTACHMENTS = 3;
const MAX_AI_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const SUPPORTED_AI_FILE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain'
]);
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};


type MiniAiChatMessage = ChatMessage & { id: string };
type MiniAiChatThread = { id: string; title: string; messages: MiniAiChatMessage[]; model?: AiChatModel; modelChangedAt?: string };
type MiniAiChatProject = { id: string; title: string; color: string; icon: string; chats: MiniAiChatThread[] };
type MiniAiChatProjectDraft = { mode: 'create' | 'edit'; projectId?: string; title: string; color: string; icon: string };

const AI_CHAT_STORAGE_KEY = 'btm:ai-chat-projects';

const QUICK_AI_CHAT_TITLE = 'Быстрые запросы';
const QUICK_AI_CHAT_PROJECT_TITLE = 'Личный проект';
const QUICK_AI_CHAT_ID = 'quick-ai-requests';

function normalizeMiniAiChatProjects(rawProjects: Array<Partial<MiniAiChatProject>> | null | undefined): MiniAiChatProject[] {
  const quickChat: MiniAiChatThread = { id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, messages: [] };
  const fallback: MiniAiChatProject[] = [{ id: crypto.randomUUID(), title: QUICK_AI_CHAT_PROJECT_TITLE, color: '#8b5cf6', icon: '✨', chats: [quickChat] }];
  // Never normalize historical Telegram-folder copies as regular user
  // projects. Doing so generated random chat UUIDs and massive PUT payloads.
  const userProjects = (rawProjects ?? []).filter(project => !isTelegramAssistantProjectLike(project));
  const tgProject = (rawProjects ?? []).find(project => project.id === 'telegram-ai-assistant-project') ??
    (rawProjects ?? []).find(project => isTelegramAssistantProjectLike(project));
  const source: Array<Partial<MiniAiChatProject>> = [
    ...(userProjects.length ? userProjects : fallback),
    ...(tgProject ? [{ ...tgProject, id: 'telegram-ai-assistant-project', title: 'Телеграм ассистент', icon: 'telegram', chats: (tgProject.chats ?? [])
      .filter(chat => typeof chat?.id === 'string' && chat.id.startsWith('telegram-ai-assistant:'))
      .filter((chat, index, all) => all.findIndex(candidate => candidate.id === chat.id) === index)
      .slice(0, 25) }] : [])
  ];
  const normalized: MiniAiChatProject[] = source.map((project, index) => ({
    id: project.id ?? crypto.randomUUID(),
    title: index === 0 ? QUICK_AI_CHAT_PROJECT_TITLE : (project.title ?? `Проект ${index + 1}`),
    color: project.color ?? '#8b5cf6',
    icon: project.icon ?? '✨',
    chats: (project.chats?.length || project.id === 'telegram-ai-assistant-project' ? (project.chats ?? []) : [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }]).map((chat, chatIndex) => ({
      id: chat.id ?? crypto.randomUUID(),
      title: chat.title ?? `Чат ${chatIndex + 1}`,
      ...(readSavedAiChatModel(chat.model) ? { model: readSavedAiChatModel(chat.model)! } : {}),
      ...(typeof chat.modelChangedAt === 'string' ? { modelChangedAt: chat.modelChangedAt } : {}),
      messages: (chat.messages ?? [])
        .filter((message) => (message?.role === 'user' || message?.role === 'assistant') && typeof message?.content === 'string')
        .map((message) => ({
          id: message.id ?? crypto.randomUUID(),
          role: message.role,
          content: message.content,
          ...(message.authorName ? { authorName: message.authorName } : {}),
          ...(message.authorColor ? { authorColor: message.authorColor } : {}),
          ...(message.creditsSpentMilli === undefined ? {} : { creditsSpentMilli: message.creditsSpentMilli }),
          ...(message.webSearchUsed ? { webSearchUsed: true, webSources: message.webSources, webCitations: message.webCitations } : {}),
          ...(message.generatedDocument ? { generatedDocument: message.generatedDocument } : {}),
          ...(message.taskProposal ? { taskProposal: message.taskProposal } : {}),
          ...(message.telegramSendDraft ? { telegramSendDraft: message.telegramSendDraft } : {}),
          ...(message.telegramSuggestedReply ? { telegramSuggestedReply: message.telegramSuggestedReply } : {}),
          ...(message.telegramReadDraft ? { telegramReadDraft: message.telegramReadDraft } : {})
        }))
    }))
  }));
  const defaultProject = normalized[0] ?? fallback[0];
  const existingQuickChatIndex = defaultProject.chats.findIndex((chat) => chat.id === QUICK_AI_CHAT_ID || chat.title === QUICK_AI_CHAT_TITLE);
  const existingQuickChat = existingQuickChatIndex >= 0 ? defaultProject.chats[existingQuickChatIndex] : undefined;
  const mergedQuickChat: MiniAiChatThread = {
    ...quickChat,
    ...existingQuickChat,
    id: QUICK_AI_CHAT_ID,
    title: QUICK_AI_CHAT_TITLE,
    model: DEFAULT_QUICK_AI_CHAT_MODEL,
    messages: (existingQuickChat?.messages ?? []).slice(-100)
  };
  normalized[0] = {
    ...defaultProject,
    title: QUICK_AI_CHAT_PROJECT_TITLE,
    chats: [mergedQuickChat, ...defaultProject.chats.filter((_, index) => index !== existingQuickChatIndex)]
  };
  return isolateTaskProposalChips(sanitizeCachedTelegramAssistantProjects(normalized));
}
const AI_CHAT_MODEL_OPTIONS: Array<{ value: AiChatModel; label: string }> = [
  { value: 'gpt-6-luna', label: 'GPT-6 Luna' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }
];
const MINI_AI_PROJECT_COLORS = ['#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];
const MINI_AI_PROJECT_ICONS = ['✨', '🤖', '🧠', '🚀', '📌', '🗂️', '💬', '⚡', '🌙', '🎯', '🧩', '🪄'];

type CreateSubtaskDraft = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
};

type TaskDraft = {
  title: string;
  location?: string | null;
  description: string;
  dueDate: string;
  sphereId?: string | null;
  notifyBeforeMinutes?: number | null;
  importance?: number;
  isRecurring?: boolean;
  recurrenceText?: string | null;
  recurrenceJson?: Record<string, unknown> | null;
  recurrenceSummary?: string | null;
  recurrenceUntil?: string | null;
  aiNotificationsEnabled?: boolean;
  aiMonitoringEnabled?: boolean;
  subtasks?: CreateSubtaskDraft[];
};

const taskToMiniDraft = (task: Task): TaskDraft => ({
  title: task.title,
  location: task.location ?? '',
  description: task.description ?? '',
  dueDate: toInputDateTime(task.dueDate),
  sphereId: task.sphereId,
  notifyBeforeMinutes: task.notifyBeforeMinutes,
  importance: task.importance,
  isRecurring: task.isRecurring,
  recurrenceText: task.recurrenceText,
  recurrenceJson: task.recurrenceJson,
  recurrenceSummary: task.recurrenceSummary,
  recurrenceUntil: task.recurrenceUntil,
  aiNotificationsEnabled: task.aiNotificationsEnabled,
  aiMonitoringEnabled: task.aiMonitoringEnabled
});

type HabitDraft = {
  name: string;
  icon: string;
  color: string;
  targetCount: string;
  recurrenceType: HabitRecurrenceType;
  intervalDays: number;
  weekdays: number[];
  reminderTime: string;
  reminderTimes: string[];
  durationMode: HabitDurationMode;
  endDate: string;
  totalRepeatTarget: string;
};

const timeFilterLabel: Record<TimeFilter, string> = {
  all: 'Все сроки',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: '7 дней',
  month: '30 дней'
};

const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '0', label: 'Вовремя' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;

const IMPORTANCE_STYLES: Record<number, string> = {
  1: 'bg-sky-500/70 border-sky-300',
  2: 'bg-cyan-500/70 border-cyan-300',
  3: 'bg-violet-500/70 border-violet-300',
  4: 'bg-orange-500/70 border-orange-300',
  5: 'bg-rose-500/75 border-rose-300'
};


const HABIT_ICON_OPTIONS = ['💧', '🏃', '📚', '🧘', '💊', '🥗', '📝', '💪', '🎯', '✨'];
const HABIT_COLOR_OPTIONS = ['#22c55e', '#38bdf8', '#a78bfa', '#f97316', '#f43f5e', '#eab308'];
const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' }
];
const LONG_PRESS_MS = 520;

function createEmptyHabitDraft(): HabitDraft {
  return {
    name: '',
    icon: '✨',
    color: '#22c55e',
    targetCount: '1',
    recurrenceType: 'DAILY',
    intervalDays: 2,
    weekdays: [1, 2, 3, 4, 5],
    reminderTime: '',
    reminderTimes: [],
    durationMode: 'FOREVER',
    endDate: '',
    totalRepeatTarget: '7'
  };
}

function habitToDraft(habit: Habit): HabitDraft {
  return {
    name: habit.name,
    icon: habit.icon || '✨',
    color: habit.color || '#22c55e',
    targetCount: String(habit.targetCount || 1),
    recurrenceType: habit.recurrenceType || 'DAILY',
    intervalDays: habit.intervalDays || 2,
    weekdays: habit.weekdays?.length ? habit.weekdays : [1, 2, 3, 4, 5],
    reminderTime: (habit.reminderTimes?.[0] ?? habit.reminderTime) ?? '',
    reminderTimes: habit.reminderTimes?.length ? habit.reminderTimes : (habit.reminderTime ? [habit.reminderTime] : []),
    durationMode: habit.durationMode || 'FOREVER',
    endDate: habit.endDate ? habit.endDate.slice(0, 10) : '',
    totalRepeatTarget: String(habit.totalRepeatTarget || 7)
  };
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHabitCompletedForDate(habit: Habit, dateKey: string) {
  return habit.stats.find((item) => item.dateKey === dateKey)?.amount ?? 0;
}

function isHabitScheduledForDate(habit: Habit, date: Date) {
  if (habit.isAutoCompleted) return false;
  if (habit.recurrenceType === 'WEEKDAYS') return habit.weekdays.includes(date.getDay());
  if (habit.recurrenceType === 'INTERVAL') {
    const start = habit.createdAt ? new Date(habit.createdAt) : new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const currentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.max(0, Math.round((currentDay - startDay) / 86_400_000));
    return dayDiff % Math.max(1, habit.intervalDays ?? 1) === 0;
  }
  return true;
}

function formatHabitSchedule(draft: Pick<HabitDraft, 'recurrenceType' | 'intervalDays' | 'weekdays'>) {
  if (draft.recurrenceType === 'INTERVAL') return `Каждые ${draft.intervalDays || 1} дн.`;
  if (draft.recurrenceType === 'WEEKDAYS') {
    const labels = WEEKDAY_OPTIONS.filter((item) => draft.weekdays.includes(item.value)).map((item) => item.label);
    return labels.length ? labels.join(', ') : 'Дни не выбраны';
  }
  return 'Каждый день';
}

function parseHabitTargetCount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(99, Math.max(1, Math.round(numeric)));
}

function parseHabitTotalRepeatTarget(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(9999, Math.max(1, Math.round(numeric)));
}

function normalizeCustomHabitIcon(value: string) {
  return Array.from(value.trim()).slice(0, 2).join('');
}

function normalizeHabitReminderTimes(times: string[]) {
  return Array.from(new Set(times.filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))).sort((a, b) => a.localeCompare(b));
}

function formatHabitDurationRemaining(draft: HabitDraft, habit?: Habit | null) {
  if (draft.durationMode === 'UNTIL_DATE') {
    if (!draft.endDate) return 'Дата окончания не выбрана';
    const end = new Date(`${draft.endDate}T23:59:59`);
    const diffMs = end.getTime() - Date.now();
    if (Number.isNaN(diffMs)) return 'Дата окончания не выбрана';
    if (diffMs <= 0 || habit?.isAutoCompleted) return 'Период завершён — привычка выполнена автоматически';
    const days = Math.ceil(diffMs / 86_400_000);
    return `Осталось ${days} дн. до автоматического выполнения`;
  }
  if (draft.durationMode === 'REPEAT_COUNT') {
    const target = parseHabitTotalRepeatTarget(draft.totalRepeatTarget);
    const completed = habit?.completedTotal ?? 0;
    const remaining = Math.max(0, target - completed);
    if (remaining <= 0 || habit?.isAutoCompleted) return 'Нужное количество повторов набрано';
    return `Осталось ${remaining} из ${target} повторов`;
  }
  return 'Без ограничения — привычка будет повторяться постоянно';
}


function formatDueDate(value?: string | null) {
  if (!value) return 'Без дедлайна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Без дедлайна';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRemaining(value?: string | null) {
  if (!value) return 'Срок не задан';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return 'Срок не задан';
  const diffMs = due.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);

  if (absMinutes < 1) {
    return diffMs >= 0 ? 'Дедлайн прямо сейчас' : 'Просрочено только что';
  }

  const days = Math.floor(absMinutes / (60 * 24));
  const hours = Math.floor((absMinutes % (60 * 24)) / 60);
  const minutes = absMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}д`);
  if (hours > 0) parts.push(`${hours}ч`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}м`);
  const text = parts.join(' ');
  return diffMs >= 0 ? `Через ${text}` : `Просрочено на ${text}`;
}

function formatSubtaskRelativeDeadline(value?: string | null) {
  if (!value) return '';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return '';
  const diffMs = due.getTime() - Date.now();
  const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = diffMs < 0 ? ' назад' : '';
  return hours < 1 ? `${Math.max(1, minutes)} мин${suffix}` : `${hours} ч${suffix}`;
}


type MiniAiTaskReference = {
  taskId: string;
  label: string;
};

const MINI_TASK_REF_PATTERN = /\[\[task_ref=([^\]]+)\]\]|\[\[task_ref:([^|\]]+)\|([^\]]+)\]\]/g;

function normalizeMiniAiMessageContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"answer"')) return content;

  try {
    const parsed = JSON.parse(trimmed) as { answer?: unknown };
    if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer.trim();
  } catch {
    const answerMatch = trimmed.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"actions"\s*:/);
    if (answerMatch?.[1]) {
      return answerMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
    }
  }

  return content;
}

function parseMiniTaskReferencesInLine(content: string): Array<{ type: 'text'; value: string } | { type: 'taskRef'; reference: MiniAiTaskReference }> {
  const chunks: Array<{ type: 'text'; value: string } | { type: 'taskRef'; reference: MiniAiTaskReference }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MINI_TASK_REF_PATTERN.lastIndex = 0;
  while ((match = MINI_TASK_REF_PATTERN.exec(content)) !== null) {
    const [full, rawTaskIdEq, rawTaskIdLegacy, rawLabelLegacy] = match;
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore) chunks.push({ type: 'text', value: textBefore });
    const taskId = (rawTaskIdEq || rawTaskIdLegacy || '').trim();
    const label = (rawLabelLegacy || '').trim() || 'Открыть задачу';
    if (taskId && label) chunks.push({ type: 'taskRef', reference: { taskId, label } });
    lastIndex = match.index + full.length;
  }
  const tail = content.slice(lastIndex);
  if (tail) chunks.push({ type: 'text', value: tail });
  MINI_TASK_REF_PATTERN.lastIndex = 0;
  return chunks;
}

function MiniAiMessageContentWithTaskRefs({ content, tasks, onOpenTask }: { content: string; tasks: Task[]; onOpenTask: (task: Task) => void }) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const normalizedContent = useMemo(() => normalizeMiniAiMessageContent(content), [content]);
  return renderAiContentBlocks(normalizedContent, (text, blockKey) => (
    <div key={blockKey}>
      {text.split(/\r?\n/).map((line, lineIndex) => {
        const chunks = parseMiniTaskReferencesInLine(line);
        if (chunks.length === 0) return <p key={`mini-ai-line-empty-${lineIndex}`} className="min-h-[1em] whitespace-pre-wrap" />;
        const taskReferences = chunks
          .filter((chunk): chunk is { type: 'taskRef'; reference: MiniAiTaskReference } => chunk.type === 'taskRef')
          .map((chunk) => chunk.reference);
        return (
          <div key={`mini-ai-line-${lineIndex}`} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {chunks.map((chunk, chunkIndex) => {
              if (chunk.type === 'taskRef') return null;
              return <span key={`mini-ai-text-${lineIndex}-${chunkIndex}`}>{renderMiniAiText(chunk.value)}</span>;
            })}
            {taskReferences.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {taskReferences.map((reference, referenceIndex) => {
                  const matchedTask = taskById.get(reference.taskId);
                  const label = matchedTask?.title || reference.label;
                  return (
                    <button
                      key={`mini-ai-task-${lineIndex}-${reference.taskId}-${referenceIndex}`}
                      type="button"
                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-cyan-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow transition active:scale-95 disabled:opacity-60"
                      onClick={() => { if (matchedTask) onOpenTask(matchedTask); }}
                      disabled={!matchedTask}
                      title={matchedTask ? `Открыть задачу: ${label}` : `Задача не найдена: ${reference.taskId}`}
                    >
                      <ArrowUpRight size={12} />
                      <span className="truncate">{matchedTask ? label : 'Задача не найдена'}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  ));
}

function renderMiniAiMessageContent(content: string, previews?: AiAttachmentPreview[], messageId?: string) {
  const { text, names } = splitAiMessageAttachments(content);
  return <>
    <AiReplyMessageBody content={text} renderBody={(body) => renderAiContentBlocks(normalizeMiniAiMessageContent(body), (part, key) => (
      <div key={key}>{renderMiniAiText(part)}</div>
    ))} />
    <AiMessageAttachments names={names} previews={previews} messageId={messageId} />
  </>;
}

function renderMiniAiText(content: string) {
  return content.split('\n').map((line, lineIndex) => (
    <p key={`mini-ai-line-${lineIndex}`} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      <AiInlineMarkup content={line} strongClassName="font-semibold" />
    </p>
  ));
}

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - timezoneOffset);
  return local.toISOString().slice(0, 16);
}

function fromInputDateTime(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isOverdue(task: Task) {
  if (task.status === 'DONE' || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function resolveAttachmentMimeType(file: File): string {
  const fromBrowser = file.type?.trim();
  if (fromBrowser) return fromBrowser;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) return 'application/octet-stream';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

async function fileToAttachmentPayload(file: File, forAiChat = false): Promise<ChatAttachmentPayload> {
  const source = forAiChat ? await prepareAiChatImageFile(file) : file;
  const buffer = await source.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return {
    name: source.name,
    mimeType: resolveAttachmentMimeType(source),
    size: source.size,
    contentBase64: btoa(binary)
  };
}

function shouldTaskGlow(task: Task) {
  if (task.status === 'DONE' || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const diff = due.getTime() - Date.now();
  if (diff < 0) return true;
  if (task.notifyBeforeMinutes === null) return false;
  const notifyBefore = Math.min(task.notifyBeforeMinutes ?? 0, MAX_SHINE_WINDOW_MINUTES) * 60_000;
  return diff <= notifyBefore;
}

function hexToRgba(hexColor: string, alpha: number) {
  const normalized = hexColor.trim().replace('#', '');
  if (![3, 6].includes(normalized.length)) return null;
  const full = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function compareByDueDate(a: Task, b: Task) {
  const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const safeADate = Number.isNaN(aDate) ? Number.POSITIVE_INFINITY : aDate;
  const safeBDate = Number.isNaN(bDate) ? Number.POSITIVE_INFINITY : bDate;
  if (safeADate !== safeBDate) return safeADate - safeBDate;
  return a.title.localeCompare(b.title, 'ru-RU');
}

export default function MiniApp({ runtime = 'telegram' }: MiniAppProps) {
  const isTelegramRuntime = runtime === 'telegram';
  const isWebRuntime = runtime === 'web';
  const clientSurface = isTelegramRuntime ? 'miniapp' : 'web';
  const [webVisualViewport, setWebVisualViewport] = useState(() => ({
    top: window.visualViewport?.offsetTop ?? 0,
    height: window.visualViewport?.height ?? window.innerHeight
  }));
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedAiMessageKey, setCopiedAiMessageKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sphereFilter, setSphereFilter] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [listSortMode, setListSortMode] = useState<ListSortMode>('urgency');
  const [listSelectedSphereIds, setListSelectedSphereIds] = useState<string[] | null>(null);
  const [isStandaloneNotesOpen, setIsStandaloneNotesOpen] = useState(false);
  const [requestedStandaloneNote, setRequestedStandaloneNote] = useState<{ id: string; serial: number } | null>(null);
  const [miniThemeMode, setMiniThemeMode] = useState<ThemePreference>(() => {
    return loadThemePreference(localStorage, 'btm:miniapp-theme-mode');
  });
  const [autoThemeTick, setAutoThemeTick] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [manualCheckupLoading, setManualCheckupLoading] = useState(false);
  const [manualCheckupError, setManualCheckupError] = useState<string | null>(null);
  // The saved checkup is pinned locally until the regular Quick AI history
  // includes it. A concurrent chat refresh must not make the result vanish.
  const [latestManualCheckup, setLatestManualCheckup] = useState<{ userId: string; message: MiniAiChatMessage } | null>(null);
  const [aiNotificationDefault, setAiNotificationDefault] = useState(() =>
    localStorage.getItem('btm:ai-notifications-default-enabled') !== '0');
  const [reportPromptTask, setReportPromptTask] = useState<Task | null>(null);
  const [areHabitsExpanded, setAreHabitsExpanded] = useState(false);
  const [timelineNow, setTimelineNow] = useState(() => new Date());
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(() => new Date());
  const [timelineView, setTimelineView] = useState<TimelineView>('month');
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);
  const [openedSubtaskId, setOpenedSubtaskId] = useState<string | null>(null);
  const openedTaskContentsScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingOpenedTaskScrollTopRef = useRef<number | null>(null);
  const [hideClosedOpenedTaskSubtasks, setHideClosedOpenedTaskSubtasks] = useState(true);
  const [openedTaskSubtaskFilterMode, setOpenedTaskSubtaskFilterMode] = useState<SubtaskFilterMode>('urgency');
  const [openedTaskSubtaskAuthorFilterUserId, setOpenedTaskSubtaskAuthorFilterUserId] = useState<string | null>(null);
  const [isOpenedTaskSubtaskFilterOpen, setIsOpenedTaskSubtaskFilterOpen] = useState(false);
  const [newSubtaskDraft, setNewSubtaskDraft] = useState<TaskDraft | null>(null);
  const [isTaskSettingsOpen, setIsTaskSettingsOpen] = useState(false);
  const [isCollaborationSettingsOpen, setIsCollaborationSettingsOpen] = useState(false);
  const [collaborationAction, setCollaborationAction] = useState<{ task: Task; action: 'complete' | 'delete' } | null>(null);
  const [isCalendarExportOpen, setIsCalendarExportOpen] = useState(false);
  const [calendarExportTaskId, setCalendarExportTaskId] = useState<string | null>(null);
  const [draftByTaskId, setDraftByTaskId] = useState<Record<string, TaskDraft>>({});
  const taskDraftOriginalByIdRef = useRef<Record<string, TaskDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [updatingFocusSubtaskIds, setUpdatingFocusSubtaskIds] = useState<string[]>([]);
  const updatingFocusSubtasksRef = useRef<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPostponingOverdue, setIsPostponingOverdue] = useState(false);
  const [creatingSubtaskForId, setCreatingSubtaskForId] = useState<string | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [createEditorType, setCreateEditorType] = useState<'task' | 'event'>('task');
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [isHabitSettingsOpen, setIsHabitSettingsOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(() => createEmptyHabitDraft());
  const [savingHabit, setSavingHabit] = useState(false);
  const [finishingHabitId, setFinishingHabitId] = useState<string | null>(null);
  const [deletingHabitId, setDeletingHabitId] = useState<string | null>(null);
  const [completedHabitPulseId, setCompletedHabitPulseId] = useState<string | null>(null);
  const [completingHabitIds, setCompletingHabitIds] = useState<string[]>([]);
  const [isCustomHabitIconOpen, setIsCustomHabitIconOpen] = useState(false);
  const [customHabitIconDraft, setCustomHabitIconDraft] = useState('');
  const habitLongPressTimerRef = useRef<number | null>(null);
  const habitLongPressTriggeredRef = useRef(false);
  const habitReminderTimeInputRef = useRef<HTMLInputElement | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskDraft, setCreateTaskDraft] = useState<TaskDraft>({
    title: '',
    description: '',
    dueDate: '',
    sphereId: null,
    notifyBeforeMinutes: 0,
    importance: 3,
    isRecurring: false,
    recurrenceText: '',
    recurrenceJson: null,
    recurrenceSummary: null,
    recurrenceUntil: null,
    aiNotificationsEnabled: true,
    aiMonitoringEnabled: false,
    subtasks: []
  });
  const [createTaskPendingFiles, setCreateTaskPendingFiles] = useState<File[]>([]);
  const [isCreateTaskSettingsOpen, setIsCreateTaskSettingsOpen] = useState(false);
  useEffect(() => {
    if (!isCreateTaskModalOpen) setCreateTaskPendingFiles([]);
  }, [isCreateTaskModalOpen]);
  const [createTaskNotifyPreset, setCreateTaskNotifyPreset] = useState('0');
  const [createTaskRecurrenceLoading, setCreateTaskRecurrenceLoading] = useState(false);
  const [createTaskRecurrenceNextDueLabel, setCreateTaskRecurrenceNextDueLabel] = useState<string | null>(null);
  const [taskRecurrenceLoading, setTaskRecurrenceLoading] = useState(false);
  const [taskRecurrenceNextDueLabel, setTaskRecurrenceNextDueLabel] = useState<string | null>(null);
  const [isTaskNotesEditorOpen, setIsTaskNotesEditorOpen] = useState(false);
  const [isSubtaskNotesEditorOpen, setIsSubtaskNotesEditorOpen] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);
  const [subtaskAttachments, setSubtaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingSubtaskAttachment, setIsUploadingSubtaskAttachment] = useState(false);
  const [isTaskAttachmentDragActive, setIsTaskAttachmentDragActive] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const fullscreenAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const taskAiChatScrollTopRef = useRef(0);
  const [isTaskAiChatHeaderHidden, setIsTaskAiChatHeaderHidden] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);
  const lastMainScrollTopRef = useRef(0);
  const taskAiDraftValueRef = useRef('');
  const taskAiComposerRef = useRef<MiniAiChatComposerHandle | null>(null);
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [taskAiUploadProgress, setTaskAiUploadProgress] = useState<number | null>(null);
  const [aiRecipientByTaskId, setAiRecipientByTaskId] = useState<Record<string, string>>({});
  const [aiRecipientStorageUserId, setAiRecipientStorageUserId] = useState<string | null>(null);
  const [isTaskAiRecipientPickerVisible, setIsTaskAiRecipientPickerVisible] = useState(false);
  const [isTaskAiRecipientMenuOpen, setIsTaskAiRecipientMenuOpen] = useState(false);
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [replyToTask, setReplyToTask] = useState<AiReplyTarget | null>(null);
  const [replyToGeneral, setReplyToGeneral] = useState<AiReplyTarget | null>(null);
  useEffect(() => { setReplyToTask(null); }, [openedTaskId]);
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [aiProgressByTask, setAiProgressByTask] = useState<Record<string, TaskAiProgressStatus>>({});
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [creatingStandaloneNote, setCreatingStandaloneNote] = useState(false);
  const [newStandaloneNote, setNewStandaloneNote] = useState<StandaloneNote | null>(null);
  const [aiCredits, setAiCredits] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const userTimeZone = currentUser?.timeZone?.trim() || localStorage.getItem('btm:user-timezone')?.trim() || 'Europe/Moscow';
  const effectiveMiniTheme = useMemo(
    () => resolveThemeMode(miniThemeMode, userTimeZone, new Date()),
    [miniThemeMode, userTimeZone, autoThemeTick]
  );
  const [isCreditPurchaseOpen, setIsCreditPurchaseOpen] = useState(false);
  const [creditPopoverView, setCreditPopoverView] = useState<'purchase' | 'statistics'>('purchase');
  const [creditUsageStatistics, setCreditUsageStatistics] = useState<CreditUsageStatistics | null>(null);
  const [creditUsageStatisticsLoading, setCreditUsageStatisticsLoading] = useState(false);
  const [creditUsageStatisticsError, setCreditUsageStatisticsError] = useState<string | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [creditPurchaseAvailable, setCreditPurchaseAvailable] = useState(false);
  const creditPurchase = useCreditPurchase({
    surface: 'miniapp',
    openConfirmation: (url) => { const webApp = (window as TelegramWindow).Telegram?.WebApp; if (webApp?.openLink) webApp.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer'); },
    onSucceeded: async () => { const { user } = await api.getMe(); setCurrentUser(user); setAiCredits(user.aiCredits ?? 0); }
  });
  const loadCreditUsageStatistics = async () => {
    setCreditUsageStatisticsLoading(true);
    setCreditUsageStatisticsError(null);
    try {
      const result = await api.getCreditUsageStatistics();
      setCreditUsageStatistics(result.statistics);
    } catch (error) {
      setCreditUsageStatisticsError(error instanceof Error ? error.message : 'Не удалось загрузить статистику');
    } finally {
      setCreditUsageStatisticsLoading(false);
    }
  };
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authConsentAccepted, setAuthConsentAccepted] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [isEfficiencyDetailsOpen, setIsEfficiencyDetailsOpen] = useState(false);
  const [isAiChatMenuOpen, setIsAiChatMenuOpen] = useState(false);
  const aiChatDraftValueRef = useRef('');
  const aiChatComposerRef = useRef<MiniAiChatComposerHandle | null>(null);
  const [aiChatPendingFiles, setAiChatPendingFiles] = useState<File[]>([]);
  const [aiChatUploadProgress, setAiChatUploadProgress] = useState<number | null>(null);
  const [selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-6-luna');
  const [quickAiChatModel, setQuickAiChatModel] = useState<AiChatModel>(DEFAULT_QUICK_AI_CHAT_MODEL);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatProgress, setAiChatProgress] = useState<AiChatProgressStatus>('analyzing_request');
  const [aiChatError, setAiChatError] = useState<string | null>(null);
  const [aiChatProjectDraft, setAiChatProjectDraft] = useState<MiniAiChatProjectDraft>({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
  const [isAiChatProjectDialogOpen, setIsAiChatProjectDialogOpen] = useState(false);
  const [closingMiniWindow, setClosingMiniWindow] = useState<string | null>(null);
  const [renamingAiChatId, setRenamingAiChatId] = useState<string | null>(null);
  const [aiChatRenameDraft, setAiChatRenameDraft] = useState('');
  const [aiChatProjects, setAiChatProjects] = useState<MiniAiChatProject[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(AI_CHAT_STORAGE_KEY) || '') as Array<Partial<MiniAiChatProject>>;
      return normalizeMiniAiChatProjects(parsed);
    } catch { return normalizeMiniAiChatProjects(null); }
  });
  const aiChatProjectsSyncReadyRef = useRef(false);
  const aiChatProjectsSaveTimerRef = useRef<number | null>(null);
  const aiChatProjectsRemoteSnapshotRef = useRef('');
  const aiChatProjectsSaveInFlightRef = useRef(false);
  const aiChatProjectsPollingRef = useRef(false);
  const [activeAiChatProjectId, setActiveAiChatProjectId] = useState(() => aiChatProjects[0]?.id ?? '');
  const [activeAiChatId, setActiveAiChatId] = useState(() => QUICK_AI_CHAT_ID);
  useEffect(() => { setReplyToGeneral(null); }, [activeAiChatId]);
  const aiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiChatScrollTopRef = useRef(0);
  // Auto-scrolling to the newest message must not masquerade as a swipe and
  // hide the header immediately when opened from a Telegram deep link.
  const generalAiChatUserScrollEnabledRef = useRef(false);
  const generalAiChatNearBottomRef = useRef(true);
  const previousGeneralAiChatIdRef = useRef('');
  const [isGeneralAiChatHeaderHidden, setIsGeneralAiChatHeaderHidden] = useState(false);
  const aiChatFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const subtaskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const taskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const subtaskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSubtaskTitleFocusIdRef = useRef<string | null>(null);
  const [taskTitleRows, setTaskTitleRows] = useState(1);
  const [subtaskTitleRows, setSubtaskTitleRows] = useState(1);
  const [commentPanelTaskId, setCommentPanelTaskId] = useState<string | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
  const [taskCommentDraft, setTaskCommentDraft] = useState('');
  const [taskCommentReplyTo, setTaskCommentReplyTo] = useState<TaskComment | null>(null);
  const [taskCommentSending, setTaskCommentSending] = useState(false);
  const [taskCommentError, setTaskCommentError] = useState<string | null>(null);
  const taskCommentScrollRef = useRef<HTMLDivElement | null>(null);
  const [pendingLaunchCommentTaskId, setPendingLaunchCommentTaskId] = useState<string | null>(null);
  const launchParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId')?.trim() || null;
    const openAi = ['1', 'true', 'yes'].includes((params.get('openAi') ?? '').toLowerCase());
    const requestedCheckupProposal = params.get('openCheckupProposal')?.trim() || null;
    const openCheckupProposal = requestedCheckupProposal && /^[a-zA-Z0-9_-]{1,50}$/.test(requestedCheckupProposal)
      ? requestedCheckupProposal : null;
    const openQuickAi = ['1', 'true', 'yes'].includes((params.get('openQuickAi') ?? '').toLowerCase()) || Boolean(openCheckupProposal);
    const openTelegramAiChat = params.get('openTelegramAiChat')?.trim() || null;
    const commentTaskId = params.get('commentTaskId')?.trim() || null;
    const chatRecipientUserId = params.get('chatRecipientUserId')?.trim() || null;
    return { taskId, openAi, openQuickAi, openCheckupProposal, openTelegramAiChat, commentTaskId, chatRecipientUserId };
  }, []);

  const [linkedCheckupProposal, setLinkedCheckupProposal] = useState<AiTaskProposal | null>(null);
  useEffect(() => {
    const id = launchParams.openCheckupProposal;
    if (!id || !currentUser?.id) return;
    let active = true;
    // The latest 100 chat messages may not contain an older checkup.
    // Fetch its exact existing proposal by owner, never reconstruct it.
    void api.aiTaskProposal(id).then(value => {
      if (active && value.source === 'daily_checkup') setLinkedCheckupProposal(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [launchParams.openCheckupProposal, currentUser?.id]);

  const generateManualCheckup = async () => {
    if (manualCheckupLoading) return;
    setManualCheckupLoading(true);
    setManualCheckupError(null);
    try {
      const { message } = await api.generateAiCheckupNow();
      const received = attachChatMessageId(message, message.id ?? crypto.randomUUID());
      // Show the actual saved message (and its approval chip) immediately,
      // regardless of any in-flight 2.5s thread reconciliation response.
      if (currentUser?.id) setLatestManualCheckup({ userId: currentUser.id, message: received });
      setAiChatProjects(previous => {
        const updated = previous.map((project, index) => index !== 0 ? project : ({
          ...project,
          chats: project.chats.map(chat => chat.id !== QUICK_AI_CHAT_ID ? chat : ({
            ...chat, messages: reconcileAiChatMessagesWithChips(chat.messages, [received]).slice(-100)
          }))
        }));
        aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(updated);
        return updated;
      });
      const project = aiChatProjects.find(item => item.chats.some(chat => chat.id === QUICK_AI_CHAT_ID));
      setActiveAiChatProjectId(project?.id ?? aiChatProjects[0]?.id ?? '');
      setActiveAiChatId(QUICK_AI_CHAT_ID);
      generalAiChatNearBottomRef.current = true;
      setIsSettingsOpen(false);
      setIsAiChatOpen(true);
      void api.getMe().then(({ user }) => setAiCredits(user.aiCredits ?? 0)).catch(() => undefined);
    } catch (error) {
      setManualCheckupError(formatAiRequestError(error));
    } finally {
      setManualCheckupLoading(false);
    }
  };

  // User data must never leak into another authenticated session.
  useEffect(() => {
    setLatestManualCheckup(null);
  }, [currentUser?.id]);

  const getTaskAiRecipientId = (task: Task) => {
    const selectedRecipientId = aiRecipientByTaskId[task.id] ?? 'ai';
    if (selectedRecipientId === 'ai') return 'ai';
    return task.collaborationMembers?.some((member) => member.userId === selectedRecipientId && member.userId !== currentUser?.id)
      ? selectedRecipientId
      : 'ai';
  };

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) {
      setAiRecipientByTaskId({});
      setAiRecipientStorageUserId(null);
      return;
    }
    setAiRecipientByTaskId(loadTaskAiRecipientSelection(userId));
    setAiRecipientStorageUserId(userId);
  }, [currentUser?.id]);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId || aiRecipientStorageUserId !== userId) return;
    saveTaskAiRecipientSelection(userId, aiRecipientByTaskId);
  }, [aiRecipientByTaskId, aiRecipientStorageUserId, currentUser?.id]);

  useEffect(() => {
    setIsTaskAiRecipientPickerVisible(false);
    setIsTaskAiRecipientMenuOpen(false);
  }, [isAiDialogOpen, openedTaskId]);

  const loadData = async (options: { showInitialLoader?: boolean; refreshPlannerOnly?: boolean } = {}) => {
    // A task mutation must not reload AI projects or reset the selected chat:
    // doing so unmounts consent cards exactly when their continuation succeeds.
    if (options.refreshPlannerOnly) {
      try {
        const [sphereList, taskList, habitList] = await Promise.all([
          api.getSpheres(), api.getTasks(), api.getHabits()
        ]);
        setSpheres(sphereList);
        setTasks(taskList);
        setHabits(habitList);
      } catch (error) {
        console.warn('[MiniApp] planner refresh failed', error);
      }
      return;
    }
    if (options.showInitialLoader ?? false) {
      setLoading(true);
      // Never render data that belongs to the session used before an account switch.
      setSpheres([]);
      setTasks([]);
      setHabits([]);
      setAiDialogByTask({});
      aiChatProjectsSyncReadyRef.current = false;
      if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
      aiChatProjectsRemoteSnapshotRef.current = '';
      aiChatProjectsSaveInFlightRef.current = false;
    }
    setError(null);
    try {
      let user: CurrentUser;
      if (isTelegramRuntime) {
        const tgWindow = window as TelegramWindow;
        const initData = tgWindow.Telegram?.WebApp?.initData?.trim() || extractInitDataFromUrl();
        if (!initData) {
          throw new Error('Telegram initData не найден. Откройте мини-приложение из Telegram бота.');
        }
        console.info(`[MiniApp] Используем Telegram initData (length=${initData.length})`);
        ({ user } = await api.loginTelegramMiniApp({ initData }));
        tgWindow.Telegram?.WebApp?.ready?.();
        tgWindow.Telegram?.WebApp?.expand?.();
      } else {
        ({ user } = await api.getMe());
      }
      setAiCredits(user.aiCredits ?? 0);
      setCurrentUser(user);

      const [sphereList, taskList, habitList, quickHistory, syncedProjects, telegramInbox] = await Promise.all([
        api.getSpheres(),
        api.getTasks(),
        api.getHabits(),
        api.getGeneralAssistantHistory().catch(() => ({ messages: [] as ChatMessage[] })),
        api.getAiChatProjects<Partial<MiniAiChatProject>>(),
        api.telegramAssistantInbox().catch(() => null)
      ]);
      const quickMessages: MiniAiChatMessage[] = quickHistory.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .map((message) => attachChatMessageId(message, message.id ?? crypto.randomUUID()))
        .slice(-100);
      const nextAiChatProjects = normalizeMiniAiChatProjects(syncedProjects.projects).map((project, projectIndex) => projectIndex === 0 ? {
        ...project,
        chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID
          ? { ...chat, messages: reconcileAiChatMessagesWithChips(chat.messages, quickMessages) } : chat)
      } : project);
      if (telegramInbox?.chats.length) {
        const oldProject = nextAiChatProjects.find(p => p.id === telegramInbox.projectId);
        const telegramChats: MiniAiChatThread[] = telegramInbox.chats.map(chat => {
          const stored = oldProject?.chats.find(c => c.id === chat.id)?.messages ?? [];
          const incoming = telegramInbox.messages.filter(m => m.chatId === chat.id).map(m => ({
            id: m.id, role: 'assistant' as const, content: m.content,
            taskProposal: m.taskProposal ?? undefined, telegramSuggestedReply: m.telegramSuggestedReply ?? undefined
          }));
          return { id: chat.id, title: chat.title,
            messages: mergeTelegramManagedMessages(stored, incoming) };
        });
        const idx = nextAiChatProjects.findIndex(p => p.id === telegramInbox.projectId);
        const telegramProject: MiniAiChatProject = { id: telegramInbox.projectId, title: telegramInbox.projectTitle, color: '#229ed9', icon: 'telegram', chats: telegramChats };
        if (idx >= 0) nextAiChatProjects[idx] = telegramProject;
        else nextAiChatProjects.push(telegramProject);
      }
      aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(nextAiChatProjects);
      if (!syncedProjects.projects?.length) {
        void api.saveAiChatProjects(nextAiChatProjects).catch(error => console.warn('[MiniApp AI chat] initial project sync failed', error));
      }
      setAiChatProjects(nextAiChatProjects);
      // Ordinary refreshes must never switch away from a Telegram consent card.
      setActiveAiChatProjectId(previous =>
        nextAiChatProjects.some(project => project.id === previous)
          ? previous : (nextAiChatProjects[0]?.id ?? ''));
      setActiveAiChatId(previous =>
        nextAiChatProjects.some(project => project.chats.some(chat => chat.id === previous))
          ? previous : QUICK_AI_CHAT_ID);
      aiChatProjectsSyncReadyRef.current = true;
      setSpheres(sphereList);
      setTasks(taskList);
      setHabits(habitList);
      console.info(`[MiniApp] Данные загружены: sectors=${sphereList.length}, tasks=${taskList.length}, habits=${habitList.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refresh = () => {
      void api.getTasks().then(setTasks).catch(() => undefined);
      void api.getSpheres().then(setSpheres).catch(() => undefined);
    };
    window.addEventListener(proposalAppliedEvent, refresh);
    return () => window.removeEventListener(proposalAppliedEvent, refresh);
  }, []);

  const hasAccount = Boolean(
    currentUser?.hasPassword
    || currentUser?.username?.trim()
    || currentUser?.email?.trim()
    || currentUser?.googleSub
  );
  const accountDisplayName = currentUser?.name?.trim()
    || currentUser?.username?.trim()
    || currentUser?.email?.trim()
    || 'Пользователь';

  const openAuthModal = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthError(null);
    setAuthPassword('');
    setAuthConsentAccepted(false);
    setIsSettingsOpen(false);
  };

  const closeAuthModal = () => {
    if (authSubmitting) return;
    setAuthModalMode(null);
    setAuthError(null);
    setAuthPassword('');
    setAuthConsentAccepted(false);
  };

  const submitAuth = async () => {
    if (!isWebRuntime || !authModalMode || authSubmitting) return;
    if (!authLogin.trim() || !authPassword) {
      setAuthError('Введите логин и пароль.');
      return;
    }
    if (authModalMode === 'register' && !authConsentAccepted) {
      setAuthError('Необходимо согласиться на обработку персональных данных.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const result = authModalMode === 'login'
        ? await api.login({ login: authLogin.trim(), password: authPassword })
        : await api.register({ login: authLogin.trim(), password: authPassword, name: authName.trim(), consentAccepted: authConsentAccepted });
      setCurrentUser(result.user);
      setAuthModalMode(null);
      setAuthPassword('');
      setAuthConsentAccepted(false);
      await loadData({ showInitialLoader: true });
    } catch (authFailure) {
      setAuthError(authFailure instanceof Error ? authFailure.message : 'Не удалось выполнить авторизацию.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const logout = async () => {
    if (!isWebRuntime || logoutSubmitting) return;
    setLogoutSubmitting(true);
    setError(null);
    try {
      await api.logout();
      const { user } = await api.getMe();
      setCurrentUser(user);
      setIsSettingsOpen(false);
      await loadData({ showInitialLoader: true });
    } catch (logoutFailure) {
      setError(logoutFailure instanceof Error ? logoutFailure.message : 'Не удалось выйти из аккаунта');
    } finally {
      setLogoutSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isWebRuntime) return;

    const updateVisualViewport = () => {
      const viewport = window.visualViewport;
      const nextViewport = {
        top: Math.max(0, viewport?.offsetTop ?? 0),
        height: Math.max(1, viewport?.height ?? window.innerHeight)
      };
      setWebVisualViewport((current) => (
        Math.abs(current.top - nextViewport.top) < 0.5
        && Math.abs(current.height - nextViewport.height) < 0.5
          ? current
          : nextViewport
      ));
    };

    updateVisualViewport();
    window.addEventListener('resize', updateVisualViewport);
    window.visualViewport?.addEventListener('resize', updateVisualViewport);
    window.visualViewport?.addEventListener('scroll', updateVisualViewport);

    return () => {
      window.removeEventListener('resize', updateVisualViewport);
      window.visualViewport?.removeEventListener('resize', updateVisualViewport);
      window.visualViewport?.removeEventListener('scroll', updateVisualViewport);
    };
  }, [isWebRuntime]);

  useEffect(() => {
    void loadData({ showInitialLoader: true });
  }, [runtime]);

  useEffect(() => {
    localStorage.setItem('btm:miniapp-theme-mode', miniThemeMode);
  }, [miniThemeMode]);

  useEffect(() => {
    if (miniThemeMode !== 'auto') return;
    const update = () => setAutoThemeTick((tick) => tick + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') update();
    };
    const interval = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [miniThemeMode]);

  useEffect(() => {
    document.body.dataset.theme = effectiveMiniTheme;
    document.documentElement.dataset.theme = effectiveMiniTheme;
    return () => {
      delete document.body.dataset.theme;
      delete document.documentElement.dataset.theme;
    };
  }, [effectiveMiniTheme]);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyWebkitOverflowScrolling = document.body.style.getPropertyValue('-webkit-overflow-scrolling');
    const prevRootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.setProperty('-webkit-overflow-scrolling', 'touch');
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.setProperty('-webkit-overflow-scrolling', prevBodyWebkitOverflowScrolling);
      document.documentElement.style.overflow = prevRootOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isEfficiencyDetailsOpen && !isSettingsOpen) return;

    const closePopoversOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-miniapp-popover="efficiency"]')) setIsEfficiencyDetailsOpen(false);
      if (!target.closest('[data-miniapp-popover="settings"]')) setIsSettingsOpen(false);
    };
    const closePopoversOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsEfficiencyDetailsOpen(false);
      setIsSettingsOpen(false);
    };

    document.addEventListener('pointerdown', closePopoversOnOutsidePress, true);
    document.addEventListener('keydown', closePopoversOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closePopoversOnOutsidePress, true);
      document.removeEventListener('keydown', closePopoversOnEscape);
    };
  }, [isEfficiencyDetailsOpen, isSettingsOpen]);

  useEffect(() => {
    if (displayMode !== 'timeline') return;
    const intervalId = window.setInterval(() => {
      setTimelineNow(new Date());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [displayMode]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const matchesTimeFilter = (task: Task) => {
      if (timeFilter === 'all') return true;
      if (!task.dueDate) return false;

      const due = new Date(task.dueDate);
      if (Number.isNaN(due.getTime())) return false;

      if (timeFilter === 'today') {
        return due < endOfToday;
      }
      if (timeFilter === 'tomorrow') {
        const tomorrowStart = new Date(endOfToday);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        return due >= tomorrowStart && due < tomorrowEnd;
      }
      if (timeFilter === 'week') {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return due >= now && due <= weekEnd;
      }
      const monthEnd = new Date(now);
      monthEnd.setDate(monthEnd.getDate() + 30);
      return due >= now && due <= monthEnd;
    };

    const query = taskSearch.trim().toLowerCase();
    const matchesCommonFilters = (task: Task) => {
      if (task.status === 'DONE') return false;
      if (sphereFilter !== 'all') {
        const taskSphereValue = task.sphereId ?? 'without-sphere';
        if (taskSphereValue !== sphereFilter) return false;
      }
      if (!matchesTimeFilter(task)) return false;
      if (!query) return true;
      const text = [task.title, noteHtmlToPlainText(task.description ?? '', { trimEnd: true })].join(' ').toLowerCase();
      return matchesWorkspaceText(text, query);
    };

    return tasks.filter((task) => matchesCommonFilters(task) && !task.parentTaskId);
  }, [sphereFilter, taskSearch, tasks, timeFilter]);

  const timelineFilteredTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const matchesTimeFilter = (task: Task) => {
      if (timeFilter === 'all') return true;
      if (!task.dueDate) return false;

      const due = new Date(task.dueDate);
      if (Number.isNaN(due.getTime())) return false;

      if (timeFilter === 'today') return due < endOfToday;
      if (timeFilter === 'tomorrow') {
        const tomorrowStart = new Date(endOfToday);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        return due >= tomorrowStart && due < tomorrowEnd;
      }
      if (timeFilter === 'week') {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return due >= now && due <= weekEnd;
      }
      const monthEnd = new Date(now);
      monthEnd.setDate(monthEnd.getDate() + 30);
      return due >= now && due <= monthEnd;
    };

    const query = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.status === 'DONE') return false;
      if (sphereFilter !== 'all') {
        const taskSphereValue = task.sphereId ?? 'without-sphere';
        if (taskSphereValue !== sphereFilter) return false;
      }
      if (!matchesTimeFilter(task)) return false;
      if (!query) return true;
      const text = [task.title, noteHtmlToPlainText(task.description ?? '', { trimEnd: true })].join(' ').toLowerCase();
      return matchesWorkspaceText(text, query);
    });
  }, [sphereFilter, taskSearch, tasks, timeFilter]);

  const globalSearchSubtasks = useMemo(() => tasks.filter((task) => Boolean(task.parentTaskId)), [tasks]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      if (!map[task.parentTaskId]) map[task.parentTaskId] = [];
      map[task.parentTaskId].push(task);
    }
    for (const taskId of Object.keys(map)) {
      map[taskId].sort(compareByDueDate);
    }
    return map;
  }, [tasks]);

  const listTasks = useMemo(() => {
    const selectedSpheres = new Set(listSelectedSphereIds ?? spheres.map((sphere) => sphere.id));
    const isSectorSubsetSelected = listSelectedSphereIds !== null && listSelectedSphereIds.length < spheres.length;
    const result = filteredTasks.filter((task) => task.taskType !== 'EVENT' && task.taskType !== 'REMINDER' && (!isSectorSubsetSelected || Boolean(task.sphereId && selectedSpheres.has(task.sphereId))));
    result.sort((a, b) => {
      if (listSortMode === 'importance') {
        if (a.importance !== b.importance) return b.importance - a.importance;
        return compareByDueDate(a, b);
      }
      if (listSortMode === 'urgency') return compareByDueDate(a, b);

      return compareByDueDate(a, b);
    });
    return result;
  }, [filteredTasks, listSelectedSphereIds, listSortMode, spheres.length]);

  const toggleListSphereSelection = (sphereId: string) => {
    setListSelectedSphereIds((current) => {
      const normalized = current ?? spheres.map((sphere) => sphere.id);
      return normalized.includes(sphereId) ? normalized.filter((id) => id !== sphereId) : [...normalized, sphereId];
    });
  };

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const timelinePickerTasks = useMemo(() => tasks.filter(task => task.taskType !== 'REMINDER').map((task) => {
    const colorSourceTask = task.parentTaskId ? taskById.get(task.parentTaskId) ?? task : task;
    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      isSubtask: Boolean(task.parentTaskId),
      sphereColor: spheres.find((sphere) => sphere.id === colorSourceTask.sphereId)?.color ?? '#64748b',
      taskType: task.taskType
    };
  }), [spheres, taskById, tasks]);

  const overdueTasks = useMemo(() => tasks.filter((task) => task.taskType !== 'EVENT' && task.taskType !== 'REMINDER' && isOverdue(task)), [tasks]);

  const postponeAllOverdueToToday = async () => {
    if (isPostponingOverdue || overdueTasks.length === 0) return;
    setIsPostponingOverdue(true);
    setError(null);
    try {
      const today = new Date();
      await Promise.all(overdueTasks.map(async (task) => {
        const nextDueDate = new Date(task.dueDate as string);
        nextDueDate.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
        await api.updateTask(task.id, { dueDate: nextDueDate.toISOString() });
      }));
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось перенести просроченные задачи');
    } finally {
      setIsPostponingOverdue(false);
    }
  };

  const timelineToday = useMemo(() => {
    const now = timelineNow;
    const anchor = timelineAnchorDate;
    const startOfDay = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const scheduledHabits = habits
      .filter((habit) => (habit.reminderTimes?.length || habit.reminderTime) && isHabitScheduledForDate(habit, startOfDay))
      .flatMap((habit) => {
        const reminderTimes = habit.reminderTimes?.length ? habit.reminderTimes : (habit.reminderTime ? [habit.reminderTime] : []);
        return reminderTimes.map((reminderTime) => ({ habit, reminderTime }));
      })
      .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));

    const todayTasks = timelineFilteredTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        if (Number.isNaN(dueDate.getTime())) return false;
        return dueDate >= startOfDay && dueDate < endOfDay;
      })
      .sort(compareByDueDate);

    const timelineEntries = todayTasks
      .filter((task) => Boolean(task.dueDate))
      .sort(compareByDueDate);

    const quarterItemHeights = Array.from({ length: HOURS_IN_DAY * TIMELINE_QUARTERS_PER_HOUR }, () => [] as number[]);
    for (const task of timelineEntries) {
      const due = new Date(task.dueDate as string);
      const quarter = (due.getHours() * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(due.getMinutes() / 15);
      if (quarter >= 0 && quarter < quarterItemHeights.length) {
        quarterItemHeights[quarter].push(task.parentTaskId ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT);
      }
    }
    for (const { reminderTime } of scheduledHabits) {
      const [hour, minute] = reminderTime.split(':').map(Number);
      const quarter = (hour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(minute / 15);
      if (quarter >= 0 && quarter < quarterItemHeights.length) quarterItemHeights[quarter].push(TIMELINE_CARD_HEIGHT);
    }

    const quarterHeights = quarterItemHeights.map((itemHeights, quarter) => {
      if (itemHeights.length === 0) return TIMELINE_QUARTER_HEIGHT;
      const isHourStart = quarter % TIMELINE_QUARTERS_PER_HOUR === 0;
      const isHourEnd = quarter % TIMELINE_QUARTERS_PER_HOUR === TIMELINE_QUARTERS_PER_HOUR - 1;
      return itemHeights.reduce((sum, height) => sum + height, 0)
        + ((itemHeights.length - 1) * TIMELINE_CARD_GAP)
        + TIMELINE_QUARTER_PADDING
        + (isHourStart ? TIMELINE_HOUR_EDGE_PADDING : 0)
        + (isHourEnd ? TIMELINE_HOUR_EDGE_PADDING : 0);
    });
    const quarterTops: number[] = [];
    const hourTops: number[] = [];
    let totalHeight = 0;
    for (let quarter = 0; quarter < quarterHeights.length; quarter += 1) {
      if (quarter % TIMELINE_QUARTERS_PER_HOUR === 0) hourTops.push(totalHeight);
      quarterTops.push(totalHeight);
      totalHeight += quarterHeights[quarter];
    }

    const currentHour = now.getHours();
    const currentQuarter = (currentHour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(now.getMinutes() / 15);
    const currentTimeTop = quarterTops[currentQuarter] + (((now.getMinutes() % 15) / 15) * quarterHeights[currentQuarter]);
    const isCurrentDay = now.getFullYear() === anchor.getFullYear()
      && now.getMonth() === anchor.getMonth()
      && now.getDate() === anchor.getDate();
    return {
      timelineEntries,
      scheduledHabits,
      dateKey: toDateKey(startOfDay),
      currentTimeTop,
      isTodayVisible: isCurrentDay,
      hourTops,
      occupiedQuarters: new Set(quarterItemHeights.flatMap((itemHeights, quarter) => itemHeights.length > 0 ? [quarter] : [])),
      quarterHeights,
      quarterTops,
      totalHeight,
      anchorLabel: anchor.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
    };
  }, [habits, timelineAnchorDate, timelineFilteredTasks, timelineNow]);

  const timelineCalendar = useMemo(() => {
    const startOfAnchorDay = new Date(timelineAnchorDate.getFullYear(), timelineAnchorDate.getMonth(), timelineAnchorDate.getDate());
    const periodStart = new Date(startOfAnchorDay);
    if (timelineView === 'week') {
      const mondayOffset = (periodStart.getDay() + 6) % 7;
      periodStart.setDate(periodStart.getDate() - mondayOffset);
    } else if (timelineView === 'month') {
      periodStart.setDate(1);
      const mondayOffset = (periodStart.getDay() + 6) % 7;
      periodStart.setDate(periodStart.getDate() - mondayOffset);
    }
    const dayCount = timelineView === 'month' ? 42 : 7;
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(periodStart);
      date.setDate(periodStart.getDate() + index);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      const dateTasks = timelineFilteredTasks.filter((task) => {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        return !Number.isNaN(due.getTime()) && due >= date && due < nextDate;
      }).sort(compareByDueDate);
      const dateHabits = habits
        .filter((habit) => (habit.reminderTimes?.length || habit.reminderTime) && isHabitScheduledForDate(habit, date))
        .flatMap((habit) => {
          const times = habit.reminderTimes?.length ? habit.reminderTimes : (habit.reminderTime ? [habit.reminderTime] : []);
          return times.map((reminderTime) => ({ habit, reminderTime }));
        })
        .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
      return { date, dateKey: toDateKey(date), tasks: dateTasks, habits: dateHabits };
    });
    const periodEnd = days[days.length - 1]?.date ?? periodStart;
    const label = timelineView === 'month'
      ? timelineAnchorDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
      : `${periodStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${periodEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
    return { days, label };
  }, [habits, timelineAnchorDate, timelineFilteredTasks, timelineView]);

  const openDayTimeline = (date: Date) => {
    setTimelineAnchorDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    setTimelineView('day');
  };

  const sortedHabits = useMemo(() => {
    const dateKey = toDateKey(new Date());
    return habits.filter((habit) => !habit.isAutoCompleted).sort((a, b) => {
      const aCompleted = getHabitCompletedForDate(a, dateKey) >= a.targetCount;
      const bCompleted = getHabitCompletedForDate(b, dateKey) >= b.targetCount;
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aCreated - bCreated;
    });
  }, [habits]);

  const timelineHabitPlacements = useMemo(() => {
    const placements = new Map<string, { top: number }>();
    const itemsByQuarter = new Map<number, typeof timelineToday.scheduledHabits>();

    for (const entry of timelineToday.scheduledHabits) {
      const [hour, minute] = entry.reminderTime.split(':').map(Number);
      const quarter = (hour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(minute / 15);
      const bucket = itemsByQuarter.get(quarter) ?? [];
      bucket.push(entry);
      itemsByQuarter.set(quarter, bucket);
    }

    for (const [quarter, quarterHabits] of itemsByQuarter.entries()) {
      const quarterTasks = timelineToday.timelineEntries.filter((task) => {
        const due = new Date(task.dueDate as string);
        return (due.getHours() * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(due.getMinutes() / 15) === quarter;
      }).sort(compareByDueDate);
      const tasksHeight = quarterTasks.reduce(
        (height, task) => height + (task.parentTaskId ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT) + TIMELINE_CARD_GAP,
        0
      );
      const sorted = quarterHabits.slice().sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));
      for (let index = 0; index < sorted.length; index += 1) {
        const hourStartPadding = quarter % TIMELINE_QUARTERS_PER_HOUR === 0 ? TIMELINE_HOUR_EDGE_PADDING : 0;
        placements.set(`${sorted[index].habit.id}-${sorted[index].reminderTime}`, { top: timelineToday.quarterTops[quarter] + tasksHeight + (index * (TIMELINE_CARD_HEIGHT + TIMELINE_CARD_GAP)) + 4 + hourStartPadding });
      }
    }

    return placements;
  }, [timelineToday.quarterTops, timelineToday.scheduledHabits, timelineToday.timelineEntries]);

  const timelineTaskPlacements = useMemo(() => {
    const placements = new Map<string, { top: number }>();
    const tasksByQuarter = new Map<number, Task[]>();

    for (const task of timelineToday.timelineEntries) {
      const due = new Date(task.dueDate as string);
      const quarter = (due.getHours() * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(due.getMinutes() / 15);
      const bucket = tasksByQuarter.get(quarter) ?? [];
      bucket.push(task);
      tasksByQuarter.set(quarter, bucket);
    }

    for (const [quarter, tasks] of tasksByQuarter.entries()) {
      const sorted = tasks.slice().sort(compareByDueDate);
      let offset = 4 + (quarter % TIMELINE_QUARTERS_PER_HOUR === 0 ? TIMELINE_HOUR_EDGE_PADDING : 0);
      for (let index = 0; index < sorted.length; index += 1) {
        const top = timelineToday.quarterTops[quarter] + offset;
        placements.set(sorted[index].id, { top });
        offset += (sorted[index].parentTaskId ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT) + TIMELINE_CARD_GAP;
      }
    }

    return placements;
  }, [timelineToday.quarterTops, timelineToday.timelineEntries]);

  const isLightTheme = effectiveMiniTheme === 'light';
  const getMiniWindowMotionClass = (windowName: string) => closingMiniWindow === windowName ? 'miniapp-window-closing' : 'miniapp-window-opening';
  const closeMiniWindowWithMotion = (windowName: string, close: () => void) => {
    setClosingMiniWindow(windowName);
    window.setTimeout(() => {
      close();
      setClosingMiniWindow((current) => (current === windowName ? null : current));
    }, windowName === 'ai-chat' ? 140 : 220);
  };

  const selectedSphereName = sphereFilter === 'all'
    ? 'Все секторы'
    : sphereFilter === 'without-sphere'
      ? 'Без сектора'
      : (spheres.find((sphere) => sphere.id === sphereFilter)?.name ?? 'Без сектора');
  const efficiencyScore = currentUser?.efficiencyScore ?? 0;
  const formattedEfficiencyScore = efficiencyScore.toFixed(1).replace(/\.0$/, '');
  const formatRatingDelta = (value: number) => value.toFixed(1).replace(/\.0$/, '');
  const efficiencyGradeMessage = efficiencyScore < 30
    ? 'Средний рейтинг. Сделайте следующий маленький шаг.'
    : efficiencyScore < 70
      ? 'Хороший рейтинг. Так держать.'
      : 'Отличный рейтинг! Продолжай в том же духе.';

  const openTaskModal = (task: Task) => {
    const initialDraft = taskToMiniDraft(task);
    taskDraftOriginalByIdRef.current[task.id] = initialDraft;
    setDraftByTaskId((drafts) => ({ ...drafts, [task.id]: initialDraft }));
    const subtasks = subtasksByParent[task.id] ?? [];
    for (const subtask of subtasks) {
      const subtaskDraft = { title: subtask.title, description: subtask.description ?? '', dueDate: toInputDateTime(subtask.dueDate) };
      taskDraftOriginalByIdRef.current[subtask.id] = subtaskDraft;
      setDraftByTaskId((drafts) => ({ ...drafts, [subtask.id]: subtaskDraft }));
    }
    setClosingMiniWindow(null);
    setIsCalendarExportOpen(false);
    setCalendarExportTaskId(null);
    setOpenedTaskSubtaskAuthorFilterUserId(null);
    setIsOpenedTaskSubtaskFilterOpen(false);
    setOpenedTaskId(task.id);
  };

  const openSubtaskModal = (subtask: Task, options: { focusTitle?: boolean } = {}) => {
    const existingSubtaskDraft = taskDraftOriginalByIdRef.current[subtask.id];
    if (!existingSubtaskDraft) {
      taskDraftOriginalByIdRef.current[subtask.id] = { title: subtask.title, description: subtask.description ?? '', dueDate: toInputDateTime(subtask.dueDate) };
    }
    setNewSubtaskDraft(null);
    setDraftByTaskId((drafts) => ({
      ...drafts,
      [subtask.id]: drafts[subtask.id] ?? {
        title: subtask.title,
        description: subtask.description ?? '',
        dueDate: toInputDateTime(subtask.dueDate)
      }
    }));
    pendingSubtaskTitleFocusIdRef.current = options.focusTitle ? subtask.id : null;
    setClosingMiniWindow(null);
    setOpenedSubtaskId(subtask.id);
  };

  const openAiTaskReference = (task: Task) => {
    if (task.parentTaskId) {
      openSubtaskModal(task);
      return;
    }
    openTaskModal(task);
  };

  useEffect(() => {
    if (!launchParams.taskId || loading || tasks.length === 0 || openedTaskId) return;
    const requestedTask = tasks.find((task) => task.id === launchParams.taskId && !task.parentTaskId);
    if (!requestedTask) return;
    openTaskModal(requestedTask);
    if (launchParams.chatRecipientUserId) {
      setAiRecipientByTaskId((prev) => ({ ...prev, [requestedTask.id]: launchParams.chatRecipientUserId! }));
    }
    if (launchParams.openAi) setIsAiDialogOpen(true);
    if (launchParams.commentTaskId) setPendingLaunchCommentTaskId(launchParams.commentTaskId);
  }, [launchParams, loading, openedTaskId, tasks]);

  // Telegram Bot deep links to the EXACT monitored conversation, not quick AI.
  const openedTelegramLinkRef = useRef(false);
  useEffect(() => {
    if (openedTelegramLinkRef.current || loading || !currentUser?.id ||
        !aiChatProjectsSyncReadyRef.current) return;
    const policyId = launchParams.openTelegramAiChat;
    if (policyId) {
      const chatId = 'telegram-ai-assistant:' + policyId;
      const project = aiChatProjects.find(p => p.id === 'telegram-ai-assistant-project' &&
        p.chats.some(chat => chat.id === chatId));
      if (!project) return;
      openedTelegramLinkRef.current = true;
      setActiveAiChatProjectId(project.id);
      setActiveAiChatId(chatId);
    } else if (launchParams.openQuickAi) {
      const project = aiChatProjects.find(p => p.chats.some(chat => chat.id === QUICK_AI_CHAT_ID));
      if (!project) return;
      openedTelegramLinkRef.current = true;
      setActiveAiChatProjectId(project.id);
      setActiveAiChatId(QUICK_AI_CHAT_ID);
    } else return;
    setIsQuickCreateOpen(false);
    setIsAiChatMenuOpen(false);
    setIsAiChatOpen(true);
  }, [launchParams.openQuickAi, launchParams.openTelegramAiChat, loading, currentUser?.id, aiChatProjects]);

  const closeTaskModal = () => {
    setOpenedTaskId(null);
    setOpenedSubtaskId(null);
    setNewSubtaskDraft(null);
    setIsTaskSettingsOpen(false);
    setIsCollaborationSettingsOpen(false);
    setIsCalendarExportOpen(false);
    setCalendarExportTaskId(null);
    setIsTaskNotesEditorOpen(false);
    setIsSubtaskNotesEditorOpen(false);
    setIsAiDialogOpen(false);
    taskAiDraftValueRef.current = '';
    taskAiComposerRef.current?.clearDraft();
    setTaskAttachments([]);
    setTaskRecurrenceNextDueLabel(null);
  };

  const onChangeDraft = (taskId: string, patch: Partial<TaskDraft>) => {
    setDraftByTaskId((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] ?? { title: '', description: '', dueDate: '' }),
        ...patch
      }
    }));
  };

  const saveTask = async (taskId: string) => {
    const draft = draftByTaskId[taskId];
    if (!draft) return false;
    const savedTask = tasks.find((item) => item.id === taskId);
    const baseline = taskDraftOriginalByIdRef.current[taskId] ??
      (savedTask ? taskToMiniDraft(savedTask) : draft);
    const changed = changedDraftFields(baseline, draft, Object.keys(draft) as Array<keyof TaskDraft>);
    // No manual edits: AI changes already live on the server. Do not send
    // old title/deadline/description on pressing the window's X button.
    if (Object.keys(changed).length === 0) return true;
    setSavingId(taskId);
    setError(null);
    try {
      await api.updateTask(taskId, {
        ...(changed.title !== undefined ? { title: draft.title.trim() || (savedTask?.taskType === 'EVENT' ? 'Событие без названия' : 'Задача без названия') } : {}),
        ...(changed.location !== undefined ? { location: draft.location?.trim() || null } : {}),
        ...(changed.description !== undefined ? { description: draft.description.trim() || null } : {}),
        ...(changed.dueDate !== undefined ? { dueDate: fromInputDateTime(draft.dueDate) } : {}),
        ...(changed.sphereId !== undefined ? { sphereId: draft.sphereId } : {}),
        ...(changed.notifyBeforeMinutes !== undefined ? { notifyBeforeMinutes: draft.notifyBeforeMinutes } : {}),
        ...(changed.importance !== undefined ? { importance: draft.importance } : {}),
        ...(changed.isRecurring !== undefined ? { isRecurring: draft.isRecurring } : {}),
        ...(changed.recurrenceText !== undefined ? { recurrenceText: draft.recurrenceText?.trim() || null } : {}),
        ...(changed.recurrenceJson !== undefined ? { recurrenceJson: draft.recurrenceJson } : {}),
        ...(changed.recurrenceSummary !== undefined ? { recurrenceSummary: draft.recurrenceSummary } : {}),
        ...(changed.recurrenceUntil !== undefined ? { recurrenceUntil: draft.recurrenceUntil } : {}),
        ...(changed.aiNotificationsEnabled !== undefined ? { aiNotificationsEnabled: draft.aiNotificationsEnabled } : {}),
        ...(changed.aiMonitoringEnabled !== undefined ? { aiMonitoringEnabled: draft.aiMonitoringEnabled } : {})
      });
      taskDraftOriginalByIdRef.current[taskId] = { ...baseline, ...changed };
      await loadData();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить задачу');
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const saveAndCloseTaskEditor = async (taskId: string, editor: 'task' | 'subtask') => {
    if (savingId === taskId) return;
    const saved = await saveTask(taskId);
    if (!saved) return;
    closeMiniWindowWithMotion(editor, editor === 'task' ? closeTaskModal : () => setOpenedSubtaskId(null));
  };

  const completeTask = async (taskId: string, scope?: 'me' | 'all') => {
    const task = tasks.find((item) => item.id === taskId);
    if (task?.isCollaborative && task.collaborationOwner && !scope) {
      setCollaborationAction({ task, action: 'complete' });
      return;
    }
    setCompletingId(taskId);
    setError(null);
    try {
      const completed = tasks.find((item) => item.id === taskId);
      const updatedTask = await api.updateTask(taskId, { status: 'DONE', collaborationScope: scope ?? 'me' });
      setTasks((current) => current.map((item) => item.id === taskId ? updatedTask : item));

      if (!completed?.parentTaskId && openedTaskId === taskId) {
        setDraftByTaskId((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        closeTaskModal();
      }

      if (completed?.parentTaskId) {
        const siblings = tasks.filter((item) => item.parentTaskId === completed.parentTaskId && item.id !== taskId);
        const allOthersDone = siblings.every((item) => item.status === 'DONE');
        if (allOthersDone) {
          const shouldCloseParent = window.confirm('Это была последняя подзадача. Закрыть основную задачу?');
          if (shouldCloseParent) await api.updateTask(completed.parentTaskId, { status: 'DONE' });
        }
      }
      await loadData();
      // Only closing an existing subtask from its editor should dismiss the sheet.
      // Keep the "Вернуть" flow and the parent-task confirmation unchanged.
      if (completed?.parentTaskId && openedSubtaskId === taskId) {
        closeMiniWindowWithMotion('subtask', () => setOpenedSubtaskId(null));
      }
      if (completed && !completed.parentTaskId && completed.taskType !== 'EVENT' && completed.taskType !== 'REMINDER'
        && !completed.isRecurring && currentUser?.offerTaskCompletionReport !== false) {
        setReportPromptTask(completed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось завершить задачу');
    } finally {
      setCompletingId(null);
    }
  };

  const toggleFocusSubtaskStatus = async (subtask: Task) => {
    // This checkbox updates only the subtask status and never auto-finishes its parent.
    if (!openedTaskId || subtask.parentTaskId !== openedTaskId || updatingFocusSubtasksRef.current.has(subtask.id)) return;
    const nextStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    updatingFocusSubtasksRef.current.add(subtask.id);
    setUpdatingFocusSubtaskIds((current) => [...current, subtask.id]);
    setError(null);
    // Keep the same viewport when a finished subtask is returned to active.
    // The active/finished sort moves rows and otherwise triggers scroll anchoring.
    if (nextStatus === 'TODO' && openedTaskContentsScrollRef.current) {
      pendingOpenedTaskScrollTopRef.current = openedTaskContentsScrollRef.current.scrollTop;
    }
    // Keep a newly checked item on screen, so the same checkbox can undo it.
    if (nextStatus === 'DONE') setHideClosedOpenedTaskSubtasks(false);
    setTasks((current) => current.map((item) =>
      item.id === subtask.id ? { ...item, status: nextStatus } : item
    ));
    try {
      const saved = await api.updateTask(subtask.id, { status: nextStatus });
      setTasks((current) => current.map((item) =>
        item.id === subtask.id ? { ...item, ...saved } : item
      ));
    } catch (error) {
      setTasks((current) => current.map((item) =>
        item.id === subtask.id ? { ...item, status: subtask.status } : item
      ));
      setError(error instanceof Error ? error.message : 'Не удалось изменить статус подзадачи');
    } finally {
      updatingFocusSubtasksRef.current.delete(subtask.id);
      setUpdatingFocusSubtaskIds((current) => current.filter((id) => id !== subtask.id));
    }
  };

  const restoreOpenedSubtask = async (subtask: Task) => {
    if (subtask.status !== 'DONE' || completingId === subtask.id) return;
    setCompletingId(subtask.id);
    setError(null);
    if (openedTaskContentsScrollRef.current) {
      pendingOpenedTaskScrollTopRef.current = openedTaskContentsScrollRef.current.scrollTop;
    }
    try {
      const updated = await api.updateTask(subtask.id, { status: 'TODO' });
      setTasks((current) => current.map((item) => item.id === subtask.id ? { ...item, ...updated } : item));
    } catch (cause) {
      pendingOpenedTaskScrollTopRef.current = null;
      setError(cause instanceof Error ? cause.message : 'Не удалось вернуть подзадачу');
    } finally {
      setCompletingId(null);
    }
  };

  const deleteTask = async (taskId: string, scope?: 'me' | 'all') => {
    const task = tasks.find((item) => item.id === taskId);
    if (task?.isCollaborative && task.collaborationOwner && !scope) {
      setCollaborationAction({ task, action: 'delete' });
      return;
    }
    setDeletingId(taskId);
    setError(null);
    try {
      await api.deleteTask(taskId, scope ?? 'me');
      if (openedTaskId === taskId) {
        closeTaskModal();
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить задачу');
    } finally {
      setDeletingId(null);
    }
  };

  const openCreateSubtaskModal = () => {
    setOpenedSubtaskId(null);
    setNewSubtaskDraft({ title: '', description: '', dueDate: '' });
    pendingSubtaskTitleFocusIdRef.current = 'new-subtask';
    setClosingMiniWindow(null);
  };

  const cancelCreateSubtask = () => {
    setNewSubtaskDraft(null);
    setIsSubtaskNotesEditorOpen(false);
  };

  const createSubtask = async (parentTask: Task) => {
    if (!newSubtaskDraft || creatingSubtaskForId === parentTask.id) return;
    setCreatingSubtaskForId(parentTask.id);
    setError(null);
    try {
      await api.createTask({
        title: newSubtaskDraft.title.trim() || 'Новая подзадача',
        description: newSubtaskDraft.description.trim() || null,
        parentTaskId: parentTask.id,
        sphereId: parentTask.sphereId ?? null,
        dueDate: fromInputDateTime(newSubtaskDraft.dueDate)
      });
      await loadData();
      closeMiniWindowWithMotion('subtask', cancelCreateSubtask);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать подзадачу');
    } finally {
      setCreatingSubtaskForId(null);
    }
  };

  const createEmptyTaskDraft = (): TaskDraft => ({
    title: '',
    description: '',
    dueDate: '',
    sphereId: sphereFilter === 'all' || sphereFilter === 'without-sphere' ? null : sphereFilter,
    notifyBeforeMinutes: 0,
    importance: 3,
    isRecurring: false,
    recurrenceText: '',
    recurrenceJson: null,
    recurrenceSummary: null,
    recurrenceUntil: null,
    aiNotificationsEnabled: aiNotificationDefault,
    aiMonitoringEnabled: false,
    subtasks: []
  });

  const openCreateTaskModal = (dueDate?: Date, editorType: 'task' | 'event' = 'task') => {
    const draft = createEmptyTaskDraft();
    const notifyBeforeMinutes = editorType === 'event' ? 60 : 0;
    setCreateEditorType(editorType);
    setCreateTaskDraft({
      ...draft,
      ...(dueDate ? { dueDate: toInputDateTime(dueDate.toISOString()) } : {}),
      location: '',
      notifyBeforeMinutes
    });
    setCreateTaskNotifyPreset(String(notifyBeforeMinutes));
    setCreateTaskRecurrenceNextDueLabel(null);
    setIsCreateTaskSettingsOpen(false);
    setClosingMiniWindow(null);
    setIsCreateTaskModalOpen(true);
  };

  const openCreateTaskModalForTimelineQuarter = (quarterIndex: number) => {
    const dueDate = new Date(
      timelineAnchorDate.getFullYear(),
      timelineAnchorDate.getMonth(),
      timelineAnchorDate.getDate(),
      Math.floor(quarterIndex / TIMELINE_QUARTERS_PER_HOUR),
      (quarterIndex % TIMELINE_QUARTERS_PER_HOUR) * 15
    );
    openCreateTaskModal(dueDate);
  };

  const moveTimelinePeriod = (direction: -1 | 1) => {
    setTimelineAnchorDate((previous) => {
      const next = new Date(previous);
      if (timelineView === 'month') next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * (timelineView === 'week' ? 7 : 1));
      return next;
    });
  };

  const applyCreateTaskRecurrence = async () => {
    const text = createTaskDraft.recurrenceText?.trim() ?? '';
    if (!text) return;
    setCreateTaskRecurrenceLoading(true);
    setError(null);
    try {
      const parsed = await api.parseRecurrence({ text });
      setCreateTaskDraft((prev) => ({
        ...prev,
        isRecurring: true,
        recurrenceText: text,
        recurrenceJson: parsed.schedule,
        recurrenceSummary: parsed.summary,
        recurrenceUntil: parsed.schedule.until
      }));
      setCreateTaskRecurrenceNextDueLabel(parsed.nextDueDate ? formatDueDate(parsed.nextDueDate) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось настроить повторение');
    } finally {
      setCreateTaskRecurrenceLoading(false);
    }
  };

  const applyTaskRecurrence = async (taskId: string) => {
    const text = draftByTaskId[taskId]?.recurrenceText?.trim() ?? '';
    if (!text) return;
    setTaskRecurrenceLoading(true);
    setError(null);
    try {
      const parsed = await api.parseRecurrence({ text });
      onChangeDraft(taskId, {
        isRecurring: true,
        recurrenceText: text,
        recurrenceJson: parsed.schedule,
        recurrenceSummary: parsed.summary,
        recurrenceUntil: parsed.schedule.until
      });
      setTaskRecurrenceNextDueLabel(parsed.nextDueDate ? formatDueDate(parsed.nextDueDate) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось настроить повторение');
    } finally {
      setTaskRecurrenceLoading(false);
    }
  };

  const createTask = async () => {
    setIsCreatingTask(true);
    setError(null);
    try {
      const createdTask = await api.createTask({
        title: createTaskDraft.title.trim() || (createEditorType === 'event' ? 'Новое событие' : 'Новая задача'),
        taskType: createEditorType === 'event' ? 'EVENT' : 'TASK',
        location: createEditorType === 'event' ? (createTaskDraft.location?.trim() || null) : null,
        description: createTaskDraft.description.trim() || null,
        dueDate: fromInputDateTime(createTaskDraft.dueDate),
        sphereId: createTaskDraft.sphereId ?? null,
        notifyBeforeMinutes: createTaskDraft.notifyBeforeMinutes ?? null,
        importance: createTaskDraft.importance ?? 3,
        isRecurring: createTaskDraft.isRecurring ?? false,
        recurrenceText: createTaskDraft.isRecurring ? (createTaskDraft.recurrenceText?.trim() || null) : null,
        recurrenceJson: createTaskDraft.isRecurring ? (createTaskDraft.recurrenceJson ?? null) : null,
        recurrenceSummary: createTaskDraft.isRecurring ? (createTaskDraft.recurrenceSummary ?? null) : null,
        recurrenceUntil: createTaskDraft.isRecurring ? (createTaskDraft.recurrenceUntil ?? null) : null,
        aiNotificationsEnabled: createTaskDraft.aiNotificationsEnabled ?? true,
        aiMonitoringEnabled: createEditorType === 'task' && createTaskDraft.aiMonitoringEnabled === true
      });
      const draftSubtasks = (createEditorType === 'event' ? [] : (createTaskDraft.subtasks ?? []))
        .map((subtask) => ({
          title: subtask.title.trim(),
          description: subtask.description.trim(),
          dueDate: subtask.dueDate
        }))
        .filter((subtask) => subtask.title || subtask.description || subtask.dueDate);
      for (const subtask of draftSubtasks) {
        await api.createTask({
          title: subtask.title || 'Новая подзадача',
          description: subtask.description || null,
          parentTaskId: createdTask.id,
          sphereId: createTaskDraft.sphereId ?? null,
          dueDate: fromInputDateTime(subtask.dueDate),
          importance: createTaskDraft.importance ?? 3
        });
      }
      let uploadError: string | null = null;
      if (createEditorType === 'event') {
        for (const file of createTaskPendingFiles) {
          try {
            await api.createTaskAttachment(createdTask.id, await fileToAttachmentPayload(file));
          } catch (cause) {
            uploadError = cause instanceof Error ? cause.message : 'Не удалось загрузить вложение';
            break;
          }
        }
      }
      await loadData();
      setIsCreateTaskModalOpen(false);
      if (uploadError) {
        // The event already exists. Open it instead of leaving the creation
        // form active, which could otherwise create a duplicate on retry.
        openTaskModal(createdTask);
        setError('Событие создано, но не все вложения загрузились: ' + uploadError);
      }
      setCreateTaskDraft(createEmptyTaskDraft());
      setCreateEditorType('task');
      setIsCreateTaskSettingsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Не удалось создать ${createEditorType === 'event' ? 'событие' : 'задачу'}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openCreateHabitModal = () => {
    setError(null);
    setIsHabitSettingsOpen(false);
    setEditingHabitId(null);
    setHabitDraft(createEmptyHabitDraft());
    setIsCustomHabitIconOpen(false);
    setCustomHabitIconDraft('');
    setClosingMiniWindow(null);
    setIsHabitModalOpen(true);
  };

  const openEditHabitModal = (habit: Habit) => {
    setError(null);
    setIsHabitSettingsOpen(false);
    setClosingMiniWindow(null);
    setEditingHabitId(habit.id);
    setHabitDraft(habitToDraft(habit));
    setIsCustomHabitIconOpen(!HABIT_ICON_OPTIONS.includes(habit.icon || ''));
    setCustomHabitIconDraft(HABIT_ICON_OPTIONS.includes(habit.icon || '') ? '' : (habit.icon || ''));
    setIsHabitModalOpen(true);
  };

  const closeHabitModal = () => {
    setIsHabitSettingsOpen(false);
    setIsHabitModalOpen(false);
    setEditingHabitId(null);
    setHabitDraft(createEmptyHabitDraft());
    setIsCustomHabitIconOpen(false);
    setCustomHabitIconDraft('');
  };

  const recordMiniAppEfficiencyBonus = async (delta: number) => {
    try {
      const updatedRating = await api.recordEfficiencyEvent({ delta, bucket: 'habit' });
      setCurrentUser((user) => user ? { ...user, ...updatedRating } : user);
    } catch (error) {
      console.error('Failed to persist mini app efficiency bonus', error);
    }
  };

  const saveHabit = async () => {
    setSavingHabit(true);
    setError(null);
    try {
      const payload: Partial<Habit> = {
        name: habitDraft.name.trim() || 'Новая привычка',
        icon: habitDraft.icon,
        color: habitDraft.color,
        targetCount: parseHabitTargetCount(habitDraft.targetCount),
        recurrenceType: habitDraft.recurrenceType,
        intervalDays: habitDraft.recurrenceType === 'INTERVAL' ? habitDraft.intervalDays : null,
        weekdays: habitDraft.recurrenceType === 'WEEKDAYS' ? habitDraft.weekdays : [],
        reminderTime: normalizeHabitReminderTimes(habitDraft.reminderTimes)[0] ?? null,
        reminderTimes: normalizeHabitReminderTimes(habitDraft.reminderTimes),
        durationMode: habitDraft.durationMode,
        endDate: habitDraft.durationMode === 'UNTIL_DATE' ? habitDraft.endDate || null : null,
        totalRepeatTarget: habitDraft.durationMode === 'REPEAT_COUNT' ? parseHabitTotalRepeatTarget(habitDraft.totalRepeatTarget) : null
      };
      if (editingHabitId) await api.updateHabit(editingHabitId, payload);
      else {
        await api.createHabit(payload);
        void recordMiniAppEfficiencyBonus(MINIAPP_EFFICIENCY_BONUSES.createdHabit);
      }
      await loadData();
      if (editingHabitId) closeMiniWindowWithMotion('habit', closeHabitModal);
      else closeHabitModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить привычку');
    } finally {
      setSavingHabit(false);
    }
  };

  const deleteHabit = async (habitId: string) => {
    setDeletingHabitId(habitId);
    setError(null);
    try {
      await api.deleteHabit(habitId);
      await loadData();
      closeHabitModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить привычку');
    } finally {
      setDeletingHabitId(null);
    }
  };

  const finishHabit = async (habitId: string) => {
    const confirmed = window.confirm('Завершить привычку? Она исчезнет из активных привычек, но вся статистика выполнения сохранится.');
    if (!confirmed) return;

    setFinishingHabitId(habitId);
    setError(null);
    try {
      await api.finishHabit(habitId);
      setHabits((currentHabits) => currentHabits.filter((habit) => habit.id !== habitId));
      closeHabitModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось завершить привычку');
    } finally {
      setFinishingHabitId(null);
    }
  };

  const updateHabitCompletionLocally = (habitId: string, dateKey: string, delta: number) => {
    setHabits((currentHabits) => currentHabits.map((currentHabit) => {
      if (currentHabit.id !== habitId) return currentHabit;
      const currentStats = currentHabit.stats ?? [];
      const stat = currentStats.find((item) => item.dateKey === dateKey);
      const nextAmount = Math.min(currentHabit.targetCount, Math.max(0, (stat?.amount ?? 0) + delta));

      if (!stat && nextAmount > 0) return { ...currentHabit, stats: [{ dateKey, amount: nextAmount, events: 1 }, ...currentStats] };
      if (!stat) return currentHabit;
      if (nextAmount <= 0) return { ...currentHabit, stats: currentStats.filter((item) => item.dateKey !== dateKey) };

      return {
        ...currentHabit,
        stats: currentStats.map((item) => item.dateKey === dateKey
          ? { ...item, amount: nextAmount, events: Math.max(0, item.events + (delta > 0 ? 1 : -1)) }
          : item)
      };
    }));
  };

  const completeHabit = async (habit: Habit) => {
    const dateKey = toDateKey(new Date());
    const completed = getHabitCompletedForDate(habit, dateKey);
    if (completed >= habit.targetCount || completingHabitIds.includes(habit.id)) return;

    setCompletedHabitPulseId(habit.id);
    setCompletingHabitIds((ids) => ids.includes(habit.id) ? ids : [...ids, habit.id]);
    setError(null);
    updateHabitCompletionLocally(habit.id, dateKey, 1);
    try {
      const updatedHabit = await api.completeHabit(habit.id, { dateKey, amount: 1, completedAt: new Date().toISOString() });
      void recordMiniAppEfficiencyBonus(MINIAPP_EFFICIENCY_BONUSES.doneHabit);
      if (!habit.isAutoCompleted && updatedHabit.isAutoCompleted) {
        void recordMiniAppEfficiencyBonus(MINIAPP_EFFICIENCY_BONUSES.completedHabit);
      }
      setHabits((currentHabits) => updatedHabit.isAutoCompleted
        ? currentHabits.filter((currentHabit) => currentHabit.id !== updatedHabit.id)
        : currentHabits.map((currentHabit) => currentHabit.id === updatedHabit.id ? updatedHabit : currentHabit));
      window.setTimeout(() => setCompletedHabitPulseId((current) => current === habit.id ? null : current), 650);
    } catch (e) {
      setCompletedHabitPulseId(null);
      setHabits((currentHabits) => currentHabits.map((currentHabit) => currentHabit.id === habit.id ? habit : currentHabit));
      setError(e instanceof Error ? e.message : 'Не удалось отметить привычку');
    } finally {
      setCompletingHabitIds((ids) => ids.filter((id) => id !== habit.id));
    }
  };

  const uncompleteHabit = async (habit: Habit) => {
    const dateKey = toDateKey(new Date());
    const completed = getHabitCompletedForDate(habit, dateKey);
    if (completed <= 0 || completingHabitIds.includes(habit.id)) return;

    setCompletingHabitIds((ids) => ids.includes(habit.id) ? ids : [...ids, habit.id]);
    setError(null);
    updateHabitCompletionLocally(habit.id, dateKey, -1);
    try {
      const updatedHabit = await api.uncompleteHabit(habit.id, { dateKey, amount: 1 });
      setHabits((currentHabits) => currentHabits.map((currentHabit) => currentHabit.id === updatedHabit.id ? updatedHabit : currentHabit));
    } catch (e) {
      setHabits((currentHabits) => currentHabits.map((currentHabit) => currentHabit.id === habit.id ? habit : currentHabit));
      setError(e instanceof Error ? e.message : 'Не удалось снять отметку привычки');
    } finally {
      setCompletingHabitIds((ids) => ids.filter((id) => id !== habit.id));
    }
  };

  const clearHabitLongPressTimer = () => {
    if (habitLongPressTimerRef.current !== null) {
      window.clearTimeout(habitLongPressTimerRef.current);
      habitLongPressTimerRef.current = null;
    }
  };

  const startHabitPress = (habit: Habit) => {
    clearHabitLongPressTimer();
    habitLongPressTriggeredRef.current = false;
    habitLongPressTimerRef.current = window.setTimeout(() => {
      habitLongPressTriggeredRef.current = true;
      void completeHabit(habit);
    }, LONG_PRESS_MS);
  };

  const finishHabitPress = (habit: Habit) => {
    clearHabitLongPressTimer();
    if (habitLongPressTriggeredRef.current) {
      window.setTimeout(() => { habitLongPressTriggeredRef.current = false; }, 0);
      return;
    }
    openEditHabitModal(habit);
  };

  const cancelHabitPress = () => {
    clearHabitLongPressTimer();
    window.setTimeout(() => { habitLongPressTriggeredRef.current = false; }, 0);
  };

  const editingHabit = editingHabitId ? habits.find((habit) => habit.id === editingHabitId) ?? null : null;
  const habitModalDateKey = toDateKey(new Date());
  const habitModalCompleted = editingHabit ? Math.min(getHabitCompletedForDate(editingHabit, habitModalDateKey), editingHabit.targetCount) : 0;
  const isHabitCompletionActionPending = editingHabit ? completingHabitIds.includes(editingHabit.id) : false;
  const closeHabitEditor = () => {
    if (!editingHabit || savingHabit) return;
    const original = habitToDraft(editingHabit);
    if (JSON.stringify(habitDraft) === JSON.stringify(original)) {
      closeMiniWindowWithMotion('habit', closeHabitModal);
      return;
    }
    void saveHabit();
  };
  const renderHabitSettingsFields = () => (
    <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Иконка</label>
                <div className="flex flex-wrap gap-2">
                  {HABIT_ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => {
                        setHabitDraft((prev) => ({ ...prev, icon }));
                        setIsCustomHabitIconOpen(false);
                        setCustomHabitIconDraft('');
                      }}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-lg ${habitDraft.icon === icon ? 'border-sky-400 bg-sky-500/20' : 'border-slate-600 bg-slate-800'}`}
                    >
                      {icon}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomHabitIconOpen((prev) => !prev)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-lg ${isCustomHabitIconOpen ? 'border-sky-400 bg-sky-500/20' : 'border-slate-600 bg-slate-800'}`}
                    aria-label="Выбрать свой эмодзи"
                    title="Выбрать свой эмодзи"
                  >
                    <Plus size={17} />
                  </button>
                </div>
                {isCustomHabitIconOpen ? (
                  <input
                    value={customHabitIconDraft}
                    onChange={(event) => {
                      const icon = normalizeCustomHabitIcon(event.target.value);
                      setCustomHabitIconDraft(icon);
                      if (icon) setHabitDraft((prev) => ({ ...prev, icon }));
                    }}
                    placeholder="Вставьте свой эмодзи"
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                    inputMode="text"
                    aria-label="Свой эмодзи для привычки"
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Цвет круга</label>
                <div className="flex flex-wrap gap-2">
                  {HABIT_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setHabitDraft((prev) => ({ ...prev, color }))}
                      className={`h-9 w-9 rounded-full border-2 ${habitDraft.color === color ? 'border-white' : 'border-slate-700'}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Выбрать цвет ${color}`}
                    />
                  ))}
                  <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-200" aria-label="Выбрать свой цвет">
                    <Palette size={18} />
                    <input
                      type="color"
                      value={habitDraft.color}
                      onChange={(event) => setHabitDraft((prev) => ({ ...prev, color: event.target.value }))}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Повторов в день</label>
                <div className="miniapp-habit-stepper grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-xl border">
                  <button
                    type="button"
                    onClick={() => setHabitDraft((prev) => ({ ...prev, targetCount: String(Math.max(1, parseHabitTargetCount(prev.targetCount) - 1)) }))}
                    className="miniapp-habit-stepper-button miniapp-habit-stepper-button-minus inline-flex h-11 items-center justify-center disabled:opacity-50"
                    disabled={parseHabitTargetCount(habitDraft.targetCount) <= 1}
                    aria-label="Уменьшить количество повторов"
                  >
                    <Minus size={16} />
                  </button>
                  <div className="miniapp-habit-stepper-value text-center text-base font-semibold">{parseHabitTargetCount(habitDraft.targetCount)}</div>
                  <button
                    type="button"
                    onClick={() => setHabitDraft((prev) => ({ ...prev, targetCount: String(Math.min(99, parseHabitTargetCount(prev.targetCount) + 1)) }))}
                    className="miniapp-habit-stepper-button miniapp-habit-stepper-button-plus inline-flex h-11 items-center justify-center disabled:opacity-50"
                    disabled={parseHabitTargetCount(habitDraft.targetCount) >= 99}
                    aria-label="Увеличить количество повторов"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Уведомления</label>
                <input
                  ref={habitReminderTimeInputRef}
                  type="time"
                  value={habitDraft.reminderTime}
                  onChange={(event) => {
                    const nextTime = event.target.value;
                    setHabitDraft((prev) => ({
                      ...prev,
                      reminderTime: nextTime,
                      reminderTimes: nextTime ? normalizeHabitReminderTimes([...prev.reminderTimes, nextTime]) : prev.reminderTimes
                    }));
                  }}
                  className="sr-only"
                  aria-label="Время нового уведомления"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {habitDraft.reminderTimes.map((time) => (
                    <span key={time} className="miniapp-habit-reminder-chip inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium text-slate-200">
                      {time}
                      <button
                        type="button"
                        onClick={() => setHabitDraft((prev) => {
                          const reminderTimes = prev.reminderTimes.filter((item) => item !== time);
                          return { ...prev, reminderTimes, reminderTime: reminderTimes[0] ?? '' };
                        })}
                        className="text-slate-400 hover:text-rose-200"
                        aria-label={`Удалить уведомление ${time}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const input = habitReminderTimeInputRef.current;
                      if (!input) return;
                      const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
                      if (pickerInput.showPicker) pickerInput.showPicker();
                      else pickerInput.click();
                    }}
                    className="miniapp-habit-add-reminder inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold"
                    aria-label="Добавить уведомление"
                  >
                    <Plus size={15} strokeWidth={2.5} />
                    {!habitDraft.reminderTimes.length ? <span>Добавить уведомление</span> : null}
                  </button>
                </div>
              </div>

              <div className="miniapp-habit-recurrence-panel space-y-3 rounded-lg border p-3">
                <label className="block text-xs text-slate-300">Продолжительность привычки</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {([
                    ['FOREVER', 'Постоянно'],
                    ['UNTIL_DATE', 'До даты'],
                    ['REPEAT_COUNT', 'По повторам']
                  ] as Array<[HabitDurationMode, string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setHabitDraft((prev) => ({ ...prev, durationMode: mode }))}
                      className={`miniapp-habit-duration-option rounded-full border px-2 py-2 ${habitDraft.durationMode === mode ? 'miniapp-habit-duration-option-active' : 'miniapp-habit-weekday-muted'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {habitDraft.durationMode === 'UNTIL_DATE' ? (
                  <input
                    type="date"
                    value={habitDraft.endDate}
                    onChange={(event) => setHabitDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                    className="miniapp-habit-field w-full rounded-md border px-3 py-2 text-sm"
                  />
                ) : null}
                {habitDraft.durationMode === 'REPEAT_COUNT' ? (
                  <div className="miniapp-habit-stepper grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      onClick={() => setHabitDraft((prev) => ({ ...prev, totalRepeatTarget: String(Math.max(1, parseHabitTotalRepeatTarget(prev.totalRepeatTarget) - 1)) }))}
                      className="miniapp-habit-stepper-button miniapp-habit-stepper-button-minus inline-flex h-11 items-center justify-center disabled:opacity-50"
                      disabled={parseHabitTotalRepeatTarget(habitDraft.totalRepeatTarget) <= 1}
                      aria-label="Уменьшить общее количество повторов"
                    >
                      <Minus size={16} />
                    </button>
                    <div className="miniapp-habit-stepper-value text-center text-base font-semibold">{parseHabitTotalRepeatTarget(habitDraft.totalRepeatTarget)}</div>
                    <button
                      type="button"
                      onClick={() => setHabitDraft((prev) => ({ ...prev, totalRepeatTarget: String(Math.min(9999, parseHabitTotalRepeatTarget(prev.totalRepeatTarget) + 1)) }))}
                      className="miniapp-habit-stepper-button miniapp-habit-stepper-button-plus inline-flex h-11 items-center justify-center disabled:opacity-50"
                      disabled={parseHabitTotalRepeatTarget(habitDraft.totalRepeatTarget) >= 9999}
                      aria-label="Увеличить общее количество повторов"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ) : null}
                <p className="miniapp-habit-duration-summary rounded-lg border px-3 py-2 text-xs">{formatHabitDurationRemaining(habitDraft, editingHabit)}</p>
              </div>

              <div className="miniapp-habit-recurrence-panel space-y-2 rounded-lg border p-3">
                <label className="block text-xs text-slate-300">Как часто повторяется</label>
                <CustomSelect
                  value={habitDraft.recurrenceType}
                  onChange={(value) => setHabitDraft((prev) => ({ ...prev, recurrenceType: value as HabitRecurrenceType }))}
                  options={[{ value: 'DAILY', label: 'Каждый день' }, { value: 'INTERVAL', label: 'Через интервал' }, { value: 'WEEKDAYS', label: 'По конкретным дням' }]}
                  ariaLabel="Повторение привычки"
                  detachedPopup={Boolean(editingHabitId)}
                />

                {habitDraft.recurrenceType === 'INTERVAL' ? (
                  <div className="space-y-2">
                    <label className="block text-xs text-slate-300">Каждые N дней</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={habitDraft.intervalDays}
                      onChange={(event) => setHabitDraft((prev) => ({ ...prev, intervalDays: Math.max(1, Number(event.target.value) || 1) }))}
                      className="miniapp-habit-field w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                {habitDraft.recurrenceType === 'WEEKDAYS' ? (
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const isSelected = habitDraft.weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => setHabitDraft((prev) => ({
                            ...prev,
                            weekdays: isSelected ? prev.weekdays.filter((value) => value !== day.value) : [...prev.weekdays, day.value]
                          }))}
                          className={`rounded-full border px-3 py-1 text-xs ${isSelected ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'miniapp-habit-weekday-muted'}`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <p className="text-xs text-slate-400">{formatHabitSchedule(habitDraft)}</p>
              </div>

    </div>
  );

  const openedTask = openedTaskId
    ? tasks.find((task) => task.id === openedTaskId && !task.parentTaskId && task.status !== 'DONE') ?? null
    : null;
  const openedTaskDraft = openedTask
    ? (draftByTaskId[openedTask.id] ?? {
      title: openedTask.title,
      description: openedTask.description ?? '',
      dueDate: toInputDateTime(openedTask.dueDate)
    })
    : null;
  // Reconcile the open editor after the AI modifies a task and loadData()
  // receives fresh values. Dirty manual fields keep their local changes.
  useEffect(() => {
    if (!openedTask) return;
    const baseline = taskDraftOriginalByIdRef.current[openedTask.id];
    if (!baseline) return;
    const fresh = taskToMiniDraft(openedTask);
    if (JSON.stringify(baseline) === JSON.stringify(fresh)) return;
    taskDraftOriginalByIdRef.current[openedTask.id] = fresh;
    setDraftByTaskId((drafts) => {
      const local = drafts[openedTask.id];
      if (!local) return drafts;
      return { ...drafts, [openedTask.id]: mergeRemoteDraftFields(baseline, local, fresh, Object.keys(fresh) as Array<keyof TaskDraft>) };
    });
  }, [openedTask]);
  const openedTaskSubtasks = useMemo(() => {
    if (!openedTask) return [];
    const createdAtTimestamp = (task: Task) => {
      if (!task.createdAt) return 0;
      const parsed = new Date(task.createdAt).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const dueDateTimestamp = (task: Task) => {
      if (!task.dueDate) return Number.POSITIVE_INFINITY;
      const parsed = new Date(task.dueDate).getTime();
      return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    };
    return [...(subtasksByParent[openedTask.id] ?? [])]
      .filter((task) => !hideClosedOpenedTaskSubtasks || task.status !== 'DONE' || (task.unreadCommentCount ?? 0) > 0)
      .filter((task) => !openedTaskSubtaskAuthorFilterUserId || task.creatorUserId === openedTaskSubtaskAuthorFilterUserId)
      .sort((a, b) => {
        const statusDiff = Number(a.status === 'DONE') - Number(b.status === 'DONE');
        if (statusDiff !== 0) return statusDiff;
        if (openedTaskSubtaskFilterMode === 'none') return newestFocusSubtaskFirst(a, b);
        if (openedTaskSubtaskFilterMode === 'urgency') return urgentFocusSubtaskFirst(a, b);
        if (openedTaskSubtaskFilterMode === 'importance') {
          const importanceDiff = (b.importance ?? 3) - (a.importance ?? 3);
          if (importanceDiff !== 0) return importanceDiff;
          const dueDateDiff = dueDateTimestamp(a) - dueDateTimestamp(b);
          if (dueDateDiff !== 0) return dueDateDiff;
        }
        return createdAtTimestamp(a) - createdAtTimestamp(b);
      });
  }, [hideClosedOpenedTaskSubtasks, openedTask, openedTaskSubtaskAuthorFilterUserId, openedTaskSubtaskFilterMode, subtasksByParent]);
  useLayoutEffect(() => {
    const top = pendingOpenedTaskScrollTopRef.current;
    const container = openedTaskContentsScrollRef.current;
    if (top === null || !container) return;
    container.scrollTop = Math.min(top, Math.max(0, container.scrollHeight - container.clientHeight));
    pendingOpenedTaskScrollTopRef.current = null;
  }, [openedTaskSubtasks]);

  // Completed subtasks remain openable. Their editor offers "Вернуть" instead of "Выполнить".
  const openedSubtask = openedSubtaskId
    ? tasks.find((task) => task.id === openedSubtaskId) ?? null
    : null;
  const openedSubtaskParent = openedSubtask?.parentTaskId
    ? tasks.find((task) => task.id === openedSubtask.parentTaskId && !task.parentTaskId && task.status !== 'DONE') ?? null
    : null;
  const openedSubtaskDraft = newSubtaskDraft ?? (openedSubtask
    ? (draftByTaskId[openedSubtask.id] ?? {
      title: openedSubtask.title,
      description: openedSubtask.description ?? '',
      dueDate: toInputDateTime(openedSubtask.dueDate)
    })
    : null);
  const calendarExportTask = calendarExportTaskId ? tasks.find((task) => task.id === calendarExportTaskId) ?? null : null;
  const calendarExportDraft = calendarExportTask ? draftByTaskId[calendarExportTask.id] : null;
  const subtaskEditorId = openedSubtask?.id ?? 'new-subtask';
  const isCreatingNewSubtask = newSubtaskDraft !== null;
  const changeSubtaskDraft = (patch: Partial<TaskDraft>) => {
    if (isCreatingNewSubtask) {
      setNewSubtaskDraft((current) => current ? { ...current, ...patch } : current);
      return;
    }
    if (openedSubtask) onChangeDraft(openedSubtask.id, patch);
  };
  const openedTaskAiDialog = openedTask ? (aiDialogByTask[openedTask.id] ?? []) : [];
  const openCalendarExport = (taskId: string) => {
    setCalendarExportTaskId(taskId);
    setIsCalendarExportOpen(true);
  };

  useLayoutEffect(() => {
    const updateTitleRows = () => {
      if (taskTitleInputRef.current) setTaskTitleRows(measureTitleTextareaRows(taskTitleInputRef.current));
      if (subtaskTitleInputRef.current) setSubtaskTitleRows(measureTitleTextareaRows(subtaskTitleInputRef.current));
    };
    updateTitleRows();
    window.addEventListener('resize', updateTitleRows);
    return () => window.removeEventListener('resize', updateTitleRows);
  }, [openedTask?.id, openedSubtask?.id, isCreatingNewSubtask, openedTaskDraft?.title, openedSubtaskDraft?.title]);

  useEffect(() => {
    if (pendingSubtaskTitleFocusIdRef.current !== subtaskEditorId) {
      // Do not steal focus when opening an existing subtask.
      subtaskTitleInputRef.current?.blur();
      if (subtaskTitleInputRef.current) {
        subtaskTitleInputRef.current.scrollTop = 0;
        subtaskTitleInputRef.current.scrollLeft = 0;
      }
      return;
    }
    pendingSubtaskTitleFocusIdRef.current = null;
    subtaskTitleInputRef.current?.focus();
  }, [isCreatingNewSubtask, subtaskEditorId]);

  const activeAiChatProject = aiChatProjects.find((project) => project.id === activeAiChatProjectId) ?? aiChatProjects[0];
  const activeAiChat = activeAiChatProject?.chats.find((chat) => chat.id === activeAiChatId) ?? activeAiChatProject?.chats[0];
  // Both the Telegram mini-app and mobile web use this same chat renderer.
  // De-duplicate by message ID/content once the server history catches up.
  const pinnedManualCheckup = currentUser?.id && latestManualCheckup?.userId === currentUser.id
    ? latestManualCheckup.message : null;
  const visibleAiChatMessages = activeAiChat?.id === QUICK_AI_CHAT_ID && pinnedManualCheckup
    ? reconcileAiChatMessagesWithChips(activeAiChat.messages, [pinnedManualCheckup])
    : (activeAiChat?.messages ?? []);
  const generalAiChatModel = activeAiChat?.id === QUICK_AI_CHAT_ID
    ? quickAiChatModel : (readSavedAiChatModel(activeAiChat?.model) ?? DEFAULT_MOBILE_PROJECT_CHAT_MODEL);
  const changeGeneralAiChatModel = (model: AiChatModel) => {
    if (activeAiChat?.id === QUICK_AI_CHAT_ID) {
      setQuickAiChatModel(model);
      return;
    }
    if (!activeAiChatProject?.id || !activeAiChat?.id) return;
    const projectId = activeAiChatProject.id, chatId = activeAiChat.id;
    setAiChatProjects(previous => previous.map(project => project.id !== projectId ? project : {
      ...project, chats: project.chats.map(chat => chat.id !== chatId ? chat
        : { ...chat, model, modelChangedAt: new Date().toISOString() })
    }));
  };
  useEffect(() => {
    if (activeAiChatId === QUICK_AI_CHAT_ID) setQuickAiChatModel(DEFAULT_QUICK_AI_CHAT_MODEL);
  }, [activeAiChatId, isAiChatOpen]);

  useEffect(() => {
    const persistableProjects = stripAiChatProjectDisplayPreviews(aiChatProjects);
    persistAiChatProjectsCache(localStorage, AI_CHAT_STORAGE_KEY, persistableProjects);
    const snapshot = JSON.stringify(persistableProjects);
    if (aiChatProjectsSyncReadyRef.current && aiChatProjectsRemoteSnapshotRef.current !== snapshot) {
      if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
      aiChatProjectsSaveTimerRef.current = window.setTimeout(() => {
        aiChatProjectsSaveTimerRef.current = null;
        aiChatProjectsSaveInFlightRef.current = true;
        void api.saveAiChatProjects(persistableProjects)
          .then(() => { aiChatProjectsRemoteSnapshotRef.current = snapshot; })
          .catch(error => console.error('[MiniApp AI chat] sync failed', error))
          .finally(() => { aiChatProjectsSaveInFlightRef.current = false; });
      }, 400);
    }
    return () => {
      if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
    };
  }, [aiChatProjects]);



  // Mirror task-chat sync: only the open conversation is read. Never replace
  // the whole project/chat tree on a timer or reset active selection.
  useEffect(() => {
    if (!currentUser?.id || !isAiChatOpen) return;
    const projectId = activeAiChatProject?.id;
    const chatId = activeAiChat?.id;
    if (!projectId || !chatId) return;
    let alive = true;
    const refresh = async () => {
      if (!alive || aiChatLoading || aiChatProjectsPollingRef.current ||
          aiChatProjectsSaveTimerRef.current !== null || aiChatProjectsSaveInFlightRef.current ||
          document.visibilityState === 'hidden') return;
      aiChatProjectsPollingRef.current = true;
      try {
        if (chatId.startsWith('telegram-ai-assistant:')) {
          const feed = await api.telegramAssistantInbox();
          if (!alive) return;
          setAiChatProjects(previous => {
            const project = previous.find(p => p.id === feed.projectId);
            const thread = project?.chats.find(c => c.id === chatId);
            if (!thread) return previous;
            const remote = feed.messages.filter(m => m.chatId === chatId)
              .map(m => ({ id: m.id, role: 'assistant' as const, content: m.content,
                taskProposal: m.taskProposal ?? undefined, telegramSuggestedReply: m.telegramSuggestedReply ?? undefined }));
            // Inbox contains summaries only. Never erase pending Telegram
            // read-consent chips or conversation replies on a 2.5s refresh.
            const merged = mergeTelegramManagedMessages(thread.messages, remote);
            if (merged === thread.messages) return previous;
            const updated = previous.map(p => p.id !== feed.projectId ? p : {
              ...p, chats: p.chats.map(c => c.id !== chatId ? c : { ...c, messages: merged })
            });
            aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(updated);
            return updated;
          });
          return;
        }
        const { messages, projectsOutline } = await api.getAiChatThreadMessages(projectId, chatId);
        if (!alive || aiChatLoading || aiChatProjectsSaveTimerRef.current !== null ||
            aiChatProjectsSaveInFlightRef.current) return;
        const remote: MiniAiChatMessage[] = messages
          .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
          .map((message, index) => attachChatMessageId(message,
            message.id ?? `${index}-${message.role}-${message.content}`));
        setAiChatProjects(previous => {
          const outlined = reconcileAiChatProjectOutline(previous, projectsOutline);
          const chat = outlined.find(p => p.id === projectId)?.chats.find(c => c.id === chatId);
          if (!chat) {
            if (outlined !== previous) aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(outlined);
            return outlined;
          }
          const merged = reconcileActiveAiChatMessages(
            chat.messages, reconcileAiChatMessagesWithChips(chat.messages, remote), aiChatLoading);
          if (merged === chat.messages) {
            if (outlined !== previous) aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(outlined);
            return outlined;
          }
          const updated = outlined.map(p => p.id !== projectId ? p : {
            ...p, chats: p.chats.map(c => c.id === chatId ? { ...c, messages: merged } : c)
          });
          aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(updated);
          return updated;
        });
      } catch (error) {
        console.warn('[MiniApp AI chat] active thread sync failed', error);
      } finally {
        aiChatProjectsPollingRef.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [currentUser?.id, isAiChatOpen, activeAiChatProject?.id, activeAiChat?.id, aiChatLoading]);

  useEffect(() => {
    const container = aiChatDialogContainerRef.current;
    if (!container || !isAiChatOpen) return;
    if (previousGeneralAiChatIdRef.current !== activeAiChatId) {
      previousGeneralAiChatIdRef.current = activeAiChatId;
      generalAiChatNearBottomRef.current = true;
    }
    if (!generalAiChatNearBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
    generalAiChatScrollTopRef.current = container.scrollTop;
  }, [visibleAiChatMessages.length, aiChatLoading, aiChatProgress, isAiChatOpen, activeAiChatId]);

  useEffect(() => {
    if (!isAiChatOpen) return;
    generalAiChatUserScrollEnabledRef.current = false;
    setIsGeneralAiChatHeaderHidden(false);
    generalAiChatScrollTopRef.current = aiChatDialogContainerRef.current?.scrollTop ?? 0;
  }, [isAiChatOpen, activeAiChatId]);

  const checkupLinkFocusedRef = useRef(false);
  useEffect(() => {
    const id = launchParams.openCheckupProposal;
    const container = aiChatDialogContainerRef.current;
    if (!id || !isAiChatOpen || activeAiChatId !== QUICK_AI_CHAT_ID ||
        !container || checkupLinkFocusedRef.current) return;
    const matching = Array.from(container.querySelectorAll<HTMLElement>('[data-ai-task-proposal]'))
      .find(element => element.dataset.aiTaskProposal === id);
    if (!matching) return;
    matching.scrollIntoView({ block: 'center', behavior: 'auto' });
    generalAiChatNearBottomRef.current = false;
    checkupLinkFocusedRef.current = true;
  }, [launchParams.openCheckupProposal, isAiChatOpen, activeAiChatId, aiChatProjects, linkedCheckupProposal]);

  const updateActiveAiChatMessages = (updater: (messages: MiniAiChatMessage[]) => MiniAiChatMessage[]) => {
    setAiChatProjects((prev) => prev.map((project) => project.id !== activeAiChatProject?.id ? project : {
      ...project,
      chats: project.chats.map((chat) => chat.id !== activeAiChat?.id ? chat : { ...chat, messages: updater(chat.messages) })
    }));
  };

  const refreshAiCredits = () => {
    void api.getMe()
      .then(({ user }) => setAiCredits(user.aiCredits ?? 0))
      .catch(() => undefined);
  };

  const continueTelegramReadAiChat = async (approval: import('./lib/types').TelegramReadApproval) => {
    if (aiChatLoading) throw new Error('Подождите завершения текущего ответа');
    const projectId = activeAiChatProject?.id;
    const chatId = activeAiChat?.id;
    if (!projectId || !chatId || !activeAiChat) throw new Error('Чат больше не открыт');
    setAiChatLoading(true); setAiChatError(null); setAiChatProgress('analyzing_request');
    try {
      const result = await api.askAiChatStreaming({
        clientRequestId: crypto.randomUUID(),
        question: 'Продолжи предыдущий запрос по разрешённой Telegram-переписке.',
        history: activeAiChat.messages, telegramRead: approval,
        model: generalAiChatModel, projectTitle: activeAiChatProject?.title,
        chatTitle: activeAiChat.title, projectId, chatId, clientSurface
      }, { onStatus: setAiChatProgress });
      const answer: MiniAiChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: normalizeMiniAiMessageContent(result.answer),
        creditsSpentMilli: result.billing?.creditsSpentMilli,
        webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations,
        generatedDocument: result.generatedDocument ?? undefined,
        telegramSendDraft: result.telegramSendDraft ?? undefined,
        taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined
      };
      setAiChatProjects(prev => prev.map(project => project.id !== projectId ? project : {
        ...project, chats: project.chats.map(chat => chat.id !== chatId ? chat : {
          ...chat, messages: [...chat.messages, answer]
        })
      }));
      refreshAiCredits();
      if (result.taskDataChanged) await loadData({ refreshPlannerOnly: true });
    } finally { setAiChatLoading(false); }
  };
  const continueTelegramReadTask = async (approval: import('./lib/types').TelegramReadApproval) => {
    const taskId = openedTask?.id;
    if (!taskId || aiLoadingTaskId === taskId) throw new Error('Дождитесь окончания текущего ответа');
    setAiLoadingTaskId(taskId);
    setAiProgressByTask(prev => ({ ...prev, [taskId]: 'analyzing_request' }));
    try {
      const result = await api.askTaskAssistantStreaming(taskId, {
        clientRequestId: crypto.randomUUID(), question: 'Продолжи исходный запрос с разрешённой историей Telegram.',
        userMessage: '', telegramRead: approval, model: selectedAiChatModel, clientSurface
      }, { onStatus: status => setAiProgressByTask(prev => ({ ...prev, [taskId]: status })) });
      const answer: ChatMessage = {
        role: 'assistant', content: normalizeMiniAiMessageContent(result.answer),
        creditsSpentMilli: result.billing?.creditsSpentMilli,
        webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations,
        generatedDocument: result.generatedDocument ?? undefined,
        telegramSendDraft: result.telegramSendDraft ?? undefined,
        taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined
      };
      setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), answer] }));
      refreshAiCredits();
      if (result.taskDataChanged) await loadData({ refreshPlannerOnly: true });
    } finally {
      setAiLoadingTaskId(null);
      setAiProgressByTask(prev => { const next = { ...prev }; delete next[taskId]; return next; });
    }
  };

  const sendAiChatQuestion = async () => {
    const question = aiChatDraftValueRef.current.trim();
    if ((!question && aiChatPendingFiles.length === 0) || aiChatLoading) return;
    const fileNames = aiChatPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiChatPendingFiles.map((file) => fileToAttachmentPayload(file, true)));
    } catch (cause) {
      setAiChatError(cause instanceof Error ? cause.message : 'Не удалось прочитать приложенные файлы');
      return;
    }
    const userMessageContent = serializeAiReply(fileNames.length > 0
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : question, replyToGeneral);
    const attachmentPreviews = await makeAiAttachmentPreviews(aiChatPendingFiles);
    const userMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'user', content: userMessageContent, attachmentPreviews };
    const history = activeAiChat?.messages ?? [];
    generalAiChatNearBottomRef.current = true;
    updateActiveAiChatMessages((messages) => [...messages, userMessage]);
    aiChatDraftValueRef.current = '';
    aiChatComposerRef.current?.clearDraft();
    setAiChatUploadProgress(null);
    setAiChatLoading(true);
    setAiChatError(null);
    try {
      setAiChatProgress('analyzing_request');
      setAiChatPendingFiles([]); // Attachment bytes are already prepared.
      const result = await api.askAiChatStreaming({
        clientRequestId: userMessage.id,
        question: serializeAiReply(question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.', replyToGeneral),
        history,
        model: generalAiChatModel,
        projectTitle: activeAiChat?.id === QUICK_AI_CHAT_ID ? QUICK_AI_CHAT_PROJECT_TITLE : activeAiChatProject?.title,
        chatTitle: activeAiChat?.id === QUICK_AI_CHAT_ID ? QUICK_AI_CHAT_TITLE : activeAiChat?.title,
        projectId: activeAiChatProject?.id,
        chatId: activeAiChat?.id,
        clientSurface,
        attachments: attachmentsPayload
      }, { onStatus: setAiChatProgress, onUploadProgress: setAiChatUploadProgress });
      generalAiChatNearBottomRef.current = true;
      if (result.actionReports?.some((item) => item.startsWith('Изменена заметка'))) {
         window.dispatchEvent(new Event('standalone-notes-updated'));
       }
       const assistantMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `${normalizeMiniAiMessageContent(result.answer)}${(result.actionReports?.length ?? 0) > 0 ? `\n\nИзменения:\n- ${result.actionReports!.join('\n- ')}` : ''}`, creditsSpentMilli: result.billing?.creditsSpentMilli, webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations, generatedDocument: result.generatedDocument ?? undefined, telegramSendDraft: result.telegramSendDraft ?? undefined, taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined };
      updateActiveAiChatMessages((messages) => [...messages, assistantMessage]);
      setReplyToGeneral(null);
      if (history.length === 0 && result.suggestedChatTitle && activeAiChatProject?.id && activeAiChat?.id) {
        const projectId = activeAiChatProject.id, chatId = activeAiChat.id;
        setAiChatProjects((prev) => prev.map(project => project.id !== projectId ? project : {
          ...project, chats: project.chats.map(chat => chat.id !== chatId || !/^(Новый чат|Чат \d+)$/i.test(chat.title)
            ? chat : { ...chat, title: result.suggestedChatTitle! })
        }));
      }
       window.requestAnimationFrame(() => {
         const scroll = aiChatDialogContainerRef.current;
         if (scroll) scroll.scrollTop = scroll.scrollHeight;
       });
      refreshAiCredits();
      if (result.taskDataChanged) await loadData({ refreshPlannerOnly: true });
    } catch (e) {
      const message = formatAiRequestError(e);
      setAiChatError(message);
      if (!aiChatDraftValueRef.current.trim()) {
        aiChatDraftValueRef.current = question;
        aiChatComposerRef.current?.restoreIfEmpty(question);
      }
      setAiChatPendingFiles((current) => current.length ? current : aiChatPendingFiles);
      if (activeAiChat?.id === QUICK_AI_CHAT_ID) {
        updateActiveAiChatMessages((messages) => [...messages, { id: crypto.randomUUID(), role: 'assistant', content: message }]);
      }
    } finally {
      setAiChatLoading(false);
      setAiChatUploadProgress(null);
    }
  };


  const handleAiChatFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setAiChatError('Можно прикреплять PDF, DOCX, XLS/XLSX, TXT и изображения (PNG/JPG/WEBP/GIF).');
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setAiChatError(`Файл ${oversized.name} превышает лимит 8MB.`);
      event.target.value = '';
      return;
    }
    setAiChatPendingFiles((prev) => {
      const merged = [...prev, ...normalized.filter((file) => !prev.some((item) => item.name === file.name && item.size === file.size))];
      if (merged.length > MAX_AI_ATTACHMENTS) {
        setAiChatError(`Можно прикрепить максимум ${MAX_AI_ATTACHMENTS} файла.`);
        return merged.slice(0, MAX_AI_ATTACHMENTS);
      }
      return merged;
    });
    event.target.value = '';
  };

  const openAiChatProjectDialog = (projectId?: string) => {
    if (projectId === 'telegram-ai-assistant-project') return;
    const project = projectId ? aiChatProjects.find((item) => item.id === projectId) : null;
    setAiChatProjectDraft(project
      ? { mode: 'edit', projectId: project.id, title: project.title, color: project.color, icon: project.icon }
      : { mode: 'create', title: `Проект ${aiChatProjects.length + 1}`, color: '#8b5cf6', icon: '✨' });
    setClosingMiniWindow(null);
    setIsAiChatProjectDialogOpen(true);
  };

  const saveAiChatProject = () => {
    const title = aiChatProjectDraft.title.trim() || (aiChatProjectDraft.mode === 'create' ? `Проект ${aiChatProjects.length + 1}` : 'Проект');
    if (aiChatProjectDraft.mode === 'edit' && aiChatProjectDraft.projectId) {
      setAiChatProjects((prev) => prev.map((project) => project.id === aiChatProjectDraft.projectId ? { ...project, title, color: aiChatProjectDraft.color, icon: aiChatProjectDraft.icon } : project));
      setAiChatProjectDraft({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
      setIsAiChatProjectDialogOpen(false);
      return;
    }
    const chat: MiniAiChatThread = { id: crypto.randomUUID(), title: 'Новый чат', messages: [] };
    const project: MiniAiChatProject = { id: crypto.randomUUID(), title, color: aiChatProjectDraft.color, icon: aiChatProjectDraft.icon, chats: [chat] };
    setAiChatProjects((prev) => [...prev, project]);
    setActiveAiChatProjectId(project.id);
    setActiveAiChatId(chat.id);
    setAiChatProjectDraft({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
    setIsAiChatProjectDialogOpen(false);
  };

  const createAiChatThread = () => {
    if (!activeAiChatProject || activeAiChatProject.id === 'telegram-ai-assistant-project') return;
    const chat: MiniAiChatThread = { id: crypto.randomUUID(), title: `Чат ${activeAiChatProject.chats.length + 1}`, messages: [] };
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: [chat, ...project.chats] } : project));
    setActiveAiChatId(chat.id);
  };

  const saveAiChatRename = () => {
    if (!renamingAiChatId || !activeAiChatProject || renamingAiChatId.startsWith('telegram-ai-assistant:')) return;
    const title = aiChatRenameDraft.trim() || 'Новый чат';
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: project.chats.map((chat) => chat.id === renamingAiChatId ? { ...chat, title } : chat) } : project));
    setRenamingAiChatId(null);
  };

  const deleteAiChatProject = (projectId: string) => {
    if (projectId === 'telegram-ai-assistant-project') return;
    setAiChatProjects((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((project) => project.id !== projectId);
      if (activeAiChatProjectId === projectId) {
        setActiveAiChatProjectId(next[0]?.id ?? '');
        setActiveAiChatId(next[0]?.chats[0]?.id ?? '');
      }
      return next;
    });
  };

  const deleteAiChatThread = (chatId: string) => {
    if (chatId.startsWith('telegram-ai-assistant:') || !activeAiChatProject || activeAiChatProject.id === 'telegram-ai-assistant-project' || activeAiChatProject.chats.length <= 1) return;
    setAiChatProjects((prev) => prev.map((project) => {
      if (project.id !== activeAiChatProject.id) return project;
      const nextChats = project.chats.filter((chat) => chat.id !== chatId);
      if (activeAiChatId === chatId) setActiveAiChatId(nextChats[0]?.id ?? '');
      return { ...project, chats: nextChats };
    }));
  };

  useEffect(() => {
    setIsSubtaskNotesEditorOpen(false);
  }, [openedSubtaskId]);

  useEffect(() => {
    setSubtaskAttachments([]);
    if (!openedSubtaskId) return;
    let isCancelled = false;
    void api.getTaskAttachments(openedSubtaskId)
      .then((attachments) => { if (!isCancelled) setSubtaskAttachments(attachments); })
      .catch((e) => { if (!isCancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить файлы подзадачи'); });
    return () => { isCancelled = true; };
  }, [openedSubtaskId]);

  useEffect(() => {
    setIsTaskNotesEditorOpen(false);
    setIsSubtaskNotesEditorOpen(false);
    setTaskAttachments([]);
    setIsTaskAttachmentDragActive(false);
    if (!openedTaskId) return;

    let isCancelled = false;
    const loadTaskAttachments = async () => {
      try {
        const attachments = await api.getTaskAttachments(openedTaskId);
        if (!isCancelled) setTaskAttachments(attachments);
      } catch (e) {
        if (!isCancelled) setError(e instanceof Error ? e.message : 'Не удалось загрузить файлы задачи');
      }
    };
    void loadTaskAttachments();
    return () => {
      isCancelled = true;
    };
  }, [openedTaskId]);

  const uploadTaskAttachmentFiles = async (files: File[]) => {
    if (!openedTask || files.length === 0) return;
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== files.length) {
      setError('Для задачи можно прикреплять только PDF, DOCX, XLS/XLSX, TXT и изображения.');
    }
    if (normalized.length === 0) return;

    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setError(`Файл ${oversized.name} превышает лимит 8MB.`);
      return;
    }

    setIsUploadingTaskAttachment(true);
    try {
      for (const file of normalized) {
        await api.createTaskAttachment(openedTask.id, await fileToAttachmentPayload(file));
      }
      const attachments = await api.getTaskAttachments(openedTask.id);
      setTaskAttachments(attachments);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл к задаче');
    } finally {
      setIsUploadingTaskAttachment(false);
      setIsTaskAttachmentDragActive(false);
    }
  };

  const handleTaskAttachmentFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    void uploadTaskAttachmentFiles(selectedFiles);
    event.target.value = '';
  };

  const removeTaskAttachment = async (attachmentId: string) => {
    if (!openedTask) return;
    try {
      await api.deleteTaskAttachment(openedTask.id, attachmentId);
      setTaskAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить файл');
    }
  };

  const downloadAttachment = async (taskId: string, attachment: TaskAttachment) => {
    try {
      // Signed links do not require browser session cookies in Telegram's webview.
      const download = await api.createTaskAttachmentDownloadLink(taskId, attachment.id);
      const webApp = isTelegramRuntime ? (window as TelegramWindow).Telegram?.WebApp : undefined;
      const openDownloadLink = () => {
        if (webApp?.openLink) {
          webApp.openLink(download.url);
          return;
        }
        const link = document.createElement('a');
        link.href = download.url;
        link.download = download.fileName || attachment.name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      if (webApp?.downloadFile) {
        try {
          webApp.downloadFile(
            { url: download.url, file_name: download.fileName || attachment.name },
            (accepted) => {
              if (!accepted) {
                try { openDownloadLink(); }
                catch { setError('Не удалось открыть файл. Повторите скачивание.'); }
              }
            }
          );
        } catch {
          openDownloadLink();
        }
      } else {
        openDownloadLink();
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать файл');
    }
  };

  const downloadTaskAttachment = (attachment: TaskAttachment) => {
    if (openedTask) void downloadAttachment(openedTask.id, attachment);
  };

  const uploadSubtaskAttachmentFiles = async (files: File[]) => {
    if (!openedSubtask || files.length === 0) return;
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== files.length) setError('Для подзадачи можно прикреплять только PDF, DOCX, XLS/XLSX, TXT и изображения.');
    if (normalized.length === 0) return;
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) { setError(`Файл ${oversized.name} превышает лимит 8MB.`); return; }
    setIsUploadingSubtaskAttachment(true);
    try {
      for (const file of normalized) await api.createTaskAttachment(openedSubtask.id, await fileToAttachmentPayload(file));
      setSubtaskAttachments(await api.getTaskAttachments(openedSubtask.id));
      setTasks(await api.getTasks());
      setError(null);
      // A successful upload should not open a blocking native alert.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл к подзадаче');
    } finally {
      setIsUploadingSubtaskAttachment(false);
    }
  };

  const removeSubtaskAttachment = async (attachmentId: string) => {
    if (!openedSubtask) return;
    await api.deleteTaskAttachment(openedSubtask.id, attachmentId);
    setSubtaskAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setTasks(await api.getTasks());
  };

  const startAiGeneratedDocumentDownload = async (generatedDocument: GeneratedDocument) => {
      const download = await api.createAiGeneratedDocumentDownloadLink(generatedDocument.id);
      const webApp = isTelegramRuntime ? (window as TelegramWindow).Telegram?.WebApp : undefined;

      if (webApp?.downloadFile) {
        webApp.downloadFile(
          { url: download.url, file_name: download.fileName },
          (accepted) => {
            if (!accepted) webApp.openLink?.(download.url);
          }
        );
      } else if (webApp?.openLink) {
        webApp.openLink(download.url);
      } else {
        const link = window.document.createElement('a');
        link.href = download.url;
        link.download = download.fileName;
        link.rel = 'noopener';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
      }
  };
  const downloadAiGeneratedDocument = async (generatedDocument: GeneratedDocument) => {
    try {
      await startAiGeneratedDocumentDownload(generatedDocument);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось скачать Word-файл');
    }
  };

  const downloadSubtaskAttachment = (attachment: TaskAttachment) => {
    if (openedSubtask) void downloadAttachment(openedSubtask.id, attachment);
  };

  const openTaskComments = async (subtask: Task) => {
    setCommentPanelTaskId(subtask.id);
    setTaskComments([]);
    setTaskCommentDraft('');
    setTaskCommentReplyTo(null);
    setTaskCommentError(null);
    setTaskCommentsLoading(true);
    try {
      const response = await api.getTaskComments(subtask.id);
      setTaskComments(response.comments);
      await api.markTaskCommentsRead(subtask.id, response.comments[response.comments.length - 1]?.id ?? null);
      const clearedUnread = subtask.unreadCommentCount ?? 0;
      setTasks((current) => current.map((task) => {
        if (task.id === subtask.id) return { ...task, commentCount: response.comments.length, unreadCommentCount: 0 };
        if (subtask.parentTaskId && task.id === subtask.parentTaskId && clearedUnread > 0) {
          return { ...task, unreadCommentCount: Math.max(0, (task.unreadCommentCount ?? 0) - clearedUnread) };
        }
        return task;
      }));
    } catch (error) {
      setTaskCommentError(error instanceof Error ? error.message : 'Не удалось загрузить комментарии');
    } finally {
      setTaskCommentsLoading(false);
    }
  };

  const sendTaskComment = async () => {
    const subtask = commentPanelTaskId ? tasks.find((task) => task.id === commentPanelTaskId) ?? null : null;
    const content = taskCommentDraft.trim();
    if (!subtask || !content || taskCommentSending) return;
    setTaskCommentSending(true);
    setTaskCommentError(null);
    try {
      const created = await api.createTaskComment(subtask.id, {
        content,
        parentCommentId: taskCommentReplyTo?.id ?? null
      });
      setTaskComments((current) => [...current, created]);
      setTasks((current) => current.map((task) => {
        if (task.id === subtask.id) return { ...task, commentCount: (task.commentCount ?? 0) + 1 };
        if (subtask.parentTaskId && task.id === subtask.parentTaskId) return { ...task, commentCount: (task.commentCount ?? 0) + 1 };
        return task;
      }));
      setTaskCommentDraft('');
      setTaskCommentReplyTo(null);
    } catch (error) {
      setTaskCommentError(error instanceof Error ? error.message : 'Не удалось отправить комментарий');
    } finally {
      setTaskCommentSending(false);
    }
  };

  useEffect(() => {
    if (!commentPanelTaskId || taskCommentsLoading) return;
    const frame = requestAnimationFrame(() => {
      const container = taskCommentScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [commentPanelTaskId, taskCommentsLoading, taskComments.length]);

  useEffect(() => {
    if (!pendingLaunchCommentTaskId || loading || tasks.length === 0) return;
    const subtask = tasks.find((task) => task.id === pendingLaunchCommentTaskId && Boolean(task.parentTaskId));
    if (!subtask) return;
    setPendingLaunchCommentTaskId(null);
    void openTaskComments(subtask);
  }, [pendingLaunchCommentTaskId, loading, tasks]);

  useEffect(() => {
    if (!openedTaskId || !isAiDialogOpen) return;
    const loadTaskChatHistory = async () => {
      try {
        const result = await api.getTaskAssistantHistory(openedTaskId);
        setAiDialogByTask((prev) => {
          const localMessages = prev[openedTaskId] ?? [];
          const serverMessages = result.messages;
          const hasPendingOptimisticMessages = localMessages.length > serverMessages.length
            && localMessages.slice(0, serverMessages.length).every((message, index) => (
              message.role === serverMessages[index]?.role && message.content === serverMessages[index]?.content
            ));
          return { ...prev, [openedTaskId]: hasPendingOptimisticMessages ? localMessages : serverMessages };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить чат ИИ');
      }
    };
    void loadTaskChatHistory();
  }, [isAiDialogOpen, openedTaskId, aiLoadingTaskId]);

  useEffect(() => {
    if (!openedTaskId || !isAiDialogOpen) return;
    const intervalId = window.setInterval(async () => {
      try {
        const result = await api.getTaskAssistantHistory(openedTaskId);
        setAiDialogByTask((prev) => {
          const localMessages = prev[openedTaskId] ?? [];
          const serverMessages = result.messages;
          const hasPendingOptimisticMessages = localMessages.length > serverMessages.length
            && localMessages.slice(0, serverMessages.length).every((message, index) => (
              message.role === serverMessages[index]?.role && message.content === serverMessages[index]?.content
            ));
          return { ...prev, [openedTaskId]: hasPendingOptimisticMessages ? localMessages : serverMessages };
        });
      } catch {
        // silent sync retries
      }
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [isAiDialogOpen, openedTaskId]);

  const sendAiMessage = async () => {
    if (!openedTask) return;
    const question = taskAiDraftValueRef.current.trim();
    const selectedRecipientUserId = getTaskAiRecipientId(openedTask);
    if (selectedRecipientUserId !== 'ai') {
      if (!question) return;
      if (aiPendingFiles.length > 0) {
        setError('Вложения можно отправлять только ИИ. Для сообщения участнику оставьте только текст.');
        return;
      }
      setAiLoadingTaskId(openedTask.id);
      setError(null);
      try {
        const directMessage = await api.sendTaskParticipantMessage(openedTask.id, { recipientUserId: selectedRecipientUserId, content: question });
        setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: [...(prev[openedTask.id] ?? []), directMessage] }));
        taskAiDraftValueRef.current = '';
        taskAiComposerRef.current?.clearDraft();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Не удалось отправить сообщение участнику');
      } finally {
        setAiLoadingTaskId(null);
      }
      return;
    }
    if (!question && aiPendingFiles.length === 0) return;
    setAiLoadingTaskId(openedTask.id);
    setAiProgressByTask((current) => ({ ...current, [openedTask.id]: 'analyzing_request' }));
    setError(null);
    const fileNames = aiPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiPendingFiles.map((file) => fileToAttachmentPayload(file, true)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось прочитать приложенные файлы');
      setAiLoadingTaskId(null);
      setAiProgressByTask((current) => { const next = { ...current }; delete next[openedTask.id]; return next; });
      return;
    }
    const baseDialog = aiDialogByTask[openedTask.id] ?? [];
    const userMessage = serializeAiReply(fileNames.length > 0
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : question, replyToTask);
    const clientRequestId = crypto.randomUUID();
    const attachmentPreviews = await makeAiAttachmentPreviews(aiPendingFiles);
    const nextDialog: ChatMessage[] = [...baseDialog, { id: clientRequestId, role: 'user', content: userMessage, attachmentPreviews, ...(openedTask.isCollaborative ? { authorName: currentUser?.name || currentUser?.username || 'Вы', authorColor: openedTask.collaborationColor } : {}) }];
    setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: nextDialog }));
    taskAiDraftValueRef.current = '';
    taskAiComposerRef.current?.clearDraft();
    setTaskAiUploadProgress(null);
    setAiPendingFiles([]); // Files are encoded and attached to the sent message.
    try {
      const result = await api.askTaskAssistantStreaming(openedTask.id, {
        clientRequestId,
        question: serializeAiReply(question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.', replyToTask),
        userMessage,
        mode: selectedAiChatModel === 'gpt-6.1-sol' ? 'smart' : 'fast',
        model: selectedAiChatModel,
        clientSurface,
        attachments: attachmentsPayload
      }, { onStatus: (status) => setAiProgressByTask((current) => ({ ...current, [openedTask.id]: status })), onUploadProgress: setTaskAiUploadProgress });
      const actionSummary = (result.actionReports?.length ?? 0) > 0
        ? `\n\nИзменения:\n- ${result.actionReports!.join('\n- ')}`
        : '';
      setAiDialogByTask((prev) => ({
        ...prev,
        [openedTask.id]: [...(prev[openedTask.id] ?? nextDialog), { role: 'assistant', content: `${normalizeMiniAiMessageContent(result.answer)}${actionSummary}`, creditsSpentMilli: result.billing?.creditsSpentMilli, webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations, generatedDocument: result.generatedDocument ?? undefined, telegramSendDraft: result.telegramSendDraft ?? undefined, taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined }]
      }));
      setReplyToTask(null);
      refreshAiCredits();
      if (result.taskDataChanged) await loadData({ refreshPlannerOnly: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось отправить сообщение в чат ИИ';
      setError(message);
      if (!taskAiDraftValueRef.current.trim()) {
        taskAiDraftValueRef.current = question;
        taskAiComposerRef.current?.restoreIfEmpty(question);
      }
      setAiPendingFiles((current) => current.length ? current : aiPendingFiles);
      // Do not erase the question from the dialog after a failed image edit.
      // Show the server's actual validation error so the user can correct it.
      setAiDialogByTask((prev) => ({
        ...prev,
        [openedTask.id]: [...nextDialog, { role: 'assistant', content: message }]
      }));
    } finally {
      setAiLoadingTaskId(null);
      setTaskAiUploadProgress(null);
      setAiProgressByTask((current) => { const next = { ...current }; delete next[openedTask.id]; return next; });
    }
  };

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setError('Можно прикреплять PDF, DOCX, XLS/XLSX, TXT и изображения (PNG/JPG/WEBP/GIF).');
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setError(`Файл ${oversized.name} превышает лимит 8MB.`);
      event.target.value = '';
      return;
    }
    setAiPendingFiles((prev) => {
      const merged = [...prev, ...normalized.filter((file) => !prev.some((item) => item.name === file.name && item.size === file.size))];
      if (merged.length > MAX_AI_ATTACHMENTS) {
        setError(`Можно прикрепить максимум ${MAX_AI_ATTACHMENTS} файла.`);
        return merged.slice(0, MAX_AI_ATTACHMENTS);
      }
      return merged;
    });
    event.target.value = '';
  };

  useEffect(() => {
    if (!isAiDialogOpen) return;
    const scrollToBottom = (container: HTMLDivElement | null) => {
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    };
    scrollToBottom(fullscreenAiDialogContainerRef.current);
    taskAiChatScrollTopRef.current = fullscreenAiDialogContainerRef.current?.scrollTop ?? 0;
  }, [isAiDialogOpen, openedTaskId, openedTaskAiDialog.length, aiLoadingTaskId, openedTaskId ? aiProgressByTask[openedTaskId] : undefined]);

  useEffect(() => {
    if (!isAiDialogOpen) return;
    setIsTaskAiChatHeaderHidden(false);
    taskAiChatScrollTopRef.current = fullscreenAiDialogContainerRef.current?.scrollTop ?? 0;
  }, [isAiDialogOpen, openedTaskId]);

  const updateAiChatHeaderVisibility = (
    scrollTop: number,
    previousScrollTopRef: { current: number },
    setIsHidden: (isHidden: boolean) => void
  ) => {
    if (scrollTop <= 8) {
      setIsHidden(false);
      previousScrollTopRef.current = scrollTop;
      return;
    }
    const delta = scrollTop - previousScrollTopRef.current;
    if (Math.abs(delta) < 8) return;
    setIsHidden(delta > 0);
    previousScrollTopRef.current = scrollTop;
  };

  useEffect(() => {
    if (displayMode !== 'timeline' || !timelineToday.isTodayVisible) return;
    const main = mainScrollRef.current;
    const timelineGrid = timelineGridRef.current;
    if (!main || !timelineGrid) return;
    const targetTop = timelineGrid.offsetTop + timelineToday.currentTimeTop - (main.clientHeight * 0.35);
    main.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [displayMode, timelineToday.currentTimeTop, timelineToday.isTodayVisible]);

  useEffect(() => {
    void api.getCreditPacks().then((result) => { setCreditPacks(result.packs); setCreditPurchaseAvailable(result.purchaseAvailable); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const checkPending = () => { if (document.visibilityState === 'visible' && creditPurchase.pendingPurchaseId) void creditPurchase.check(creditPurchase.pendingPurchaseId).catch(() => undefined); };
    window.addEventListener('focus', checkPending);
    document.addEventListener('visibilitychange', checkPending);
    return () => { window.removeEventListener('focus', checkPending); document.removeEventListener('visibilitychange', checkPending); };
  }, [creditPurchase.check, creditPurchase.pendingPurchaseId]);

  if (loading) {
    return <main className={`miniapp-shell miniapp-scrollless h-screen overflow-y-auto p-4 text-sm ${isWebRuntime ? 'miniapp-web-runtime' : ''} ${isLightTheme ? 'miniapp-light' : 'bg-slate-950 text-slate-100'}`}>Загружаем Планировыч…</main>;
  }

  return (
    <main
      ref={mainScrollRef}
      onScroll={(event) => {
        setIsEfficiencyDetailsOpen(false);
        setIsSettingsOpen(false);
        setIsCreditPurchaseOpen(false);
        const nextTop = event.currentTarget.scrollTop;
        if (isGlobalSearchOpen) {
          setIsHeaderVisible(true);
          lastMainScrollTopRef.current = nextTop;
          return;
        }
        const prevTop = lastMainScrollTopRef.current;
        if (nextTop <= 8) setIsHeaderVisible(true);
        else if (nextTop > prevTop + 6) setIsHeaderVisible(false);
        else if (nextTop < prevTop - 6) setIsHeaderVisible(true);
        lastMainScrollTopRef.current = nextTop;
      }}
      onTouchMove={() => {
        setIsEfficiencyDetailsOpen(false);
        setIsSettingsOpen(false);
        setIsCreditPurchaseOpen(false);
      }}
      className={`miniapp-shell miniapp-scrollless h-screen overflow-y-auto p-4 ${isWebRuntime ? 'miniapp-web-runtime' : ''} ${isLightTheme ? 'miniapp-light' : 'bg-slate-950 text-slate-100'}`}
    >
      {reportPromptTask ? (
        <TaskCompletionReportDialog
          onDownload={startAiGeneratedDocumentDownload}
          taskId={reportPromptTask.id}
          taskTitle={reportPromptTask.title}
          onClose={() => setReportPromptTask(null)}
          onNeverShow={async () => {
            const { user } = await api.updateUserSettings({ offerTaskCompletionReport: false });
            setCurrentUser(user);
          }}
          onGenerated={() => void loadData()}
        />
      ) : null}
      {isSettingsOpen ? createPortal(
        <div className="settings-modal-backdrop fixed inset-0 z-[320] flex items-center justify-center overflow-hidden bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSettingsOpen(false); }}
          onTouchMove={(event) => event.stopPropagation()}>
          <section data-miniapp-popover="settings" data-settings-modal role="dialog" aria-modal="true" aria-label="Настройки Планировыча"
            className={['settings-modal-shell surface-popover miniapp-settings-popover relative flex h-[min(88dvh,780px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border shadow-2xl', isLightTheme ? 'miniapp-light' : ''].join(' ')}
            data-theme={isLightTheme ? 'light' : 'dark'}>
            <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--panel-border)] px-5 py-4 sm:px-6">
              <h2 className="text-xl font-bold text-primary">Настройки Планировыча</h2>
              <button type="button" className="surface-muted rounded-xl p-2 text-muted hover:text-primary" onClick={() => setIsSettingsOpen(false)} aria-label="Закрыть настройки"><X size={18} /></button>
            </div>
            <div className="settings-modal-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-6 pt-4 sm:px-6">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-primary">Тема интерфейса</p>
                <div className="theme-preference-switch grid grid-cols-3 gap-1 rounded-xl surface-muted p-1 text-xs" role="group" aria-label="Тема интерфейса">
                  {(['light', 'dark', 'auto'] as const).map(mode => (
                    <button key={mode} type="button" aria-pressed={miniThemeMode === mode}
                      onClick={() => setMiniThemeMode(mode)}
                      className={['theme-preference-switch-option rounded-lg px-3 py-2.5 font-semibold transition', miniThemeMode === mode ? 'theme-preference-switch-option-active' : 'text-muted hover:brightness-110'].join(' ')}>
                      {mode === 'light' ? 'Светлая' : mode === 'dark' ? 'Тёмная' : 'Авто'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Авто: тёмная с 20:00 до 05:00 по часовому поясу пользователя.</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-primary">Часовой пояс</p>
                <CustomSelect value={userTimeZone} onChange={(value) => {
                  void api.updateUserSettings({ timeZone: value })
                    .then(({ user }) => { setCurrentUser(user); localStorage.setItem('btm:user-timezone', value); })
                    .catch(error => setError(error instanceof Error ? error.message : 'Не удалось сохранить часовой пояс'));
                }}
                  options={[...new Set([userTimeZone,'Europe/Moscow','Europe/Kaliningrad','Europe/Samara','Asia/Yekaterinburg','Asia/Omsk','Asia/Krasnoyarsk','Asia/Irkutsk','Asia/Yakutsk','Asia/Vladivostok','Asia/Magadan','Asia/Kamchatka','Europe/Minsk','Europe/Berlin','Europe/London','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Dubai','Asia/Almaty','Asia/Tokyo'])].map(value => ({ value, label: value }))}
                  ariaLabel="Часовой пояс пользователя" detachedPopup popupVariant="settings" />
              </div>
              <AiCheckupScheduleSettings user={currentUser} onUserUpdated={setCurrentUser}>
                <button type="button" onClick={() => { void generateManualCheckup(); }}
                  disabled={manualCheckupLoading}
                  className="primary-button mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60">
                  {manualCheckupLoading ? 'Формируем ИИ-чекап…' : 'Сформировать чекап сейчас'}
                </button>
                <p className="mt-2 text-xs leading-relaxed text-muted">Ручной запуск без ограничений по количеству проверок. Кредиты списываются по фактическим токенам.</p>
                {manualCheckupError ? <p className="mt-2 text-xs text-rose-500" role="alert">{manualCheckupError}</p> : null}
              </AiCheckupScheduleSettings>
              <div className="border-t border-[color:var(--panel-border)] pt-4">
                <p className="mb-2 text-sm font-semibold text-primary">Уведомления от ИИ в новых задачах</p>
                <CustomSelect value={aiNotificationDefault ? 'enabled' : 'disabled'}
                  onChange={value => {
                    const enabled=value === 'enabled';
                    setAiNotificationDefault(enabled);
                    localStorage.setItem('btm:ai-notifications-default-enabled',enabled ? '1' : '0');
                  }}
                  options={[{ value:'enabled',label:'Включены для новых задач' },{ value:'disabled',label:'Выключены для новых задач' }]}
                  ariaLabel="Уведомления от ИИ в новых задачах" detachedPopup popupVariant="settings" />
              </div>
              <div className="border-t border-[color:var(--panel-border)] pt-4">
                <p className="mb-2 text-sm font-semibold text-primary">Предлагать отчёт по выполнению задачи</p>
                <CustomSelect value={currentUser?.offerTaskCompletionReport !== false ? 'enabled' : 'disabled'}
                  onChange={value => void api.updateUserSettings({ offerTaskCompletionReport: value === 'enabled' })
                    .then(({ user }) => setCurrentUser(user))
                    .catch(error => setError(error instanceof Error ? error.message : 'Не удалось сохранить настройку'))}
                  options={[{value:'enabled',label:'Включено'},{value:'disabled',label:'Выключено'}]}
                  ariaLabel="Предлагать отчёт" detachedPopup popupVariant="settings" />
              </div>
              {isWebRuntime ? <div className="border-t border-[color:var(--panel-border)] pt-4">
                <p className="mb-2 text-sm font-semibold text-primary">Аккаунт</p>
                {hasAccount ? (
                  <>
                    <p className="mb-2 break-words text-sm text-muted">{accountDisplayName}</p>
                    <button type="button" className="surface-muted w-full rounded-xl px-3 py-2 text-sm text-primary"
                      onClick={() => void logout()} disabled={logoutSubmitting}>{logoutSubmitting ? 'Выходим…' : 'Выйти'}</button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openAuthModal('login')} className="surface-muted rounded-xl px-3 py-2 text-sm">Войти</button>
                    <button type="button" onClick={() => openAuthModal('register')} className="primary-button rounded-xl px-3 py-2 text-sm">Регистрация</button>
                  </div>
                )}
              </div> : null}
            </div>
            </div>
          </section>
        </div>, document.body
      ) : null}
      <div className="mx-auto max-w-2xl space-y-4">
        <section className={`sticky top-0 z-30 miniapp-premium-topbar rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 backdrop-blur transition-transform duration-200 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-[130%]'}`}>
          <div className="flex items-center gap-2">
            <WorkspaceGlobalSearch
              mobile
              userId={currentUser?.id ?? ''}
              value={taskSearch}
              onChange={(value) => { setTaskSearch(value); setIsHeaderVisible(true); }}
              onOpenChange={(open) => { setIsGlobalSearchOpen(open); if (open) setIsHeaderVisible(true); }}
              tasks={tasks}
              subtasks={globalSearchSubtasks}
              onOpenTask={openTaskModal}
              onOpenSubtask={openSubtaskModal}
              onOpenNote={(id) => {
                setRequestedStandaloneNote({ id, serial: Date.now() });
                setIsStandaloneNotesOpen(true);
              }}
            />
            <div className="relative inline-flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => { if (currentUser?.isGuest && isWebRuntime) { setIsCreditPurchaseOpen(false); openAuthModal('register'); } else { setCreditPopoverView('purchase'); setIsCreditPurchaseOpen((open) => !open); } }} className="miniapp-credit-badge inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold" title={currentUser?.isGuest ? 'Зарегистрируйтесь, чтобы получить 100 ИИ-кредитов' : 'Купить AI-кредиты'} aria-label={`AI-кредиты: ${aiCredits}`} aria-expanded={isCreditPurchaseOpen}>
                <Coins size={15} />
                <span>{aiCredits}</span>
              </button>
              {isCreditPurchaseOpen ? <div onScroll={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()} className="miniapp-credit-popover absolute right-0 top-full z-[60] mt-2 max-h-[75vh] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border p-4 shadow-2xl">
                <div className="miniapp-credit-popover-hero -m-4 mb-3 rounded-t-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="miniapp-credit-popover-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Coins size={17} /></span>
                      <div><h2 className="font-semibold text-primary">AI-кредиты</h2><p className="mt-0.5 text-xs text-muted">Баланс: <strong className="text-primary">{aiCredits}</strong></p></div>
                    </div>
                    <button type="button" className="miniapp-credit-popover-close rounded-full p-1.5 text-muted" onClick={() => setIsCreditPurchaseOpen(false)} aria-label="Закрыть"><X size={16} /></button>
                  </div>
                </div>
                <div className="credit-view-toggle flex gap-1 rounded-xl border p-1">
                  <button type="button" className={`credit-view-toggle-button flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${creditPopoverView === 'purchase' ? 'is-active is-purchase' : ''}`} onClick={() => setCreditPopoverView('purchase')}>Пополнить</button>
                  <button type="button" className={`credit-view-toggle-button flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${creditPopoverView === 'statistics' ? 'is-active is-statistics' : ''}`} onClick={() => { setCreditPopoverView('statistics'); void loadCreditUsageStatistics(); }}>Статистика</button>
                </div>
                {creditPopoverView === 'statistics' ? (
                  <div key="credits-statistics" className="credit-switch-content mt-3"><CreditUsageStats statistics={creditUsageStatistics} loading={creditUsageStatisticsLoading} error={creditUsageStatisticsError} compact /></div>
                ) : (
                  <div key="credits-purchase" className="credit-switch-content">
                    <div className="mt-3 space-y-2">{creditPacks.filter((pack) => pack.isActive).map((pack) => <div key={pack.key} className="miniapp-credit-pack-card flex items-center justify-between gap-2 rounded-xl border p-2.5">
                      <div><div className="text-xs font-bold text-primary">{pack.creditsAmount.toLocaleString('ru-RU')} AI-кредитов</div><div className="mt-0.5 text-[11px] text-muted">{pack.price.toLocaleString('ru-RU')} ₽</div></div>
                      <button type="button" disabled={!creditPurchaseAvailable || creditPurchase.creatingPackKey !== null} onClick={() => void creditPurchase.start(pack.key)} className="miniapp-credit-buy-button rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{creditPurchase.creatingPackKey === pack.key ? 'Создаём…' : 'Купить'}</button>
                    </div>)}</div>
                    {creditPurchase.isReceiptEmailRequired ? <div className="mt-3 space-y-2">
                      <input type="email" autoComplete="email" value={creditPurchase.receiptEmail} onChange={(event) => creditPurchase.setReceiptEmail(event.target.value)} placeholder="Email для чека" aria-label="Email для чека" className="miniapp-credit-email-input w-full rounded-lg border px-3 py-2 text-xs" />
                      <button type="button" disabled={creditPurchase.creatingPackKey !== null || !creditPurchase.receiptEmail.trim()} onClick={() => void creditPurchase.retryWithReceiptEmail()} className="miniapp-credit-buy-button w-full rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{creditPurchase.creatingPackKey ? 'Создаём платёж…' : 'Продолжить'}</button>
                    </div> : null}
                    {creditPurchase.message ? <p className="miniapp-credit-message mt-3 rounded-xl border p-2.5 text-xs" role="status">{creditPurchase.message}</p> : null}
                  </div>
                )}
              </div> : null}
              <button
                type="button"
                onClick={() => setIsEfficiencyDetailsOpen((open) => !open)}
                data-miniapp-popover="efficiency"
                className="miniapp-efficiency-button inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 transition-colors"
                aria-label={`Рейтинг эффективности: ${formattedEfficiencyScore} из 100`}
                aria-expanded={isEfficiencyDetailsOpen}
                title={`Текущий рейтинг: ${formattedEfficiencyScore}/100`}
              >
                <svg width="30" height="30" viewBox="0 0 72 72" aria-hidden="true" className="miniapp-efficiency-orb">
                  <defs><linearGradient id="miniEffFill" x1="10" y1="10" x2="62" y2="62"><stop offset="0%" stopColor="#38bdf8" /><stop offset="45%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#f472b6" /></linearGradient><linearGradient id="miniEffRing" x1="12" y1="58" x2="60" y2="14"><stop offset="0%" stopColor="#22d3ee" /><stop offset="55%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#fb7185" /></linearGradient></defs>
                  <circle cx="36" cy="36" r="25" fill="url(#miniEffFill)" opacity="0.18" /><circle cx="36" cy="36" r="26" fill="none" stroke="rgba(148,163,184,0.32)" strokeWidth="5" /><circle cx="36" cy="36" r="26" fill="none" stroke="url(#miniEffRing)" strokeWidth="5" strokeLinecap="round" pathLength="100" strokeDasharray={`${efficiencyScore} 100`} transform="rotate(-90 36 36)" /><path d="M36 17l5.4 12.1 13.1 1.4-9.8 8.8 2.8 12.9L36 45.5l-11.5 6.7 2.8-12.9-9.8-8.8 13.1-1.4L36 17z" fill="url(#miniEffFill)" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                data-miniapp-popover="settings"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 transition-colors hover:bg-amber-500/10"
                aria-label="Открыть настройки"
                title="Настройки"
              >
                <Settings size={16} className="text-amber-400" />
              </button>
              {isEfficiencyDetailsOpen ? (
                <div data-miniapp-popover="efficiency" className="efficiency-details-popover-modern absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[1.6rem] border p-4 text-xs shadow-2xl backdrop-blur">
                  <div className="text-center">
                    <div className="efficiency-score-hero tabular-nums">{formattedEfficiencyScore}/100</div>
                    <p className="mt-1 text-sm font-semibold text-primary">{efficiencyGradeMessage}</p>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="efficiency-detail-row"><span>Задачи</span><b>+{formatRatingDelta(currentUser?.efficiencyTaskScore ?? 0)} рейтинга</b></div>
                    <div className="efficiency-detail-row"><span>Привычки</span><b>+{formatRatingDelta(currentUser?.efficiencyHabitScore ?? 0)} рейтинга</b></div>
                    <div className="efficiency-detail-row"><span>Работа с ИИ</span><b>+{formatRatingDelta(currentUser?.efficiencyAiScore ?? 0)} рейтинга</b></div>
                    <div className="efficiency-detail-row efficiency-detail-row-focus"><span>Режим концентрации (х2)</span><b>+{formatRatingDelta(currentUser?.efficiencyFocusScore ?? 0)} рейтинга</b></div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {displayMode === 'timeline' && listTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">Задачи не найдены.</div>
        ) : null}

        {displayMode === 'list' ? (
          <div className="space-y-4">
          <section className="miniapp-premium-habits space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Привычки</h2>
              <span className="miniapp-habits-summary rounded-full px-2.5 py-1 text-xs font-semibold">
                Выполнено {sortedHabits.filter((habit) => getHabitCompletedForDate(habit, toDateKey(new Date())) >= habit.targetCount).length} из {sortedHabits.length}
              </span>
            </div>
            <div className="miniapp-habits-strip flex items-center gap-2 overflow-x-auto pb-1">
              {sortedHabits.map((habit) => {
                const completed = getHabitCompletedForDate(habit, toDateKey(new Date()));
                const cappedCompleted = Math.min(completed, habit.targetCount);
                const progress = Math.round((cappedCompleted / Math.max(1, habit.targetCount)) * 100);
                const isCompleted = completed >= habit.targetCount;
                const isPulsing = completedHabitPulseId === habit.id;
                return (
                  <button
                    key={habit.id}
                    type="button"
                    className={`miniapp-habit-circle relative inline-flex h-[58px] w-[58px] shrink-0 select-none items-center justify-center rounded-full border text-center transition-transform ${isCompleted ? 'miniapp-habit-circle-completed' : ''} ${isPulsing ? 'miniapp-habit-complete-pulse scale-110' : ''}`}
                    style={{
                      '--habit-color': isCompleted ? '#94a3b8' : habit.color,
                      '--habit-progress': `${progress}%`
                    } as CSSProperties}
                    onMouseDown={() => startHabitPress(habit)}
                    onMouseUp={() => finishHabitPress(habit)}
                    onMouseLeave={cancelHabitPress}
                    onTouchStart={() => startHabitPress(habit)}
                    onTouchEnd={() => finishHabitPress(habit)}
                    onTouchCancel={cancelHabitPress}
                    aria-label={`${habit.name}: ${cappedCompleted} из ${habit.targetCount}`}
                    title={isCompleted ? 'Привычка выполнена' : 'Нажмите для редактирования, зажмите для отметки'}
                  >
                    <span className="miniapp-habit-circle-core absolute inset-[5px] rounded-full" />
                    <span className="relative z-10 flex flex-col items-center leading-none">
                      <span className="text-lg">{habit.icon}</span>
                      <span className="mt-1 text-[10px] font-semibold">{cappedCompleted}/{habit.targetCount}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openCreateHabitModal}
                className="miniapp-habit-add inline-flex h-[58px] min-w-[58px] shrink-0 items-center justify-center rounded-full border border-dashed border-emerald-400/70 bg-emerald-500/10 text-emerald-300"
                aria-label="Добавить привычку"
                title="Добавить привычку"
              >
                <Plus size={18} />
              </button>
            </div>
          </section>

          <div className="miniapp-list-workspace">
            <div className="miniapp-workspace-toolbar-card">
            <MiniWorkspaceTools
              mode={displayMode}
              timeFilter={timeFilter}
              onTimeFilterChange={setTimeFilter}
              sortMode={listSortMode}
              onSortChange={setListSortMode}
              spheres={spheres}
              selectedSphereIds={listSelectedSphereIds}
              onSelectAllSpheres={(all) => setListSelectedSphereIds(all ? null : [])}
              onToggleSphere={toggleListSphereSelection}
              timelineSphereId={sphereFilter}
              onTimelineSphereChange={setSphereFilter}
              onNotesOpen={() => { setRequestedStandaloneNote(null); setIsStandaloneNotesOpen(true); }}
              onDisplayModeChange={setDisplayMode}
              onPostpone={() => void postponeAllOverdueToToday()}
              postponing={isPostponingOverdue}
              canPostpone={overdueTasks.length > 0}
            />
            </div>
            <div className="miniapp-task-feed">
            {listTasks.length === 0 ? (
              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-4 text-sm text-slate-300">Задачи не найдены.</div>
            ) : null}

            {listTasks.map((task) => {
              const isEvent = task.taskType === 'EVENT';
              const hasOverdueState = !isEvent && isOverdue(task);
              const taskSphere = task.sphereId ? spheres.find((item) => item.id === task.sphereId) : undefined;
              const taskSphereColor = taskSphere?.color ?? (isEvent ? '#d97706' : '#64748b');
              const taskSphereLabel = taskSphere?.name ?? (isEvent ? 'Событие' : 'Без сектора');
              const importanceRating = Math.max(0, Math.min(1, task.importance / 5));
              const importanceBadgeColor = `rgba(${Math.round(80 + importanceRating * 170)}, ${Math.round(165 - importanceRating * 95)}, ${Math.round(220 - importanceRating * 190)}, ${isLightTheme ? 0.48 : 0.32})`;
              const taskCardStyle = {
                '--miniapp-sector-color': taskSphereColor
              } as CSSProperties;

              return (
                <article
                  key={task.id}
                  className={`miniapp-task-list-card relative border border-slate-700 bg-slate-800/80 p-3 ${hasOverdueState ? 'miniapp-task-overdue' : ''} ${isEvent ? 'miniapp-task-list-event-card' : ''}`}
                  style={taskCardStyle}
                >
                  <button
                    type="button"
                    className="relative flex w-full items-start gap-2 text-left"
                    onClick={() => openTaskModal(task)}
                  >
                    <div className="min-w-0 flex-1 pr-9">
                      <span className="miniapp-task-sector-badge mb-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <span className="miniapp-task-sector-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                        <span className="truncate">{taskSphereLabel}</span>
                      </span>
                      <h3 className="miniapp-task-title truncate font-semibold">{task.title}</h3>
                      {listSortMode === 'importance' ? (
                        <>
                          <p className={`mt-1 text-xs font-medium ${hasOverdueState ? 'miniapp-overdue-label' : 'text-sky-200'}`}>{formatRemaining(task.dueDate)}</p>
                          <span
                            className="miniapp-importance-rating mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: importanceBadgeColor }}
                            title={`Рейтинг важности: ${importanceRating.toFixed(1)}`}
                          >
                            <Gauge size={13} />
                            {importanceRating.toFixed(1)}
                          </span>
                        </>
                      ) : (
                        <>
                          <p className="miniapp-task-date mt-1 inline-flex items-center gap-1.5 text-xs">
                            <CalendarDays size={13} aria-hidden="true" />
                            {isEvent ? 'Событие' : 'Дедлайн'}: {formatDueDate(task.dueDate)}
                          </p>
                          <p className={`miniapp-task-time mt-1 flex items-center gap-1.5 text-xs font-semibold ${hasOverdueState ? 'miniapp-overdue-label' : ''}`}>
                            <Clock3 size={13} aria-hidden="true" />{formatRemaining(task.dueDate)}
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                  {!isEvent ? (
                    <button type="button"
                      className="miniapp-task-complete-trigger absolute right-3 top-3 inline-flex items-center justify-center rounded-full"
                      onClick={() => void completeTask(task.id)}
                      disabled={completingId === task.id}
                      aria-label={`Завершить задачу: ${task.title}`}
                      title="Завершить задачу">
                      {completingId === task.id ? <Loader2 size={18} className="animate-spin" /> : <span className="miniapp-task-complete-ring" />}
                    </button>
                  ) : null}
                </article>
              );
            })}
            </div>
          </div>
          </div>
        ) : (

          <section className="miniapp-timeline-section miniapp-premium-timeline -mx-4 border-y border-slate-700 bg-slate-900 px-3 py-3 sm:mx-0 sm:rounded-xl sm:border">
            <div className="miniapp-workspace-toolbar-card miniapp-workspace-timeline-toolbar">
            <MiniWorkspaceTools
              mode={displayMode}
              timeFilter={timeFilter}
              onTimeFilterChange={setTimeFilter}
              sortMode={listSortMode}
              onSortChange={setListSortMode}
              spheres={spheres}
              selectedSphereIds={listSelectedSphereIds}
              onSelectAllSpheres={(all) => setListSelectedSphereIds(all ? null : [])}
              onToggleSphere={toggleListSphereSelection}
              timelineSphereId={sphereFilter}
              onTimelineSphereChange={setSphereFilter}
              onNotesOpen={() => { setRequestedStandaloneNote(null); setIsStandaloneNotesOpen(true); }}
              onDisplayModeChange={setDisplayMode}
              onPostpone={() => void postponeAllOverdueToToday()}
              postponing={isPostponingOverdue}
              canPostpone={overdueTasks.length > 0}
            />
            </div>
            <div className="miniapp-timeline-navigation">
              <div className="miniapp-timeline-view-switch" role="group" aria-label="Масштаб таймлайна">
                {([['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']] as const).map(([view, label]) => (
                  <button key={view} type="button" className={timelineView === view ? 'is-active' : ''} onClick={() => setTimelineView(view)} aria-pressed={timelineView === view}>{label}</button>
                ))}
              </div>
              <div className="miniapp-timeline-period-toolbar">
              <div className="miniapp-timeline-date-nav">
                <button type="button" onClick={() => moveTimelinePeriod(-1)} className="miniapp-timeline-date-arrow" aria-label="Предыдущий период" title="Предыдущий период"><ChevronLeft size={17} /></button>
                <div className="miniapp-timeline-date-current" aria-live="polite">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span className="miniapp-timeline-date-copy">
                    <strong>{timelineView === 'day' ? timelineToday.anchorLabel : timelineCalendar.label}</strong>
                    <small>{timelineView === 'day' ? 'Выбранный день' : timelineView === 'week' ? 'Выбранная неделя' : 'Выбранный месяц'}</small>
                  </span>
                </div>
                <button type="button" onClick={() => moveTimelinePeriod(1)} className="miniapp-timeline-date-arrow" aria-label="Следующий период" title="Следующий период"><ChevronRight size={17} /></button>
              </div>
              </div>
            </div>
            {timelineView === 'day' ? <div className="relative overflow-x-hidden">
              <div ref={timelineGridRef} className="relative" style={{ height: `${timelineToday.totalHeight}px` }}>
                {timelineToday.hourTops.map((top, hour) => {
                  const nextHourTop = timelineToday.hourTops[hour + 1] ?? timelineToday.totalHeight;
                  return (
                    <div
                      key={`hour-block-${hour}`}
                      className="miniapp-timeline-hour-block absolute inset-x-0"
                      style={{
                        top: `${top + 2}px`,
                        height: `${Math.max(0, nextHourTop - top - 4)}px`
                      }}
                      aria-hidden="true"
                    >
                      <span className="miniapp-timeline-hour-block-label">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                    </div>
                  );
                })}
                {timelineToday.quarterTops.map((top, quarterIndex) => {
                  if (timelineToday.occupiedQuarters.has(quarterIndex)) return null;
                  const hour = Math.floor(quarterIndex / TIMELINE_QUARTERS_PER_HOUR);
                  const minute = (quarterIndex % TIMELINE_QUARTERS_PER_HOUR) * 15;
                  const timeLabel = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                  return (
                    <button
                      type="button"
                      key={`empty-quarter-${quarterIndex}`}
                      className="miniapp-timeline-empty-slot absolute"
                      style={{
                        top: `${top}px`,
                        height: `${timelineToday.quarterHeights[quarterIndex]}px`,
                        left: '4rem',
                        width: 'calc(100% - 4rem)'
                      }}
                      onClick={() => openCreateTaskModalForTimelineQuarter(quarterIndex)}
                      aria-label={`Создать задачу на ${timeLabel}`}
                      title={`Создать задачу на ${timeLabel}`}
                    />
                  );
                })}
                {timelineToday.quarterTops.map((top, quarterIndex) => {
                  const minute = (quarterIndex % TIMELINE_QUARTERS_PER_HOUR) * 15;
                  const isHour = minute === 0;
                  return (
                    <div
                      key={`quarter-${quarterIndex}`}
                      className={`miniapp-timeline-quarter-line absolute border-t ${isHour ? 'miniapp-timeline-hour-line' : ''}`}
                      style={{ top: `${top}px` }}
                    />
                  );
                })}
                {timelineToday.isTodayVisible ? (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: `${timelineToday.currentTimeTop}px` }}>
                    <span className="h-3 w-3 -translate-x-1 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                    <span className="h-[2px] w-full bg-rose-400/90" />
                  </div>
                ) : null}
                {timelineToday.timelineEntries.map((task) => {
                  const dueDate = new Date(task.dueDate as string);
                  const taskHour = dueDate.getHours();
                  const taskQuarter = (taskHour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(dueDate.getMinutes() / 15);
                  const isEvent = task.taskType === 'EVENT';
                  const isReminder = task.taskType === 'REMINDER';
                  const hasOverdueState = !isEvent && !isReminder && isOverdue(task);
                  const isSubtask = Boolean(task.parentTaskId);
                  const parentTask = task.parentTaskId ? (taskById.get(task.parentTaskId) ?? null) : null;
                  const taskForSectorColor = parentTask ?? task;
                  const sphereColor = taskForSectorColor.sphereId ? spheres.find((item) => item.id === taskForSectorColor.sphereId)?.color ?? null : null;
                  const placement = timelineTaskPlacements.get(task.id) ?? { top: timelineToday.quarterTops[taskQuarter] + 4 };
                  return (
                    <button
                      type="button"
                      key={task.id}
                      className={`miniapp-timeline-task-card absolute border px-2 py-1 text-left ${hasOverdueState ? 'miniapp-task-overdue' : ''} ${isSubtask ? 'miniapp-timeline-subtask-card' : ''} ${isEvent ? 'miniapp-timeline-event-card' : ''} ${isReminder ? 'miniapp-timeline-reminder-card' : ''}`}
                      style={{
                        top: `${placement.top}px`,
                        height: `${isSubtask ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT}px`,
                        left: 'calc(4rem + 2px)',
                        width: 'calc(100% - 4rem - 8px)',
                        zIndex: 10,
                        borderColor: isReminder ? 'rgba(14,165,233,0.85)' : isEvent
                          ? 'rgba(245,158,11,0.9)'
                          : isSubtask
                            ? (isLightTheme ? 'rgba(148,163,184,0.95)' : 'rgba(100,116,139,0.9)')
                            : (hexToRgba(sphereColor ?? '', isLightTheme ? 0.62 : 0.8) ?? (isLightTheme ? 'rgba(14,165,233,0.45)' : 'rgba(56,189,248,0.35)')),
                        background: isReminder ? (isLightTheme ? 'rgba(224,242,254,0.97)' : 'rgba(3,105,161,0.34)') : isEvent
                          ? (isLightTheme ? 'rgba(254,243,199,0.96)' : 'rgba(146,64,14,0.42)')
                          : isSubtask
                            ? `linear-gradient(135deg, ${hexToRgba(sphereColor ?? '', isLightTheme ? 0.2 : 0.34) ?? (isLightTheme ? 'rgba(224,242,254,0.94)' : 'rgba(14,165,233,0.26)')}, ${isLightTheme ? 'rgba(248,250,252,0.94)' : 'rgba(15,23,42,0.82)'})`
                            : (hexToRgba(sphereColor ?? '', isLightTheme ? 0.15 : 0.25) ?? (isLightTheme ? 'rgba(224,242,254,0.94)' : 'rgba(14,165,233,0.18)')),
                        borderLeftWidth: isSubtask ? '4px' : '1px',
                        borderLeftColor: isReminder ? 'rgba(2,132,199,0.95)' : isSubtask
                          ? (hexToRgba(sphereColor ?? '', 0.95) ?? 'rgba(56,189,248,0.95)')
                          : isEvent
                            ? 'rgba(245,158,11,0.9)'
                            : (hexToRgba(sphereColor ?? '', 0.8) ?? 'rgba(56,189,248,0.35)')
                      }}
                      onClick={() => {
                        if (isReminder) return;
                        if (isSubtask) {
                          openSubtaskModal(task);
                          return;
                        }
                        openTaskModal(task);
                      }}
                    >
                      <p className={`miniapp-timeline-card-title font-semibold ${isSubtask ? 'text-xs leading-4' : 'text-sm'}`}>{isReminder ? '🔔 ' : ''}{task.title}</p>
                      <p className={`${isSubtask ? 'text-[10px] leading-3' : 'text-xs'} ${hasOverdueState ? 'miniapp-overdue-label font-medium' : 'text-slate-300'}`}>{hasOverdueState ? formatRemaining(task.dueDate) : `${isReminder ? 'Напоминание · ' : isEvent ? 'Событие · ' : isSubtask ? 'Подзадача · ' : ''}${formatDueDate(task.dueDate)}`}</p>
                    </button>
                  );
                })}
                {timelineToday.scheduledHabits.map(({ habit, reminderTime }) => {
                  const placement = timelineHabitPlacements.get(`${habit.id}-${reminderTime}`) ?? { top: 4 };
                  const completed = getHabitCompletedForDate(habit, timelineToday.dateKey);
                  const progress = Math.round((Math.min(completed, habit.targetCount) / Math.max(1, habit.targetCount)) * 100);
                  return (
                    <button
                      type="button"
                      key={`timeline-habit-${habit.id}-${reminderTime}`}
                      className="miniapp-timeline-habit-card absolute rounded-md border px-2 py-1 text-left"
                      onClick={() => openEditHabitModal(habit)}
                      style={{
                        top: `${placement.top}px`,
                        minHeight: `${TIMELINE_CARD_HEIGHT}px`,
                        left: 'calc(4rem + 2px)',
                        width: 'calc(100% - 4rem - 8px)',
                        zIndex: 9,
                        borderColor: hexToRgba(habit.color, isLightTheme ? 0.55 : 0.72) ?? habit.color,
                        background: `linear-gradient(135deg, ${hexToRgba(habit.color, isLightTheme ? 0.18 : 0.28) ?? 'rgba(34,197,94,0.18)'}, ${isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.82)'})`,
                        borderLeftWidth: '4px',
                        borderLeftColor: habit.color
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="miniapp-habit-circle inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base" style={{ '--habit-color': habit.color, '--habit-progress': `${progress}%` } as CSSProperties}>
                          <span className="miniapp-habit-circle-core inline-flex h-6 w-6 items-center justify-center rounded-full">{habit.icon}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{habit.name}</p>
                          <p className="miniapp-timeline-habit-meta text-xs">Привычка · {reminderTime} · {completed}/{habit.targetCount}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div> : (
              <div className={`miniapp-calendar-grid miniapp-calendar-grid-${timelineView}`}>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => <div key={weekday} className="miniapp-calendar-weekday">{weekday}</div>)}
                {timelineCalendar.days.map(({ date, dateKey, tasks: dayTasks, habits: dayHabits }) => {
                  const isToday = dateKey === toDateKey(timelineNow);
                  const isOutsideMonth = timelineView === 'month' && date.getMonth() !== timelineAnchorDate.getMonth();
                  const taskEntries = [
                    ...dayTasks.map((task) => ({ id: task.id, time: new Date(task.dueDate as string).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), title: task.title, color: task.taskType === 'REMINDER' ? '#0284c7' : task.taskType === 'EVENT' ? '#f59e0b' : (spheres.find((sphere) => sphere.id === (taskById.get(task.parentTaskId ?? '') ?? task).sphereId)?.color ?? '#38bdf8'), task })),
                  ];
                  const habitEntries = dayHabits.map(({ habit, reminderTime }) => ({ id: `habit-${habit.id}-${reminderTime}`, time: reminderTime, title: `${habit.icon} ${habit.name}`, color: habit.color, habit }));
                  const entries = [...taskEntries, ...(timelineView === 'month' ? [] : habitEntries)].sort((a, b) => a.time.localeCompare(b.time));
                  const visibleEntries = timelineView === 'month' ? entries.slice(0, 3) : entries;
                  const hourlyEntries = timelineView === 'week'
                    ? Array.from(new Set(visibleEntries.map((entry) => entry.time.slice(0, 2)))).map((hour) => ({ hour, entries: visibleEntries.filter((entry) => entry.time.startsWith(hour)) }))
                    : [];
                  return (
                    <div key={dateKey} className={`miniapp-calendar-day ${isToday ? 'is-today' : ''} ${isOutsideMonth ? 'is-outside' : ''}`}>
                      <button type="button" className="miniapp-calendar-date" onClick={() => openDayTimeline(date)} aria-label={`Открыть таймлайн на ${date.toLocaleDateString('ru-RU')}`}>
                        {timelineView === 'week' && <span>{date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>}
                        <strong>{date.getDate()}</strong>
                      </button>
                      <div className="miniapp-calendar-entries">
                        {(timelineView === 'week' ? hourlyEntries : [{ hour: '', entries: visibleEntries }]).map((group) => (
                          <div key={group.hour || 'month'} className={timelineView === 'week' ? 'miniapp-calendar-hour-group' : undefined}>
                            {timelineView === 'week' ? <span className="miniapp-calendar-hour-label">{group.hour}:00</span> : null}
                            {group.entries.map((entry) => (
                              <button key={entry.id} type="button" className={`miniapp-calendar-entry ${'task' in entry && entry.task.taskType === 'EVENT' ? 'miniapp-calendar-event-entry' : ''} ${'task' in entry && entry.task.taskType === 'REMINDER' ? 'miniapp-calendar-reminder-entry' : ''}`} style={{ '--calendar-entry-color': entry.color } as CSSProperties} onClick={() => 'task' in entry ? (entry.task.taskType === 'REMINDER' ? undefined : entry.task.parentTaskId ? openSubtaskModal(entry.task) : openTaskModal(entry.task)) : openEditHabitModal(entry.habit)}>
                                <span className="miniapp-calendar-entry-title">{entry.title}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                        {entries.length > visibleEntries.length ? <span className="miniapp-calendar-more">Ещё {entries.length - visibleEntries.length}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {openedTask && openedTaskDraft ? (
        <div
          className={`miniapp-slide-backdrop ${isWebRuntime ? 'miniapp-web-task-backdrop' : ''} fixed inset-0 ${isAiChatOpen ? 'z-[120]' : 'z-[90]'} flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('task')}`}
          style={isWebRuntime ? { top: webVisualViewport.top, bottom: 'auto', height: webVisualViewport.height } : undefined}
        >
          <div className="miniapp-slide-panel miniapp-focus-panel miniapp-focus-task-panel relative max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[2rem]">
            <div className="miniapp-focus-task-scroll-layout flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">{openedTask.taskType === 'EVENT' ? 'Редактирование события' : 'Фокус задачи'}</p>
                  {openedTask.isCollaborative ? <button type="button" className="miniapp-collaboration-badge truncate" onClick={() => setIsCollaborationSettingsOpen(true)}>Совместная задача</button> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openCalendarExport(openedTask.id)} className="miniapp-focus-icon-button" title="Добавить в календарь" aria-label="Добавить задачу в календарь">
                    <CalendarPlus size={16} />
                  </button>
                  <button type="button" onClick={() => setIsTaskSettingsOpen((prev) => !prev)} className="miniapp-focus-icon-button" title="Настройки задачи" aria-label="Открыть настройки задачи">
                    <Settings size={16} />
                  </button>
                  <button type="button" onClick={() => void saveAndCloseTaskEditor(openedTask.id, 'task')} disabled={savingId === openedTask.id} className="miniapp-focus-icon-button" aria-label="Сохранить и закрыть окно">
                    {savingId === openedTask.id ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  </button>
                </div>
              </div>

              {isTaskSettingsOpen ? (
                <div className="miniapp-task-settings-panel absolute left-4 right-4 top-14 z-50 max-h-[calc(94vh-5rem)] space-y-4 overflow-y-auto rounded-3xl border p-4 shadow-2xl sm:left-auto sm:max-h-[calc(88vh-5rem)] sm:w-[360px]">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Настройки {openedTask.taskType === 'EVENT' ? 'события' : 'задачи'}</h3>
                    <button type="button" className="miniapp-focus-icon-button" onClick={() => setIsTaskSettingsOpen(false)} aria-label="Закрыть настройки">
                      <X size={14} />
                    </button>
                  </div>
                  {openedTask.taskType !== 'EVENT' && openedTask.taskType !== 'REMINDER' ? (
                    <button type="button" className="miniapp-focus-primary-button flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm"
                      onClick={() => { setIsTaskSettingsOpen(false); setReportPromptTask(openedTask); }}>
                      <FileText size={15} /> Подготовить отчёт
                    </button>
                  ) : null}
                  <div className="task-edit-compact-grid grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-xs font-semibold text-slate-500">
                      <span className="mb-1 block">Сектор</span>
                      <CustomSelect
                        value={openedTaskDraft.sphereId ?? 'none'}
                        onChange={(value) => onChangeDraft(openedTask.id, { sphereId: value === 'none' ? null : value })}
                        options={[{ value: 'none', label: 'Без сектора', color: '#7c3aed' }, ...spheres.map((sphere) => ({ value: sphere.id, label: sphere.name, color: sphere.color }))]}
                        ariaLabel="Выбор сектора"
                        buttonClassName="focused-task-pill-select"
                        menuClassName="task-edit-sector-menu"
                        detachedPopup
                      />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-500">
                      <span className="mb-1 block">Уведомлять за</span>
                      <CustomSelect
                        value={openedTaskDraft.notifyBeforeMinutes == null ? 'null' : String(openedTaskDraft.notifyBeforeMinutes)}
                        onChange={(value) => onChangeDraft(openedTask.id, { notifyBeforeMinutes: value === 'null' ? null : Number(value) })}
                        options={NOTIFY_PRESETS}
                        ariaLabel="Уведомлять за"
                        disabled={Boolean(openedTaskDraft.isRecurring)}
                        buttonClassName="focused-task-pill-select"
                        menuClassName="task-edit-notify-menu"
                        detachedPopup
                      />
                    </label>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={Boolean(openedTaskDraft.isRecurring)}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          onChangeDraft(openedTask.id, enabled
                            ? { isRecurring: true, recurrenceText: openedTaskDraft.recurrenceText || '' }
                            : { isRecurring: false, recurrenceText: null, recurrenceJson: null, recurrenceSummary: null, recurrenceUntil: null });
                          if (!enabled) setTaskRecurrenceNextDueLabel(null);
                        }}
                      />
                      повторять
                    </label>
                    {openedTask.taskType !== 'EVENT' ? <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={openedTaskDraft.aiNotificationsEnabled ?? true}
                        onChange={(event) => onChangeDraft(openedTask.id, { aiNotificationsEnabled: event.target.checked })}
                      />
                      уведомления от ИИ
                    </label> : null}
                    {openedTask.taskType === 'TASK' ? <TaskMonitoringControls
                      enabled={openedTaskDraft.aiMonitoringEnabled === true}
                      onChange={(enabled) => onChangeDraft(openedTask.id, { aiMonitoringEnabled: enabled })}
                      taskId={openedTask.id}
                      allowed={!openedTask.parentTaskId && !openedTask.isCollaborative}
                    /> : null}
                    {openedTaskDraft.isRecurring ? (
                      <div className="rounded-2xl border border-violet-200/70 p-2 text-xs">
                        <p className="mb-1 text-slate-500">Опишите как должно повторяться {openedTask.taskType === 'EVENT' ? 'событие' : 'задача'}</p>
                        <textarea
                          className="miniapp-task-text-field min-h-16 w-full rounded-xl border px-2 py-2 text-sm"
                          placeholder="Например: каждый вторник в 17:00"
                          value={openedTaskDraft.recurrenceText ?? ''}
                          onChange={(event) => onChangeDraft(openedTask.id, { recurrenceText: event.target.value })}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <button type="button" className="recurrence-send-button rounded px-2 py-1 text-xs font-semibold disabled:opacity-70" onClick={() => void applyTaskRecurrence(openedTask.id)} disabled={taskRecurrenceLoading}>
                            {taskRecurrenceLoading ? '...' : 'Отправить'}
                          </button>
                          <p className="text-[11px] text-emerald-500">{openedTaskDraft.recurrenceSummary ?? ''}</p>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{taskRecurrenceNextDueLabel ? `Ближайший срок: ${taskRecurrenceNextDueLabel}` : ''}</p>
                      </div>
                    ) : null}
                  </div>
                  {openedTask.taskType !== 'EVENT' ? <div>
                    <p className="mb-2 text-xs font-semibold text-slate-500">Важность: {openedTaskDraft.importance ?? 3}</p>
                    <div className="importance-choice-group grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`importance-choice-button task-edit-importance rounded-xl border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${(openedTaskDraft.importance ?? 3) === level ? 'importance-choice-button-active ring-2' : 'opacity-80 hover:opacity-100'}`}
                          onClick={() => onChangeDraft(openedTask.id, { importance: level })}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div> : null}
                </div>
              ) : null}

              <div ref={openedTaskContentsScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1" onScroll={() => setIsOpenedTaskSubtaskFilterOpen(false)}>
                <textarea
                  ref={taskTitleInputRef}
                  value={openedTaskDraft.title}
                  onChange={(event) => onChangeDraft(openedTask.id, { title: event.target.value })}
                  className={`miniapp-focus-title-input invisible-scrollbar w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none ${taskTitleRows === 1 ? 'min-h-[2.15rem]' : taskTitleRows === 2 ? 'min-h-[4.5rem]' : 'min-h-[6.75rem]'}`}
                  rows={taskTitleRows}
                  placeholder="Без названия"
                />
                {openedTask.taskType === 'EVENT' ? (
                  <input
                    value={openedTaskDraft.location ?? ''}
                    onChange={(event) => onChangeDraft(openedTask.id, { location: event.target.value })}
                    className="miniapp-task-text-field mt-2 w-full rounded-2xl border px-3 py-2.5 text-sm"
                    placeholder="Место события"
                    autoComplete="street-address"
                  />
                ) : null}
                <div className={`${taskTitleRows === 1 ? '-mt-[0.15rem]' : 'mt-2'} flex items-center gap-2 text-sm font-semibold ${isOverdue({ ...openedTask, dueDate: fromInputDateTime(openedTaskDraft.dueDate) }) ? 'text-rose-500' : 'text-violet-500'}`}>
                  <DateTimePickerWithApply
                    value={fromInputDateTime(openedTaskDraft.dueDate)}
                    onChange={(nextValue) => onChangeDraft(openedTask.id, { dueDate: toInputDateTime(nextValue) })}
                    timelineTasks={timelinePickerTasks}
                    iconOnly
                    detachedPopup
                    buttonClassName="miniapp-focus-icon-button"
                  />
                  <span>{openedTaskDraft.dueDate ? `До дедлайна: ${formatRemaining(openedTaskDraft.dueDate)}` : 'Дедлайн не задан'}</span>
                </div>
                <div className="miniapp-focus-description-surface mt-3 rounded-2xl px-3 pb-1 pt-2">
                  <TaskDescriptionInput
                    value={openedTaskDraft.description}
                    onChange={(description) => onChangeDraft(openedTask.id, { description })}
                    className="miniapp-focus-description-input miniapp-task-description-preview invisible-scrollbar min-h-32 w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                    placeholder="Введите описание"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" className="miniapp-focus-icon-button" onClick={() => setIsTaskNotesEditorOpen(true)} title="Открыть заметки" aria-label="Открыть заметки">
                    <Maximize2 size={15} />
                  </button>
                  <button
                    type="button"
                    className={`miniapp-focus-icon-button ${isTaskAttachmentDragActive ? 'notes-open-button-active' : ''} ${isUploadingTaskAttachment ? 'opacity-60' : ''}`}
                    onClick={() => taskAttachmentInputRef.current?.click()}
                    onDragOver={(event) => { event.preventDefault(); setIsTaskAttachmentDragActive(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setIsTaskAttachmentDragActive(false); }}
                    onDrop={(event) => { event.preventDefault(); void uploadTaskAttachmentFiles(Array.from(event.dataTransfer.files ?? [])); }}
                    disabled={isUploadingTaskAttachment}
                    title={openedTask.taskType === 'EVENT' ? 'Добавить файлы к событию' : 'Добавить файлы к задаче'}
                    aria-label={openedTask.taskType === 'EVENT' ? 'Добавить файлы к событию' : 'Добавить файлы к задаче'}
                  >
                      <Paperclip size={15} />
                  </button>
                </div>
                <input ref={taskAttachmentInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleTaskAttachmentFileSelect} />
                {taskAttachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {taskAttachments.map((attachment) => (
                      <div key={attachment.id} className="miniapp-focus-attachment-pill inline-flex max-w-[210px] cursor-pointer items-center gap-1 rounded-xl border px-2 py-1 text-[11px]" role="button" tabIndex={0} title={`${attachment.name} • скачать`} onClick={() => downloadTaskAttachment(attachment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') downloadTaskAttachment(attachment); }}>
                        <span className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5">
                          <FileText size={12} className="shrink-0" />
                          <span className="truncate">{attachment.name}</span>
                        </span>
                        <button type="button" title="Удалить файл" onClick={(event) => { event.stopPropagation(); void removeTaskAttachment(attachment.id); }} className="rounded-md p-0.5 hover:bg-rose-600/80 hover:text-white">
                          <X size={11} className="shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {isTaskNotesEditorOpen ? <NotesEditor miniAppSheet value={openedTaskDraft.description} onChange={(description) => onChangeDraft(openedTask.id, { description })} onClose={() => setIsTaskNotesEditorOpen(false)} /> : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void completeTask(openedTask.id)} disabled={completingId === openedTask.id} className="miniapp-focus-success-button">
                    <CheckCircle2 size={14} /> {completingId === openedTask.id ? '...' : openedTask.taskType === 'EVENT' ? 'Завершить' : 'Выполнить'}
                  </button>
                  <button type="button" onClick={() => void deleteTask(openedTask.id)} disabled={deletingId === openedTask.id} className="miniapp-focus-danger-button">
                    <Trash2 size={14} /> {deletingId === openedTask.id ? '...' : 'Удалить'}
                  </button>
                </div>
                {openedTask.taskType !== 'EVENT' ? <button type="button" onClick={() => setIsAiDialogOpen(true)} className="miniapp-focus-ai-dialog-button mt-2 w-full">
                  <Bot size={16} /> Открыть диалог с ИИ
                </button> : null}

                {openedTask.taskType !== 'EVENT' ? <div className="miniapp-focus-subtasks mt-4 flex min-h-0 flex-col space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      Подзадачи
                      <button type="button" onClick={openCreateSubtaskModal} className="miniapp-focus-subtask-icon-button" title="Добавить подзадачу" aria-label="Добавить подзадачу">
                        <Plus size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setHideClosedOpenedTaskSubtasks((current) => !current)}
                        className={`miniapp-focus-subtask-visibility-button ${hideClosedOpenedTaskSubtasks ? 'miniapp-focus-subtask-visibility-button-active' : ''}`}
                        title={hideClosedOpenedTaskSubtasks ? 'Показывать закрытые подзадачи' : 'Скрывать закрытые подзадачи'}
                        aria-label={hideClosedOpenedTaskSubtasks ? 'Показывать закрытые подзадачи' : 'Скрывать закрытые подзадачи'}
                      >
                        {hideClosedOpenedTaskSubtasks ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {openedTask.isCollaborative && (openedTask.unreadCommentCount ?? 0) > 0 ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full border border-violet-400/50 px-2 py-1 text-[10px] font-semibold text-violet-400"
                          title="Отметить все комментарии подзадач прочитанными"
                          aria-label="Отметить все комментарии подзадач прочитанными"
                          onClick={async () => {
                            try {
                              await api.markAllTaskCommentsRead(openedTask.id);
                              await loadData();
                              setError(null);
                            } catch (error) {
                              setError(error instanceof Error ? error.message : 'Не удалось обновить комментарии');
                            }
                          }}
                        >
                          <Check size={12} /> {openedTask.unreadCommentCount}
                        </button>
                      ) : null}
                    </h3>
                    <div className="relative">
                      <button
                        type="button"
                        className={`miniapp-focus-action-pill ${openedTaskSubtaskFilterMode !== 'none' || Boolean(openedTaskSubtaskAuthorFilterUserId) ? 'miniapp-focus-action-pill-active' : ''}`}
                        onClick={() => setIsOpenedTaskSubtaskFilterOpen((current) => !current)}
                        aria-haspopup="menu"
                        aria-expanded={isOpenedTaskSubtaskFilterOpen}
                      >
                        Фильтровать
                      </button>
                      {isOpenedTaskSubtaskFilterOpen ? <div className="miniapp-subtask-filter-panel absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-52 overflow-y-auto rounded-xl border p-1.5 shadow-2xl" role="menu">
                        {SUBTASK_FILTER_OPTIONS.map((option) => <button
                          key={option.mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={openedTaskSubtaskFilterMode === option.mode}
                          className={`miniapp-subtask-filter-item block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${openedTaskSubtaskFilterMode === option.mode ? 'miniapp-subtask-filter-item-active' : ''}`}
                          onClick={() => {
                            setOpenedTaskSubtaskFilterMode(option.mode);
                            if (option.mode === 'none') setOpenedTaskSubtaskAuthorFilterUserId(null);
                            setIsOpenedTaskSubtaskFilterOpen(false);
                          }}
                        >
                          {option.label}
                        </button>)}
                        {openedTask.isCollaborative && openedTask.collaborationMembers?.length ? <div className="mt-1 border-t border-slate-500/30 pt-2">
                          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">По участнику</p>
                          <div className="flex flex-wrap gap-1.5 p-1">
                            <button type="button" aria-pressed={!openedTaskSubtaskAuthorFilterUserId} className={`miniapp-collaboration-author shrink-0 rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-semibold text-white ${!openedTaskSubtaskAuthorFilterUserId ? 'ring-2 ring-white/90' : 'opacity-80'}`} style={{ backgroundColor: '#64748b' }} onClick={() => { setOpenedTaskSubtaskAuthorFilterUserId(null); setIsOpenedTaskSubtaskFilterOpen(false); }}>Все</button>
                            {openedTask.collaborationMembers.map((member) => <button
                              key={member.userId}
                              type="button"
                              className={`miniapp-collaboration-author shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white transition ${openedTaskSubtaskAuthorFilterUserId === member.userId ? 'ring-2 ring-white/90' : 'opacity-80'}`}
                              style={{ backgroundColor: member.color }}
                              onClick={() => {
                                setOpenedTaskSubtaskAuthorFilterUserId((current) => current === member.userId ? null : member.userId);
                                setIsOpenedTaskSubtaskFilterOpen(false);
                              }}
                            >
                              {member.name}
                            </button>)}
                          </div>
                        </div> : null}
                      </div> : null}
                    </div>
                  </div>
                  {openedTaskSubtasks.length === 0 ? <p className="text-xs text-slate-400">{hideClosedOpenedTaskSubtasks ? 'Активных подзадач пока нет' : 'Пока нет подзадач'}</p> : null}
                  <div className="space-y-2">
                    {openedTaskSubtasks.map((subtask) => {
                      return (
                        <article key={subtask.id} className="miniapp-focus-subtask-row min-h-12 rounded-xl px-3 py-2.5 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={subtask.status === 'DONE'}
                              aria-label={subtask.status === 'DONE' ? `Вернуть подзадачу «${subtask.title}» в работу` : `Завершить подзадачу «${subtask.title}»`}
                              title={subtask.status === 'DONE' ? 'Вернуть в работу' : 'Отметить выполненной'}
                              disabled={updatingFocusSubtaskIds.includes(subtask.id)}
                              className="miniapp-focus-subtask-check-toggle flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                              onClick={() => void toggleFocusSubtaskStatus(subtask)}
                            >
                              <span className={`miniapp-focus-subtask-check-box flex h-5 w-5 items-center justify-center rounded-md ${subtask.status === 'DONE' ? 'miniapp-focus-subtask-check-box-done' : ''}`}>
                                {updatingFocusSubtaskIds.includes(subtask.id) ? <Loader2 size={13} className="animate-spin" /> : subtask.status === 'DONE' ? <Check size={14} strokeWidth={3} /> : null}
                              </span>
                            </button>
                            <button type="button" onClick={() => openSubtaskModal(subtask)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left">
                              <span className={`min-w-0 flex-1 truncate font-medium ${subtask.status === 'DONE' ? 'opacity-60 line-through' : ''}`}>{subtask.title}</span>
                              {(subtask.attachmentCount ?? 0) > 0 ? <Paperclip size={13} className="shrink-0 text-violet-400" aria-label="Есть вложения" /> : null}
                              {subtask.dueDate ? <span className={`shrink-0 text-xs font-semibold ${isOverdue(subtask) ? 'text-rose-500' : 'text-violet-500'}`}>{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
                              {openedTask.isCollaborative && subtask.creatorName ? <span className="miniapp-collaboration-author shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: subtask.creatorColor ?? '#8b5cf6' }} title={subtask.creatorName}>{getCreatorInitial(subtask.creatorName)}</span> : null}
                            </button>
                            {openedTask.isCollaborative ? (
                              <button type="button" onClick={() => void openTaskComments(subtask)} className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-400/40 text-violet-500" aria-label="Открыть комментарии" title="Комментарии">
                                <MessageCircle size={15} />
                                {(subtask.unreadCommentCount ?? 0) > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-center text-[9px] font-bold leading-4 text-white">{(subtask.unreadCommentCount ?? 0) > 99 ? '99+' : subtask.unreadCommentCount}</span> : null}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isCollaborationSettingsOpen && openedTask?.isCollaborative ? (
        <div className="miniapp-slide-backdrop fixed inset-0 z-[160] flex items-end bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setIsCollaborationSettingsOpen(false)}>
          <section className="miniapp-slide-panel miniapp-focus-panel w-full rounded-t-[2rem] border p-5 shadow-2xl sm:max-w-md sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Совместная задача</p><h2 className="mt-1 text-xl font-bold">Настройки участников</h2></div><button type="button" className="miniapp-focus-icon-button" onClick={() => setIsCollaborationSettingsOpen(false)} aria-label="Закрыть настройки совместной задачи"><X size={16} /></button></div>
            <p className="mt-4 text-sm text-slate-400">Ваш цвет в совместной задаче</p>
            <div className="mt-3 flex flex-wrap gap-3">{['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#22c55e', '#eab308'].map((color) => <button key={color} type="button" className={`h-10 w-10 rounded-full border-4 transition ${openedTask.collaborationColor === color ? 'border-white ring-2 ring-amber-400' : 'border-white/70'}`} style={{ backgroundColor: color }} onClick={async () => { await api.updateTaskCollaboration(openedTask.id, color); await loadData(); }} aria-label={`Выбрать цвет ${color}`} />)}</div>
            {openedTask.collaborationOwner ? <div className="mt-6 border-t border-amber-300/30 pt-5"><p className="text-sm font-semibold">Участники с доступом</p><div className="mt-3 grid gap-2">{openedTask.collaborationMembers?.map((member) => <div key={member.userId} className="flex items-center gap-3 rounded-xl border border-amber-300/20 px-3 py-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: member.color }} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{member.name}{member.isOwner ? ' (создатель)' : ''}</span>{!member.isOwner ? <button type="button" className="miniapp-focus-danger-button !w-auto !px-2.5 !py-1.5 text-xs" onClick={async () => { if (!window.confirm(`Исключить участника «${member.name}» из задачи?`)) return; await api.removeTaskCollaborator(openedTask.id, member.userId); await loadData(); }}>Исключить</button> : null}</div>)}</div><p className="mt-5 text-sm font-semibold">Вы создатель задачи</p><p className="mt-1 text-xs leading-relaxed text-slate-400">После выключения у каждого участника останется отдельная копия задачи. Дальнейшие изменения больше не будут общими.</p><button type="button" className="miniapp-focus-danger-button mt-4 w-full" onClick={async () => { await api.disableTaskCollaboration(openedTask.id); setIsCollaborationSettingsOpen(false); await loadData(); }}>Выключить совместный режим</button></div> : null}
          </section>
        </div>
      ) : null}
      {collaborationAction ? (
        <div className="miniapp-slide-backdrop fixed inset-0 z-[170] flex items-end bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setCollaborationAction(null)}>
          <section className="miniapp-slide-panel miniapp-focus-panel w-full rounded-t-[2rem] border p-5 shadow-2xl sm:max-w-md sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Совместная задача</p>
            <h2 className="mt-1 text-xl font-bold">{collaborationAction.action === 'delete' ? 'Как удалить задачу?' : 'Как выполнить задачу?'}</h2>
            <p className="mt-2 text-sm text-slate-400">Вы создатель: действие можно применить только к себе или ко всем участникам.</p>
            <div className="mt-5 grid gap-2"><button type="button" className="miniapp-focus-primary-button" onClick={() => { const { task, action } = collaborationAction; setCollaborationAction(null); void (action === 'complete' ? completeTask(task.id, 'me') : deleteTask(task.id, 'me')); }}>{collaborationAction.action === 'delete' ? 'Удалить только у меня' : 'Выполнить только у меня'}</button><button type="button" className={collaborationAction.action === 'delete' ? 'miniapp-focus-danger-button' : 'miniapp-focus-success-button'} onClick={() => { const { task, action } = collaborationAction; setCollaborationAction(null); void (action === 'complete' ? completeTask(task.id, 'all') : deleteTask(task.id, 'all')); }}>{collaborationAction.action === 'delete' ? 'Удалить у всех' : 'Выполнить у всех'}</button><button type="button" className="px-4 py-2 text-sm text-slate-400" onClick={() => setCollaborationAction(null)}>Отмена</button></div>
          </section>
        </div>
      ) : null}
      {calendarExportTask ? <CalendarExportDialog
        item={{ id: calendarExportTask.id, title: calendarExportDraft?.title ?? calendarExportTask.title, description: calendarExportDraft?.description ?? calendarExportTask.description, location: calendarExportTask.location, dueDate: calendarExportDraft ? fromInputDateTime(calendarExportDraft.dueDate) : calendarExportTask.dueDate }}
        isOpen={isCalendarExportOpen}
        onClose={() => { setIsCalendarExportOpen(false); setCalendarExportTaskId(null); }}
        onSaveBeforeExport={() => saveTask(calendarExportTask.id)}
        openExternalUrl={(url) => { const webApp = isTelegramRuntime ? (window as TelegramWindow).Telegram?.WebApp : undefined; if (webApp?.openLink) webApp.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer'); }}
        timeZone={currentUser?.timeZone?.trim() || 'Europe/Moscow'}
        googleUrlMode="mobile-web"
        timelineTasks={timelinePickerTasks}
        variant="miniapp"
      /> : null}
      {(openedSubtask || isCreatingNewSubtask) && openedSubtaskDraft ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 ${isAiChatOpen ? 'z-[120]' : 'z-[100]'} flex items-end bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('subtask')}`} onClick={() => isCreatingNewSubtask ? closeMiniWindowWithMotion('subtask', cancelCreateSubtask) : void saveAndCloseTaskEditor(subtaskEditorId, 'subtask')}>
          <div className="miniapp-slide-panel miniapp-focus-panel max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border p-4 shadow-2xl sm:max-w-xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">{isCreatingNewSubtask ? 'Создание подзадачи' : 'Редактирование подзадачи'}</p>
                <p className="mt-1 text-xs text-slate-400">Минимальная карточка с описанием и сроком</p>
              </div>
              <div className="flex items-center gap-2">
                {openedSubtask ? <button type="button" onClick={() => openCalendarExport(openedSubtask.id)} className="miniapp-focus-icon-button" title="Добавить в календарь" aria-label="Добавить подзадачу в календарь"><CalendarPlus size={16} /></button> : null}
                <button type="button" onClick={() => isCreatingNewSubtask ? closeMiniWindowWithMotion('subtask', cancelCreateSubtask) : void saveAndCloseTaskEditor(subtaskEditorId, 'subtask')} disabled={!isCreatingNewSubtask && savingId === subtaskEditorId} className="miniapp-focus-icon-button" aria-label={isCreatingNewSubtask ? 'Отменить создание подзадачи' : 'Сохранить и закрыть окно подзадачи'}>
                  {!isCreatingNewSubtask && savingId === subtaskEditorId ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                </button>
              </div>
            </div>
            <textarea
              ref={subtaskTitleInputRef}
              value={openedSubtaskDraft.title}
              onChange={(event) => changeSubtaskDraft({ title: event.target.value })}
              className={`miniapp-focus-title-input invisible-scrollbar w-full resize-none border-0 bg-transparent p-0 text-2xl font-bold leading-tight outline-none ${subtaskTitleRows === 1 ? 'min-h-[1.9rem]' : subtaskTitleRows === 2 ? 'min-h-[3.8rem]' : 'min-h-[5.7rem]'}`}
              rows={subtaskTitleRows}
              placeholder="Название подзадачи"
            />
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-violet-500">
              <DateTimePickerWithApply value={fromInputDateTime(openedSubtaskDraft.dueDate)} onChange={(nextValue) => changeSubtaskDraft({ dueDate: toInputDateTime(nextValue) })} timelineTasks={timelinePickerTasks} iconOnly detachedPopup buttonClassName="miniapp-focus-icon-button" />
              <span>{openedSubtaskDraft.dueDate ? formatSubtaskRelativeDeadline(fromInputDateTime(openedSubtaskDraft.dueDate)) : 'Срок не задан'}</span>
            </div>
            <div className="miniapp-focus-description-surface mt-3 rounded-2xl px-3 pb-1 pt-2">
              <TaskDescriptionInput
                value={openedSubtaskDraft.description}
                onChange={(description) => changeSubtaskDraft({ description })}
                className="miniapp-focus-description-input miniapp-subtask-description-preview invisible-scrollbar min-h-28 w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                placeholder="Описание подзадачи"
              />
            </div>
            {openedSubtask && openedSubtaskParent ? (
              <button
                type="button"
                className="main-task-link-button mt-2 inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition"
                disabled={savingId === openedSubtask.id}
                onClick={async () => {
                  const saved = await saveTask(openedSubtask.id);
                  if (!saved) return;
                  setOpenedSubtaskId(null);
                  openTaskModal(openedSubtaskParent);
                }}
              >
                {savingId === openedSubtask.id ? <Loader2 size={13} className="shrink-0 animate-spin" /> : <ArrowUpRight size={13} className="shrink-0" />}
                <span className="truncate">Основная задача: {openedSubtaskParent.title}</span>
              </button>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="miniapp-focus-icon-button" onClick={() => setIsSubtaskNotesEditorOpen(true)} title="Открыть заметки" aria-label="Открыть заметки">
                <Maximize2 size={15} />
              </button>
              {openedSubtask ? <button type="button" className="miniapp-focus-icon-button" disabled={isUploadingSubtaskAttachment} onClick={() => subtaskAttachmentInputRef.current?.click()} title="Добавить вложение" aria-label="Добавить вложение к подзадаче"><Paperclip size={15} /></button> : null}
              {openedSubtask ? <input ref={subtaskAttachmentInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt" multiple className="hidden" onChange={(event) => { void uploadSubtaskAttachmentFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /> : null}
              {subtaskAttachments.map((attachment) => (
                <div key={attachment.id} className="miniapp-focus-attachment-pill inline-flex max-w-[210px] items-center gap-1 rounded-xl border px-2 py-1 text-[11px]">
                  <button
                    type="button"
                    className="inline-flex min-w-0 items-center gap-1"
                    title={`${attachment.name} • скачать`}
                    aria-label={`Скачать ${attachment.name}`}
                    onClick={() => void downloadSubtaskAttachment(attachment)}
                  >
                    <Paperclip size={11} className="shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </button>
                  <button type="button" aria-label={`Удалить ${attachment.name}`} onClick={() => void removeSubtaskAttachment(attachment.id)}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            {isSubtaskNotesEditorOpen ? <NotesEditor miniAppSheet value={openedSubtaskDraft.description} onChange={(description) => changeSubtaskDraft({ description })} onClose={() => setIsSubtaskNotesEditorOpen(false)} /> : null}
            {isCreatingNewSubtask && openedTask ? (
              <button type="button" onClick={() => void createSubtask(openedTask)} disabled={creatingSubtaskForId === openedTask.id} className="miniapp-focus-success-button mt-4 w-full">
                {creatingSubtaskForId === openedTask.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {creatingSubtaskForId === openedTask.id ? 'Создаём…' : 'Создать подзадачу'}
              </button>
            ) : openedSubtask ? (
              <div className="miniapp-subtask-actions sticky bottom-0 z-10 -mx-4 mt-4 grid grid-cols-2 gap-2 px-4 pt-3">
                <button type="button" onClick={() => void (openedSubtask.status === 'DONE' ? restoreOpenedSubtask(openedSubtask) : completeTask(openedSubtask.id))} disabled={completingId === openedSubtask.id} className="miniapp-focus-success-button">
                  <CheckCircle2 size={14} /> {completingId === openedSubtask.id ? '...' : openedSubtask.status === 'DONE' ? 'Вернуть' : 'Выполнить'}
                </button>
                <button type="button" onClick={() => void deleteTask(openedSubtask.id)} disabled={deletingId === openedSubtask.id} className="miniapp-focus-danger-button">
                  <Trash2 size={14} /> {deletingId === openedSubtask.id ? '...' : 'Удалить'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {commentPanelTaskId ? (() => {
        const commentTask = tasks.find((task) => task.id === commentPanelTaskId) ?? null;
        if (!commentTask) return null;
        return (
          <div className="miniapp-comment-backdrop fixed inset-0 z-[125] flex items-end p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setCommentPanelTaskId(null)}>
            <section className="miniapp-comment-panel flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:max-w-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
              <div className="miniapp-comment-header flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <p className="miniapp-comment-kicker text-[10px] font-semibold uppercase tracking-[0.14em]">Комментарии к подзадаче</p>
                  <h3 className="mt-1 truncate text-base font-semibold">{commentTask.title}</h3>
                </div>
                <button type="button" className="miniapp-comment-close inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" onClick={() => setCommentPanelTaskId(null)} aria-label="Закрыть комментарии"><X size={14} /></button>
              </div>
              <div ref={taskCommentScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {taskCommentsLoading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-violet-300" /></div> : null}
                {!taskCommentsLoading && taskComments.length === 0 ? <p className="miniapp-comment-empty rounded-xl px-3 py-4 text-center text-sm">Комментариев пока нет.</p> : null}
                {!taskCommentsLoading ? taskComments.map((comment) => (
                  <article
                    key={comment.id}
                    className={`miniapp-comment-card rounded-2xl border px-3 py-2.5 ${comment.parentCommentId ? 'ml-5' : ''}`}
                    style={{ '--comment-author-color': comment.authorColor ?? '#64748b' } as CSSProperties}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="miniapp-comment-author truncate text-xs font-semibold">{comment.authorName}</span>
                      <time className="miniapp-comment-time shrink-0 text-[10px]">{new Date(comment.createdAt).toLocaleString('ru-RU')}</time>
                    </div>
                    <p className="miniapp-comment-text mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
                    <button type="button" className="miniapp-comment-reply mt-1.5 text-[11px] font-semibold" onClick={() => setTaskCommentReplyTo(comment)}>Ответить</button>
                  </article>
                )) : null}
              </div>
              <div className="miniapp-comment-composer border-t px-3 py-3">
                {taskCommentReplyTo ? (
                  <div className="miniapp-comment-reply-preview mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
                    <span className="min-w-0 truncate">Ответ для {taskCommentReplyTo.authorName}: {taskCommentReplyTo.content}</span>
                    <button type="button" onClick={() => setTaskCommentReplyTo(null)} aria-label="Отменить ответ"><X size={13} /></button>
                  </div>
                ) : null}
                <AutoGrowingTextarea
                  value={taskCommentDraft}
                  onChange={(event) => setTaskCommentDraft(event.target.value)}
                  placeholder={taskCommentReplyTo ? 'Напишите ответ…' : 'Оставьте комментарий…'}
                  className="miniapp-comment-input max-h-28 min-h-20 w-full resize-none rounded-2xl border px-3 py-2 text-sm outline-none"
                  maxLength={3000}
                />
                {taskCommentError ? <p className="mt-1 text-xs text-rose-300">{taskCommentError}</p> : null}
                <div className="mt-2 flex justify-end">
                  <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!taskCommentDraft.trim() || taskCommentSending} onClick={() => void sendTaskComment()}>
                    {taskCommentSending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                    Отправить
                  </button>
                </div>
              </div>
            </section>
          </div>
        );
      })() : null}

      {openedTask && isAiDialogOpen ? (
        <div className={`miniapp-ai-chat-backdrop miniapp-ai-chat-backdrop-task miniapp-slide-backdrop fixed inset-0 ${isAiChatOpen ? 'z-[130]' : 'z-[110]'} bg-slate-950/75 p-0 ${getMiniWindowMotionClass('task-ai')}`}>
          <div className="miniapp-ai-chat-panel miniapp-ai-chat-panel-task miniapp-slide-panel mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-none border-t border-violet-500/30 bg-slate-900 text-slate-100">
            <div className={`miniapp-ai-chat-header miniapp-ai-chat-header-task flex items-center justify-between gap-2 p-3 ${isTaskAiChatHeaderHidden ? 'miniapp-ai-chat-header-hidden' : ''}`}>
              <h2 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-primary">Помощь ИИ</h2>
              <button type="button" onClick={() => closeMiniWindowWithMotion('task-ai', () => setIsAiDialogOpen(false))} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Закрыть диалог с ИИ"><X size={18} /></button>
              <select value={selectedAiChatModel} onChange={(event) => setSelectedAiChatModel(event.target.value as AiChatModel)} className="miniapp-ai-chat-select miniapp-ai-chat-model-cap w-40 rounded-b-xl rounded-t-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold" aria-label="Выбрать модель помощи ИИ">
                {AI_CHAT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="miniapp-ai-chat-thread-wrap relative min-h-0 flex-1">
              <div ref={fullscreenAiDialogContainerRef} onScroll={(event) => updateAiChatHeaderVisibility(event.currentTarget.scrollTop, taskAiChatScrollTopRef, setIsTaskAiChatHeaderHidden)} className="miniapp-ai-chat-thread h-full min-h-0 space-y-3 overflow-y-auto p-3">
                {openedTaskAiDialog.length === 0 ? (
                  <TaskAiEmptyState variant="miniapp" />
                ) : null}
                {openedTaskAiDialog.map((message, index) => (
                  <div key={`mini-ai-full-${index}`} className={`ai-message-forward-group w-fit max-w-[88%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}><div className={`miniapp-ai-chat-message miniapp-ai-chat-message-task w-full rounded-3xl px-4 py-3 ${message.role === 'user' ? `miniapp-ai-chat-message-user rounded-br-lg ${message.authorColor ? 'miniapp-ai-chat-message-authored' : ''}` : 'miniapp-ai-chat-message-assistant rounded-bl-lg'}`} style={message.role === 'user' && message.authorColor ? ({ '--message-author-color': message.authorColor } as CSSProperties) : undefined}>
                    <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.authorName ?? (message.role === 'assistant' ? 'ИИ' : 'Вы')}{message.messageKind === 'HUMAN' && message.recipientName ? ` → ${message.recipientName}` : ''}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`compact-${index}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `compact-${index}` ? null : prev)), 1300); }} className="text-slate-300" title="Копировать">{copiedAiMessageKey === `compact-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                    <div className="text-sm leading-relaxed">{message.role === 'assistant' ? <MiniAiMessageContentWithTaskRefs content={message.content} tasks={tasks} onOpenTask={openAiTaskReference} /> : <CollapsibleUserMessage>{renderMiniAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}</div>
                    {message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} /> : null}
                    {message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} onDownload={downloadAiGeneratedDocument} /> : null}
                  {message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} /> : null}
                  {message.role === 'assistant' && message.telegramSuggestedReply ? <TelegramAiReplySuggestionCard reply={message.telegramSuggestedReply} /> : null}
                  {message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={continueTelegramReadTask} /> : null}
                  {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[10px] text-slate-400 opacity-80">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}
                  </div>
                  <div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={(target) => { setReplyToTask(target); if (openedTask) setAiRecipientByTaskId(prev => ({ ...prev, [openedTask.id]: 'ai' })); }} /><TelegramMessageQuickShare text={message.content} compact initialNoteSphereId={openedTask?.sphereId ?? null} /></div>
                </div>
                ))}
                {openedTask.aiMonitoringEnabled ? <TaskMonitoringTriggerChips taskId={openedTask.id} enabled /> : null}
                {aiLoadingTaskId === openedTask.id ? <TaskAiProgress status={aiProgressByTask[openedTask.id] ?? 'analyzing_request'} /> : null}
                <div className="miniapp-ai-chat-bottom-spacer h-24" aria-hidden="true" />
              </div>
            </div>
            <div className="miniapp-ai-chat-composer absolute inset-x-0 bottom-0 z-20 p-3">
              <input
                ref={aiAttachmentInputRef}
                type="file"
                accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleAiFileSelect}
              />
              <div
                className="miniapp-task-ai-recipient-interaction"
                onFocusCapture={() => setIsTaskAiRecipientPickerVisible(true)}
                onBlurCapture={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                  setIsTaskAiRecipientPickerVisible(false);
                  setIsTaskAiRecipientMenuOpen(false);
                }}
              >
              {isTaskAiRecipientPickerVisible && openedTask.isCollaborative && openedTask.collaborationMembers?.length ? (
                <div className="relative mb-2 flex justify-end miniapp-task-ai-recipient-reveal">
                  <button type="button" className="miniapp-task-ai-recipient-trigger inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold" onClick={() => setIsTaskAiRecipientMenuOpen((open) => !open)}>
                    <span className="miniapp-task-ai-recipient-label">Получатель:</span>
                    <span>{openedTask.collaborationMembers.find((member) => member.userId === getTaskAiRecipientId(openedTask))?.name ?? 'ИИ'}</span>
                    <ChevronDown size={12} />
                  </button>
                  {isTaskAiRecipientMenuOpen ? (
                    <div className="miniapp-task-ai-recipient-menu absolute bottom-full right-0 z-40 mb-1 min-w-48 rounded-xl border p-1.5 shadow-2xl">
                      <button type="button" className={`miniapp-task-ai-recipient-item block w-full rounded-lg px-3 py-2 text-left text-xs ${getTaskAiRecipientId(openedTask) === 'ai' ? 'miniapp-task-ai-recipient-item-active' : ''}`} onClick={() => { setAiRecipientByTaskId((prev) => ({ ...prev, [openedTask.id]: 'ai' })); setIsTaskAiRecipientMenuOpen(false); }}>ИИ</button>
                      {openedTask.collaborationMembers.filter((member) => member.userId !== currentUser?.id).map((member) => (
                        <button key={member.userId} type="button" className={`miniapp-task-ai-recipient-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${getTaskAiRecipientId(openedTask) === member.userId ? 'miniapp-task-ai-recipient-item-active' : ''}`} onClick={() => { setAiRecipientByTaskId((prev) => ({ ...prev, [openedTask.id]: member.userId })); setIsTaskAiRecipientMenuOpen(false); }}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color }} />
                          <span className="truncate">{member.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {replyToTask ? <AiReplyPreview target={replyToTask} onDismiss={() => setReplyToTask(null)} /> : null}
              <AiAttachmentTiles files={aiPendingFiles} onRemove={(file) => setAiPendingFiles((prev) => prev.filter((item) => item !== file))} busy={aiLoadingTaskId === openedTask.id} uploadProgress={taskAiUploadProgress} />
              <div className="miniapp-ai-chat-composer-card miniapp-ai-chat-composer-card-task flex items-end gap-2 rounded-3xl border p-2">
                <MiniAiChatComposer
                  ref={taskAiComposerRef}
                  variant="task"
                  initialDraft={taskAiDraftValueRef.current}
                  onDraftChange={(value) => { taskAiDraftValueRef.current = value; }}
                  onSend={() => { void sendAiMessage(); }}
                  onAttach={() => aiAttachmentInputRef.current?.click()}
                  isSending={aiLoadingTaskId === openedTask.id}
                  hasPendingFiles={aiPendingFiles.length > 0}
                  attachDisabled={getTaskAiRecipientId(openedTask) !== 'ai'}
                  attachTitle={getTaskAiRecipientId(openedTask) === 'ai' ? 'Прикрепить файл' : 'Вложения доступны только при отправке ИИ'}
                />
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`miniapp-quick-create fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 ${isQuickCreateOpen ? 'is-open' : ''}`}>
        <div className="miniapp-quick-create-actions flex flex-col items-end gap-2" aria-hidden={!isQuickCreateOpen}>
          <button type="button" tabIndex={isQuickCreateOpen ? 0 : -1} onClick={() => { setIsQuickCreateOpen(false); openCreateTaskModal(undefined, 'event'); }} className="miniapp-quick-create-action miniapp-quick-create-event inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-xl">
            <span>Добавить событие</span><span className="flex h-9 w-9 items-center justify-center rounded-full"><CalendarDays size={18} /></span>
          </button>
          <button type="button" tabIndex={isQuickCreateOpen ? 0 : -1} onClick={() => { setIsQuickCreateOpen(false); openCreateTaskModal(); }} className="miniapp-quick-create-action miniapp-quick-create-task inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-xl">
            <span>Добавить задачу</span><span className="flex h-9 w-9 items-center justify-center rounded-full"><Plus size={19} /></span>
          </button>
          <button type="button" tabIndex={isQuickCreateOpen ? 0 : -1} disabled={creatingStandaloneNote}
            onClick={() => {
              if (creatingStandaloneNote) return;
              setIsQuickCreateOpen(false);
              setCreatingStandaloneNote(true);
              void api.createStandaloneNote().then((note) => {
                setNewStandaloneNote(note);
              }).catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'Не удалось создать заметку.');
              }).finally(() => setCreatingStandaloneNote(false));
            }}
            className="miniapp-quick-create-action miniapp-quick-create-note inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-xl">
            <span>{creatingStandaloneNote ? 'Создаём заметку…' : 'Добавить заметку'}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full"><StickyNote size={18} /></span>
          </button>
          <button type="button" tabIndex={isQuickCreateOpen ? 0 : -1} onClick={() => { setIsQuickCreateOpen(false); setClosingMiniWindow(null); setActiveAiChatProjectId(aiChatProjects[0]?.id ?? ''); setActiveAiChatId(QUICK_AI_CHAT_ID); setIsAiChatOpen(true); setIsAiChatMenuOpen(false); }} className="miniapp-quick-create-action miniapp-quick-create-ai inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-xl">
            <span>Чат с ИИ</span><span className="flex h-9 w-9 items-center justify-center rounded-full"><Bot size={18} /></span>
          </button>
        </div>
        <button type="button" onClick={() => setIsQuickCreateOpen((prev) => !prev)} className="miniapp-ai-chat-launcher flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-2xl shadow-violet-950/40 ring-2 ring-white/20 active:scale-95" aria-expanded={isQuickCreateOpen} aria-label={isQuickCreateOpen ? 'Закрыть меню добавления' : 'Открыть меню добавления'}>
          <Plus size={25} strokeWidth={2.4} />
        </button>
      </div>

      {newStandaloneNote ? (
        <MiniAppStandaloneNoteEditor key={newStandaloneNote.id} note={newStandaloneNote}
          onClose={() => setNewStandaloneNote(null)} />
      ) : null}

      {isAiChatOpen ? (
        <div className={`miniapp-ai-chat-backdrop miniapp-ai-chat-backdrop-general miniapp-slide-backdrop fixed inset-0 z-[70] bg-slate-950/75 p-0 ${getMiniWindowMotionClass('ai-chat')}`}>
          <div className="miniapp-ai-chat-panel miniapp-ai-chat-panel-general miniapp-slide-panel mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-none border-t border-violet-500/30 bg-slate-900 text-slate-100">
            <div className={`miniapp-ai-chat-header miniapp-ai-chat-header-general flex items-start justify-between gap-2 p-3 ${isGeneralAiChatHeaderHidden ? 'miniapp-ai-chat-header-hidden' : ''}`}>
              <button type="button" onClick={() => setIsAiChatMenuOpen(true)} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Меню чатов и проектов"><Menu size={18} /></button>
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700"><Sparkles size={13} /> Чат с ИИ</p>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-primary">{activeAiChat?.title ?? 'Новый чат'}</h2>
                  <div className="miniapp-ai-chat-project-chip inline-flex max-w-[46%] shrink-0 items-center gap-1.5 rounded-2xl border px-2 py-1 text-[11px] font-semibold shadow-sm" style={{ '--project-color': activeAiChatProject?.color ?? '#8b5cf6' } as CSSProperties}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm">{activeAiChatProject?.icon === 'telegram' ? <svg role="img" aria-label="Telegram" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21.94 4.17a1.46 1.46 0 0 0-1.7-.23L2.1 11.1a1.18 1.18 0 0 0 .12 2.24l4.68 1.45 1.77 5.3a1.15 1.15 0 0 0 1.9.47l2.9-2.88 4.68 3.46a1.3 1.3 0 0 0 2.03-.76l2.18-14.6a1.52 1.52 0 0 0-.42-1.61Zm-3.88 3.9-8.2 7.47-.32 2.63-1.28-3.83 9.8-6.27Z"/></svg> : activeAiChatProject?.icon}</span>
                    <span className="truncate">{activeAiChatProject?.title ?? 'Проект'}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => closeMiniWindowWithMotion('ai-chat', () => setIsAiChatOpen(false))} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Закрыть чат с ИИ"><X size={18} /></button>
              <select value={generalAiChatModel} onChange={(event) => changeGeneralAiChatModel(event.target.value as AiChatModel)} className="miniapp-ai-chat-select miniapp-ai-chat-model-cap w-40 rounded-b-xl rounded-t-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold" aria-label="Выбрать модель чата">
                {AI_CHAT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="miniapp-ai-chat-thread-wrap relative min-h-0 flex-1">
              <div ref={aiChatDialogContainerRef} onScroll={(event) => {
                const container = event.currentTarget;
                generalAiChatNearBottomRef.current =
                  container.scrollHeight - container.scrollTop - container.clientHeight < 120;
                if (!generalAiChatUserScrollEnabledRef.current) {
                  generalAiChatScrollTopRef.current = container.scrollTop;
                  return;
                }
                updateAiChatHeaderVisibility(container.scrollTop, generalAiChatScrollTopRef, setIsGeneralAiChatHeaderHidden);
              }}
                onWheel={() => { generalAiChatUserScrollEnabledRef.current = true; }}
                onTouchMove={() => { generalAiChatUserScrollEnabledRef.current = true; }}
                onKeyDown={(event) => {
                  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) generalAiChatUserScrollEnabledRef.current = true;
                }}
                className="miniapp-ai-chat-thread h-full min-h-0 space-y-3 overflow-y-auto p-3">
              {linkedCheckupProposal && activeAiChat?.id === QUICK_AI_CHAT_ID &&
                 !visibleAiChatMessages.some(message => message.taskProposal?.id === linkedCheckupProposal.id) ? (
                <div className="max-w-[95%] rounded-2xl border border-[color:var(--panel-border)] p-3">
                  <p className="mb-2 text-sm font-semibold">Изменения из ИИ-чекапа</p>
                  <AiTaskProposalCard proposal={linkedCheckupProposal} />
                </div>
              ) : null}
              {visibleAiChatMessages.length === 0 ? (
                <div className="miniapp-ai-chat-empty" role="status">
                  <span className="miniapp-ai-chat-empty-icon" aria-hidden="true"><Sparkles size={34} strokeWidth={1.8} /></span>
                  <strong>ИИ готов помочь</strong>
                  <p>Задайте вопрос, обсудите идею или попросите составить план.</p>
                </div>
              ) : null}
              {visibleAiChatMessages.map((message) => (
                <div key={message.id} className={`ai-message-forward-group w-fit max-w-[88%] ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}><div className={`miniapp-ai-chat-message miniapp-ai-chat-message-general w-full rounded-3xl px-4 py-3 ${message.role === 'user' ? 'miniapp-ai-chat-message-user rounded-br-lg' : 'miniapp-ai-chat-message-assistant rounded-bl-lg'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`mini-chat-${message.id}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `mini-chat-${message.id}` ? null : prev)), 1300); }} className="text-slate-300" title="Копировать">{copiedAiMessageKey === `mini-chat-${message.id}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                  <div className="text-sm leading-relaxed">{message.role === 'assistant' ? <MiniAiMessageContentWithTaskRefs content={message.content} tasks={tasks} onOpenTask={openAiTaskReference} /> : <CollapsibleUserMessage>{renderMiniAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}</div>
                  {message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} /> : null}
                  {message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} onDownload={downloadAiGeneratedDocument} /> : null}
                  {message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} /> : null}
                  {message.role === 'assistant' && message.telegramSuggestedReply ? <TelegramAiReplySuggestionCard reply={message.telegramSuggestedReply} /> : null}
                  {message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={continueTelegramReadAiChat} /> : null}
                  {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[10px] text-slate-400 opacity-80">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}
                  </div>
                  <div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={setReplyToGeneral} /><TelegramMessageQuickShare text={message.content} compact /></div>
                </div>
              ))}
              {aiChatLoading ? <AiProgress status={aiChatProgress} /> : null}
              {aiChatError ? <p className="text-sm text-rose-300">{aiChatError}</p> : null}
              <div className="miniapp-ai-chat-bottom-spacer h-24" aria-hidden="true" />
              </div>
            </div>
            <div className="miniapp-ai-chat-composer absolute inset-x-0 bottom-0 z-20 p-3">
              {replyToGeneral ? <AiReplyPreview target={replyToGeneral} onDismiss={() => setReplyToGeneral(null)} /> : null}
              <AiAttachmentTiles files={aiChatPendingFiles} onRemove={(file) => setAiChatPendingFiles((prev) => prev.filter((item) => item !== file))} busy={aiChatLoading} uploadProgress={aiChatUploadProgress} />
              <div className="miniapp-ai-chat-composer-card miniapp-ai-chat-composer-card-general flex items-end gap-2 rounded-3xl border p-2">
                <input ref={aiChatFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleAiChatFileSelect} />
                <MiniAiChatComposer
                  ref={aiChatComposerRef}
                  variant="general"
                  initialDraft={aiChatDraftValueRef.current}
                  onDraftChange={(value) => { aiChatDraftValueRef.current = value; }}
                  onSend={() => { void sendAiChatQuestion(); }}
                  onAttach={() => aiChatFileInputRef.current?.click()}
                  isSending={aiChatLoading}
                  hasPendingFiles={aiChatPendingFiles.length > 0}
                />
              </div>
            </div>
          </div>
          <div
            className={`miniapp-ai-chat-menu-backdrop absolute inset-0 z-[75] bg-slate-950/70 transition-opacity duration-300 ease-out ${isAiChatMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={() => setIsAiChatMenuOpen(false)}
            aria-hidden={!isAiChatMenuOpen}
          >
            <aside
              className={`miniapp-ai-chat-menu h-full w-[86vw] max-w-sm overflow-y-auto border-r border-slate-800 bg-slate-900 p-3 shadow-2xl transition-transform duration-300 ease-out ${isAiChatMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight text-primary">Проекты и чаты</h3>
                <button type="button" className="miniapp-ai-chat-menu-close rounded-2xl border p-2" onClick={() => setIsAiChatMenuOpen(false)}><X size={16} /></button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Проекты</p><button type="button" className="miniapp-ai-chat-menu-add miniapp-ai-chat-menu-add-project rounded-2xl p-2 text-white" onClick={() => openAiChatProjectDialog()}><Plus size={16} /></button></div>
                {aiChatProjects.map((project) => (
                  <div key={project.id} className={`miniapp-ai-chat-menu-card rounded-3xl border p-2.5 shadow-sm ${project.id === activeAiChatProject?.id ? 'miniapp-ai-chat-menu-card-active-project' : ''}`} style={{ '--project-color': project.color } as CSSProperties}>
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => { setActiveAiChatProjectId(project.id); setActiveAiChatId(project.chats[0]?.id ?? ''); }}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-base miniapp-ai-chat-menu-project-icon" style={{ backgroundColor: project.color }}>{project.icon === 'telegram' ? <svg role="img" aria-label="Telegram" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21.94 4.17a1.46 1.46 0 0 0-1.7-.23L2.1 11.1a1.18 1.18 0 0 0 .12 2.24l4.68 1.45 1.77 5.3a1.15 1.15 0 0 0 1.9.47l2.9-2.88 4.68 3.46a1.3 1.3 0 0 0 2.03-.76l2.18-14.6a1.52 1.52 0 0 0-.42-1.61Zm-3.88 3.9-8.2 7.47-.32 2.63-1.28-3.83 9.8-6.27Z"/></svg> : project.icon}</span><span className="min-w-0 flex-1 truncate text-sm font-bold miniapp-ai-chat-menu-title">{project.title}</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="miniapp-ai-chat-menu-action inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold" disabled={project.id === aiChatProjects[0]?.id || project.id === 'telegram-ai-assistant-project'} onClick={() => openAiChatProjectDialog(project.id)}><Settings size={12} /> Настроить</button><button type="button" disabled={project.id === aiChatProjects[0]?.id || project.id === 'telegram-ai-assistant-project' || aiChatProjects.length <= 1} className="miniapp-ai-chat-menu-action miniapp-ai-chat-menu-action-danger inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40" onClick={() => deleteAiChatProject(project.id)}><Trash2 size={12} /> Удалить</button></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Чаты</p><button type="button" className="miniapp-ai-chat-menu-add miniapp-ai-chat-menu-add-chat rounded-2xl p-2 text-white" onClick={createAiChatThread} disabled={activeAiChatProject?.id === 'telegram-ai-assistant-project'}><Plus size={16} /></button></div>
                {(activeAiChatProject?.chats ?? []).map((chat) => (
                  <div key={chat.id} className={`miniapp-ai-chat-menu-card rounded-3xl border p-2.5 shadow-sm ${chat.id === activeAiChat?.id ? 'miniapp-ai-chat-menu-card-active-chat' : ''}`}>
                    <button type="button" className="w-full text-left" onClick={() => { setActiveAiChatId(chat.id); setIsAiChatMenuOpen(false); }}><span className="block truncate text-sm font-bold miniapp-ai-chat-menu-title">{chat.title}</span><span className="miniapp-ai-chat-menu-subtitle text-[11px]">{chat.messages.length} сообщ.</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="miniapp-ai-chat-menu-action rounded-xl border px-2.5 py-1.5 text-xs font-semibold" disabled={chat.id === QUICK_AI_CHAT_ID || chat.id.startsWith('telegram-ai-assistant:')} onClick={() => { setRenamingAiChatId(chat.id); setAiChatRenameDraft(chat.title); }}>Переименовать</button><button type="button" disabled={chat.id === QUICK_AI_CHAT_ID || chat.id.startsWith('telegram-ai-assistant:') || (activeAiChatProject?.chats.length ?? 0) <= 1} className="miniapp-ai-chat-menu-action miniapp-ai-chat-menu-action-danger rounded-xl border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40" onClick={() => deleteAiChatThread(chat.id)}>Удалить</button></div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {isAiChatProjectDialogOpen ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 ${getMiniWindowMotionClass('ai-project')}`} onClick={() => closeMiniWindowWithMotion('ai-project', () => setIsAiChatProjectDialogOpen(false))}>
          <div className="miniapp-slide-panel w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">{aiChatProjectDraft.mode === 'edit' ? 'Настройка проекта' : 'Новый проект'}</p>
                <h3 className="mt-1 text-lg font-semibold">Проект чата</h3>
              </div>
              <button type="button" className="rounded-md border border-slate-700 p-1.5" onClick={() => closeMiniWindowWithMotion('ai-project', () => setIsAiChatProjectDialogOpen(false))}><X size={16} /></button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-400">Название</label>
            <input value={aiChatProjectDraft.title} onChange={(event) => setAiChatProjectDraft((prev) => ({ ...prev, title: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Название проекта" autoFocus />
            <label className="mt-4 block text-xs font-semibold text-slate-400">Цвет</label>
            <div className="mt-2 flex flex-wrap gap-1.5">{MINI_AI_PROJECT_COLORS.map((color) => <button key={color} type="button" className={`h-8 w-8 rounded-full border-2 ${aiChatProjectDraft.color === color ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: color }} onClick={() => setAiChatProjectDraft((prev) => ({ ...prev, color }))} />)}</div>
            <label className="mt-4 block text-xs font-semibold text-slate-400">Иконка</label>
            <div className="mt-2 grid grid-cols-6 gap-1.5">{MINI_AI_PROJECT_ICONS.map((icon) => <button key={icon} type="button" className={`rounded-lg border py-1.5 text-lg ${aiChatProjectDraft.icon === icon ? 'border-violet-400 bg-violet-500/20' : 'border-slate-700 bg-slate-950'}`} onClick={() => setAiChatProjectDraft((prev) => ({ ...prev, icon }))}>{icon}</button>)}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => closeMiniWindowWithMotion('ai-project', () => setIsAiChatProjectDialogOpen(false))}>Отмена</button>
              <button type="button" className="rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold" onClick={saveAiChatProject}>{aiChatProjectDraft.mode === 'edit' ? 'Сохранить' : 'Создать'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {renamingAiChatId ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 ${getMiniWindowMotionClass('ai-rename')}`}>
          <div className="miniapp-slide-panel w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100">
            <h3 className="font-semibold">Переименовать чат</h3>
            <input value={aiChatRenameDraft} onChange={(event) => setAiChatRenameDraft(event.target.value)} className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" autoFocus />
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => closeMiniWindowWithMotion('ai-rename', () => setRenamingAiChatId(null))}>Отмена</button><button type="button" className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white" onClick={saveAiChatRename}>Сохранить</button></div>
          </div>
        </div>
      ) : null}

      {isHabitModalOpen && !editingHabitId ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[95] flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('habit')}`}>
          <section className="miniapp-slide-panel miniapp-focus-panel miniapp-habit-modal-panel miniapp-habit-create-panel relative max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-xl sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-label="Создание привычки">
            <div className="flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Новая привычка</p>
                  <p className="mt-1 text-xs text-slate-400">Выберите параметры и создайте привычку.</p>
                </div>
                <button type="button" onClick={() => closeMiniWindowWithMotion('habit', closeHabitModal)} disabled={savingHabit} className="miniapp-focus-icon-button" aria-label="Закрыть создание привычки" title="Закрыть">
                  <X size={16} />
                </button>
              </div>
              <div className="miniapp-habit-create-content min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto pb-4 pr-1">
              <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-3">
                <div
                  className="miniapp-habit-circle relative inline-flex h-[68px] w-[68px] items-center justify-center rounded-full border"
                  style={{ '--habit-color': habitDraft.color, '--habit-progress': '0%' } as CSSProperties}
                >
                  <span className="miniapp-habit-circle-core absolute inset-[6px] rounded-full" />
                  <span className="relative z-10 text-2xl">{habitDraft.icon}</span>
                </div>
                <div className="min-w-0 space-y-2">
                  <label className="block text-xs text-slate-300">Название привычки</label>
                  <input
                    value={habitDraft.name}
                    onChange={(event) => setHabitDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Например, вода или зарядка"
                    className="miniapp-habit-editor-name w-full min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold"
                  />
                  <div className="miniapp-habit-editor-completion space-y-2 rounded-xl border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300">Выполнено</span>
                      <span className="text-xs font-semibold text-slate-100">{habitModalCompleted} из {parseHabitTargetCount(habitDraft.targetCount)}</span>
                    </div>
                    <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editingHabit ? void uncompleteHabit(editingHabit) : undefined}
                        className="miniapp-habit-counter-button inline-flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50"
                        disabled={!editingHabit || habitModalCompleted <= 0 || isHabitCompletionActionPending}
                        aria-label="Снять отметку повтора"
                      >
                        <Minus size={14} strokeWidth={2.4} />
                      </button>
                      <button
                        type="button"
                        onClick={() => editingHabit ? void completeHabit(editingHabit) : undefined}
                        className="miniapp-habit-complete-button inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={!editingHabit || habitModalCompleted >= parseHabitTargetCount(habitDraft.targetCount) || isHabitCompletionActionPending}
                      >
                        Выполнить
                      </button>
                      <button
                        type="button"
                        onClick={() => editingHabit ? void completeHabit(editingHabit) : undefined}
                        className="miniapp-habit-counter-button miniapp-habit-counter-button-positive inline-flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50"
                        disabled={!editingHabit || habitModalCompleted >= parseHabitTargetCount(habitDraft.targetCount) || isHabitCompletionActionPending}
                        aria-label="Отметить повтор"
                      >
                        <Plus size={14} strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>


                {renderHabitSettingsFields()}
              </div>
              <div className="miniapp-habit-create-bottom miniapp-habit-editor-bottom mt-3 pt-3">
                {error ? <p role="alert" className="mb-2 rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">{error}</p> : null}
                <button type="button" onClick={() => void saveHabit()} disabled={savingHabit} className="miniapp-habit-editor-save w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50">
                  {savingHabit ? 'Создаём…' : 'Создать привычку'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isHabitModalOpen && editingHabit ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[95] flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('habit')}`}>
          <section className="miniapp-slide-panel miniapp-focus-panel miniapp-habit-modal-panel miniapp-habit-editor-panel relative max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-xl sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-label="Редактирование привычки">
            <div className="flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Привычка</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setIsHabitSettingsOpen((open) => !open)} className="miniapp-focus-icon-button" title="Настройки привычки" aria-label="Настройки привычки" aria-expanded={isHabitSettingsOpen} aria-controls="miniapp-habit-edit-settings">
                    <Settings size={16} />
                  </button>
                  <button type="button" onClick={closeHabitEditor} disabled={savingHabit} className="miniapp-focus-icon-button" title="Сохранить и закрыть" aria-label="Сохранить и закрыть окно">
                    {savingHabit ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  </button>
                </div>
              </div>
              {isHabitSettingsOpen ? (
                <div id="miniapp-habit-edit-settings" className="miniapp-task-settings-panel miniapp-habit-settings-panel absolute left-3 right-3 top-14 z-[75] max-h-[calc(94vh-6rem)] overflow-y-auto rounded-3xl border p-4 shadow-2xl sm:left-auto sm:right-4 sm:w-[370px] sm:max-h-[calc(88vh-6rem)]">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Настройки привычки</h3>
                    <button type="button" onClick={() => setIsHabitSettingsOpen(false)} className="miniapp-focus-icon-button" aria-label="Закрыть настройки"><X size={14}/></button>
                  </div>
                  {renderHabitSettingsFields()}
                  <div className="mt-4 grid gap-2 border-t pt-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={finishingHabitId === editingHabit.id} onClick={() => void finishHabit(editingHabit.id)} className="miniapp-habit-editor-secondary rounded-xl border px-3 py-2.5 text-xs font-semibold disabled:opacity-50">{finishingHabitId === editingHabit.id ? 'Завершаем…' : 'Завершить привычку'}</button>
                      <button type="button" disabled={deletingHabitId === editingHabit.id} onClick={() => void deleteHabit(editingHabit.id)} className="miniapp-habit-editor-danger rounded-xl border px-3 py-2.5 text-xs font-semibold disabled:opacity-50">{deletingHabitId === editingHabit.id ? 'Удаляем…' : 'Удалить привычку'}</button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="miniapp-habit-editor-content min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pr-1">
                <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-3">
                  <div className="miniapp-habit-circle relative inline-flex h-[68px] w-[68px] items-center justify-center rounded-full border" style={{ '--habit-color': habitDraft.color, '--habit-progress': `${Math.round((habitModalCompleted / Math.max(1, parseHabitTargetCount(habitDraft.targetCount))) * 100)}%` } as CSSProperties}>
                    <span className="miniapp-habit-circle-core absolute inset-[6px] rounded-full" />
                    <span className="relative z-10 text-2xl">{habitDraft.icon}</span>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <label className="block text-xs text-slate-300">Название привычки</label>
                    <input value={habitDraft.name} onChange={(event) => setHabitDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Название привычки" className="miniapp-habit-editor-name w-full rounded-xl border px-3 py-2 text-sm font-semibold" aria-label="Название привычки" />
                    <div className="miniapp-habit-editor-completion rounded-xl border px-3 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-300">Сегодня выполнено</span>
                        <span className="text-xs font-semibold text-slate-100">{habitModalCompleted} из {parseHabitTargetCount(habitDraft.targetCount)}</span>
                      </div>
                      <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2">
                        <button type="button" onClick={() => void uncompleteHabit(editingHabit)} className="miniapp-habit-counter-button inline-flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50" disabled={habitModalCompleted <= 0 || isHabitCompletionActionPending} aria-label="Снять отметку повтора"><Minus size={14}/></button>
                        <button type="button" onClick={() => void completeHabit(editingHabit)} className="miniapp-habit-complete-button inline-flex h-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-white disabled:opacity-50" disabled={habitModalCompleted >= parseHabitTargetCount(habitDraft.targetCount) || isHabitCompletionActionPending}>Выполнить</button>
                        <button type="button" onClick={() => void completeHabit(editingHabit)} className="miniapp-habit-counter-button miniapp-habit-counter-button-positive inline-flex h-8 w-8 items-center justify-center rounded-full border disabled:opacity-50" disabled={habitModalCompleted >= parseHabitTargetCount(habitDraft.targetCount) || isHabitCompletionActionPending} aria-label="Отметить повтор"><Plus size={14}/></button>
                      </div>
                    </div>
                  </div>
                </div>
                <MiniAppHabitTracker habit={editingHabit} onHabitChanged={(updated) => {
                  setHabits((current) => updated.isAutoCompleted
                    ? current.filter((item) => item.id !== updated.id)
                    : current.map((item) => item.id === updated.id ? updated : item));
                }} />
              </div>
              {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">{error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {isCreateTaskModalOpen ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('create-task')}`}>
          <div className="relative miniapp-slide-panel miniapp-focus-panel miniapp-focus-task-panel max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[2rem]">
            <div className="flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">{createEditorType === 'event' ? 'Новое событие' : 'Новая задача'}</p>
                <div className="relative flex items-center gap-2">
                  <button type="button" onClick={() => setIsCreateTaskSettingsOpen((prev) => !prev)} className="miniapp-focus-icon-button" aria-label={createEditorType === 'event' ? 'Настройки нового события' : 'Настройки новой задачи'} aria-expanded={isCreateTaskSettingsOpen}>
                    <Settings size={16} />
                  </button>
                  <button type="button" onClick={() => closeMiniWindowWithMotion('create-task', () => setIsCreateTaskModalOpen(false))} className="miniapp-focus-icon-button" aria-label="Закрыть окно">
                    <X size={16} />
                  </button>
                  {isCreateTaskSettingsOpen ? (
                    <div className="miniapp-create-settings-panel absolute right-0 top-[calc(100%+0.5rem)] z-[175] w-72 rounded-2xl border p-3 text-sm shadow-2xl">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={Boolean(createTaskDraft.isRecurring)}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            setCreateTaskDraft((prev) => enabled ? { ...prev, isRecurring: true, recurrenceText: prev.recurrenceText || '' } : { ...prev, isRecurring: false, recurrenceText: null, recurrenceJson: null, recurrenceSummary: null, recurrenceUntil: null });
                            if (!enabled) setCreateTaskRecurrenceNextDueLabel(null);
                          }}
                        />
                        повторять
                      </label>
                      {createEditorType === 'task' ? <label className="mt-3 flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={createTaskDraft.aiNotificationsEnabled ?? true}
                          onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, aiNotificationsEnabled: event.target.checked }))}
                        />
                        уведомления от ИИ
                      </label> : null}
                      {createEditorType === 'task' ? <div className="mt-3"><TaskMonitoringControls
                        enabled={createTaskDraft.aiMonitoringEnabled === true}
                        onChange={(enabled) => setCreateTaskDraft(previous => ({ ...previous, aiMonitoringEnabled: enabled }))}
                      /></div> : null}
                      {createTaskDraft.isRecurring ? (
                        <div className="mt-3 rounded-2xl border border-violet-200/70 p-2 text-xs">
                          <p className="mb-1 text-slate-500">Опишите как должно повторяться {createEditorType === 'event' ? 'событие' : 'задача'}</p>
                          <textarea
                            className="miniapp-task-text-field min-h-16 w-full rounded-xl border px-2 py-2 text-sm"
                            placeholder="Например: каждый вторник в 17:00"
                            value={createTaskDraft.recurrenceText ?? ''}
                            onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, recurrenceText: event.target.value }))}
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button type="button" className="recurrence-send-button rounded px-2 py-1 text-xs font-semibold disabled:opacity-70" onClick={() => void applyCreateTaskRecurrence()} disabled={createTaskRecurrenceLoading}>
                              {createTaskRecurrenceLoading ? '...' : 'Отправить'}
                            </button>
                            <p className="text-[11px] text-emerald-500">{createTaskDraft.recurrenceSummary ?? ''}</p>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{createTaskRecurrenceNextDueLabel ? `Ближайший срок: ${createTaskRecurrenceNextDueLabel}` : ''}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pb-24 pr-1">
                <textarea
                  autoFocus
                  value={createTaskDraft.title}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="miniapp-focus-title-input invisible-scrollbar min-h-[4.5rem] w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none"
                  rows={2}
                  placeholder={createEditorType === 'event' ? 'Введите название события' : 'Введите название'}
                />
                {createEditorType === 'event' ? (
                  <input
                    value={createTaskDraft.location ?? ''}
                    onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, location: event.target.value }))}
                    className="miniapp-task-text-field mt-2 w-full rounded-2xl border px-3 py-2.5 text-sm"
                    placeholder="Место события"
                    autoComplete="street-address"
                  />
                ) : null}
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-violet-500">
                  <DateTimePickerWithApply
                    value={fromInputDateTime(createTaskDraft.dueDate)}
                    onChange={(nextValue) => setCreateTaskDraft((prev) => ({ ...prev, dueDate: toInputDateTime(nextValue) }))}
                    timelineTasks={timelinePickerTasks}
                    iconOnly detachedPopup buttonClassName="miniapp-focus-icon-button"
                  />
                  <span>{createTaskDraft.dueDate ? `До дедлайна: ${formatRemaining(createTaskDraft.dueDate)}` : 'До дедлайна: выберите дату'}</span>
                </div>
                <div className="miniapp-focus-description-surface mt-3 rounded-2xl px-3 pb-1 pt-2">
                  <textarea
                    value={createTaskDraft.description}
                    onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
                    className="miniapp-focus-description-input invisible-scrollbar min-h-32 w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                    placeholder="Введите описание"
                  />
                </div>
                {createEditorType === 'event' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="miniapp-focus-icon-button inline-flex cursor-pointer items-center justify-center" title="Добавить вложения к событию" aria-label="Добавить вложения к событию">
                      <Paperclip size={15} />
                      <input type="file" className="sr-only" multiple accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = '';
                          if (!files.length) return;
                          if (files.some((file) => !(/\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name) || SUPPORTED_AI_FILE_TYPES.has(file.type)))) {
                            setError('Поддерживаются PDF, DOCX, XLS/XLSX, TXT и изображения.'); return;
                          }
                          if (files.some((file) => file.size > MAX_AI_ATTACHMENT_SIZE || file.size === 0)) {
                            setError('Файл должен быть от 1 байта до 8 МБ.'); return;
                          }
                          setError(null);
                          setCreateTaskPendingFiles((previous) => [...previous, ...files]);
                        }} />
                    </label>
                    {createTaskPendingFiles.map((file, index) => (
                      <span key={index} className="miniapp-focus-attachment-pill inline-flex max-w-[210px] items-center gap-1 rounded-xl border px-2 py-1 text-[11px]">
                        <span className="truncate">{file.name}</span>
                        <button type="button" aria-label={`Убрать ${file.name}`} onClick={() => setCreateTaskPendingFiles((current) => current.filter((_, i) => i !== index))}><X size={12}/></button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="task-edit-compact-grid mt-4 grid grid-cols-2 gap-2">
                  <CustomSelect
                    value={createTaskDraft.sphereId ?? 'none'}
                    onChange={(value) => setCreateTaskDraft((prev) => ({ ...prev, sphereId: value === 'none' ? null : value }))}
                    options={[{ value: 'none', label: 'Без сектора', color: '#7c3aed' }, ...spheres.map((sphere) => ({ value: sphere.id, label: sphere.name, color: sphere.color }))]}
                    ariaLabel="Выбор сектора"
                    buttonClassName="focused-task-pill-select"
                    menuClassName="task-edit-sector-menu"
                    detachedPopup
                  />
                  <CustomSelect
                    value={createTaskNotifyPreset}
                    onChange={(value) => {
                      setCreateTaskNotifyPreset(value);
                      setCreateTaskDraft((prev) => ({ ...prev, notifyBeforeMinutes: value === 'null' ? null : Number(value) }));
                    }}
                    options={NOTIFY_PRESETS}
                    ariaLabel="Уведомлять за"
                    disabled={Boolean(createTaskDraft.isRecurring)}
                    buttonClassName="focused-task-pill-select"
                    menuClassName="task-edit-notify-menu"
                    detachedPopup
                  />
                </div>
                {createEditorType === 'task' ? <div className="mt-3 pt-1">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">Важность: {createTaskDraft.importance ?? 3}</p>
                  <div className="importance-choice-group grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`importance-choice-button task-edit-importance rounded-xl border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${(createTaskDraft.importance ?? 3) === level ? 'importance-choice-button-active ring-2' : 'opacity-80 hover:opacity-100'}`}
                        onClick={() => setCreateTaskDraft((prev) => ({ ...prev, importance: level }))}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div> : null}
                {createEditorType === 'event' ? (
                  <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={Boolean(createTaskDraft.isRecurring)} onChange={(event) => {
                      const enabled = event.target.checked;
                      setCreateTaskDraft((prev) => enabled ? { ...prev, isRecurring: true, recurrenceText: prev.recurrenceText || '' } : { ...prev, isRecurring: false, recurrenceText: null, recurrenceJson: null, recurrenceSummary: null, recurrenceUntil: null });
                    }} />
                    повторять
                  </label>
                ) : null}
                {createEditorType === 'task' ? <div className="miniapp-focus-subtasks mt-4 flex min-h-0 flex-col space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">Подзадачи</h3>
                    <button
                      type="button"
                      className="miniapp-focus-action-pill"
                      onClick={() => setCreateTaskDraft((prev) => ({
                        ...prev,
                        subtasks: [...(prev.subtasks ?? []), { id: crypto.randomUUID(), title: '', description: '', dueDate: '' }]
                      }))}
                    >
                      <Plus size={13} /> Добавить
                    </button>
                  </div>
                  {(createTaskDraft.subtasks ?? []).length === 0 ? <p className="text-xs text-slate-400">Пока нет подзадач</p> : null}
                  <div className="space-y-2">
                    {(createTaskDraft.subtasks ?? []).map((subtask) => (
                      <article key={subtask.id} className="miniapp-focus-subtask-row rounded-xl px-3 py-2 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="mt-3 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <input
                              value={subtask.title}
                              onChange={(event) => setCreateTaskDraft((prev) => ({
                                ...prev,
                                subtasks: (prev.subtasks ?? []).map((item) => item.id === subtask.id ? { ...item, title: event.target.value } : item)
                              }))}
                              className="miniapp-task-text-field w-full rounded-xl border border-violet-200/70 bg-white/80 px-3 py-2 text-sm font-semibold"
                              placeholder="Название подзадачи"
                            />
                            <textarea
                              value={subtask.description}
                              onChange={(event) => setCreateTaskDraft((prev) => ({
                                ...prev,
                                subtasks: (prev.subtasks ?? []).map((item) => item.id === subtask.id ? { ...item, description: event.target.value } : item)
                              }))}
                              className="miniapp-task-text-field min-h-16 w-full resize-none rounded-xl border border-violet-200/70 bg-white/80 px-3 py-2 text-xs"
                              placeholder="Описание подзадачи"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <DateTimePickerWithApply
                                value={fromInputDateTime(subtask.dueDate)}
                                onChange={(nextValue) => setCreateTaskDraft((prev) => ({
                                  ...prev,
                                  subtasks: (prev.subtasks ?? []).map((item) => item.id === subtask.id ? { ...item, dueDate: toInputDateTime(nextValue) } : item)
                                }))}
                                timelineTasks={timelinePickerTasks}
                                iconOnly
                                detachedPopup
                                buttonClassName="miniapp-focus-icon-button"
                              />
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-violet-500">{subtask.dueDate ? formatSubtaskRelativeDeadline(fromInputDateTime(subtask.dueDate)) : 'Срок не задан'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="miniapp-focus-icon-button"
                            onClick={() => setCreateTaskDraft((prev) => ({ ...prev, subtasks: (prev.subtasks ?? []).filter((item) => item.id !== subtask.id) }))}
                            aria-label="Удалить черновик подзадачи"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div> : null}
              </div>
              <div className="miniapp-create-task-sticky-action pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 pt-8">
                <button
                  type="button"
                  onClick={() => void createTask()}
                  disabled={isCreatingTask}
                  className="miniapp-focus-primary-button pointer-events-auto min-w-[12rem] shadow-2xl"
                >
                  {isCreatingTask ? 'Создаём…' : createEditorType === 'event' ? 'Создать событие' : 'Создать задачу'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isStandaloneNotesOpen && currentUser ? (
        <StandaloneNotesWorkspace key={currentUser.id} userId={currentUser.id}
          requestedNote={requestedStandaloneNote}
          mode="mobile" onClose={() => { setIsStandaloneNotesOpen(false); setRequestedStandaloneNote(null); }} />
      ) : null}

      {isWebRuntime && authModalMode ? (
        <div className="miniapp-auth-backdrop fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={closeAuthModal}>
          <section className="miniapp-auth-sheet miniapp-scrollless w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-600 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="miniapp-auth-title" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="miniapp-auth-title" className="text-lg font-semibold">{authModalMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
              <button type="button" onClick={closeAuthModal} disabled={authSubmitting} className="rounded-full p-2 text-slate-300 hover:bg-slate-800" aria-label="Закрыть"><X size={18} /></button>
            </div>
            {authModalMode === 'register' && currentUser?.isGuest ? <p className="mb-3 rounded-xl border border-violet-400/40 bg-violet-500/10 p-3 text-xs text-violet-100">Создайте аккаунт и получите 100 пробных ИИ-кредитов. Ваши гостевые задачи сохранятся.</p> : null}
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitAuth(); }}>
              <label className="block space-y-1 text-xs text-slate-300">
                <span>Логин</span>
                <input autoFocus autoComplete="username" required value={authLogin} onChange={(event) => setAuthLogin(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100 outline-none focus:border-sky-400" />
              </label>
              {authModalMode === 'register' ? (
                <label className="block space-y-1 text-xs text-slate-300">
                  <span>Имя</span>
                  <input autoComplete="name" value={authName} onChange={(event) => setAuthName(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100 outline-none focus:border-violet-400" />
                </label>
              ) : null}
              <label className="block space-y-1 text-xs text-slate-300">
                <span>Пароль</span>
                <input type="password" autoComplete={authModalMode === 'login' ? 'current-password' : 'new-password'} required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100 outline-none focus:border-sky-400" />
              </label>
              {authModalMode === 'register' ? (
                <label className="flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-xs leading-5 text-slate-300">
                  <input type="checkbox" required checked={authConsentAccepted} onChange={(event) => setAuthConsentAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500" />
                  <span>Я согласен на обработку персональных данных. <a href="/legal/consent" target="_blank" rel="noreferrer" className="text-sky-300 underline">Прочитать согласие</a></span>
                </label>
              ) : null}
              {authError ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{authError}</p> : null}
              <button type="submit" disabled={authSubmitting} className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {authSubmitting ? 'Подождите…' : authModalMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </button>
              {authModalMode === 'register' ? (
                <p className="text-center text-[11px] leading-4 text-slate-400">
                  Регистрируясь, вы принимаете <a href="/legal/terms" target="_blank" rel="noreferrer" className="underline">пользовательское соглашение</a> и <a href="/legal/privacy" target="_blank" rel="noreferrer" className="underline">политику конфиденциальности</a>.
                </p>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
