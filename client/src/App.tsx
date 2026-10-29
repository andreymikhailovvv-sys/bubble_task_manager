import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Bot, BriefcaseBusiness, CalendarDays, CalendarPlus, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, Circle as CircleIcon, Coins, Copy, Eye, EyeOff, FileText, LayoutGrid, List, Edit3, Maximize2, Menu, MessageCircle, Minimize2, Gauge, Loader2, Pause, Paperclip, PieChart, Play, Smartphone, Plus, Repeat, RotateCcw, Search, SendHorizontal, Settings, Sparkles, Square, Ticket, BellRing, Trash2, UserRound, X } from 'lucide-react';
import { motion, Reorder } from 'framer-motion';
import { BubbleField } from './components/BubbleField';
import { InlineDateTimePickerIcon } from './components/InlineDateTimePickerIcon';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { TaskRecurrenceConfigurator } from './components/TaskRecurrenceConfigurator';
import { TaskMonitoringTriggerChips } from './components/TaskMonitoringTriggerChips';
import { TaskMonitoringStatuses } from './components/TaskMonitoringStatuses';
import { TaskMonitoringIntroProgress } from './components/TaskMonitoringIntroProgress';

import { TaskMonitoringActionBadge } from './components/TaskMonitoringActionBadge';
import { AiCheckupScheduleSettings } from './components/AiCheckupScheduleSettings';
import { TaskCompletionReportDialog } from './components/TaskCompletionReportDialog';
import { TaskAiEmptyState } from './components/TaskAiEmptyState';
import { CustomSelect } from './components/CustomSelect';
import { INSUFFICIENT_AI_CREDITS_MESSAGE, formatAiRequestError, api, stripAiChatDisplayPreviews, stripAiChatProjectDisplayPreviews, setUnauthorizedHandler, ATTACHMENT_STORAGE_LIMIT_EVENT, formatStorageMiB, type AttachmentStorage, type AccountAttachment, type CreditPack, type CreditUsageStatistics, type CurrentUser, type SubscriptionLinks, type TaskAiProgressStatus, type AiChatProgressStatus, type TelegramAiAssistantInbox } from './lib/api';
import { calcScore, getTaskCoefficient, type BubbleRankingMode } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { AiChatModel, ChatAttachmentPayload, ChatMessage, Habit, Sphere, Task, TaskAttachment, TaskComment } from './lib/types';
import { prepareAiChatImageFile } from './lib/ai-image-upload';
import { clipboardImageFiles } from './lib/aiClipboard';
import { LinkifiedText } from './components/LinkifiedText';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { ResizableDescriptionSurface } from './components/ResizableDescriptionSurface';
import { measureTitleTextareaRows } from './lib/titleTextareaRows';
import { newestFocusSubtaskFirst, urgentFocusSubtaskFirst } from './lib/focusSubtaskSort';
import { loadThemePreference, resolveThemeMode, type ThemePreference } from './lib/autoTheme';
import { browserNotificationPermission, requestBrowserNotificationPermission, showBrowserSystemNotification } from './lib/browser-system-notifications';
import { NotesEditor } from './components/NotesEditor';
import { StandaloneNotesWorkspace } from './components/StandaloneNotesWorkspace';
import { WorkspaceGlobalSearch } from './components/WorkspaceGlobalSearch';
import { matchesWorkspaceText } from './lib/workspaceSearch';
import { renderAiContentBlocks } from './components/AiCodeBlocks';
import { noteHtmlToPlainText } from './lib/notes';
import { LATEST_NEWS_ID, UpdatesMenu } from './components/UpdatesMenu';
import { CalendarExportDialog } from './components/CalendarExportDialog';
import { AutoGrowingTextarea } from './components/AutoGrowingTextarea';
import { TaskAiProgress } from './components/TaskAiProgress';
import { AiProgress } from './components/AiProgress';
import { AiAttachmentTiles, AiMessageAttachments, splitAiMessageAttachments, makeAiAttachmentPreviews } from './components/AiAttachmentTiles';
import type { AiAttachmentPreview } from './components/AiAttachmentTiles';
import { formatCreditsSpent } from './lib/credits';
import { AI_TOUR_STEPS, FEATURE_TOUR_STEPS, TASK_TOUR_STEPS, WORKSPACE_TOUR_STEPS, TourOverlay, type AiTourStep, type FeatureTourStep, type TaskTourStep, type WorkspaceTourStep } from './components/TourOverlay';
import { useCreditPurchase } from './lib/useCreditPurchase';
import { ExpandedAiChat } from './components/ExpandedAiChat';
import { TelegramMessageQuickShare } from './components/TelegramMessageQuickShare';
import { AiReplyAction, AiReplyPreview, AiReplyMessageBody, serializeAiReply, type AiReplyTarget } from './components/AiMessageReply';
import { TelegramIntegrationsMenu } from './components/TelegramIntegrationsMenu';
import { AiTaskProposalCard, proposalAppliedEvent } from './components/AiTaskProposalCard';
import { isolateTaskProposalChips, reconcileActiveAiChatMessages, reconcileAiChatProjectOutline, reconcileAiChatMessagesWithChips, sanitizeCachedTelegramAssistantProjects, isTelegramAssistantProjectLike, orderAiChatMessagesChronologically } from './lib/ai-chat-reconciliation';
import { persistAiChatProjectsCache } from './lib/ai-chat-storage';
import { DEFAULT_QUICK_AI_CHAT_MODEL, DEFAULT_WEB_PROJECT_CHAT_MODEL, readSavedAiChatModel } from './lib/ai-chat-model';
import { TelegramInlineSendCard } from './components/TelegramInlineSendCard';
import { TelegramAiReplySuggestionCard } from './components/TelegramAiReplySuggestionCard';
import { TelegramReadConsentCard } from './components/TelegramReadConsentCard';
import { WebCitations } from './components/WebCitations';
import { AiInlineMarkup } from './components/AiInlineMarkup';
import { CollapsibleUserMessage } from './components/CollapsibleUserMessage';
import { CreditUsageStats } from './components/CreditUsageStats';
import { AiGeneratedDocumentButton } from './components/AiGeneratedDocumentButton';
import { loadTaskAiRecipientSelection, saveTaskAiRecipientSelection } from './lib/taskAiRecipientStorage';
import { changedDraftFields, mergeRemoteDraftFields, taskEditorEditableSnapshot } from './lib/taskDraftSync';

const MAX_SPHERES = 8;

const FOCUSED_TASK_EDIT_KEYS = [
  'title', 'description', 'sphereId', 'dueDate', 'notifyBeforeMinutes',
  'isRecurring', 'recurrenceText', 'recurrenceJson', 'recurrenceSummary',
  'recurrenceUntil', 'importance', 'urgency', 'aiNotificationsEnabled', 'aiMonitoringEnabled'
] as const satisfies readonly (keyof Task)[];

const focusedTaskEditableSnapshot = (task: Partial<Task>, defaultAiNotificationsEnabled: boolean) => ({
  title: task.title ?? '',
  description: task.description ?? '',
  sphereId: task.sphereId ?? null,
  dueDate: task.dueDate ?? null,
  notifyBeforeMinutes: task.notifyBeforeMinutes ?? null,
  isRecurring: task.isRecurring ?? false,
  recurrenceText: task.recurrenceText ?? null,
  recurrenceJson: task.recurrenceJson ?? null,
  recurrenceSummary: task.recurrenceSummary ?? null,
  recurrenceUntil: task.recurrenceUntil ?? null,
  importance: task.importance ?? 3,
  urgency: task.urgency ?? 3,
  aiNotificationsEnabled: task.aiNotificationsEnabled ?? defaultAiNotificationsEnabled,
  aiMonitoringEnabled: task.aiMonitoringEnabled ?? false
});



const AI_CHAT_MODEL_OPTIONS: Array<{ value: AiChatModel; label: string }> = [
  { value: 'gpt-6-luna', label: 'GPT-6 Luna' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }
];

const AI_CHAT_MODEL_SELECT_OPTIONS = AI_CHAT_MODEL_OPTIONS.map(({ value, label }) => ({ value, label }));

function AiModelChip({ value, onChange, ariaLabel, className = '' }: { value: AiChatModel; onChange: (value: AiChatModel) => void; ariaLabel: string; className?: string }) {
  return (
    <div className={`ai-chat-model-cap w-40 ${className}`}>
      <CustomSelect value={value} options={AI_CHAT_MODEL_SELECT_OPTIONS} onChange={(next) => onChange(next as AiChatModel)} className="w-full" buttonClassName="ai-chat-model-cap-button rounded-b-xl rounded-t-none border px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur hover:brightness-105" menuClassName="ai-chat-model-cap-menu surface-popover text-primary" ariaLabel={ariaLabel} />
    </div>
  );
}

const SUBSCRIPTION_PLANS: Array<{ key: keyof SubscriptionLinks; name: string; price: string; badge: string; features: string[] }> = [
  { key: 'start', name: 'Старт', price: '299 ₽/мес', badge: 'Для регулярного старта', features: ['3 000 ИИ-кредитов в месяц', 'Память диалогов: до 100 сообщений'] },
  { key: 'pro', name: 'Про', price: '599 ₽/мес', badge: 'Оптимальный выбор', features: ['6 000 ИИ-кредитов в месяц', 'Безлимитная память диалогов', 'ИИ-чекап', 'Оптимизация расписания'] },
  { key: 'max', name: 'Максимум', price: '1290 ₽/мес', badge: 'Все возможности', features: ['13 000 ИИ-кредитов в месяц', 'Безлимитная память диалогов', 'Доступ ко всем ИИ-функциям', 'Доступ к самым продвинутым моделям'] }
];
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
const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '0', label: 'Вовремя' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;
const IMPORTANCE_STYLES: Record<number, string> = {
  1: 'bg-cyan-400/70 border-cyan-200',
  2: 'bg-sky-700/75 border-sky-500',
  3: 'bg-violet-500/70 border-violet-300',
  4: 'bg-orange-500/70 border-orange-300',
  5: 'bg-rose-500/75 border-rose-300'
};
const IMPORTANCE_ACCENT_COLORS: Record<number, string> = {
  1: '#67e8f9',
  2: '#0369a1',
  3: '#8b5cf6',
  4: '#f97316',
  5: '#f43f5e'
};
type SubtaskFilterMode = 'none' | 'urgency' | 'importance';
const SUBTASK_FILTER_OPTIONS: Array<{ mode: SubtaskFilterMode; label: string }> = [
  { mode: 'urgency', label: 'По срочности' },
  { mode: 'importance', label: 'По важности' },
  { mode: 'none', label: 'Без фильтра' }
];
const getAiReadCursorStorageKey = (userId: string) => `btm:${userId}:ai-read-cursor-by-task`;
const getThemeStorageKey = (userId: string) => `btm:${userId}:theme-mode`;
const getRankingModeStorageKey = (userId: string) => `btm:${userId}:ranking-mode`;
const getOnboardingOfferStorageKey = (userId: string) => `btm:${userId}:onboarding-offer-seen`;
const getLatestNewsReadStorageKey = (userId: string) => `btm:${userId}:latest-news-read`;
const USER_TIMEZONE_STORAGE_KEY = 'btm:user-timezone';
const AI_NOTIFICATIONS_DEFAULT_STORAGE_KEY = 'btm:ai-notifications-default-enabled';
const DEFAULT_TIMEZONE = 'Europe/Moscow';
const CONTEXT_MENU_VIEWPORT_MARGIN = 12;
const CONTEXT_MENU_WIDTH = 184;
const CONTEXT_MENU_WITH_SUBMENU_WIDTH = 416;
const CONTEXT_MENU_HEIGHT = 188;


function shouldSendAiMessageOnEnter(event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
  return event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing;
}

function getViewportSafeContextMenuPosition(x: number, y: number, options?: { submenu?: boolean; height?: number }) {
  if (typeof window === 'undefined') return { x, y };
  const width = options?.submenu ? CONTEXT_MENU_WITH_SUBMENU_WIDTH : CONTEXT_MENU_WIDTH;
  const height = options?.height ?? CONTEXT_MENU_HEIGHT;
  return {
    x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - CONTEXT_MENU_VIEWPORT_MARGIN)),
    y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - CONTEXT_MENU_VIEWPORT_MARGIN))
  };
}
const TIMEZONE_OPTIONS = [
  'Europe/Moscow',
  'Europe/Kaliningrad',
  'Europe/Samara',
  'Asia/Yekaterinburg',
  'Asia/Omsk',
  'Asia/Krasnoyarsk',
  'Asia/Irkutsk',
  'Asia/Yakutsk',
  'Asia/Vladivostok',
  'Asia/Magadan',
  'Asia/Kamchatka',
  'Europe/Minsk',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Almaty',
  'Asia/Tokyo'
] as const;
const OVERDUE_CHECK_INTERVAL_MS = 30_000;
const OVERDUE_NUDGE_RETRY_INTERVAL_MS = 60_000;
const MAX_SHINE_WINDOW_MINUTES = 180;
const QUICK_POSTPONE_OPTIONS = [
  { value: '15m', label: 'На 15 мин' },
  { value: '30m', label: 'На 30 мин' },
  { value: '1h', label: 'На час' },
  { value: '3h', label: 'На 3 часа' },
  { value: 'tomorrow', label: 'На завтра' },
  { value: 'smart', label: '✦ Ближайшее окно' }
] as const;
type QuickPostponeOption = (typeof QUICK_POSTPONE_OPTIONS)[number]['value'];
const FOCUS_TIMER_OPTIONS = [5, 7, 10, 15, 20, 25, 30, 35, 40] as const;
const FOCUS_RECOMMENDED_MINUTES = new Set<number>([20, 25, 30]);
const FOCUS_MIN_TASKS = 1;
const FOCUS_MAX_TASKS = 5;
type FocusBonusType = 'ai' | 'subtask' | 'task' | 'time';
type FocusBonusEvent = { id: string; type: FocusBonusType; delta: number; totalDelta: number; message: string; atMs: number };
const FOCUS_BONUS_MULTIPLIERS = { task: 2, subtask: 2 } as const;
const FOCUS_TIME_BONUS_INTERVAL_SECONDS = 5 * 60;
const EFFICIENCY_BONUSES = {
  doneTask: 4,
  doneSubtask: 1.2,
  doneHabit: 3,
  createdHabit: 3.35,
  completedHabit: 20.1,
  createdTask: 1
} as const;
const FOCUS_TIME_BONUS_DELTA = 0.75; // The independent time-based bonus is unchanged.

const EFFICIENCY_INACTIVITY_GRACE_HOURS = 3;
const EFFICIENCY_NIGHT_START_HOUR = 0;
const EFFICIENCY_NIGHT_END_HOUR = 8;

const EFFICIENCY_PENALTIES = {
  inactivePerHour: 3.5,
  nightMultiplier: 0.1
} as const;

type EfficiencyGrade = 'средний' | 'хороший' | 'отличный';

function clampEfficiency(value: number) {
  return Math.max(0, Math.min(100, value));
}

type EfficiencyScoreEvent = { atMs: number; delta: number };

function getLocalHour(timestampMs: number, timeZone: string) {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(new Date(timestampMs)));
    return hour === 24 ? 0 : hour;
  } catch {
    return new Date(timestampMs).getHours();
  }
}

function isNightHour(timestampMs: number, timeZone: string) {
  const hour = getLocalHour(timestampMs, timeZone);
  return hour >= EFFICIENCY_NIGHT_START_HOUR && hour < EFFICIENCY_NIGHT_END_HOUR;
}

function calculateEfficiencyScore(events: EfficiencyScoreEvent[], nowMs: number, resetAtMs: number, timeZone: string) {
  const sortedEvents = events
    .filter((event) => Number.isFinite(event.atMs) && event.atMs >= resetAtMs && event.atMs <= nowMs && event.delta > 0)
    .sort((a, b) => a.atMs - b.atMs);

  let score = 0;
  let cursorMs = resetAtMs;
  let appliedPenalty = 0;

  const applyInactivePenalty = (nextMs: number) => {
    if (nextMs <= cursorMs || score <= 0) {
      cursorMs = Math.max(cursorMs, nextMs);
      return;
    }

    const hourMs = 60 * 60 * 1000;
    const inactiveMs = nextMs - cursorMs;
    const penaltyHours = Math.floor(inactiveMs / hourMs) - EFFICIENCY_INACTIVITY_GRACE_HOURS;
    if (penaltyHours <= 0) {
      cursorMs = nextMs;
      return;
    }

    let penalty = 0;
    for (let index = 1; index <= penaltyHours; index += 1) {
      const penaltyAtMs = cursorMs + (EFFICIENCY_INACTIVITY_GRACE_HOURS + index) * hourMs;
      const multiplier = isNightHour(penaltyAtMs, timeZone) ? EFFICIENCY_PENALTIES.nightMultiplier : 1;
      penalty += EFFICIENCY_PENALTIES.inactivePerHour * multiplier;
    }
    const nextScore = Math.max(0, score - penalty);
    appliedPenalty += penalty;
    score = nextScore;
    cursorMs = nextMs;
  };

  for (const event of sortedEvents) {
    applyInactivePenalty(event.atMs);
    score = clampEfficiency(score + event.delta);
    cursorMs = event.atMs;
  }

  applyInactivePenalty(nowMs);

  return {
    score: clampEfficiency(score),
    appliedPenalty
  };
}

function getEfficiencyGrade(value: number): EfficiencyGrade {
  if (value < 30) return 'средний';
  if (value < 70) return 'хороший';
  return 'отличный';
}

function isSameLocalDay(date: Date, target: Date) {
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DISPLAY_MODE_OPTIONS = [
  { value: 'bubbles', label: 'Пузыри', icon: LayoutGrid, iconClassName: 'text-cyan-300' },
  { value: 'list', label: 'Список', icon: List, iconClassName: 'text-violet-300' },
  { value: 'timeline', label: 'Таймлайн', icon: CalendarDays, iconClassName: 'text-amber-300' }
] as const;
type DisplayMode = (typeof DISPLAY_MODE_OPTIONS)[number]['value'];
type GeneralAiUndoOperation = {
  taskId: string;
  previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
};
type GeneralAiMessage = ChatMessage & { id: string };
type AiChatMessage = ChatMessage & { id: string; createdAt?: string; taskSuggestions?: string[]; approvedSuggestionIndices?: number[] };
type SystemNotification = { id: string; eventKey?: string; taskId?: string | null; content: string; readAt?: string | null; createdAt: string };
type AiChatThread = { id: string; title: string; messages: AiChatMessage[]; model?: AiChatModel; modelChangedAt?: string };
type AiChatProject = { id: string; title: string; color: string; icon: string; chats: AiChatThread[] };
const TELEGRAM_AI_MANAGED_PROJECT_ID = 'telegram-ai-assistant-project';
const TELEGRAM_AI_MANAGED_CHAT_PREFIX = 'telegram-ai-assistant:';

export function mergeTelegramAiInbox(projects: AiChatProject[], feed: TelegramAiAssistantInbox): AiChatProject[] {
  // Old app versions may have copied the managed project with random UUIDs.
  // Do not reappend those copies when reconciling the authoritative inbox.
  const ownedProjects = projects.filter(project => !isTelegramAssistantProjectLike(project));
  if (!feed.chats.length) return ownedProjects.length === projects.length ? projects : ownedProjects;
  const previous = projects.find(project => project.id === TELEGRAM_AI_MANAGED_PROJECT_ID);
  const chats = feed.chats.map(dialog => {
    const old = previous?.chats.find(thread => thread.id === dialog.id);
    const messageMap = new Map<string, AiChatMessage>();
    for (const message of old?.messages ?? []) messageMap.set(message.id, message);
    for (const message of feed.messages) if (message.chatId === dialog.id) {
      messageMap.set(message.id, { ...message, role: 'assistant', content: message.content,
        telegramSuggestedReply: message.telegramSuggestedReply ?? undefined });
    }
    // Keep existing consent cards in their original position; newly published
    // summaries append without re-sorting existing messages.
    const messages = [...messageMap.values()].slice(-300);
    return { id: dialog.id, title: dialog.title, messages };
  });
  const nextProject: AiChatProject = {
    id: TELEGRAM_AI_MANAGED_PROJECT_ID,
    title: 'Телеграм ассистент',
    color: '#229ED9',
    icon: 'telegram',
    chats
  };
  if (previous && JSON.stringify(previous) === JSON.stringify(nextProject)) return projects;
  return [...ownedProjects, nextProject];
}
type AiChatProjectDraft = { mode: 'create' | 'edit'; projectId?: string; title: string; color: string; icon: string };
type AiChatContextMenu = { type: 'project' | 'chat'; id: string; x: number; y: number };
type TaskAiMessage = ChatMessage & { id: string };

function SystemNotificationContent({ notification, tasks, onOpenTask, onOpenTaskAi }: { notification: SystemNotification; tasks: Task[]; onOpenTask: (task: Task) => void; onOpenTaskAi: (task: Task) => void }) {
  const task = notification.taskId ? tasks.find((item) => item.id === notification.taskId) : undefined;
  if (notification.eventKey?.startsWith('monitoring:') && task) {
    return <><span className="whitespace-pre-line">{notification.content.split(/\r?\n/).slice(0, 2).join('\n')}</span>{' '}
      <button type="button" className="system-notification-task-button rounded-full bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white"
        onClick={() => onOpenTaskAi(task)}>Ответить в чате задачи <ArrowUpRight size={12} className="inline" /></button>
    </>;
  }
  if (!task || !notification.content.includes(task.title)) return <>{notification.content}</>;

  const [beforeTitle, ...afterTitleParts] = notification.content.split(task.title);
  const textBeforeButton = beforeTitle.replace(/[«"]\s*$/, '').replace(/^🚨\s*/, '🚨');
  const textAfterButton = afterTitleParts.join(task.title).replace(/^\s*[»"]\s*/, ' ');
  const isOverdueNotification = /просрочена/i.test(notification.content);
  return (
    <>
      {isOverdueNotification ? '⏰Напоминание о задаче ' : textBeforeButton}
      <button
        type="button"
        className="system-notification-task-button inline-flex items-center gap-1 rounded-full bg-cyan-600/90 px-2 py-1 align-middle text-[11px] font-semibold text-white transition hover:bg-cyan-500"
        onClick={() => onOpenTask(task)}
        title={`Открыть задачу: ${task.title}`}
      >
        <ArrowUpRight size={12} className="shrink-0" />
        <span className="min-w-0 truncate">{task.title}</span>
      </button>
      {isOverdueNotification ? null : textAfterButton}
    </>
  );
}

const QUICK_AI_CHAT_TITLE = 'Быстрые запросы';
const QUICK_AI_CHAT_PROJECT_TITLE = 'Личный проект';
const QUICK_AI_CHAT_STORAGE_KEY = 'btm:quick-ai-chat';
const QUICK_AI_CHAT_ID = 'quick-ai-requests';

function normalizeAiChatProjects(rawProjects: Array<Partial<AiChatProject>> | null | undefined, quickMessages: AiChatMessage[] = []): AiChatProject[] {
  const quickChat: AiChatThread = { id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, messages: quickMessages.slice(-20) };
  const fallback: AiChatProject[] = [{ id: crypto.randomUUID(), title: QUICK_AI_CHAT_PROJECT_TITLE, color: '#8b5cf6', icon: '✨', chats: [quickChat] }];
  const standard = (rawProjects ?? []).filter(project => !isTelegramAssistantProjectLike(project));
  const managed = (rawProjects ?? []).find(project => project.id === TELEGRAM_AI_MANAGED_PROJECT_ID) ??
    (rawProjects ?? []).find(project => isTelegramAssistantProjectLike(project));
  const source: Array<Partial<AiChatProject>> = [
    ...(standard.length ? standard : fallback),
    ...(managed ? [{ ...managed, id: TELEGRAM_AI_MANAGED_PROJECT_ID, title: 'Телеграм ассистент', icon: 'telegram', chats: (managed.chats ?? [])
      .filter(chat => typeof chat?.id === 'string' && chat.id.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX))
      .filter((chat, index, all) => all.findIndex(candidate => candidate.id === chat.id) === index)
      .slice(0, 25) }] : [])
  ];
  const normalized = source.map((project, index) => ({
    id: project.id ?? crypto.randomUUID(),
    title: project.title ?? `Проект ${index + 1}`,
    color: project.color ?? '#8b5cf6',
    icon: project.icon ?? '✨',
    chats: (project.chats?.length || project.id === TELEGRAM_AI_MANAGED_PROJECT_ID
      ? (project.chats ?? []) : [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }]).map((chat) => ({
      id: chat.id ?? crypto.randomUUID(),
      title: chat.title ?? 'Новый чат',
      ...(readSavedAiChatModel(chat.model) ? { model: readSavedAiChatModel(chat.model)! } : {}),
      ...(typeof chat.modelChangedAt === 'string' ? { modelChangedAt: chat.modelChangedAt } : {}),
      messages: chat.messages ?? []
    }))
  }));
  const defaultProject = normalized[0] ?? fallback[0];
  const existingQuickChatIndex = defaultProject.chats.findIndex((chat) => chat.id === QUICK_AI_CHAT_ID || chat.title === QUICK_AI_CHAT_TITLE);
  const existingQuickChat = existingQuickChatIndex >= 0 ? defaultProject.chats[existingQuickChatIndex] : undefined;
  const mergedQuickChat: AiChatThread = { ...quickChat, ...existingQuickChat, id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, model: DEFAULT_QUICK_AI_CHAT_MODEL, messages: orderAiChatMessagesChronologically(reconcileAiChatMessagesWithChips(existingQuickChat?.messages ?? [], quickMessages.slice(-100))).slice(-100) };
  normalized[0] = { ...defaultProject, chats: [mergedQuickChat, ...defaultProject.chats.filter((_, index) => index !== existingQuickChatIndex)] };
  return isolateTaskProposalChips(sanitizeCachedTelegramAssistantProjects(normalized));
}


function areTaskAiMessagesEqual(a: TaskAiMessage[], b: TaskAiMessage[]) {
  if (a.length !== b.length) return false;
  return a.every((message, index) =>
    message.role === b[index]?.role
    && message.content === b[index]?.content
    && message.creditsSpentMilli === b[index]?.creditsSpentMilli
    && message.generatedDocument?.id === b[index]?.generatedDocument?.id
  );
}

type AiTaskReference = {
  taskId: string;
  label: string;
};

const TASK_REF_PATTERN = /\[\[task_ref=([^\]]+)\]\]|\[\[task_ref:([^|\]]+)\|([^\]]+)\]\]/g;


function parseTaskReferencesInLine(content: string): Array<{ type: 'text'; value: string } | { type: 'taskRef'; reference: AiTaskReference }> {
  const chunks: Array<{ type: 'text'; value: string } | { type: 'taskRef'; reference: AiTaskReference }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TASK_REF_PATTERN.lastIndex = 0;
  while ((match = TASK_REF_PATTERN.exec(content)) !== null) {
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
  TASK_REF_PATTERN.lastIndex = 0;
  return chunks;
}
function normalizeAiMessageContent(content: string): string {
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

function renderInlineAiMarkup(content: string): ReactNode {
  return <AiInlineMarkup content={content} strongClassName="ai-inline-strong" />;
}

const AiMessageContentWithTaskRefs = memo(function AiMessageContentWithTaskRefs({
  content,
  tasks,
  onOpenTask,
  onOpenTaskReference,
  showTaskReferenceButtons = false,
  closeGeneralAiFullscreenOnOpen,
  setGeneralAiFullscreen
}: {
  content: string;
  tasks: Task[];
  onOpenTask?: (taskId: string) => void;
  onOpenTaskReference?: (task: Task) => void;
  showTaskReferenceButtons?: boolean;
  closeGeneralAiFullscreenOnOpen?: boolean;
  setGeneralAiFullscreen?: (value: boolean) => void;
}) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const normalizedContent = useMemo(() => normalizeAiMessageContent(content), [content]);

  const openTask = (taskId: string, matchedTask?: Task | null) => {
    if (matchedTask && onOpenTaskReference) {
      onOpenTaskReference(matchedTask);
    } else {
      onOpenTask?.(showTaskReferenceButtons ? (matchedTask?.id ?? taskId) : (matchedTask?.parentTaskId ?? matchedTask?.id ?? taskId));
    }
    if (closeGeneralAiFullscreenOnOpen && setGeneralAiFullscreen) {
      setGeneralAiFullscreen(false);
    }
  };

  const renderTaskButton = (reference: AiTaskReference, key: string) => {
    const matchedTask = taskById.get(reference.taskId);
    const buttonLabel = matchedTask?.title || reference.label;
    return (
      <button
        key={key}
        type="button"
        className="inline-flex w-fit max-w-48 items-center gap-1 rounded-full bg-cyan-600/90 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-cyan-500"
        onClick={() => openTask(reference.taskId, matchedTask)}
        title={`Открыть задачу: ${buttonLabel}`}
      >
        <ArrowUpRight size={12} />
        <span className="min-w-0 truncate">{buttonLabel}</span>
      </button>
    );
  };

  return renderAiContentBlocks(normalizedContent, (text, blockKey) => (
    <Fragment key={blockKey}>
      {text.split(/\r?\n/).map((line, lineIndex) => {
        const chunks = parseTaskReferencesInLine(line);
        if (chunks.length === 0) return <div key={`line-empty-${lineIndex}`} className="min-h-[1em] whitespace-pre-wrap" />;
        const taskReferences = showTaskReferenceButtons
          ? chunks.filter((chunk): chunk is { type: 'taskRef'; reference: AiTaskReference } => chunk.type === 'taskRef').map((chunk) => chunk.reference)
          : [];
        return (
          <div key={`line-${lineIndex}`} className="whitespace-pre-wrap">
            {chunks.map((chunk, chunkIndex) => {
              if (chunk.type === 'taskRef') return null;
              return <span key={`chunk-text-${lineIndex}-${chunkIndex}`}>{renderInlineAiMarkup(chunk.value)}</span>;
            })}
            {taskReferences.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {taskReferences.map((reference, referenceIndex) => renderTaskButton(reference, `explicit-task-${lineIndex}-${reference.taskId}-${referenceIndex}`))}
              </div>
            ) : null}
          </div>
        );
      })}
    </Fragment>
  ));
});

function renderAiMessageContent(content: string, previews?: AiAttachmentPreview[], messageId?: string): ReactNode {
  const { text, names } = splitAiMessageAttachments(content);
  return <>
    <AiReplyMessageBody content={text} renderBody={(body) => renderAiContentBlocks(normalizeAiMessageContent(body), (part, key) => (
      <div key={key} className="whitespace-pre-wrap">{renderInlineAiMarkup(part)}</div>
    ))} />
    <AiMessageAttachments names={names} previews={previews} messageId={messageId} />
  </>;
}

function resolveAttachmentMimeType(file: File): string {
  const fromBrowser = file.type?.trim();
  if (fromBrowser) return fromBrowser;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) return 'application/octet-stream';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}



function getCoefficientBadgeColor(coefficient: number, variant: 'dark' | 'light' = 'dark') {
  const intensity = Math.max(0, Math.min(1, coefficient));
  const red = Math.round(80 + intensity * 170);
  const green = Math.round(165 - intensity * 95);
  const blue = Math.round(220 - intensity * 190);
  const alpha = variant === 'light' ? 0.48 : 0.32;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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

function truncateText(text: string, maxLength: number) {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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


type TimelineViewData = {
  title: string;
  tasksWithoutDate: Task[];
  tasksInRange: Task[];
  dayGroups: Array<{ key: string; date: Date; tasks: Task[] }>;
  hourGroups: Array<{ hour: number; tasks: Task[]; quarters: Array<{ minute: number; tasks: Task[] }> }>;
  monthCells: Array<{ key: string; date: Date | null; tasks: Task[] }>;
};

function buildTimelineViewData(
  listTasks: Task[],
  timelineAnchorDate: Date,
  timelineViewMode: 'day' | 'week' | 'month'
): TimelineViewData {
  const sortByDueDateAsc = (a: { task: Task; dueDate: Date }, b: { task: Task; dueDate: Date }) => {
    const diff = a.dueDate.getTime() - b.dueDate.getTime();
    if (diff !== 0) return diff;
    return a.task.title.localeCompare(b.task.title, 'ru');
  };
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const addDays = (value: Date, days: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  };
  const normalizeToMonday = (value: Date) => {
    const day = value.getDay();
    const offsetToMonday = (day + 6) % 7;
    return addDays(startOfDay(value), -offsetToMonday);
  };
  const monthStart = new Date(timelineAnchorDate.getFullYear(), timelineAnchorDate.getMonth(), 1);
  const monthEnd = new Date(timelineAnchorDate.getFullYear(), timelineAnchorDate.getMonth() + 1, 1);
  const monthLastDay = addDays(monthEnd, -1);
  const monthGridStart = normalizeToMonday(monthStart);
  const monthGridEnd = addDays(normalizeToMonday(monthLastDay), 7);
  const dayStart = startOfDay(timelineAnchorDate);
  const dayEnd = addDays(dayStart, 1);
  const weekStart = normalizeToMonday(timelineAnchorDate);
  const weekEnd = addDays(weekStart, 7);
  const rangeStart = timelineViewMode === 'day' ? dayStart : timelineViewMode === 'week' ? weekStart : monthGridStart;
  const rangeEnd = timelineViewMode === 'day' ? dayEnd : timelineViewMode === 'week' ? weekEnd : monthGridEnd;

  const tasksWithoutDate: Task[] = [];
  const datedTasks = listTasks
    .map((task) => {
      if (!task.dueDate) {
        tasksWithoutDate.push(task);
        return null;
      }
      const dueDate = new Date(task.dueDate);
      if (Number.isNaN(dueDate.getTime())) {
        tasksWithoutDate.push(task);
        return null;
      }
      return { task, dueDate };
    })
    .filter((entry): entry is { task: Task; dueDate: Date } => entry !== null);

  const tasksInRange = datedTasks
    .filter(({ dueDate }) => dueDate >= rangeStart && dueDate < rangeEnd)
    .sort(sortByDueDateAsc);
  const dayGroups = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const start = startOfDay(date);
    const end = addDays(start, 1);
    return {
      key: start.toISOString(),
      date,
      tasks: tasksInRange
        .filter(({ dueDate }) => dueDate >= start && dueDate < end)
        .sort(sortByDueDateAsc)
        .map(({ task }) => task)
    };
  });
  const hourGroups = Array.from({ length: 24 }, (_, hour) => {
    const start = new Date(dayStart);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    const hourTasks = tasksInRange
      .filter(({ dueDate }) => dueDate >= start && dueDate < end)
      .sort(sortByDueDateAsc);
    return {
      hour,
      tasks: hourTasks.map(({ task }) => task),
      quarters: [0, 15, 30, 45].map((minute) => ({
        minute,
        tasks: hourTasks
          .filter(({ dueDate }) => dueDate.getMinutes() >= minute && dueDate.getMinutes() < minute + 15)
          .map(({ task }) => task)
      }))
    };
  });

  const monthCells: TimelineViewData['monthCells'] = [];
  for (let date = new Date(monthGridStart); date < monthGridEnd; date = addDays(date, 1)) {
    const start = startOfDay(date);
    const end = addDays(start, 1);
    monthCells.push({
      key: start.toISOString(),
      date: start,
      tasks: tasksInRange
        .filter(({ dueDate }) => dueDate >= start && dueDate < end)
        .sort(sortByDueDateAsc)
        .map(({ task }) => task)
    });
  }

  const title = timelineViewMode === 'day'
    ? timelineAnchorDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : timelineViewMode === 'week'
      ? `${weekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${addDays(weekStart, 6).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : timelineAnchorDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    tasksWithoutDate,
    tasksInRange: tasksInRange.map(({ task }) => task),
    dayGroups,
    hourGroups,
    monthCells
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const browserNotificationsEnabledRef = useRef(true);
  browserNotificationsEnabledRef.current = currentUser?.browserNotificationsEnabled !== false;
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() => browserNotificationPermission());
  const [browserPermissionNudgeDismissed, setBrowserPermissionNudgeDismissed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [initialWorkspaceReady, setInitialWorkspaceReady] = useState(false);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<'global' | 'sectors'>('sectors');
  const [search, setSearch] = useState('');
  const [requestedStandaloneNote, setRequestedStandaloneNote] = useState<{ id: string; serial: number } | null>(null);
  const [selectedSphereIds, setSelectedSphereIds] = useState<string[]>([]);
  const [isSphereFilterOpen, setIsSphereFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus'>('all');
  const [rankingMode, setRankingMode] = useState<BubbleRankingMode>('urgency');
  const [isEfficiencyDetailsOpen, setIsEfficiencyDetailsOpen] = useState(false);
  const [trainingRewardMessage, setTrainingRewardMessage] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bubbles');

  const [copiedAiMessageKey, setCopiedAiMessageKey] = useState<string | null>(null);
  const copiedAiMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAiMessage = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    if (copiedAiMessageTimerRef.current) clearTimeout(copiedAiMessageTimerRef.current);
    setCopiedAiMessageKey(key);
    copiedAiMessageTimerRef.current = setTimeout(() => setCopiedAiMessageKey((prev) => (prev === key ? null : prev)), 1300);
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reportPromptTask, setReportPromptTask] = useState<Task | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [creditModalView, setCreditModalView] = useState<'purchase' | 'statistics'>('purchase');
  const [creditUsageStatistics, setCreditUsageStatistics] = useState<CreditUsageStatistics | null>(null);
  const [creditUsageStatisticsLoading, setCreditUsageStatisticsLoading] = useState(false);
  const [creditUsageStatisticsError, setCreditUsageStatisticsError] = useState<string | null>(null);
  const [isFocusSetupOpen, setIsFocusSetupOpen] = useState(false);
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [focusSelectedTaskIds, setFocusSelectedTaskIds] = useState<string[]>([]);
  const [focusActiveIndex, setFocusActiveIndex] = useState(0);
  const [focusTimerMinutes, setFocusTimerMinutes] = useState(25);
  const [focusRemainingSeconds, setFocusRemainingSeconds] = useState(25 * 60);
  const [isFocusTimerRunning, setIsFocusTimerRunning] = useState(false);
  const [focusAiDraft, setFocusAiDraft] = useState('');
  const [isFocusAiSearchOpen, setIsFocusAiSearchOpen] = useState(false);
  const [focusAiSearchQuery, setFocusAiSearchQuery] = useState('');
  const [focusAiLoading, setFocusAiLoading] = useState(false);
  const [focusAiProgress, setFocusAiProgress] = useState<TaskAiProgressStatus | null>(null);
  const [focusAiError, setFocusAiError] = useState<string | null>(null);
  const [focusAiPendingFiles, setFocusAiPendingFiles] = useState<File[]>([]);
  const [focusAiUploadProgress, setFocusAiUploadProgress] = useState<number | null>(null);
  const [isFocusAiExpanded, setIsFocusAiExpanded] = useState(false);
  const [isFocusSessionFinished, setIsFocusSessionFinished] = useState(false);
  const [focusSphereFilterId, setFocusSphereFilterId] = useState('all');
  const [isFocusSphereDropdownOpen, setIsFocusSphereDropdownOpen] = useState(false);
  const [focusBonusEvents, setFocusBonusEvents] = useState<Record<FocusBonusType, FocusBonusEvent | null>>({ ai: null, subtask: null, task: null, time: null });
  const [focusBonusTotal, setFocusBonusTotal] = useState(0);
  const [loadedFocusBonusStorageKey, setLoadedFocusBonusStorageKey] = useState<string | null>(null);
  const focusBonusStorageKey = currentUser?.id ? `btm:focus-bonus-total:${currentUser.id}:${currentUser.efficiencyResetAt ?? 'default'}` : null;
  const [focusSessionInitialDoneSubtaskIds, setFocusSessionInitialDoneSubtaskIds] = useState<Set<string>>(new Set());
  const [focusSessionAiRequestCount, setFocusSessionAiRequestCount] = useState(0);
  const [focusDistractionTaskId, setFocusDistractionTaskId] = useState<string | null>(null);
  const [subscriptionLinks, setSubscriptionLinks] = useState<SubscriptionLinks>({ start: '', pro: '', max: '' });
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [creditPurchaseAvailable, setCreditPurchaseAvailable] = useState(false);
  const creditPurchase = useCreditPurchase({ surface: 'web', openConfirmation: (url) => window.location.assign(url), onSucceeded: async () => { const me = await api.getMe(); setCurrentUser(me.user); } });
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

  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState<string | null>(null);
  const [telegramLinkExpiresIn, setTelegramLinkExpiresIn] = useState<number>(0);
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null);
  const [isTelegramLinkLoading, setIsTelegramLinkLoading] = useState(false);

  const [userTimeZone, setUserTimeZone] = useState<string>(() => {
    const saved = localStorage.getItem(USER_TIMEZONE_STORAGE_KEY);
    if (saved?.trim()) return saved.trim();
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected?.trim()) return detected.trim();
    } catch {}
    return DEFAULT_TIMEZONE;
  });
  const [manualCheckupLoading, setManualCheckupLoading] = useState(false);
  const [manualCheckupError, setManualCheckupError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavingKey, setSettingsSavingKey] = useState<'timeZone' | 'checkupEnabled' | 'checkupTime' | 'browserNotifications' | 'taskReport' | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState<'day' | 'week' | 'month'>('month');
  const [isTimelineToolbarHidden, setIsTimelineToolbarHidden] = useState(false);
  const [isAiNotificationsDefaultEnabled, setIsAiNotificationsDefaultEnabled] = useState<boolean>(() => localStorage.getItem(AI_NOTIFICATIONS_DEFAULT_STORAGE_KEY) !== '0');
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(() => new Date());
  const [isUpdatesOpen, setIsUpdatesOpen] = useState(false);
  const [hasUnreadNews, setHasUnreadNews] = useState(false);
  const [isOnboardingOfferOpen, setIsOnboardingOfferOpen] = useState(false);
  const [activeTourStep, setActiveTourStep] = useState<TaskTourStep | AiTourStep | FeatureTourStep | WorkspaceTourStep>(null);
  const tourRestoreStateRef = useRef<{ displayMode: DisplayMode; timelineViewMode: 'day' | 'week' | 'month'; timelineAnchorDate: Date } | null>(null);
  const [draggedTimelineTaskId, setDraggedTimelineTaskId] = useState<string | null>(null);
  const [activeTimelineDropSlot, setActiveTimelineDropSlot] = useState<{ hour: number; minute: number } | null>(null);
  const [isTimelineOptimizeModalOpen, setIsTimelineOptimizeModalOpen] = useState(false);
  const [timelineOptimizeNote, setTimelineOptimizeNote] = useState('');
  const [timelineOptimizeLoading, setTimelineOptimizeLoading] = useState(false);
  const [timelineHoverCard, setTimelineHoverCard] = useState<{ taskId: string; top: number; left: number } | null>(null);
  const [isTimelineOverdueModalOpen, setIsTimelineOverdueModalOpen] = useState(false);
  const [isTimelineOverdueModalCollapsedForDrag, setIsTimelineOverdueModalCollapsedForDrag] = useState(false);
  const [timelineOverdueBulkPostponeLoading, setTimelineOverdueBulkPostponeLoading] = useState<null | 'normal' | 'ai'>(null);
  const [timelineOptimizePreviewEnabledByMode, setTimelineOptimizePreviewEnabledByMode] = useState<Record<'day'|'week'|'month', boolean>>({ day: false, week: false, month: false });
  const [timelineOptimizeStateByMode, setTimelineOptimizeStateByMode] = useState<Record<'day'|'week'|'month',{ plan: Array<{ taskId: string; dueDate: string | null }>; summary: string }>>({ day:{plan:[],summary:''}, week:{plan:[],summary:''}, month:{plan:[],summary:''} });

  useEffect(() => {
    if (!activeTourStep?.startsWith('workspace-')) return;
    if (['workspace-overview', 'workspace-display-modes', 'workspace-bubbles', 'workspace-bubble-layout'].includes(activeTourStep)) {
      setDisplayMode('bubbles');
    } else if (activeTourStep === 'workspace-list') {
      setDisplayMode('list');
    } else if (['workspace-timeline', 'workspace-timeline-range', 'workspace-credits'].includes(activeTourStep)) {
      setDisplayMode('timeline');
    }
    setIsSettingsOpen(activeTourStep === 'workspace-settings');
    if (activeTourStep === 'workspace-timeline-range') setIsTimelineToolbarHidden(false);
  }, [activeTourStep]);

  useEffect(() => {
    if (activeTourStep === 'sphere-add') {
      setIsAddMenuOpen(false);
      setDisplayMode('bubbles');
    } else if (activeTourStep === 'task-context-menu') {
      setIsAddMenuOpen(false);
      setDisplayMode('bubbles');
    }
  }, [activeTourStep]);

  useEffect(() => {
    if (activeTourStep === 'ai-full-chat') {
      setIsAiChatOpen(true);
    } else if (activeTourStep === 'ai-task-help') {
      setIsAiChatOpen(false);
      setEditorState(null);
      setFocusedTaskId((current) => current ?? tasks.find((task) => !task.parentTaskId)?.id ?? null);
    } else if (activeTourStep === 'ai-recurrence') {
      setIsAiChatOpen(false);
      setFocusedTaskId(null);
      setEditorState({ initialSphereId: spheres[0]?.id });
    } else if (activeTourStep === 'ai-optimize') {
      setEditorState(null);
      setFocusedTaskId(null);
      setDisplayMode('timeline');
    } else if (activeTourStep === 'ai-checkup' || activeTourStep === 'ai-notifications') {
      setIsAiChatOpen(false);
      setEditorState(null);
      setFocusedTaskId(null);
      setIsSettingsOpen(true);
    }
  }, [activeTourStep, tasks, spheres]);

  useEffect(() => {
    if (activeTourStep === 'feature-rating') {
      setIsEfficiencyDetailsOpen(true);
      setIsFocusSetupOpen(false);
      setIsFocusModeOpen(false);
      setIsTelegramModalOpen(false);
    } else if (activeTourStep === 'feature-focus-button') {
      setIsEfficiencyDetailsOpen(false);
      setIsFocusSetupOpen(false);
    } else if (activeTourStep === 'feature-focus-setup') {
      setFocusSelectedTaskIds(visibleFocusCandidateTasks.slice(0, 3).map((task) => task.id));
      setIsFocusSetupOpen(true);
      setIsFocusModeOpen(false);
    } else if (activeTourStep === 'feature-telegram-button') {
      setIsFocusModeOpen(false);
      setIsTelegramModalOpen(false);
    } else if (activeTourStep === 'feature-telegram-qr') {
      setIsTelegramModalOpen(true);
    }
  }, [activeTourStep]);

  useEffect(() => {
    if (!currentUser?.id) {
      setHasUnreadNews(false);
      return;
    }
    setHasUnreadNews(localStorage.getItem(getLatestNewsReadStorageKey(currentUser.id)) !== LATEST_NEWS_ID);
  }, [currentUser?.id]);

  const markLatestNewsRead = () => {
    if (!currentUser?.id) return;
    localStorage.setItem(getLatestNewsReadStorageKey(currentUser.id), LATEST_NEWS_ID);
    setHasUnreadNews(false);
  };

  const [timelineCreateMenu, setTimelineCreateMenu] = useState<{ x: number; y: number; date: Date; hour?: number | null; minute?: number | null; taskId?: string | null } | null>(null);
  const [timelineReschedulePicker, setTimelineReschedulePicker] = useState<{ taskId: string; signal: number } | null>(null);
  const [listTaskContextMenu, setListTaskContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null);
  const [listTaskPostponeSubmenuOpen, setListTaskPostponeSubmenuOpen] = useState(false);
  const [timelinePostponeSubmenuOpen, setTimelinePostponeSubmenuOpen] = useState(false);
  const [timelinePostponeLoadingTaskId, setTimelinePostponeLoadingTaskId] = useState<string | null>(null);
  const [timelinePostponeHighlightedTaskId, setTimelinePostponeHighlightedTaskId] = useState<string | null>(null);
  const [timelineCompletionAnimationIds, setTimelineCompletionAnimationIds] = useState<string[]>([]);
  // Совместимость на случай частичного деплоя старого JSX-блока меню (он ссылался на эти имена).
  // В актуальной версии отдельное меню timelineTaskContextMenu больше не используется.
  const timelineTaskContextMenu: { x: number; y: number; taskId?: string | null; minute?: number | null } | null = null;
  const setTimelineTaskContextMenu = (_value: { x: number; y: number; taskId?: string | null; minute?: number | null } | null) => undefined;
  const [editorState, setEditorState] = useState<{ task?: Task; initialSphereId?: string } | null>(null);
  const [sectorEditorSphere, setSectorEditorSphere] = useState<Sphere | null>(null);
  const [poppingTaskId, setPoppingTaskId] = useState<string | null>(null);
  const [closingTaskIds, setClosingTaskIds] = useState<string[]>([]);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedDraft, setFocusedDraft] = useState<Partial<Task> | null>(null);
  const [focusedSaveError, setFocusedSaveError] = useState<string | null>(null);
  const [isFocusedNotesEditorOpen, setIsFocusedNotesEditorOpen] = useState(false);
  const [isFocusedSettingsOpen, setIsFocusedSettingsOpen] = useState(false);
  const [isFocusedCalendarExportOpen, setIsFocusedCalendarExportOpen] = useState(false);
  const [taskShareDialog, setTaskShareDialog] = useState<{ mode: 'create'; url?: string; loading?: boolean; error?: string } | { mode: 'accept'; token: string; preview?: { title: string; description?: string | null; subtaskCount: number; ownerName: string }; sphereId: string | null; loading?: boolean; error?: string } | null>(null);
  const [isCollaborationSettingsOpen, setIsCollaborationSettingsOpen] = useState(false);
  const [collaborationAction, setCollaborationAction] = useState<{ task: Task; action: 'complete' | 'delete' } | null>(null);
  const [subtaskCommentContextMenu, setSubtaskCommentContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [subtaskCommentPanel, setSubtaskCommentPanel] = useState<{ task: Task; compose: boolean } | null>(null);
  const [subtaskComments, setSubtaskComments] = useState<TaskComment[]>([]);
  const [subtaskCommentsLoading, setSubtaskCommentsLoading] = useState(false);
  const [subtaskCommentDraft, setSubtaskCommentDraft] = useState('');
  const [subtaskCommentReplyTo, setSubtaskCommentReplyTo] = useState<TaskComment | null>(null);
  const [subtaskCommentSending, setSubtaskCommentSending] = useState(false);
  const [subtaskCommentError, setSubtaskCommentError] = useState<string | null>(null);
  const subtaskCommentScrollRef = useRef<HTMLDivElement | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [isEditingFocusedTitle, setIsEditingFocusedTitle] = useState(false);
  const [focusedTitleDraft, setFocusedTitleDraft] = useState('');
  const [focusedTitleRows, setFocusedTitleRows] = useState(1);
  const [focusedNotifyPreset, setFocusedNotifyPreset] = useState('30');
  const [focusedRecurrenceLoading, setFocusedRecurrenceLoading] = useState(false);
  const [focusedRecurrenceSummary, setFocusedRecurrenceSummary] = useState<string | null>(null);
  const [hideClosedFocusedSubtasks, setHideClosedFocusedSubtasks] = useState(true);
  const focusedSubtaskListScrollRef = useRef<HTMLUListElement | null>(null);
  const focusModeSubtaskListScrollRef = useRef<HTMLUListElement | null>(null);
  const pendingSubtaskScrollRef = useRef<{ focused: number | null; focusMode: number | null } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingSubtaskScrollRef.current;
    if (!pending) return;
    if (focusedSubtaskListScrollRef.current && pending.focused !== null) {
      const container = focusedSubtaskListScrollRef.current;
      container.scrollTop = Math.min(pending.focused, Math.max(0, container.scrollHeight - container.clientHeight));
    }
    if (focusModeSubtaskListScrollRef.current && pending.focusMode !== null) {
      const container = focusModeSubtaskListScrollRef.current;
      container.scrollTop = Math.min(pending.focusMode, Math.max(0, container.scrollHeight - container.clientHeight));
    }
    pendingSubtaskScrollRef.current = null;
  }, [tasks]);
  const [isAddingFocusedSubtask, setIsAddingFocusedSubtask] = useState(false);
  const [focusedSubtaskTitle, setFocusedSubtaskTitle] = useState('');
  const [focusedSubtaskDueDate, setFocusedSubtaskDueDate] = useState<string | null>(null);
  const [focusedAiSearchQuery, setFocusedAiSearchQuery] = useState('');
  const [isFocusedAiSearchOpen, setIsFocusedAiSearchOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const [replyToAiTask, setReplyToAiTask] = useState<AiReplyTarget | null>(null);
  const [replyToFocusAi, setReplyToFocusAi] = useState<AiReplyTarget | null>(null);
  const [replyToAiChat, setReplyToAiChat] = useState<AiReplyTarget | null>(null);
  const [replyToQuickAi, setReplyToQuickAi] = useState<AiReplyTarget | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [aiProgressByTask, setAiProgressByTask] = useState<Record<string, TaskAiProgressStatus>>({});
  const [aiSubtasksLoadingTaskId, setAiSubtasksLoadingTaskId] = useState<string | null>(null);
  const [isAiSubtasksPromptOpen, setIsAiSubtasksPromptOpen] = useState(false);
  const [aiSubtasksPrompt, setAiSubtasksPrompt] = useState('');
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [taskAiUploadProgress, setTaskAiUploadProgress] = useState<number | null>(null);
  const [isFocusedAiDragActive, setIsFocusedAiDragActive] = useState(false);
  const [focusedTaskAttachments, setFocusedTaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);
  const [isTaskAttachmentDragActive, setIsTaskAttachmentDragActive] = useState(false);
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [aiModelByTask, setAiModelByTask] = useState<Record<string, AiChatModel>>({});
  const [aiRecipientByTaskId, setAiRecipientByTaskId] = useState<Record<string, string>>({});
  const [aiRecipientStorageUserId, setAiRecipientStorageUserId] = useState<string | null>(null);
  const [isAiRecipientPickerVisible, setIsAiRecipientPickerVisible] = useState(false);
  const [isAiRecipientMenuOpen, setIsAiRecipientMenuOpen] = useState(false);
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, TaskAiMessage[]>>({});
  const [aiReadCursorByTask, setAiReadCursorByTask] = useState<Record<string, number>>({});
  const [generalAiMessages, setGeneralAiMessages] = useState<GeneralAiMessage[]>([]);
  const [generalAiSearchQuery, setGeneralAiSearchQuery] = useState('');
  const [isGeneralAiSearchOpen, setIsGeneralAiSearchOpen] = useState(false);
  const [isUpcomingSubtasksModalOpen, setIsUpcomingSubtasksModalOpen] = useState(false);
  const [upcomingSubtasksFilter, setUpcomingSubtasksFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'no_due'>('all');
  const [generalAiDraft, setGeneralAiDraft] = useState('');
  const [isGeneralAiFullscreen, setIsGeneralAiFullscreen] = useState(false);
  const [generalAiLoading, setGeneralAiLoading] = useState(false);
  const [generalAiError, setGeneralAiError] = useState<string | null>(null);
  const [lastGeneralAiUndoOperations, setLastGeneralAiUndoOperations] = useState<GeneralAiUndoOperation[]>([]);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatPendingFiles, setAiChatPendingFiles] = useState<File[]>([]);
  const [aiChatUploadProgress, setAiChatUploadProgress] = useState<number | null>(null);
  const [quickAiChatDraft, setQuickAiChatDraft] = useState('');
  const [quickAiPendingFiles, setQuickAiPendingFiles] = useState<File[]>([]);
  const [quickAiChatLoading, setQuickAiChatLoading] = useState(false);
  const [quickAiPreviewHovered, setQuickAiPreviewHovered] = useState(false);
  const [quickAiChatModel, setQuickAiChatModel] = useState<AiChatModel>('gpt-6-luna');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatProgress, setAiChatProgress] = useState<AiChatProgressStatus>('analyzing_request');
  const [aiChatError, setAiChatError] = useState<string | null>(null);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [unreadSystemNotificationCount, setUnreadSystemNotificationCount] = useState(0);
  const [systemNotificationToast, setSystemNotificationToast] = useState<SystemNotification | null>(null);
  const knownSystemNotificationIdsRef = useRef<Set<string>>(new Set());
  const [aiChatProjects, setAiChatProjects] = useState<AiChatProject[]>(() => {
    try {
      const parsedProjects = JSON.parse(localStorage.getItem('btm:ai-chat-projects') || '[]') as Array<Partial<AiChatProject>>;
      const quickMessages = JSON.parse(localStorage.getItem(QUICK_AI_CHAT_STORAGE_KEY) || '[]') as AiChatMessage[];
      return normalizeAiChatProjects(parsedProjects, quickMessages);
    } catch { return normalizeAiChatProjects(null); }
  });
  const aiChatProjectsSyncReadyRef = useRef(false);
  const aiChatProjectsSaveTimerRef = useRef<number | null>(null);
  const aiChatProjectsRemoteSnapshotRef = useRef('');
  const aiChatProjectsSaveInFlightRef = useRef(false);
  const aiChatProjectsPollingRef = useRef(false);
  const [activeAiChatProjectId, setActiveAiChatProjectId] = useState(() => aiChatProjects[0]?.id ?? '');
  const [activeAiChatId, setActiveAiChatId] = useState(() => aiChatProjects[0]?.chats[0]?.id ?? QUICK_AI_CHAT_ID);
  useEffect(() => { setReplyToAiChat(null); setReplyToQuickAi(null); }, [activeAiChatId]);
  const [isAiChatProjectDialogOpen, setIsAiChatProjectDialogOpen] = useState(false);
  const [aiChatProjectDraft, setAiChatProjectDraft] = useState<AiChatProjectDraft>({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
  const [aiChatContextMenu, setAiChatContextMenu] = useState<AiChatContextMenu | null>(null);
  const [renamingAiChatId, setRenamingAiChatId] = useState<string | null>(null);
  const [aiChatRenameDraft, setAiChatRenameDraft] = useState('');
  const [subtaskOrderMap, setSubtaskOrderMap] = useState<Record<string, string[]>>({});
  const [habits, setHabits] = useState<Habit[]>([]);
  const [subtaskFilterMode, setSubtaskFilterMode] = useState<SubtaskFilterMode>('urgency');
  const [subtaskAuthorFilterByTaskId, setSubtaskAuthorFilterByTaskId] = useState<Record<string, string | null>>({});
  const [isSubtaskFilterOpen, setIsSubtaskFilterOpen] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [completedVisibleCount, setCompletedVisibleCount] = useState(40);
  const [themeMode, setThemeMode] = useState<ThemePreference>('auto');
  const [themeStorageUserId, setThemeStorageUserId] = useState<string | null>(null);
  const [autoThemeTick, setAutoThemeTick] = useState(0);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [personalDataConsentAccepted, setPersonalDataConsentAccepted] = useState(false);
  const [authError, setAuthError] = useState<string | null>(() => {
    const errorCode = new URLSearchParams(window.location.search).get('googleAuthError');
    if (errorCode === 'email_conflict') return 'Этот адрес почты уже используется другим аккаунтом. Войдите по логину и паролю. Автоматическая привязка Google по почте отключена для безопасности.';
    if (errorCode === 'email_unverified') return 'Google не подтвердил ваш адрес электронной почты. Выберите подтверждённый аккаунт Google.';
    if (errorCode === 'invalid_state') return 'Сессия входа через Google истекла или была прервана. Повторите вход.';
    if (errorCode) return 'Не удалось выполнить вход через Google. Повторите попытку.';
    return null;
  });
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('googleAuthError') || params.get('auth') === 'login' ? 'login' : null;
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('googleAuthError')) return;
    params.delete('googleAuthError');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [attachmentStorage, setAttachmentStorage] = useState<AttachmentStorage | null>(null);
  const [accountAttachments, setAccountAttachments] = useState<AccountAttachment[]>([]);
  const [areAccountAttachmentsOpen, setAreAccountAttachmentsOpen] = useState(false);
  const [accountAttachmentsLoading, setAccountAttachmentsLoading] = useState(false);
  const [quotaToast, setQuotaToast] = useState('');
  useEffect(() => {
    const handleLimit = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message || 'Достигнут лимит вложений. Подробнее в личном кабинете.';
      setQuotaToast(message);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Планировыч: лимит вложений', { body: message }); } catch { /* Some browsers block native notifications */ }
      }
    };
    window.addEventListener(ATTACHMENT_STORAGE_LIMIT_EVENT, handleLimit);
    return () => window.removeEventListener(ATTACHMENT_STORAGE_LIMIT_EVENT, handleLimit);
  }, []);
  useEffect(() => {
    if (!quotaToast) return;
    const timeout = window.setTimeout(() => setQuotaToast(''), 8000);
    return () => window.clearTimeout(timeout);
  }, [quotaToast]);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const focusedTaskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedSubtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const focusedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiExpandedDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusAiExpandedFileInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusActiveTaskIdRef = useRef<string | null>(null);
  const focusTaskSwitchAiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awardedFocusTimeIntervalsRef = useRef(0);
  const expandedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiFullscreenDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const quickAiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const quickAiContentRef = useRef<HTMLDivElement | null>(null);
  const quickAiFollowBottomRef = useRef(true);
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineCurrentDayRef = useRef<HTMLDivElement | null>(null);
  const timelineLastScrollTopRef = useRef(0);
  const focusedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const expandedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusedTaskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const focusedTaskDescriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedDueDateInputRef = useRef<HTMLInputElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const efficiencyDetailsRef = useRef<HTMLDivElement | null>(null);
  const focusedAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedAutosaveSignatureRef = useRef<string | null>(null);
  const overdueNudgeAttemptAtByTaskRef = useRef<Record<string, number>>({});
  const loadedAiHistoryTaskIdsRef = useRef<Set<string>>(new Set());
  const taskAiClearRevisionRef = useRef<Record<string, number>>({});
  const loadRequestIdRef = useRef(0);
  const [overdueTick, setOverdueTick] = useState(0);

  useEffect(() => {
    api.getSubscriptionLinks()
      .then((response) => setSubscriptionLinks(response.links))
      .catch(() => {
        // Не блокируем приложение, если ссылки временно недоступны.
      });
  }, []);

  useEffect(() => {
    api.getCreditPacks()
      .then((response) => { setCreditPacks(response.packs); setCreditPurchaseAvailable(response.purchaseAvailable); })
      .catch(() => {
        // Не блокируем приложение, если пакеты временно недоступны.
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseId = params.get('payment') === 'return' ? params.get('purchaseId') : null;
    if (!purchaseId) return;
    creditPurchase.setPendingPurchaseId(purchaseId);
    void creditPurchase.check(purchaseId).catch((error) => creditPurchase.setMessage(error instanceof Error ? error.message : 'Не удалось проверить платёж'));
    params.delete('payment'); params.delete('purchaseId');
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    localStorage.setItem(AI_NOTIFICATIONS_DEFAULT_STORAGE_KEY, isAiNotificationsDefaultEnabled ? '1' : '0');
  }, [isAiNotificationsDefaultEnabled]);

  useEffect(() => {
    if (!timelineCreateMenu) return;
    const onClose = () => setTimelineCreateMenu(null);
    window.addEventListener('click', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('click', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [timelineCreateMenu]);
  useEffect(() => {
    if (!timelineCreateMenu) return;
    const close = () => {
      setTimelineCreateMenu(null);
      setTimelinePostponeSubmenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [timelineCreateMenu]);

  useEffect(() => {
    if (!listTaskContextMenu) return;
    const close = () => {
      setListTaskContextMenu(null);
      setListTaskPostponeSubmenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [listTaskContextMenu]);

  const formatDeadlineTooltip = (task: Task) => {
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const dueDateText = dueDate && !Number.isNaN(dueDate.getTime())
      ? dueDate.toLocaleString('ru-RU')
      : 'Без дедлайна';
    const nowMs = Date.now();
    const diffMs = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.getTime() - nowMs : null;
    const absDiffMs = diffMs === null ? null : Math.abs(diffMs);
    const hours = absDiffMs === null ? 0 : Math.floor(absDiffMs / (60 * 60 * 1000));
    const minutes = absDiffMs === null ? 0 : Math.floor((absDiffMs % (60 * 60 * 1000)) / (60 * 1000));
    const deadlineDeltaText = diffMs === null
      ? 'Срок не задан'
      : diffMs >= 0
        ? `Через ${hours} ч ${minutes} мин`
        : `Просрочено на ${hours} ч ${minutes} мин`;

    return [
      `Название: ${task.title}`,
      `Описание: ${task.description?.trim() ? task.description : 'Нет описания'}`,
      `Дедлайн: ${dueDateText}`,
      deadlineDeltaText
    ].join('\n');
  };

  async function load() {
    const requestId = ++loadRequestIdRef.current;
    const [sphereData, taskData, habitData] = await Promise.all([api.getSpheres(), api.getTasks(), api.getHabits()]);
    if (requestId !== loadRequestIdRef.current) return;
    setSpheres(sphereData);
    setTasks(taskData);
    setHabits(habitData);
  }

  const updateUserSettings = async (
    payload: { timeZone?: string; morningAiCheckupEnabled?: boolean; morningAiCheckupTime?: string; browserNotificationsEnabled?: boolean; offerTaskCompletionReport?: boolean },
    savingKey: 'timeZone' | 'checkupEnabled' | 'checkupTime' | 'browserNotifications' | 'taskReport'
  ) => {
    setSettingsSavingKey(savingKey);
    setSettingsError(null);
    try {
      const result = await api.updateUserSettings(payload);
      setCurrentUser(result.user);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Не удалось сохранить настройки');
    } finally {
      setSettingsSavingKey(null);
    }
  };

  const generateManualCheckup = async () => {
    if (manualCheckupLoading) return;
    setManualCheckupLoading(true);
    setManualCheckupError(null);
    try {
      const { message } = await api.generateAiCheckupNow();
      const received: AiChatMessage = { ...message, id: message.id ?? crypto.randomUUID() };
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
      setActiveAiChatProjectId(aiChatProjects[0]?.id ?? '');
      setActiveAiChatId(QUICK_AI_CHAT_ID);
      setIsSettingsOpen(false);
      setIsAiChatOpen(true);
      void api.getMe().then(({ user }) => setCurrentUser(user)).catch(() => undefined);
    } catch (error) {
      setManualCheckupError(formatAiRequestError(error));
    } finally {
      setManualCheckupLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (!currentUser || isDeletingAccount) return;
    const confirmed = window.confirm('Вы уверены, что хотите удалить аккаунт?\n\nВсе данные аккаунта будут удалены. Это действие нельзя отменить.');
    if (!confirmed) return;

    setIsDeletingAccount(true);
    setSettingsError(null);
    try {
      const userId = currentUser.id;
      await api.deleteAccount();
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`btm:${userId}:`) || key.startsWith(`btm:focus-bonus-total:${userId}:`))
        .forEach((key) => localStorage.removeItem(key));
      clearUserState();
      window.location.assign('/?auth=login');
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Не удалось удалить аккаунт');
      setIsDeletingAccount(false);
    }
  };


  const openCreateTaskFromTimeline = (date: Date, hour?: number | null, minute = 0, taskType: 'TASK' | 'EVENT' = 'TASK') => {
    const dueDate = new Date(date);
    if (typeof hour === 'number') {
      dueDate.setHours(hour, minute, 0, 0);
    } else {
      dueDate.setHours(0, 0, 0, 0);
    }
    setEditorState({
      task: {
        id: '',
        title: '',
        description: '',
        taskType,
        location: taskType === 'EVENT' ? '' : null,
        status: 'TODO',
        importance: 3,
        urgency: 3,
        sphereId: spheres[0]?.id ?? null,
        dueDate: dueDate.toISOString(),
        parentTaskId: null,
        createdAt: new Date().toISOString(),
        notifyBeforeMinutes: 0,
        aiNotificationsEnabled: taskType === 'EVENT' ? false : isAiNotificationsDefaultEnabled,
        isRecurring: false,
        recurrenceText: null,
        recurrenceJson: null,
        recurrenceSummary: null,
        recurrenceUntil: null
        ,
        priorityScore: 0
      }
    });
  };

  const openCreateTaskFromListTask = (task: Task) => {
    setEditorState({ initialSphereId: task.sphereId ?? spheres[0]?.id });
  };

  const clearUserState = () => {
    setCurrentUser(null);
    setInitialWorkspaceReady(false);
    setSpheres([]);
    setTasks([]);
    setHabits([]);
    setEditorState(null);
    setSectorEditorSphere(null);
    setPoppingTaskId(null);
    setClosingTaskIds([]);
    setFocusedTaskId(null);
    setFocusedDraft(null);
    setIsAddingFocusedSubtask(false);
    setFocusedSubtaskTitle('');
    setAiDraft('');
    setAiError(null);
    setAiLoadingTaskId(null);
    setAiSubtasksLoadingTaskId(null);
    setAiPendingFiles([]);
    setIsAiExpanded(false);
    setAiDialogByTask({});
    setAiReadCursorByTask({});
    setGeneralAiMessages([]);
    setGeneralAiDraft('');
    setIsGeneralAiFullscreen(false);
    setGeneralAiLoading(false);
    setGeneralAiError(null);
    setLastGeneralAiUndoOperations([]);
    loadedAiHistoryTaskIdsRef.current = new Set();
    setSubtaskOrderMap({});
    setThemeMode('auto');
    setThemeStorageUserId(null);
    setAuthError(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(clearUserState);
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      setAuthLoading(true);
      try {
        const me = await api.getMe();
        setCurrentUser(me.user);
      } catch {
        clearUserState();
      } finally {
        setAuthLoading(false);
      }
    };
    void initAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let live = true;
    void load()
      .catch((error) => console.error('[Workspace] initial data load failed', error))
      .finally(() => { if (live) setInitialWorkspaceReady(true); });
    return () => { live = false; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (authLoading || (currentUser && !initialWorkspaceReady)) return;
    // The static HTML splash also covers bundle download and React startup.
    // Remove it only once auth and the first workspace request have settled.
    document.documentElement.classList.remove('web-workspace-preload');
  }, [authLoading, currentUser?.id, initialWorkspaceReady]);
  useEffect(() => {
    if (!currentUser) return;
    const token = new URLSearchParams(window.location.search).get('joinTask');
    if (!token) return;
    setTaskShareDialog({ mode: 'accept', token, sphereId: null, loading: true });
    void api.getTaskShare(token).then((preview) => setTaskShareDialog({ mode: 'accept', token, preview, sphereId: null })).catch((error) => setTaskShareDialog({ mode: 'accept', token, sphereId: null, error: error instanceof Error ? error.message : 'Ссылка недействительна' }));
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser) {
      setIsOnboardingOfferOpen(false);
      return;
    }
    setIsOnboardingOfferOpen(localStorage.getItem(getOnboardingOfferStorageKey(currentUser.id)) !== '1');
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser) return;
    const intervalId = window.setInterval(() => {
      setOverdueTick((prev) => prev + 1);
    }, OVERDUE_CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    setSelectedSphereIds((prev) => {
      const sphereIdSet = new Set(spheres.map((sphere) => sphere.id));
      const normalized = prev.filter((id) => sphereIdSet.has(id));
      if (normalized.length > 0) return normalized;
      return spheres.map((sphere) => sphere.id);
    });
  }, [spheres]);

  useEffect(() => {
    aiChatProjectsSyncReadyRef.current = false;
    if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
    aiChatProjectsRemoteSnapshotRef.current = '';
    aiChatProjectsSaveInFlightRef.current = false;
    if (!currentUser) {
      setAiDialogByTask({});
      setAiReadCursorByTask({});
      setThemeMode('auto');
      setThemeStorageUserId(null);
      loadedAiHistoryTaskIdsRef.current = new Set();
      return;
    }
    let isCancelled = false;
    setAiDialogByTask({});
    loadedAiHistoryTaskIdsRef.current = new Set();
    setGeneralAiMessages([]);
    setLastGeneralAiUndoOperations([]);
    try {
      const aiReadCursorRaw = localStorage.getItem(getAiReadCursorStorageKey(currentUser.id));
      if (!aiReadCursorRaw) {
        setAiReadCursorByTask({});
      } else {
        const parsed = JSON.parse(aiReadCursorRaw) as Record<string, number>;
        const normalized = Object.entries(parsed ?? {}).reduce<Record<string, number>>((acc, [taskId, value]) => {
          if (Number.isFinite(value) && value >= 0) {
            acc[taskId] = Math.floor(value);
          }
          return acc;
        }, {});
        setAiReadCursorByTask(normalized);
      }
    } catch {
      setAiReadCursorByTask({});
    }
    const loadGeneralAiHistory = async () => {
      try {
        const [result, syncedProjects, telegramInbox] = await Promise.all([
          api.getGeneralAssistantHistory(),
          api.getAiChatProjects<Partial<AiChatProject>>(),
          api.telegramAssistantInbox().catch(() => null)
        ]);
        if (isCancelled) return;
        const normalized = result.messages
          .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
          .map((message) => ({
            ...message, id: message.id ?? crypto.randomUUID(), role: message.role, content: message.content
          }));
        setGeneralAiMessages(normalized);
        setAiChatProjects((prev) => {
          const source = syncedProjects.projects?.length ? syncedProjects.projects : prev;
          const base = normalizeAiChatProjects(source, normalized);
          const next = telegramInbox ? mergeTelegramAiInbox(base, telegramInbox) : base;
          aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(next);
          if (!syncedProjects.projects?.length) {
            void api.saveAiChatProjects(next).catch(error => console.warn('[AI chat] initial project sync failed', error));
          }
          return next;
        });
        aiChatProjectsSyncReadyRef.current = true;
      } catch {
        if (isCancelled) return;
        setGeneralAiMessages([]);
      }
    };
    void loadGeneralAiHistory();

    // Drop obsolete uploaded backgrounds; the workspace now uses a fixed surface.
    localStorage.removeItem(`btm:${currentUser.id}:background-image`);
    localStorage.removeItem(`btm:${currentUser.id}:background-overlay-opacity`);
    setThemeMode(loadThemePreference(localStorage, getThemeStorageKey(currentUser.id)));
    setThemeStorageUserId(currentUser.id);

    const storedRankingMode = localStorage.getItem(getRankingModeStorageKey(currentUser.id));
    if (storedRankingMode === 'urgency' || storedRankingMode === 'importance' || storedRankingMode === 'coefficient') {
      setRankingMode(storedRankingMode);
    } else {
      setRankingMode('urgency');
    }

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id]);

  const effectiveThemeMode = useMemo(
    () => resolveThemeMode(themeMode, userTimeZone, new Date()),
    [themeMode, userTimeZone, autoThemeTick]
  );

  useEffect(() => {
    if (themeMode !== 'auto') return;
    // Check periodically so the mode switches at 20:00 and 05:00 without a refresh.
    const id = window.setInterval(() => setAutoThemeTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(id);
  }, [themeMode]);

  useEffect(() => {
    document.body.dataset.theme = effectiveThemeMode;
    document.documentElement.dataset.theme = effectiveThemeMode;
    return () => {
      delete document.body.dataset.theme;
      delete document.documentElement.dataset.theme;
    };
  }, [effectiveThemeMode]);

  useEffect(() => {
    if (!currentUser || themeStorageUserId !== currentUser.id) return;
    localStorage.setItem(getThemeStorageKey(currentUser.id), themeMode);
  }, [themeMode, currentUser?.id, themeStorageUserId]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(getRankingModeStorageKey(currentUser.id), rankingMode);
  }, [rankingMode, currentUser?.id]);


  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(getAiReadCursorStorageKey(currentUser.id), JSON.stringify(aiReadCursorByTask));
  }, [aiReadCursorByTask, currentUser?.id]);

  useEffect(() => {
    const raw = localStorage.getItem('btm:task-ai-mode-map');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, AiChatModel | 'gpt-5.4-nano' | 'gpt-5.4' | 'fast' | 'smart'>;
      setAiModelByTask(Object.fromEntries(Object.entries(parsed).map(([taskId, model]) => [
        taskId,
        model === 'fast' || model === 'gpt-5.4-nano'
          ? 'gpt-6-luna'
          : model === 'gpt-5.4'
            ? 'gpt-6.1-sol'
            : model === 'smart'
              ? 'gpt-5.4-mini'
              : model
      ])) as Record<string, AiChatModel>);
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('btm:task-ai-mode-map', JSON.stringify(aiModelByTask));
  }, [aiModelByTask]);

  useEffect(() => {
    localStorage.setItem(USER_TIMEZONE_STORAGE_KEY, userTimeZone);
  }, [userTimeZone]);

  useEffect(() => {
    if (!currentUser) return;
    const profileTimeZone = currentUser.timeZone?.trim();
    if (profileTimeZone) {
      setUserTimeZone(profileTimeZone);
    }
    setSettingsError(null);
  }, [currentUser?.id, currentUser?.timeZone, currentUser?.morningAiCheckupEnabled, currentUser?.morningAiCheckupTime]);

  useEffect(() => {
    if (!currentUser || !focusedTaskId) return;
    if (loadedAiHistoryTaskIdsRef.current.has(focusedTaskId)) return;
    let isCancelled = false;
    const loadAiTaskHistory = async () => {
      try {
        const revision = taskAiClearRevisionRef.current[focusedTaskId] ?? 0;
        const result = await api.getTaskAssistantHistory(focusedTaskId);
        if (isCancelled || revision !== (taskAiClearRevisionRef.current[focusedTaskId] ?? 0)) return;
        loadedAiHistoryTaskIdsRef.current.add(focusedTaskId);
        setAiDialogByTask((prev) => {
          const localMessages = prev[focusedTaskId] ?? [];
          const serverMessages = result.messages;
          const hasPendingOptimisticMessages = localMessages.length > serverMessages.length
            && localMessages.slice(0, serverMessages.length).every((message, index) => (
              message.role === serverMessages[index]?.role && message.content === serverMessages[index]?.content
            ));
          if (hasPendingOptimisticMessages || aiLoadingTaskId === focusedTaskId) return prev;
          const normalizedServerMessages = normalizeTaskAiMessages(serverMessages);
          if (areTaskAiMessagesEqual(localMessages, normalizedServerMessages)) return prev;
          return { ...prev, [focusedTaskId]: normalizedServerMessages };
        });
      } catch {
        if (isCancelled) return;
        loadedAiHistoryTaskIdsRef.current.add(focusedTaskId);
      }
    };
    void loadAiTaskHistory();
    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, focusedTaskId, aiLoadingTaskId]);

  useEffect(() => {
    if (!currentUser || !focusedTaskId) return;
    const intervalId = window.setInterval(async () => {
      try {
        const revision = taskAiClearRevisionRef.current[focusedTaskId] ?? 0;
        const result = await api.getTaskAssistantHistory(focusedTaskId);
        if (revision !== (taskAiClearRevisionRef.current[focusedTaskId] ?? 0)) return;
        setAiDialogByTask((prev) => {
          const localMessages = prev[focusedTaskId] ?? [];
          const serverMessages = result.messages;
          const hasPendingOptimisticMessages = localMessages.length > serverMessages.length
            && localMessages.slice(0, serverMessages.length).every((message, index) => (
              message.role === serverMessages[index]?.role && message.content === serverMessages[index]?.content
            ));
          if (hasPendingOptimisticMessages || aiLoadingTaskId === focusedTaskId) return prev;
          const normalizedServerMessages = normalizeTaskAiMessages(serverMessages);
          if (areTaskAiMessagesEqual(localMessages, normalizedServerMessages)) return prev;
          return { ...prev, [focusedTaskId]: normalizedServerMessages };
        });
      } catch {
        // silent sync retries
      }
    }, 2500);
    return () => window.clearInterval(intervalId);
  }, [currentUser?.id, focusedTaskId, aiLoadingTaskId]);

  useEffect(() => {
    if (!focusedTaskId) return;
    setAiReadCursorByTask((prev) => {
      const nextReadCount = aiDialogByTask[focusedTaskId]?.length ?? 0;
      if ((prev[focusedTaskId] ?? 0) >= nextReadCount) return prev;
      return { ...prev, [focusedTaskId]: nextReadCount };
    });
  }, [aiDialogByTask, focusedTaskId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const targetElement = event.target instanceof Element ? event.target : null;
      if (isSphereFilterOpen && targetElement && !targetElement.closest('[data-sphere-filter-root="true"]')) {
        setIsSphereFilterOpen(false);
      }
      const tourKeepsSettingsOpen = activeTourStep === 'workspace-settings'
        || activeTourStep === 'ai-checkup'
        || activeTourStep === 'ai-notifications';
      if (!tourKeepsSettingsOpen && isSettingsOpen && settingsMenuRef.current && target && !settingsMenuRef.current.contains(target) && !(target instanceof Element && target.closest('[data-tour="settings-panel"]'))) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [activeTourStep, isSettingsOpen, isSphereFilterOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (activeTourStep === 'feature-rating') return;
      const target = event.target as Node | null;
      if (isEfficiencyDetailsOpen && efficiencyDetailsRef.current && target && !efficiencyDetailsRef.current.contains(target)) {
        setIsEfficiencyDetailsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [activeTourStep, isEfficiencyDetailsOpen]);

  useEffect(() => {
    if (!currentUser) {
      overdueNudgeAttemptAtByTaskRef.current = {};
      return;
    }

    const isOverdue = (task: Task) => {
      if (task.parentTaskId) return false;
      if (task.aiNotificationsEnabled === false) return false;
      if (task.status === 'DONE') return false;
      if (!task.dueDate) return false;
      const dueDate = new Date(task.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;
      return dueDate.getTime() <= Date.now();
    };

    const overdueTaskIds = tasks.reduce<string[]>((acc, task) => {
      if (task.parentTaskId) return acc;
      if (isOverdue(task)) acc.push(task.id);
      return acc;
    }, []);
    if (overdueTaskIds.length === 0) return;

    const processOverdueNudges = async () => {
      const nowTs = Date.now();
      for (const taskId of overdueTaskIds) {
        const lastAttemptAt = overdueNudgeAttemptAtByTaskRef.current[taskId] ?? 0;
        if (nowTs - lastAttemptAt < OVERDUE_NUDGE_RETRY_INTERVAL_MS) {
          continue;
        }
        overdueNudgeAttemptAtByTaskRef.current[taskId] = nowTs;
        try {
          const result = await api.generateOverdueTaskNudge(taskId);
          const answer = result.answer;
          if (!result.sent || !answer) continue;
          setAiDialogByTask((prev) => ({
            ...prev,
            [taskId]: (() => {
              const previousDialog = prev[taskId] ?? [];
              const alreadyHasMessage = previousDialog.some((message) => message.role === 'assistant' && message.content === answer);
              return alreadyHasMessage
                ? previousDialog
                : [...previousDialog, { id: crypto.randomUUID(), role: 'assistant', content: answer, creditsSpentMilli: result.billing?.creditsSpentMilli ?? 0 }];
            })()
          }));
        } catch {
          overdueNudgeAttemptAtByTaskRef.current[taskId] = 0;
        }
      }
    };

    void processOverdueNudges();
  }, [currentUser?.id, overdueTick, tasks]);

  const rootTasks = useMemo(() => tasks.filter((task) => !task.parentTaskId), [tasks]);
  const subtasks = useMemo(() => tasks.filter((task) => Boolean(task.parentTaskId)), [tasks]);
  const sortedSubtasks = useMemo(() => {
    const baseMap = subtasks.reduce<Record<string, Task[]>>((acc, task) => {
      const key = task.parentTaskId as string;
      (acc[key] ??= []).push(task);
      return acc;
    }, {});

    return Object.entries(baseMap).reduce<Record<string, Task[]>>((acc, [parentId, items]) => {
      const orderedByCreated = [...items].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
      const order = subtaskOrderMap[parentId];
      if (!order?.length) {
        acc[parentId] = orderedByCreated;
        return acc;
      }
      const orderIndex = new Map(order.map((id, index) => [id, index]));
      acc[parentId] = orderedByCreated.sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      return acc;
    }, {});
  }, [subtasks, subtaskOrderMap]);
  const subtaskMap = sortedSubtasks;
  const displayedSubtaskMap = useMemo(
    () => Object.entries(subtaskMap).reduce<Record<string, Task[]>>((acc, [parentId, items]) => {
      const toDeadlineTimestamp = (task: Task) => {
        if (!task.dueDate) return Number.POSITIVE_INFINITY;
        const parsed = new Date(task.dueDate).getTime();
        return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
      };
      acc[parentId] = [...items].sort((a, b) => {
        const statusDiff = Number(a.status === 'DONE') - Number(b.status === 'DONE');
        if (statusDiff !== 0) return statusDiff;
        if (subtaskFilterMode === 'none') return newestFocusSubtaskFirst(a, b);
        if (subtaskFilterMode === 'urgency') return urgentFocusSubtaskFirst(a, b);
        const importanceDiff = (b.importance ?? 3) - (a.importance ?? 3);
        if (importanceDiff !== 0) return importanceDiff;
        return toDeadlineTimestamp(a) - toDeadlineTimestamp(b);
      });
      return acc;
    }, {}),
    [subtaskMap, subtaskFilterMode]
  );
  const getFocusedSubtaskItems = (taskId: string) => {
    const items = displayedSubtaskMap[taskId] ?? [];
    const authorUserId = subtaskAuthorFilterByTaskId[taskId] ?? null;
    return authorUserId ? items.filter((task) => task.creatorUserId === authorUserId) : items;
  };
  const activeTasks = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE' && task.taskType !== 'EVENT' && task.taskType !== 'REMINDER'), [rootTasks]);
  const activeTimelineItems = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE'), [rootTasks]);
  const focusCandidateTasks = useMemo(
    () => [...activeTasks].sort((a, b) => getTaskCoefficient(b) - getTaskCoefficient(a)),
    [activeTasks]
  );
  const visibleFocusCandidateTasks = useMemo(
    () => focusSphereFilterId === 'all'
      ? focusCandidateTasks
      : focusCandidateTasks.filter((task) => (task.sphereId ?? '') === focusSphereFilterId),
    [focusCandidateTasks, focusSphereFilterId]
  );
  const focusTasks = useMemo(
    () => focusSelectedTaskIds.map((id) => rootTasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task)),
    [focusSelectedTaskIds, rootTasks]
  );
  const focusActiveTask = focusTasks[focusActiveIndex] ?? focusTasks[0] ?? null;
  const focusTaskAiDialog = focusActiveTask ? (aiDialogByTask[focusActiveTask.id] ?? []) : [];
  const focusTaskAiModel: AiChatModel = focusActiveTask
    ? (aiModelByTask[focusActiveTask.id] ?? 'gpt-5.4-mini') : 'gpt-5.4-mini';

  // Fetch the SAME persistent conversation as regular task help. Switching
  // focus task never reuses an unrelated task's AI response or model.
  useEffect(() => {
    if (!currentUser || !isFocusModeOpen || !focusActiveTask) return;
    const taskId = focusActiveTask.id;
    let alive = true;
    const sync = async () => {
      if (aiLoadingTaskId === taskId) return;
      try {
        const revision = taskAiClearRevisionRef.current[taskId] ?? 0;
        const { messages } = await api.getTaskAssistantHistory(taskId);
        if (!alive || revision !== (taskAiClearRevisionRef.current[taskId] ?? 0)) return;
        loadedAiHistoryTaskIdsRef.current.add(taskId);
        setAiDialogByTask(prev => {
          const local = prev[taskId] ?? [];
          if (aiLoadingTaskId === taskId) return prev;
          const next = normalizeTaskAiMessages(messages);
          return areTaskAiMessagesEqual(local, next) ? prev : { ...prev, [taskId]: next };
        });
      } catch (error) { console.warn('[Focus] task AI history refresh failed', error); }
    };
    void sync();
    const interval = window.setInterval(() => void sync(), 2500);
    return () => { alive = false; window.clearInterval(interval); };
  }, [currentUser?.id, isFocusModeOpen, focusActiveTask?.id, aiLoadingTaskId, focusAiLoading]);
  const focusCompletedSubtasksCount = useMemo(
    () => subtasks.filter((task) => task.status === 'DONE' && !focusSessionInitialDoneSubtaskIds.has(task.id)).length,
    [focusSessionInitialDoneSubtaskIds, subtasks]
  );
  const focusSessionRatingEarned = useMemo(
    () => (Object.values(focusBonusEvents) as Array<FocusBonusEvent | null>).reduce((total, event) => total + (event?.totalDelta ?? 0), 0),
    [focusBonusEvents]
  );
  const completedTasks = useMemo(() => rootTasks.filter((task) => task.status === 'DONE' && task.taskType !== 'REMINDER'), [rootTasks]);
  const completedTasksForPanel = useMemo(() => {
    if (completedFilter === 'all') return completedTasks;
    const now = new Date();
    return completedTasks.filter((task) => {
      const updatedAt = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;
      return updatedAt.getDate() === now.getDate()
        && updatedAt.getMonth() === now.getMonth()
        && updatedAt.getFullYear() === now.getFullYear();
    });
  }, [completedFilter, completedTasks]);
  const completedTasksVisible = useMemo(
    () => completedTasksForPanel.slice(0, completedVisibleCount),
    [completedTasksForPanel, completedVisibleCount]
  );
  const hasMoreCompletedTasks = completedTasksVisible.length < completedTasksForPanel.length;
  const upcomingSubtasksForPanel = useMemo(() => {
    return subtasks
      .filter((task) => task.status !== 'DONE' && Boolean(task.dueDate))
      .map((task) => ({
        task,
        dueTimestamp: task.dueDate ? new Date(task.dueDate).getTime() : Number.NaN
      }))
      .filter(({ dueTimestamp }) => Number.isFinite(dueTimestamp))
      .sort((a, b) => a.dueTimestamp - b.dueTimestamp)
      .slice(0, 3)
      .map(({ task }) => task);
  }, [subtasks]);
  const filteredUpcomingSubtasksForModal = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const startOfDayAfterTomorrow = new Date(startOfTomorrow);
    startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);
    const endOfWeekWindow = new Date(startOfToday);
    endOfWeekWindow.setDate(endOfWeekWindow.getDate() + 7);

    return subtasks
      .filter((task) => task.status !== 'DONE')
      .filter((task) => {
        if (upcomingSubtasksFilter === 'all') return true;
        if (!task.dueDate) return upcomingSubtasksFilter === 'no_due';
        const due = new Date(task.dueDate);
        if (Number.isNaN(due.getTime())) return upcomingSubtasksFilter === 'no_due';
        if (upcomingSubtasksFilter === 'today') return due >= startOfToday && due < startOfTomorrow;
        if (upcomingSubtasksFilter === 'tomorrow') return due >= startOfTomorrow && due < startOfDayAfterTomorrow;
        if (upcomingSubtasksFilter === 'week') return due >= startOfToday && due < endOfWeekWindow;
        return false;
      })
      .sort((a, b) => {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return a.title.localeCompare(b.title, 'ru');
      });
  }, [subtasks, upcomingSubtasksFilter]);
  const focusedTask = useMemo(() => rootTasks.find((task) => task.id === focusedTaskId) ?? null, [rootTasks, focusedTaskId]);
  const focusedAiDialog = useMemo(
    () => (focusedTask ? aiDialogByTask[focusedTask.id] ?? [] : []),
    [aiDialogByTask, focusedTask]
  );
  const focusedAiModel: AiChatModel = focusedTask ? (aiModelByTask[focusedTask.id] ?? 'gpt-5.4-mini') : 'gpt-5.4-mini';
  const filteredFocusedAiDialog = useMemo(() => {
    if (!isFocusedAiSearchOpen) return focusedAiDialog;
    const query = focusedAiSearchQuery.trim().toLowerCase();
    if (!query) return focusedAiDialog;
    return focusedAiDialog.filter((message) => message.content.toLowerCase().includes(query));
  }, [focusedAiDialog, focusedAiSearchQuery, isFocusedAiSearchOpen]);

  useLayoutEffect(() => {
    if (!focusedTask) return;
    const textarea = focusedTaskTitleInputRef.current;
    if (!textarea) return;
    const updateTitleRows = () => setFocusedTitleRows(measureTitleTextareaRows(textarea));
    updateTitleRows();
    window.addEventListener('resize', updateTitleRows);
    return () => window.removeEventListener('resize', updateTitleRows);
  }, [focusedTask?.id, focusedDraft?.title, focusedTitleDraft, isEditingFocusedTitle]);

  const filteredGeneralAiMessages = useMemo(() => {
    if (!isGeneralAiSearchOpen) return generalAiMessages;
    const query = generalAiSearchQuery.trim().toLowerCase();
    if (!query) return generalAiMessages;
    return generalAiMessages.filter((message) => message.content.toLowerCase().includes(query));
  }, [generalAiMessages, generalAiSearchQuery, isGeneralAiSearchOpen]);

  const normalizeTaskAiMessages = (messages: ChatMessage[]): TaskAiMessage[] =>
    messages.map((message, index) => ({ id: `${index}-${message.role}-${message.content}`, ...message }));

  useEffect(() => {
    if (!focusedTask) {
      setFocusedSaveError(null);
      setFocusedDraft(null);
      setIsFocusedNotesEditorOpen(false);
      setIsFocusedSettingsOpen(false);
      setIsEditingFocusedTitle(false);
      setFocusedTitleDraft('');
      setFocusedTitleRows(1);
      setIsAddingFocusedSubtask(false);
      setFocusedSubtaskTitle('');
      setIsAiSubtasksPromptOpen(false);
      setAiSubtasksPrompt('');
      setAiDraft('');
      setAiError(null);
      setIsAiExpanded(false);
            setAiPendingFiles([]);
      setFocusedAiSearchQuery('');
      setIsFocusedAiSearchOpen(false);
      setHideClosedFocusedSubtasks(true);
      setFocusedTaskAttachments([]);
      setAiSubtasksLoadingTaskId(null);
      focusedAutosaveSignatureRef.current = null;
      return;
    }
    setFocusedSaveError(null);
    setIsFocusedNotesEditorOpen(false);
    setIsFocusedSettingsOpen(false);
    setIsEditingFocusedTitle(false);
    setFocusedTitleDraft(focusedTask.title ?? '');
    setFocusedTitleRows(1);
    setFocusedDraft({ ...focusedTask, aiNotificationsEnabled: focusedTask.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled });
    setFocusedRecurrenceSummary(focusedTask.recurrenceSummary ?? null);
    if (focusedTask.notifyBeforeMinutes === null) {
      setFocusedNotifyPreset('null');
    } else if ([0, 15, 30, 60, 180].includes(focusedTask.notifyBeforeMinutes ?? 0)) {
      setFocusedNotifyPreset(String(focusedTask.notifyBeforeMinutes ?? 0));
    } else {
      setFocusedNotifyPreset('30');
    }
    focusedAutosaveSignatureRef.current = JSON.stringify(focusedTaskEditableSnapshot(focusedTask, isAiNotificationsDefaultEnabled));
  }, [focusedTask?.id, isAiNotificationsDefaultEnabled]);

  // A task chat AI action updates the server, then load() refreshes focusedTask.
  // Reconcile the editor without overwriting unsaved manual field edits.
  useEffect(() => {
    if (!focusedTask || !focusedDraft || focusedDraft.id !== focusedTask.id || !focusedAutosaveSignatureRef.current) return;
    const baseline = JSON.parse(focusedAutosaveSignatureRef.current) as ReturnType<typeof focusedTaskEditableSnapshot>;
    const remote = focusedTaskEditableSnapshot(focusedTask, isAiNotificationsDefaultEnabled);
    if (JSON.stringify(baseline) === JSON.stringify(remote)) return;
    setFocusedDraft((draft) => {
      if (!draft || draft.id !== focusedTask.id) return draft;
      const local = focusedTaskEditableSnapshot(draft, isAiNotificationsDefaultEnabled);
      return { ...draft, ...mergeRemoteDraftFields(baseline, local, remote, FOCUSED_TASK_EDIT_KEYS) };
    });
    focusedAutosaveSignatureRef.current = JSON.stringify(remote);
    if (!isEditingFocusedTitle) setFocusedTitleDraft(focusedTask.title ?? '');
  }, [focusedTask]);

  useEffect(() => {
    if (!focusedTask || !focusedDraft) return;
    const normalized = {
      ...focusedDraft,
      importance: focusedDraft.importance ?? 3,
      urgency: focusedDraft.urgency ?? 3,
      status: focusedDraft.status ?? 'TODO'
    };
    const snapshot = focusedTaskEditableSnapshot(normalized, isAiNotificationsDefaultEnabled);
    const baseline = focusedAutosaveSignatureRef.current
      ? JSON.parse(focusedAutosaveSignatureRef.current) as typeof snapshot
      : snapshot;
    const patch = changedDraftFields(baseline, snapshot, FOCUSED_TASK_EDIT_KEYS);
    if (Object.keys(patch).length === 0) return;
    if (focusedAutosaveTimeoutRef.current) {
      clearTimeout(focusedAutosaveTimeoutRef.current);
    }
    focusedAutosaveTimeoutRef.current = setTimeout(() => {
      const score = calcScore(normalized.importance, normalized.urgency);
      const priorityChanged = patch.importance !== undefined || patch.urgency !== undefined;
      void api.updateTask(focusedTask.id, { ...patch, ...(priorityChanged ? { priorityScore: score } : {}) }).then((savedTask) => {
        const latestBaseline = focusedAutosaveSignatureRef.current
          ? JSON.parse(focusedAutosaveSignatureRef.current) as typeof snapshot : snapshot;
        focusedAutosaveSignatureRef.current = JSON.stringify({ ...latestBaseline, ...patch });
        // Only server-confirmed values may enter the task list. An optimistic
        // setTasks here is mistaken for a remote update by draft reconciliation
        // and marks the sphere change as saved before the PATCH is sent.
        setTasks((current) => current.map((task) => (
          task.id === savedTask.id ? { ...task, ...savedTask } : task
        )));
        setFocusedSaveError(null);
      }).catch((error) => {
        console.error('[Task] focused autosave failed', error);
        setFocusedSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изменения задачи');
      });
    }, 700);
    return () => {
      if (focusedAutosaveTimeoutRef.current) {
        clearTimeout(focusedAutosaveTimeoutRef.current);
      }
    };
  }, [focusedTask?.id, focusedDraft, isAiNotificationsDefaultEnabled]);

  const flushFocusedTaskSave = async () => {
    if (!focusedTask || !focusedDraft) return false;
    if (focusedAutosaveTimeoutRef.current) {
      clearTimeout(focusedAutosaveTimeoutRef.current);
      focusedAutosaveTimeoutRef.current = null;
    }
    const snapshot = focusedTaskEditableSnapshot(focusedDraft, isAiNotificationsDefaultEnabled);
    const baseline = focusedAutosaveSignatureRef.current
      ? JSON.parse(focusedAutosaveSignatureRef.current) as typeof snapshot
      : snapshot;
    const patch = changedDraftFields(baseline, snapshot, FOCUSED_TASK_EDIT_KEYS);
    // Closing an unchanged form must not overwrite changes made by the AI.
    if (Object.keys(patch).length === 0) return true;
    const priorityChanged = patch.importance !== undefined || patch.urgency !== undefined;
    try {
      await api.updateTask(focusedTask.id, {
        ...patch,
        ...(priorityChanged ? { priorityScore: calcScore(snapshot.importance, snapshot.urgency) } : {})
      });
      focusedAutosaveSignatureRef.current = JSON.stringify({ ...baseline, ...patch });
      setFocusedSaveError(null);
      return true;
    } catch (error) {
      console.error('[Task] focused save failed', error);
      setFocusedSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изменения задачи');
      return false;
    }
  };

  const closeFocusedTask = async () => {
    if (!focusedTask || !focusedDraft) {
      setFocusedTaskId(null);
      return;
    }
    if (!(await flushFocusedTaskSave())) return;
    setFocusedTaskId(null);
    await load();
  };

  const applyFocusedRecurrence = async () => {
    if (!focusedDraft?.isRecurring) return;
    const text = (focusedDraft.recurrenceText ?? '').trim();
    if (!text) return;
    setFocusedRecurrenceLoading(true);
    try {
      const parsed = await api.parseRecurrence({ text });
      setFocusedRecurrenceSummary(parsed.summary);
      setFocusedDraft((p) => (p ? {
        ...p,
        isRecurring: true,
        recurrenceText: text,
        recurrenceJson: parsed.schedule,
        recurrenceSummary: parsed.summary,
        recurrenceUntil: parsed.schedule.until,
        ...(focusedTask?.isCollaborative ? {} : { dueDate: parsed.nextDueDate })
      } : p));
    } finally {
      setFocusedRecurrenceLoading(false);
    }
  };

  useEffect(() => {
    if (!focusedTask) return;
    const loadTaskAttachments = async () => {
      try {
        const attachments = await api.getTaskAttachments(focusedTask.id);
        setFocusedTaskAttachments(attachments);
      } catch {
        setFocusedTaskAttachments([]);
      }
    };
    void loadTaskAttachments();
  }, [focusedTask?.id]);

  useEffect(() => {
    if (!isAddingFocusedSubtask) return;
    focusedSubtaskTitleInputRef.current?.focus();
  }, [isAddingFocusedSubtask]);


  useEffect(() => {
    if (!focusedTask) return;
    const scrollToBottom = (container: HTMLDivElement | null) => {
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    };
    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom(focusedAiDialogContainerRef.current);
      scrollToBottom(expandedAiDialogContainerRef.current);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusedTask?.id, focusedDraft, focusedAiDialog.length, isAiExpanded, aiLoadingTaskId, focusedTask ? aiProgressByTask[focusedTask.id] : undefined]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (generalAiDialogContainerRef.current) {
        generalAiDialogContainerRef.current.scrollTop = generalAiDialogContainerRef.current.scrollHeight;
      }
      if (generalAiFullscreenDialogContainerRef.current) {
        generalAiFullscreenDialogContainerRef.current.scrollTop = generalAiFullscreenDialogContainerRef.current.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [generalAiMessages, generalAiLoading, isGeneralAiFullscreen]);


  useEffect(() => {
    if (!isFocusTimerRunning) return;
    const timer = window.setInterval(() => {
      setFocusRemainingSeconds((prev) => {
        const elapsedSeconds = focusTimerMinutes * 60 - prev + 1;
        const elapsedIntervals = Math.floor(elapsedSeconds / FOCUS_TIME_BONUS_INTERVAL_SECONDS);
        if (elapsedIntervals > awardedFocusTimeIntervalsRef.current) {
          const intervalsToAward = elapsedIntervals - awardedFocusTimeIntervalsRef.current;
          awardedFocusTimeIntervalsRef.current = elapsedIntervals;
          pushFocusBonusMessage('time', FOCUS_TIME_BONUS_DELTA * intervalsToAward);
        }
        if (prev <= 1) {
          setIsFocusTimerRunning(false);
          setIsFocusSessionFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusTimerMinutes, isFocusTimerRunning]);

  useEffect(() => {
    if (isFocusTimerRunning) return;
    if (focusRemainingSeconds === focusTimerMinutes * 60) {
      setFocusRemainingSeconds(focusTimerMinutes * 60);
    }
  }, [focusRemainingSeconds, focusTimerMinutes, isFocusTimerRunning]);

  useEffect(() => {
    if (focusActiveIndex < focusTasks.length) return;
    setFocusActiveIndex(0);
  }, [focusActiveIndex, focusTasks.length]);



  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (focusAiDialogContainerRef.current) {
        focusAiDialogContainerRef.current.scrollTop = focusAiDialogContainerRef.current.scrollHeight;
      }
      if (focusAiExpandedDialogContainerRef.current) {
        focusAiExpandedDialogContainerRef.current.scrollTop = focusAiExpandedDialogContainerRef.current.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusActiveTask?.id, focusTaskAiDialog.length, focusAiLoading, focusAiProgress, isFocusModeOpen, isFocusAiExpanded]);

  useEffect(() => {
    // Switching tasks only changes the selected task and its existing dialog.
    // Never manufacture a new AI message merely because focus selection moved.
    if (isFocusModeOpen && focusActiveTask) previousFocusActiveTaskIdRef.current = focusActiveTask.id;
    setReplyToFocusAi(null);
    setFocusAiDraft('');
    setFocusAiPendingFiles([]);
    setFocusAiError(null);
    setIsFocusAiSearchOpen(false);
    setFocusAiSearchQuery('');
  }, [isFocusModeOpen, focusActiveTask?.id]);

  const sendFocusedAiQuestion = async (options?: {
    questionOverride?: string;
    userContentOverride?: string;
    modelOverride?: AiChatModel;
  }) => {
    if (!focusedTask) return;
    const question = options?.questionOverride?.trim() ?? aiDraft.trim();
    const selectedRecipientUserId = getTaskAiRecipientId(focusedTask);
    if (selectedRecipientUserId !== 'ai') {
      if (!question) return;
      if (aiPendingFiles.length > 0) {
        setAiError('Вложения можно отправлять только ИИ. Для сообщения участнику оставьте только текст.');
        return;
      }
      setAiLoadingTaskId(focusedTask.id);
      setAiError(null);
      try {
        const directMessage = await api.sendTaskParticipantMessage(focusedTask.id, { recipientUserId: selectedRecipientUserId, content: question }) as TaskAiMessage;
        setAiDialogByTask((prev) => ({ ...prev, [focusedTask.id]: [...(prev[focusedTask.id] ?? []), directMessage] }));
        setAiDraft('');
      } catch (error) {
        setAiError(error instanceof Error ? error.message : 'Не удалось отправить сообщение участнику');
      } finally {
        setAiLoadingTaskId(null);
      }
      return;
    }
    if (!question && aiPendingFiles.length === 0) return;

    const fileNames = aiPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiPendingFiles.map((file) => fileToAttachmentPayload(file, true)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось прочитать приложенный файл';
      setAiError(message);
      return;
    }

    const taskId = focusedTask.id;
    const previousDialog = aiDialogByTask[taskId] ?? [];
    const baseUserContent = options?.userContentOverride?.trim() || question;
    const userContent = serializeAiReply(fileNames.length > 0
      ? `${baseUserContent || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : baseUserContent, options?.questionOverride ? null : replyToAiTask);
    const clientRequestId = crypto.randomUUID();
    const attachmentPreviews = await makeAiAttachmentPreviews(aiPendingFiles);
    const nextDialog = [...previousDialog, { id: clientRequestId, role: 'user' as const, content: userContent, attachmentPreviews, ...(focusedTask.isCollaborative ? { authorName: currentUser?.name || currentUser?.username || 'Вы', authorColor: focusedTask.collaborationColor } : {}) }];
    setAiDialogByTask((prev) => ({ ...prev, [taskId]: nextDialog }));
    setReplyToAiTask(null);
    setAiDraft('');
    setTaskAiUploadProgress(null);
    setAiError(null);
    setAiLoadingTaskId(taskId);
    setAiPendingFiles([]); // Attachment bytes already captured for the outgoing message.
    setAiProgressByTask((current) => ({ ...current, [taskId]: 'analyzing_request' }));

    try {
      const result = await askTaskAssistant(taskId, {
        clientRequestId,
        question: serializeAiReply(question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.', options?.questionOverride ? null : replyToAiTask),
        userMessage: userContent,
        model: options?.modelOverride ?? focusedAiModel,
        attachments: attachmentsPayload
      }, (status) => setAiProgressByTask((current) => ({ ...current, [taskId]: status })), setTaskAiUploadProgress);
      const actionSummary = (result.actionReports?.length ?? 0) > 0
        ? `\n\nИзменения:\n- ${result.actionReports!.join('\n- ')}`
        : '';
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { id: crypto.randomUUID(), role: 'assistant', content: `${result.answer}${actionSummary}`, creditsSpentMilli: result.billing?.creditsSpentMilli, webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations, generatedDocument: result.generatedDocument ?? undefined, telegramSendDraft: result.telegramSendDraft ?? undefined, taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined }]
      }));
      try {
        await load();
      } catch (loadError) {
        console.error('[AI task chat] refresh after send failed', loadError);
      }
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number' ? Number((error as { status?: number }).status) : null;
      const message = status === 402 || (error instanceof Error && error.message === INSUFFICIENT_AI_CREDITS_MESSAGE)
        ? INSUFFICIENT_AI_CREDITS_MESSAGE
        : error instanceof Error && error.message.trim()
          ? error.message.slice(0, 400)
          : 'Ошибка отправки сообщения. Попробуйте ещё раз.';
      console.error('[AI task chat] send failed', error);
      setAiError(message);
      // Keep the original upload and prompt ready to retry. The server has
      // already rejected the request, so do not silently drop the attachment.
      setAiDraft((current) => current.trim() ? current : question);
      setAiPendingFiles((current) => current.length ? current : aiPendingFiles);
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { id: crypto.randomUUID(), role: 'assistant', content: message }]
      }));
    } finally {
      setAiLoadingTaskId(null);
      setTaskAiUploadProgress(null);
      setAiProgressByTask((current) => { const next = { ...current }; delete next[taskId]; return next; });
    }
  };

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const fileToAttachmentPayload = async (file: File, forAiChat = false): Promise<ChatAttachmentPayload> => {
    const source = forAiChat ? await prepareAiChatImageFile(file) : file;
    return {
      name: source.name,
      mimeType: resolveAttachmentMimeType(source),
      size: source.size,
      contentBase64: await toBase64(source)
    };
  };

  const addFocusedAiFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    if (focusedTask && getTaskAiRecipientId(focusedTask) !== 'ai') {
      setAiError('Вложения можно отправлять только ИИ. Сначала выберите получателем ИИ.');
      return;
    }

    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) {
      setAiError('Можно прикреплять PDF, DOCX, XLS/XLSX, TXT и изображения (PNG/JPG/WEBP/GIF).');
    }

    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setAiError(`Файл ${oversized.name} превышает лимит 8MB.`);
      return;
    }

    setAiPendingFiles((prev) => {
      const merged = [...prev, ...normalized];
      if (merged.length > MAX_AI_ATTACHMENTS) {
        setAiError(`Можно прикрепить максимум ${MAX_AI_ATTACHMENTS} файла.`);
        return merged.slice(0, MAX_AI_ATTACHMENTS);
      }
      return merged;
    });
  };

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    addFocusedAiFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const addAiChatFiles = (files: File[]) => {
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) { setAiChatError(`Файл ${oversized.name} превышает лимит 8MB.`); return; }
    if (normalized.length !== files.length) setAiChatError('Можно прикреплять PDF, DOCX, XLS/XLSX, TXT и изображения.');
    setAiChatPendingFiles((previous) => [...previous, ...normalized].slice(0, MAX_AI_ATTACHMENTS));
  };

  const uploadFocusedTaskFiles = async (files: File[]) => {
    if (!focusedTask || files.length === 0) return;
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== files.length) {
      setAiError('Для задачи можно прикреплять только PDF, DOCX, XLS/XLSX, TXT и изображения.');
    }
    if (normalized.length === 0) return;

    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setAiError(`Файл ${oversized.name} превышает лимит 8MB.`);
      return;
    }

    setIsUploadingTaskAttachment(true);
    try {
      for (const file of normalized) {
        await api.createTaskAttachment(focusedTask.id, await fileToAttachmentPayload(file));
      }
      const next = await api.getTaskAttachments(focusedTask.id);
      setFocusedTaskAttachments(next);
      await load();
      setAiError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить файл к задаче';
      setAiError(message);
    } finally {
      setIsUploadingTaskAttachment(false);
      setIsTaskAttachmentDragActive(false);
    }
  };

  const handleTaskAttachmentFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    void uploadFocusedTaskFiles(selectedFiles);
    event.target.value = '';
  };

  const removeTaskAttachment = async (attachmentId: string) => {
    if (!focusedTask) return;
    try {
      await api.deleteTaskAttachment(focusedTask.id, attachmentId);
      setFocusedTaskAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить файл';
      setAiError(message);
    }
  };

  const downloadTaskAttachment = (attachment: TaskAttachment) => {
    if (!focusedTask) return;
    const url = api.getTaskAttachmentDownloadUrl(focusedTask.id, attachment.id);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removePendingAiFile = (fileName: string) => {
    setAiPendingFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const [clearingTaskAiId, setClearingTaskAiId] = useState<string | null>(null);
  const clearTaskAiDialog = async (taskId: string) => {
    if (!taskId || aiLoadingTaskId === taskId || clearingTaskAiId) return;
    if (!window.confirm('Очистить историю переписки с ИИ по этой задаче? Действие необратимо.')) return;
    setClearingTaskAiId(taskId);
    taskAiClearRevisionRef.current[taskId] = (taskAiClearRevisionRef.current[taskId] ?? 0) + 1;
    try {
      await api.clearTaskAssistantHistory(taskId);
      loadedAiHistoryTaskIdsRef.current.delete(taskId);
      setAiDialogByTask(prev => ({ ...prev, [taskId]: [] }));
      setReplyToAiTask(null);
      setReplyToFocusAi(null);
      setAiError(null);
      setFocusAiError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось очистить диалог.';
      setAiError(message);
      setFocusAiError(message);
    } finally { setClearingTaskAiId(null); }
  };
  const clearFocusedAiDialog = async () => {
    if (focusedTask) await clearTaskAiDialog(focusedTask.id);
  };

  const formatFocusTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  };

  const buildFocusTaskContext = (task: Task) => {
    const children = (subtaskMap[task.id] ?? []).filter((subtask) => subtask.status !== 'DONE');
    return [
      `Задача: [${task.id}] ${task.title}`,
      `Описание: ${task.description?.trim() || 'нет описания'}`,
      `Срочность: ${task.urgency ?? 3}/5, важность: ${task.importance ?? 3}/5, коэффициент: ${getTaskCoefficient(task).toFixed(2)}`,
      `Активные подзадачи: ${children.length > 0 ? children.map((item) => `• [${item.id}] ${item.title}`).join('; ') : 'нет'}`
    ].join('\n');
  };

  const openFocusSetup = () => {
    setFocusSelectedTaskIds((prev) => prev.length === 3 ? prev : visibleFocusCandidateTasks.slice(0, 3).map((task) => task.id));
    setIsFocusSetupOpen(true);
  };

  const handleFocusTimerMinutesChange = (minutes: number) => {
    setFocusTimerMinutes(minutes);
    if (!isFocusTimerRunning) {
      setFocusRemainingSeconds(minutes * 60);
      setIsFocusSessionFinished(false);
    }
  };

  useEffect(() => {
    if (!focusBonusStorageKey) {
      setLoadedFocusBonusStorageKey(null);
      setFocusBonusTotal(0);
      return;
    }
    const saved = Number(localStorage.getItem(focusBonusStorageKey) ?? 0);
    setFocusBonusTotal(Number.isFinite(saved) && saved > 0 ? saved : 0);
    setLoadedFocusBonusStorageKey(focusBonusStorageKey);
  }, [focusBonusStorageKey]);

  useEffect(() => {
    if (!focusBonusStorageKey || loadedFocusBonusStorageKey !== focusBonusStorageKey) return;
    localStorage.setItem(focusBonusStorageKey, String(focusBonusTotal));
  }, [focusBonusStorageKey, focusBonusTotal, loadedFocusBonusStorageKey]);

  const startFocusSession = (ids: string[]) => {
    const selected = ids.slice(0, FOCUS_MAX_TASKS);
    if (selected.length < FOCUS_MIN_TASKS) return;
    setFocusSelectedTaskIds(selected);
    setFocusActiveIndex(0);
    setFocusAiError(null);
    setFocusSessionInitialDoneSubtaskIds(new Set(subtasks.filter((task) => task.status === 'DONE').map((task) => task.id)));
    setFocusSessionAiRequestCount(0);
    setFocusBonusEvents({ ai: null, subtask: null, task: null, time: null });
    setIsFocusSessionFinished(false);
    setFocusAiPendingFiles([]);
    setIsFocusAiExpanded(false);
    previousFocusActiveTaskIdRef.current = selected[0] ?? null;
    awardedFocusTimeIntervalsRef.current = 0;
    if (focusTaskSwitchAiTimeoutRef.current) {
      clearTimeout(focusTaskSwitchAiTimeoutRef.current);
      focusTaskSwitchAiTimeoutRef.current = null;
    }
    setIsFocusSetupOpen(false);
    setIsFocusModeOpen(true);
  };

  const toggleFocusTaskSelection = (taskId: string) => {
    setFocusSelectedTaskIds((prev) => {
      if (prev.includes(taskId)) return prev.filter((id) => id !== taskId);
      if (prev.length >= FOCUS_MAX_TASKS) return prev;
      return [...prev, taskId];
    });
  };

  const switchFocusTask = (direction: -1 | 1) => {
    if (focusTasks.length === 0) return;
    setFocusActiveIndex((prev) => (prev + direction + focusTasks.length) % focusTasks.length);
  };

  const finishFocusSession = () => {
    setIsFocusTimerRunning(false);
    setIsFocusSessionFinished(true);
  };

  const stopFocusTimer = () => {
    finishFocusSession();
  };


  const isFocusBonusEligible = (taskId?: string | null) => Boolean(taskId && isFocusModeOpen && isFocusTimerRunning && focusSelectedTaskIds.includes(taskId));

  const shouldWarnAboutFocusDistraction = (task: Task) => {
    const rootTaskId = task.parentTaskId ?? task.id;
    return isFocusTimerRunning
      && !isFocusModeOpen
      && !isFocusSessionFinished
      && !focusSelectedTaskIds.includes(rootTaskId);
  };

  const openTaskWithFocusGuard = (task: Task) => {
    if (task.taskType === 'REMINDER') return;
    if (shouldWarnAboutFocusDistraction(task)) {
      setFocusDistractionTaskId(task.id);
      return;
    }
    if (task.taskType === 'EVENT' || task.parentTaskId) setEditorState({ task });
    else setFocusedTaskId(task.id);
  };

  const openTaskReferenceFromAi = (task: Task) => {
    if (task.taskType === 'REMINDER') return;
    if (task.parentTaskId) {
      setEditorState({ task });
      return;
    }
    setFocusedTaskId(task.id);
  };

  const persistEfficiencyBonus = async (delta: number, bucket: 'task' | 'habit' | 'ai' | 'focus') => {
    if (!currentUser || delta <= 0) return;
    try {
      const result = await api.recordEfficiencyEvent({ delta, bucket });
      setCurrentUser((prev) => prev ? { ...prev, ...result } : prev);
    } catch (error) {
      console.error('Failed to persist efficiency bonus', error);
    }
  };

  const pushFocusBonusMessage = (type: FocusBonusType, delta: number) => {
    void persistEfficiencyBonus(delta, 'focus');
    setFocusBonusTotal((total) => total + delta);
    setFocusBonusEvents((prev) => {
      const totalDelta = (prev[type]?.totalDelta ?? 0) + delta;
      const formattedTotal = totalDelta.toFixed(1).replace(/\.0$/, '');
      const variants: Record<FocusBonusType, string[]> = {
      ai: [
        `+${formattedTotal} рейтинга за точные запросы к ИИ — ускоряемся красиво!`,
        `ИИ подключён к фокусу: уже +${formattedTotal} рейтинга. Отличный ход!`,
        `Умная помощь в работе принесла суммарно +${formattedTotal} рейтинга — держим темп!`
      ],
      subtask: [
        `Отлично, закрываем подзадачи! Уже +${formattedTotal} рейтинга. Продолжаем работу.`,
        `Минус один шаг к цели — суммарно +${formattedTotal} рейтинга за подзадачи!`,
        `Фокус даёт результат: подзадачи приносят уже +${formattedTotal} рейтинга.`
      ],
      task: [
        `Сильное завершение: задачи выполнены! Уже +${formattedTotal} рейтинга в копилку.`,
        `Большая победа в фокусе — суммарно +${formattedTotal} рейтинга за закрытые задачи!`,
        `Задачи закрываются, прогресс сияет: +${formattedTotal} рейтинга.`
      ],
      time: [
        `Таймер работает на вас: уже +${formattedTotal} рейтинга за время в фокусе.`,
        `Пять минут глубокой работы засчитаны — суммарно +${formattedTotal} рейтинга за фокус-время!`,
        `Ритм держится красиво: время концентрации принесло уже +${formattedTotal} рейтинга.`
      ]
      };
      const pool = variants[type];
      const message = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
      return { ...prev, [type]: { id: crypto.randomUUID(), type, delta, totalDelta, message, atMs: Date.now() } };
    });
  };

  // Focus is only another view of the selected task's existing AI chat.
  // No separate model history or multi-task prompt is generated here.
  const sendFocusAiQuestion = async (options?: {
    questionOverride?: string; userContentOverride?: string; allowBeforeTimerStateUpdate?: boolean;
  }) => {
    const task = focusActiveTask;
    if (!task || focusAiLoading || aiLoadingTaskId === task.id) return;
    const question = (options?.questionOverride ?? focusAiDraft).trim();
    if (!question && focusAiPendingFiles.length === 0) return;
    const taskId = task.id;
    // Collaborative focus chat uses the task's existing recipient selector,
    // just like Help AI. Never send a message addressed to a person to AI.
    const recipientUserId = getTaskAiRecipientId(task);
    if (recipientUserId !== 'ai') {
      if (focusAiPendingFiles.length > 0) {
        setFocusAiError('Вложения доступны только для сообщений ИИ.');
        return;
      }
      setFocusAiLoading(true);
      try {
        const sent = await api.sendTaskParticipantMessage(taskId, { recipientUserId, content: question }) as TaskAiMessage;
        setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), sent] }));
        setFocusAiDraft('');
        setFocusAiError(null);
      } catch (error) {
        setFocusAiError(error instanceof Error ? error.message : 'Не удалось отправить сообщение участнику');
      } finally { setFocusAiLoading(false); }
      return;
    }
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(focusAiPendingFiles.map(file => fileToAttachmentPayload(file, true)));
    } catch (error) {
      setFocusAiError(error instanceof Error ? error.message : 'Не удалось прочитать файл');
      return;
    }
    const fileNames = focusAiPendingFiles.map(file => file.name);
    const visibleText = options?.userContentOverride?.trim() || question || 'Сообщение с вложением';
    const userContent = serializeAiReply(fileNames.length
      ? `${visibleText}\n\n📎 Файлы: ${fileNames.join(', ')}` : visibleText, replyToFocusAi);
    const id = crypto.randomUUID();
    const attachmentPreviews = await makeAiAttachmentPreviews(focusAiPendingFiles);
    setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []),
      { id, role: 'user', content: userContent, attachmentPreviews }] }));
    setReplyToFocusAi(null);
    setFocusAiDraft('');
    setFocusAiError(null);
    setFocusAiPendingFiles([]);
    setFocusAiLoading(true);
    setAiLoadingTaskId(taskId);
    setFocusAiProgress('analyzing_request');
    setAiProgressByTask(prev => ({ ...prev, [taskId]: 'analyzing_request' }));
    setFocusSessionAiRequestCount(count => count + 1);
    try {
      const result = await askTaskAssistant(taskId, {
        clientRequestId: id, question: serializeAiReply(question || visibleText, replyToFocusAi),
        userMessage: userContent, model: aiModelByTask[taskId] ?? 'gpt-5.4-mini',
        attachments: attachmentsPayload, skipEfficiencyBonus: true
      }, status => {
        setFocusAiProgress(status);
        setAiProgressByTask(prev => ({ ...prev, [taskId]: status }));
      }, setFocusAiUploadProgress);
      setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), {
        id: crypto.randomUUID(), role: 'assistant', content: result.answer,
        creditsSpentMilli: result.billing?.creditsSpentMilli, webSearchUsed: result.webSearchUsed,
        webSources: result.webSources, webCitations: result.webCitations,
        generatedDocument: result.generatedDocument ?? undefined,
        telegramSendDraft: result.telegramSendDraft ?? undefined,
        taskProposal: result.taskProposal ?? undefined,
        telegramReadDraft: result.telegramReadDraft ?? undefined
      }] }));
      await refreshAiCredits();
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
      if (previousFocusActiveTaskIdRef.current === taskId) {
        setFocusAiError(message);
        setFocusAiDraft(previous => previous.trim() ? previous : question);
        // Retain uploads for retry only while this same task stays active.
        setFocusAiPendingFiles((current) => current.length ? current : focusAiPendingFiles);
      }
      setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []),
        { id: crypto.randomUUID(), role: 'assistant', content: message }] }));
    } finally {
      setFocusAiLoading(false);
      setAiLoadingTaskId(null);
      setFocusAiProgress(null);
      setFocusAiUploadProgress(null);
      setAiProgressByTask(prev => { const next = { ...prev }; delete next[taskId]; return next; });
    }
  };

  const handleFocusAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif|txt)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setFocusAiError('Можно прикреплять PDF, DOCX, XLS/XLSX, TXT и изображения (PNG/JPG/WEBP/GIF).');
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setFocusAiError(`Файл ${oversized.name} превышает лимит 8MB.`);
      event.target.value = '';
      return;
    }
    setFocusAiPendingFiles((prev) => {
      const merged = [...prev, ...normalized];
      if (merged.length > MAX_AI_ATTACHMENTS) {
        setFocusAiError(`Можно прикрепить максимум ${MAX_AI_ATTACHMENTS} файла.`);
        return merged.slice(0, MAX_AI_ATTACHMENTS);
      }
      return merged;
    });
    event.target.value = '';
  };

  const addFocusAiClipboardImages = (files: File[]) => {
    const valid = files.filter(file => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name));
    const oversized = valid.find(file => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) { setFocusAiError(`Файл ${oversized.name} превышает лимит 8MB.`); return; }
    if (valid.length !== files.length) setFocusAiError('Разрешены изображения PNG/JPEG/WEBP/GIF.');
    setFocusAiPendingFiles(previous => {
      if (previous.length + valid.length > MAX_AI_ATTACHMENTS) setFocusAiError(`Максимум ${MAX_AI_ATTACHMENTS} файла.`);
      return [...previous, ...valid].slice(0, MAX_AI_ATTACHMENTS);
    });
  };

  const removeFocusAiPendingFile = (fileName: string) => {
    setFocusAiPendingFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const startFocusTimer = () => {
    if (focusRemainingSeconds <= 0) setFocusRemainingSeconds(focusTimerMinutes * 60);
    setIsFocusSessionFinished(false);
    if (focusActiveTask) previousFocusActiveTaskIdRef.current = focusActiveTask.id;
    setIsFocusTimerRunning(true);

  };

  const activeAiChatProject = aiChatProjects.find((project) => project.id === activeAiChatProjectId) ?? aiChatProjects[0];
  const activeAiChat = activeAiChatProject?.chats.find((chat) => chat.id === activeAiChatId) ?? activeAiChatProject?.chats[0];
  const activeProjectChatModel = readSavedAiChatModel(activeAiChat?.model) ?? DEFAULT_WEB_PROJECT_CHAT_MODEL;
  const changeProjectChatModel = (model: AiChatModel) => {
    if (!activeAiChatProject?.id || !activeAiChat?.id || activeAiChat.id === QUICK_AI_CHAT_ID) return;
    const projectId = activeAiChatProject.id, chatId = activeAiChat.id;
    setAiChatProjects(previous => previous.map(project => project.id !== projectId ? project : {
      ...project, chats: project.chats.map(chat => chat.id !== chatId ? chat
        : { ...chat, model, modelChangedAt: new Date().toISOString() })
    }));
  };
  useEffect(() => {
    if (activeAiChatId === QUICK_AI_CHAT_ID) setQuickAiChatModel(DEFAULT_QUICK_AI_CHAT_MODEL);
  }, [activeAiChatId, isAiChatOpen]);
  const quickAiChatMessages = aiChatProjects[0]?.chats.find((chat) => chat.id === QUICK_AI_CHAT_ID)?.messages ?? [];
  const quickAiChatTimeline = useMemo(() => [
    ...quickAiChatMessages.map((message, index) => ({ kind: 'message' as const, timestamp: message.createdAt ? new Date(message.createdAt).getTime() : index, message })),
    ...systemNotifications.filter(notification => !notification.eventKey?.startsWith('monitoring:')).map((notification) => ({ kind: 'notification' as const, timestamp: new Date(notification.createdAt).getTime(), notification }))
  ].sort((left, right) => left.timestamp - right.timestamp), [quickAiChatMessages, systemNotifications]);

  const openSystemNotification = (notification: SystemNotification) => {
    const eventKey = notification.eventKey ?? '';
    if (eventKey.startsWith('monitoring:') && notification.taskId) {
      const target = tasks.find(task => task.id === notification.taskId);
      if (target) {
        setIsAiChatOpen(false);
        setFocusedTaskId(target.id);
        setIsAiExpanded(true);
        return;
      }
    }
    const telegramKey = eventKey.startsWith('telegram-ai-task:')
      ? eventKey.slice('telegram-ai-task:'.length)
      : eventKey;
    const telegramEventPrefix = ['telegram-ai-summary:', 'telegram-ai-tasks:']
      .find(prefix => telegramKey.startsWith(prefix));
    if (telegramEventPrefix) {
      const remainder = telegramKey.slice(telegramEventPrefix.length);
      const separator = remainder.lastIndexOf(':');
      if (separator > 0) {
        const policyId = remainder.slice(0, separator);
        setActiveAiChatProjectId(TELEGRAM_AI_MANAGED_PROJECT_ID);
        setActiveAiChatId(TELEGRAM_AI_MANAGED_CHAT_PREFIX + policyId);
        setIsAiChatOpen(true);
        return;
      }
    }
    setActiveAiChatProjectId(aiChatProjects[0]?.id ?? '');
    setActiveAiChatId(QUICK_AI_CHAT_ID);
    setIsAiChatOpen(true);
  };

  const requestBrowserNotifications = async () => {
    // The native permission dialog needs a direct user gesture.
    const status = await requestBrowserNotificationPermission();
    setBrowserPermission(status);
    setBrowserPermissionNudgeDismissed(true);
    if (currentUser) sessionStorage.setItem('btm:browser-permission-nudge:' + currentUser.id, 'dismissed');
  };

  useEffect(() => {
    const update = () => setBrowserPermission(browserNotificationPermission());
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    setBrowserPermission(browserNotificationPermission());
    setBrowserPermissionNudgeDismissed(
      sessionStorage.getItem('btm:browser-permission-nudge:' + currentUser.id) === 'dismissed'
    );
  }, [currentUser?.id]);

  const deliverBrowserSystemNotifications = (notifications: SystemNotification[]) => {
    if (!currentUser?.id || !browserNotificationsEnabledRef.current ||
        document.visibilityState !== 'hidden') return;
    for (const notification of notifications) {
      if (notification.readAt != null) continue;
      void showBrowserSystemNotification(currentUser.id, notification, () => openSystemNotification(notification));
    }
  };

  const markSystemNotificationsRead = () => {
    if (unreadSystemNotificationCount === 0) return;
    setUnreadSystemNotificationCount(0);
    setSystemNotifications((notifications) => notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    void api.markSystemNotificationsRead().catch((error) => console.error('[System notifications] mark read failed', error));
  };

  const refreshSystemNotifications = async () => {
    try {
      const result = await api.getSystemNotifications();
      const visibleNotifications = result.notifications;
      const newNotifications = visibleNotifications.filter(notification => !knownSystemNotificationIdsRef.current.has(notification.id));
      const newestUnseen = [...newNotifications].reverse()[0];
      result.notifications.forEach((notification) => knownSystemNotificationIdsRef.current.add(notification.id));
      setSystemNotifications(visibleNotifications);
      // Monitoring notifications are badge-only: they do not duplicate the real AI message.
      setUnreadSystemNotificationCount(result.notifications.filter(notification => notification.readAt == null).length);
      deliverBrowserSystemNotifications(newNotifications);
      if (newestUnseen && newestUnseen.readAt == null && document.visibilityState === 'visible') setSystemNotificationToast(newestUnseen);
    } catch (error) {
      console.error('[System notifications] refresh failed', error);
    }
  };

  useEffect(() => {
    if (!isAiChatOpen || (activeAiChat?.id !== QUICK_AI_CHAT_ID && !activeAiChat?.id.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX))) return;
    markSystemNotificationsRead();
  }, [isAiChatOpen, activeAiChat?.id, unreadSystemNotificationCount]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let toastTimer: number | null = null;
    let baselineLoaded = false;
    const loadNotifications = async () => {
      try {
        const result = await api.getSystemNotifications();
        if (cancelled) return;
        const visibleNotifications = result.notifications;
      const newNotifications = visibleNotifications.filter(notification => !knownSystemNotificationIdsRef.current.has(notification.id));
        const newestUnseen = [...newNotifications].reverse()[0];
        result.notifications.forEach((notification) => knownSystemNotificationIdsRef.current.add(notification.id));
        setSystemNotifications(visibleNotifications);
        // Monitoring notifications are badge-only: they do not duplicate the real AI message.
      setUnreadSystemNotificationCount(result.notifications.filter(notification => notification.readAt == null).length);
        // The first load is a baseline: never produce a pile of historical OS alerts.
        if (baselineLoaded) deliverBrowserSystemNotifications(newNotifications);
        baselineLoaded = true;
        if (newestUnseen && newestUnseen.readAt == null && document.visibilityState === 'visible') {
          setSystemNotificationToast(newestUnseen);
          if (toastTimer !== null) window.clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setSystemNotificationToast(null), 5000);
        }
      } catch (error) {
        console.error('[System notifications] load failed', error);
      }
    };
    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (toastTimer !== null) window.clearTimeout(toastTimer);
      knownSystemNotificationIdsRef.current.clear();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const refresh = () => { void load().catch(() => undefined); };
    window.addEventListener(proposalAppliedEvent, refresh);
    return () => window.removeEventListener(proposalAppliedEvent, refresh);
  }, []);

  useEffect(() => {
    const persistableProjects = stripAiChatProjectDisplayPreviews(aiChatProjects);
    persistAiChatProjectsCache(localStorage, 'btm:ai-chat-projects', persistableProjects);
    const quickChatMessages = aiChatProjects[0]?.chats.find((chat) => chat.id === QUICK_AI_CHAT_ID)?.messages ?? [];
    try {
      localStorage.setItem(QUICK_AI_CHAT_STORAGE_KEY, JSON.stringify(stripAiChatDisplayPreviews(quickChatMessages).slice(-20)));
    } catch {
      // Full browser storage must not crash the AI chat or its consent cards.
    }
    const snapshot = JSON.stringify(persistableProjects);
    if (aiChatProjectsSyncReadyRef.current && aiChatProjectsRemoteSnapshotRef.current !== snapshot) {
      if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
      aiChatProjectsSaveTimerRef.current = window.setTimeout(() => {
        aiChatProjectsSaveTimerRef.current = null;
        aiChatProjectsSaveInFlightRef.current = true;
        void api.saveAiChatProjects(persistableProjects)
          .then(() => { aiChatProjectsRemoteSnapshotRef.current = snapshot; })
          .catch((error) => console.error('[AI chat] sync failed', error))
          .finally(() => { aiChatProjectsSaveInFlightRef.current = false; });
      }, 400);
    }
    return () => {
      if (aiChatProjectsSaveTimerRef.current !== null) window.clearTimeout(aiChatProjectsSaveTimerRef.current);
    };
  }, [aiChatProjects]);

  // Same pattern as the existing task-AI chats: fetch the currently open
  // conversation only, compare messages and leave all other UI state alone.
  useEffect(() => {
    if (!currentUser?.id || (!isAiChatOpen && !quickAiPreviewHovered)) return;
    const projectId = isAiChatOpen ? activeAiChatProject?.id : aiChatProjects[0]?.id;
    const chatId = isAiChatOpen ? activeAiChat?.id : QUICK_AI_CHAT_ID;
    if (!projectId || !chatId) return;
    let alive = true;
    const refresh = async () => {
      if (!alive || aiChatLoading || aiChatProjectsPollingRef.current ||
          aiChatProjectsSaveTimerRef.current !== null || aiChatProjectsSaveInFlightRef.current ||
          document.visibilityState === 'hidden') return;
      aiChatProjectsPollingRef.current = true;
      try {
        if (chatId.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX)) {
          const inbox = await api.telegramAssistantInbox();
          if (!alive) return;
          setAiChatProjects(previous => {
            const updated = mergeTelegramAiInbox(previous, inbox);
            if (JSON.stringify(updated) === JSON.stringify(previous)) return previous;
            aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(updated);
            return updated;
          });
          return;
        }
        const { messages, projectsOutline } = await api.getAiChatThreadMessages(projectId, chatId);
        if (!alive || aiChatLoading || aiChatProjectsSaveTimerRef.current !== null ||
            aiChatProjectsSaveInFlightRef.current) return;
        const remote: AiChatMessage[] = messages
          .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
          .map((message, index) => ({ ...message, id: message.id ?? `${index}-${message.role}-${message.content}` }));
        setAiChatProjects(previous => {
          const outlined = reconcileAiChatProjectOutline(previous, projectsOutline);
          const project = outlined.find(item => item.id === projectId);
          const chat = project?.chats.find(item => item.id === chatId);
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
          const updated = outlined.map(item => item.id !== projectId ? item : {
            ...item, chats: item.chats.map(thread =>
              thread.id === chatId ? { ...thread, messages: merged } : thread)
          });
          aiChatProjectsRemoteSnapshotRef.current = JSON.stringify(updated);
          return updated;
        });
      } catch (error) {
        console.warn('[AI chat] active conversation refresh failed', error);
      } finally {
        aiChatProjectsPollingRef.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('telegram-ai-assistant-updated', focus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('telegram-ai-assistant-updated', focus);
    };
  }, [currentUser?.id, isAiChatOpen, quickAiPreviewHovered, activeAiChatProject?.id, activeAiChat?.id,
      aiChatProjects[0]?.id, aiChatLoading]);

  const scrollQuickAiChatToBottom = () => {
    const container = quickAiChatDialogContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  };

  const scheduleQuickAiChatScrollToBottom = () => {
    window.requestAnimationFrame(scrollQuickAiChatToBottom);
  };

  useLayoutEffect(() => {
    if (!quickAiFollowBottomRef.current) return;
    scrollQuickAiChatToBottom();
    const frameId = window.requestAnimationFrame(scrollQuickAiChatToBottom);
    return () => window.cancelAnimationFrame(frameId);
  }, [quickAiChatMessages.length, systemNotifications.length, aiChatLoading, aiChatProgress]);

  useEffect(() => {
    const content = quickAiContentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (quickAiFollowBottomRef.current) scrollQuickAiChatToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const updateActiveAiChatMessages = (updater: (messages: AiChatMessage[]) => AiChatMessage[]) => {
    setAiChatProjects((prev) => prev.map((project) => project.id !== activeAiChatProject?.id ? project : {
      ...project,
      chats: project.chats.map((chat) => chat.id !== activeAiChat?.id ? chat : { ...chat, messages: updater(chat.messages) })
    }));
  };

  const sendAiChatQuestion = async (quick = false, expandedDraft = '') => {
    const question = (quick ? quickAiChatDraft : expandedDraft).trim();
    const pendingFiles = quick ? quickAiPendingFiles : aiChatPendingFiles;
    if ((!question && pendingFiles.length === 0) || aiChatLoading) return;
    const fileNames = pendingFiles.map((file) => file.name);
    const replyTarget = quick ? replyToQuickAi : replyToAiChat;
    const userContent = serializeAiReply(fileNames.length ? `${question || 'Сообщение с вложением'}\n\n📎 Файлы: ${fileNames.join(', ')}` : question, replyTarget);
    const attachmentPreviews = await makeAiAttachmentPreviews(pendingFiles);
    const userMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent, createdAt: new Date().toISOString(), attachmentPreviews };
    if (quick) setReplyToQuickAi(null);
    else setReplyToAiChat(null);
    const history = quick
      ? orderAiChatMessagesChronologically(quickAiChatMessages.filter(message => !message.monitoringTaskId)).slice(-20)
      : (activeAiChat?.messages ?? []);
    if (quick) {
      quickAiFollowBottomRef.current = true;
      setAiChatProjects((prev) => prev.map((project, projectIndex) => projectIndex === 0 ? { ...project, chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: [...chat.messages, userMessage].slice(-20) } : chat) } : project));
      setQuickAiChatDraft('');
    } else {
      updateActiveAiChatMessages((messages) => [...messages, userMessage]);
    }
    setAiChatUploadProgress(null);
    setAiChatLoading(true);
    if (quick) setQuickAiChatLoading(true);
    setAiChatError(null);
    try {
      const attachments = await Promise.all(pendingFiles.map((file) => fileToAttachmentPayload(file, true)));
      // The files now belong to the sent message; free the composer immediately,
      // not after the model finishes answering (which left a 100% upload ring).
      if (quick) setQuickAiPendingFiles([]);
      else setAiChatPendingFiles([]);
      setAiChatProgress('analyzing_request');
      const result = await api.askAiChatStreaming({
        clientRequestId: userMessage.id,
        question: serializeAiReply(question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.', replyTarget),
        history,
        model: quick ? DEFAULT_QUICK_AI_CHAT_MODEL : activeAiChat?.id === QUICK_AI_CHAT_ID ? quickAiChatModel : activeProjectChatModel,
        projectTitle: quick ? QUICK_AI_CHAT_PROJECT_TITLE : activeAiChatProject?.title,
        chatTitle: quick ? QUICK_AI_CHAT_TITLE : activeAiChat?.title,
        projectId: activeAiChatProject?.id,
        chatId: quick ? QUICK_AI_CHAT_ID : activeAiChat?.id,
        clientSurface: 'web',
        attachments
      }, { onStatus: setAiChatProgress, onUploadProgress: setAiChatUploadProgress });
      // A completed response should always be visible after the user's request.
      if (quick) quickAiFollowBottomRef.current = true;
      const actionReports = result.actionReports ?? [];
      if (actionReports.some((item) => item.startsWith('Изменена заметка'))) {
        window.dispatchEvent(new Event('standalone-notes-updated'));
      }
      const serviceReport = actionReports.length > 0
        ? `\n\nИзменения:\n- ${actionReports.join('\n- ')}`
        : '';
      const assistantMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `${normalizeAiMessageContent(result.answer)}${serviceReport}`, createdAt: new Date().toISOString(), creditsSpentMilli: result.billing?.creditsSpentMilli, webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations, generatedDocument: result.generatedDocument ?? undefined, telegramSendDraft: result.telegramSendDraft ?? undefined, taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined };
      if (quick) setAiChatProjects((prev) => prev.map((project, projectIndex) => projectIndex === 0 ? { ...project, chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: [...chat.messages, assistantMessage].slice(-20) } : chat) } : project));
      else {
        updateActiveAiChatMessages((messages) => [...messages, assistantMessage]);
        if (history.length === 0 && result.suggestedChatTitle && activeAiChatProject?.id && activeAiChat?.id) {
          const projectId = activeAiChatProject.id, chatId = activeAiChat.id;
          setAiChatProjects((prev) => prev.map(project => project.id !== projectId ? project : {
            ...project, chats: project.chats.map(chat => chat.id !== chatId || !/^(Новый чат|Чат \d+)$/i.test(chat.title)
              ? chat : { ...chat, title: result.suggestedChatTitle! })
          }));
        }
      }
      if (quick) window.requestAnimationFrame(scrollQuickAiChatToBottom);
      if (result.taskDataChanged) await load();
      await refreshAiCredits();
    } catch (error) {
      const message = formatAiRequestError(error);
      setAiChatError(message);
      if (quick) { setQuickAiChatDraft((current) => current.trim() ? current : question); setQuickAiPendingFiles((current) => current.length ? current : pendingFiles); }
      else setAiChatPendingFiles((current) => current.length ? current : aiChatPendingFiles);
      if (quick) {
        // Compact chat has no aiChatError view. Display failures in its thread.
        const failureMessage: AiChatMessage = {
          id: crypto.randomUUID(), role: 'assistant', content: message, createdAt: new Date().toISOString()
        };
        setAiChatProjects((prev) => prev.map((project, index) => index === 0 ? {
          ...project,
          chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID
            ? { ...chat, messages: [...chat.messages, failureMessage].slice(-20) } : chat)
        } : project));
      }
    } finally {
      setAiChatUploadProgress(null);
      setAiChatLoading(false);
      if (quick) {
        setQuickAiChatLoading(false);
        window.requestAnimationFrame(scrollQuickAiChatToBottom);
      }
    }
  };

  const openAiChatProjectDialog = () => {
    setAiChatProjectDraft({ mode: 'create', title: `Проект ${aiChatProjects.length + 1}`, color: '#8b5cf6', icon: '✨' });
    setIsAiChatProjectDialogOpen(true);
  };

  const openAiChatProjectSettings = (projectId: string) => {
    const project = aiChatProjects.find((item) => item.id === projectId);
    if (!project || project.id === TELEGRAM_AI_MANAGED_PROJECT_ID) return;
    setAiChatProjectDraft({ mode: 'edit', projectId, title: project.title, color: project.color, icon: project.icon });
    setIsAiChatProjectDialogOpen(true);
    setAiChatContextMenu(null);
  };

  const saveAiChatProject = () => {
    const fallbackTitle = aiChatProjectDraft.mode === 'create' ? `Проект ${aiChatProjects.length + 1}` : 'Проект';
    const title = aiChatProjectDraft.title.trim() || fallbackTitle;
    if (aiChatProjectDraft.mode === 'edit' && aiChatProjectDraft.projectId) {
      setAiChatProjects((prev) => prev.map((project) => project.id === aiChatProjectDraft.projectId ? { ...project, title, color: aiChatProjectDraft.color, icon: aiChatProjectDraft.icon } : project));
      setIsAiChatProjectDialogOpen(false);
      return;
    }
    const chat = { id: crypto.randomUUID(), title: 'Новый чат', messages: [] };
    const project: AiChatProject = { id: crypto.randomUUID(), title, color: aiChatProjectDraft.color, icon: aiChatProjectDraft.icon, chats: [chat] };
    setAiChatProjects((prev) => [...prev, project]);
    setActiveAiChatProjectId(project.id);
    setActiveAiChatId(chat.id);
    setIsAiChatProjectDialogOpen(false);
  };

  const openAiChatRenameDialog = (chatId: string) => {
    if (chatId === QUICK_AI_CHAT_ID || chatId.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX)) return;
    const chat = activeAiChatProject?.chats.find((item) => item.id === chatId);
    if (!chat) return;
    setRenamingAiChatId(chatId);
    setAiChatRenameDraft(chat.title);
    setAiChatContextMenu(null);
  };

  const saveAiChatRename = () => {
    if (!renamingAiChatId || !activeAiChatProject) return;
    const title = aiChatRenameDraft.trim() || 'Новый чат';
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: project.chats.map((chat) => chat.id === renamingAiChatId ? { ...chat, title } : chat) } : project));
    setRenamingAiChatId(null);
  };

  const openAiChatItemContextMenu = (event: ReactMouseEvent, type: 'project' | 'chat', id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setAiChatContextMenu({ type, id, ...getViewportSafeContextMenuPosition(event.clientX, event.clientY, { height: 52 }) });
  };

  const deleteAiChatProject = (projectId: string) => {
    if (projectId === TELEGRAM_AI_MANAGED_PROJECT_ID) return;
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

  const createAiChatThread = () => {
    if (!activeAiChatProject || activeAiChatProject.id === TELEGRAM_AI_MANAGED_PROJECT_ID) return;
    const chat = { id: crypto.randomUUID(), title: `Чат ${activeAiChatProject.chats.length}`, messages: [] };
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: [chat, ...project.chats] } : project));
    setActiveAiChatId(chat.id);
  };

  const deleteAiChatThread = (chatId: string) => {
    if (chatId === QUICK_AI_CHAT_ID || chatId.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX) || !activeAiChatProject || activeAiChatProject.chats.length <= 1) return;
    setAiChatProjects((prev) => prev.map((project) => {
      if (project.id !== activeAiChatProject.id) return project;
      const nextChats = project.chats.filter((chat) => chat.id !== chatId);
      if (activeAiChatId === chatId) setActiveAiChatId(nextChats[0]?.id ?? '');
      return { ...project, chats: nextChats };
    }));
  };

  const approveTelegramTask = async (eventId: string, index: number) => {
    try {
      const result = await api.telegramAssistantApproveTask(eventId, index);
      const feed = await api.telegramAssistantInbox();
      setAiChatProjects(previous => mergeTelegramAiInbox(previous, feed));
      if (result.ok) await load();
      setAiChatError(null);
    } catch (error) {
      setAiChatError(error instanceof Error ? error.message : 'Не удалось создать задачу');
    }
  };

  const sendGeneralAiQuestion = async () => {
    const question = generalAiDraft.trim();
    if (!question || generalAiLoading) return;
    const nextUserMessage: GeneralAiMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    setGeneralAiMessages((prev) => [...prev, nextUserMessage]);
    setGeneralAiDraft('');
    setGeneralAiError(null);
    setGeneralAiLoading(true);

    try {
      const result = await api.askGeneralAssistant({ question });
      const serviceReport = result.actionReports.length > 0
        ? `\n\nОтчёт сервиса:\n- ${result.actionReports.join('\n- ')}`
        : '';
      setGeneralAiMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `${result.answer}${serviceReport}`, creditsSpentMilli: result.billing?.creditsSpentMilli, taskProposal: result.taskProposal ?? undefined }
      ]);
      setLastGeneralAiUndoOperations(result.undoOperations);
      await refreshAiCredits();
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ общего ИИ-чата';
      setGeneralAiError(message);
      setGeneralAiMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: message === INSUFFICIENT_AI_CREDITS_MESSAGE ? INSUFFICIENT_AI_CREDITS_MESSAGE : 'Не удалось выполнить запрос. Попробуйте ещё раз.' }
      ]);
    } finally {
      setGeneralAiLoading(false);
    }
  };

  const continueTelegramReadAiChat = async (
    approval: import('./lib/types').TelegramReadApproval, projectId: string, chatId: string
  ) => {
    if (aiChatLoading) throw new Error('Дождитесь окончания текущего ответа ИИ');
    const project = aiChatProjects.find(p => p.id === projectId);
    const chat = project?.chats.find(c => c.id === chatId);
    if (!project || !chat) throw new Error('Чат больше не найден');
    setAiChatLoading(true);
    setAiChatError(null);
    setAiChatProgress('analyzing_request');
    try {
      const quick = chatId === QUICK_AI_CHAT_ID;
      const result = await api.askAiChatStreaming({
        clientRequestId: crypto.randomUUID(),
        question: 'Продолжи предыдущий запрос после разрешения пользователя прочитать выбранную Telegram-переписку.',
        history: chat.messages,
        telegramRead: approval,
        model: quick ? quickAiChatModel : (readSavedAiChatModel(chat.model) ?? DEFAULT_WEB_PROJECT_CHAT_MODEL),
        projectTitle: project.title, chatTitle: chat.title, projectId, chatId,
        clientSurface: 'web'
      }, { onStatus: setAiChatProgress });
      const reports = result.actionReports?.length ? '\n\nИзменения:\n- ' + result.actionReports.join('\n- ') : '';
      const response: AiChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: normalizeAiMessageContent(result.answer) + reports,
        createdAt: new Date().toISOString(),
        creditsSpentMilli: result.billing?.creditsSpentMilli,
        webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations,
        generatedDocument: result.generatedDocument ?? undefined,
        telegramSendDraft: result.telegramSendDraft ?? undefined,
        taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined
      };
      setAiChatProjects(prev => prev.map(p => p.id !== projectId ? p : {
        ...p, chats: p.chats.map(c => c.id !== chatId ? c : {
          ...c, messages: [...c.messages, response].slice(quick ? -20 : -300)
        })
      }));
      if (result.taskDataChanged) await load();
      await refreshAiCredits();
    } finally {
      setAiChatLoading(false);
    }
  };

  const continueTelegramReadTask = async (
    approval: import('./lib/types').TelegramReadApproval, taskId: string, focus = false
  ) => {
    if (aiLoadingTaskId === taskId || (focus && focusAiLoading)) {
      throw new Error('Дождитесь завершения предыдущего запроса');
    }
    if (focus) { setFocusAiLoading(true); setFocusAiProgress('analyzing_request'); }
    else {
      setAiLoadingTaskId(taskId);
      setAiProgressByTask(prev => ({ ...prev, [taskId]: 'analyzing_request' }));
    }
    try {
      const result = await api.askTaskAssistantStreaming(taskId, {
        clientRequestId: crypto.randomUUID(),
        question: 'Продолжи исходный запрос по разрешённой пользователем переписке Telegram.',
        userMessage: '',
        telegramRead: approval,
        model: focus ? (aiModelByTask[taskId] ?? 'gpt-5.4-mini') : focusedAiModel,
        clientSurface: 'web',
        skipEfficiencyBonus: focus
      }, { onStatus: status => {
        if (focus) setFocusAiProgress(status);
        else setAiProgressByTask(prev => ({ ...prev, [taskId]: status }));
      } });
      const response: TaskAiMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: result.answer,
        creditsSpentMilli: result.billing?.creditsSpentMilli,
        webSearchUsed: result.webSearchUsed, webSources: result.webSources, webCitations: result.webCitations,
        generatedDocument: result.generatedDocument ?? undefined,
        telegramSendDraft: result.telegramSendDraft ?? undefined,
        taskProposal: result.taskProposal ?? undefined, telegramReadDraft: result.telegramReadDraft ?? undefined
      };
      setAiDialogByTask(prev => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), response] }));
      await refreshAiCredits();
      if (result.taskDataChanged) await load();
    } finally {
      if (focus) { setFocusAiLoading(false); setFocusAiProgress(null); }
      else {
        setAiLoadingTaskId(null);
        setAiProgressByTask(prev => { const next = { ...prev }; delete next[taskId]; return next; });
      }
    }
  };

  const undoGeneralAiAction = async () => {
    if (lastGeneralAiUndoOperations.length === 0 || generalAiLoading) return;
    setGeneralAiLoading(true);
    setGeneralAiError(null);
    try {
      await api.undoGeneralAssistantAction({ operations: lastGeneralAiUndoOperations });
      setLastGeneralAiUndoOperations([]);
      setGeneralAiMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Последнее действие отменено.' }
      ]);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отменить действие';
      setGeneralAiError(message);
    } finally {
      setGeneralAiLoading(false);
    }
  };

  function shouldTaskGlow(task: Task) {
    if (task.status === 'DONE') return false;
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const diff = due.getTime() - Date.now();
    if (diff < 0) return true;
    if (!Number.isFinite(task.notifyBeforeMinutes)) return false;
    const notifyBefore = Math.min(Number(task.notifyBeforeMinutes), MAX_SHINE_WINDOW_MINUTES) * 60_000;
    if (notifyBefore <= 0) return false;
    return diff <= notifyBefore;
  }

  const isTimelineMode = displayMode === 'timeline';
  const isBubblesMode = displayMode === 'bubbles';

  useEffect(() => {
    if (isBubblesMode && rankingMode !== 'coefficient') {
      setRankingMode('coefficient');
    }
  }, [isBubblesMode, rankingMode]);

  useEffect(() => {
    if (!isTimelineMode) {
      setIsTimelineToolbarHidden(false);
      return;
    }

    const container = timelineScrollContainerRef.current;
    if (!container) return;

    timelineLastScrollTopRef.current = container.scrollTop;
    setIsTimelineToolbarHidden(false);

    const handleTimelineScroll = () => {
      const nextScrollTop = Math.max(0, container.scrollTop);

      if (isTimelineOverdueModalOpen) {
        timelineLastScrollTopRef.current = nextScrollTop;
        setIsTimelineToolbarHidden(false);
        return;
      }
      const delta = nextScrollTop - timelineLastScrollTopRef.current;

      if (Math.abs(delta) < 6) return;

      if (nextScrollTop < 24 || delta < 0) {
        setIsTimelineToolbarHidden(false);
      } else if (delta > 0 && nextScrollTop > 72) {
        setIsTimelineToolbarHidden(true);
      }

      timelineLastScrollTopRef.current = nextScrollTop;
    };

    container.addEventListener('scroll', handleTimelineScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleTimelineScroll);
  }, [isTimelineMode, timelineViewMode, isTimelineOverdueModalOpen]);

  useEffect(() => {
    if (!isTimelineMode || (timelineViewMode !== 'day' && timelineViewMode !== 'week')) return;
    const container = timelineScrollContainerRef.current;
    if (!container) return;
    const now = new Date();
    const minutesFromDayStart = now.getHours() * 60 + now.getMinutes();
    const dayRatio = minutesFromDayStart / (24 * 60);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const targetScrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollHeight * dayRatio - container.clientHeight / 2));
    requestAnimationFrame(() => {
      container.scrollTop = targetScrollTop;
    });
  }, [isTimelineMode, timelineViewMode, timelineAnchorDate]);

  useEffect(() => {
    if (!isTimelineMode || timelineViewMode !== 'month') return;

    const animationFrameId = requestAnimationFrame(() => {
      const container = timelineScrollContainerRef.current;
      const currentDay = timelineCurrentDayRef.current;
      if (!container || !currentDay) return;

      const containerRect = container.getBoundingClientRect();
      const currentDayRect = currentDay.getBoundingClientRect();
      const currentDayTop = container.scrollTop + currentDayRect.top - containerRect.top;
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, currentDayTop - (container.clientHeight - currentDayRect.height) / 2)
      );

      container.scrollTop = targetScrollTop;
      timelineLastScrollTopRef.current = targetScrollTop;
    });

    return () => cancelAnimationFrame(animationFrameId);
  }, [isTimelineMode, timelineViewMode, timelineAnchorDate]);

  useEffect(() => {
    if (!isTimelineMode || draggedTimelineTaskId === null) return;
    const container = timelineScrollContainerRef.current;
    if (!container) return;

    const EDGE_ZONE_PX = 56;
    const MAX_SCROLL_STEP = 22;
    let lastClientY: number | null = null;
    let rafId: number | null = null;

    const tick = () => {
      if (lastClientY === null) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const rect = container.getBoundingClientRect();
      if (lastClientY < rect.top || lastClientY > rect.bottom) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      let delta = 0;
      const topDistance = lastClientY - rect.top;
      const bottomDistance = rect.bottom - lastClientY;

      if (topDistance < EDGE_ZONE_PX) {
        const ratio = Math.max(0, (EDGE_ZONE_PX - topDistance) / EDGE_ZONE_PX);
        delta = -Math.ceil(ratio * MAX_SCROLL_STEP);
      } else if (bottomDistance < EDGE_ZONE_PX) {
        const ratio = Math.max(0, (EDGE_ZONE_PX - bottomDistance) / EDGE_ZONE_PX);
        delta = Math.ceil(ratio * MAX_SCROLL_STEP);
      }

      if (delta !== 0) {
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        container.scrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + delta));
      }

      rafId = window.requestAnimationFrame(tick);
    };

    const handleDragOver = (event: DragEvent) => {
      lastClientY = event.clientY;
    };

    window.addEventListener('dragover', handleDragOver);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [draggedTimelineTaskId, isTimelineMode]);

  const effectiveTimeFilter = isTimelineMode ? 'all' : timeFilter;
  const shouldApplySphereFilter = !isTimelineMode;

  const efficiencyScore = useMemo(() => currentUser?.efficiencyScore ?? 0, [currentUser?.efficiencyScore]);

  const efficiencyGrade = useMemo(() => getEfficiencyGrade(efficiencyScore), [efficiencyScore]);

  const formattedEfficiencyScore = useMemo(() => efficiencyScore.toFixed(1).replace(/\.0$/, ''), [efficiencyScore]);
  const efficiencyGradeMessage = useMemo(() => {
    if (efficiencyScore < 30) return 'Средний рейтинг. Сделайте следующий маленький шаг.';
    if (efficiencyScore < 70) return 'Хороший рейтинг. Так держать.';
    return 'Отличный рейтинг! Продолжай в том же духе.';
  }, [efficiencyScore]);
  const efficiencyTaskRating = currentUser?.efficiencyTaskScore ?? 0;
  const efficiencyHabitRating = currentUser?.efficiencyHabitScore ?? 0;
  const efficiencyAiRating = currentUser?.efficiencyAiScore ?? 0;
  const efficiencyFocusRating = currentUser?.efficiencyFocusScore ?? 0;
  const formatRatingDelta = (value: number) => value.toFixed(1).replace(/\.0$/, '');

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
    setIsAiRecipientPickerVisible(false);
    setIsAiRecipientMenuOpen(false);
  }, [focusedTask?.id, isAiExpanded]);


  useEffect(() => {
    setCompletedVisibleCount(40);
  }, [completedFilter]);

  const visibleTasks = useMemo(
    () =>
      (isTimelineMode ? activeTimelineItems : activeTasks).filter((task) => {
        const taskSubtasks = subtaskMap[task.id] ?? [];
        const parseDate = (value?: string | null) => {
          if (!value) return null;
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const getBoundary = () => {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (effectiveTimeFilter === 'today') {
            const endOfToday = new Date(startOfToday);
            endOfToday.setDate(endOfToday.getDate() + 1);
            return { start: startOfToday, end: endOfToday };
          }
          if (effectiveTimeFilter === 'tomorrow') {
            const startOfTomorrow = new Date(startOfToday);
            startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
            const endOfTomorrow = new Date(startOfTomorrow);
            endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
            return { start: startOfTomorrow, end: endOfTomorrow };
          }
          if (effectiveTimeFilter === 'week') {
            const day = startOfToday.getDay();
            const offsetToMonday = (day + 6) % 7;
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfWeek.getDate() - offsetToMonday);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 7);
            return { start: startOfWeek, end: endOfWeek };
          }
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return { start: startOfMonth, end: endOfMonth };
        };
        const isDateInRange = (date: Date, start: Date, end: Date) => {
          if (effectiveTimeFilter === 'today') return date < end;
          return date >= start && date < end;
        };

        if (search && !matchesWorkspaceText(task.title, search)) return false;
        const isFilteringBySubset = shouldApplySphereFilter && spheres.length > 0 && selectedSphereIds.length > 0 && selectedSphereIds.length < spheres.length;
        if (isFilteringBySubset && (!task.sphereId || !selectedSphereIds.includes(task.sphereId))) return false;
        if (effectiveTimeFilter === 'focus') {
          const hasGlowingSubtask = taskSubtasks.some((subtask) => shouldTaskGlow(subtask));
          if (!shouldTaskGlow(task) && !hasGlowingSubtask) return false;
        } else if (effectiveTimeFilter !== 'all') {
          const { start, end } = getBoundary();
          const ownDate = parseDate(task.dueDate ?? task.createdAt ?? task.updatedAt);
          const hasOwnDateMatch = ownDate ? isDateInRange(ownDate, start, end) : false;
          const hasSubtaskDateMatch = taskSubtasks.some((subtask) => {
            if (subtask.status === 'DONE') return false;
            const subtaskDate = parseDate(subtask.dueDate);
            return subtaskDate ? isDateInRange(subtaskDate, start, end) : false;
          });
          if (!hasOwnDateMatch && !hasSubtaskDateMatch) return false;
        }
        return true;
      }),
    [activeTasks, activeTimelineItems, effectiveTimeFilter, isTimelineMode, search, selectedSphereIds, shouldApplySphereFilter, spheres.length, subtaskMap]
  );
  const visibleSpheres = useMemo(() => {
    if (selectedSphereIds.length === 0) return spheres;
    const selectedSet = new Set(selectedSphereIds);
    return spheres.filter((sphere) => selectedSet.has(sphere.id));
  }, [selectedSphereIds, spheres]);
  const isAllSpheresSelected = spheres.length > 0 && visibleSpheres.length === spheres.length;
  const sphereFilterLabel = spheres.length === 0
    ? 'Секторов нет'
    : isAllSpheresSelected
      ? 'Все сектора'
      : visibleSpheres.map((sphere) => sphere.name).join(', ');

  const toggleSphereSelection = (sphereId: string) => {
    setSelectedSphereIds((prev) => {
      const next = prev.includes(sphereId) ? prev.filter((id) => id !== sphereId) : [...prev, sphereId];
      return next;
    });
  };

  const persistTask = async (payload: Partial<Task>, draftSubtasks: Array<Pick<Task, 'title' | 'description'>> = [], eventAttachments: ChatAttachmentPayload[] = []) => {
    if (!editorState?.task?.id && !(payload.title ?? '').trim()) {
      throw new Error('Необходимо ввести название');
    }
    const normalized = {
      ...payload,
      title: (payload.title ?? '').trim(),
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3,
      status: payload.status ?? 'TODO',
      aiNotificationsEnabled: editorState?.task?.id ? payload.aiNotificationsEnabled : (payload.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled)
    };
    const isEventPayload = (payload.taskType ?? editorState?.task?.taskType) === 'EVENT';
    const score = calcScore(normalized.importance, normalized.urgency);

    if (editorState?.task?.id) {
      // A classic TaskEditor sends only the user's changed fields. Never
      // reintroduce defaults or spread the stale task object here: that used
      // to silently undo AI-applied deadline and description changes.
      const patch = taskEditorEditableSnapshot(payload);
      if (Object.keys(patch).length > 0) {
        const priorityChanged = patch.importance !== undefined || patch.urgency !== undefined;
        await api.updateTask(editorState.task.id, {
          ...patch,
          ...(priorityChanged ? { priorityScore: calcScore(patch.importance ?? editorState.task.importance, patch.urgency ?? editorState.task.urgency) } : {}),
          ...(isEventPayload && patch.aiNotificationsEnabled !== undefined ? { aiNotificationsEnabled: false } : {})
        });
      }
    } else {
      const createdTask = await api.createTask({ ...normalized, taskType: isEventPayload ? 'EVENT' : 'TASK', aiNotificationsEnabled: isEventPayload ? false : normalized.aiNotificationsEnabled, priorityScore: score });
      if (!isEventPayload && draftSubtasks.length > 0) {
        await Promise.all(draftSubtasks.map((subtask) => api.createTask({
          title: subtask.title,
          description: subtask.description,
          importance: 3,
          urgency: 3,
          priorityScore: 3,
          status: 'TODO',
          notifyBeforeMinutes: 0,
          sphereId: null,
          parentTaskId: createdTask.id,
          aiNotificationsEnabled: isAiNotificationsDefaultEnabled
        })));
      }
      if (isEventPayload && eventAttachments.length > 0) {
        // Event and task uploads share the same authorized API/quota. Settle
        // all uploads so a failed file cannot trigger a duplicate event create.
        const uploads = await Promise.allSettled(eventAttachments.map((file) => api.createTaskAttachment(createdTask.id, file)));
        const failed = uploads.find((result) => result.status === 'rejected');
        if (failed) {
          const reason = failed.status === 'rejected' && failed.reason instanceof Error ? failed.reason.message : 'Ошибка загрузки';
          window.alert('Событие создано, однако не все файлы прикреплены: ' + reason);
        }
      }
      void persistEfficiencyBonus(EFFICIENCY_BONUSES.createdTask, 'task');
    }
    setEditorState(null);
    await load();
  };

  const autosaveEditorTask = async (payload: Partial<Task>) => {
    if (!editorState?.task?.id) return;
    // The form may be open while an AI changes this task. Patch only fields
    // explicitly edited locally; never send its old description or due date.
    const patch = taskEditorEditableSnapshot(payload);
    if (Object.keys(patch).length === 0) return;
    const isEventPayload = editorState.task.taskType === 'EVENT';
    const priorityChanged = patch.importance !== undefined || patch.urgency !== undefined;
    await api.updateTask(editorState.task.id, {
      ...patch,
      ...(priorityChanged ? { priorityScore: calcScore(patch.importance ?? editorState.task.importance, patch.urgency ?? editorState.task.urgency) } : {}),
      ...(isEventPayload && patch.aiNotificationsEnabled !== undefined ? { aiNotificationsEnabled: false } : {})
    });
  };

  const createTaskFromAi = async (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments: ChatAttachmentPayload[] }) => {
    const generated = await api.generateTaskFromAi(payload);
    await refreshAiCredits();
    const importance = generated.task.importance ?? 3;
    const urgency = generated.task.urgency ?? 3;
    const createdTask = await api.createTask({
      title: generated.task.title,
      description: generated.task.description,
      sphereId: payload.autoAssignSphere ? (generated.suggestedSphereId ?? null) : (payload.sphereId ?? null),
      importance,
      urgency,
      dueDate: generated.task.dueDate ?? null,
      notifyBeforeMinutes: generated.task.notifyBeforeMinutes,
      status: 'TODO',
      priorityScore: calcScore(importance, urgency),
      aiNotificationsEnabled: isAiNotificationsDefaultEnabled
    });

    if (payload.attachments.length > 0) {
      await Promise.all(payload.attachments.map((attachment) => api.createTaskAttachment(createdTask.id, attachment)));
    }

    if (generated.task.subtasks.length > 0) {
      await Promise.all(generated.task.subtasks.map((subtask) => api.createTask({
        title: subtask.title,
        description: subtask.description,
        dueDate: subtask.dueDate,
        importance: 3,
        urgency: 3,
        priorityScore: 3,
        status: 'TODO',
        notifyBeforeMinutes: 0,
        sphereId: null,
        parentTaskId: createdTask.id,
        aiNotificationsEnabled: isAiNotificationsDefaultEnabled
      })));
    }

    setAiDialogByTask((prev) => ({
      ...prev,
      [createdTask.id]: [{ id: crypto.randomUUID(), role: 'assistant', content: generated.firstAssistantMessage }]
    }));
    await api.appendTaskAssistantMessages(createdTask.id, {
      messages: [{ role: 'assistant', content: generated.firstAssistantMessage }]
    });
    setEditorState(null);
    await load();
  };

  const hasUnreadAiMessage = (taskId: string) => {
    const dialog = aiDialogByTask[taskId] ?? [];
    const readCount = aiReadCursorByTask[taskId] ?? 0;
    if (readCount >= dialog.length) return false;
    return dialog.slice(readCount).some((message) => message.role === 'assistant');
  };

  const markTaskAsClosing = (taskId: string) => {
    setClosingTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    setTimelineCompletionAnimationIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    window.setTimeout(() => {
      setTimelineCompletionAnimationIds((prev) => prev.filter((id) => id !== taskId));
    }, 900);
  };

  const unmarkTaskAsClosing = (taskId: string) => {
    setClosingTaskIds((prev) => prev.filter((id) => id !== taskId));
    setTimelineCompletionAnimationIds((prev) => prev.filter((id) => id !== taskId));
    setPoppingTaskId((prev) => (prev === taskId ? null : prev));
  };

  const completeTask = async (task: Task, scope?: 'me' | 'all') => {
    if (task.isCollaborative && task.collaborationOwner && !scope) {
      setCollaborationAction({ task, action: 'complete' });
      return;
    }
    markTaskAsClosing(task.id);
    setPoppingTaskId(task.id);
    await new Promise((resolve) => setTimeout(resolve, 680));
    await api.updateTask(task.id, { status: 'DONE', collaborationScope: scope ?? 'me' });
    void persistEfficiencyBonus(EFFICIENCY_BONUSES.doneTask, 'task');
    if (isFocusBonusEligible(task.id)) pushFocusBonusMessage('task', EFFICIENCY_BONUSES.doneTask * (FOCUS_BONUS_MULTIPLIERS.task - 1));
    unmarkTaskAsClosing(task.id);
    setEditorState((current) => current?.task?.id === task.id ? null : current);
    setFocusedTaskId((current) => current === task.id ? null : current);
    await load();
    if (!task.parentTaskId && task.taskType !== 'EVENT' && task.taskType !== 'REMINDER'
      && !task.isRecurring && currentUser?.offerTaskCompletionReport !== false) {
      setReportPromptTask(task);
    }
  };

  const saveFocusedTask = async () => {
    await closeFocusedTask();
  };

  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return due.getTime() < Date.now();
  };

  const syncParentStatusBySubtasks = async (parentTaskId: string) => {
    const allTasks = await api.getTasks();
    const nextSubtasks = allTasks.filter((task) => task.parentTaskId === parentTaskId);
    if (nextSubtasks.length === 0) return null;
    const allDone = nextSubtasks.every((task) => task.status === 'DONE');
    const parentTask = allTasks.find((task) => task.id === parentTaskId);
    if (!parentTask) return allDone;
    if (allDone && parentTask.status !== 'DONE') {
      return true;
    }
    if (!allDone && parentTask.status === 'DONE') {
      await api.updateTask(parentTaskId, { status: 'TODO' });
    }
    return allDone;
  };


  const getLatestSubtaskDueDate = (parentTaskId: string): string | null => {
    const subtasks = (subtaskMap[parentTaskId] ?? []).filter((item) => Boolean(item.dueDate));
    if (subtasks.length === 0) return null;
    return subtasks
      .map((item) => item.dueDate as string)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  };

  const maybeSuggestParentDeadlineShift = async (parentTaskId: string) => {
    const allTasks = await api.getTasks();
    const parent = allTasks.find((task) => task.id === parentTaskId);
    if (!parent?.dueDate) return;
    const latestSubtask = allTasks
      .filter((task) => task.parentTaskId === parentTaskId && task.dueDate)
      .sort((a, b) => new Date(b.dueDate as string).getTime() - new Date(a.dueDate as string).getTime())[0];
    if (!latestSubtask?.dueDate) return;
    if (new Date(parent.dueDate).getTime() >= new Date(latestSubtask.dueDate).getTime()) return;
    const shouldShift = window.confirm(`Дедлайн основной задачи раньше, чем у подзадач. Перенести дедлайн основной задачи на ${new Date(latestSubtask.dueDate).toLocaleString('ru-RU')}?`);
    if (shouldShift) {
      await api.updateTask(parentTaskId, { dueDate: latestSubtask.dueDate });
    }
  };

  const toggleSubtaskDone = async (subtask: Task) => {
    const nextStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    if (nextStatus === 'TODO') {
      // Restoring a finished row changes the sort order. Keep the viewport
      // where it was rather than jumping to the top of the subtask list.
      pendingSubtaskScrollRef.current = {
        focused: focusedSubtaskListScrollRef.current?.scrollTop ?? null,
        focusMode: focusModeSubtaskListScrollRef.current?.scrollTop ?? null
      };
    }
    if (nextStatus === 'DONE') {
      markTaskAsClosing(subtask.id);
      setPoppingTaskId(subtask.id);
      await new Promise((resolve) => setTimeout(resolve, 680));
    }
    await api.updateTask(subtask.id, { status: nextStatus });
    if (nextStatus === 'DONE') {
      void persistEfficiencyBonus(EFFICIENCY_BONUSES.doneSubtask, 'task');
      if (isFocusBonusEligible(subtask.parentTaskId)) pushFocusBonusMessage('subtask', EFFICIENCY_BONUSES.doneSubtask * (FOCUS_BONUS_MULTIPLIERS.subtask - 1));
    }
    if (subtask.parentTaskId) {
      const parentCompleted = await syncParentStatusBySubtasks(subtask.parentTaskId);
      if (parentCompleted) {
        const shouldCloseParent = window.confirm('Все подзадачи закрыты. Закрыть основную задачу тоже?');
        if (shouldCloseParent) {
          await api.updateTask(subtask.parentTaskId, { status: 'DONE' });
          void persistEfficiencyBonus(EFFICIENCY_BONUSES.doneTask, 'task');
          if (focusedTaskId === subtask.parentTaskId) {
            setFocusedTaskId(null);
            setFocusedDraft(null);
          }
        }
      }
      await maybeSuggestParentDeadlineShift(subtask.parentTaskId);
    }
    await load();
    unmarkTaskAsClosing(subtask.id);
  };

  const handleSubtaskCommentContextMenu = (event: ReactMouseEvent, subtask: Task, collaborative: boolean) => {
    if (!collaborative) return;
    event.preventDefault();
    event.stopPropagation();
    setSubtaskCommentContextMenu({
      task: subtask,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 72)
    });
  };

  const openSubtaskComments = async (subtask: Task, compose = false) => {
    setSubtaskCommentContextMenu(null);
    setSubtaskCommentPanel({ task: subtask, compose });
    setSubtaskComments([]);
    setSubtaskCommentReplyTo(null);
    setSubtaskCommentDraft('');
    setSubtaskCommentError(null);
    setSubtaskCommentsLoading(true);
    try {
      const response = await api.getTaskComments(subtask.id);
      setSubtaskComments(response.comments);
      await api.markTaskCommentsRead(subtask.id, response.comments[response.comments.length - 1]?.id ?? null);
      const clearedUnread = subtask.unreadCommentCount ?? 0;
      setTasks((current) => current.map((task) => {
        if (task.id === subtask.id) {
          return { ...task, commentCount: response.comments.length, unreadCommentCount: 0 };
        }
        if (subtask.parentTaskId && task.id === subtask.parentTaskId && clearedUnread > 0) {
          return { ...task, unreadCommentCount: Math.max(0, (task.unreadCommentCount ?? 0) - clearedUnread) };
        }
        return task;
      }));
    } catch (error) {
      setSubtaskCommentError(error instanceof Error ? error.message : 'Не удалось загрузить комментарии');
    } finally {
      setSubtaskCommentsLoading(false);
    }
  };

  const sendSubtaskComment = async () => {
    const panel = subtaskCommentPanel;
    const content = subtaskCommentDraft.trim();
    if (!panel || !content || subtaskCommentSending) return;
    setSubtaskCommentSending(true);
    setSubtaskCommentError(null);
    try {
      const created = await api.createTaskComment(panel.task.id, {
        content,
        parentCommentId: subtaskCommentReplyTo?.id ?? null
      });
      setSubtaskComments((current) => [...current, created]);
      setTasks((current) => current.map((task) => {
        if (task.id === panel.task.id) {
          return { ...task, commentCount: (task.commentCount ?? 0) + 1 };
        }
        if (panel.task.parentTaskId && task.id === panel.task.parentTaskId) {
          return { ...task, commentCount: (task.commentCount ?? 0) + 1 };
        }
        return task;
      }));
      setSubtaskCommentDraft('');
      setSubtaskCommentReplyTo(null);
    } catch (error) {
      setSubtaskCommentError(error instanceof Error ? error.message : 'Не удалось отправить комментарий');
    } finally {
      setSubtaskCommentSending(false);
    }
  };

  const renderTaskAiRecipientPicker = (task: Task) => {
    if (!task.isCollaborative || !task.collaborationMembers?.length) return null;
    const selectedUserId = getTaskAiRecipientId(task);
    const selectedMember = task.collaborationMembers.find((member) => member.userId === selectedUserId);
    return (
      <div className="relative mb-1 flex justify-end">
        <button
          type="button"
          className="task-ai-recipient-trigger inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
          onClick={() => setIsAiRecipientMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isAiRecipientMenuOpen}
        >
          <span className="task-ai-recipient-label">Получатель:</span>
          <span>{selectedMember?.name ?? 'ИИ'}</span>
          <ChevronDown size={12} />
        </button>
        {isAiRecipientMenuOpen ? (
          <div className="task-ai-recipient-menu absolute bottom-full right-0 z-30 mb-1 min-w-48 rounded-xl border p-1.5 shadow-2xl" role="menu">
            <button
              type="button"
              className={`task-ai-recipient-item block w-full rounded-lg px-3 py-2 text-left text-xs ${selectedUserId === 'ai' ? 'task-ai-recipient-item-active' : ''}`}
              onClick={() => {
                setAiRecipientByTaskId((prev) => ({ ...prev, [task.id]: 'ai' }));
                setIsAiRecipientMenuOpen(false);
              }}
            >
              ИИ
            </button>
            {task.collaborationMembers.filter((member) => member.userId !== currentUser?.id).map((member) => (
              <button
                key={member.userId}
                type="button"
                className={`task-ai-recipient-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${selectedUserId === member.userId ? 'task-ai-recipient-item-active' : ''}`}
                onClick={() => {
                  setAiRecipientByTaskId((prev) => ({ ...prev, [task.id]: member.userId }));
                  setIsAiRecipientMenuOpen(false);
                }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: member.color }} />
                <span className="truncate">{member.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderWorkspaceCommentIndicator = (task: Task, compact = false) => {
    const total = task.commentCount ?? 0;
    if (total <= 0) return null;
    const unread = task.unreadCommentCount ?? 0;
    return (
      <span
        className={compact
          ? 'relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-300/50 bg-violet-500/10 text-violet-600'
          : 'task-card-meta-indicator relative'}
        title={unread > 0 ? `Непрочитанных комментариев: ${unread}` : `Комментариев: ${total}`}
        aria-label={unread > 0 ? `Непрочитанных комментариев: ${unread}` : `Комментариев: ${total}`}
      >
        <MessageCircle size={compact ? 11 : 15} />
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-violet-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </span>
    );
  };

  const renderWorkspaceAttachmentIndicator = (task: Task) => {
    const total = task.attachmentCount ?? 0;
    if (total <= 0) return null;
    return (
      <span
        className="task-card-meta-indicator"
        title={`Вложений: ${total}`}
        aria-label={`Вложений: ${total}`}
      >
        <Paperclip size={15} />
      </span>
    );
  };

  const renderSubtaskCommentButton = (subtask: Task) => {
    const unread = subtask.unreadCommentCount ?? 0;
    const total = subtask.commentCount ?? 0;
    return (
      <button
        type="button"
        className="task-card-meta-indicator task-card-meta-action relative"
        title={unread > 0 ? `Непрочитанных комментариев: ${unread}` : total > 0 ? `Комментариев: ${total}` : 'Открыть комментарии'}
        aria-label="Открыть комментарии"
        onClick={(event) => {
          event.stopPropagation();
          void openSubtaskComments(subtask);
        }}
      >
        <MessageCircle size={15} />
        {unread > 0 ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-center text-[9px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
    );
  };

  useEffect(() => {
    if (!subtaskCommentPanel || subtaskCommentsLoading) return;
    const frame = requestAnimationFrame(() => {
      const container = subtaskCommentScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [subtaskCommentPanel?.task.id, subtaskCommentsLoading, subtaskComments.length]);

  const createSubtaskForParent = async (parentTask: Task, payload: Partial<Task>) => {
    const createdSubtask = await api.createTask({
      ...payload,
      importance: 2,
      urgency: 2,
      priorityScore: 2,
      status: 'TODO',
      sphereId: null,
      parentTaskId: parentTask.id,
      aiNotificationsEnabled: payload.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled
    });
    setSubtaskOrderMap((prev) => {
      const current = prev[parentTask.id] ?? (subtaskMap[parentTask.id] ?? []).map((task) => task.id);
      return { ...prev, [parentTask.id]: [...current, createdSubtask.id] };
    });
    void persistEfficiencyBonus(EFFICIENCY_BONUSES.createdTask, 'task');
    if (parentTask.status === 'DONE') {
      await api.updateTask(parentTask.id, { status: 'TODO' });
    }
    await maybeSuggestParentDeadlineShift(parentTask.id);
    await load();
    return createdSubtask;
  };

  const addFocusedSubtask = async () => {
    if (!focusedTask) return;
    const title = focusedSubtaskTitle.trim() || 'Новая доп задача';
    await createSubtaskForParent(focusedTask, { title, dueDate: focusedSubtaskDueDate, notifyBeforeMinutes: 0 });
    setFocusedSubtaskTitle('');
    setFocusedSubtaskDueDate(null);
    setIsAddingFocusedSubtask(false);
  };


  const generateFocusedSubtasksWithAi = async () => {
    if (!focusedTask) return;
    setAiError(null);
    setAiSubtasksLoadingTaskId(focusedTask.id);
    try {
      await api.generateTaskSubtasks(focusedTask.id, { note: aiSubtasksPrompt.trim() || undefined });
      await refreshAiCredits();
      await load();
      setIsAiSubtasksPromptOpen(false);
      setAiSubtasksPrompt('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сгенерировать подзадачи';
      setAiError(message);
    } finally {
      setAiSubtasksLoadingTaskId(null);
    }
  };

  const reorderVisibleSubtasks = (parentTaskId: string, nextVisibleOrderIds: string[]) => {
    setSubtaskOrderMap((prev) => {
      const fullOrder = prev[parentTaskId] ?? (subtaskMap[parentTaskId] ?? []).map((task) => task.id);
      if (fullOrder.length === 0) {
        return { ...prev, [parentTaskId]: nextVisibleOrderIds };
      }
      const visibleSet = new Set(nextVisibleOrderIds);
      let visibleIndex = 0;
      const nextFullOrder = fullOrder.map((taskId) => {
        if (!visibleSet.has(taskId)) return taskId;
        const replacement = nextVisibleOrderIds[visibleIndex];
        visibleIndex += 1;
        return replacement ?? taskId;
      });
      return { ...prev, [parentTaskId]: nextFullOrder };
    });
  };

  const askTaskAssistant = async (taskId: string, payload: { clientRequestId?: string; question: string; userMessage?: string; model: AiChatModel; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean }, onStatus?: (status: TaskAiProgressStatus) => void, onUploadProgress?: (percent: number | null) => void) => {
    const result = await api.askTaskAssistantStreaming(taskId, { ...payload, clientSurface: 'web' }, { onStatus, onUploadProgress });
    try {
      const me = await api.getMe();
      setCurrentUser(me.user);
    } catch {
      // ignore credits refresh errors
    }
    return result;
  };

  const refreshAiCredits = async () => {
    try {
      const me = await api.getMe();
      setCurrentUser(me.user);
    } catch {
      // ignore credits refresh errors
    }
  };

  const closeAuthModal = () => {
    setAuthModalMode(null);
    setAuthError(null);
    setPersonalDataConsentAccepted(false);
  };

  const submitAuth = async () => {
    if (!authModalMode) return;
    if (authModalMode === 'register' && !personalDataConsentAccepted) {
      setAuthError('Необходимо согласиться на обработку персональных данных.');
      return;
    }
    if (authModalMode === 'register' && authPassword.length < 6) {
      setAuthError('Пароль должен содержать не менее 6 символов. Допускаются цифры, буквы и специальные символы.');
      return;
    }
    try {
      const result = authModalMode === 'login'
        ? await api.login({ login: authLogin, password: authPassword })
        : await api.register({ login: authLogin, password: authPassword, name: authName, consentAccepted: personalDataConsentAccepted });
      setCurrentUser(result.user);
      setAuthError(null);
      setAuthModalMode(null);
      setPersonalDataConsentAccepted(false);
    } catch (error) {
      setAuthError(
        authModalMode === 'login'
          ? 'Не удалось войти. Проверьте логин и пароль.'
          : error instanceof Error && error.message && !/^HTTP \d{3}$/.test(error.message)
            ? error.message
            : 'Не удалось зарегистрироваться. Попробуйте ещё раз.'
      );
    }
  };

  const openProfileModal = () => {
    setProfileName(currentUser?.name?.trim() ?? '');
    setProfileEmail(currentUser?.email?.trim() ?? '');
    setProfileCurrentPassword('');
    setProfileNewPassword('');
    setProfileError(null);
    setProfileSaved(false);
    setAreAccountAttachmentsOpen(false);
    setAccountAttachments([]);
    setAttachmentStorage(null);
    setIsProfileModalOpen(true);
    void api.getAttachmentStorage().then(setAttachmentStorage).catch(() => setProfileError('Не удалось загрузить данные хранилища.'));
  };

  const toggleAccountAttachments = async () => {
    if (areAccountAttachmentsOpen) { setAreAccountAttachmentsOpen(false); return; }
    setAreAccountAttachmentsOpen(true);
    setAccountAttachmentsLoading(true);
    try { setAccountAttachments(await api.listAccountAttachments()); }
    catch (error) { setProfileError(error instanceof Error ? error.message : 'Не удалось загрузить список вложений'); }
    finally { setAccountAttachmentsLoading(false); }
  };

  const deleteAccountAttachment = async (attachment: AccountAttachment) => {
    if (!window.confirm(`Удалить вложение «${attachment.name}»? Это действие нельзя отменить.`)) return;
    try {
      await api.deleteAccountAttachment(attachment.id);
      setAccountAttachments((files) => files.filter((file) => file.id !== attachment.id));
      setAttachmentStorage(await api.getAttachmentStorage());
      await load();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Не удалось удалить вложение');
    }
  };

  const closeProfileModal = () => {
    if (profileSaving) return;
    setIsProfileModalOpen(false);
    setProfileError(null);
  };

  const submitProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const result = await api.updateProfile({
        name: profileName,
        email: profileEmail,
        currentPassword: profileCurrentPassword || undefined,
        newPassword: profileNewPassword || undefined
      });
      setCurrentUser(result.user);
      setProfileCurrentPassword('');
      setProfileNewPassword('');
      setProfileSaved(true);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Не удалось сохранить изменения');
    } finally {
      setProfileSaving(false);
    }
  };

  if (authLoading) {
    return (
      <main className="app-shell flex h-screen items-center justify-center p-4" data-theme={effectiveThemeMode}>
        <p className="text-sm text-slate-300">Проверяем авторизацию…</p>
      </main>
    );
  }

  if (!currentUser) return null;

  const hasAccount = Boolean(
    currentUser.username?.trim()
    || currentUser.email?.trim()
    || currentUser.googleSub?.trim()
  );
  const accountDisplayName = currentUser.name?.trim()
    || currentUser.username?.trim()
    || currentUser.email?.trim()
    || 'Пользователь';

  const formatTaskDueDate = (value?: string | null) => {
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
  };
  const formatDeadlineLeft = (value?: string | null) => {
    if (!value) return 'Без дедлайна';
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return 'Без дедлайна';
    const diffMs = due.getTime() - Date.now();
    if (diffMs < 0) {
      const overdueMinutes = Math.floor(Math.abs(diffMs) / 60_000);
      if (overdueMinutes < 1) return 'Просрочено только что';
      const overdueHours = Math.floor(overdueMinutes / 60);
      const overdueMins = overdueMinutes % 60;
      if (overdueHours < 1) return `Просрочено на ${overdueMins} мин`;
      return `Просрочено на ${overdueHours} ч ${overdueMins} мин`;
    }
    const totalMinutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours < 1) return `Через ${Math.max(1, minutes)} мин`;
    return `Через ${hours} ч ${minutes} мин`;
  };
  const formatSubtaskRelativeDeadline = (value?: string | null) => {
    if (!value) return '';
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return '';
    const diffMs = due.getTime() - Date.now();
    const totalMinutes = Math.floor(Math.abs(diffMs) / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const suffix = diffMs < 0 ? ' назад' : '';
    if (hours < 1) return `${Math.max(1, minutes)} мин${suffix}`;
    return `${hours} ч${suffix}`;
  };
  const getActiveSubtasks = (taskId: string) => (displayedSubtaskMap[taskId] ?? []).filter((subtask) => subtask.status !== 'DONE');
  const getNearestActiveSubtaskDueDate = (taskId: string) => {
    const dueTimestamps = getActiveSubtasks(taskId)
      .map((subtask) => (subtask.dueDate ? new Date(subtask.dueDate).getTime() : Number.POSITIVE_INFINITY))
      .filter((timestamp) => Number.isFinite(timestamp));
    if (dueTimestamps.length === 0) return null;
    return new Date(Math.min(...dueTimestamps)).toISOString();
  };
  const getTaskUrgencyTimestamp = (task: Task) => {
    const taskDue = task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const nearestSubtaskDue = getNearestActiveSubtaskDueDate(task.id);
    const subtaskDue = nearestSubtaskDue ? new Date(nearestSubtaskDue).getTime() : Number.POSITIVE_INFINITY;
    return Math.min(taskDue, subtaskDue);
  };
  const quickPostponeTask = async (task: Task, option: QuickPostponeOption) => {
    const now = new Date();
    const userTz = userTimeZone || DEFAULT_TIMEZONE;
    const formatLocal = (iso: string | null) => {
      if (!iso) return 'без дедлайна';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return 'без дедлайна';
      return date.toLocaleString('ru-RU', { timeZone: userTz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const appendSystemGeneralAiMessage = (text: string) => {
      const systemMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `ℹ️ Системное уведомление\n${text}`, createdAt: new Date().toISOString() };
      setAiChatProjects((prev) => prev.map((project, projectIndex) => projectIndex === 0 ? { ...project, chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: [...chat.messages, systemMessage].slice(-20) } : chat) } : project));
    };
    const focusMovedTaskOnTimeline = (taskId: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const taskElement = document.querySelector<HTMLElement>(`[data-timeline-task-id="${taskId}"]`);
          if (!taskElement) return;
          taskElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          setTimelinePostponeHighlightedTaskId(taskId);
          window.setTimeout(() => {
            setTimelinePostponeHighlightedTaskId((prev) => (prev === taskId ? null : prev));
          }, 1000);
        });
      });
    };
    const updateDueDate = async (date: Date) => {
      await api.updateTask(task.id, { dueDate: date.toISOString() });
      await load();
      focusMovedTaskOnTimeline(task.id);
      return date.toISOString();
    };
    if (option === '15m' || option === '30m' || option === '1h' || option === '3h') {
      const minutesByOption = { '15m': 15, '30m': 30, '1h': 60, '3h': 180 } as const;
      const next = new Date(now);
      next.setMinutes(next.getMinutes() + minutesByOption[option]);
      return await updateDueDate(next);
    }
    if (option === 'tomorrow') {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      return await updateDueDate(next);
    }
    const nearbyTasks = tasks.filter((item) => item.id !== task.id && item.status !== 'DONE' && item.dueDate)
      .map((item) => ({ id: item.id, title: item.title, dueDate: item.dueDate }))
      .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime()).slice(0, 20);
    const taskSubtasks = subtaskMap[task.id] ?? [];
    const overdueSubtasks = taskSubtasks.filter((subtask) => subtask.status !== 'DONE' && subtask.dueDate && new Date(subtask.dueDate).getTime() < now.getTime());
    const prompt = [
      'SMART_POSTPONE_REQUEST',
      'Верни только JSON: {"dueDate":"ISO-8601"}.',
      'Выбирай только будущее время: dueDate должен быть строго позже now минимум на 5 минут.',
      'Никогда не возвращай текущее или прошедшее время.',
      'Постарайся выбрать окно с зазором примерно 30 минут от ближайших соседних задач в будущем. Если это невозможно — выбери самое близкое доступное будущее время.',
      `now=${now.toISOString()}`,
      `task=${JSON.stringify({ title: task.title, dueDate: task.dueDate ?? null, importance: task.importance })}`,
      `subtasks=${JSON.stringify(taskSubtasks.map((subtask) => ({ status: subtask.status, dueDate: subtask.dueDate ?? null })))}`,
      `nearby=${JSON.stringify(nearbyTasks.map((item) => ({ dueDate: item.dueDate })))}`
    ].join('\n');
    const result = await askTaskAssistant(task.id, { question: prompt, model: 'gpt-6-luna' });
    const jsonMatch = result.answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { dueDate?: string };
    if (!parsed.dueDate) return null;
    const aiDate = new Date(parsed.dueDate);
    if (Number.isNaN(aiDate.getTime())) return null;
    if (aiDate.getTime() <= now.getTime() + (5 * 60 * 1000)) return null;
    const nextDueDateIso = await updateDueDate(aiDate);
    if (overdueSubtasks.length > 0) {
      await Promise.all(overdueSubtasks.map((subtask) => api.updateTask(subtask.id, { dueDate: aiDate.toISOString() })));
      await load();
    }
    appendSystemGeneralAiMessage(`Задача «${task.title}» перенесена на ${formatLocal(nextDueDateIso)} (${userTz}).\nНовый дедлайн: ${formatLocal(nextDueDateIso)}.${overdueSubtasks.length > 0 ? `\nПодзадач перенесено: ${overdueSubtasks.length}.` : ''}`);
    return nextDueDateIso;
  };

  const sphereById = new Map(spheres.map((sphere) => [sphere.id, sphere]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const aiTaskReferenceTasks = tasks;
  const getTimelineTaskViewModel = (task: Task) => {
    const taskSubtasks = displayedSubtaskMap[task.id] ?? [];
    const hasOverdueState = task.status !== 'DONE' && isOverdue(task);
    const taskSphere = task.sphereId ? (sphereById.get(task.sphereId) ?? null) : null;
    const sphereColor = taskSphere?.color ?? '#64748b';
    return {
      taskSubtasks,
      hasOverdueState,
      sphereColor
    };
  };
  const renderTimelineTaskChip = (task: Task, options?: { showTime?: boolean; isSubtask?: boolean; disableHoverCard?: boolean; parentTaskTitle?: string; disableEffects?: boolean; disableOpenOnClick?: boolean; forceDraggable?: boolean; onDragStart?: () => void }) => {
    const { taskSubtasks, hasOverdueState, sphereColor } = getTimelineTaskViewModel(task);
    const isEventChip = task.taskType === 'EVENT';
    const isReminderChip = task.taskType === 'REMINDER';
    const parentTask = task.parentTaskId ? (taskById.get(task.parentTaskId) ?? null) : null;
    const parentSphere = parentTask?.sphereId ? (sphereById.get(parentTask.sphereId) ?? null) : null;
    const parentSphereColor = parentSphere?.color ?? '#64748b';
    const upcomingSubtasks = taskSubtasks
      .filter((subtask) => subtask.status !== 'DONE')
      .sort((a, b) => {
        const aTs = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bTs = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (aTs !== bTs) return aTs - bTs;
        return a.title.localeCompare(b.title, 'ru');
      });
    const previewSubtasks = upcomingSubtasks.slice(0, 3);
    const hiddenSubtasksCount = Math.max(0, upcomingSubtasks.length - previewSubtasks.length);
    const isSubtaskChip = options?.isSubtask ?? Boolean(task.parentTaskId);
    const isCompletingInTimeline = timelineCompletionAnimationIds.includes(task.id);
    const isCompletingOutsideTimeline = displayMode !== 'timeline' && closingTaskIds.includes(task.id);
    const disableEffects = Boolean(options?.disableEffects);
    const canDragTask = task.status !== 'DONE' && Boolean(task.dueDate);
    const isHoverCardVisible = draggedTimelineTaskId === null && !options?.disableHoverCard && timelineHoverCard?.taskId === task.id;
    return (
      <motion.button
        layout
        key={task.id}
        type="button"
        draggable={canDragTask}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={`timeline-task-chip ${isEventChip ? 'timeline-event-chip' : ''} ${isReminderChip ? 'timeline-reminder-chip' : ''} relative flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs transition-all duration-200 hover:brightness-110 ${
          canDragTask ? 'cursor-grab active:cursor-grabbing' : ''
        } ${draggedTimelineTaskId === task.id ? 'opacity-60' : ''} ${isCompletingInTimeline || isCompletingOutsideTimeline ? 'ring-1 ring-emerald-300/70' : ''}`}
        data-timeline-task-id={task.id}
        style={{
          borderColor: isReminderChip ? '#0284c7' : isEventChip ? '#f59e0b' : isSubtaskChip ? 'rgba(148,163,184,0.75)' : (hasOverdueState ? 'rgba(251,113,133,0.85)' : sphereColor),
          backgroundColor: isReminderChip
            ? (effectiveThemeMode === 'light' ? 'rgba(224,242,254,0.97)' : 'rgba(3,105,161,0.32)')
            : isEventChip
            ? (effectiveThemeMode === 'light' ? 'rgba(254,243,199,0.95)' : 'rgba(146,64,14,0.38)')
            : isSubtaskChip
              ? (effectiveThemeMode === 'light' ? 'rgba(241,245,249,0.92)' : 'rgba(71,85,105,0.5)')
            : hasOverdueState
              ? (effectiveThemeMode === 'light' ? 'rgba(255,228,230,0.92)' : 'rgba(136,19,55,0.45)')
              : hexToRgba(sphereColor, effectiveThemeMode === 'light' ? 0.16 : 0.34) ?? (effectiveThemeMode === 'light' ? 'rgba(241,245,249,0.92)' : 'rgba(100,116,139,0.34)'),
          boxShadow: disableEffects
            ? undefined
            : (!isEventChip && !isReminderChip && hasOverdueState)
              ? '0 0 8px rgba(239,68,68,0.32), inset 0 0 6px rgba(239,68,68,0.14)'
              : undefined,
        }}
        onDragStartCapture={(event) => {
          if (!canDragTask) return;
          setDraggedTimelineTaskId(task.id);
          options?.onDragStart?.();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/task-id', task.id);
        }}
        onDragEndCapture={() => {
          setDraggedTimelineTaskId(null);
          setActiveTimelineDropSlot(null);
          setIsTimelineOverdueModalCollapsedForDrag(false);
        }}
        onMouseEnter={(event) => {
          if (draggedTimelineTaskId !== null || options?.disableHoverCard || isReminderChip) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const cardWidth = 288;
          const cardHeight = 250;
          const margin = 12;
          const spaceBelow = window.innerHeight - rect.bottom;
          const openUpward = spaceBelow < (cardHeight + margin);
          const top = openUpward ? Math.max(8, rect.top - cardHeight - margin) : Math.min(window.innerHeight - cardHeight - 8, rect.bottom + margin);
          const minLeft = 16;
          const maxLeft = window.innerWidth - cardWidth - 16;
          const left = Math.max(minLeft, Math.min(rect.left + rect.width / 2 - cardWidth / 2, maxLeft));
          setTimelineHoverCard({ taskId: task.id, top, left });
        }}
        onMouseLeave={() => {
          setTimelineHoverCard((prev) => (prev?.taskId === task.id ? null : prev));
        }}
        onClick={() => {
          if (options?.disableOpenOnClick || isReminderChip) return;
          openTaskWithFocusGuard(task);
        }}
        onContextMenu={(event) => {
          if (isReminderChip) { event.preventDefault(); return; }
          event.preventDefault();
          event.stopPropagation();
          setTimelineHoverCard((prev) => (prev?.taskId === task.id ? null : prev));
          setTimelineCreateMenu({ ...getViewportSafeContextMenuPosition(event.clientX, event.clientY, { submenu: true }), date: task.dueDate ? new Date(task.dueDate) : new Date(), hour: null, taskId: task.id });
          setTimelinePostponeSubmenuOpen(false);
        }}
      >
        <span className="flex min-w-0 items-center gap-1">
          {timelinePostponeHighlightedTaskId === task.id || isCompletingInTimeline || isCompletingOutsideTimeline ? (
            <Check size={13} className="timeline-task-chip-success shrink-0" />
          ) : null}
          {timelinePostponeLoadingTaskId === task.id ? <Loader2 size={12} className="timeline-task-chip-accent shrink-0 animate-spin" /> : null}
          {isEventChip ? <Ticket size={12} className="shrink-0 text-amber-600" /> : null}
          {isReminderChip ? <BellRing size={12} className="shrink-0 text-sky-500" /> : null}
          {isSubtaskChip ? <span className="h-4 w-1 shrink-0 rounded-sm" style={{ backgroundColor: parentSphereColor }} /> : null}
          <span className={`truncate transition-all duration-300 ${isCompletingInTimeline || isCompletingOutsideTimeline ? 'timeline-task-chip-completed line-through decoration-2' : ''}`}>
            {isReminderChip ? task.title : <LinkifiedText text={task.title} stopPropagationOnLinkClick />}
          </span>
          {!isEventChip && !isReminderChip && hasUnreadAiMessage(task.id) ? <span title="Непрочитанное ИИ-уведомление"><Sparkles size={12} className="timeline-task-ai-icon shrink-0" /></span> : null}
          {!isEventChip && !isReminderChip ? renderWorkspaceCommentIndicator(task, true) : null}
          {options?.showTime && task.dueDate ? (
            <span className="timeline-task-chip-meta ml-1">
              ({new Date(task.dueDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
            </span>
          ) : null}
          {task.isRecurring ? <span title="Повторяющееся событие/задача"><Repeat size={12} className="timeline-task-chip-accent shrink-0" /></span> : null}
          {isEventChip && task.location ? <span className="timeline-task-chip-meta ml-1 truncate">· {task.location}</span> : null}
        </span>
        {!isEventChip && !isReminderChip && !isSubtaskChip ? <div className="flex items-center gap-1"><span className="timeline-task-count-badge rounded-full border px-1.5 py-0.5 text-[10px]">{taskSubtasks.length}</span></div> : null}
        {isCompletingInTimeline || isCompletingOutsideTimeline ? (
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="pointer-events-none absolute left-2 right-2 top-1/2 h-[2px] origin-left rounded bg-emerald-300/90"
          />
        ) : null}
        {isHoverCardVisible && !isReminderChip ? createPortal((
        <div
          className="timeline-hover-card pointer-events-none fixed z-[2147483647] w-72 rounded-lg border p-2.5 text-[11px]"
          style={{ left: `${timelineHoverCard.left}px`, top: `${timelineHoverCard.top}px` }}
        >
          <p className="font-semibold text-primary">{task.title}</p>
          <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-words text-muted [overflow-wrap:anywhere]"><LinkifiedText text={(() => { const plain = noteHtmlToPlainText(task.description ?? '', { trimEnd: true }); return plain.length > 240 ? `${plain.slice(0, 240)}...` : plain; })()} fallback="Без описания" stopPropagationOnLinkClick /></p>
          {isSubtaskChip && options?.parentTaskTitle ? <p className="mt-1 text-muted">Основная задача: {options.parentTaskTitle}</p> : null}
          <p className="mt-1 text-muted">Дедлайн: {formatTaskDueDate(task.dueDate)} · {formatDeadlineLeft(task.dueDate)}</p>
          {isEventChip ? <p className="mt-1 text-muted">Место: {task.location?.trim() || 'Не указано'}</p> : null}
          {isEventChip ? null : isSubtaskChip ? (
            <div className="timeline-hover-card-section mt-2 border-t pt-2">
              <p className="text-[10px] uppercase tracking-wide text-subtle">Основная задача</p>
              <span
                className="mt-1 inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold text-primary"
                style={{
                  borderColor: parentSphereColor,
                  backgroundColor: hexToRgba(parentSphereColor, 0.36) ?? 'rgba(100,116,139,0.34)'
                }}
              >
                <span className="truncate">{options?.parentTaskTitle ?? parentTask?.title ?? 'Без названия'}</span>
              </span>
            </div>
          ) : (
            <div className="timeline-hover-card-section mt-2 border-t pt-2">
              <p className="text-[10px] uppercase tracking-wide text-subtle">Ближайшие подзадачи</p>
              {previewSubtasks.length > 0 ? (
                <ul className="mt-1 space-y-1.5">
                  {previewSubtasks.map((subtask) => (
                    <li key={subtask.id} className="rounded border border-[color:var(--timeline-grid-border)] bg-[color:var(--muted-bg)] px-2 py-1 text-muted">
                      <span className="block whitespace-normal break-words leading-snug">• {subtask.title}</span>
                      <span className="mt-0.5 block whitespace-normal break-words text-[10px] text-subtle">{subtask.dueDate ? `Срок: ${formatTaskDueDate(subtask.dueDate)} · ${formatDeadlineLeft(subtask.dueDate)}` : 'Срок не задан'}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-subtle">Нет активных подзадач</p>}
              {hiddenSubtasksCount > 0 ? <p className="mt-1 text-subtle">+ ещё {hiddenSubtasksCount} подзадач</p> : null}
            </div>
          )}
        </div>
        ), document.body) : null}
      </motion.button>
    );
  };

  const renderTimelineHabitChip = (habit: Habit, reminderTime: string, date: Date, options?: { showTime?: boolean }) => {
    const dateKey = toLocalDateKey(date);
    const completed = getHabitCompletedForDate(habit, dateKey);
    const progress = Math.round((Math.min(completed, habit.targetCount) / Math.max(1, habit.targetCount)) * 100);
    return (
      <div
        key={`timeline-habit-${habit.id}-${reminderTime}-${dateKey}-${options?.showTime ? 'time' : 'plain'}`}
        className="timeline-habit-chip flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition"
        style={{ '--habit-color': habit.color, '--habit-progress': `${progress}%`, borderColor: hexToRgba(habit.color, effectiveThemeMode === 'light' ? 0.5 : 0.72) ?? habit.color } as CSSProperties}
      >
        <span className="miniapp-habit-circle inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm" style={{ '--habit-color': habit.color, '--habit-progress': `${progress}%` } as CSSProperties}>
          <span className="miniapp-habit-circle-core inline-flex h-5 w-5 items-center justify-center rounded-full">{habit.icon}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{habit.name}</span>
          <span className="timeline-habit-chip-meta block truncate">Привычка · {reminderTime} · {completed}/{habit.targetCount}</span>
        </span>
      </div>
    );
  };

  const getTimelineHabitsForDateHour = (date: Date, hour?: number) => habits
    .filter((habit) => (habit.reminderTimes?.length || habit.reminderTime) && isHabitScheduledForDate(habit, date))
    .flatMap((habit) => {
      const times = habit.reminderTimes?.length ? habit.reminderTimes : (habit.reminderTime ? [habit.reminderTime] : []);
      return times
        .filter((time) => typeof hour !== 'number' || Number(time.slice(0, 2)) === hour)
        .map((reminderTime) => ({ habit, reminderTime }));
    })
    .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));

  const listTasks = [...visibleTasks].sort((a, b) => {
    if (isTimelineMode) {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'ru');
    }

    if (rankingMode === 'coefficient') {
      const aCoefficient = getTaskCoefficient(a, displayedSubtaskMap);
      const bCoefficient = getTaskCoefficient(b, displayedSubtaskMap);
      if (aCoefficient !== bCoefficient) return bCoefficient - aCoefficient;
      return a.title.localeCompare(b.title, 'ru');
    }

    if (rankingMode === 'importance') {
      if (a.importance !== b.importance) return b.importance - a.importance;
      const aUrgencyTime = getTaskUrgencyTimestamp(a);
      const bUrgencyTime = getTaskUrgencyTimestamp(b);
      if (aUrgencyTime !== bUrgencyTime) return aUrgencyTime - bUrgencyTime;
      return a.title.localeCompare(b.title, 'ru');
    }

    const aUrgencyTime = getTaskUrgencyTimestamp(a);
    const bUrgencyTime = getTaskUrgencyTimestamp(b);
    if (aUrgencyTime !== bUrgencyTime) return aUrgencyTime - bUrgencyTime;
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    if (a.importance !== b.importance) return b.importance - a.importance;
    return a.title.localeCompare(b.title, 'ru');
  });
  const activeListTasks = listTasks.filter((task) => task.status !== 'DONE');
  const currentOptimizeState = timelineOptimizeStateByMode[timelineViewMode];
  const previewDueDateByTaskId = new Map(currentOptimizeState.plan.map((item) => [item.taskId, item.dueDate]));
  const isTimelineOptimizePreviewEnabled = timelineOptimizePreviewEnabledByMode[timelineViewMode];
  const timelineRenderTasks = isTimelineOptimizePreviewEnabled
    ? listTasks.map((task) => (previewDueDateByTaskId.has(task.id) ? { ...task, dueDate: previewDueDateByTaskId.get(task.id) ?? null } : task))
    : listTasks;
  const timelineSubtasksForPreview = isTimelineOptimizePreviewEnabled
    ? subtasks.map((subtask) => (previewDueDateByTaskId.has(subtask.id) ? { ...subtask, dueDate: previewDueDateByTaskId.get(subtask.id) ?? null } : subtask))
    : subtasks;
  const timelineVisibleSubtasks = timelineSubtasksForPreview.filter((subtask) => {
    if (subtask.status === 'DONE' || !subtask.dueDate) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const parentTitle = subtask.parentTaskId ? (taskById.get(subtask.parentTaskId)?.title ?? '') : '';
    return [subtask.title, subtask.description ?? '', parentTitle].some((value) => value.toLowerCase().includes(query));
  });
  const timelineOverdueTasks = [...activeTasks, ...subtasks.filter((task) => task.status !== 'DONE')]
    .filter((task) => task.taskType !== 'EVENT' && task.taskType !== 'REMINDER' && isOverdue(task))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0));

  const postponeAllOverdueToToday = async () => {
    if (timelineOverdueBulkPostponeLoading) return;
    setTimelineOverdueBulkPostponeLoading('normal');
    try {
      const today = new Date();
      await Promise.all(timelineOverdueTasks.map(async (task) => {
        if (!task.dueDate) return;
        const next = new Date(task.dueDate);
        if (Number.isNaN(next.getTime())) return;
        next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
        await api.updateTask(task.id, { dueDate: next.toISOString() });
      }));
      await load();
    } finally {
      setTimelineOverdueBulkPostponeLoading(null);
    }
  };

  const postponeAllOverdueByAi = async () => {
    if (timelineOverdueBulkPostponeLoading) return;
    setTimelineOverdueBulkPostponeLoading('ai');
    try {
      await api.postponeOverdueWithAi();
      await refreshAiCredits();
      await load();
    } finally {
      setTimelineOverdueBulkPostponeLoading(null);
    }
  };
  const timelinePickerTasks = [...activeTimelineItems, ...subtasks.filter((task) => task.status !== 'DONE')].map((task) => ({
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    isSubtask: Boolean(task.parentTaskId),
    taskType: task.taskType,
    sphereColor: (() => {
      if (task.parentTaskId) {
        const parentTask = taskById.get(task.parentTaskId);
        const parentSphere = parentTask?.sphereId ? sphereById.get(parentTask.sphereId) : null;
        return parentSphere?.color ?? '#64748b';
      }
      const sphere = task.sphereId ? sphereById.get(task.sphereId) : null;
      return sphere?.color ?? '#64748b';
    })()
  }));
  const timelineViewData = (() => {
    try {
    return buildTimelineViewData([...timelineRenderTasks, ...timelineVisibleSubtasks], timelineAnchorDate, timelineViewMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка при рендере таймлайна';
      const stack = error instanceof Error ? error.stack : undefined;
      console.error('Ошибка при построении данных таймлайна', error);
      void api.reportClientError({
        source: 'timeline-render',
        message,
        stack,
        details: `mode=${timelineViewMode}`
      });
      return {
        title: 'Ошибка таймлайна',
        tasksWithoutDate: listTasks,
        tasksInRange: [],
        dayGroups: [],
        hourGroups: [],
        monthCells: []
      } satisfies TimelineViewData;
    }
  })();
  const isTimelineDragging = draggedTimelineTaskId !== null;
  const getTimelineRange = () => {
    const dayStart = new Date(timelineAnchorDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
    if (timelineViewMode === 'day') return { start: dayStart, end: dayEnd };
    if (timelineViewMode === 'week') {
      const start = new Date(dayStart); const offset=(start.getDay()+6)%7; start.setDate(start.getDate()-offset);
      const end = new Date(start); end.setDate(end.getDate()+7); return { start, end };
    }
    const start = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const end = new Date(dayStart.getFullYear(), dayStart.getMonth()+1, 1);
    return { start, end };
  };
  const handleOptimizeTimeline = async () => {
    setIsTimelineOptimizeModalOpen(false);
    setTimelineOptimizeLoading(true);
    try {
      const range = getTimelineRange();
      const result = await api.optimizeTimeline({ scope: timelineViewMode, periodStartIso: range.start.toISOString(), periodEndIso: range.end.toISOString(), userNote: timelineOptimizeNote.trim() || undefined });
      await refreshAiCredits();
      setTimelineOptimizeStateByMode((prev)=>({ ...prev, [timelineViewMode]: { plan: result.plan, summary: result.summary || 'Оптимизация готова.' } }));
      setTimelineOptimizePreviewEnabledByMode((prev) => ({ ...prev, [timelineViewMode]: true }));
    } finally { setTimelineOptimizeLoading(false); }
  };

  const handleTimelineTaskDrop = async (target: { date: Date; hour?: number; minute?: number; keepOriginalTime?: boolean }) => {
    const taskId = draggedTimelineTaskId;
    if (!taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const previousDueDate = task.dueDate ?? null;
    const currentDueDate = task.dueDate ? new Date(task.dueDate) : new Date();
    if (Number.isNaN(currentDueDate.getTime())) return;

    const nextDueDate = new Date(target.date);
    if (target.keepOriginalTime) {
      nextDueDate.setHours(currentDueDate.getHours(), currentDueDate.getMinutes(), 0, 0);
    } else if (typeof target.hour === 'number') {
      nextDueDate.setHours(target.hour, typeof target.minute === 'number' ? target.minute : currentDueDate.getMinutes(), 0, 0);
    }

    const nextDueDateIso = nextDueDate.toISOString();
    setTasks((prev) => prev.map((item) => (
      item.id === taskId
        ? { ...item, dueDate: nextDueDateIso, updatedAt: new Date().toISOString() }
        : item
    )));

    try {
      await api.updateTask(taskId, { dueDate: nextDueDateIso });
      setIsTimelineOverdueModalCollapsedForDrag(false);
    } catch {
      setTasks((prev) => prev.map((item) => (
        item.id === taskId
          ? { ...item, dueDate: previousDueDate, updatedAt: new Date().toISOString() }
          : item
      )));
      await load();
      setIsTimelineOverdueModalCollapsedForDrag(false);
    }
  };

  const startTaskTour = () => {
    tourRestoreStateRef.current = { displayMode, timelineViewMode, timelineAnchorDate: new Date(timelineAnchorDate) };
    setIsUpdatesOpen(false);
    setActiveTourStep(TASK_TOUR_STEPS[0].id);
  };
  const startWorkspaceTour = () => {
    tourRestoreStateRef.current = { displayMode, timelineViewMode, timelineAnchorDate: new Date(timelineAnchorDate) };
    setIsUpdatesOpen(false);
    setDisplayMode('bubbles');
    setActiveTourStep(WORKSPACE_TOUR_STEPS[0].id);
  };
  const startAiTour = () => {
    tourRestoreStateRef.current = { displayMode, timelineViewMode, timelineAnchorDate: new Date(timelineAnchorDate) };
    setIsUpdatesOpen(false);
    setActiveTourStep(AI_TOUR_STEPS[0].id);
  };
  const startFeatureTour = () => {
    tourRestoreStateRef.current = { displayMode, timelineViewMode, timelineAnchorDate: new Date(timelineAnchorDate) };
    setIsUpdatesOpen(false);
    setActiveTourStep(FEATURE_TOUR_STEPS[0].id);
  };
  const openTelegramLinkModal = async () => {
    setIsTelegramModalOpen(true);
    setTelegramLinkError(null);
    setIsTelegramLinkLoading(true);
    try {
      const result = await api.createTelegramLinkToken();
      setTelegramLinkUrl(result.deepLinkUrl);
      setTelegramLinkExpiresIn(result.expiresInSeconds);
    } catch (error) {
      const messageRaw = error instanceof Error ? error.message : 'Не удалось создать ссылку';
      const message = messageRaw.includes('Telegram link login is not configured')
        ? 'Telegram не настроен на сервере: отсутствуют TELEGRAM_BOT_TOKEN и/или TELEGRAM_BOT_USERNAME.'
        : messageRaw;
      setTelegramLinkError(message);
      setTelegramLinkUrl(null);
    } finally {
      setIsTelegramLinkLoading(false);
    }
  };
  const finishTaskTour = () => {
    const restore = tourRestoreStateRef.current;
    setActiveTourStep(null);
    setIsAddMenuOpen(false);
    setIsAiChatOpen(false);
    setEditorState(null);
    setFocusedTaskId(null);
    setIsEfficiencyDetailsOpen(false);
    setIsFocusSetupOpen(false);
    setIsFocusModeOpen(false);
    setIsTelegramModalOpen(false);
    setIsSettingsOpen(false);
    if (restore) {
      setDisplayMode(restore.displayMode);
      setTimelineViewMode(restore.timelineViewMode);
      setTimelineAnchorDate(new Date(restore.timelineAnchorDate));
    }
    tourRestoreStateRef.current = null;
  };
  const completeTaskTour = () => {
    const lessonId = typeof activeTourStep === 'string' && activeTourStep.startsWith('workspace-')
      ? 'workspace'
      : typeof activeTourStep === 'string' && activeTourStep.startsWith('ai-')
        ? 'ai'
        : typeof activeTourStep === 'string' && activeTourStep.startsWith('feature-')
          ? 'features'
          : 'tasks';
    finishTaskTour();
    void api.completeTrainingLesson(lessonId).then(({ awarded, reward, user }) => {
      setCurrentUser(user);
      if (!awarded) return;
      setTrainingRewardMessage(`Урок пройден — +${reward} рейтинга!`);
      window.setTimeout(() => setTrainingRewardMessage(null), 4000);
    }).catch((error) => console.error('Failed to complete training lesson', error));
  };
  const advanceTaskTour = () => {
    const configuredSteps = typeof activeTourStep === 'string' && activeTourStep.startsWith('workspace-')
      ? WORKSPACE_TOUR_STEPS
      : typeof activeTourStep === 'string' && activeTourStep.startsWith('ai-')
      ? AI_TOUR_STEPS
      : typeof activeTourStep === 'string' && activeTourStep.startsWith('feature-')
        ? FEATURE_TOUR_STEPS
        : TASK_TOUR_STEPS;
    const steps = configuredSteps.filter((step, stepIndex) => configuredSteps.findIndex((item) => item.id === step.id) === stepIndex);
    const index = steps.findIndex((step) => step.id === activeTourStep);
    const next = steps[index + 1];
    if (next?.id === 'feature-focus-timer') {
      const selectedIds = focusSelectedTaskIds.length > 0 ? focusSelectedTaskIds : visibleFocusCandidateTasks.slice(0, 3).map((task) => task.id);
      startFocusSession(selectedIds);
    }
    if (next?.id === 'feature-telegram-qr') void openTelegramLinkModal();
    if (next) setActiveTourStep(next.id);
    else finishTaskTour();
  };
  const isTourAddMenuOpen = activeTourStep === 'create-task' || activeTourStep === 'create-event' || activeTourStep === 'create-sector';
  const forceQuickAiPreviewOpen = activeTourStep === 'quick-ai' || activeTourStep === 'ai-quick-chat';

  return (
    <main
      className="app-shell flex h-screen flex-col overflow-y-auto p-4 lg:p-6"
      data-theme={effectiveThemeMode}
    >
      {reportPromptTask ? (
        <TaskCompletionReportDialog
          taskId={reportPromptTask.id}
          taskTitle={reportPromptTask.title}
          onClose={() => setReportPromptTask(null)}
          onNeverShow={async () => {
            const { user } = await api.updateUserSettings({ offerTaskCompletionReport: false });
            setCurrentUser(user);
          }}
          onGenerated={() => void load()}
        />
      ) : null}
      {isSettingsOpen ? createPortal(
        <div data-theme={effectiveThemeMode} className="fixed inset-0 z-[290] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSettingsOpen(false); }}>
          <section data-tour="settings-panel" data-settings-modal role="dialog" aria-modal="true" aria-label="Настройки"
            className="settings-modal-shell surface-popover light-dropdown relative flex h-[min(88dvh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--panel-border)] px-5 py-4 sm:px-6">
              <h2 className="text-xl font-bold text-primary">Настройки Планировыча</h2>
              <button type="button" className="surface-muted rounded-xl p-2 text-muted transition hover:text-primary" aria-label="Закрыть настройки"
                onClick={() => setIsSettingsOpen(false)}><X size={18} /></button>
            </div>
            <div className="settings-modal-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-6 pt-4 sm:px-6">
              <div className="surface-card light-dropdown-panel mb-3 rounded-lg border p-2">
                <div className="mb-2 text-xs font-medium text-primary">Тема интерфейса</div>
                <div className="theme-preference-switch grid grid-cols-3 gap-1 rounded-lg surface-muted p-1 text-xs" role="group" aria-label="Тема интерфейса">
                  {(['light', 'dark', 'auto'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={themeMode === mode}
                      className={`theme-preference-switch-option rounded-md px-2 py-1.5 transition ${themeMode === mode ? 'theme-preference-switch-option-active' : 'text-muted hover:brightness-110'}`}
                      onClick={() => setThemeMode(mode)}
                    >
                      {mode === 'light' ? 'Светлая' : mode === 'dark' ? 'Тёмная' : 'Авто'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-subtle">Авто: тёмная с 20:00 до 05:00 по выбранному часовому поясу.</p>
              </div>
              <div className="mb-2 text-xs text-muted">Часовой пояс пользователя</div>
              <CustomSelect detachedPopup popupVariant="settings"
                value={userTimeZone}
                onChange={(nextTimeZone) => {
                  setUserTimeZone(nextTimeZone);
                  void updateUserSettings({ timeZone: nextTimeZone }, 'timeZone');
                }}
                options={[...new Set([userTimeZone, ...TIMEZONE_OPTIONS])].map((timeZone) => ({ value: timeZone, label: timeZone }))}
                buttonClassName={settingsSavingKey === 'timeZone' ? 'cursor-not-allowed opacity-60' : ''}
                disabled={settingsSavingKey === 'timeZone'}
                ariaLabel="Часовой пояс пользователя"
              />
              <button
                type="button"
                className="surface-muted light-dropdown-item mt-2 rounded px-2 py-1 text-xs hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={settingsSavingKey === 'timeZone'}
                onClick={() => {
                  setUserTimeZone(DEFAULT_TIMEZONE);
                  void updateUserSettings({ timeZone: DEFAULT_TIMEZONE }, 'timeZone');
                }}
              >
                Сбросить на Москву
              </button>

              <div className="mt-3 border-t border-[color:var(--panel-border)] pt-3" data-tour="browser-notification-settings">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-primary">
                  <span className="inline-flex items-center gap-1.5 font-semibold"><BellRing size={14} /> Уведомления браузера</span>
                  <span className="text-[10px] text-subtle">По умолчанию включены</span>
                </div>
                <p className="mb-2 text-[11px] leading-snug text-subtle">
                  Дублируют системные уведомления, только когда вкладка Планировыча неактивна. Работают, пока сайт открыт.
                </p>
                <CustomSelect detachedPopup popupVariant="settings"
                  value={currentUser?.browserNotificationsEnabled !== false ? 'enabled' : 'disabled'}
                  onChange={(value) => {
                    const enabled = value === 'enabled';
                    void updateUserSettings({ browserNotificationsEnabled: enabled }, 'browserNotifications');
                    if (enabled && browserNotificationPermission() === 'default') void requestBrowserNotifications();
                  }}
                  options={[{ value: 'enabled', label: 'Включены' }, { value: 'disabled', label: 'Выключены' }]}
                  disabled={settingsSavingKey === 'browserNotifications'}
                  ariaLabel="Уведомления браузера"
                />
                {currentUser?.browserNotificationsEnabled !== false ? (
                  <div className="mt-2 text-[11px] text-subtle">
                    {browserPermission === 'granted' ? '✓ Разрешены в браузере' :
                      browserPermission === 'denied' ? 'Браузер запретил уведомления. Разрешите их в настройках сайта.' :
                      browserPermission === 'unsupported' ? 'Браузерные уведомления недоступны здесь (нужен HTTPS и поддержка браузера).' : (
                        <button type="button" className="surface-muted w-full rounded-lg border border-[color:var(--panel-border)] px-2 py-1.5 text-center font-semibold text-primary hover:brightness-110" onClick={() => { void requestBrowserNotifications(); }}>
                          Разрешить уведомления в браузере
                        </button>
                      )}
                  </div>
                ) : null}
              </div>

              <AiCheckupScheduleSettings user={currentUser} onUserUpdated={setCurrentUser}>
                <button type="button" onClick={() => { void generateManualCheckup(); }}
                  disabled={manualCheckupLoading}
                  className="primary-button mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-60">
                  {manualCheckupLoading ? 'Формируем ИИ-чекап…' : 'Сформировать чекап сейчас'}
                </button>
                <p className="mt-2 text-[11px] leading-snug text-subtle">Ручной запуск без ограничений по количеству дней или проверок. Кредиты списываются по фактическим токенам.</p>
                {manualCheckupError ? <p className="mt-2 text-[11px] text-rose-500" role="alert">{manualCheckupError}</p> : null}
              </AiCheckupScheduleSettings>
              {settingsError ? <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">{settingsError}</div> : null}
              <div data-tour="ai-notifications-settings" className="mt-3 border-t border-[color:var(--panel-border)] pt-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-300">
                  <span>Уведомления от ИИ</span>
                  <span
                    className="cursor-help rounded-full border border-slate-600 px-1.5 text-[10px] text-slate-300"
                    title="Настройка определяет, включён ли чекбокс ИИ-уведомлений при создании новых задач. Уже созданные задачи не меняются. Кредиты за подсказку ИИ списываются по фактическим токенам."
                  >
                    ?
                  </span>
                </div>
                <CustomSelect detachedPopup popupVariant="settings"
                  value={isAiNotificationsDefaultEnabled ? 'enabled' : 'disabled'}
                  onChange={(value) => setIsAiNotificationsDefaultEnabled(value === 'enabled')}
                  options={[{ value: 'enabled', label: 'Включены для всех задач' }, { value: 'disabled', label: 'Выключены для всех задач' }]}
                  ariaLabel="Уведомления от ИИ"
                />
              </div>
              <div className="mt-3 border-t border-[color:var(--panel-border)] pt-3">
                <div className="mb-2 text-xs font-semibold text-primary">Предлагать отчёт по выполнению задачи</div>
                <CustomSelect detachedPopup popupVariant="settings"
                  value={currentUser?.offerTaskCompletionReport !== false ? 'enabled' : 'disabled'}
                  onChange={(value) => void updateUserSettings({ offerTaskCompletionReport: value === 'enabled' }, 'taskReport')}
                  options={[{ value: 'enabled', label: 'Включено' }, { value: 'disabled', label: 'Выключено' }]}
                  ariaLabel="Предлагать отчёт по выполнению задачи"
                  disabled={settingsSavingKey === 'taskReport'}
                />
              </div>
              <div className="mt-3 border-t border-rose-500/30 pt-3">
                <div className="mb-1 text-xs font-semibold text-rose-300">Удаление аккаунта</div>
                <p className="mb-2 text-[11px] leading-snug text-subtle">Аккаунт и связанные с ним данные будут удалены без возможности восстановления.</p>
                <button
                  type="button"
                  className="danger-button w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDeletingAccount}
                  onClick={() => void deleteAccount()}
                >
                  {isDeletingAccount ? 'Удаляем аккаунт…' : 'Удалить аккаунт'}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
      <UpdatesMenu open={isUpdatesOpen} onClose={() => setIsUpdatesOpen(false)} onStartWorkspaceTour={startWorkspaceTour} onStartTaskTour={startTaskTour} onStartAiTour={startAiTour} onStartFeatureTour={startFeatureTour} completedLessonIds={currentUser.completedLessonIds ?? []} hasUnreadNews={hasUnreadNews} onNewsViewed={markLatestNewsRead} />
      {trainingRewardMessage ? <div className="training-reward-toast focus-bonus-message focus-bonus-subtask" role="status">{trainingRewardMessage}</div> : null}
      {isOnboardingOfferOpen ? (
        <div className="modal-backdrop fixed inset-0 z-[240] flex items-center justify-center p-4 backdrop-blur-md">
          <section className="surface-popover w-full max-w-lg rounded-3xl border p-6 text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="onboarding-offer-title">
            <h2 id="onboarding-offer-title" className="text-xl font-bold text-primary">Добро пожаловать в «Планировыч»!</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">Пройдите обучение по использованию «Планировыча» и заработайте свой первый рейтинг.</p>
            <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
              <button type="button" className="surface-muted rounded-xl px-5 py-2.5 text-sm font-medium text-muted transition hover:text-primary" onClick={() => { localStorage.setItem(getOnboardingOfferStorageKey(currentUser.id), '1'); setIsOnboardingOfferOpen(false); }}>Нет, спасибо</button>
              <button type="button" className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500" onClick={() => { localStorage.setItem(getOnboardingOfferStorageKey(currentUser.id), '1'); setIsOnboardingOfferOpen(false); setIsUpdatesOpen(true); }}>Пройти обучение</button>
            </div>
          </section>
        </div>
      ) : null}
      {activeTourStep ? <TourOverlay activeStep={activeTourStep} steps={typeof activeTourStep === 'string' && activeTourStep.startsWith('workspace-') ? WORKSPACE_TOUR_STEPS : typeof activeTourStep === 'string' && activeTourStep.startsWith('ai-') ? AI_TOUR_STEPS : typeof activeTourStep === 'string' && activeTourStep.startsWith('feature-') ? FEATURE_TOUR_STEPS : TASK_TOUR_STEPS} onNext={advanceTaskTour} onFinish={finishTaskTour} onComplete={completeTaskTour} /> : null}
      <header className="surface-topbar light-glass-topbar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 backdrop-blur">
        <h1 className="mr-3 flex items-center gap-2 text-xl font-semibold">
          <img src="/icon.png" alt="" className="h-7 w-7 rounded-md" />
          <span>Планировыч AI</span>
        </h1>
        <button
          type="button"
          data-tour="feature-telegram-button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/40 bg-slate-900/85 text-cyan-200 transition hover:border-cyan-300 light-icon-button"
          aria-label="Подключить Telegram"
          title="Подключить Telegram"
          onClick={() => void openTelegramLinkModal()}
        >
          <Smartphone size={18} />
        </button>

        <WorkspaceGlobalSearch
          key={currentUser.id}
          userId={currentUser.id}
          value={search}
          onChange={setSearch}
          tasks={tasks}
          subtasks={subtasks}
          onOpenTask={openTaskWithFocusGuard}
          onOpenSubtask={(subtask) => setEditorState({ task: subtask })}
          onOpenNote={(id) => setRequestedStandaloneNote({ id, serial: Date.now() })}
        />
        <TelegramIntegrationsMenu onConnectBot={() => void openTelegramLinkModal()} />
        <a className="public-nav-link shrink-0 px-2 py-2 text-sm" href="/about">О сервисе</a>
        <div className="auth-actions" aria-label="Управление аккаунтом">
          {hasAccount ? (
            <>
              <button type="button" className="auth-user-pill" title={`${accountDisplayName} — изменить профиль`} onClick={openProfileModal}>
                <UserRound size={16} aria-hidden="true" />
                <span>{accountDisplayName}</span>
              </button>
              <button
                type="button"
                className="auth-logout-button"
                onClick={async () => {
                  try {
                    await api.logout();
                  } finally {
                    const me = await api.getMe();
                    setCurrentUser(me.user);
                    setAuthError(null);
                  }
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <button type="button" className="auth-login-button" onClick={() => setAuthModalMode('login')}>Войти</button>
              <button type="button" className="auth-register-button" onClick={() => setAuthModalMode('register')}>Регистрация</button>
            </>
          )}
        </div>
      </header>

      {!sectorEditorSphere ? <section className="top-control-bar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 backdrop-blur">
        <button type="button" className="updates-menu-trigger relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" onClick={() => setIsUpdatesOpen(true)} aria-label="Открыть обновления и обучение" title="Обновления и обучение"><Menu size={20} />{hasUnreadNews ? <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">1</span> : null}</button>
        <div data-tour="display-modes" className="display-mode-toggle-group inline-flex shrink-0 items-center rounded-xl border p-1">
          {DISPLAY_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`display-mode-toggle-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${displayMode === option.value ? 'display-mode-toggle-button-active' : ''}`}
              onClick={() => setDisplayMode(option.value)}
              aria-pressed={displayMode === option.value}
              title={option.label}
            >
              <option.icon size={16} className={option.iconClassName} />
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </div>

        <div data-tour="workspace-filters" className="top-filter-cluster flex flex-wrap items-center gap-2 md:ml-4">
          <div className="relative min-w-48" data-sphere-filter-root="true">
            <button
              className={`topbar-select-button light-sector-filter-trigger flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                isTimelineMode ? 'cursor-not-allowed opacity-60' : ''
              }`}
              disabled={isTimelineMode}
              onClick={() => setIsSphereFilterOpen((prev) => !prev)}
            >
              <span className="truncate">{sphereFilterLabel}</span>
              <ChevronDown size={15} className={`ml-2 shrink-0 transition ${isSphereFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            {isSphereFilterOpen ? (
              <div className="light-sector-filter-panel topbar-dropdown absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-2xl border p-2 shadow-2xl backdrop-blur">
                <label className="light-sector-filter-item topbar-dropdown-item mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm">
                  <input type="checkbox" checked={isAllSpheresSelected} onChange={(event) => { setSelectedSphereIds(event.target.checked ? spheres.map((sphere) => sphere.id) : []); }} />
                  <span>Все сектора</span>
                </label>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {spheres.map((sphere) => (
                    <label key={sphere.id} className="light-sector-filter-item topbar-dropdown-item flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm">
                      <input type="checkbox" checked={selectedSphereIds.includes(sphere.id)} onChange={() => toggleSphereSelection(sphere.id)} />
                      <span className="truncate">{sphere.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <CustomSelect
            value={timeFilter}
            onChange={(value) => setTimeFilter(value as 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus')}
            options={[{ value: 'all', label: 'За все время' }, { value: 'today', label: 'За сегодня' }, { value: 'tomorrow', label: 'За завтра' }, { value: 'week', label: 'За эту неделю' }, { value: 'month', label: 'За этот месяц' }, { value: 'focus', label: 'Фокус' }]}
            className="min-w-44"
            buttonClassName={`topbar-select-button rounded-xl ${isTimelineMode ? 'cursor-not-allowed opacity-60' : ''}`}
            menuClassName="topbar-dropdown"
            disabled={isTimelineMode}
            ariaLabel="Фильтр по времени"
          />
          <CustomSelect
            value={isBubblesMode ? 'coefficient' : rankingMode}
            onChange={(value) => setRankingMode(value as BubbleRankingMode)}
            options={isBubblesMode ? [{ value: 'coefficient', label: 'По коэффициенту' }] : [{ value: 'urgency', label: 'По срочности' }, { value: 'importance', label: 'По важности' }, { value: 'coefficient', label: 'По коэффициенту' }]}
            className="min-w-52"
            buttonClassName={`topbar-select-button rounded-xl ${isTimelineMode ? 'cursor-not-allowed opacity-60' : isBubblesMode ? 'cursor-default' : ''}`}
            menuClassName="topbar-dropdown"
            disabled={isTimelineMode}
            ariaLabel="Фильтр важности"
          />
        </div>

        <div className="relative hidden md:flex items-center justify-center px-1" ref={efficiencyDetailsRef}>
          <button type="button" className="efficiency-icon-button rounded-full p-1.5" title={`Текущий рейтинг: ${formattedEfficiencyScore}/100 (${efficiencyGrade})`} onClick={() => setIsEfficiencyDetailsOpen((prev) => !prev)}>
            <svg width="54" height="54" viewBox="0 0 72 72" role="img" aria-label="Рейтинг эффективности" className="efficiency-orb-icon"><defs><linearGradient id="effOrbFill" x1="10" y1="10" x2="62" y2="62"><stop offset="0%" stopColor="#38bdf8" /><stop offset="45%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#f472b6" /></linearGradient><linearGradient id="effOrbRing" x1="12" y1="58" x2="60" y2="14"><stop offset="0%" stopColor="#22d3ee" /><stop offset="55%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#fb7185" /></linearGradient></defs><circle cx="36" cy="36" r="25" fill="url(#effOrbFill)" opacity="0.18" /><circle cx="36" cy="36" r="26" fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth="5" /><circle cx="36" cy="36" r="26" fill="none" stroke="url(#effOrbRing)" strokeWidth="5" strokeLinecap="round" pathLength={100} strokeDasharray={`${efficiencyScore} 100`} transform="rotate(-90 36 36)" /><path d="M36 17l5.4 12.1 13.1 1.4-9.8 8.8 2.8 12.9L36 45.5l-11.5 6.7 2.8-12.9-9.8-8.8 13.1-1.4L36 17z" fill="url(#effOrbFill)" /></svg>
          </button>
          {isEfficiencyDetailsOpen ? (
            <div data-tour="feature-rating" className="efficiency-details-popover efficiency-details-popover-modern absolute left-1/2 top-[calc(100%+8px)] z-40 w-80 -translate-x-1/2 rounded-[1.6rem] border p-4 text-xs shadow-2xl backdrop-blur"><div className="text-center"><div className="efficiency-score-hero tabular-nums">{formattedEfficiencyScore}/100</div><p className="mt-1 text-sm font-semibold text-primary">{efficiencyGradeMessage}</p></div><div className="mt-4 space-y-2"><div className="efficiency-detail-row"><span>Задачи</span><b>+{formatRatingDelta(efficiencyTaskRating)} рейтинга</b></div><div className="efficiency-detail-row"><span>Привычки</span><b>+{formatRatingDelta(efficiencyHabitRating)} рейтинга</b></div><div className="efficiency-detail-row"><span>Работа с ИИ</span><b>+{formatRatingDelta(efficiencyAiRating)} рейтинга</b></div><div className="efficiency-detail-row efficiency-detail-row-focus"><span>Режим концентрации (х2)</span><b>+{formatRatingDelta(efficiencyFocusRating)} рейтинга</b></div></div></div>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button data-tour="feature-focus-button" type="button" onClick={openFocusSetup} className="focus-mode-button topbar-action-button flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-violet-300" title="Режим фокуса с ИИ"><Bot size={16} /> Фокус</button>
          <button data-tour="credits" type="button" onClick={() => { if (currentUser?.isGuest) { setAuthError(null); setAuthModalMode('register'); } else { setCreditModalView('purchase'); setIsSubscriptionModalOpen(true); } }} className="light-credit-badge topbar-action-button flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400" title={currentUser?.isGuest ? 'Зарегистрируйтесь, чтобы получить 100 ИИ-кредитов' : 'Посмотреть подписки и увеличить ИИ-кредиты'}><Coins size={15} /><span>Кредиты: {currentUser?.aiCredits ?? 0}</span></button>
          <div className="add-menu-wrap relative" onMouseEnter={() => setIsAddMenuOpen(true)} onMouseLeave={() => { if (!isTourAddMenuOpen) setIsAddMenuOpen(false); }}>
            <button data-tour="create-task" className="add-menu-trigger light-primary-action inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => setIsAddMenuOpen((prev) => !prev)}><Plus size={16} /> Новая задача <ChevronDown size={14} /></button>
            {isAddMenuOpen || isTourAddMenuOpen ? <div className="add-menu-popover topbar-dropdown absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 rounded-2xl border p-2 shadow-2xl"><button className="add-menu-option add-menu-option-task flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold" onClick={() => { setEditorState({ initialSphereId: spheres[0]?.id }); setIsAddMenuOpen(false); }}><FileText size={14} />Новая задача</button><button data-tour="create-event" className="add-menu-option add-menu-option-event mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold" onClick={() => { setEditorState({ task: { id: '', title: '', description: '', status: 'TODO', importance: 3, urgency: 3, priorityScore: 0, sphereId: spheres[0]?.id ?? null, dueDate: null, parentTaskId: null, taskType: 'EVENT', location: '', notifyBeforeMinutes: 0, isRecurring: false, aiNotificationsEnabled: false } }); setIsAddMenuOpen(false); }}><CalendarDays size={14} />Новое событие</button><button data-tour="create-sector" className="add-menu-option add-menu-option-sector mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={spheres.length >= MAX_SPHERES} onClick={() => { setSectorEditorSphere({ id: '', name: '', color: HARMONIOUS_COLORS[0], icon: 'briefcase' }); setIsAddMenuOpen(false); }}><BriefcaseBusiness size={14} />Новый сектор</button></div> : null}
          </div>
          <div className="relative shrink-0" ref={settingsMenuRef}>
            <button className="surface-popover light-menu-trigger topbar-settings-button inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:border-cyan-300/70" onClick={() => setIsSettingsOpen((prev) => !prev)} aria-label="Настройки" title="Настройки"><Settings size={17} /></button>
          </div>
        </div>
      </section> : null}


      {isFocusSetupOpen ? (
        <div className="modal-backdrop fixed inset-0 z-[135] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsFocusSetupOpen(false)}>
          <div data-tour="feature-focus-setup" className="focus-setup-modal dialog-surface flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700"><Bot size={14} /> Режим концентрации</div>
                <h2 className="mt-3 text-2xl font-bold text-primary">Выберите до 5 главных задач на сейчас</h2>
                <p className="mt-1 text-sm text-muted">Можно выбрать вручную или доверить подбор задачам с максимальным коэффициентом.</p>
              </div>
              <button className="rounded-full p-2 text-muted transition hover:bg-slate-100" onClick={() => setIsFocusSetupOpen(false)} aria-label="Закрыть"><X size={18} /></button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setFocusSelectedTaskIds(visibleFocusCandidateTasks.slice(0, FOCUS_MAX_TASKS).map((task) => task.id))}>Подобрать автоматически</button>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600">Выбрано: {focusSelectedTaskIds.length}/{FOCUS_MAX_TASKS}</span>
              <div className="focus-sector-dropdown relative">
                <button type="button" className="focus-sector-dropdown-button inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600" onClick={() => setIsFocusSphereDropdownOpen((prev) => !prev)}>
                  <span>Сектор:</span><span className="font-semibold">{focusSphereFilterId === 'all' ? 'Все' : (spheres.find((sphere) => sphere.id === focusSphereFilterId)?.name ?? 'Все')}</span><ChevronDown size={14} />
                </button>
                {isFocusSphereDropdownOpen ? (
                  <div className="focus-sector-dropdown-menu absolute left-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-2xl">
                    {[{ id: 'all', name: 'Все', color: '#7c3aed' }, ...spheres].map((sphere) => (
                      <button key={sphere.id} type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-violet-50" onClick={() => { setFocusSphereFilterId(sphere.id); setIsFocusSphereDropdownOpen(false); }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sphere.color }} />
                        <span className="font-medium">{sphere.name}</span>
                        {focusSphereFilterId === sphere.id ? <Check size={14} className="ml-auto text-violet-600" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto px-1 pt-2 sm:grid-cols-2">
              {visibleFocusCandidateTasks.map((task) => {
                const selected = focusSelectedTaskIds.includes(task.id);
                const sphere = task.sphereId ? spheres.find((item) => item.id === task.sphereId) : null;
                return (
                  <button key={task.id} type="button" onClick={() => toggleFocusTaskSelection(task.id)} className={`focus-task-pick rounded-2xl border p-4 text-left transition ${selected ? 'selected' : ''}`}>
                    <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-primary">{task.title}</h3>{selected ? <Check className="text-violet-600" size={18} /> : null}</div>
                    {sphere ? <span className="mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-sm" style={{ backgroundColor: sphere.color }}>{sphere.name}</span> : null}
                    <p className="mt-2 line-clamp-2 text-xs text-muted">{noteHtmlToPlainText(task.description ?? '', { trimEnd: true }) || 'Описание не заполнено'}</p>
                    <p className="mt-3 text-xs font-semibold text-violet-600">Коэффициент: {getTaskCoefficient(task).toFixed(2)}</p>
                  </button>
                );
              })}
              {visibleFocusCandidateTasks.length === 0 ? <p className="text-sm text-muted">Нет активных задач для концентрации в выбранном секторе.</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="surface-muted rounded px-4 py-2 text-sm" onClick={() => setIsFocusSetupOpen(false)}>Отмена</button>
              <button className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={focusSelectedTaskIds.length < FOCUS_MIN_TASKS || focusSelectedTaskIds.length > FOCUS_MAX_TASKS} onClick={() => startFocusSession(focusSelectedTaskIds)}>Начать</button>
            </div>
          </div>
        </div>
      ) : null}

      {isFocusModeOpen && focusActiveTask ? (
        <div className="modal-backdrop fixed inset-0 z-[134] flex items-center justify-center p-3 backdrop-blur-sm">
          <div className="focus-mode-shell relative grid h-[min(760px,calc(100vh-24px))] w-full max-w-[1500px] gap-4 overflow-hidden rounded-3xl border p-4 shadow-2xl lg:grid-cols-[260px_minmax(360px,1fr)_430px]" onClick={(event) => event.stopPropagation()}>
            <aside data-tour="feature-focus-timer" className="focus-side-panel flex min-h-0 flex-col overflow-y-auto rounded-3xl border p-4">
              <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус-сессия</p>
              <div className="flex min-h-0 flex-1 flex-col justify-center">
                <div className="mb-4 mt-6 space-y-2">{(['time', 'ai', 'subtask', 'task'] as const).map((type) => focusBonusEvents[type] ? <div key={focusBonusEvents[type]!.id} className={`focus-bonus-message focus-bonus-${type}`}>{focusBonusEvents[type]!.message}</div> : null)}</div><div className="my-6 text-center text-5xl font-black tabular-nums text-slate-900">{formatFocusTime(focusRemainingSeconds)}</div>
                <CustomSelect
                  value={String(focusTimerMinutes)}
                  onChange={(value) => handleFocusTimerMinutesChange(Number(value))}
                  options={FOCUS_TIMER_OPTIONS.map((value) => ({ value: String(value), label: `${value} минут${FOCUS_RECOMMENDED_MINUTES.has(value) ? ' · рекомендовано' : ''}` }))}
                  disabled={isFocusTimerRunning}
                  buttonClassName={`focus-timer-select-trigger ${isFocusTimerRunning ? 'cursor-not-allowed opacity-60' : ''}`}
                  menuClassName="task-edit-notify-menu focus-timer-select-menu"
                  detachedPopup
                  ariaLabel="Длительность фокус-сессии"
                />
                <div className="mt-4 flex justify-center gap-3">
                  <button className="focus-timer-control primary" onClick={() => isFocusTimerRunning ? setIsFocusTimerRunning(false) : startFocusTimer()}>{isFocusTimerRunning ? <Pause size={20} /> : <Play size={20} />}</button>
                  <button className="focus-timer-control" onClick={stopFocusTimer}><Square size={18} /></button>
                </div>
                <p className="mt-4 text-center text-xs text-muted">После запуска можно закрыть окно — таймер останется в правом нижнем углу.</p>
                {isFocusSessionFinished ? <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900"><p className="font-semibold">Резюме сессии</p><p className="mt-1">Закрыто подзадач: {focusCompletedSubtasksCount}</p><p>Запросов к ИИ: {focusSessionAiRequestCount}</p><p>Заработано рейтинга: +{focusSessionRatingEarned.toFixed(1).replace(/\.0$/, '')}</p></div> : null}
              </div>
            </aside>
            <main data-tour="feature-focus-task" className="focus-task-stack relative flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden">
              <div className="focus-card-peek -mb-1">{focusTasks[(focusActiveIndex - 1 + focusTasks.length) % focusTasks.length]?.title}</div>
              <button className="focus-stack-arrow absolute top-[4.25rem] z-10" onClick={() => switchFocusTask(-1)}><ChevronUp size={22} /></button>
              <motion.article key={focusActiveTask.id} initial={{ opacity: 0, y: 44, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="focus-main-card flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-hidden rounded-[2rem] border p-6 shadow-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Текущая задача</p>
                <div className="mt-2 flex items-start justify-between gap-3"><button type="button" className="text-left text-3xl font-bold text-slate-950 hover:underline" onClick={() => { setFocusedTaskId(focusActiveTask.id); setIsFocusedNotesEditorOpen(false); }}>{focusActiveTask.title}</button><button type="button" className="success-button shrink-0 rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => void completeTask(focusActiveTask)}>Выполнить</button></div>
                <p className="mt-1 text-sm font-medium text-violet-500">{focusActiveTask.dueDate ? `До дедлайна: ${formatSubtaskRelativeDeadline(focusActiveTask.dueDate)}` : 'Дедлайн не задан'}</p>
                <div className="mt-3 flex min-h-0 items-start">
                  <p className="focus-task-description min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-muted">{noteHtmlToPlainText(focusActiveTask.description ?? '', { trimEnd: true }) || 'Описание не заполнено.'}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-semibold text-primary">
                    Подзадачи
                    <button
                      type="button"
                      className={`rounded p-1 ${hideClosedFocusedSubtasks ? 'text-cyan-200' : 'text-muted hover:brightness-110'}`}
                      onClick={() => setHideClosedFocusedSubtasks((prev) => !prev)}
                      title={hideClosedFocusedSubtasks ? 'Показывать закрытые подзадачи' : 'Скрывать закрытые подзадачи'}
                      aria-label={hideClosedFocusedSubtasks ? 'Показывать закрытые подзадачи' : 'Скрывать закрытые подзадачи'}
                    >
                      {hideClosedFocusedSubtasks ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </h3>
                  <div className="relative">
                    <button
                      type="button"
                      className={`focused-task-action-pill ${subtaskFilterMode !== 'none' || Boolean(subtaskAuthorFilterByTaskId[focusActiveTask.id]) ? 'focused-task-action-pill-active' : 'focused-task-action-pill-filter'}`}
                      onClick={() => setIsSubtaskFilterOpen((prev) => !prev)}
                    >
                      Фильтровать
                    </button>
                    {isSubtaskFilterOpen ? (
                      <div className="subtask-filter-panel absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-52 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur">
                        {SUBTASK_FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.mode}
                            type="button"
                            className={`subtask-filter-item block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${subtaskFilterMode === option.mode ? 'subtask-filter-item-active bg-cyan-500/25 text-cyan-100' : 'text-slate-200 hover:bg-slate-800/80'}`}
                            onClick={() => {
                              setSubtaskFilterMode(option.mode);
                              if (option.mode === 'none') setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusActiveTask.id]: null }));
                              setIsSubtaskFilterOpen(false);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                        {focusActiveTask.isCollaborative && focusActiveTask.collaborationMembers?.length ? (
                          <div className="mt-1 border-t border-slate-700/70 pt-2">
                            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">По участнику</p>
                            <div className="flex flex-wrap gap-1.5 p-1">
                              <button type="button" aria-pressed={!subtaskAuthorFilterByTaskId[focusActiveTask.id]} className={`shrink-0 rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-semibold text-white transition ${!subtaskAuthorFilterByTaskId[focusActiveTask.id] ? 'ring-2 ring-white/90' : 'opacity-80 hover:opacity-100'}`} onClick={() => { setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusActiveTask.id]: null })); setIsSubtaskFilterOpen(false); }}>Все</button>
                              {focusActiveTask.collaborationMembers.map((member) => (
                                <button
                                  key={member.userId}
                                  type="button"
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm transition ${subtaskAuthorFilterByTaskId[focusActiveTask.id] === member.userId ? 'ring-2 ring-white/90' : 'opacity-80 hover:opacity-100'}`}
                                  style={{ backgroundColor: member.color }}
                                  onClick={() => {
                                    setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusActiveTask.id]: prev[focusActiveTask.id] === member.userId ? null : member.userId }));
                                    setIsSubtaskFilterOpen(false);
                                  }}
                                >
                                  {member.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <ul ref={focusModeSubtaskListScrollRef} className="focus-subtask-list mt-3 min-h-0 space-y-2 overflow-y-auto pr-1" onScroll={() => setIsSubtaskFilterOpen(false)}>
                  {(hideClosedFocusedSubtasks ? getFocusedSubtaskItems(focusActiveTask.id).filter((subtask) => subtask.status !== 'DONE') : getFocusedSubtaskItems(focusActiveTask.id)).map((subtask) => (
                    <li key={subtask.id} className={`focused-subtask-row relative flex items-center gap-2 overflow-hidden rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${subtask.status === 'DONE' ? 'opacity-60' : ''} ${closingTaskIds.includes(subtask.id) ? 'focused-subtask-row-completing ring-1 ring-emerald-300/70' : ''} ${subtaskFilterMode === 'importance' ? 'focused-subtask-row-importance' : ''}`}
                      style={subtaskFilterMode === 'importance' ? ({ '--subtask-importance-accent': IMPORTANCE_ACCENT_COLORS[subtask.importance ?? 3] ?? IMPORTANCE_ACCENT_COLORS[3] } as CSSProperties) : undefined}
                      onContextMenu={(event) => handleSubtaskCommentContextMenu(event, subtask, Boolean(focusActiveTask.isCollaborative))}>
                      <input type="checkbox" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} onClick={(event) => event.stopPropagation()} />
                      {closingTaskIds.includes(subtask.id) ? <Check size={13} className="timeline-task-chip-success shrink-0" /> : null}
                      <button type="button" className={`min-w-0 flex-1 truncate text-left hover:text-violet-700 ${subtask.status === 'DONE' || closingTaskIds.includes(subtask.id) ? 'timeline-task-chip-completed line-through opacity-60 decoration-2' : ''}`} onClick={() => setEditorState({ task: subtask })}>{subtask.title}</button>
                      {renderWorkspaceAttachmentIndicator(subtask)}
                      {subtask.dueDate ? <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-violet-500" title={`До дедлайна: ${formatDeadlineLeft(subtask.dueDate)}`}>{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
                      {focusActiveTask.isCollaborative ? renderSubtaskCommentButton(subtask) : null}
                      {focusActiveTask.isCollaborative && subtask.creatorName ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ backgroundColor: subtask.creatorColor ?? '#8b5cf6' }}>{subtask.creatorName}</span> : null}
                      <InlineDateTimePickerIcon value={subtask.dueDate} title="Изменить срок подзадачи" timelineTasks={timelinePickerTasks} onChange={async (dueDate) => { await api.updateTask(subtask.id, { dueDate }); await load(); }} />
                    </li>
                  ))}
                  {(hideClosedFocusedSubtasks ? getFocusedSubtaskItems(focusActiveTask.id).filter((subtask) => subtask.status !== 'DONE') : getFocusedSubtaskItems(focusActiveTask.id)).length === 0 ? <li className="text-sm text-subtle">{hideClosedFocusedSubtasks ? 'Активных подзадач пока нет.' : 'Подзадач пока нет.'}</li> : null}
                </ul>
              </motion.article>
              <button className="focus-stack-arrow absolute bottom-[4.25rem] z-10" onClick={() => switchFocusTask(1)}><ChevronDown size={22} /></button>
              <div className="focus-card-peek -mt-1">{focusTasks[(focusActiveIndex + 1) % focusTasks.length]?.title}</div>
            </main>
            <aside data-tour="feature-focus-ai" className="ai-chat-lightweight focused-task-ai-panel focus-ai-panel focus-shared-task-ai-panel relative flex min-h-0 flex-col overflow-hidden rounded-3xl border p-4">
              <div className="focus-task-ai-header flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0 flex shrink-0 items-center gap-2"><Bot size={18} className="focus-task-ai-bot-icon shrink-0" /><h3 className="truncate font-semibold ai-panel-title">Помощь ИИ</h3></div>
                <div className="focus-task-ai-header-actions flex min-w-0 items-center justify-end gap-2">
                  <TaskMonitoringStatuses taskId={focusActiveTask.id}
                    enabled={focusActiveTask.aiMonitoringEnabled === true}
                    allowed={focusActiveTask.taskType === 'TASK' && !focusActiveTask.parentTaskId && !focusActiveTask.isCollaborative}
                    onTaskUpdated={updated => setTasks(prev => prev.map(task => task.id === updated.id ? updated : task))} />
                  <button type="button" className="focused-task-ai-icon-button shrink-0" onClick={() => setIsFocusAiExpanded(true)} title="Открыть полноразмерный диалог"><Maximize2 size={15} /></button>
                  <button type="button" className="focused-task-ai-icon-button shrink-0" onClick={() => setIsFocusModeOpen(false)} title="Закрыть режим концентрации" aria-label="Закрыть режим концентрации"><X size={15} /></button>
                </div>
              </div>
              <div className="focused-task-ai-thread-region relative mt-2 min-h-0 flex-1">
                <AiModelChip value={focusTaskAiModel} onChange={model => setAiModelByTask(prev => ({ ...prev, [focusActiveTask.id]: model }))} ariaLabel="Выбрать модель ИИ для задачи" className="absolute left-1/2 top-px z-20 -translate-x-1/2" />
                <div ref={focusAiDialogContainerRef} className="chat-thread focused-task-ai-thread-through h-full min-h-0 space-y-3 overflow-y-auto rounded-xl p-3 pt-12">
                  {focusTaskAiDialog.map((message) => <div key={message.id} className={`ai-message-forward-group w-fit max-w-[92%] ${message.role === 'assistant' ? 'mr-auto' : 'ml-auto'}`}><div className={`chat-message w-full rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user'}`}><div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focus-${message.id}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focus-${message.id}` ? <Check size={12} /> : <Copy size={12} />}</button> : null}</div>{message.messageKind === 'MONITOR_ACTION' ? <TaskMonitoringActionBadge content={message.content} /> : message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={openTaskReferenceFromAi} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}{message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} searched={message.webSearchUsed} /> : null}{message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} /> : null}
                    {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[10px] text-muted opacity-75">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}{message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} onApplied={() => void load()} /> : null}{message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={(approval) => continueTelegramReadTask(approval, focusActiveTask!.id, true)} /> : null}
                    </div><div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={(target) => setReplyToFocusAi(target)} /><TelegramMessageQuickShare text={message.content} compact initialNoteSphereId={focusActiveTask?.sphereId ?? null} /></div></div>)}
                  {focusActiveTask.aiMonitoringEnabled ? <TaskMonitoringTriggerChips taskId={focusActiveTask.id} enabled /> : null}
                  {aiLoadingTaskId === focusActiveTask.id && focusAiProgress ? <TaskAiProgress status={focusAiProgress} /> : focusActiveTask.aiMonitoringEnabled ? <TaskMonitoringIntroProgress taskId={focusActiveTask.id} /> : null}
                </div>
              </div>
              <div className="focused-task-ai-composer">
              {focusAiError ? <p className="mt-2 text-xs text-rose-500">{focusAiError}</p> : null}
              {replyToFocusAi ? <AiReplyPreview target={replyToFocusAi} onDismiss={() => setReplyToFocusAi(null)} /> : null}
              {renderTaskAiRecipientPicker(focusActiveTask)}
<AiAttachmentTiles files={focusAiPendingFiles} onRemove={(file) => removeFocusAiPendingFile(file.name)} busy={focusAiLoading} uploadProgress={focusAiUploadProgress} />
              <div className="ai-chat-composer mt-3 flex items-end gap-2 rounded-3xl border p-2"><AutoGrowingTextarea className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm focus:ring-0" value={focusAiDraft} onChange={(e) => setFocusAiDraft(e.target.value)} onPaste={(event) => { const files = clipboardImageFiles(event.clipboardData); if (files.length) { event.preventDefault(); addFocusAiClipboardImages(files); } }} onKeyDown={(event) => { if (shouldSendAiMessageOnEnter(event)) { event.preventDefault(); void sendFocusAiQuestion(); } }} placeholder="Напишите сообщение…" disabled={focusAiLoading} /><input ref={focusAiFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleFocusAiFileSelect} /><button className="surface-muted inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted disabled:opacity-50" title="Прикрепить файл" disabled={focusAiLoading} onClick={() => focusAiFileInputRef.current?.click()}><Paperclip size={16} /></button><button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg disabled:opacity-50" title="Отправить" disabled={focusAiLoading || (!focusAiDraft.trim() && focusAiPendingFiles.length === 0)} onClick={() => void sendFocusAiQuestion()}>{aiLoadingTaskId ===      {isFocusModeOpen && isFocusAiExpanded && focusActiveTask ? (
        <div className="fixed inset-0 z-[151] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setIsFocusAiExpanded(false)}>
          <div className="ai-chat-lightweight ai-chat-lightweight-panel app-card focused-task-ai-expanded-panel focus-task-ai-expanded-panel relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border p-5" onClick={(event) => event.stopPropagation()}>
            <div className="task-ai-fullscreen-header mb-3 flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-semibold ai-panel-title"><Bot size={18} /> Полноэкранный диалог с ИИ</p>
                <p className="mt-1 max-w-[42ch] truncate text-xs text-muted" title={focusActiveTask.title}>{focusActiveTask.title}</p>
              </div>
              <div className="task-ai-fullscreen-actions flex shrink-0 flex-wrap items-center justify-end gap-3">
                <div className="task-ai-fullscreen-monitor shrink-0">
                  <TaskMonitoringStatuses taskId={focusActiveTask.id}
                    enabled={focusActiveTask.aiMonitoringEnabled === true}
                    allowed={focusActiveTask.taskType === 'TASK' && !focusActiveTask.parentTaskId && !focusActiveTask.isCollaborative}
                    onTaskUpdated={updated => setTasks(prev => prev.map(task => task.id === updated.id ? updated : task))} />
                </div>
                <button type="button" className="task-ai-clear-dialog-button"
                  onClick={() => void clearTaskAiDialog(focusActiveTask.id)}
                  disabled={clearingTaskAiId === focusActiveTask.id || aiLoadingTaskId === focusActiveTask.id}
                  title="Очистить историю диалога по этой задаче"
                ><Trash2 size={14} /> {clearingTaskAiId === focusActiveTask.id ? 'Очищаю…' : 'Очистить'}</button>
                <div className="task-ai-fullscreen-window-actions flex items-center gap-2">
                  <button type="button" className={`focused-task-ai-icon-button ${isFocusAiSearchOpen ? 'focused-task-ai-icon-button-active' : ''}`}
                    onClick={() => setIsFocusAiSearchOpen(prev => !prev)} title="Поиск по диалогу"><Search size={14} /></button>
                  <button type="button" className="focused-task-ai-icon-button" onClick={() => setIsFocusAiExpanded(false)} title="Свернуть"><Minimize2 size={14} /></button>
                  <button type="button" className="focused-task-ai-icon-button" onClick={() => { setIsFocusAiExpanded(false); setIsFocusModeOpen(false); }} title="Закрыть"><X size={14} /></button>
                </div>
              </div>
            </div>
            <AiModelChip value={focusTaskAiModel} onChange={model => setAiModelByTask(prev => ({ ...prev, [focusActiveTask.id]: model }))} ariaLabel="Выбрать модель ИИ для задачи" className="absolute left-1/2 top-[4.5rem] z-20 -translate-x-1/2" />
            <div ref={focusAiExpandedDialogContainerRef} className="chat-thread focused-task-ai-thread-through min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl p-4 pt-12">
              {isFocusAiSearchOpen ? (
                <label className="surface-input sticky top-0 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted">
                  <Search size={12} />
                  <input className="w-full bg-transparent text-xs text-primary placeholder:text-subtle focus:outline-none"
                    placeholder="Поиск по сообщениям" value={focusAiSearchQuery}
                    onChange={event => setFocusAiSearchQuery(event.target.value)} />
                </label>
              ) : null}
                {focusTaskAiDialog.filter(message => !isFocusAiSearchOpen || !focusAiSearchQuery.trim() ||
                  message.content.toLowerCase().includes(focusAiSearchQuery.trim().toLowerCase())).map((message) => <div key={message.id} className={`ai-message-forward-group w-fit max-w-[82%] ${message.role === 'assistant' ? 'mr-auto' : 'ml-auto'}`}><div className={`chat-message w-full rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'chat-message-assistant' : 'chat-message-user'}`}><div className="mb-1 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focus-expanded-${message.id}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focus-expanded-${message.id}` ? <Check size={12} /> : <Copy size={12} />}</button> : null}</div>{message.messageKind === 'MONITOR_ACTION' ? <TaskMonitoringActionBadge content={message.content} /> : message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={(task) => { setIsFocusAiExpanded(false); openTaskReferenceFromAi(task); }} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}{message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} searched={message.webSearchUsed} /> : null}{message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} /> : null}
                    {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[11px] text-muted opacity-75">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}{message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} onApplied={() => void load()} /> : null}{message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={(approval) => continueTelegramReadTask(approval, focusActiveTask!.id, true)} /> : null}
                    </div><div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={(target) => setReplyToFocusAi(target)} /><TelegramMessageQuickShare text={message.content} compact initialNoteSphereId={focusActiveTask?.sphereId ?? null} /></div></div>)}
                {focusActiveTask.aiMonitoringEnabled ? <TaskMonitoringTriggerChips taskId={focusActiveTask.id} enabled /> : null}
                {aiLoadingTaskId === focusActiveTask.id && focusAiProgress ? <TaskAiProgress status={focusAiProgress} /> : focusActiveTask.aiMonitoringEnabled ? <TaskMonitoringIntroProgress taskId={focusActiveTask.id} /> : null}
            </div>
            <div className="focused-task-ai-composer focused-task-ai-composer-expanded">
            {focusAiError ? <p className="mt-2 text-xs text-rose-500">{focusAiError}</p> : null}
            {replyToFocusAi ? <AiReplyPreview target={replyToFocusAi} onDismiss={() => setReplyToFocusAi(null)} /> : null}
              {renderTaskAiRecipientPicker(focusActiveTask)}
            {focusAiPendingFiles.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{focusAiPendingFiles.map((file) => <button key={file.name} type="button" className="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-700" onClick={() => removeFocusAiPendingFile(file.name)}>📎 {file.name} ×</button>)}</div> : null}
            <div className="ai-chat-composer mt-3 flex items-center gap-2 rounded-3xl border p-2">
              <AutoGrowingTextarea className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm focus:ring-0" value={focusAiDraft} onChange={(e) => setFocusAiDraft(e.target.value)} onPaste={(event) => { const files = clipboardImageFiles(event.clipboardData); if (files.length) { event.preventDefault(); addFocusAiClipboardImages(files); } }} onKeyDown={(event) => { if (shouldSendAiMessageOnEnter(event)) { event.preventDefault(); void sendFocusAiQuestion(); } }} placeholder="Напишите сообщение…" disabled={focusAiLoading} />
              <input ref={focusAiExpandedFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleFocusAiFileSelect} />
              <button className="surface-muted inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted disabled:opacity-50" title="Прикрепить файл" disabled={focusAiLoading} onClick={() => focusAiExpandedFileInputRef.current?.click()}><Paperclip size={16} /></button>
              <button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg disabled:opacity-50" title="Отправить" disabled={focusAiLoading || (!focusAiDraft.trim() && focusAiPendingFiles.length === 0)} onClick={() => void sendFocusAiQuestion()}>{aiLoadingTaskId === focusActiveTask.id ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}</button>
            </div>
            </div>
          </div>
        </div>
      ) : null}


tion()}>{aiLoadingTaskId === focusActiveTask.id ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}</button>
            </div>
          </div>
        </div>
      ) : null}


      {focusRemainingSeconds > 0 && focusRemainingSeconds < focusTimerMinutes * 60 && !isFocusSessionFinished && !isFocusModeOpen ? (
        <button className="focus-floating-timer fixed bottom-6 z-[90] flex h-20 w-20 flex-col items-center justify-center rounded-full text-white shadow-2xl" onClick={() => setIsFocusModeOpen(true)}>
          <span className="text-xs">Фокус</span><span className="font-bold tabular-nums">{formatFocusTime(focusRemainingSeconds)}</span>
        </button>
      ) : null}

      {focusDistractionTaskId ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setFocusDistractionTaskId(null)}>
          <div className="dialog-surface w-full max-w-md rounded-3xl border p-5 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <Sparkles size={22} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-primary">Не отвлекайтесь от фокуса</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Сейчас вы работаете над более важными задачами. Лучше вернуться к ним и не распылять внимание на другие карточки.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
              <button type="button" className="surface-muted rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => setFocusDistractionTaskId(null)}>
                вернуться
              </button>
              <button
                type="button"
                className="primary-button rounded-xl px-4 py-2 text-sm font-semibold"
                onClick={() => {
                  const task = taskById.get(focusDistractionTaskId);
                  setFocusDistractionTaskId(null);
                  if (!task) return;
                  if (task.parentTaskId) setEditorState({ task });
                  else setFocusedTaskId(task.id);
                }}
              >
                Мне это нужно
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFocusModeOpen && isFocusedNotesEditorOpen && focusedTask && focusedDraft ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setIsFocusedNotesEditorOpen(false)}>
          <div className="dialog-surface w-full max-w-3xl rounded-3xl border p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Заметки по задаче</p>
                <h3 className="text-lg font-bold text-primary">{focusedTask.title}</h3>
              </div>
              <button className="rounded-full p-2 text-muted transition hover:bg-slate-100" onClick={() => setIsFocusedNotesEditorOpen(false)} aria-label="Закрыть заметки"><X size={18} /></button>
            </div>
            <NotesEditor
              value={focusedDraft.description ?? ''}
              onChange={(description) => setFocusedDraft((p) => ({ ...(p ?? {}), description }))}
              onClose={() => setIsFocusedNotesEditorOpen(false)}
            />
          </div>
        </div>
      ) : null}


      {isSubscriptionModalOpen ? (
        <div className="modal-backdrop fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-4 pt-[min(6vh,4rem)] backdrop-blur-sm" onClick={() => setIsSubscriptionModalOpen(false)}>
          <div className="subscription-modal dialog-surface max-h-[88dvh] w-full max-w-5xl overflow-y-auto rounded-3xl border p-0 shadow-2xl sm:overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="subscription-hero relative p-4 sm:p-4">
              <button className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-white/10" onClick={() => setIsSubscriptionModalOpen(false)} aria-label="Закрыть окно подписки"><X size={18} /></button>
              <div className="subscription-eyebrow inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"><Sparkles size={14} /> Больше возможностей ИИ</div>
              <h2 className="mt-3 max-w-2xl text-2xl font-bold text-primary">{creditModalView === 'statistics' ? 'Статистика расхода AI-кредитов' : 'Чтобы увеличить количество ИИ кредитов, приобретите платную подписку'}</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">{creditModalView === 'statistics' ? 'Посмотрите расход за день, неделю и 30 дней, а также разбивку по моделям и ИИ-инструментам.' : 'Выберите тариф под свой сценарий: от дополнительного запаса кредитов до полного доступа к продвинутым ИИ-функциям.'}</p>
              <div className="credit-view-toggle mt-4 inline-flex rounded-xl border p-1">
                <button type="button" className={`credit-view-toggle-button rounded-lg px-3 py-1.5 text-sm font-semibold ${creditModalView === 'purchase' ? 'is-active is-purchase' : ''}`} onClick={() => setCreditModalView('purchase')}>Пополнить</button>
                <button type="button" className={`credit-view-toggle-button rounded-lg px-3 py-1.5 text-sm font-semibold ${creditModalView === 'statistics' ? 'is-active is-statistics' : ''}`} onClick={() => { setCreditModalView('statistics'); void loadCreditUsageStatistics(); }}>Статистика</button>
              </div>
            </div>
            {creditModalView === 'statistics' ? (
              <div key="credits-statistics" className="credit-switch-content max-h-[68vh] overflow-y-auto p-4 sm:p-5">
                <CreditUsageStats statistics={creditUsageStatistics} loading={creditUsageStatisticsLoading} error={creditUsageStatisticsError} />
              </div>
            ) : (
              <div key="credits-purchase" className="credit-switch-content">
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const link = subscriptionLinks[plan.key]?.trim();
                return (
                  <article key={plan.key} className="subscription-plan-card flex min-h-full flex-col rounded-2xl border p-4 shadow-xl sm:p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">{plan.badge}</div>
                        <h3 className="mt-1 text-xl font-bold text-primary">{plan.name}</h3>
                      </div>
                      <div className="flex h-10 min-w-[92px] items-center justify-center whitespace-nowrap rounded-2xl bg-gradient-to-br from-fuchsia-500 to-rose-500 px-3 text-sm font-bold text-white shadow-lg">{plan.price}</div>
                    </div>
                    <ul className="mt-3 flex-1 space-y-1.5 text-sm text-secondary">
                      {plan.features.map((feature) => (
                        <li key={feature} className="subscription-feature-pill flex items-start gap-2 rounded-xl px-3 py-1.5"><Check size={15} className="mt-0.5 shrink-0 text-emerald-300" /> <span>{feature}</span></li>
                      ))}
                    </ul>
                    <a
                      href={link || undefined}
                      target={link ? '_blank' : undefined}
                      rel={link ? 'noreferrer' : undefined}
                      aria-disabled={!link}
                      onClick={(event) => { if (!link) event.preventDefault(); }}
                      className={`mt-3 rounded-xl px-4 py-2.5 text-center text-sm font-semibold shadow-lg transition ${link ? 'bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white hover:-translate-y-0.5 hover:shadow-fuchsia-500/25' : 'cursor-not-allowed bg-slate-500/40 text-slate-300'}`}
                    >
                      Купить подписку
                    </a>
                  </article>
                );
              })}
            </div>
            <section className="border-t border-white/10 px-4 pb-2 pt-4 sm:px-5">
              <h3 className="text-xl font-bold text-primary">Дополнительные AI-кредиты</h3>
              <p className="mt-1 text-sm text-muted">Разовая покупка кредитов без изменения текущей подписки.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {creditPacks.filter((pack) => pack.isActive).map((pack) => {
                  const isCreating = creditPurchase.creatingPackKey === pack.key;
                  return (
                    <article key={pack.key} className="subscription-plan-card flex flex-col rounded-2xl border p-3 shadow-xl">
                      <div className="text-xl font-bold text-fuchsia-300">{pack.creditsAmount.toLocaleString('ru-RU')} AI-кредитов</div>
                      <div className="mt-1 text-base font-semibold text-secondary">{pack.price.toLocaleString('ru-RU')} ₽</div>
                      <button type="button" disabled={!creditPurchaseAvailable || creditPurchase.creatingPackKey !== null} onClick={() => void creditPurchase.start(pack.key)} className="mt-2 rounded-xl bg-gradient-to-r from-cyan-600 to-fuchsia-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
                        {isCreating ? 'Создаём платёж…' : creditPurchaseAvailable ? 'Купить' : 'Оплата недоступна'}
                      </button>
                    </article>
                  );
                })}
              </div>
              {creditPurchase.isReceiptEmailRequired ? <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="email" autoComplete="email" value={creditPurchase.receiptEmail} onChange={(event) => creditPurchase.setReceiptEmail(event.target.value)} placeholder="Email для чека" aria-label="Email для чека" className="form-field min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" />
                <button type="button" disabled={creditPurchase.creatingPackKey !== null || !creditPurchase.receiptEmail.trim()} onClick={() => void creditPurchase.retryWithReceiptEmail()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creditPurchase.creatingPackKey ? 'Создаём платёж…' : 'Продолжить'}</button>
              </div> : null}
              {creditPurchase.message ? <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-950/30 p-3 text-sm text-secondary" role="status">{creditPurchase.message}{creditPurchase.message.includes('войдите') ? <button type="button" className="ml-2 underline" onClick={() => setAuthModalMode('login')}>Войти</button> : null}</div> : null}
            </section>
            <p className="px-4 pb-4 text-center text-xs leading-5 text-muted sm:px-5 sm:pb-4">
              Приобретая платные функции Сервиса, вы принимаете условия{' '}
              <a className="public-secondary-link underline" href="/legal/offer" target="_blank" rel="noreferrer">
                Публичной оферты
              </a>.
            </p>
              </div>
            )}

          </div>
        </div>
      ) : null}

      {authModalMode ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="modal-card w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">{authModalMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
              <button className="secondary-button rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs" onClick={closeAuthModal}>Закрыть</button>
            </div>
            {authModalMode === 'register' && currentUser?.isGuest ? <p className="mb-3 rounded-lg border border-violet-400/40 bg-violet-500/10 p-3 text-sm text-secondary">Зарегистрируйтесь, чтобы получить 100 пробных ИИ-кредитов и сохранить задачи этого гостевого аккаунта.</p> : null}
            <div className="space-y-2">
              <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Логин" value={authLogin} onChange={(e) => setAuthLogin(e.target.value)} />
              <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Пароль" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
              {authModalMode === 'register' ? <p className="text-xs text-secondary">Пароль: не менее 6 символов. Цифры, буквы и спецсимволы допустимы.</p> : null}
              {authModalMode === 'register' ? (
                <>
                  <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Имя (для регистрации)" value={authName} onChange={(e) => setAuthName(e.target.value)} />
                  <div className="flex items-start gap-2 pt-2 text-xs leading-5 text-secondary">
                    <input
                      id="personal-data-consent"
                      className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                      type="checkbox"
                      checked={personalDataConsentAccepted}
                      onChange={(event) => {
                        setPersonalDataConsentAccepted(event.target.checked);
                        if (event.target.checked && authError === 'Необходимо согласиться на обработку персональных данных.') setAuthError(null);
                      }}
                    />
                    <span>
                      <label className="cursor-pointer" htmlFor="personal-data-consent">Я согласен на обработку персональных данных</label>.{' '}
                      <a className="public-secondary-link underline" href="/legal/consent" target="_blank" rel="noreferrer">
                        Согласие на обработку персональных данных
                      </a>
                    </span>
                  </div>
                </>
              ) : null}
              {authError ? <div className="text-xs text-rose-300">{authError}</div> : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="secondary-button flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm" onClick={closeAuthModal}>Отмена</button>
              <button className={`flex-1 rounded px-3 py-2 text-sm ${authModalMode === 'login' ? 'bg-cyan-700 light-primary-action' : 'bg-indigo-700 light-secondary-action'}`} onClick={submitAuth}>
                {authModalMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-center">
              <a className="public-secondary-link text-xs" href="/legal/privacy">Политика обработки персональных данных</a>
              <a className="public-secondary-link text-xs" href="/legal/cookies">Политика cookies</a>
              <a className="public-secondary-link text-xs" href="/legal/terms">Пользовательское соглашение</a>
              <a className="public-secondary-link text-xs" href="/legal/consent">Согласие на обработку персональных данных</a>
              <a className="public-secondary-link text-xs" href="/legal/offer">Публичная оферта</a>
            </div>
          </div>
        </div>
      ) : null}

      {quotaToast ? (
        <div role="alert" className="fixed right-4 top-5 z-[250] flex max-w-sm items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-950 px-4 py-3 text-sm text-white shadow-2xl">
          <BellRing size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <span>{quotaToast} Подробнее в настройках личного кабинета.</span>
          <button type="button" aria-label="Закрыть уведомление" onClick={() => setQuotaToast('')}><X size={15}/></button>
        </div>
      ) : null}
      {isProfileModalOpen && hasAccount ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProfileModal(); }}>
          <section className="profile-modal surface-popover w-full max-w-md rounded-2xl border p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="profile-modal-title" className="text-lg font-semibold text-primary">Настройки профиля</h2>
                <p className="mt-1 text-xs text-muted">Измените имя, почту или пароль аккаунта.</p>
              </div>
              <button type="button" className="profile-modal-close" onClick={closeProfileModal} aria-label="Закрыть настройки профиля"><X size={17} /></button>
            </div>
            <div className="max-h-[min(74vh,650px)] space-y-3 overflow-y-auto pr-1">
              <section className="profile-attachment-storage rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--muted-bg)] p-3" aria-label="Хранилище вложений">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-primary">Вложения</span>
                  <span className="text-xs tabular-nums text-muted">{attachmentStorage ? `${formatStorageMiB(attachmentStorage.usedBytes)} из ${formatStorageMiB(attachmentStorage.limitBytes)}` : 'Загрузка…'}</span>
                </div>
                {attachmentStorage ? (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-400/20" role="progressbar" aria-valuenow={Math.min(100, Math.round(100 * attachmentStorage.usedBytes / attachmentStorage.limitBytes))} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`h-full rounded-full ${attachmentStorage.overLimit ? 'bg-rose-500' : 'bg-cyan-600'}`} style={{ width: `${Math.min(100, 100 * attachmentStorage.usedBytes / attachmentStorage.limitBytes)}%` }} />
                    </div>
                    {attachmentStorage.usedBytes >= attachmentStorage.limitBytes ? <p className="mt-1.5 text-xs text-amber-600">Лимит достигнут. Старые файлы сохранены; новые можно загрузить после освобождения места.</p> : null}
                  </>
                ) : null}
                <button type="button" className="profile-cancel-button mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs" onClick={() => void toggleAccountAttachments()}>
                  <Paperclip size={13}/>{areAccountAttachmentsOpen ? 'Скрыть вложения' : 'Посмотреть вложения'}
                  <ChevronDown size={12} className={areAccountAttachmentsOpen ? 'rotate-180' : ''}/>
                </button>
                {areAccountAttachmentsOpen ? (
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                    {accountAttachmentsLoading ? <p className="text-xs text-muted">Загрузка вложений…</p> : null}
                    {!accountAttachmentsLoading && accountAttachments.length === 0 ? <p className="text-xs text-muted">Вложений пока нет.</p> : null}
                    {accountAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-[color:var(--panel-border)] p-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-xs text-primary">{attachment.parentTaskTitle ? `Подзадача «${attachment.taskTitle}» → основная задача «${attachment.parentTaskTitle}»` : `Задача «${attachment.taskTitle}»`}</p>
                          <a className="profile-attachment-file-link mt-1 block break-all text-xs hover:underline" href={api.getTaskAttachmentDownloadUrl(attachment.taskId, attachment.id)} download={attachment.name}>{attachment.name} · {formatStorageMiB(attachment.size)}</a>
                        </div>
                        <button type="button" aria-label={`Удалить вложение ${attachment.name}`} title="Удалить файл" className="shrink-0 rounded-md p-1.5 text-rose-500 hover:bg-rose-500/10" onClick={() => void deleteAccountAttachment(attachment)}><Trash2 size={15}/></button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
              <label className="profile-field-label">Имя
                <input className="profile-field" value={profileName} maxLength={100} autoComplete="name" onChange={(event) => setProfileName(event.target.value)} />
              </label>
              <label className="profile-field-label">Почта
                <input className="profile-field" value={profileEmail} maxLength={254} type="email" autoComplete="email" placeholder="name@example.com" onChange={(event) => setProfileEmail(event.target.value)} />
              </label>
              {currentUser.hasPassword ? (
                <label className="profile-field-label">Текущий пароль
                  <input className="profile-field" value={profileCurrentPassword} type="password" autoComplete="current-password" onChange={(event) => setProfileCurrentPassword(event.target.value)} />
                </label>
              ) : null}
              <label className="profile-field-label">Новый пароль
                <input className="profile-field" value={profileNewPassword} minLength={6} type="password" autoComplete="new-password" placeholder="Не менее 6 символов" onChange={(event) => setProfileNewPassword(event.target.value)} />
              </label>
              {profileError ? <p className="text-xs text-rose-400" role="alert">{profileError}</p> : null}
              {profileSaved ? <p className="text-xs text-emerald-400" role="status">Изменения сохранены</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="profile-cancel-button" onClick={closeProfileModal} disabled={profileSaving}>Отмена</button>
              <button type="button" className="profile-save-button" onClick={() => void submitProfile()} disabled={profileSaving}>{profileSaving ? 'Сохраняем…' : 'Сохранить'}</button>
            </div>
          </section>
        </div>
      ) : null}

      {isTelegramModalOpen ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsTelegramModalOpen(false)}>
          <div data-tour="feature-telegram-qr" className="telegram-qr-modal relative w-full max-w-md rounded-2xl border p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="surface-muted absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:brightness-110" onClick={() => setIsTelegramModalOpen(false)} aria-label="Закрыть окно"><X size={16} /></button>
            <div className="mb-3 pr-10">
              <h2 className="telegram-qr-modal-title text-lg font-semibold">Вход в Telegram-бот</h2>
            </div>
            <p className="telegram-qr-modal-copy mb-3 text-xs">Отсканируйте QR-код камерой Telegram, чтобы привязать аккаунт в один клик.</p>
            {isTelegramLinkLoading ? <div className="telegram-qr-modal-copy py-10 text-center text-sm">Генерируем ссылку…</div> : null}
            {telegramLinkError ? <div className="telegram-qr-modal-error rounded border px-3 py-2 text-xs">{telegramLinkError}</div> : null}
            {telegramLinkUrl && !isTelegramLinkLoading ? (
              <>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(telegramLinkUrl)}`}
                  alt="QR-код входа в Telegram"
                  className="telegram-qr-image mx-auto mb-3 h-64 w-64 rounded-lg border bg-white p-2"
                />
                <div className="telegram-qr-modal-expiry mb-3 text-center text-xs">Код действует ~{Math.round(telegramLinkExpiresIn / 60)} мин</div>
                <a href={telegramLinkUrl} target="_blank" rel="noreferrer" className="block rounded bg-cyan-700 px-3 py-2 text-center text-sm font-medium text-white hover:bg-cyan-600">Открыть в Telegram</a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div data-tour="workspace" className="workspace-shell relative min-h-0 flex-1 overflow-hidden pr-[360px]">
        {displayMode === 'bubbles' ? (
          <div data-tour="bubbles-workspace" className="relative h-full">
            <div data-tour="bubble-layout" className="bubble-layout-toggle absolute right-4 top-4 z-30 flex items-center gap-1 rounded-full border p-1 shadow-xl backdrop-blur" role="group" aria-label="Режим отображения баблов">
              <button
                type="button"
                className={`bubble-layout-toggle-button inline-flex h-9 w-9 items-center justify-center rounded-full transition ${mode === 'global' ? 'bubble-layout-toggle-button-active' : ''}`}
                onClick={() => setMode('global')}
                title="Общий круг"
                aria-label="Показать баблы общим кругом"
                aria-pressed={mode === 'global'}
              >
                <CircleIcon size={19} strokeWidth={2.1} />
              </button>
              <button
                type="button"
                className={`bubble-layout-toggle-button inline-flex h-9 w-9 items-center justify-center rounded-full transition ${mode === 'sectors' ? 'bubble-layout-toggle-button-active' : ''}`}
                onClick={() => setMode('sectors')}
                title="Сектора"
                aria-label="Показать баблы по секторам"
                aria-pressed={mode === 'sectors'}
              >
                <PieChart size={19} strokeWidth={2.1} />
              </button>
            </div>
            <BubbleField
              className="h-full"
              themeMode={effectiveThemeMode}
            tasks={visibleTasks}
            timelinePreviewTasks={activeTimelineItems}
            spheres={visibleSpheres}
            rankingMode="coefficient"
            subtaskMap={displayedSubtaskMap}
            isSubtaskFilterActive={subtaskFilterMode !== 'none'}
            onToggleSubtaskFilter={() => setSubtaskFilterMode((prev) => (prev === 'none' ? 'urgency' : 'none'))}
            mode={mode}
            poppingTaskId={poppingTaskId}
            hasAiNotification={hasUnreadAiMessage}
            selectedId={editorState?.task?.id}
            onSelect={(task) => {
              openTaskWithFocusGuard(task);
            }}
            onSelectSubtask={(subtask) => setEditorState({ task: subtask })}
            onCreateSubtask={async (parentTask, payload) => {
              await createSubtaskForParent(parentTask, payload);
            }}
            onToggleSubtaskDone={toggleSubtaskDone}
            onUpdateSubtaskDueDate={async (subtask, dueDate) => {
              await api.updateTask(subtask.id, { dueDate });
              await load();
            }}
            onQuickCompleteTask={completeTask}
            onQuickChangeTaskImportance={async (task, importanceDelta) => {
              const nextImportance = Math.max(1, Math.min(5, task.importance + importanceDelta));
              if (nextImportance === task.importance) return;
              await api.updateTask(task.id, { importance: nextImportance });
              await load();
            }}
            onQuickPostponeTask={async (task, option) => await quickPostponeTask(task, option)}
            onAddTaskToSphere={(sphere) => setEditorState({ initialSphereId: sphere.id })}
            onRenameSphere={(sphere) => setSectorEditorSphere(sphere)}
            onRescheduleTask={(task) => setTimelineReschedulePicker({ taskId: task.id, signal: Date.now() })}
            forceTaskContextMenuOpen={activeTourStep === 'task-context-menu'}
            isSearchFiltering={Boolean(search.trim())}
            />
          </div>
        ) : displayMode === 'list' ? (
          <div data-tour="list-workspace" ref={timelineScrollContainerRef} onWheel={(event) => { if (draggedTimelineTaskId !== null) { event.currentTarget.scrollTop += event.deltaY; } }} className="list-mode-canvas h-full overflow-y-auto rounded-[2.2rem] border p-4 backdrop-blur-sm">
            <ul className="space-y-3 pr-1">
              {activeListTasks.length === 0 ? (
                <li className="list-empty-state rounded-xl border px-4 py-3 text-sm">
                  Нет задач для выбранных фильтров
                </li>
              ) : null}
              {activeListTasks.map((task) => {
                const hasOverdueState = task.status !== 'DONE' && isOverdue(task);
                const hasReminderState = task.status !== 'DONE' && !hasOverdueState && shouldTaskGlow(task);
                const taskSubtasks = displayedSubtaskMap[task.id] ?? [];
                const hasOverdueSubtaskState = !hasOverdueState && taskSubtasks.some((subtask) => subtask.status !== 'DONE' && isOverdue(subtask));
                const hasReminderSubtaskState = !hasOverdueState && !hasReminderState && !hasOverdueSubtaskState && taskSubtasks.some((subtask) => subtask.status !== 'DONE' && shouldTaskGlow(subtask));
                const taskSphere = task.sphereId ? (sphereById.get(task.sphereId) ?? null) : null;
                const sphereColor = taskSphere?.color ?? '#64748b';
                const SphereIcon = resolveSphereIcon(taskSphere?.icon) ?? LayoutGrid;
                const taskCoefficient = getTaskCoefficient(task, displayedSubtaskMap);
                const hasAiNotificationState = hasUnreadAiMessage(task.id);
                const isClosingTask = closingTaskIds.includes(task.id);
                return (
                  <motion.li
                    key={task.id}
                    layout
                    className={`list-task-item list-task-item-premium relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-lg border px-3 py-2 text-sm transition ${isClosingTask ? 'list-task-item-completing ring-1 ring-emerald-300/70' : ''} ${
                      hasOverdueState
                        ? 'list-task-item-overdue'
                        : hasReminderState
                          ? 'list-task-item-reminder'
                          : hasOverdueSubtaskState
                            ? 'list-task-item-subtask-overdue'
                            : hasReminderSubtaskState
                              ? 'list-task-item-subtask-reminder'
                              : hasAiNotificationState
                                ? 'list-task-item-ai'
                                : ''
                    }`}
                    style={{ '--desktop-list-sector-color': sphereColor } as CSSProperties}
                    title={taskSphere?.name ?? 'Без сектора'}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setListTaskContextMenu({ ...getViewportSafeContextMenuPosition(event.clientX, event.clientY, { submenu: true }), taskId: task.id });
                      setListTaskPostponeSubmenuOpen(false);
                    }}
                    onClick={() => { if (!isClosingTask) openTaskWithFocusGuard(task); }}
                  >
                    <input
                      type="checkbox"
                      className="list-task-checkbox mt-1"
                      checked={task.status === 'DONE' || isClosingTask}
                      onClick={(event) => event.stopPropagation()}
                      onChange={async () => {
                        if (task.status === 'DONE') {
                          await api.updateTask(task.id, { status: 'TODO' });
                          await load();
                        } else {
                          await completeTask(task);
                        }
                      }}
                    />
                    {isClosingTask ? <Check size={14} className="timeline-task-chip-success mt-1 shrink-0" /> : null}
                    <div className="min-w-0 flex-1">
                      <span className="list-task-sector-badge mb-1.5 inline-flex max-w-[min(100%,15rem)] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" title={taskSphere?.name ?? 'Без сектора'}>
                        <SphereIcon size={12} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{taskSphere?.name ?? 'Без сектора'}</span>
                      </span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`min-w-0 flex-1 truncate text-base font-semibold ${task.status === 'DONE' || isClosingTask ? 'timeline-task-chip-completed text-subtle line-through opacity-70 decoration-2' : 'text-primary'}`}>
                          <LinkifiedText text={task.title} stopPropagationOnLinkClick />
                        </span>
                        {task.isRecurring ? <span title="Повторяющаяся задача"><Repeat size={13} className="list-task-repeat-icon shrink-0" /></span> : null}
                        {hasAiNotificationState ? <span title="Непрочитанное ИИ-уведомление"><Sparkles size={14} className="list-task-ai-icon shrink-0" /></span> : null}
                      </div>
                      {task.description?.trim() ? (
                        <p className="mt-1 truncate text-xs text-muted">
                          <LinkifiedText text={noteHtmlToPlainText(task.description ?? '', { trimEnd: true })} stopPropagationOnLinkClick />
                        </p>
                      ) : null}
                      <p className={`list-task-deadline mt-1 inline-flex min-w-0 items-center gap-1.5 text-[11px] ${hasOverdueState ? 'list-task-deadline-overdue' : 'text-subtle'}`}>
                        <CalendarDays size={13} className="shrink-0" aria-hidden="true" />
                        <span className="min-w-0 truncate">Дедлайн: {formatTaskDueDate(task.dueDate)}{task.dueDate ? ` · ${formatDeadlineLeft(task.dueDate)}` : ''}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {renderWorkspaceCommentIndicator(task)}
                      {renderWorkspaceAttachmentIndicator(task)}
                      {rankingMode === 'coefficient' ? (
                        <span
                          className="list-task-coefficient-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: getCoefficientBadgeColor(taskCoefficient, effectiveThemeMode) }}
                          title="Коэффициент важности задачи"
                        >
                          <Gauge size={12} />
                          {taskCoefficient.toFixed(2)}
                        </span>
                      ) : (
                        <span
                          className={`list-task-importance-badge rounded-full border px-2 py-0.5 text-[11px] ${IMPORTANCE_STYLES[task.importance] ?? IMPORTANCE_STYLES[3]}`}
                          title="Важность задачи"
                        >
                          {task.importance}
                        </span>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
            {listTaskContextMenu ? createPortal((() => {
              const contextTask = taskById.get(listTaskContextMenu.taskId);
              if (!contextTask) return null;
              return (
                <div
                  className="fixed z-[130]"
                  style={{ left: listTaskContextMenu.x, top: listTaskContextMenu.y }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
                    <button
                      type="button"
                      className="surface-muted flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:brightness-110"
                      onMouseEnter={() => setListTaskPostponeSubmenuOpen(true)}
                      onClick={() => setListTaskPostponeSubmenuOpen((prev) => !prev)}
                    >
                      <span>Отложить</span>
                      <ChevronRight size={13} className="text-muted" />
                    </button>
                    <button
                      type="button"
                      className="primary-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm"
                      onClick={() => {
                        openCreateTaskFromListTask(contextTask);
                        setListTaskContextMenu(null);
                      }}
                    >
                      Добавить задачу
                    </button>
                    <button
                      type="button"
                      className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm"
                      onClick={() => {
                        setListTaskContextMenu(null);
                        setListTaskPostponeSubmenuOpen(false);
                        void completeTask(contextTask);
                      }}
                    >
                      Выполнить
                    </button>
                    <button
                      type="button"
                      className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium"
                      onClick={() => {
                        setTimelineReschedulePicker({ taskId: contextTask.id, signal: Date.now() });
                        setListTaskContextMenu(null);
                        setListTaskPostponeSubmenuOpen(false);
                      }}
                    >
                      <CalendarDays size={14} />
                      Перенести
                    </button>
                    {listTaskPostponeSubmenuOpen ? (
                      <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                        {QUICK_POSTPONE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110"
                            onClick={async () => {
                              setTimelinePostponeLoadingTaskId(contextTask.id);
                              setListTaskContextMenu(null);
                              setListTaskPostponeSubmenuOpen(false);
                              try {
                                await quickPostponeTask(contextTask, option.value);
                              } finally {
                                setTimelinePostponeLoadingTaskId((prev) => (prev === contextTask.id ? null : prev));
                              }
                            }}
                          >
                            <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })(), document.body) : null}
          </div>
        ) : (
          <div data-tour="timeline-workspace" ref={timelineScrollContainerRef} className="timeline-canvas h-full overflow-y-auto rounded-[2.2rem] border p-4 backdrop-blur-sm">
            <div className="space-y-4 pr-1">
              <section className={`timeline-toolbar sticky top-0 z-20 rounded-3xl border px-3 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-out sm:px-4 ${isTimelineToolbarHidden && !isTimelineOverdueModalOpen ? 'timeline-toolbar-hidden' : 'timeline-toolbar-visible'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1 shadow-inner">
                    <button
                      className="timeline-nav-button rounded-md border px-2 py-1 text-xs"
                      onClick={() => {
                        setTimelineAnchorDate((prev) => {
                          const next = new Date(prev);
                          if (timelineViewMode === 'day') next.setDate(next.getDate() - 1);
                          else if (timelineViewMode === 'week') next.setDate(next.getDate() - 7);
                          else next.setMonth(next.getMonth() - 1);
                          return next;
                        });
                      }}
                    >
                      ←
                    </button>
                    <button
                      className="timeline-nav-button rounded-md border px-2 py-1 text-xs"
                      onClick={() => setTimelineAnchorDate(new Date())}
                    >
                      Сегодня
                    </button>
                    <button
                      className="timeline-nav-button rounded-md border px-2 py-1 text-xs"
                      onClick={() => {
                        setTimelineAnchorDate((prev) => {
                          const next = new Date(prev);
                          if (timelineViewMode === 'day') next.setDate(next.getDate() + 1);
                          else if (timelineViewMode === 'week') next.setDate(next.getDate() + 7);
                          else next.setMonth(next.getMonth() + 1);
                          return next;
                        });
                      }}
                    >
                      →
                    </button>
                  </div>
                  <h3 className="timeline-title max-w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-semibold capitalize tracking-tight shadow-inner sm:text-base">{timelineViewData.title}</h3>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className="timeline-nav-button inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                      onClick={() => {
                        setIsTimelineToolbarHidden(false);
                        setIsTimelineOverdueModalOpen((prev) => !prev);
                        setIsTimelineOverdueModalCollapsedForDrag(false);
                      }}
                      title="Просроченные задачи"
                    >
                      Просроченные задачи
                      <span className="rounded bg-rose-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">{timelineOverdueTasks.length}</span>
                    </button>
                    <button type="button" className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs ${isTimelineOptimizePreviewEnabled ? 'border-cyan-300 bg-cyan-700/60 text-cyan-50' : currentOptimizeState.plan.length>0 ? 'timeline-nav-button' : 'timeline-nav-button opacity-50'}`} disabled={currentOptimizeState.plan.length===0} onClick={() => setTimelineOptimizePreviewEnabledByMode((prev)=>({ ...prev, [timelineViewMode]: !prev[timelineViewMode] }))} title="Показать/скрыть ИИ-расклад"><Eye size={14} /></button>
                    <button type="button" className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs ${isTimelineOptimizePreviewEnabled ? 'border-emerald-300 bg-emerald-700/70 text-emerald-50' : 'timeline-nav-button opacity-50'}`} disabled={!isTimelineOptimizePreviewEnabled} title="Принять ИИ-оптимизацию" onClick={async () => { await api.applyTimelineOptimization({ plan: currentOptimizeState.plan }); setTimelineOptimizePreviewEnabledByMode((prev)=>({ ...prev, [timelineViewMode]: false })); setTimelineOptimizeStateByMode((prev)=>({ ...prev, [timelineViewMode]: { plan: [], summary: '' } })); await load(); }}><Check size={14} /></button>
                    <button type="button" className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs ${isTimelineOptimizePreviewEnabled ? 'border-rose-300 bg-rose-700/70 text-rose-50' : 'timeline-nav-button opacity-50'}`} disabled={!isTimelineOptimizePreviewEnabled} title="Отменить ИИ-оптимизацию" onClick={() => { setTimelineOptimizePreviewEnabledByMode((prev)=>({ ...prev, [timelineViewMode]: false })); setTimelineOptimizeStateByMode((prev)=>({ ...prev, [timelineViewMode]: { plan: [], summary: '' } })); }}><X size={14} /></button>
                    <button type="button" data-tour="ai-optimize" className="rounded-md border border-rose-400 bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500" onClick={() => setIsTimelineOptimizeModalOpen(true)} disabled={timelineOptimizeLoading}>
                      {timelineOptimizeLoading ? <Loader2 size={14} className="animate-spin" /> : 'Оптимизировать ✨'}
                    </button>
                    <div data-tour="timeline-range" className="timeline-mode-switch flex items-center gap-1 rounded-lg border p-1">
                      {([
                        { key: 'day', label: 'День' },
                        { key: 'week', label: 'Неделя' },
                        { key: 'month', label: 'Месяц' }
                      ] as const).map((mode) => (
                        <button
                          key={mode.key}
                          className={`rounded-md px-2 py-1 text-xs transition ${
                            timelineViewMode === mode.key
                              ? 'timeline-mode-button-active'
                              : 'timeline-mode-button-idle'
                          }`}
                          onClick={() => setTimelineViewMode(mode.key)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {isTimelineOverdueModalOpen ? (
                  <div className="relative mt-2">
                    <section className={`timeline-overdue-panel w-full rounded-2xl border p-3 transition-all ${isTimelineOverdueModalCollapsedForDrag ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100'}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-primary">Просроченные задачи</h4>
                          <button
                            className="secondary-button rounded px-2 py-1 text-xs disabled:opacity-60"
                            onClick={() => void postponeAllOverdueToToday()}
                            disabled={timelineOverdueBulkPostponeLoading !== null}
                            title="Переносит задачи на сегодня на это же время"
                            aria-label="Перенести просроченные задачи на сегодня на это же время"
                          >
                            {timelineOverdueBulkPostponeLoading === 'normal' ? <Loader2 size={12} className="animate-spin" /> : 'Отложить'}
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded border border-pink-300/60 bg-pink-600/80 px-2 py-1 text-xs text-white disabled:opacity-60"
                            onClick={() => void postponeAllOverdueByAi()}
                            disabled={timelineOverdueBulkPostponeLoading !== null}
                            title="Откладывает на ближайшее доступное окно, используя ИИ (снимает кредиты)"
                            aria-label="Отложить просроченные задачи с помощью ИИ на ближайшее доступное окно"
                          >
                            {timelineOverdueBulkPostponeLoading === 'ai' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Отложить (ИИ)

                          </button>
                        </div>
                        <button className="surface-muted rounded px-2 py-1 text-xs" onClick={() => setIsTimelineOverdueModalOpen(false)}>Свернуть</button>
                      </div>
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {timelineOverdueTasks.map((task) => renderTimelineTaskChip(task, {
                          isSubtask: Boolean(task.parentTaskId),
                          disableEffects: true,
                          forceDraggable: true,
                          parentTaskTitle: task.parentTaskId ? (taskById.get(task.parentTaskId)?.title ?? 'Без основной задачи') : undefined,
                          onDragStart: () => setIsTimelineOverdueModalCollapsedForDrag(true)
                        }))}
                        {timelineOverdueTasks.length === 0 ? <p className="text-sm text-subtle">Просроченных задач нет</p> : null}
                      </div>
                    </section>
                  </div>
                ) : null}
              </section>

              {timelineViewData.tasksInRange.length === 0 ? (
                <div className="timeline-empty-state rounded-xl border px-4 py-3 text-sm">
                  Нет задач с датой для выбранного режима
                </div>
              ) : null}

              {timelineViewMode === 'month' ? (
                <section className="timeline-panel rounded-2xl border p-3">
                  <div className="mb-2 grid grid-cols-7 gap-2">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName, index) => (
                      <div
                        key={dayName}
                        className={`text-center text-xs font-semibold uppercase tracking-wide ${index >= 5 ? 'timeline-weekday-weekend' : 'text-subtle'}`}
                      >
                        {dayName}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-7">
                    {timelineViewData.monthCells.map((cell) => (
                      <div
                        key={cell.key}
                        ref={cell.date && cell.date.toDateString() === new Date().toDateString() ? timelineCurrentDayRef : undefined}
                        className={`timeline-month-cell min-h-32 rounded-xl border p-2 ${
                          cell.date
                            ? ((cell.date.getDay() === 0 || cell.date.getDay() === 6)
                              ? 'timeline-month-cell-weekend'
                              : 'timeline-month-cell-active')
                            : 'timeline-month-cell-empty'
                        } ${cell.date ? 'transition hover:ring-1 hover:ring-cyan-400/35' : ''} ${cell.date && cell.date.toDateString() === new Date().toDateString() ? 'timeline-month-cell-today ring-2' : ''} ${isTimelineDragging && cell.date ? 'ring-1 ring-cyan-500/30 transition' : ''}`}
                        onDragOver={(event) => {
                          if (!cell.date) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onContextMenu={(event) => {
                          if (!cell.date) return;
                          event.preventDefault();
                          setTimelineCreateMenu({ ...getViewportSafeContextMenuPosition(event.clientX, event.clientY), date: new Date(cell.date), hour: null });
                        }}
                        onClick={(event) => {
                          if (!cell.date) return;
                          const target = event.target as HTMLElement;
                          if (target.closest('button, a, input, textarea')) return;
                          setTimelineAnchorDate(new Date(cell.date));
                          setTimelineViewMode('day');
                        }}
                        onDrop={async (event) => {
                          if (!cell.date) return;
                          event.preventDefault();
                          const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                          setDraggedTimelineTaskId(taskId || null);
                          await handleTimelineTaskDrop({ date: cell.date, keepOriginalTime: true });
                          setDraggedTimelineTaskId(null);
                        }}
                      >
                        {cell.date ? (
                          <>
                            <p className="mb-2 text-xs font-semibold text-muted">{cell.date.getDate()}</p>
                            <ul className="space-y-1">
                              {cell.tasks.slice(0, 4).map((task) => renderTimelineTaskChip(task))}
                              {cell.tasks.length > 4 ? (
                                <li>
                                  <button
                                    type="button"
                                    className="timeline-more-button rounded-md border px-2 py-0.5 text-[11px] transition"
                                    onClick={() => {
                                      if (!cell.date) return;
                                      setTimelineAnchorDate(new Date(cell.date));
                                      setTimelineViewMode('day');
                                    }}
                                  >
                                    + ещё {cell.tasks.length - 4}
                                  </button>
                                </li>
                              ) : null}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {timelineViewMode === 'week' ? (
                <section className="timeline-panel overflow-x-auto rounded-2xl border">
                  {(() => {
                    const now = new Date();
                    const lineHour = now.getHours();
                    const lineOffsetPercent = (now.getMinutes() / 60) * 100;
                    return (
                  <div className="grid min-w-[980px] grid-cols-[80px_repeat(7,minmax(120px,1fr))]">
                    <div className="timeline-grid-header border-b border-r p-2 text-xs">Время</div>
                    {timelineViewData.dayGroups.map((day) => {
                      const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                      const isToday = day.date.toDateString() === new Date().toDateString();
                      return (
                        <div
                          key={`header-${day.key}`}
                          className={`timeline-week-header border-b border-r p-2 text-center ${
                            isToday ? 'timeline-week-header-today ring-1' : isWeekend ? 'timeline-week-header-weekend' : ''
                          }`}
                        >
                          <p className={`text-xs ${isToday ? 'timeline-today-text' : isWeekend ? 'timeline-weekday-weekend' : 'text-subtle'}`}>
                            {day.date.toLocaleDateString('ru-RU', { weekday: 'short' })}
                          </p>
                          <p className={`text-sm font-semibold ${isToday ? 'timeline-today-text' : isWeekend ? 'timeline-weekday-weekend' : 'text-primary'}`}>
                            {day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                      );
                    })}
                    {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                      <Fragment key={`week-hour-${hour}`}>
                        <div className="timeline-grid-time border-b border-r px-2 py-2 text-xs">
                          <div className="relative">
                            {String(hour).padStart(2, '0')}:00
                          </div>
                        </div>
                        {timelineViewData.dayGroups.map((day) => {
                          const hourTasks = day.tasks.filter((task) => {
                            if (!task.dueDate) return false;
                            const dueDate = new Date(task.dueDate);
                            return !Number.isNaN(dueDate.getTime()) && dueDate.getHours() === hour;
                          });
                          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                          const isToday = day.date.toDateString() === new Date().toDateString();
                          return (
                            <div
                              key={`${day.key}-${hour}`}
                              className={`timeline-week-cell relative min-h-14 space-y-1 border-b border-r px-1.5 py-1.5 ${
                                isWeekend ? 'timeline-week-cell-weekend' : ''
                              } ${
                                isToday ? 'timeline-week-cell-today border-l border-r' : ''
                              } ${isTimelineDragging ? 'timeline-drop-target transition-colors' : ''}`}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setTimelineCreateMenu({ ...getViewportSafeContextMenuPosition(event.clientX, event.clientY), date: new Date(day.date), hour });
                              }}
                              onDrop={async (event) => {
                                event.preventDefault();
                                const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                                setDraggedTimelineTaskId(taskId || null);
                                await handleTimelineTaskDrop({ date: day.date, hour });
                                setDraggedTimelineTaskId(null);
                              }}
                            >
                              {isToday && hour === lineHour ? (
                                <span
                                  className="pointer-events-none absolute left-0 right-0 border-t border-red-500"
                                  style={{ top: `${lineOffsetPercent}%` }}
                                />
                              ) : null}
                              {hourTasks.map((task) => renderTimelineTaskChip(task, { showTime: false }))}
                              {getTimelineHabitsForDateHour(day.date, hour).map(({ habit, reminderTime }) => renderTimelineHabitChip(habit, reminderTime, day.date))}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                    );
                  })()}
                </section>
              ) : null}

              {timelineViewMode === 'day' ? (
                <section className="timeline-panel overflow-hidden rounded-2xl border">
                  {(() => {
                    const now = new Date();
                    const isCurrentDay = timelineAnchorDate.toDateString() === now.toDateString();
                    const lineHour = now.getHours();
                    const lineOffsetPercent = (now.getMinutes() / 60) * 100;
                    return timelineViewData.hourGroups.map((hourGroup) => (
                    <div key={hourGroup.hour} data-tour={hourGroup.hour === 10 ? 'timeline-hour' : undefined} className="timeline-day-row grid grid-cols-[70px_minmax(0,1fr)] border-b last:border-b-0">
                      <div className="timeline-grid-time border-r px-2 py-2 text-xs">{String(hourGroup.hour).padStart(2, '0')}:00</div>
                      <div className="timeline-day-slot-group relative">
                        {isCurrentDay && hourGroup.hour === lineHour ? (
                          <span
                            className="pointer-events-none absolute left-0 right-0 z-10 border-t border-red-500"
                            style={{ top: `${lineOffsetPercent}%` }}
                          />
                        ) : null}
                        {hourGroup.quarters.map((quarter) => (
                          <div
                            key={`${hourGroup.hour}-${quarter.minute}`}
                            data-tour={hourGroup.hour === 10 && quarter.minute === 0 ? 'timeline-context-slot' : undefined}
                            className={`timeline-day-quarter-slot group relative px-2 transition-colors ${quarter.tasks.length > 0 ? 'timeline-day-quarter-slot-filled py-1.5' : 'timeline-day-quarter-slot-empty'} ${isTimelineDragging ? 'timeline-drop-target timeline-day-quarter-slot-drag-ready' : ''} ${activeTimelineDropSlot?.hour === hourGroup.hour && activeTimelineDropSlot.minute === quarter.minute ? 'timeline-day-quarter-slot-drag-active' : ''}`}
                            title={`Слот ${String(hourGroup.hour).padStart(2, '0')}:${String(quarter.minute).padStart(2, '0')}`}
                            aria-label={`Слот ${String(hourGroup.hour).padStart(2, '0')}:${String(quarter.minute).padStart(2, '0')}`}
                            onDragEnter={(event) => {
                              event.preventDefault();
                              if (isTimelineDragging) setActiveTimelineDropSlot({ hour: hourGroup.hour, minute: quarter.minute });
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              if (isTimelineDragging) setActiveTimelineDropSlot({ hour: hourGroup.hour, minute: quarter.minute });
                            }}
                            onDragLeave={(event) => {
                              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                              setActiveTimelineDropSlot((current) => (
                                current?.hour === hourGroup.hour && current.minute === quarter.minute ? null : current
                              ));
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              const dayDate = new Date(timelineAnchorDate);
                              dayDate.setHours(0, 0, 0, 0);
                              setTimelineCreateMenu({ ...getViewportSafeContextMenuPosition(event.clientX, event.clientY), date: dayDate, hour: hourGroup.hour, minute: quarter.minute });
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                              setDraggedTimelineTaskId(taskId || null);
                              const dayDate = new Date(timelineAnchorDate);
                              dayDate.setHours(0, 0, 0, 0);
                              await handleTimelineTaskDrop({ date: dayDate, hour: hourGroup.hour, minute: quarter.minute });
                              setDraggedTimelineTaskId(null);
                              setActiveTimelineDropSlot(null);
                            }}
                          >
                            <span className="timeline-day-quarter-label pointer-events-none absolute right-2 top-1 text-[10px]">:{String(quarter.minute).padStart(2, '0')}</span>
                            {quarter.tasks.length > 0 || (quarter.minute === 0 && getTimelineHabitsForDateHour(timelineAnchorDate, hourGroup.hour).length > 0) ? (
                              <div className="space-y-1.5 pr-9">
                                {quarter.tasks.map((task) => renderTimelineTaskChip(task, { showTime: true }))}
                                {quarter.minute === 0 ? getTimelineHabitsForDateHour(timelineAnchorDate, hourGroup.hour).map(({ habit, reminderTime }) => renderTimelineHabitChip(habit, reminderTime, timelineAnchorDate, { showTime: true })) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                  })()}
                </section>
              ) : null}
            </div>
          </div>
        )}

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside
          data-tour="workspace-side-rail"
          className="workspace-side-rail absolute right-0 top-0 z-10 h-full w-[360px] space-y-4 overflow-y-auto overscroll-contain pb-3 pl-5 pr-3 pt-3"
          data-no-field-zoom="true"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          <section className="workspace-widget-card rounded-[1.35rem] border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold tracking-[-0.01em]">Ближайшие подзадачи</h3>
              <button
                type="button"
                className="surface-muted rounded p-1 text-muted transition hover:brightness-110"
                title="Развернуть список подзадач"
                onClick={() => setIsUpcomingSubtasksModalOpen(true)}
              >
                <Maximize2 size={14} />
              </button>
            </div>
            <ul className="max-h-[30vh] space-y-2 overflow-y-auto pr-1 text-xs text-muted">
              {upcomingSubtasksForPanel.length === 0 ? <li className="text-subtle">Нет подзадач с ближайшим дедлайном</li> : null}
              {upcomingSubtasksForPanel.map((task) => (
                <li key={task.id} className="workspace-list-row list-item-surface flex items-center gap-2 rounded-xl border px-2.5 py-2" title={formatDeadlineTooltip(task)}>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={async () => {
                      await api.updateTask(task.id, { status: 'DONE' });
                      if (task.parentTaskId) {
                        await syncParentStatusBySubtasks(task.parentTaskId);
                      }
                      await load();
                    }}
                  />
                  <span className="truncate"><LinkifiedText text={task.title} stopPropagationOnLinkClick /></span>
                </li>
              ))}
            </ul>
          </section>
          {isUpcomingSubtasksModalOpen ? (
            <div className="modal-backdrop upcoming-subtasks-backdrop fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={() => setIsUpcomingSubtasksModalOpen(false)}>

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside
                role="dialog"
                aria-modal="true"
                aria-label="Окно ближайших подзадач"
                className="upcoming-subtasks-dialog flex h-[84vh] w-[min(1100px,95vw)] flex-col overflow-hidden rounded-[2.3rem] border"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="upcoming-subtasks-header flex items-center justify-between gap-4 px-6 pb-4 pt-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус на сроках</p>
                    <h4 className="mt-1 text-2xl font-bold tracking-tight text-primary">Ближайшие подзадачи</h4>
                  </div>
                  <button type="button" className="focused-task-icon-button upcoming-subtasks-close-button h-9 w-9" onClick={() => setIsUpcomingSubtasksModalOpen(false)} title="Закрыть">
                    <X size={16} />
                  </button>
                </div>
                <div className="upcoming-subtasks-toolbar px-6 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                  {([
                    { key: 'all', label: 'все' },
                    { key: 'today', label: 'на сегодня' },
                    { key: 'tomorrow', label: 'на завтра' },
                    { key: 'week', label: 'на неделю' },
                    { key: 'no_due', label: 'без срока' }
                  ] as const).map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`upcoming-subtasks-filter rounded-full border px-3 py-1.5 font-medium transition ${upcomingSubtasksFilter === filter.key ? 'upcoming-subtasks-filter-active' : ''}`}
                      onClick={() => setUpcomingSubtasksFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                  </div>
                </div>
                <ul className="upcoming-subtasks-list min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-3 py-4 text-sm sm:px-6">
                  {filteredUpcomingSubtasksForModal.length === 0 ? <li className="surface-muted rounded px-3 py-2 text-subtle">Нет подзадач для выбранного фильтра</li> : null}
                  {filteredUpcomingSubtasksForModal.map((subtask) => (
                    <li
                      key={subtask.id}
                      className={`upcoming-subtask-row relative flex min-h-[7rem] items-start gap-3 rounded-2xl border px-4 py-3 ${closingTaskIds.includes(subtask.id) ? 'focused-subtask-row-completing ring-1 ring-emerald-300/70' : ''}`}
                    >
                      <input type="checkbox" className="shrink-0" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      {closingTaskIds.includes(subtask.id) ? <Check size={13} className="timeline-task-chip-success shrink-0" /> : null}
                      <div className="upcoming-subtask-copy min-w-0 flex-1">
                        <p className={`upcoming-subtask-title text-sm font-semibold text-primary ${subtask.status === 'DONE' || closingTaskIds.includes(subtask.id) ? 'timeline-task-chip-completed line-through opacity-60 decoration-2' : ''}`}><LinkifiedText text={subtask.title} stopPropagationOnLinkClick /></p>
                        <div className="upcoming-subtask-description mt-1 text-xs text-muted"><LinkifiedText text={noteHtmlToPlainText(subtask.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick /></div>
                        <p className="upcoming-subtask-deadline mt-1 text-[11px] text-subtle">
                          Дедлайн: {formatTaskDueDate(subtask.dueDate)}{subtask.dueDate ? ` · ${formatDeadlineLeft(subtask.dueDate)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <InlineDateTimePickerIcon
                          value={subtask.dueDate}
                          title="Изменить срок подзадачи"
                          detachedPopup
                          timelineTasks={timelinePickerTasks}
                          className="upcoming-subtask-date-action"
                          onChange={async (dueDate) => {
                            await api.updateTask(subtask.id, { dueDate });
                            await load();
                          }}
                        />
                        <button
                          type="button"
                          className="upcoming-subtask-icon-action surface-muted text-muted transition hover:brightness-110"
                          title="Удалить подзадачу"
                          onClick={async () => {
                            await api.deleteTask(subtask.id);
                            await load();
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          ) : null}
          <section className="workspace-widget-card rounded-[1.35rem] border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold tracking-[-0.01em]">Выполненные задания</h3>
              <div className="light-completed-toggle flex items-center gap-1 rounded-lg bg-slate-800/80 p-1 text-[11px]">
                <button
                  className={`light-completed-toggle-button rounded px-2 py-0.5 ${completedFilter === 'today' ? 'light-completed-toggle-button-active bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('today')}
                >
                  сегодня
                </button>
                <button
                  className={`light-completed-toggle-button rounded px-2 py-0.5 ${completedFilter === 'all' ? 'light-completed-toggle-button-active bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('all')}
                >
                  все
                </button>
              </div>
            </div>
            <ul className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 text-xs text-muted">
              {completedTasksForPanel.length === 0 ? <li className="text-subtle">Нет выполненных задач для выбранного фильтра</li> : null}
              {completedTasksVisible.map((task) => (
                <li key={task.id} className="workspace-list-row list-item-surface flex items-center gap-2 rounded-xl border px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked
                    onChange={async () => {
                      await api.updateTask(task.id, { status: 'TODO' });
                      await load();
                    }}
                  />
                  <span className="truncate"><LinkifiedText text={task.title} stopPropagationOnLinkClick /></span>
                </li>
              ))}
            </ul>
            {hasMoreCompletedTasks ? (
              <button
                type="button"
                className="mt-2 w-full rounded-md border border-cyan-500/40 bg-cyan-900/30 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-800/40"
                onClick={() => setCompletedVisibleCount((prev) => prev + 40)}
              >
                Показать ещё ({completedTasksForPanel.length - completedTasksVisible.length})
              </button>
            ) : null}
          </section>
          <section className="workspace-widget-card rounded-[1.35rem] border p-4">
            <h3 className="mb-3 text-base font-bold tracking-[-0.01em]">Управление секторами</h3>
            <ul className="space-y-2 text-xs">
              {spheres.map((sphere) => {
                const Icon = resolveSphereIcon(sphere.icon);
                return (
                  <li key={sphere.id} className="workspace-sector-row light-sector-management-item flex items-center justify-between rounded-xl px-2.5 py-2">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1 text-left hover:opacity-90"
                      style={{ color: sphere.color }}
                      onClick={() => setSectorEditorSphere(sphere)}
                    >
                      {Icon ? <Icon size={13} /> : null}
                      <span className="truncate">{sphere.name}</span>
                    </button>
                    <button
                      className="text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        if (!confirm(`Удалить сектор ${sphere.name}?`)) return;
                        await api.deleteSphere(sphere.id);
                        await load();
                      }}
                    >
                      Удалить
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Максимум секторов: {MAX_SPHERES}.</p>
          </section>
          <StandaloneNotesWorkspace key={currentUser?.id ?? 'anonymous'} userId={currentUser?.id ?? ''} requestedNote={requestedStandaloneNote} />
        </aside>
      </div>
      {subtaskCommentContextMenu ? (
        <div className="fixed inset-0 z-[260]" onMouseDown={() => setSubtaskCommentContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setSubtaskCommentContextMenu(null); }}>
          <div
            className="surface-popover fixed min-w-48 rounded-xl border p-1.5 shadow-2xl"
            style={{ left: subtaskCommentContextMenu.x, top: subtaskCommentContextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-violet-100"
              onClick={() => void openSubtaskComments(subtaskCommentContextMenu.task, true)}
            >
              <MessageCircle size={15} />
              Комментировать
            </button>
          </div>
        </div>
      ) : null}

      {subtaskCommentPanel ? (
        <div className="modal-backdrop fixed inset-0 z-[270] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSubtaskCommentPanel(null)}>
          <section className="collaboration-comment-panel flex max-h-[min(72vh,620px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="collaboration-comment-header flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">Комментарии к подзадаче</p>
                <h3 className="mt-1 truncate text-base font-semibold text-primary">{subtaskCommentPanel.task.title}</h3>
              </div>
              <button type="button" className="focused-task-icon-button h-8 w-8 shrink-0 border" onClick={() => setSubtaskCommentPanel(null)} aria-label="Закрыть комментарии"><X size={14} /></button>
            </div>
            <div ref={subtaskCommentScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {subtaskCommentsLoading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-violet-500" /></div> : null}
              {!subtaskCommentsLoading && subtaskComments.length === 0 ? <p className="collaboration-comment-empty rounded-xl px-3 py-4 text-center text-sm">Комментариев пока нет.</p> : null}
              {!subtaskCommentsLoading ? subtaskComments.map((comment) => (
                <article
                  key={comment.id}
                  className={`collaboration-comment-card rounded-2xl border px-3 py-2.5 shadow-sm ${comment.parentCommentId ? 'ml-5' : ''}`}
                  style={{ '--comment-author-color': comment.authorColor ?? '#64748b' } as CSSProperties}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="collaboration-comment-author truncate text-xs font-semibold">{comment.authorName}</span>
                    <time className="collaboration-comment-time shrink-0 text-[10px]">{new Date(comment.createdAt).toLocaleString('ru-RU')}</time>
                  </div>
                  <p className="collaboration-comment-text mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
                  <button type="button" className="collaboration-comment-reply mt-1.5 text-[11px] font-semibold" onClick={() => { setSubtaskCommentReplyTo(comment); setSubtaskCommentPanel((current) => current ? { ...current, compose: true } : current); }}>
                    Ответить
                  </button>
                </article>
              )) : null}
            </div>
            <div className="collaboration-comment-composer border-t px-4 py-3">
              {subtaskCommentReplyTo ? (
                <div className="collaboration-comment-reply-preview mb-2 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">Ответ для {subtaskCommentReplyTo.authorName}: {subtaskCommentReplyTo.content}</span>
                  <button type="button" className="shrink-0" onClick={() => setSubtaskCommentReplyTo(null)} aria-label="Отменить ответ"><X size={13} /></button>
                </div>
              ) : null}
              <textarea
                className="collaboration-comment-input min-h-20 w-full resize-y rounded-2xl border px-3 py-2 text-sm outline-none"
                placeholder={subtaskCommentReplyTo ? 'Напишите ответ…' : 'Оставьте комментарий…'}
                value={subtaskCommentDraft}
                autoFocus={subtaskCommentPanel.compose}
                maxLength={3000}
                onChange={(event) => setSubtaskCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void sendSubtaskComment();
                  }
                }}
              />
              {subtaskCommentError ? <p className="mt-1 text-xs text-rose-500">{subtaskCommentError}</p> : null}
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted">Ctrl/Cmd + Enter для отправки</p>
                <button type="button" className="primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!subtaskCommentDraft.trim() || subtaskCommentSending} onClick={() => void sendSubtaskComment()}>
                  {subtaskCommentSending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
                  Отправить
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {editorState ? (
        <TaskEditor
          timelineTasks={timelinePickerTasks}
          task={editorState.task}
          subtasks={editorState.task?.id ? (subtaskMap[editorState.task.id] ?? []) : []}
          initialSphereId={editorState.initialSphereId}
          spheres={spheres}
          defaultAiNotificationsEnabled={isAiNotificationsDefaultEnabled}
          timeZone={userTimeZone}
          onCancel={() => setEditorState(null)}
          onSave={persistTask}
          onAutoSave={editorState.task?.id ? autosaveEditorTask : undefined}
          onSphereChange={editorState.task?.id ? (sphereId) => {
            const taskId = editorState.task!.id;
            setTasks((current) => current.map((task) => (
              task.id === taskId ? { ...task, sphereId } : task
            )));
          } : undefined}
          editorType={editorState.task?.taskType === 'EVENT' ? 'event' : 'task'}
          onGenerateWithAi={createTaskFromAi}
          parentTaskTitle={editorState.task?.parentTaskId ? (taskById.get(editorState.task.parentTaskId)?.title ?? null) : null}
          onOpenParentTask={editorState.task?.parentTaskId ? () => {
            setEditorState(null);
            setFocusedTaskId(editorState.task!.parentTaskId!);
          } : undefined}
          onPrepareReport={editorState.task?.id && !editorState.task.parentTaskId ? () => setReportPromptTask(editorState.task!) : undefined}
          onComplete={editorState.task?.id ? async () => {
            const selected = editorState.task!;
            if (selected.parentTaskId) {
              await toggleSubtaskDone(selected);
              setEditorState(null);
            } else {
              await completeTask(selected);
            }
          } : undefined}
          onDelete={editorState.task?.id ? async () => {
            if (editorState.task!.isCollaborative && editorState.task!.collaborationOwner) {
              setCollaborationAction({ task: editorState.task!, action: 'delete' });
              setEditorState(null);
              return;
            }
            await api.deleteTask(editorState.task!.id, 'me');
            setEditorState(null);
            await load();
          } : undefined}
        />
      ) : null}

      {focusedTask && focusedDraft ? <CalendarExportDialog
        item={{ id: focusedTask.id, title: focusedDraft.title ?? focusedTask.title, description: focusedDraft.description, location: focusedDraft.location, dueDate: focusedDraft.dueDate }}
        isOpen={isFocusedCalendarExportOpen}
        onClose={() => setIsFocusedCalendarExportOpen(false)}
        onSaveBeforeExport={flushFocusedTaskSave}
        openExternalUrl={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
        timeZone={userTimeZone}
        timelineTasks={timelinePickerTasks}
      /> : null}

      {focusedTask && focusedDraft && !(isFocusModeOpen && isFocusedNotesEditorOpen) ? (
        <div className={`focused-task-modal-backdrop fixed inset-0 ${isAiChatOpen ? 'z-[180]' : isFocusModeOpen ? 'z-[150]' : 'z-40'} flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`}>
          <div className="focused-task-modal-layout flex w-full max-w-[1380px] items-stretch justify-center gap-3">

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside
          data-tour="ai-task-help"
          className="ai-chat-lightweight app-side-panel focused-task-ai-panel focused-task-modal-panel-height relative order-2 hidden min-h-0 w-[450px] shrink-0 flex-col overflow-hidden rounded-[2rem] border p-4 lg:flex"
          onDragOver={(event) => { event.preventDefault(); if (getTaskAiRecipientId(focusedTask) === 'ai') setIsFocusedAiDragActive(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusedAiDragActive(false); }}
          onDrop={(event) => { event.preventDefault(); setIsFocusedAiDragActive(false); addFocusedAiFiles(Array.from(event.dataTransfer.files ?? [])); }}
        >
              {isFocusedAiDragActive ? <div className="focused-task-ai-drop-overlay"><Paperclip size={22} /><span>Перетащите файлы, чтобы прикрепить</span></div> : null}
              <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5">
                <button
                  className={`focused-task-ai-icon-button ${isFocusedAiSearchOpen ? 'focused-task-ai-icon-button-active' : ''}`}
                  onClick={() => setIsFocusedAiSearchOpen((prev) => !prev)}
                  title="Поиск по диалогу"
                >
                  <Search size={14} />
                </button>
                <button
                  className="focused-task-ai-icon-button"
                  onClick={() => setIsAiExpanded(true)}
                  title="Развернуть диалог"
                >
                  <Maximize2 size={14} />
                </button>
                <button type="button" className="focused-task-ai-icon-button" onClick={() => void closeFocusedTask()} aria-label="Закрыть окно"><X size={16} /></button>
              </div>
              <div className="mb-3 flex shrink-0 items-start justify-between gap-3 pr-32">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold ai-panel-title"><Bot size={16} /> Помощь ИИ</p>
                </div>
                <TaskMonitoringStatuses taskId={focusedTask.id}
                  enabled={focusedTask.aiMonitoringEnabled === true}
                  allowed={focusedTask.taskType === 'TASK' && !focusedTask.parentTaskId && !focusedTask.isCollaborative}
                  onTaskUpdated={(updated) => {
                    setTasks(previous => previous.map(task => task.id === updated.id ? updated : task));
                    setFocusedDraft(previous => previous ? { ...previous, aiMonitoringEnabled: updated.aiMonitoringEnabled } : previous);
                  }} />
              </div>
              <div className="focused-task-ai-thread-region relative mb-2 min-h-0 flex-1">
                <AiModelChip value={focusedAiModel} onChange={(model) => focusedTask && setAiModelByTask((prev) => ({ ...prev, [focusedTask.id]: model }))} ariaLabel="Выбрать модель ИИ для задачи" className="absolute left-1/2 top-0 z-20 -translate-x-1/2" />
                <div ref={focusedAiDialogContainerRef} className="chat-thread focused-task-ai-thread-through h-full min-h-0 space-y-2 overflow-y-auto rounded-xl p-3 pt-12">
                {isFocusedAiSearchOpen ? (
                  <label className="surface-input sticky top-0 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted">
                    <Search size={12} />
                    <input
                      className="w-full bg-transparent text-[11px] text-primary placeholder:text-slate-400 focus:outline-none"
                      placeholder="Поиск по сообщениям"
                      value={focusedAiSearchQuery}
                      onChange={(event) => setFocusedAiSearchQuery(event.target.value)}
                    />
                  </label>
                ) : null}
                {filteredFocusedAiDialog.length === 0 ? (focusedAiDialog.length === 0
                  ? <TaskAiEmptyState />
                  : <p className="text-xs text-subtle">Сообщения не найдены.</p>) : null}
                {filteredFocusedAiDialog.map((message, index) => (
                  <div
                    key={message.id}
                    className={`ai-message-forward-group w-fit max-w-[88%] ${message.role === 'assistant' ? 'mr-auto' : 'ml-auto'}`}
                    >
                    <div className={`chat-message w-full rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'chat-message-assistant' : `chat-message-user ${message.authorColor ? 'collaboration-chat-message-authored' : ''}`}`}
                    style={message.role === 'user' && message.authorColor ? ({ '--message-author-color': message.authorColor } as CSSProperties) : undefined}
                  >
                    <div className="mb-1 flex items-center justify-between"><p className="chat-message-label text-[11px] font-semibold uppercase tracking-wide">{message.authorName ?? (message.role === 'assistant' ? 'ИИ' : 'Вы')}{message.messageKind === 'HUMAN' && message.recipientName ? ` → ${message.recipientName}` : ''}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focused-${index}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focused-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                    <div>{message.messageKind === 'MONITOR_ACTION' ? <TaskMonitoringActionBadge content={message.content} /> : message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={openTaskReferenceFromAi} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}</div>
                    {message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} searched={message.webSearchUsed} /> : null}{message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} /> : null}
                    {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[10px] text-muted opacity-75">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}
                    {message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} onApplied={() => void load()} /> : null}{message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={(approval) => continueTelegramReadTask(approval, focusedTask!.id)} /> : null}
                                      </div>
                  <div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={(target) => (setReplyToAiTask(target), focusedTask && setAiRecipientByTaskId(prev => ({ ...prev, [focusedTask.id]: 'ai' })))} /><TelegramMessageQuickShare text={message.content} compact initialNoteSphereId={focusedTask?.sphereId ?? null} /></div>
                </div>
                ))}
                {focusedTask.aiMonitoringEnabled ? <TaskMonitoringTriggerChips taskId={focusedTask.id} enabled /> : null}
                {aiLoadingTaskId === focusedTask.id ? <TaskAiProgress status={aiProgressByTask[focusedTask.id] ?? 'analyzing_request'} /> : focusedTask.aiMonitoringEnabled ? <TaskMonitoringIntroProgress taskId={focusedTask.id} /> : null}
                </div>
              </div>
              <div className="focused-task-ai-composer">
              {replyToAiTask ? <AiReplyPreview target={replyToAiTask} onDismiss={() => setReplyToAiTask(null)} /> : null}
<AiAttachmentTiles files={aiPendingFiles} onRemove={(file) => removePendingAiFile(file.name)} busy={aiLoadingTaskId === focusedTask.id} uploadProgress={taskAiUploadProgress} />
                            {aiError ? <p className="mb-2 shrink-0 text-[11px] text-rose-300">{aiError}</p> : null}
              <div
                className="task-ai-recipient-interaction"
                onFocusCapture={() => setIsAiRecipientPickerVisible(true)}
                onBlurCapture={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                  setIsAiRecipientPickerVisible(false);
                  setIsAiRecipientMenuOpen(false);
                }}
              >
              {isAiRecipientPickerVisible ? renderTaskAiRecipientPicker(focusedTask) : null}
              <div className="ai-chat-composer mt-2 flex shrink-0 items-center gap-2 rounded-3xl border p-2">
              <AutoGrowingTextarea
                className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm focus:ring-0"
                placeholder="Напишите сообщение…"
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                onPaste={(event) => { const files = clipboardImageFiles(event.clipboardData); if (files.length) { event.preventDefault(); addFocusedAiFiles(files); } }}
                onKeyDown={(event) => {
                  if (shouldSendAiMessageOnEnter(event)) {
                    event.preventDefault();
                    void sendFocusedAiQuestion();
                  }
                }}
              />
              <input
                ref={focusedAiFileInputRef}
                type="file"
                accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleAiFileSelect}
              />
              <div className="flex items-center gap-2">
                <button
                  className="focused-task-ai-attach-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40"
                  type="button"
                  onClick={() => focusedAiFileInputRef.current?.click()}
                  disabled={getTaskAiRecipientId(focusedTask) !== 'ai'}
                  title={getTaskAiRecipientId(focusedTask) === 'ai' ? 'Прикрепить файл' : 'Вложения доступны только при отправке ИИ'}
                >
                  <Paperclip size={16} />
                </button>
                <button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-500 disabled:opacity-50" disabled={aiLoadingTaskId === focusedTask.id || (!aiDraft.trim() && aiPendingFiles.length === 0)} onClick={() => void sendFocusedAiQuestion()} title="Отправить">{aiLoadingTaskId === focusedTask.id ? <Loader2 className="animate-spin" size={17} /> : <SendHorizontal size={17} />}</button>
              </div></div>
              </div>
              </div>
            </aside>

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside className="focused-task-editor-shell focus-mode-shell focused-task-modal-panel-height order-1 relative min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border p-5">
            <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-36 top-3 z-20 lg:hidden" onClick={() => void closeFocusedTask()} aria-label="Закрыть окно"><X size={16} /></button>
            <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-24 top-3 z-20" onClick={async () => { setTaskShareDialog({ mode: 'create', loading: true }); try { const { token } = await api.createTaskShare(focusedTask.id); setTaskShareDialog({ mode: 'create', url: `${window.location.origin}${window.location.pathname}?joinTask=${encodeURIComponent(token)}` }); await load(); } catch (error) { setTaskShareDialog({ mode: 'create', error: error instanceof Error ? error.message : 'Не удалось создать ссылку' }); } }} aria-label="Поделиться задачей" title="Поделиться задачей"><SendHorizontal size={16} /></button>
            <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-14 top-3 z-20" onClick={() => setIsFocusedCalendarExportOpen(true)} aria-label="Добавить задачу в календарь" title="Добавить в календарь"><CalendarPlus size={16} /></button>
            <button type="button" className="focused-task-icon-button focused-task-calendar-like-button absolute right-5 top-3 z-20" onClick={() => setIsFocusedSettingsOpen((prev) => !prev)} aria-label="Открыть настройки задачи" title="Настройки задачи"><Settings size={16} /></button>
            <div className="flex h-full min-h-0 flex-col">
              <div className="focus-main-card flex min-h-0 flex-none flex-col overflow-visible rounded-[2rem] border-0 p-0 shadow-none">
                <div
                  className={`min-h-0 flex-1 overflow-y-auto px-1 ${
                    (focusedTitleRows === 1) ? 'focused-task-single-line-title' : ''
                  }`}
                  onScroll={() => setIsSubtaskFilterOpen(false)}
                >
                  <div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус задачи</p>{focusedTask.isCollaborative ? <button type="button" className="rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 shadow-sm" onClick={() => setIsCollaborationSettingsOpen(true)}>Совместная задача</button> : null}</div>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="relative min-w-0 flex-1">
                      <textarea
                        ref={focusedTaskTitleInputRef}
                        className="focused-task-title-input invisible-scrollbar min-w-0 w-full resize-none border-0 bg-transparent p-0 text-left text-3xl font-bold leading-tight text-slate-950 shadow-none outline-none"
                        value={isEditingFocusedTitle ? focusedTitleDraft : focusedDraft.title || 'Без названия'}
                        rows={focusedTitleRows}
                        onFocus={() => {
                          setFocusedTitleDraft(focusedDraft.title ?? '');
                          setIsEditingFocusedTitle(true);
                        }}
                        onChange={(event) => setFocusedTitleDraft(event.target.value)}
                        onBlur={() => {
                          setFocusedDraft((prev) => ({ ...(prev ?? {}), title: focusedTitleDraft.trim() || prev?.title || '' }));
                          setIsEditingFocusedTitle(false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setFocusedTitleDraft(focusedDraft.title ?? '');
                            setIsEditingFocusedTitle(false);
                            event.currentTarget.blur();
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            setFocusedDraft((prev) => ({ ...(prev ?? {}), title: focusedTitleDraft.trim() || prev?.title || '' }));
                            setIsEditingFocusedTitle(false);
                            event.currentTarget.blur();
                          }
                        }}
                        title="Редактировать название"
                      />
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button className="danger-button rounded-xl px-3 py-2 text-sm font-semibold" onClick={async () => { if (focusedTask.isCollaborative && focusedTask.collaborationOwner) { setCollaborationAction({ task: focusedTask, action: 'delete' }); return; } await api.deleteTask(focusedTask.id, 'me'); setFocusedTaskId(null); await load(); }}>Удалить</button>
                      <button className="success-button rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => completeTask(focusedTask)}>Выполнить</button>
                    </div>
                  </div>
                  <div className="focused-task-deadline-row mt-3 flex items-center gap-2 text-sm font-medium text-violet-500">
                    <span>{focusedDraft.dueDate ? `До дедлайна: ${formatDeadlineLeft(focusedDraft.dueDate)}` : 'Дедлайн не задан'}</span>
                    <DateTimePickerWithApply
                      value={focusedDraft.dueDate}
                      timelineTasks={timelinePickerTasks}
                      detachedPopup
                      iconOnly
                      buttonClassName="focused-task-icon-button"
                      onChange={(nextValue) => setFocusedDraft((p) => ({ ...(p ?? {}), dueDate: nextValue }))}
                    />
                  </div>
                  <ResizableDescriptionSurface className="focused-task-description-surface mt-3 rounded-2xl p-3">
                    <TaskDescriptionInput
                      className="focused-task-description-input subtask-description-inline invisible-scrollbar h-full min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-muted outline-none placeholder:text-slate-400"
                      placeholder="Введите описание"
                      value={focusedDraft.description ?? ''}
                      onChange={(description) => setFocusedDraft((p) => ({ ...(p ?? {}), description }))}
                    />
                  </ResizableDescriptionSurface>
                  <div className="mt-2 flex flex-wrap items-center justify-start gap-2">
                    <button
                      type="button"
                      className="focused-task-icon-button focused-task-calendar-like-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
                      onClick={() => setIsFocusedNotesEditorOpen(true)}
                      title="Открыть заметки"
                      aria-label="Открыть заметки"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      className={`focused-task-icon-button focused-task-calendar-like-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isTaskAttachmentDragActive ? 'notes-open-button-active' : ''} ${isUploadingTaskAttachment ? 'opacity-60' : ''}`}
                      onClick={() => focusedTaskAttachmentInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsTaskAttachmentDragActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setIsTaskAttachmentDragActive(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const files = Array.from(event.dataTransfer.files ?? []);
                        void uploadFocusedTaskFiles(files);
                      }}
                      disabled={isUploadingTaskAttachment}
                      title="Добавить файлы к задаче"
                      aria-label="Добавить файлы к задаче"
                    >
                      <Paperclip size={15} />
                    </button>
                    {focusedTaskAttachments.map((attachment) => (
                      <div key={attachment.id} className="task-attachment-pill inline-flex max-w-[210px] items-center gap-1 rounded-xl border px-2 py-1 text-[11px]">
                        <button
                          type="button"
                          title={`${attachment.name} • скачать`}
                          onClick={() => downloadTaskAttachment(attachment)}
                          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5"
                        >
                          <FileText size={12} className="shrink-0" />
                          <span className="truncate">{attachment.name}</span>
                        </button>
                        <button
                          type="button"
                          title="Удалить файл"
                          onClick={() => void removeTaskAttachment(attachment.id)}
                          className="task-attachment-remove rounded-md p-0.5"
                        >
                          <X size={11} className="shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {isFocusedNotesEditorOpen ? (
                    <NotesEditor
                      value={focusedDraft.description ?? ''}
                      onChange={(description) => setFocusedDraft((p) => ({ ...(p ?? {}), description }))}
                      onClose={() => setIsFocusedNotesEditorOpen(false)}
                    />
                  ) : null}
                  <input
                    ref={focusedTaskAttachmentInputRef}
                    type="file"
                    accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleTaskAttachmentFileSelect}
                  />
                  {isFocusedSettingsOpen ? (
                    <div className="focused-task-settings-panel absolute right-5 top-16 z-30 max-h-[calc(100dvh-110px)] w-[min(92vw,360px)] space-y-4 overflow-y-auto overscroll-contain rounded-3xl border p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-primary">Настройки задачи</h4>
                        <button type="button" className="focused-task-icon-button h-8 w-8 border" onClick={() => setIsFocusedSettingsOpen(false)} aria-label="Закрыть настройки"><X size={14} /></button>
                      </div>
                      {focusedSaveError ? <p role="alert" className="focused-task-settings-error rounded-xl border px-3 py-2 text-xs">Не удалось сохранить изменения: {focusedSaveError}</p> : null}
                  {focusedTask.taskType !== 'EVENT' && focusedTask.taskType !== 'REMINDER' ? (
                    <button type="button" className="surface-muted flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-primary"
                      onClick={() => { setIsFocusedSettingsOpen(false); setReportPromptTask(focusedTask); }}>
                      <FileText size={15} /> Подготовить отчёт
                    </button>
                  ) : null}
                  <div className="task-edit-compact-grid mt-4 grid grid-cols-2 items-end gap-3">
                    <label className="block text-xs font-semibold text-muted">Сектор
                      <CustomSelect
                        className="mt-1"
                        value={focusedDraft.sphereId ?? ''}
                        onChange={(value) => {
                          const nextSphereId = value || null;
                          // Keep this in the unsaved draft until the API confirms it.
                          // Updating the persisted task here would mask the change from autosave.
                          setFocusedDraft((prev) => ({ ...(prev ?? {}), sphereId: nextSphereId }));
                          setFocusedSaveError(null);
                        }}
                        options={[
                          { value: '', label: 'Без сектора', color: '#7c3aed' },
                          ...spheres.map((sphere) => ({ value: sphere.id, label: sphere.name, color: sphere.color })),
                        ]}
                        ariaLabel="Выбрать сектор"
                        buttonClassName="focused-task-pill-select"
                        menuClassName="task-edit-sector-menu"
                        detachedPopup
                      />
                    </label>
                    <label className="block text-xs font-semibold text-muted focused-task-notify">Уведомлять за
                      <CustomSelect
                        className="mt-1"
                        value={focusedNotifyPreset}
                        onChange={(value) => {
                          setFocusedNotifyPreset(value);
                          setFocusedDraft((p) => ({ ...(p ?? {}), notifyBeforeMinutes: value === 'null' ? null : Number(value) }));
                        }}
                        options={NOTIFY_PRESETS}
                        ariaLabel="Уведомлять за"
                        buttonClassName="focused-task-pill-select"
                        menuClassName="task-edit-notify-menu focused-task-notify-menu"
                        detachedPopup
                      />
                    </label>
                  </div>
                  <div className="task-edit-checkbox-row flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(focusedDraft.isRecurring)}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setFocusedDraft((p) => {
                          if (!p) return p;
                          if (enabled) return { ...p, isRecurring: true };
                          return {
                            ...p,
                            isRecurring: false,
                            recurrenceText: null,
                            recurrenceJson: null,
                            recurrenceSummary: null,
                            recurrenceUntil: null
                          };
                        });
                        if (!enabled) {
                          setFocusedRecurrenceSummary(null);
                        }
                      }}
                    />
                    повторять
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={focusedDraft.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled}
                      onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), aiNotificationsEnabled: e.target.checked }))}
                    />
                    уведомления от ИИ
                  </label>
                  </div>
                  {focusedDraft.isRecurring ? (
                    <TaskRecurrenceConfigurator
                      key={focusedTask.id}
                      value={{ ...focusedDraft, dueDate: focusedDraft.dueDate ?? '' }}
                      onChange={(patch) => {
                        setFocusedDraft((previous) => previous ? ({
                          ...previous,
                          ...patch,
                          ...(patch.dueDate !== undefined ? {
                            dueDate: patch.dueDate || null
                          } : {})
                        }) : previous);
                        setFocusedSaveError(null);
                      }}
                      onParseWithAi={() => void applyFocusedRecurrence()}
                      parsing={focusedRecurrenceLoading}
                      isEvent={focusedTask.taskType === 'EVENT'}
                    />
                  ) : null}
                  <div>
                    <p className="mb-1 text-xs">Важность: {focusedDraft.importance ?? 3}</p>
                    <div className="importance-choice-group grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          className={`importance-choice-button focused-task-importance rounded-xl border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${focusedDraft.importance === level ? 'importance-choice-button-active ring-2 ring-inset' : 'opacity-80 hover:opacity-100'}`}
                          onClick={() => setFocusedDraft((p) => ({ ...(p ?? {}), importance: level }))}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                    </div>
                  ) : null}
                </div>
              </div>
              <div className="focused-task-subtasks mt-2 flex min-h-0 flex-col space-y-2 border-t border-violet-100 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    Подзадачи
                    <button
                      type="button"
                      className="focused-task-add-subtask-button focused-task-calendar-like-button"
                      onClick={() => {
                        setFocusedSubtaskTitle('');
                        setFocusedSubtaskDueDate(null);
                        setIsAddingFocusedSubtask(true);
                      }}
                      title="Добавить подзадачу"
                      aria-label="Добавить подзадачу"
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      type="button"
                      className={`rounded p-1 ${hideClosedFocusedSubtasks ? 'text-cyan-200' : 'text-muted hover:brightness-110'}`}
                      onClick={() => setHideClosedFocusedSubtasks((prev) => !prev)}
                      title={hideClosedFocusedSubtasks ? 'Показывать закрытые подзадачи' : 'Скрывать закрытые подзадачи'}
                    >
                      {hideClosedFocusedSubtasks ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    {focusedTask.isCollaborative && (focusedTask.unreadCommentCount ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="rounded-full border border-violet-400/50 px-2 py-1 text-[10px] font-semibold text-violet-500 hover:brightness-110"
                        title="Отметить все комментарии подзадач прочитанными"
                        aria-label="Отметить все комментарии подзадач прочитанными"
                        onClick={async () => {
                          try {
                            await api.markAllTaskCommentsRead(focusedTask.id);
                            await load();
                          } catch (error) {
                            window.alert(error instanceof Error ? error.message : 'Не удалось обновить комментарии');
                          }
                        }}
                      >
                        Отметить прочитанными ({focusedTask.unreadCommentCount})
                      </button>
                    ) : null}
                  </h4>
                  <div className="flex items-center gap-2">
                    {(subtaskMap[focusedTask.id] ?? []).length === 0 ? (
                      <button
                        type="button"
                        className="focused-task-action-pill focused-task-action-pill-ai"
                        onClick={() => setIsAiSubtasksPromptOpen(true)}
                        disabled={aiSubtasksLoadingTaskId === focusedTask.id}
                      >
                        {aiSubtasksLoadingTaskId === focusedTask.id ? 'Генерирую…' : 'Сформировать ИИ'}
                      </button>
                    ) : null}
                    <div className="relative">
                      <button
                        type="button"
                        className={`focused-task-action-pill ${subtaskFilterMode !== 'none' || Boolean(subtaskAuthorFilterByTaskId[focusedTask.id]) ? 'focused-task-action-pill-active' : 'focused-task-action-pill-filter'}`}
                        onClick={() => setIsSubtaskFilterOpen((prev) => !prev)}
                      >
                        Фильтровать
                      </button>
                      {isSubtaskFilterOpen ? (
                        <div className="subtask-filter-panel absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-52 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur">
                          {SUBTASK_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.mode}
                              type="button"
                              className={`subtask-filter-item block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${subtaskFilterMode === option.mode ? 'subtask-filter-item-active bg-cyan-500/25 text-cyan-100' : 'text-slate-200 hover:bg-slate-800/80'}`}
                              onClick={() => {
                                setSubtaskFilterMode(option.mode);
                                if (option.mode === 'none') setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusedTask.id]: null }));
                                setIsSubtaskFilterOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                          {focusedTask.isCollaborative && focusedTask.collaborationMembers?.length ? (
                            <div className="mt-1 border-t border-slate-700/70 pt-2">
                              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">По участнику</p>
                              <div className="flex flex-wrap gap-1.5 p-1">
                                <button type="button" aria-pressed={!subtaskAuthorFilterByTaskId[focusedTask.id]} className={`shrink-0 rounded-full bg-slate-500 px-2 py-0.5 text-[10px] font-semibold text-white transition ${!subtaskAuthorFilterByTaskId[focusedTask.id] ? 'ring-2 ring-white/90' : 'opacity-80 hover:opacity-100'}`} onClick={() => { setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusedTask.id]: null })); setIsSubtaskFilterOpen(false); }}>Все</button>
                                {focusedTask.collaborationMembers.map((member) => (
                                  <button
                                    key={member.userId}
                                    type="button"
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm transition ${subtaskAuthorFilterByTaskId[focusedTask.id] === member.userId ? 'ring-2 ring-white/90' : 'opacity-80 hover:opacity-100'}`}
                                    style={{ backgroundColor: member.color }}
                                    onClick={() => {
                                      setSubtaskAuthorFilterByTaskId((prev) => ({ ...prev, [focusedTask.id]: prev[focusedTask.id] === member.userId ? null : member.userId }));
                                      setIsSubtaskFilterOpen(false);
                                    }}
                                  >
                                    {member.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                {isAddingFocusedSubtask ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={focusedSubtaskTitleInputRef}
                      className="form-field min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs"
                      placeholder="Название доп задачи"
                      value={focusedSubtaskTitle}
                      onChange={(event) => setFocusedSubtaskTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addFocusedSubtask();
                        }
                      }}
                    />
                    <button type="button" className="primary-button rounded-lg px-2.5 py-1.5 text-xs font-semibold" onClick={() => void addFocusedSubtask()}>
                      Добавить
                    </button>
                    <DateTimePickerWithApply
                      value={focusedSubtaskDueDate}
                      title="Выбрать дату и время подзадачи"
                      detachedPopup
                      iconOnly
                      popupAlign="right"
                      timelineTasks={timelinePickerTasks}
                      buttonClassName="focused-task-inline-subtask-button"
                      onChange={(dueDate) => setFocusedSubtaskDueDate(dueDate)}
                    />
                    <button
                      type="button"
                      className="secondary-button rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      onClick={() => {
                        setIsAddingFocusedSubtask(false);
                        setFocusedSubtaskTitle('');
                        setFocusedSubtaskDueDate(null);
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                ) : null}
                <Reorder.Group
                  axis="y"
                  values={hideClosedFocusedSubtasks ? getFocusedSubtaskItems(focusedTask.id).filter((task) => task.status !== 'DONE' || (task.unreadCommentCount ?? 0) > 0) : getFocusedSubtaskItems(focusedTask.id)}
                  onReorder={(nextOrder) => {
                    reorderVisibleSubtasks(focusedTask.id, nextOrder.map((task) => task.id));
                  }}
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm"
                  ref={focusedSubtaskListScrollRef}
                  onScroll={() => setIsSubtaskFilterOpen(false)}
                >
                  {(hideClosedFocusedSubtasks ? getFocusedSubtaskItems(focusedTask.id).filter((task) => task.status !== 'DONE' || (task.unreadCommentCount ?? 0) > 0) : getFocusedSubtaskItems(focusedTask.id)).map((subtask) => (
                    <Reorder.Item
                      key={subtask.id}
                      value={subtask}
                      whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgba(15,23,42,0.14)', zIndex: 90 }}
                      className={`focused-subtask-row relative flex items-center gap-2 overflow-hidden rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${closingTaskIds.includes(subtask.id) ? 'focused-subtask-row-completing ring-1 ring-emerald-300/70' : ''} ${subtaskFilterMode === 'importance' ? 'focused-subtask-row-importance' : ''} ${subtask.status !== 'DONE' && isOverdue(subtask) ? 'subtask-compact-overdue-static' : subtask.status !== 'DONE' && shouldTaskGlow(subtask) ? 'subtask-compact-reminder-static' : ''}`}
                      style={subtaskFilterMode === 'importance' ? ({ '--subtask-importance-accent': IMPORTANCE_ACCENT_COLORS[subtask.importance ?? 3] ?? IMPORTANCE_ACCENT_COLORS[3] } as CSSProperties) : undefined}
                      onContextMenu={(event) => handleSubtaskCommentContextMenu(event, subtask, Boolean(focusedTask.isCollaborative))}
                    >
                      <input type="checkbox" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      {closingTaskIds.includes(subtask.id) ? <Check size={13} className="timeline-task-chip-success shrink-0" /> : null}
                      <button
                        type="button"
                        className={`min-w-0 flex-1 truncate text-left ${subtask.status === 'DONE' || closingTaskIds.includes(subtask.id) ? 'timeline-task-chip-completed line-through opacity-60 decoration-2' : ''}`}
                        onClick={() => setEditorState({ task: subtask })}
                        title="Открыть доп задачу"
                      >
                        <LinkifiedText text={subtask.title} stopPropagationOnLinkClick />
                      </button>
                      {renderWorkspaceAttachmentIndicator(subtask)}
                      {subtask.dueDate ? <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-violet-500" title={`До дедлайна: ${formatDeadlineLeft(subtask.dueDate)}`}>{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
                      {focusedTask.isCollaborative ? renderSubtaskCommentButton(subtask) : null}
                      {focusedTask.isCollaborative && subtask.creatorName ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ backgroundColor: subtask.creatorColor ?? '#8b5cf6' }}>{subtask.creatorName}</span> : null}
                      <InlineDateTimePickerIcon
                        value={subtask.dueDate}
                        title="Изменить срок подзадачи"
                        detachedPopup
                        timelineTasks={timelinePickerTasks}
                        onChange={async (dueDate) => {
                          await api.updateTask(subtask.id, { dueDate });
                          await load();
                        }}
                      />
                    </Reorder.Item>
                  ))}
                  {(hideClosedFocusedSubtasks ? getFocusedSubtaskItems(focusedTask.id).filter((task) => task.status !== 'DONE' || (task.unreadCommentCount ?? 0) > 0) : getFocusedSubtaskItems(focusedTask.id)).length === 0 ? <li className="text-xs text-subtle">Пока нет подзадач</li> : null}
                </Reorder.Group>
              </div>
            </div>
            </aside>
          </div>
          {isAiSubtasksPromptOpen ? (
            <div
              className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => {
                if (aiSubtasksLoadingTaskId !== focusedTask.id) {
                  setIsAiSubtasksPromptOpen(false);
                }
              }}
            >

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside className="dialog-surface w-full max-w-lg space-y-3 rounded-2xl border p-4" onClick={(event) => event.stopPropagation()}>
                <h4 className="text-base font-semibold text-primary">Пояснение для генерации подзадач</h4>
                <p className="text-xs text-muted">
                  При желании добавьте пояснение, чтобы ИИ лучше понял контекст. Например: желаемый формат, ограничения, приоритеты.
                </p>
                <textarea
                  className="form-field min-h-24 w-full rounded border p-2 text-sm"
                  placeholder="Необязательно. Например: сначала быстрые шаги на сегодня, затем всё остальное."
                  value={aiSubtasksPrompt}
                  onChange={(event) => setAiSubtasksPrompt(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="surface-muted rounded px-3 py-2 text-sm"
                    onClick={() => setIsAiSubtasksPromptOpen(false)}
                    disabled={aiSubtasksLoadingTaskId === focusedTask.id}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="rounded bg-rose-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    onClick={() => void generateFocusedSubtasksWithAi()}
                    disabled={aiSubtasksLoadingTaskId === focusedTask.id}
                  >
                    {aiSubtasksLoadingTaskId === focusedTask.id ? 'Генерирую…' : 'Сформировать ИИ'}
                  </button>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      ) : null}

      {focusedTask && isAiExpanded ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAiExpanded(false)}>
          <div
            className="ai-chat-lightweight ai-chat-lightweight-panel app-card focused-task-ai-expanded-panel relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border p-5"
            onClick={(event) => event.stopPropagation()}
            onDragOver={(event) => { event.preventDefault(); if (getTaskAiRecipientId(focusedTask) === 'ai') setIsFocusedAiDragActive(true); }}
            onDragLeave={(event) => { if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusedAiDragActive(false); }}
            onDrop={(event) => { event.preventDefault(); setIsFocusedAiDragActive(false); addFocusedAiFiles(Array.from(event.dataTransfer.files ?? [])); }}
          >
            {isFocusedAiDragActive ? <div className="focused-task-ai-drop-overlay"><Paperclip size={24} /><span>Перетащите файлы, чтобы прикрепить</span></div> : null}
            <div className="task-ai-fullscreen-header mb-3 flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-base font-semibold ai-panel-title"><Bot size={18} /> Полноэкранный диалог с ИИ</p>
                <p className="mt-1 max-w-[42ch] truncate text-xs text-muted" title={focusedTask.title}>{focusedTask.title}</p>
              </div>
              <div className="task-ai-fullscreen-actions flex shrink-0 flex-wrap items-center justify-end gap-3">
                <div className="task-ai-fullscreen-monitor shrink-0">
                  <TaskMonitoringStatuses taskId={focusedTask.id}
                    enabled={focusedTask.aiMonitoringEnabled === true}
                    allowed={focusedTask.taskType === 'TASK' && !focusedTask.parentTaskId && !focusedTask.isCollaborative}
                    onTaskUpdated={(updated) => {
                      setTasks(previous => previous.map(task => task.id === updated.id ? updated : task));
                      setFocusedDraft(previous => previous ? { ...previous, aiMonitoringEnabled: updated.aiMonitoringEnabled } : previous);
                    }} />
                </div>
                <button type="button" className="task-ai-clear-dialog-button"
                  onClick={() => void clearFocusedAiDialog()}
                  disabled={clearingTaskAiId === focusedTask.id || aiLoadingTaskId === focusedTask.id}
                  title="Очистить историю диалога по этой задаче"
                ><Trash2 size={14} /> {clearingTaskAiId === focusedTask.id ? 'Очищаю…' : 'Очистить'}</button>
                <div className="task-ai-fullscreen-window-actions flex items-center gap-2">
                  <button type="button" className={`focused-task-ai-icon-button ${isFocusedAiSearchOpen ? 'focused-task-ai-icon-button-active' : ''}`}
                    onClick={() => setIsFocusedAiSearchOpen(prev => !prev)} title="Поиск по диалогу"><Search size={14} /></button>
                  <button type="button" className="focused-task-ai-icon-button" onClick={() => setIsAiExpanded(false)} title="Свернуть"><Minimize2 size={14} /></button>
                  <button type="button" className="focused-task-ai-icon-button" onClick={() => { setIsAiExpanded(false); void closeFocusedTask(); }} title="Закрыть"><X size={14} /></button>
                </div>
              </div>
            </div>
            <AiModelChip value={focusedAiModel} onChange={(model) => focusedTask && setAiModelByTask((prev) => ({ ...prev, [focusedTask.id]: model }))} ariaLabel="Выбрать модель ИИ для задачи" className="absolute left-1/2 top-[4.5rem] z-20 -translate-x-1/2" />
            <div ref={expandedAiDialogContainerRef} className="chat-thread focused-task-ai-thread-through min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl p-4 pt-12">
              {isFocusedAiSearchOpen ? (
                <label className="surface-input sticky top-0 z-10 flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] text-muted">
                  <Search size={12} />
                  <input
                    className="w-full bg-transparent text-xs text-primary placeholder:text-subtle focus:outline-none"
                    placeholder="Поиск по сообщениям"
                    value={focusedAiSearchQuery}
                    onChange={(event) => setFocusedAiSearchQuery(event.target.value)}
                  />
                </label>
              ) : null}
              {filteredFocusedAiDialog.length === 0 ? (focusedAiDialog.length === 0
                ? <TaskAiEmptyState />
                : <p className="text-sm text-subtle">Сообщения не найдены.</p>) : null}
              {filteredFocusedAiDialog.map((message, index) => (
                <div
                  key={`expanded-${message.id}`}
                  className={`ai-message-forward-group w-fit max-w-[72ch] ${message.role === 'assistant' ? 'mr-auto' : 'ml-auto'}`}
                  >
                  <div className={`chat-message w-full rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'chat-message-assistant' : `chat-message-user ${message.authorColor ? 'collaboration-chat-message-authored' : ''}`}`}
                  style={message.role === 'user' && message.authorColor ? ({ '--message-author-color': message.authorColor } as CSSProperties) : undefined}
                >
                  <div className="mb-1 flex items-center justify-between"><p className="chat-message-label text-xs font-semibold uppercase tracking-wide">{message.authorName ?? (message.role === 'assistant' ? 'ИИ' : 'Вы')}{message.messageKind === 'HUMAN' && message.recipientName ? ` → ${message.recipientName}` : ''}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focused-expanded-${index}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focused-expanded-${index}` ? <Check size={12} className="text-muted" /> : <Copy size={12} />}</button> : null}</div>
                  <div>{message.messageKind === 'MONITOR_ACTION' ? <TaskMonitoringActionBadge content={message.content} /> : message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={(task) => { setIsAiExpanded(false); openTaskReferenceFromAi(task); }} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(message.content, message.attachmentPreviews, message.id)}</CollapsibleUserMessage>}</div>
                  {message.role === 'assistant' && message.webSearchUsed ? <WebCitations sources={message.webSources} searched={message.webSearchUsed} /> : null}{message.role === 'assistant' && message.generatedDocument ? <AiGeneratedDocumentButton document={message.generatedDocument} /> : null}
                    {message.role === 'assistant' && message.creditsSpentMilli != null && message.creditsSpentMilli > 0 ? <div className="mt-2 text-[11px] text-muted opacity-75">{formatCreditsSpent(message.creditsSpentMilli)}</div> : null}
                    {message.role === 'assistant' && message.taskProposal ? <AiTaskProposalCard proposal={message.taskProposal} onApplied={() => void load()} /> : null}{message.role === 'assistant' && message.telegramSendDraft ? <TelegramInlineSendCard draft={message.telegramSendDraft} /> : null}{message.role === 'assistant' && message.telegramReadDraft ? <TelegramReadConsentCard draft={message.telegramReadDraft} onContinue={(approval) => continueTelegramReadTask(approval, focusedTask!.id)} /> : null}
                                    </div>
                <div className="ai-message-forward-actions"><AiReplyAction message={message} onReply={(target) => (setReplyToAiTask(target), focusedTask && setAiRecipientByTaskId(prev => ({ ...prev, [focusedTask.id]: 'ai' })))} /><TelegramMessageQuickShare text={message.content} compact initialNoteSphereId={focusedTask?.sphereId ?? null} /></div>
              </div>
              ))}
              {focusedTask.aiMonitoringEnabled ? <TaskMonitoringTriggerChips taskId={focusedTask.id} enabled /> : null}
                {aiLoadingTaskId === focusedTask.id ? <TaskAiProgress status={aiProgressByTask[focusedTask.id] ?? 'analyzing_request'} /> : focusedTask.aiMonitoringEnabled ? <TaskMonitoringIntroProgress taskId={focusedTask.id} /> : null}
            </div>
            <div className="focused-task-ai-composer focused-task-ai-composer-expanded">
            {replyToAiTask ? <AiReplyPreview target={replyToAiTask} onDismiss={() => setReplyToAiTask(null)} /> : null}
<AiAttachmentTiles files={aiPendingFiles} onRemove={(file) => removePendingAiFile(file.name)} busy={aiLoadingTaskId === focusedTask.id} uploadProgress={taskAiUploadProgress} />
            <div
              className="task-ai-recipient-interaction"
              onFocusCapture={() => setIsAiRecipientPickerVisible(true)}
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                setIsAiRecipientPickerVisible(false);
                setIsAiRecipientMenuOpen(false);
              }}
            >
            {isAiRecipientPickerVisible ? renderTaskAiRecipientPicker(focusedTask) : null}
            <div className="ai-chat-composer flex items-center gap-2 rounded-3xl border p-2">
              <AutoGrowingTextarea className="form-field min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm leading-relaxed focus:ring-0" placeholder="Напишите сообщение…" value={aiDraft} onChange={(event) => setAiDraft(event.target.value)} onPaste={(event) => { const files = clipboardImageFiles(event.clipboardData); if (files.length) { event.preventDefault(); addFocusedAiFiles(files); } }} onKeyDown={(event) => { if (shouldSendAiMessageOnEnter(event)) { event.preventDefault(); void sendFocusedAiQuestion(); } }} />
              <input ref={expandedAiFileInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleAiFileSelect} />
              <button className="focused-task-ai-attach-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40" type="button" title={getTaskAiRecipientId(focusedTask) === 'ai' ? 'Прикрепить файл' : 'Вложения доступны только при отправке ИИ'} disabled={getTaskAiRecipientId(focusedTask) !== 'ai'} onClick={() => expandedAiFileInputRef.current?.click()}><Paperclip size={16} /></button>
              <button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg disabled:opacity-50" disabled={aiLoadingTaskId === focusedTask.id || (!aiDraft.trim() && aiPendingFiles.length === 0)} onClick={() => void sendFocusedAiQuestion()} title="Отправить">{aiLoadingTaskId === focusedTask.id ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}</button>
            </div>
            </div>
            {aiError ? <p className="mt-2 text-xs text-rose-300">{aiError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {isUpcomingSubtasksModalOpen ? (
        <div className="modal-backdrop upcoming-subtasks-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIsUpcomingSubtasksModalOpen(false)}>

        {timelineCreateMenu ? (
          <div
            className="fixed z-[130]"
            style={{ left: timelineCreateMenu.x, top: timelineCreateMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
              <button
                type="button"
                className="primary-button w-full rounded-lg px-3 py-2 text-left text-sm"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'TASK');
                  setTimelineCreateMenu(null);
                }}
              >
                Добавить задачу
              </button>
              <button
                type="button"
                className="timeline-event-menu-button mt-1.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
                onClick={() => {
                  openCreateTaskFromTimeline(timelineCreateMenu.date, timelineCreateMenu.hour, timelineCreateMenu.minute ?? 0, 'EVENT');
                  setTimelineCreateMenu(null);
                }}
              >
                <CalendarDays size={14} />
                Добавить событие
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  const task = taskById.get(timelineCreateMenu.taskId ?? '');
                  if (!task) return;
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                  void completeTask(task);
                }}
              >
                Выполнить
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelineReschedulePicker({ taskId: timelineCreateMenu.taskId, signal: Date.now() });
                  setTimelineCreateMenu(null);
                  setTimelinePostponeSubmenuOpen(false);
                }}
              >
                <CalendarDays size={14} />
                Перенести
              </button>
              <button
                type="button"
                disabled={!timelineCreateMenu.taskId}
                className="hidden"
                onMouseEnter={() => timelineCreateMenu.taskId && setTimelinePostponeSubmenuOpen(true)}
                onClick={() => {
                  if (!timelineCreateMenu.taskId) return;
                  setTimelinePostponeSubmenuOpen((prev) => !prev);
                }}
              >
                <span>Отложить</span>
                <ChevronRight size={13} className="text-muted" />
              </button>
              {timelinePostponeSubmenuOpen && timelineCreateMenu.taskId ? (
                <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                  {[
                    { value: '15m', label: 'На 15 мин' },
                    { value: '30m', label: 'На 30 мин' },
                    { value: '1h', label: 'На час' },
                    { value: '3h', label: 'На 3 часа' },
                    { value: 'tomorrow', label: 'На завтра' },
                    { value: 'smart', label: '✦ Ближайшее окно' }
                  ].map((option) => (
                    <button key={option.value} type="button" className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110" onClick={async () => {
                      const task = taskById.get(timelineCreateMenu.taskId ?? '');
                      if (!task) return;
                      setTimelinePostponeLoadingTaskId(task.id);
                      setTimelineCreateMenu(null);
                      setTimelinePostponeSubmenuOpen(false);
                      try { await quickPostponeTask(task, option.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart'); } finally { setTimelinePostponeLoadingTaskId((prev) => (prev === task.id ? null : prev)); }
                    }}>
                      <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside
            role="dialog"
            aria-modal="true"
            aria-label="Окно ближайших подзадач"
            className="upcoming-subtasks-dialog flex h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2.3rem] border"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="upcoming-subtasks-header flex items-center justify-between gap-4 px-6 pb-4 pt-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус на сроках</p>
                <h4 className="mt-1 text-2xl font-bold tracking-tight text-primary">Ближайшие подзадачи</h4>
              </div>
              <button type="button" className="focused-task-icon-button h-9 w-9" onClick={() => setIsUpcomingSubtasksModalOpen(false)} title="Закрыть">
                <X size={14} />
              </button>
            </div>
            <div className="upcoming-subtasks-toolbar flex flex-wrap gap-2 px-6 py-3 text-xs">
              {([
                { key: 'all', label: 'все' },
                { key: 'today', label: 'на сегодня' },
                { key: 'tomorrow', label: 'на завтра' },
                { key: 'week', label: 'на неделю' },
                { key: 'no_due', label: 'без срока' }
              ] as const).map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`upcoming-subtasks-filter rounded-full border px-3 py-1.5 font-medium transition ${upcomingSubtasksFilter === filter.key ? 'upcoming-subtasks-filter-active' : ''}`}
                  onClick={() => setUpcomingSubtasksFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <ul className="upcoming-subtasks-list min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-3 py-4 text-sm sm:px-6">
              {filteredUpcomingSubtasksForModal.length === 0 ? <li className="surface-muted rounded px-3 py-2 text-subtle">Нет подзадач для выбранного фильтра</li> : null}
              {filteredUpcomingSubtasksForModal.map((subtask) => (
                <li
                  key={subtask.id}
                  className="upcoming-subtask-row flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 hover:-translate-y-[1px]"
                  onClick={() => setEditorState({ task: subtask })}
                >
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={subtask.status === 'DONE'}
                    onClick={(event) => event.stopPropagation()}
                    onChange={async () => { await toggleSubtaskDone(subtask); }}
                  />
                  <div className="upcoming-subtask-copy min-w-0 flex-1">
                    <p className="upcoming-subtask-title text-sm font-medium text-primary"><LinkifiedText text={subtask.title} stopPropagationOnLinkClick /></p>
                    <p className="upcoming-subtask-description mt-1 text-xs text-muted"><LinkifiedText text={noteHtmlToPlainText(subtask.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick /></p>
                    <p className="upcoming-subtask-deadline mt-1 text-[11px] text-subtle">
                      Дедлайн: {formatTaskDueDate(subtask.dueDate)}{subtask.dueDate ? ` · ${formatDeadlineLeft(subtask.dueDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <InlineDateTimePickerIcon
                      value={subtask.dueDate}
                      title="Изменить срок подзадачи"
                      detachedPopup
                      timelineTasks={timelinePickerTasks}
                      onChange={async (dueDate) => {
                        await api.updateTask(subtask.id, { dueDate });
                        await load();
                      }}
                      className="upcoming-subtask-date-action"
                    />
                    <button
                      type="button"
                      className="upcoming-subtask-icon-action surface-muted text-muted transition hover:brightness-110"
                      title="Удалить подзадачу"
                      onClick={async (event) => {
                        event.stopPropagation();
                        await api.deleteTask(subtask.id);
                        await load();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : null}

      {sectorEditorSphere ? (
        <SectorEditor
          sphere={sectorEditorSphere.id ? sectorEditorSphere : undefined}
          onCancel={() => setSectorEditorSphere(null)}
          onSave={async (payload) => {
            if (sectorEditorSphere.id) {
              await api.updateSphere(sectorEditorSphere.id, payload);
            } else {
              await api.createSphere(payload);
            }
            setSectorEditorSphere(null);
            await load();
          }}
        />
      ) : null}


      {timelineReschedulePicker ? (
        <DateTimePickerWithApply
          className="hidden"
          value={taskById.get(timelineReschedulePicker.taskId)?.dueDate ?? null}
          timelineTasks={timelinePickerTasks}
          openTimelinePreviewSignal={timelineReschedulePicker.signal}
          detachedPopup
          onChange={async (dueDate) => {
            const taskId = timelineReschedulePicker.taskId;
            await api.updateTask(taskId, { dueDate });
            setTimelineReschedulePicker(null);
            await load();
          }}
        />
      ) : null}
      {isTimelineOptimizeModalOpen ? (<div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"><div className="dialog-surface w-full max-w-lg rounded-2xl border p-4"><h3 className="text-lg font-semibold text-primary">Оптимизация таймлайна ИИ</h3><p className="mt-1 text-sm text-muted">Добавьте пожелания к перераспределению задач <span className="inline-flex items-center gap-1 text-rose-300">(1 <Coins size={12} />)</span>.</p><textarea className="form-field mt-3 min-h-28 w-full rounded-lg border p-2 text-sm" value={timelineOptimizeNote} onChange={(e)=>setTimelineOptimizeNote(e.target.value)} /><div className="mt-3 flex justify-end gap-2"><button className="surface-muted rounded px-3 py-2 text-sm" onClick={()=>setIsTimelineOptimizeModalOpen(false)}>Отмена</button><button className="rounded bg-rose-600 px-3 py-2 text-sm text-white" onClick={()=>void handleOptimizeTimeline()} disabled={timelineOptimizeLoading}>Оптимизировать</button></div></div></div>) : null}

      <div
        className={`ai-chat-launcher group fixed bottom-8 right-6 z-[95] lg:right-[360px] ${focusedTask ? 'ai-chat-launcher-task-open' : ''}`}
        onMouseEnter={() => { setQuickAiPreviewHovered(true); scheduleQuickAiChatScrollToBottom(); markSystemNotificationsRead(); }}
        onMouseLeave={() => setQuickAiPreviewHovered(false)}
        onFocus={scheduleQuickAiChatScrollToBottom}
      >
        <div className={`absolute bottom-14 right-0 w-80 transition duration-200 ${forceQuickAiPreviewOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'}`}>
          <div data-tour="quick-ai" className="dialog-surface rounded-3xl border p-3 shadow-2xl backdrop-blur transition duration-200 hover:shadow-violet-500/20">
            <div ref={quickAiChatDialogContainerRef} className="quick-ai-chat-messages mb-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1 text-xs" onScroll={(event) => {
                const container = event.currentTarget;
                quickAiFollowBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 110;
              }}>
              <div ref={quickAiContentRef} className="space-y-2">
              {quickAiChatTimeline.slice(-30).map((item) => item.kind === 'notification' ? (
                <div key={`notification-${item.notification.id}`} className="system-notification-message ai-system-notification-spacing mr-6 rounded-2xl border px-3 py-2 shadow-sm">
                  <b className="system-notification-label mb-0.5 block text-[10px] uppercase tracking-wide">⚙️ Системное уведомление</b>
                  <SystemNotificationContent notification={item.notification} tasks={aiTaskReferenceTasks} onOpenTask={openTaskReferenceFromAi} onOpenTaskAi={(task) => { setIsAiChatOpen(false); setFocusedTaskId(task.id); setIsAiExpanded(true); }} />
                </div>
              ) : (
                <div key={`message-${item.message.id}`} className={`ai-message-forward-group w-fit max-w-[calc(100%-2rem)] ${item.message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}><div className={`quick-ai-chat-message w-full rounded-2xl px-3 py-2 shadow-sm ${item.message.role === 'user' ? 'quick-ai-chat-message-user' : 'quick-ai-chat-message-assistant'}`}>
                  <b>{item.message.role === 'user' ? 'Вы' : 'ИИ'}:</b> {item.message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={item.message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={openTaskReferenceFromAi} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(item.message.content, item.message.attachmentPreviews, item.message.id)}</CollapsibleUserMessage>}
                  {item.message.monitoringTaskId && aiTaskReferenceTasks.some(task => task.id === item.message.monitoringTaskId) ? (
                    <button type="button" className="task-monitor-chat-link mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                      onClick={() => { setIsAiChatOpen(false); setFocusedTaskId(item.message.monitoringTaskId!); setIsAiExpanded(true); }}>
                      <ArrowUpRight size={12} /> Ответить в чате задачи
                    </button>
                  ) : null}
                  {item.message.role === 'assistant' && item.message.webSearchUsed ? <WebCitations sources={item.message.webSources} searched={item.message.webSearchUsed} /> : null}
                  {item.message.role === 'assistant' && item.message.generatedDocument ? <AiGeneratedDocumentButton document={item.message.generatedDocument} /> : null}{item.message.role === 'assistant' && item.message.taskProposal ? <AiTaskProposalCard proposal={item.message.taskProposal} onApplied={() => void load()} /> : null}{item.message.role === 'assistant' && item.message.telegramSuggestedReply ? <TelegramAiReplySuggestionCard reply={item.message.telegramSuggestedReply} /> : null}{item.message.role === 'assistant' && item.message.telegramSendDraft ? <TelegramInlineSendCard draft={item.message.telegramSendDraft} /> : null}{item.message.role === 'assistant' && item.message.telegramReadDraft ? <TelegramReadConsentCard draft={item.message.telegramReadDraft} onContinue={(approval) => continueTelegramReadAiChat(approval, aiChatProjects[0].id, QUICK_AI_CHAT_ID)} /> : null}
                </div>
                <div className="ai-message-forward-actions"><AiReplyAction message={item.message} onReply={setReplyToQuickAi} /><TelegramMessageQuickShare text={item.message.content} compact /></div>
                </div>
              ))}
              {quickAiChatMessages.length === 0 && systemNotifications.length === 0 ? <p className="text-subtle">Быстрый одноразовый вопрос. Хранится только последние 20 запросов.</p> : null}
              {quickAiChatLoading ? <AiProgress status={aiChatProgress} /> : null}
              </div>
            </div>
            {replyToQuickAi ? <AiReplyPreview target={replyToQuickAi} onDismiss={() => setReplyToQuickAi(null)} compact /> : null}
            <AiAttachmentTiles files={quickAiPendingFiles} onRemove={file => setQuickAiPendingFiles(previous => previous.filter(item => item !== file))} busy={quickAiChatLoading} uploadProgress={aiChatUploadProgress} />
            <div className="flex items-end gap-2">
              <AutoGrowingTextarea maxHeight={144} className="form-field min-h-9 min-w-0 flex-1 resize-none rounded-2xl border px-3 py-2 text-sm leading-5 transition focus:ring-2 focus:ring-violet-300" value={quickAiChatDraft} onChange={(e) => setQuickAiChatDraft(e.target.value)} onPaste={(event) => { const files = clipboardImageFiles(event.clipboardData); if (files.length) { event.preventDefault(); setQuickAiPendingFiles(previous => [...previous, ...files].slice(0, MAX_AI_ATTACHMENTS)); } }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendAiChatQuestion(true); } }} placeholder="Спросить быстро…" />
              <button className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 p-2 text-white shadow-lg transition hover:bg-violet-500 hover:shadow-violet-500/30 disabled:opacity-50" title={quickAiChatLoading ? 'Ожидание ответа ИИ' : 'Отправить'} aria-label={quickAiChatLoading ? 'Ожидание ответа ИИ' : 'Отправить'} disabled={aiChatLoading || (!quickAiChatDraft.trim() && quickAiPendingFiles.length === 0)} onClick={() => void sendAiChatQuestion(true)}>{quickAiChatLoading ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}</button>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="ai-chat-launcher-button flex h-14 w-14 touch-none select-none items-center justify-center rounded-full text-2xl text-white shadow-2xl transition duration-200 hover:scale-105 hover:shadow-violet-500/40 active:scale-95"
          title="Чат с ИИ"
          onClick={() => { setActiveAiChatProjectId(aiChatProjects[0]?.id ?? ''); setActiveAiChatId(QUICK_AI_CHAT_ID); setIsAiChatOpen(true); }}
        >
          {unreadSystemNotificationCount > 0 ? <span className="absolute -left-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-lg">{unreadSystemNotificationCount > 99 ? '99+' : unreadSystemNotificationCount}</span> : null}
          ✦
        </button>
      </div>

      {isCollaborationSettingsOpen && focusedTask?.isCollaborative ? (
        <div className="modal-backdrop fixed inset-0 z-[175] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsCollaborationSettingsOpen(false)}>
          <section className="dialog-surface w-full max-w-md rounded-[2rem] border p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Совместная задача</p><h2 className="mt-1 text-2xl font-bold text-primary">Настройки участников</h2></div><button className="focused-task-icon-button rounded-full p-2" onClick={() => setIsCollaborationSettingsOpen(false)}><X size={17} /></button></div>
            <p className="mt-5 text-sm text-muted">Выберите свой цвет. Им будут отмечены созданные вами подзадачи и сообщения в чате с ИИ.</p>
            <div className="mt-4 flex flex-wrap gap-3">{['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#22c55e', '#eab308'].map((color) => <button key={color} type="button" className={`h-10 w-10 rounded-full border-4 transition hover:scale-110 ${focusedTask.collaborationColor === color ? 'border-white ring-2 ring-amber-400' : 'border-white/70'}`} style={{ backgroundColor: color }} onClick={async () => { await api.updateTaskCollaboration(focusedTask.id, color); await load(); }} aria-label={`Выбрать цвет ${color}`} />)}</div>
            {focusedTask.collaborationOwner ? <div className="mt-6 border-t border-amber-200 pt-5"><p className="text-sm font-semibold text-primary">Участники с доступом</p><div className="mt-3 grid gap-2">{focusedTask.collaborationMembers?.map((member) => <div key={member.userId} className="flex items-center gap-3 rounded-xl border border-amber-200/70 px-3 py-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: member.color }} /><span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{member.name}{member.isOwner ? ' (создатель)' : ''}</span>{!member.isOwner ? <button type="button" className="danger-button rounded-lg px-2.5 py-1.5 text-xs font-semibold" onClick={async () => { if (!window.confirm(`Исключить участника «${member.name}» из задачи?`)) return; await api.removeTaskCollaborator(focusedTask.id, member.userId); await load(); }}>Исключить</button> : null}</div>)}</div><p className="mt-5 text-sm font-semibold text-primary">Вы создатель задачи</p><p className="mt-1 text-xs leading-relaxed text-muted">После выключения у каждого участника останется отдельная копия задачи. Дальнейшие изменения больше не будут общими.</p><button className="danger-button mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold" onClick={async () => { await api.disableTaskCollaboration(focusedTask.id); setIsCollaborationSettingsOpen(false); await load(); }}>Выключить совместный режим</button></div> : null}
          </section>
        </div>
      ) : null}

      {collaborationAction ? (
        <div className="modal-backdrop fixed inset-0 z-[176] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setCollaborationAction(null)}>
          <section className="dialog-surface w-full max-w-md rounded-[2rem] border p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">Совместная задача</p><h2 className="mt-2 text-2xl font-bold text-primary">{collaborationAction.action === 'delete' ? 'Удалить задачу?' : 'Выполнить задачу?'}</h2><p className="mt-3 text-sm leading-relaxed text-muted">Выберите, применить действие только для вашего списка или сразу для всех участников.</p>
            <div className="mt-6 grid gap-2"><button className="secondary-button rounded-xl px-4 py-3 text-sm font-semibold" onClick={async () => { const { task, action } = collaborationAction; setCollaborationAction(null); if (action === 'complete') await completeTask(task, 'me'); else { await api.deleteTask(task.id, 'me'); setFocusedTaskId(null); await load(); } }}>{collaborationAction.action === 'delete' ? 'Удалить только у меня' : 'Выполнить только у меня'}</button><button className={collaborationAction.action === 'delete' ? 'danger-button rounded-xl px-4 py-3 text-sm font-semibold' : 'success-button rounded-xl px-4 py-3 text-sm font-semibold'} onClick={async () => { const { task, action } = collaborationAction; setCollaborationAction(null); if (action === 'complete') await completeTask(task, 'all'); else { await api.deleteTask(task.id, 'all'); setFocusedTaskId(null); await load(); } }}>{collaborationAction.action === 'delete' ? 'Удалить у всех' : 'Выполнить у всех'}</button><button className="mt-1 px-4 py-2 text-sm text-muted" onClick={() => setCollaborationAction(null)}>Отмена</button></div>
          </section>
        </div>
      ) : null}

      {taskShareDialog ? (
        <div className="modal-backdrop fixed inset-0 z-[170] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setTaskShareDialog(null)}>
          <section className="dialog-surface w-full max-w-lg rounded-[2rem] border p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-500">Совместная задача</p><h2 className="mt-1 text-2xl font-bold text-primary">{taskShareDialog.mode === 'create' ? 'Пригласите участника' : 'Добавить совместную задачу?'}</h2></div>
              <button className="focused-task-icon-button rounded-full p-2" onClick={() => setTaskShareDialog(null)} aria-label="Закрыть"><X size={17} /></button>
            </div>
            {taskShareDialog.loading ? <div className="mt-6 flex items-center gap-3 text-sm text-muted"><Loader2 className="animate-spin text-violet-500" size={20} /> Загружаем…</div> : null}
            {taskShareDialog.error ? <p className="mt-5 rounded-2xl bg-rose-50 p-3 text-sm text-rose-600">{taskShareDialog.error}</p> : null}
            {taskShareDialog.mode === 'create' && taskShareDialog.url ? <>
              <p className="mt-5 text-sm leading-relaxed text-muted">Отправьте ссылку другому зарегистрированному пользователю. Вы оба сможете менять задачу, подзадачи и общаться с ИИ.</p>
              <div className="surface-input mt-4 flex items-center gap-2 rounded-2xl border p-2"><input readOnly value={taskShareDialog.url} className="min-w-0 flex-1 bg-transparent px-2 text-sm text-primary outline-none" /><button className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${shareLinkCopied ? 'bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500'}`} onClick={async () => { await navigator.clipboard.writeText(taskShareDialog.url!); setShareLinkCopied(true); window.setTimeout(() => setShareLinkCopied(false), 2000); }}>{shareLinkCopied ? <><Check size={15} />Скопировано✅</> : <><Copy size={15} />Копировать</>}</button></div>
            </> : null}
            {taskShareDialog.mode === 'accept' && taskShareDialog.preview ? <>
              <div className="mt-5 rounded-3xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-5"><p className="text-xs font-semibold text-violet-500">Автор: {taskShareDialog.preview.ownerName}</p><h3 className="mt-2 text-xl font-bold text-primary">{taskShareDialog.preview.title}</h3><p className="mt-2 line-clamp-3 text-sm text-muted">{taskShareDialog.preview.description || 'Без описания'}</p><span className="mt-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-violet-600">Подзадач: {taskShareDialog.preview.subtaskCount}</span></div>
              <label className="mt-5 block text-sm font-semibold text-primary">В какой сектор добавить?</label>
              <select className="form-field mt-2 w-full rounded-2xl border px-3 py-3 text-sm" value={taskShareDialog.sphereId ?? ''} onChange={(event) => setTaskShareDialog((state) => state?.mode === 'accept' ? { ...state, sphereId: event.target.value || null } : state)}><option value="">Без сектора</option>{spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}</select>
              <div className="mt-6 flex justify-end gap-2"><button className="secondary-button rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => { history.replaceState({}, '', window.location.pathname); setTaskShareDialog(null); }}>Нет</button><button className="primary-button rounded-xl px-5 py-2 text-sm font-semibold" onClick={async () => { const state = taskShareDialog; if (state.mode !== 'accept') return; setTaskShareDialog({ ...state, loading: true }); try { const result = await api.acceptTaskShare(state.token, state.sphereId); history.replaceState({}, '', window.location.pathname); await load(); setFocusedTaskId(result.taskId); setTaskShareDialog(null); } catch (error) { setTaskShareDialog({ ...state, error: error instanceof Error ? error.message : 'Не удалось добавить задачу' }); } }}>Да, добавить</button></div>
            </> : null}
          </section>
        </div>
      ) : null}

      {currentUser && currentUser.browserNotificationsEnabled !== false && browserPermission === 'default'
        && !browserPermissionNudgeDismissed && initialWorkspaceReady ? createPortal((
        <div className="surface-popover fixed bottom-24 right-6 z-[2147483646] w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-[color:var(--panel-border)] p-4 text-sm shadow-2xl" role="status">
          <div className="flex items-start gap-2.5">
            <BellRing size={19} className="mt-0.5 shrink-0 text-violet-500" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-primary">Уведомления браузера</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Разрешите уведомления, чтобы видеть сообщения Планировыча при переключении на другую вкладку.</p>
            </div>
            <button type="button" className="rounded-lg p-1 text-muted hover:brightness-125" aria-label="Закрыть предложение включить уведомления" onClick={() => {
              setBrowserPermissionNudgeDismissed(true);
              sessionStorage.setItem('btm:browser-permission-nudge:' + currentUser.id, 'dismissed');
            }}><X size={16} /></button>
          </div>
          <button type="button" className="primary-button mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold" onClick={() => { void requestBrowserNotifications(); }}>
            Разрешить уведомления
          </button>
        </div>
      ), document.body) : null}

      {systemNotificationToast ? createPortal((
        <button key={systemNotificationToast.id} type="button" className="system-notification-toast fixed bottom-8 left-6 z-[2147483647] w-[min(22rem,calc(100vw-3rem))] rounded-2xl border px-4 py-3 text-left text-sm shadow-2xl backdrop-blur" onClick={() => { setSystemNotificationToast(null); openSystemNotification(systemNotificationToast); }}>
          {systemNotificationToast.eventKey?.startsWith('monitoring:') ? (
            <>
              <span className="block font-semibold leading-snug">{systemNotificationToast.content.split(/\r?\n/)[0]?.trim()}</span>
              <span className="mt-1 block text-xs leading-snug text-muted">{systemNotificationToast.content.split(/\r?\n/)[1]?.trim()}</span>
            </>
          ) : (
            <>
              <span className="system-notification-label mb-1 block text-[10px] font-bold uppercase tracking-[0.16em]">⚙️ Системное уведомление</span>
              <span className="leading-snug">{systemNotificationToast.content}</span>
            </>
          )}
        </button>
      ), document.body) : null}

      {isAiChatProjectDialogOpen ? (
        <div className="modal-backdrop fixed inset-0 z-[145] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAiChatProjectDialogOpen(false)}>
          <div className="dialog-surface w-full max-w-md rounded-3xl border p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">{aiChatProjectDraft.mode === 'edit' ? 'Настройка проекта' : 'Новый проект'}</p><h3 className="mt-1 text-xl font-bold text-primary">Настройте проект чата</h3></div><button className="rounded-full p-2 text-muted transition hover:bg-[color:var(--muted-bg)]" onClick={() => setIsAiChatProjectDialogOpen(false)}><X size={16} /></button></div>
            <label className="mt-4 block text-xs font-semibold text-muted">Название</label>
            <input className="form-field mt-1 w-full rounded-2xl border px-3 py-2 text-sm" value={aiChatProjectDraft.title} onChange={(e) => setAiChatProjectDraft((prev) => ({ ...prev, title: e.target.value }))} />
            <label className="mt-4 block text-xs font-semibold text-muted">Цвет</label>
            <div className="mt-2 flex flex-wrap gap-2">{HARMONIOUS_COLORS.slice(0, 10).map((color) => <button key={color} type="button" className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${aiChatProjectDraft.color === color ? 'border-white ring-2 ring-violet-400' : 'border-white/70'}`} style={{ backgroundColor: color }} onClick={() => setAiChatProjectDraft((prev) => ({ ...prev, color }))} />)}</div>
            <label className="mt-4 block text-xs font-semibold text-muted">Иконка</label>
            <div className="mt-2 grid grid-cols-6 gap-2">{['✨','🤖','🧠','🚀','📌','🗂️','💬','⚡','🌙','🎯','🧩','🪄'].map((icon) => <button key={icon} type="button" className={`ai-chat-project-icon-option rounded-2xl border px-2 py-2 text-xl transition hover:-translate-y-0.5 ${aiChatProjectDraft.icon === icon ? 'ai-chat-project-icon-option-active' : ''}`} onClick={() => setAiChatProjectDraft((prev) => ({ ...prev, icon }))}>{icon}</button>)}</div>
            <div className="mt-5 flex justify-end gap-2"><button className="surface-muted rounded-xl px-4 py-2 text-sm" onClick={() => setIsAiChatProjectDialogOpen(false)}>Отмена</button><button className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-violet-500" onClick={saveAiChatProject}>{aiChatProjectDraft.mode === 'edit' ? 'Сохранить' : 'Создать'}</button></div>
          </div>
        </div>
      ) : null}

      {isAiChatOpen ? (
        <ExpandedAiChat
          projects={aiChatProjects}
          activeProject={activeAiChatProject}
          activeChat={activeAiChat}
          quickChatId={QUICK_AI_CHAT_ID}
          model={activeAiChat?.id === QUICK_AI_CHAT_ID ? quickAiChatModel : activeProjectChatModel}
          modelOptions={AI_CHAT_MODEL_SELECT_OPTIONS}
          pendingFiles={aiChatPendingFiles}
          loading={aiChatLoading}
          imageGenerating={aiChatLoading && (aiChatProgress === 'generating_image' || aiChatProgress === 'editing_image')}
          uploadProgress={aiChatUploadProgress}
          messageCount={activeAiChat?.messages.length ?? 0}
          onClose={() => setIsAiChatOpen(false)}
          onCreateProject={openAiChatProjectDialog}
          onCreateChat={createAiChatThread}
          onSelectProject={(project) => { setActiveAiChatProjectId(project.id); setActiveAiChatId(project.chats[0]?.id ?? ''); }}
          onSelectChat={setActiveAiChatId}
          onDeleteProject={deleteAiChatProject}
          onDeleteChat={deleteAiChatThread}
          onContextMenu={openAiChatItemContextMenu}
          onModelChange={activeAiChat?.id === QUICK_AI_CHAT_ID ? setQuickAiChatModel : changeProjectChatModel}
          onAddFiles={addAiChatFiles}
          onRemoveFile={(file) => setAiChatPendingFiles((files) => files.filter((item) => item.name !== file.name || item.size !== file.size))}
          replyTo={activeAiChat?.id === QUICK_AI_CHAT_ID ? replyToQuickAi : replyToAiChat}
          onClearReply={() => activeAiChat?.id === QUICK_AI_CHAT_ID ? setReplyToQuickAi(null) : setReplyToAiChat(null)}
          onSend={(draft) => void sendAiChatQuestion(false, draft)}
          messages={(activeAiChat?.id === QUICK_AI_CHAT_ID ? quickAiChatTimeline : (activeAiChat?.messages ?? []).map((message, index) => ({ kind: 'message' as const, timestamp: index, message }))).map((item) => item.kind === 'notification' ? <div key={`notification-${item.notification.id}`} className="ai-system-notification-spacing flex justify-start"><div className="system-notification-message max-w-[86%] rounded-3xl rounded-bl-lg border px-4 py-3"><p className="system-notification-label mb-1 text-[11px] font-semibold uppercase tracking-wide">⚙️ Системное уведомление</p><div className="text-sm leading-relaxed"><SystemNotificationContent notification={item.notification} tasks={aiTaskReferenceTasks} onOpenTask={openTaskReferenceFromAi} onOpenTaskAi={(task) => { setFocusedTaskId(task.id); setIsAiExpanded(true); }} /></div></div></div> : <div key={`message-${item.message.id}`} className={`flex ${item.message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className="ai-message-forward-group w-fit max-w-[86%]"><div className={`ai-chat-message-bubble w-full rounded-3xl px-4 py-3 ${item.message.role === 'user' ? 'ai-chat-message-user rounded-br-lg' : 'ai-chat-message-assistant rounded-bl-lg'}`}><div className="mb-1 flex items-center justify-between gap-3"><p className={`text-[11px] font-semibold uppercase tracking-wide ${item.message.role === 'user' ? 'ai-chat-message-label-user' : 'ai-chat-message-label-assistant'}`}>{item.message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{item.message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`ai-chat-${item.message.id}`, item.message.content)} className="chat-message-copy rounded-full p-1 hover:bg-violet-100" title="Копировать ответ">{copiedAiMessageKey === `ai-chat-${item.message.id}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}</button> : null}</div><div className="text-sm leading-relaxed">{item.message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={item.message.content} tasks={aiTaskReferenceTasks} onOpenTaskReference={openTaskReferenceFromAi} showTaskReferenceButtons /> : <CollapsibleUserMessage>{renderAiMessageContent(item.message.content, item.message.attachmentPreviews, item.message.id)}</CollapsibleUserMessage>}</div>{activeAiChat?.id === QUICK_AI_CHAT_ID && item.message.monitoringTaskId && aiTaskReferenceTasks.some(task => task.id === item.message.monitoringTaskId) ? (
            <button type="button" className="task-monitor-chat-link mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
              onClick={() => { setIsAiChatOpen(false); setFocusedTaskId(item.message.monitoringTaskId!); setIsAiExpanded(true); }}>
              <ArrowUpRight size={12} /> Ответить в чате задачи
            </button>
          ) : null}{item.message.role === 'assistant' && !item.message.taskProposal && item.message.taskSuggestions?.length && activeAiChat?.id.startsWith(TELEGRAM_AI_MANAGED_CHAT_PREFIX) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.message.taskSuggestions.map((suggestion, index) => (
                <button key={index} type="button" title={suggestion}
                  disabled={item.message.approvedSuggestionIndices?.includes(index)}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-500 disabled:opacity-50"
                  onClick={() => void approveTelegramTask(item.message.id, index)}>
                  {item.message.approvedSuggestionIndices?.includes(index) ? '✓ Задача создана' : '＋ Создать задачу ' + (index + 1)}
                </button>
              ))}
            </div>
          ) : null}{item.message.role === 'assistant' && item.message.webSearchUsed ? <WebCitations sources={item.message.webSources} searched={item.message.webSearchUsed} /> : null}{item.message.role === 'assistant' && item.message.generatedDocument ? <AiGeneratedDocumentButton document={item.message.generatedDocument} /> : null}{item.message.role === 'assistant' && item.message.taskProposal ? <AiTaskProposalCard proposal={item.message.taskProposal} onApplied={() => void load()} /> : null}{item.message.role === 'assistant' && item.message.telegramSendDraft ? <TelegramInlineSendCard draft={item.message.telegramSendDraft} /> : null}{item.message.role === 'assistant' && item.message.telegramReadDraft ? <TelegramReadConsentCard draft={item.message.telegramReadDraft} onContinue={(approval) => continueTelegramReadAiChat(approval, activeAiChatProject!.id, activeAiChat!.id)} /> : null}{item.message.role === 'assistant' && item.message.creditsSpentMilli != null && item.message.creditsSpentMilli > 0 ? <div className="mt-2 text-[11px] text-muted opacity-75">{formatCreditsSpent(item.message.creditsSpentMilli)}</div> : null}</div><div className="ai-message-forward-actions"><AiReplyAction message={item.message} onReply={(target) => (activeAiChat?.id === QUICK_AI_CHAT_ID ? setReplyToQuickAi(target) : setReplyToAiChat(target))} /><TelegramMessageQuickShare text={item.message.content} compact /></div></div></div>)}
          status={<>{aiChatLoading ? <AiProgress status={aiChatProgress} /> : null}{aiChatError ? <p className="text-sm text-rose-400">{aiChatError}</p> : null}</>}
        />
      ) : null}

      {aiChatContextMenu ? (
        <div className="fixed inset-0 z-[155]" onClick={() => setAiChatContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setAiChatContextMenu(null); }}>
          <div className="dialog-surface absolute w-44 rounded-2xl border p-1.5 shadow-2xl" style={{ left: aiChatContextMenu.x, top: aiChatContextMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-violet-500/10"
              onClick={() => aiChatContextMenu.type === 'project' ? openAiChatProjectSettings(aiChatContextMenu.id) : openAiChatRenameDialog(aiChatContextMenu.id)}
            >
              <Settings size={14} />
              {aiChatContextMenu.type === 'project' ? 'Настроить' : 'Переименовать'}
            </button>
          </div>
        </div>
      ) : null}

      {renamingAiChatId ? (
        <div className="modal-backdrop fixed inset-0 z-[160] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setRenamingAiChatId(null)}>
          <div className="dialog-surface w-full max-w-sm rounded-3xl border p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-500">Настройка чата</p>
                <h3 className="mt-1 text-xl font-bold text-primary">Переименуйте чат</h3>
              </div>
              <button className="rounded-full p-2 text-muted transition hover:bg-slate-100" onClick={() => setRenamingAiChatId(null)}><X size={16} /></button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-muted">Название</label>
            <input
              className="form-field mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
              value={aiChatRenameDraft}
              onChange={(event) => setAiChatRenameDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') saveAiChatRename(); }}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <button className="surface-muted rounded-xl px-4 py-2 text-sm" onClick={() => setRenamingAiChatId(null)}>Отмена</button>
              <button className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500" onClick={saveAiChatRename}>Сохранить</button>
            </div>
          </div>
        </div>
      ) : null}
</main>
  );
}
