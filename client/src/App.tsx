import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Bot, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, Circle as CircleIcon, Coins, Copy, Eye, EyeOff, FileText, LayoutGrid, List, Edit3, Maximize2, Minimize2, Gauge, Loader2, Pause, Paperclip, PieChart, Play, Smartphone, Plus, Repeat, RotateCcw, Search, SendHorizontal, Settings, Sparkles, Square, Ticket, Trash2, X } from 'lucide-react';
import { motion, Reorder } from 'framer-motion';
import { BubbleField } from './components/BubbleField';
import { InlineDateTimePickerIcon } from './components/InlineDateTimePickerIcon';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { CustomSelect } from './components/CustomSelect';
import { INSUFFICIENT_AI_CREDITS_MESSAGE, api, setUnauthorizedHandler, type CurrentUser, type SubscriptionLinks } from './lib/api';
import { calcScore, getTaskCoefficient, type BubbleRankingMode } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { AiChatModel, ChatAttachmentPayload, ChatMessage, ChatMode, Habit, Sphere, Task, TaskAttachment } from './lib/types';
import { LinkifiedText } from './components/LinkifiedText';
import { NotesEditor } from './components/NotesEditor';
import { noteHtmlToPlainText } from './lib/notes';

const MAX_SPHERES = 8;

const AI_CHAT_MODEL_CREDITS: Record<AiChatModel, number> = {
  'gpt-5.4-nano': 2,
  'gpt-5.4-mini': 5,
  'gpt-5.4': 8
};

const AI_CHAT_MODEL_OPTIONS: Array<{ value: AiChatModel; label: string; creditsCost: number }> = [
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', creditsCost: AI_CHAT_MODEL_CREDITS['gpt-5.4-nano'] },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', creditsCost: AI_CHAT_MODEL_CREDITS['gpt-5.4-mini'] },
  { value: 'gpt-5.4', label: 'GPT-5.4', creditsCost: AI_CHAT_MODEL_CREDITS['gpt-5.4'] }
];

const SUBSCRIPTION_PLANS: Array<{ key: keyof SubscriptionLinks; name: string; price: string; badge: string; features: string[] }> = [
  { key: 'start', name: 'Старт', price: '299 ₽/мес', badge: 'Для регулярного старта', features: ['2000 ИИ-кредитов в месяц', 'Память диалогов: до 100 сообщений', 'Стоимость: 399 рублей.'] },
  { key: 'pro', name: 'Про', price: '599 ₽/мес', badge: 'Оптимальный выбор', features: ['5000 ИИ-кредитов в месяц', 'Безлимитная память диалогов', 'ИИ-чекап', 'Оптимизация расписания'] },
  { key: 'max', name: 'Максимум', price: '1290 ₽/мес', badge: 'Все возможности', features: ['12000 ИИ-кредитов в месяц', 'Безлимитная память диалогов', 'Доступ ко всем ИИ-функциям', 'Доступ к самым продвинутым моделям'] }
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
  'image/gif'
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
const getBackgroundStorageKey = (userId: string) => `btm:${userId}:background-image`;
const getBackgroundOverlayStorageKey = (userId: string) => `btm:${userId}:background-overlay-opacity`;
const getThemeStorageKey = (userId: string) => `btm:${userId}:theme-mode`;
const getRankingModeStorageKey = (userId: string) => `btm:${userId}:ranking-mode`;
const DEFAULT_BACKGROUND_OVERLAY_OPACITY = 0.65;
const USER_TIMEZONE_STORAGE_KEY = 'btm:user-timezone';
const AI_NOTIFICATIONS_DEFAULT_STORAGE_KEY = 'btm:ai-notifications-default-enabled';
const DEFAULT_MORNING_AI_CHECKUP_TIME = '10:00';
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
const MIN_BACKGROUND_OVERLAY_OPACITY = 0.2;
const MAX_BACKGROUND_OVERLAY_OPACITY = 0.9;
const HELP_WITH_TASK_PROMPT = [
  'Помоги мне выполнить эту задачу, используя весь контекст задачи и подзадач.',
  'Если информации уже достаточно — сразу дай конкретный план действий, приоритеты и ближайшие шаги.',
  'Если данных недостаточно — сначала задай наводящие вопросы, чтобы уточнить контекст, а потом предложи конкретную помощь.'
].join(' ');
const BOLD_MARKUP_PATTERN = /(\*\*[\s\S]+?\*\*)/g;
const CODE_BLOCK_PATTERN = /```([\w+-]+)?\n?([\s\S]*?)```/g;
const OVERDUE_CHECK_INTERVAL_MS = 30_000;
const OVERDUE_NUDGE_RETRY_INTERVAL_MS = 60_000;
const MAX_SHINE_WINDOW_MINUTES = 180;
const SMART_POSTPONE_CREDITS_COST = 1;
const QUICK_POSTPONE_OPTIONS = [
  { value: '15m', label: 'На 15 мин' },
  { value: '30m', label: 'На 30 мин' },
  { value: '1h', label: 'На час' },
  { value: '3h', label: 'На 3 часа' },
  { value: 'tomorrow', label: 'На завтра' },
  { value: 'smart', label: '✦ Ближайшее окно' }
] as const;
type QuickPostponeOption = (typeof QUICK_POSTPONE_OPTIONS)[number]['value'];
const OVERDUE_AI_POSTPONE_CREDITS_COST = 2;
const FOCUS_TIMER_OPTIONS = [5, 7, 10, 15, 20, 25, 30, 35, 40] as const;
const FOCUS_RECOMMENDED_MINUTES = new Set<number>([20, 25, 30]);
const FOCUS_MIN_TASKS = 1;
const FOCUS_MAX_TASKS = 5;
type FocusBonusType = 'ai' | 'subtask' | 'task' | 'time';
type FocusBonusEvent = { id: string; type: FocusBonusType; delta: number; totalDelta: number; message: string; atMs: number };
const FOCUS_BONUS_MULTIPLIERS = { task: 2, subtask: 2, ai: 1.5 } as const;
const FOCUS_TIME_BONUS_INTERVAL_SECONDS = 5 * 60;
const FOCUS_TASK_SWITCH_AI_DELAY_MS = 4_000;
const EFFICIENCY_BONUSES = {
  doneTask: 5,
  doneSubtask: 2,
  doneHabit: 3,
  createdHabit: 3.35,
  completedHabit: 20.1,
  createdTask: 1,
  aiCreditSpent: 0.1
} as const;
const FOCUS_TIME_BONUS_DELTA = EFFICIENCY_BONUSES.doneSubtask / 2;

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
  { value: 'bubbles', label: 'Баблы', icon: LayoutGrid, iconClassName: 'text-cyan-300' },
  { value: 'list', label: 'Список', icon: List, iconClassName: 'text-violet-300' },
  { value: 'timeline', label: 'Таймлайн', icon: CalendarDays, iconClassName: 'text-amber-300' }
] as const;
type DisplayMode = (typeof DISPLAY_MODE_OPTIONS)[number]['value'];
type ThemeMode = 'dark' | 'light';
type GeneralAiUndoOperation = {
  taskId: string;
  previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
};
type GeneralAiMessage = ChatMessage & { id: string };
type AiChatMessage = ChatMessage & { id: string };
type AiChatThread = { id: string; title: string; messages: AiChatMessage[] };
type AiChatProject = { id: string; title: string; color: string; icon: string; chats: AiChatThread[] };
type AiChatProjectDraft = { mode: 'create' | 'edit'; projectId?: string; title: string; color: string; icon: string };
type AiChatContextMenu = { type: 'project' | 'chat'; id: string; x: number; y: number };
type TaskAiMessage = ChatMessage & { id: string };

const QUICK_AI_CHAT_TITLE = 'Быстрые запросы';
const QUICK_AI_CHAT_PROJECT_TITLE = 'Личный проект';
const QUICK_AI_CHAT_STORAGE_KEY = 'btm:quick-ai-chat';
const QUICK_AI_CHAT_ID = 'quick-ai-requests';

function normalizeAiChatProjects(rawProjects: Array<Partial<AiChatProject>> | null | undefined, quickMessages: AiChatMessage[] = []): AiChatProject[] {
  const quickChat: AiChatThread = { id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, messages: quickMessages.slice(-20) };
  const fallback: AiChatProject[] = [{ id: crypto.randomUUID(), title: QUICK_AI_CHAT_PROJECT_TITLE, color: '#8b5cf6', icon: '✨', chats: [quickChat] }];
  const source = rawProjects?.length ? rawProjects : fallback;
  const normalized = source.map((project, index) => ({
    id: project.id ?? crypto.randomUUID(),
    title: project.title ?? `Проект ${index + 1}`,
    color: project.color ?? '#8b5cf6',
    icon: project.icon ?? '✨',
    chats: (project.chats?.length ? project.chats : [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }]).map((chat) => ({
      id: chat.id ?? crypto.randomUUID(),
      title: chat.title ?? 'Новый чат',
      messages: chat.messages ?? []
    }))
  }));
  const defaultProject = normalized[0] ?? fallback[0];
  const existingQuickChatIndex = defaultProject.chats.findIndex((chat) => chat.id === QUICK_AI_CHAT_ID || chat.title === QUICK_AI_CHAT_TITLE);
  const existingQuickChat = existingQuickChatIndex >= 0 ? defaultProject.chats[existingQuickChatIndex] : undefined;
  const mergedQuickChat: AiChatThread = { ...quickChat, ...existingQuickChat, id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, messages: existingQuickChat?.messages?.length ? existingQuickChat.messages : quickChat.messages };
  normalized[0] = { ...defaultProject, chats: [mergedQuickChat, ...defaultProject.chats.filter((_, index) => index !== existingQuickChatIndex)] };
  return normalized;
}


function areTaskAiMessagesEqual(a: TaskAiMessage[], b: TaskAiMessage[]) {
  if (a.length !== b.length) return false;
  return a.every((message, index) => message.role === b[index]?.role && message.content === b[index]?.content);
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
  return content.split(BOLD_MARKUP_PATTERN).map((part, index) => {
    if (!part) return null;
    const isBoldMarkup = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    if (!isBoldMarkup) return <span key={`plain-${index}`}>{part}</span>;
    const boldText = part.slice(2, -2);
    return <strong key={`bold-${index}`} className="ai-inline-strong">{boldText}</strong>;
  });
}

const AiMessageContentWithTaskRefs = memo(function AiMessageContentWithTaskRefs({
  content,
  tasks,
  onOpenTask,
  showTaskReferenceButtons = false,
  closeGeneralAiFullscreenOnOpen,
  setGeneralAiFullscreen
}: {
  content: string;
  tasks: Task[];
  onOpenTask?: (taskId: string) => void;
  showTaskReferenceButtons?: boolean;
  closeGeneralAiFullscreenOnOpen?: boolean;
  setGeneralAiFullscreen?: (value: boolean) => void;
}) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const normalizedContent = useMemo(() => normalizeAiMessageContent(content), [content]);
  const lines = useMemo(() => normalizedContent.split(/\r?\n/), [normalizedContent]);

  const openTask = (taskId: string, matchedTask?: Task | null) => {
    onOpenTask?.(showTaskReferenceButtons ? (matchedTask?.id ?? taskId) : (matchedTask?.parentTaskId ?? matchedTask?.id ?? taskId));
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
        className="inline-flex items-center gap-1 rounded-full bg-cyan-600/90 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-cyan-500"
        onClick={() => openTask(reference.taskId, matchedTask)}
        title={`Открыть задачу: ${buttonLabel}`}
      >
        <ArrowUpRight size={12} />
        <span className="max-w-40 truncate">{buttonLabel}</span>
      </button>
    );
  };

  return (
    <>
      {lines.map((line, lineIndex) => {
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
    </>
  );
});

function renderAiMessageContent(content: string): ReactNode {
  const normalizedContent = normalizeAiMessageContent(content);
  const blocks: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CODE_BLOCK_PATTERN.lastIndex = 0;
  while ((match = CODE_BLOCK_PATTERN.exec(normalizedContent)) !== null) {
    const [full, language, code] = match;
    const before = normalizedContent.slice(lastIndex, match.index);
    if (before) {
      blocks.push(<div key={`text-${lastIndex}`} className="whitespace-pre-wrap">{renderInlineAiMarkup(before)}</div>);
    }
    const normalizedCode = code.replace(/\n$/, '');
    blocks.push(
      <div key={`code-${match.index}`} className="my-2 overflow-hidden rounded-lg border border-slate-600/70 bg-slate-950/95">
        <div className="flex items-center justify-between border-b border-slate-700/70 px-2 py-1 text-[10px] text-slate-300">
          <span>{language || 'code'}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-slate-700/80 px-2 py-1 text-[10px] text-slate-100 hover:bg-slate-600"
            onClick={() => { void navigator.clipboard?.writeText(normalizedCode); }}
            title="Скопировать код"
          >
            <Copy size={11} /> Копировать
          </button>
        </div>
        <pre className="m-0 overflow-x-auto p-2 text-[12px] leading-5 text-cyan-100"><code>{normalizedCode}</code></pre>
      </div>
    );
    lastIndex = match.index + full.length;
  }
  const tail = normalizedContent.slice(lastIndex);
  if (tail) blocks.push(<div key="text-tail" className="whitespace-pre-wrap">{renderInlineAiMarkup(tail)}</div>);
  CODE_BLOCK_PATTERN.lastIndex = 0;
  return blocks.length > 0 ? blocks : <span>{renderInlineAiMarkup(normalizedContent)}</span>;
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
  const dayStart = startOfDay(timelineAnchorDate);
  const dayEnd = addDays(dayStart, 1);
  const weekStart = normalizeToMonday(timelineAnchorDate);
  const weekEnd = addDays(weekStart, 7);
  const rangeStart = timelineViewMode === 'day' ? dayStart : timelineViewMode === 'week' ? weekStart : monthStart;
  const rangeEnd = timelineViewMode === 'day' ? dayEnd : timelineViewMode === 'week' ? weekEnd : monthEnd;

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

  const firstDayWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthCells: TimelineViewData['monthCells'] = Array.from({ length: firstDayWeekday }, (_, index) => ({
    key: `empty-${index}`,
    date: null,
    tasks: []
  }));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const start = startOfDay(date);
    const end = addDays(start, 1);
    monthCells.push({
      key: date.toISOString(),
      date,
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
  const [authLoading, setAuthLoading] = useState(true);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<'global' | 'sectors'>('sectors');
  const [search, setSearch] = useState('');
  const [selectedSphereIds, setSelectedSphereIds] = useState<string[]>([]);
  const [isSphereFilterOpen, setIsSphereFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus'>('all');
  const [rankingMode, setRankingMode] = useState<BubbleRankingMode>('urgency');
  const [isEfficiencyDetailsOpen, setIsEfficiencyDetailsOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bubbles');

  const [copiedAiMessageKey, setCopiedAiMessageKey] = useState<string | null>(null);
  const copiedAiMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAiMessage = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    if (copiedAiMessageTimerRef.current) clearTimeout(copiedAiMessageTimerRef.current);
    setCopiedAiMessageKey(key);
    copiedAiMessageTimerRef.current = setTimeout(() => setCopiedAiMessageKey((prev) => (prev === key ? null : prev)), 1300);
  };

  const [isDisplayModeMenuOpen, setIsDisplayModeMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isFocusSetupOpen, setIsFocusSetupOpen] = useState(false);
  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false);
  const [focusSelectedTaskIds, setFocusSelectedTaskIds] = useState<string[]>([]);
  const [focusActiveIndex, setFocusActiveIndex] = useState(0);
  const [focusTimerMinutes, setFocusTimerMinutes] = useState(25);
  const [focusRemainingSeconds, setFocusRemainingSeconds] = useState(25 * 60);
  const [isFocusTimerRunning, setIsFocusTimerRunning] = useState(false);
  const [focusAiDraft, setFocusAiDraft] = useState('');
  const [focusAiMessages, setFocusAiMessages] = useState<TaskAiMessage[]>([]);
  const [focusAiLoading, setFocusAiLoading] = useState(false);
  const [focusAiError, setFocusAiError] = useState<string | null>(null);
  const [focusAiMode, setFocusAiMode] = useState<ChatMode>('fast');
  const [focusAiPendingFiles, setFocusAiPendingFiles] = useState<File[]>([]);
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
  const [isMorningAiCheckupEnabled, setIsMorningAiCheckupEnabled] = useState(false);
  const [morningAiCheckupTime, setMorningAiCheckupTime] = useState(DEFAULT_MORNING_AI_CHECKUP_TIME);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavingKey, setSettingsSavingKey] = useState<'timeZone' | 'checkupEnabled' | 'checkupTime' | null>(null);
  const [timelineViewMode, setTimelineViewMode] = useState<'day' | 'week' | 'month'>('month');
  const [isAiNotificationsDefaultEnabled, setIsAiNotificationsDefaultEnabled] = useState<boolean>(() => localStorage.getItem(AI_NOTIFICATIONS_DEFAULT_STORAGE_KEY) !== '0');
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(() => new Date());
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
  const [isFocusedNotesEditorOpen, setIsFocusedNotesEditorOpen] = useState(false);
  const [isFocusedSettingsOpen, setIsFocusedSettingsOpen] = useState(false);
  const [isEditingFocusedTitle, setIsEditingFocusedTitle] = useState(false);
  const [focusedTitleDraft, setFocusedTitleDraft] = useState('');
  const [isFocusedTitleSingleLine, setIsFocusedTitleSingleLine] = useState(true);
  const [isFocusedSphereDropdownOpen, setIsFocusedSphereDropdownOpen] = useState(false);
  const [focusedNotifyPreset, setFocusedNotifyPreset] = useState('30');
  const [focusedRecurrenceLoading, setFocusedRecurrenceLoading] = useState(false);
  const [focusedRecurrenceSummary, setFocusedRecurrenceSummary] = useState<string | null>(null);
  const [hideClosedFocusedSubtasks, setHideClosedFocusedSubtasks] = useState(true);
  const [isAddingFocusedSubtask, setIsAddingFocusedSubtask] = useState(false);
  const [focusedSubtaskTitle, setFocusedSubtaskTitle] = useState('');
  const [focusedSubtaskDueDate, setFocusedSubtaskDueDate] = useState<string | null>(null);
  const [focusedAiSearchQuery, setFocusedAiSearchQuery] = useState('');
  const [isFocusedAiSearchOpen, setIsFocusedAiSearchOpen] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [aiSubtasksLoadingTaskId, setAiSubtasksLoadingTaskId] = useState<string | null>(null);
  const [isAiSubtasksPromptOpen, setIsAiSubtasksPromptOpen] = useState(false);
  const [aiSubtasksPrompt, setAiSubtasksPrompt] = useState('');
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [focusedTaskAttachments, setFocusedTaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);
  const [isTaskAttachmentDragActive, setIsTaskAttachmentDragActive] = useState(false);
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [aiModeByTask, setAiModeByTask] = useState<Record<string, ChatMode>>({});
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, TaskAiMessage[]>>({});
  const [aiReadCursorByTask, setAiReadCursorByTask] = useState<Record<string, number>>({});
  const [generalAiMessages, setGeneralAiMessages] = useState<GeneralAiMessage[]>([]);
  const [generalAiSearchQuery, setGeneralAiSearchQuery] = useState('');
  const [isGeneralAiSearchOpen, setIsGeneralAiSearchOpen] = useState(false);
  const [isUpcomingSubtasksModalOpen, setIsUpcomingSubtasksModalOpen] = useState(false);
  const [upcomingSubtasksFilter, setUpcomingSubtasksFilter] = useState<'today' | 'tomorrow' | 'week' | 'no_due'>('today');
  const [generalAiDraft, setGeneralAiDraft] = useState('');
  const [isGeneralAiFullscreen, setIsGeneralAiFullscreen] = useState(false);
  const [generalAiLoading, setGeneralAiLoading] = useState(false);
  const [generalAiError, setGeneralAiError] = useState<string | null>(null);
  const [lastGeneralAiUndoOperations, setLastGeneralAiUndoOperations] = useState<GeneralAiUndoOperation[]>([]);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatDraft, setAiChatDraft] = useState('');
  const [quickAiChatDraft, setQuickAiChatDraft] = useState('');
  const [selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-5.4-mini');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatError, setAiChatError] = useState<string | null>(null);
  const [aiChatProjects, setAiChatProjects] = useState<AiChatProject[]>(() => {
    try {
      const parsedProjects = JSON.parse(localStorage.getItem('btm:ai-chat-projects') || '[]') as Array<Partial<AiChatProject>>;
      const quickMessages = JSON.parse(localStorage.getItem(QUICK_AI_CHAT_STORAGE_KEY) || '[]') as AiChatMessage[];
      return normalizeAiChatProjects(parsedProjects, quickMessages);
    } catch { return normalizeAiChatProjects(null); }
  });
  const [activeAiChatProjectId, setActiveAiChatProjectId] = useState(() => aiChatProjects[0]?.id ?? '');
  const [activeAiChatId, setActiveAiChatId] = useState(() => aiChatProjects[0]?.chats[0]?.id ?? QUICK_AI_CHAT_ID);
  const [isAiChatProjectDialogOpen, setIsAiChatProjectDialogOpen] = useState(false);
  const [aiChatProjectDraft, setAiChatProjectDraft] = useState<AiChatProjectDraft>({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
  const [aiChatContextMenu, setAiChatContextMenu] = useState<AiChatContextMenu | null>(null);
  const [renamingAiChatId, setRenamingAiChatId] = useState<string | null>(null);
  const [aiChatRenameDraft, setAiChatRenameDraft] = useState('');
  const [subtaskOrderMap, setSubtaskOrderMap] = useState<Record<string, string[]>>({});
  const [habits, setHabits] = useState<Habit[]>([]);
  const [subtaskFilterMode, setSubtaskFilterMode] = useState<SubtaskFilterMode>('urgency');
  const [isSubtaskFilterOpen, setIsSubtaskFilterOpen] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [completedVisibleCount, setCompletedVisibleCount] = useState(40);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundOverlayOpacity, setBackgroundOverlayOpacity] = useState(DEFAULT_BACKGROUND_OVERLAY_OPACITY);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const focusedTaskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedSubtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const focusedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiExpandedDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusAiExpandedFileInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusActiveTaskIdRef = useRef<string | null>(null);
  const focusTaskSwitchAiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAiLoadingRef = useRef(false);
  const awardedFocusTimeIntervalsRef = useRef(0);
  const expandedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiFullscreenDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const aiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const quickAiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const focusedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const expandedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusedTaskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const focusedTaskDescriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedDueDateInputRef = useRef<HTMLInputElement | null>(null);
  const displayModeMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const efficiencyDetailsRef = useRef<HTMLDivElement | null>(null);
  const focusedAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedAutosaveSignatureRef = useRef<string | null>(null);
  const overdueNudgeAttemptAtByTaskRef = useRef<Record<string, number>>({});
  const loadedAiHistoryTaskIdsRef = useRef<Set<string>>(new Set());
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
    payload: { timeZone?: string; morningAiCheckupEnabled?: boolean; morningAiCheckupTime?: string },
    savingKey: 'timeZone' | 'checkupEnabled' | 'checkupTime'
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
        notifyBeforeMinutes: 30,
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
    setBackgroundImage(null);
    setBackgroundOverlayOpacity(DEFAULT_BACKGROUND_OVERLAY_OPACITY);
    setThemeMode('light');
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
    void load();
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
    if (!currentUser) {
      setAiDialogByTask({});
      setAiReadCursorByTask({});
      setBackgroundImage(null);
      setBackgroundOverlayOpacity(DEFAULT_BACKGROUND_OVERLAY_OPACITY);
      setThemeMode('light');
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
        const result = await api.getGeneralAssistantHistory();
        if (isCancelled) return;
        const normalized = result.messages
          .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
          .map((message) => ({ id: crypto.randomUUID(), role: message.role, content: message.content }));
        setGeneralAiMessages(normalized);
        setAiChatProjects((prev) => normalizeAiChatProjects(prev, normalized));
      } catch {
        if (isCancelled) return;
        setGeneralAiMessages([]);
      }
    };
    void loadGeneralAiHistory();

    setBackgroundImage(localStorage.getItem(getBackgroundStorageKey(currentUser.id)));

    const storedThemeMode = localStorage.getItem(getThemeStorageKey(currentUser.id));
    setThemeMode(storedThemeMode === 'dark' ? 'dark' : 'light');

    const storedRankingMode = localStorage.getItem(getRankingModeStorageKey(currentUser.id));
    if (storedRankingMode === 'urgency' || storedRankingMode === 'importance' || storedRankingMode === 'coefficient') {
      setRankingMode(storedRankingMode);
    } else {
      setRankingMode('urgency');
    }

    const rawOverlayOpacity = localStorage.getItem(getBackgroundOverlayStorageKey(currentUser.id));
    const parsedOverlayOpacity = rawOverlayOpacity ? Number(rawOverlayOpacity) : Number.NaN;
    if (Number.isFinite(parsedOverlayOpacity)) {
      setBackgroundOverlayOpacity(
        Math.min(MAX_BACKGROUND_OVERLAY_OPACITY, Math.max(MIN_BACKGROUND_OVERLAY_OPACITY, parsedOverlayOpacity))
      );
      return;
    }
    setBackgroundOverlayOpacity(DEFAULT_BACKGROUND_OVERLAY_OPACITY);
    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    document.body.dataset.theme = themeMode;
    document.documentElement.dataset.theme = themeMode;
    return () => {
      delete document.body.dataset.theme;
      delete document.documentElement.dataset.theme;
    };
  }, [themeMode]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(getThemeStorageKey(currentUser.id), themeMode);
  }, [themeMode, currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const key = getBackgroundStorageKey(currentUser.id);
    if (backgroundImage) {
      localStorage.setItem(key, backgroundImage);
      return;
    }
    localStorage.removeItem(key);
  }, [backgroundImage, currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(getBackgroundOverlayStorageKey(currentUser.id), String(backgroundOverlayOpacity));
  }, [backgroundOverlayOpacity, currentUser?.id]);


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
      const parsed = JSON.parse(raw) as Record<string, ChatMode>;
      setAiModeByTask(parsed);
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('btm:task-ai-mode-map', JSON.stringify(aiModeByTask));
  }, [aiModeByTask]);

  useEffect(() => {
    localStorage.setItem(USER_TIMEZONE_STORAGE_KEY, userTimeZone);
  }, [userTimeZone]);

  useEffect(() => {
    if (!currentUser) return;
    const profileTimeZone = currentUser.timeZone?.trim();
    if (profileTimeZone) {
      setUserTimeZone(profileTimeZone);
    }
    setIsMorningAiCheckupEnabled(currentUser.morningAiCheckupEnabled === true);
    setMorningAiCheckupTime(currentUser.morningAiCheckupTime?.trim() || DEFAULT_MORNING_AI_CHECKUP_TIME);
    setSettingsError(null);
  }, [currentUser?.id, currentUser?.timeZone, currentUser?.morningAiCheckupEnabled, currentUser?.morningAiCheckupTime]);

  useEffect(() => {
    if (!currentUser || !focusedTaskId) return;
    if (loadedAiHistoryTaskIdsRef.current.has(focusedTaskId)) return;
    let isCancelled = false;
    const loadAiTaskHistory = async () => {
      try {
        const result = await api.getTaskAssistantHistory(focusedTaskId);
        if (isCancelled) return;
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
        const result = await api.getTaskAssistantHistory(focusedTaskId);
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
      if (isDisplayModeMenuOpen && displayModeMenuRef.current && target && !displayModeMenuRef.current.contains(target)) {
        setIsDisplayModeMenuOpen(false);
      }
      if (isSettingsOpen && settingsMenuRef.current && target && !settingsMenuRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isDisplayModeMenuOpen, isSettingsOpen, isSphereFilterOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (isEfficiencyDetailsOpen && efficiencyDetailsRef.current && target && !efficiencyDetailsRef.current.contains(target)) {
        setIsEfficiencyDetailsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isEfficiencyDetailsOpen]);

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
                : [...previousDialog, { id: crypto.randomUUID(), role: 'assistant', content: answer }];
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
        if (subtaskFilterMode === 'none') return 0;
        if (subtaskFilterMode === 'importance') {
          const importanceDiff = (b.importance ?? 3) - (a.importance ?? 3);
          if (importanceDiff !== 0) return importanceDiff;
        }
        return toDeadlineTimestamp(a) - toDeadlineTimestamp(b);
      });
      return acc;
    }, {}),
    [subtaskMap, subtaskFilterMode]
  );
  const activeTasks = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE'), [rootTasks]);
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
  const focusCompletedSubtasksCount = useMemo(
    () => subtasks.filter((task) => task.status === 'DONE' && !focusSessionInitialDoneSubtaskIds.has(task.id)).length,
    [focusSessionInitialDoneSubtaskIds, subtasks]
  );
  const focusSessionRatingEarned = useMemo(
    () => (Object.values(focusBonusEvents) as Array<FocusBonusEvent | null>).reduce((total, event) => total + (event?.totalDelta ?? 0), 0),
    [focusBonusEvents]
  );
  const completedTasks = useMemo(() => rootTasks.filter((task) => task.status === 'DONE'), [rootTasks]);
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
      .slice(0, 5)
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
  const focusedAiMode: ChatMode = focusedTask ? (aiModeByTask[focusedTask.id] ?? 'fast') : 'fast';
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
    const previousRows = textarea.rows;
    textarea.rows = 1;
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    const verticalPadding =
      Number.parseFloat(computedStyle.paddingTop) +
      Number.parseFloat(computedStyle.paddingBottom);
    const singleLineHeight =
      (Number.isFinite(lineHeight) ? lineHeight : 36) + verticalPadding;
    const nextIsSingleLine = textarea.scrollHeight <= singleLineHeight + 4;
    textarea.rows = previousRows;
    setIsFocusedTitleSingleLine(nextIsSingleLine);
  }, [focusedTask?.id, focusedDraft?.title, focusedTitleDraft, isEditingFocusedTitle]);

  const filteredGeneralAiMessages = useMemo(() => {
    if (!isGeneralAiSearchOpen) return generalAiMessages;
    const query = generalAiSearchQuery.trim().toLowerCase();
    if (!query) return generalAiMessages;
    return generalAiMessages.filter((message) => message.content.toLowerCase().includes(query));
  }, [generalAiMessages, generalAiSearchQuery, isGeneralAiSearchOpen]);

  const normalizeTaskAiMessages = (messages: ChatMessage[]): TaskAiMessage[] =>
    messages.map((message, index) => ({ id: `${index}-${message.role}-${message.content}`, role: message.role, content: message.content }));

  useEffect(() => {
    if (!focusedTask) {
      setFocusedDraft(null);
      setIsFocusedNotesEditorOpen(false);
      setIsFocusedSettingsOpen(false);
      setIsEditingFocusedTitle(false);
      setFocusedTitleDraft('');
      setIsFocusedTitleSingleLine(true);
      setIsFocusedSphereDropdownOpen(false);
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
    setIsFocusedNotesEditorOpen(false);
    setIsFocusedSettingsOpen(false);
    setIsEditingFocusedTitle(false);
    setFocusedTitleDraft(focusedTask.title ?? '');
    setIsFocusedTitleSingleLine(true);
    setIsFocusedSphereDropdownOpen(false);
    setFocusedDraft({ ...focusedTask, aiNotificationsEnabled: focusedTask.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled });
    setFocusedRecurrenceSummary(focusedTask.recurrenceSummary ?? null);
    if (focusedTask.notifyBeforeMinutes === null) {
      setFocusedNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(focusedTask.notifyBeforeMinutes ?? 30)) {
      setFocusedNotifyPreset(String(focusedTask.notifyBeforeMinutes ?? 30));
    } else {
      setFocusedNotifyPreset('30');
    }
    focusedAutosaveSignatureRef.current = JSON.stringify({
      title: focusedTask.title ?? '',
      description: focusedTask.description ?? '',
      sphereId: focusedTask.sphereId ?? null,
      dueDate: focusedTask.dueDate ?? null,
      notifyBeforeMinutes: focusedTask.notifyBeforeMinutes ?? null,
      isRecurring: focusedTask.isRecurring ?? false,
      recurrenceText: focusedTask.recurrenceText ?? null,
      recurrenceJson: focusedTask.recurrenceJson ?? null,
      recurrenceSummary: focusedTask.recurrenceSummary ?? null,
      recurrenceUntil: focusedTask.recurrenceUntil ?? null,
      importance: focusedTask.importance ?? 3,
      urgency: focusedTask.urgency ?? 3,
      status: focusedTask.status ?? 'TODO'
      ,
      aiNotificationsEnabled: focusedTask.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled
    });
  }, [focusedTask, isAiNotificationsDefaultEnabled]);

  useEffect(() => {
    if (!focusedTask || !focusedDraft) return;
    const normalized = {
      ...focusedDraft,
      importance: focusedDraft.importance ?? 3,
      urgency: focusedDraft.urgency ?? 3,
      status: focusedDraft.status ?? 'TODO'
    };
    const payloadSignature = JSON.stringify({
      title: normalized.title ?? '',
      description: normalized.description ?? '',
      sphereId: normalized.sphereId ?? null,
      dueDate: normalized.dueDate ?? null,
      notifyBeforeMinutes: normalized.notifyBeforeMinutes ?? null,
      isRecurring: normalized.isRecurring ?? false,
      recurrenceText: normalized.recurrenceText ?? null,
      recurrenceJson: normalized.recurrenceJson ?? null,
      recurrenceSummary: normalized.recurrenceSummary ?? null,
      recurrenceUntil: normalized.recurrenceUntil ?? null,
      aiNotificationsEnabled: normalized.aiNotificationsEnabled ?? isAiNotificationsDefaultEnabled,
      importance: normalized.importance,
      urgency: normalized.urgency,
      status: normalized.status
    });
    if (focusedAutosaveSignatureRef.current === payloadSignature) return;
    if (focusedAutosaveTimeoutRef.current) {
      clearTimeout(focusedAutosaveTimeoutRef.current);
    }
    focusedAutosaveTimeoutRef.current = setTimeout(() => {
      const score = calcScore(normalized.importance, normalized.urgency);
      void api.updateTask(focusedTask.id, { ...normalized, priorityScore: score }).then(() => {
        focusedAutosaveSignatureRef.current = payloadSignature;
      });
    }, 700);
    return () => {
      if (focusedAutosaveTimeoutRef.current) {
        clearTimeout(focusedAutosaveTimeoutRef.current);
      }
    };
  }, [focusedTask?.id, focusedDraft, isAiNotificationsDefaultEnabled]);

  const closeFocusedTask = async () => {
    if (!focusedTask || !focusedDraft) {
      setFocusedTaskId(null);
      return;
    }
    if (focusedAutosaveTimeoutRef.current) {
      clearTimeout(focusedAutosaveTimeoutRef.current);
      focusedAutosaveTimeoutRef.current = null;
    }
    const normalized = {
      ...focusedDraft,
      importance: focusedDraft.importance ?? 3,
      urgency: focusedDraft.urgency ?? 3,
      status: focusedDraft.status ?? 'TODO'
    };
    const score = calcScore(normalized.importance, normalized.urgency);
    await api.updateTask(focusedTask.id, { ...normalized, priorityScore: score });
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
        dueDate: parsed.nextDueDate
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
  }, [focusedTask?.id, focusedDraft, focusedAiDialog.length, isAiExpanded, aiLoadingTaskId]);

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
    focusAiLoadingRef.current = focusAiLoading;
  }, [focusAiLoading]);

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
  }, [focusAiMessages, focusAiLoading, isFocusModeOpen, isFocusAiExpanded]);

  useEffect(() => {
    if (focusTaskSwitchAiTimeoutRef.current) {
      clearTimeout(focusTaskSwitchAiTimeoutRef.current);
      focusTaskSwitchAiTimeoutRef.current = null;
    }
    if (!isFocusModeOpen || !focusActiveTask || !isFocusTimerRunning) return;
    const previousTaskId = previousFocusActiveTaskIdRef.current;
    previousFocusActiveTaskIdRef.current = focusActiveTask.id;
    if (!previousTaskId || previousTaskId === focusActiveTask.id) return;
    focusTaskSwitchAiTimeoutRef.current = setTimeout(() => {
      focusTaskSwitchAiTimeoutRef.current = null;
      if (focusAiLoadingRef.current) return;
      void sendFocusAiQuestion({ questionOverride: 'Пользователь переключился на эту задачу. Дай ближайшие конкретные действия именно по ней.', userContentOverride: 'Подсказать ближайшие действия по новой задаче' });
    }, FOCUS_TASK_SWITCH_AI_DELAY_MS);
    return () => {
      if (focusTaskSwitchAiTimeoutRef.current) {
        clearTimeout(focusTaskSwitchAiTimeoutRef.current);
        focusTaskSwitchAiTimeoutRef.current = null;
      }
    };
  }, [focusActiveTask?.id, isFocusModeOpen, isFocusTimerRunning]);

  const sendFocusedAiQuestion = async (options?: {
    questionOverride?: string;
    userContentOverride?: string;
    modeOverride?: ChatMode;
  }) => {
    if (!focusedTask) return;
    const question = options?.questionOverride?.trim() ?? aiDraft.trim();
    if (!question && aiPendingFiles.length === 0) return;

    const fileNames = aiPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiPendingFiles.map((file) => fileToAttachmentPayload(file)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось прочитать приложенный файл';
      setAiError(message);
      return;
    }

    const taskId = focusedTask.id;
    const previousDialog = aiDialogByTask[taskId] ?? [];
    const baseUserContent = options?.userContentOverride?.trim() || question;
    const userContent = fileNames.length > 0
      ? `${baseUserContent || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : baseUserContent;
    const nextDialog = [...previousDialog, { id: crypto.randomUUID(), role: 'user' as const, content: userContent }];
    setAiDialogByTask((prev) => ({ ...prev, [taskId]: nextDialog }));
    setAiDraft('');
    setAiPendingFiles([]);
    setAiError(null);
    setAiLoadingTaskId(taskId);

    try {
      const result = await askTaskAssistant(taskId, {
        question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.',
        userMessage: userContent,
        mode: options?.modeOverride ?? focusedAiMode,
        attachments: attachmentsPayload
      });
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { id: crypto.randomUUID(), role: 'assistant', content: result.answer }]
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
        : 'Ошибка отправки сообщения. Попробуйте ещё раз.';
      console.error('[AI task chat] send failed', error);
      setAiError(message);
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { id: crypto.randomUUID(), role: 'assistant', content: message }]
      }));
    } finally {
      setAiLoadingTaskId(null);
    }
  };

  const helpWithTask = async () => {
    await sendFocusedAiQuestion({
      questionOverride: HELP_WITH_TASK_PROMPT,
      userContentOverride: 'Помочь с задачей',
      modeOverride: 'fast'
    });
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

  const fileToAttachmentPayload = async (file: File): Promise<ChatAttachmentPayload> => ({
    name: file.name,
    mimeType: resolveAttachmentMimeType(file),
    size: file.size,
    contentBase64: await toBase64(file)
  });

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) {
      setAiError('Можно прикреплять PDF, DOCX, XLS/XLSX и изображения (PNG/JPG/WEBP/GIF).');
    }

    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setAiError(`Файл ${oversized.name} превышает лимит 8MB.`);
      event.target.value = '';
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
    event.target.value = '';
  };

  const uploadFocusedTaskFiles = async (files: File[]) => {
    if (!focusedTask || files.length === 0) return;
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== files.length) {
      setAiError('Для задачи можно прикреплять только PDF, DOCX, XLS/XLSX и изображения.');
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

  const clearFocusedAiDialog = () => {
    if (!focusedTask) return;
    setAiDialogByTask((prev) => {
      if (!(focusedTask.id in prev)) return prev;
      const next = { ...prev };
      delete next[focusedTask.id];
      return next;
    });
    setAiError(null);
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
    setFocusAiMessages([]);
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
    if (shouldWarnAboutFocusDistraction(task)) {
      setFocusDistractionTaskId(task.id);
      return;
    }
    if (task.taskType === 'EVENT' || task.parentTaskId) setEditorState({ task });
    else setFocusedTaskId(task.id);
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

  const sendFocusAiQuestion = async (options?: { questionOverride?: string; userContentOverride?: string; allowBeforeTimerStateUpdate?: boolean }) => {
    const currentTask = focusActiveTask;
    const question = (options?.questionOverride ?? focusAiDraft).trim();
    if (!currentTask || focusAiLoading || (!isFocusTimerRunning && !options?.allowBeforeTimerStateUpdate)) return;
    if (!question && focusAiPendingFiles.length === 0) return;

    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(focusAiPendingFiles.map((file) => fileToAttachmentPayload(file)));
    } catch (error) {
      setFocusAiError(error instanceof Error ? error.message : 'Не удалось прочитать приложенный файл');
      return;
    }

    const fileNames = focusAiPendingFiles.map((file) => file.name);
    const visibleUserContent = options?.userContentOverride?.trim() || question || 'Сообщение с вложением';
    const userContent = fileNames.length > 0 ? `${visibleUserContent}

📎 Файлы: ${fileNames.join(', ')}` : visibleUserContent;
    const allContext = focusTasks.map(buildFocusTaskContext).join('\n\n---\n\n');
    const contextualQuestion = [
      'Ты работаешь в режиме концентрации. Помогай только по выбранным задачам и учитывай, какая задача выбрана сейчас.',
      'Закрытые подзадачи намеренно не включены в контекст. Не планируй работу по закрытым подзадачам и не восстанавливай их по истории диалога.',
      'Если в ответе говоришь о конкретной задаче или подзадаче, сразу после её названия добавляй служебную метку [[task_ref=ID]] из контекста. Не придумывай ID.',
      'Не пиши технические ID как обычный текст — только внутри метки [[task_ref=...]].',
      `Текущая выбранная задача: [${currentTask.id}] ${currentTask.title}`,
      `Контекст всех задач:
${allContext}`,
      `Запрос пользователя: ${question || visibleUserContent}`
    ].join('\n\n');
    setFocusAiMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: userContent }]);
    setFocusAiDraft('');
    setFocusAiPendingFiles([]);
    setFocusAiError(null);
    setFocusAiLoading(true);
    setFocusSessionAiRequestCount((count) => count + 1);
    try {
      const result = await askTaskAssistant(currentTask.id, { question: contextualQuestion, userMessage: userContent, mode: focusAiMode, attachments: attachmentsPayload, skipEfficiencyBonus: true });
      setFocusAiMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: result.answer }]);
      if (isFocusBonusEligible(currentTask.id)) pushFocusBonusMessage('ai', EFFICIENCY_BONUSES.aiCreditSpent * (focusAiMode === 'smart' ? 5 : 2) * (FOCUS_BONUS_MULTIPLIERS.ai - 1));
      await refreshAiCredits();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
      setFocusAiError(message);
      setFocusAiMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: message === INSUFFICIENT_AI_CREDITS_MESSAGE ? INSUFFICIENT_AI_CREDITS_MESSAGE : 'Не удалось ответить в режиме концентрации. Попробуйте ещё раз.' }]);
    } finally {
      setFocusAiLoading(false);
    }
  };

  const handleFocusAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setFocusAiError('Можно прикреплять PDF, DOCX, XLS/XLSX и изображения (PNG/JPG/WEBP/GIF).');
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

  const removeFocusAiPendingFile = (fileName: string) => {
    setFocusAiPendingFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const startFocusTimer = () => {
    if (focusRemainingSeconds <= 0) setFocusRemainingSeconds(focusTimerMinutes * 60);
    setIsFocusSessionFinished(false);
    if (focusActiveTask) previousFocusActiveTaskIdRef.current = focusActiveTask.id;
    setIsFocusTimerRunning(true);
    if (focusAiMessages.length === 0 && focusActiveTask) {
      void sendFocusAiQuestion({ questionOverride: 'Предложи первые необходимые шаги для старта работы прямо сейчас.', userContentOverride: 'Предложить первые шаги для старта', allowBeforeTimerStateUpdate: true });
    }
  };

  const activeAiChatProject = aiChatProjects.find((project) => project.id === activeAiChatProjectId) ?? aiChatProjects[0];
  const activeAiChat = activeAiChatProject?.chats.find((chat) => chat.id === activeAiChatId) ?? activeAiChatProject?.chats[0];
  const quickAiChatMessages = aiChatProjects[0]?.chats.find((chat) => chat.id === QUICK_AI_CHAT_ID)?.messages ?? [];

  useEffect(() => {
    localStorage.setItem('btm:ai-chat-projects', JSON.stringify(aiChatProjects));
    const quickChatMessages = aiChatProjects[0]?.chats.find((chat) => chat.id === QUICK_AI_CHAT_ID)?.messages ?? [];
    localStorage.setItem(QUICK_AI_CHAT_STORAGE_KEY, JSON.stringify(quickChatMessages.slice(-20)));
  }, [aiChatProjects]);

  const scrollQuickAiChatToBottom = () => {
    const container = quickAiChatDialogContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  };

  const scheduleQuickAiChatScrollToBottom = () => {
    window.requestAnimationFrame(scrollQuickAiChatToBottom);
  };

  useEffect(() => {
    const frameId = window.requestAnimationFrame(scrollQuickAiChatToBottom);
    return () => window.cancelAnimationFrame(frameId);
  }, [quickAiChatMessages.length, aiChatLoading]);

  useEffect(() => {
    aiChatDialogContainerRef.current?.scrollTo({ top: aiChatDialogContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeAiChat?.messages.length, aiChatLoading, isAiChatOpen]);

  const updateActiveAiChatMessages = (updater: (messages: AiChatMessage[]) => AiChatMessage[]) => {
    setAiChatProjects((prev) => prev.map((project) => project.id !== activeAiChatProject?.id ? project : {
      ...project,
      chats: project.chats.map((chat) => chat.id !== activeAiChat?.id ? chat : { ...chat, messages: updater(chat.messages) })
    }));
  };

  const sendAiChatQuestion = async (quick = false) => {
    const question = (quick ? quickAiChatDraft : aiChatDraft).trim();
    if (!question || aiChatLoading) return;
    const userMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    const history = quick ? quickAiChatMessages : (activeAiChat?.messages ?? []);
    if (quick) {
      setAiChatProjects((prev) => prev.map((project, projectIndex) => projectIndex === 0 ? { ...project, chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: [...chat.messages, userMessage].slice(-20) } : chat) } : project));
      setQuickAiChatDraft('');
    } else {
      updateActiveAiChatMessages((messages) => [...messages, userMessage]);
      setAiChatDraft('');
    }
    setAiChatLoading(true);
    setAiChatError(null);
    try {
      const result = await api.askAiChat({
        question,
        history,
        model: quick ? 'gpt-5.4-nano' : selectedAiChatModel,
        projectTitle: quick ? QUICK_AI_CHAT_PROJECT_TITLE : activeAiChatProject?.title,
        chatTitle: quick ? QUICK_AI_CHAT_TITLE : activeAiChat?.title
      });
      const actionReports = result.actionReports ?? [];
      const serviceReport = result.delegatedToPlanner && actionReports.length > 0
        ? `\n\nОтчёт сервиса:\n- ${actionReports.join('\n- ')}`
        : '';
      const assistantMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `${result.delegatedToPlanner ? '🧭 ИИ-планировщик\n' : ''}${normalizeAiMessageContent(result.answer)}${serviceReport}` };
      if (quick) setAiChatProjects((prev) => prev.map((project, projectIndex) => projectIndex === 0 ? { ...project, chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: [...chat.messages, assistantMessage].slice(-20) } : chat) } : project));
      else updateActiveAiChatMessages((messages) => [...messages, assistantMessage]);
      if (result.delegatedToPlanner) await load();
      await refreshAiCredits();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
      setAiChatError(message);
    } finally {
      setAiChatLoading(false);
    }
  };

  const openAiChatProjectDialog = () => {
    setAiChatProjectDraft({ mode: 'create', title: `Проект ${aiChatProjects.length + 1}`, color: '#8b5cf6', icon: '✨' });
    setIsAiChatProjectDialogOpen(true);
  };

  const openAiChatProjectSettings = (projectId: string) => {
    const project = aiChatProjects.find((item) => item.id === projectId);
    if (!project) return;
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
    if (chatId === QUICK_AI_CHAT_ID) return;
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
    if (!activeAiChatProject) return;
    const chat = { id: crypto.randomUUID(), title: `Чат ${activeAiChatProject.chats.length}`, messages: [] };
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: [chat, ...project.chats] } : project));
    setActiveAiChatId(chat.id);
  };

  const deleteAiChatThread = (chatId: string) => {
    if (chatId === QUICK_AI_CHAT_ID || !activeAiChatProject || activeAiChatProject.chats.length <= 1) return;
    setAiChatProjects((prev) => prev.map((project) => {
      if (project.id !== activeAiChatProject.id) return project;
      const nextChats = project.chats.filter((chat) => chat.id !== chatId);
      if (activeAiChatId === chatId) setActiveAiChatId(nextChats[0]?.id ?? '');
      return { ...project, chats: nextChats };
    }));
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
        { id: crypto.randomUUID(), role: 'assistant', content: `${result.answer}${serviceReport}` }
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

  const selectedDisplayMode = DISPLAY_MODE_OPTIONS.find((option) => option.value === displayMode) ?? DISPLAY_MODE_OPTIONS[0];
  const isTimelineMode = displayMode === 'timeline';
  const isBubblesMode = displayMode === 'bubbles';

  useEffect(() => {
    if (isBubblesMode && rankingMode !== 'coefficient') {
      setRankingMode('coefficient');
    }
  }, [isBubblesMode, rankingMode]);
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


  useEffect(() => {
    setCompletedVisibleCount(40);
  }, [completedFilter]);

  const visibleTasks = useMemo(
    () =>
      activeTasks.filter((task) => {
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

        if (!isTimelineMode && task.taskType === 'EVENT') return false;
        if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
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
    [activeTasks, effectiveTimeFilter, isTimelineMode, search, selectedSphereIds, shouldApplySphereFilter, spheres.length, subtaskMap]
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

  const persistTask = async (payload: Partial<Task>, draftSubtasks: Array<Pick<Task, 'title' | 'description'>> = []) => {
    if (!editorState?.task?.id && !(payload.title ?? '').trim()) {
      throw new Error('Необходимо ввести название');
    }
    const normalized = {
      ...payload,
      title: (payload.title ?? '').trim(),
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3,
      status: payload.status ?? 'TODO'
    };
    const isEventPayload = (payload.taskType ?? editorState?.task?.taskType) === 'EVENT';
    const score = calcScore(normalized.importance, normalized.urgency);

    if (editorState?.task?.id) {
      await api.updateTask(editorState.task.id, { ...normalized, taskType: isEventPayload ? 'EVENT' : 'TASK', aiNotificationsEnabled: isEventPayload ? false : normalized.aiNotificationsEnabled, priorityScore: score });
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
          notifyBeforeMinutes: 30,
          sphereId: null,
          parentTaskId: createdTask.id
        })));
      }
      void persistEfficiencyBonus(EFFICIENCY_BONUSES.createdTask, 'task');
    }
    setEditorState(null);
    await load();
  };

  const autosaveEditorTask = async (payload: Partial<Task>) => {
    if (!editorState?.task?.id) return;
    const normalized = {
      ...payload,
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3,
      status: payload.status ?? 'TODO'
    };
    const isEventPayload = (payload.taskType ?? editorState?.task?.taskType) === 'EVENT';
    const score = calcScore(normalized.importance, normalized.urgency);
    await api.updateTask(editorState.task.id, { ...normalized, taskType: isEventPayload ? 'EVENT' : 'TASK', aiNotificationsEnabled: isEventPayload ? false : normalized.aiNotificationsEnabled, priorityScore: score });
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
      priorityScore: calcScore(importance, urgency)
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
        notifyBeforeMinutes: 30,
        sphereId: null,
        parentTaskId: createdTask.id
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

  const completeTask = async (task: Task) => {
    markTaskAsClosing(task.id);
    setPoppingTaskId(task.id);
    await new Promise((resolve) => setTimeout(resolve, 680));
    await api.updateTask(task.id, { status: 'DONE' });
    void persistEfficiencyBonus(EFFICIENCY_BONUSES.doneTask, 'task');
    if (isFocusBonusEligible(task.id)) pushFocusBonusMessage('task', EFFICIENCY_BONUSES.doneTask * (FOCUS_BONUS_MULTIPLIERS.task - 1));
    unmarkTaskAsClosing(task.id);
    setEditorState(null);
    setFocusedTaskId(null);
    await load();
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
        }
      }
      await maybeSuggestParentDeadlineShift(subtask.parentTaskId);
      if (parentCompleted && focusedTaskId === subtask.parentTaskId) {
        setFocusedTaskId(null);
        setFocusedDraft(null);
      }
    }
    await load();
    unmarkTaskAsClosing(subtask.id);
  };

  const createSubtaskForParent = async (parentTask: Task, payload: Partial<Task>) => {
    const createdSubtask = await api.createTask({
      ...payload,
      importance: 3,
      urgency: 3,
      priorityScore: 3,
      status: 'TODO',
      sphereId: null,
      parentTaskId: parentTask.id
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
    await createSubtaskForParent(focusedTask, { title, dueDate: focusedSubtaskDueDate, notifyBeforeMinutes: 30 });
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

  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBackgroundImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const askTaskAssistant = async (taskId: string, payload: { question: string; userMessage?: string; mode: ChatMode; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean }) => {
    const result = await api.askTaskAssistant(taskId, payload);
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
  };

  const submitAuth = async () => {
    if (!authModalMode) return;
    try {
      const result = authModalMode === 'login'
        ? await api.login({ login: authLogin, password: authPassword })
        : await api.register({ login: authLogin, password: authPassword, name: authName });
      setCurrentUser(result.user);
      setAuthError(null);
      setAuthModalMode(null);
    } catch {
      setAuthError(
        authModalMode === 'login'
          ? 'Не удалось войти. Проверьте логин и пароль.'
          : 'Не удалось зарегистрироваться. Возможно, логин уже занят.'
      );
    }
  };

  if (authLoading) {
    return (
      <main className="app-shell flex h-screen items-center justify-center p-4" data-theme={themeMode}>
        <p className="text-sm text-slate-300">Проверяем авторизацию…</p>
      </main>
    );
  }

  if (!currentUser) return null;

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
      const systemMessage: AiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `ℹ️ Системное уведомление\n${text}` };
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
    const result = await askTaskAssistant(task.id, { question: prompt, mode: 'fast' });
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
    const hasOverdueSubtask = taskSubtasks.some((subtask) => subtask.status !== 'DONE' && isOverdue(subtask));
    const hasOverdueState = task.status !== 'DONE' && (isOverdue(task) || hasOverdueSubtask);
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
        className={`timeline-task-chip ${isEventChip ? 'timeline-event-chip' : ''} relative flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs transition-all duration-200 hover:brightness-110 ${
          canDragTask ? 'cursor-grab active:cursor-grabbing' : ''
        } ${draggedTimelineTaskId === task.id ? 'opacity-60' : ''} ${isCompletingInTimeline || isCompletingOutsideTimeline ? 'ring-1 ring-emerald-300/70' : ''}`}
        data-timeline-task-id={task.id}
        style={{
          borderColor: isEventChip ? '#f59e0b' : isSubtaskChip ? 'rgba(148,163,184,0.75)' : (hasOverdueState ? 'rgba(251,113,133,0.85)' : sphereColor),
          backgroundColor: isEventChip
            ? (themeMode === 'light' ? 'rgba(254,243,199,0.95)' : 'rgba(146,64,14,0.38)')
            : isSubtaskChip
              ? (themeMode === 'light' ? 'rgba(241,245,249,0.92)' : 'rgba(71,85,105,0.5)')
            : hasOverdueState
              ? (themeMode === 'light' ? 'rgba(255,228,230,0.92)' : 'rgba(136,19,55,0.45)')
              : hexToRgba(sphereColor, themeMode === 'light' ? 0.16 : 0.34) ?? (themeMode === 'light' ? 'rgba(241,245,249,0.92)' : 'rgba(100,116,139,0.34)'),
          boxShadow: disableEffects
            ? undefined
            : (!isEventChip && hasOverdueState)
              ? '0 0 15px rgba(239,68,68,0.78), inset 0 0 10px rgba(239,68,68,0.34)'
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
          if (draggedTimelineTaskId !== null || options?.disableHoverCard) return;
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
          if (options?.disableOpenOnClick) return;
          openTaskWithFocusGuard(task);
        }}
        onContextMenu={(event) => {
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
          {isSubtaskChip ? <span className="h-4 w-1 shrink-0 rounded-sm" style={{ backgroundColor: parentSphereColor }} /> : null}
          <span className={`truncate transition-all duration-300 ${isCompletingInTimeline || isCompletingOutsideTimeline ? 'timeline-task-chip-completed line-through decoration-2' : ''}`}>
            <LinkifiedText text={task.title} stopPropagationOnLinkClick />
          </span>
          {!isEventChip && hasUnreadAiMessage(task.id) ? <span title="Непрочитанное ИИ-уведомление"><Sparkles size={12} className="timeline-task-ai-icon shrink-0" /></span> : null}
          {options?.showTime && task.dueDate ? (
            <span className="timeline-task-chip-meta ml-1">
              ({new Date(task.dueDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
            </span>
          ) : null}
          {task.isRecurring ? <span title="Повторяющееся событие/задача"><Repeat size={12} className="timeline-task-chip-accent shrink-0" /></span> : null}
          {isEventChip && task.location ? <span className="timeline-task-chip-meta ml-1 truncate">· {task.location}</span> : null}
        </span>
        {!isEventChip && !isSubtaskChip ? <div className="flex items-center gap-1"><span className="timeline-task-count-badge rounded-full border px-1.5 py-0.5 text-[10px]">{taskSubtasks.length}</span></div> : null}
        {isCompletingInTimeline || isCompletingOutsideTimeline ? (
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="pointer-events-none absolute left-2 right-2 top-1/2 h-[2px] origin-left rounded bg-emerald-300/90"
          />
        ) : null}
        {isHoverCardVisible ? createPortal((
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

  const renderTimelineHabitChip = (habit: Habit, date: Date, options?: { showTime?: boolean }) => {
    const dateKey = toLocalDateKey(date);
    const completed = getHabitCompletedForDate(habit, dateKey);
    const progress = Math.round((Math.min(completed, habit.targetCount) / Math.max(1, habit.targetCount)) * 100);
    const reminderLabel = (habit.reminderTimes?.join(', ') || habit.reminderTime) ?? '—';
    return (
      <div
        key={`timeline-habit-${habit.id}-${dateKey}-${options?.showTime ? 'time' : 'plain'}`}
        className="timeline-habit-chip flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition"
        style={{ '--habit-color': habit.color, '--habit-progress': `${progress}%`, borderColor: hexToRgba(habit.color, themeMode === 'light' ? 0.5 : 0.72) ?? habit.color } as CSSProperties}
      >
        <span className="miniapp-habit-circle inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm" style={{ '--habit-color': habit.color, '--habit-progress': `${progress}%` } as CSSProperties}>
          <span className="miniapp-habit-circle-core inline-flex h-5 w-5 items-center justify-center rounded-full">{habit.icon}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{habit.name}</span>
          <span className="timeline-habit-chip-meta block truncate">Привычка · {reminderLabel} · {completed}/{habit.targetCount}</span>
        </span>
      </div>
    );
  };

  const getTimelineHabitsForDateHour = (date: Date, hour?: number) => habits
    .filter((habit) => (habit.reminderTimes?.length || habit.reminderTime) && isHabitScheduledForDate(habit, date))
    .filter((habit) => {
      if (typeof hour !== 'number') return true;
      const times = habit.reminderTimes?.length ? habit.reminderTimes : (habit.reminderTime ? [habit.reminderTime] : []);
      return times.some((time) => Number(time.slice(0, 2)) === hour);
    })
    .sort((a, b) => ((a.reminderTimes?.[0] ?? a.reminderTime) ?? '').localeCompare((b.reminderTimes?.[0] ?? b.reminderTime) ?? ''));

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
    .filter((task) => task.taskType !== 'EVENT' && isOverdue(task))
    .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : 0) - (b.dueDate ? new Date(b.dueDate).getTime() : 0));

  const postponeAllOverdueByOneDay = async () => {
    if (timelineOverdueBulkPostponeLoading) return;
    setTimelineOverdueBulkPostponeLoading('normal');
    try {
      await Promise.all(timelineOverdueTasks.map(async (task) => {
        if (!task.dueDate) return;
        const next = new Date(task.dueDate);
        if (Number.isNaN(next.getTime())) return;
        next.setDate(next.getDate() + 1);
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
  const timelinePickerTasks = [...activeTasks, ...subtasks.filter((task) => task.status !== 'DONE')].map((task) => ({
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

  return (
    <main
      className="app-shell flex h-screen flex-col overflow-y-auto p-4 lg:p-6"
      data-theme={themeMode}
      style={{
        backgroundImage: themeMode === 'dark' && backgroundImage
          ? `linear-gradient(rgba(2,6,23,${backgroundOverlayOpacity}), rgba(2,6,23,${backgroundOverlayOpacity})), url(${backgroundImage})`
          : undefined,
        backgroundSize: themeMode === 'dark' && backgroundImage ? 'cover' : undefined,
        backgroundPosition: themeMode === 'dark' && backgroundImage ? 'center' : undefined
      }}
    >
      <header className="surface-topbar light-glass-topbar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 backdrop-blur">
        <h1 className="mr-3 text-xl font-semibold">Bubble Task Manager</h1>
        <div className="mr-1 text-xs text-muted">{currentUser.name ?? currentUser.username ?? currentUser.email ?? 'Локальный пользователь'}</div>
        {currentUser.username ? (
          <div className="rounded bg-emerald-700/80 px-2 py-1 text-xs">Аккаунт: {currentUser.username}</div>
        ) : (
          <div className="surface-muted rounded px-2 py-1 text-xs">Гостевой режим</div>
        )}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/40 bg-slate-900/85 text-cyan-200 transition hover:border-cyan-300 light-icon-button"
          aria-label="Подключить Telegram"
          title="Подключить Telegram"
          onClick={async () => {
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
          }}
        >
          <Smartphone size={18} />
        </button>

        <input className="surface-input light-search-input min-w-52 flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Поиск по задачам" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded bg-cyan-700 px-3 py-2 text-sm light-primary-action" onClick={() => setAuthModalMode('login')}>Войти</button>
        <button className="rounded bg-indigo-700 px-3 py-2 text-sm light-secondary-action" onClick={() => setAuthModalMode('register')}>Регистрация</button>
        <button
          className="surface-muted rounded px-3 py-2 text-sm"
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
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative -ml-1 shrink-0" ref={displayModeMenuRef}>
          <button
            className="surface-popover light-menu-trigger inline-flex h-10 w-10 items-center justify-center rounded-md border transition hover:border-cyan-300/70"
            onClick={() => setIsDisplayModeMenuOpen((prev) => !prev)}
            aria-label="Выбрать режим отображения"
          >
            <selectedDisplayMode.icon size={20} className={selectedDisplayMode.iconClassName} />
          </button>
          {isDisplayModeMenuOpen ? (
            <div className="surface-popover light-dropdown absolute left-0 top-[calc(100%+6px)] z-30 w-44 rounded-xl border p-2 shadow-2xl backdrop-blur">
              {DISPLAY_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`light-dropdown-item flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                    option.value === displayMode
                      ? 'surface-muted text-primary light-dropdown-item-active'
                      : 'text-muted hover:brightness-110'
                  }`}
                  onClick={() => {
                    setDisplayMode(option.value);
                    setIsDisplayModeMenuOpen(false);
                  }}
                >
                  <span className="surface-muted light-dropdown-icon inline-flex h-9 w-9 items-center justify-center rounded-md border">
                    <option.icon size={18} className={option.iconClassName} />
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative -ml-1 shrink-0" ref={settingsMenuRef}>
          <button
            className="surface-popover light-menu-trigger inline-flex h-10 w-10 items-center justify-center rounded-md border text-lg transition hover:border-cyan-300/70"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            aria-label="Настройки"
            title="Настройки"
          >
            ⚙️
          </button>
          {isSettingsOpen ? (
            <div className="surface-popover light-dropdown absolute left-0 top-[calc(100%+6px)] z-30 w-72 rounded-xl border p-3 shadow-2xl backdrop-blur">
              <div className="surface-card light-dropdown-panel mb-3 rounded-lg border p-2">
                <div className="mb-2 text-xs font-medium text-primary">Тема интерфейса</div>
                <div className="grid grid-cols-2 gap-1 rounded-lg surface-muted p-1 text-xs">
                  {(['dark', 'light'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`light-dropdown-item rounded-md px-2 py-1.5 transition ${themeMode === mode ? 'bg-cyan-600 text-white shadow light-dropdown-item-active' : 'text-muted hover:brightness-110'}`}
                      onClick={() => setThemeMode(mode)}
                    >
                      {mode === 'dark' ? 'Тёмная' : 'Светлая'}
                    </button>
                  ))}
                </div>
                {themeMode === 'light' ? <p className="mt-2 text-[11px] leading-snug text-subtle">В светлой теме используется чистый системный фон, поэтому выбор фонового изображения отключён.</p> : null}
              </div>
              <div className="mb-2 text-xs text-muted">Часовой пояс пользователя</div>
              <CustomSelect
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

              <div className="mt-3 border-t border-[color:var(--panel-border)] pt-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
                  <span>Утренний ИИ-чекап</span>
                  <span className="ai-checkup-credit-badge inline-flex items-center gap-1 rounded-full border border-pink-400/30 bg-pink-500/10 px-2 py-0.5 text-[10px] text-pink-200">
                    2 <Coins size={11} /> за чекап
                  </span>
                </div>
                <p className="mb-2 text-[11px] leading-snug text-subtle">
                  Ежедневный обзор задач будет приходить в общий чат с ИИ и Telegram, если бот подключён. По умолчанию выключен у всех пользователей.
                </p>
                <CustomSelect
                  value={isMorningAiCheckupEnabled ? 'enabled' : 'disabled'}
                  onChange={(value) => {
                    const enabled = value === 'enabled';
                    setIsMorningAiCheckupEnabled(enabled);
                    void updateUserSettings({ morningAiCheckupEnabled: enabled }, 'checkupEnabled');
                  }}
                  options={[{ value: 'disabled', label: 'Выключен' }, { value: 'enabled', label: 'Включен' }]}
                  buttonClassName={settingsSavingKey === 'checkupEnabled' ? 'cursor-not-allowed opacity-60' : ''}
                  disabled={settingsSavingKey === 'checkupEnabled'}
                  ariaLabel="Утренний ИИ-чекап"
                />
                <label className="mt-2 block text-[11px] text-slate-400">
                  Время чекапа
                  <input
                    type="time"
                    className="surface-input light-dropdown-control mt-1 w-full rounded border px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    value={morningAiCheckupTime}
                    disabled={settingsSavingKey === 'checkupTime'}
                    onChange={(event) => {
                      const nextTime = event.target.value || DEFAULT_MORNING_AI_CHECKUP_TIME;
                      setMorningAiCheckupTime(nextTime);
                      void updateUserSettings({ morningAiCheckupTime: nextTime }, 'checkupTime');
                    }}
                  />
                </label>
              </div>
              {settingsError ? <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">{settingsError}</div> : null}
              <div className="mt-3 border-t border-[color:var(--panel-border)] pt-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-300">
                  <span>Уведомления от ИИ</span>
                  <span
                    className="cursor-help rounded-full border border-slate-600 px-1.5 text-[10px] text-slate-300"
                    title="ИИ-уведомления — это автоматические подсказки, когда задача просрочена: что сделать прямо сейчас, чтобы сдвинуться с места. Они помогают не терять фокус и быстрее возвращаться к важным задачам. Каждое такое уведомление списывает 1 кредит 💳."
                  >
                    ?
                  </span>
                </div>
                <CustomSelect
                  value={isAiNotificationsDefaultEnabled ? 'enabled' : 'disabled'}
                  onChange={(value) => setIsAiNotificationsDefaultEnabled(value === 'enabled')}
                  options={[{ value: 'enabled', label: 'Включены для всех задач' }, { value: 'disabled', label: 'Выключены для всех задач' }]}
                  ariaLabel="Уведомления от ИИ"
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="relative w-full min-w-52 flex-1 sm:w-auto sm:flex-none" data-sphere-filter-root="true">
          <button
            className={`light-sector-filter-trigger flex w-full items-center justify-between rounded p-2 text-left text-sm ${
              isTimelineMode ? 'cursor-not-allowed bg-slate-800/55 text-slate-500' : 'bg-slate-800'
            }`}
            disabled={isTimelineMode}
            onClick={() => setIsSphereFilterOpen((prev) => !prev)}
          >
            <span className="truncate">{sphereFilterLabel}</span>
            <span className="ml-2 text-xs text-slate-400 light-sector-filter-arrow">{isSphereFilterOpen ? '▲' : '▼'}</span>
          </button>
          {isSphereFilterOpen ? (
            <div className="light-sector-filter-panel absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-slate-700/70 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
              <label className="light-sector-filter-item mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-800/80">
                <input
                  type="checkbox"
                  checked={isAllSpheresSelected}
                  onChange={(event) => {
                    setSelectedSphereIds(event.target.checked ? spheres.map((sphere) => sphere.id) : []);
                  }}
                />
                <span>Все сектора</span>
              </label>
              <div className="max-h-44 space-y-1 overflow-y-auto">
                {spheres.map((sphere) => (
                  <label key={sphere.id} className="light-sector-filter-item flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-800/80">
                    <input
                      type="checkbox"
                      checked={selectedSphereIds.includes(sphere.id)}
                      onChange={() => toggleSphereSelection(sphere.id)}
                    />
                    <span className="truncate">{sphere.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="w-full min-w-44 flex-1 sm:w-auto sm:flex-none">
          <CustomSelect
            value={timeFilter}
            onChange={(value) => setTimeFilter(value as 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus')}
            options={[{ value: 'all', label: 'За все время' }, { value: 'today', label: 'За сегодня' }, { value: 'tomorrow', label: 'За завтра' }, { value: 'week', label: 'За эту неделю' }, { value: 'month', label: 'За этот месяц' }, { value: 'focus', label: 'Фокус' }]}
            buttonClassName={isTimelineMode ? 'cursor-not-allowed opacity-60' : ''}
            disabled={isTimelineMode}
            ariaLabel="Фильтр по времени"
          />
        </div>
        <div className="w-full min-w-52 flex-1 sm:w-auto sm:flex-none">
          <CustomSelect
            value={isBubblesMode ? 'coefficient' : rankingMode}
            onChange={(value) => setRankingMode(value as BubbleRankingMode)}
            options={isBubblesMode ? [{ value: 'coefficient', label: 'По коэффициенту' }] : [{ value: 'urgency', label: 'По срочности' }, { value: 'importance', label: 'По важности' }, { value: 'coefficient', label: 'По коэффициенту' }]}
            buttonClassName={isTimelineMode ? 'cursor-not-allowed opacity-60' : isBubblesMode ? 'cursor-default' : ''}
            disabled={isTimelineMode}
            ariaLabel="Фильтр важности"
          />
        </div>
        <div className="relative hidden md:flex items-center justify-center px-1" ref={efficiencyDetailsRef}>
          <button
            type="button"
            className="efficiency-icon-button rounded-full p-1.5"
            title={`Текущий рейтинг: ${formattedEfficiencyScore}/100 (${efficiencyGrade})`}
            onClick={() => setIsEfficiencyDetailsOpen((prev) => !prev)}
          >
            <svg width="54" height="54" viewBox="0 0 72 72" role="img" aria-label="Рейтинг эффективности" className="efficiency-orb-icon">
              <defs>
                <linearGradient id="effOrbFill" x1="10" y1="10" x2="62" y2="62"><stop offset="0%" stopColor="#38bdf8" /><stop offset="45%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#f472b6" /></linearGradient>
                <linearGradient id="effOrbRing" x1="12" y1="58" x2="60" y2="14"><stop offset="0%" stopColor="#22d3ee" /><stop offset="55%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#fb7185" /></linearGradient>
              </defs>
              <circle cx="36" cy="36" r="25" fill="url(#effOrbFill)" opacity="0.18" />
              <circle cx="36" cy="36" r="26" fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth="5" />
              <circle cx="36" cy="36" r="26" fill="none" stroke="url(#effOrbRing)" strokeWidth="5" strokeLinecap="round" pathLength={100} strokeDasharray={`${efficiencyScore} 100`} transform="rotate(-90 36 36)" />
              <path d="M36 17l5.4 12.1 13.1 1.4-9.8 8.8 2.8 12.9L36 45.5l-11.5 6.7 2.8-12.9-9.8-8.8 13.1-1.4L36 17z" fill="url(#effOrbFill)" />
            </svg>
          </button>
          {isEfficiencyDetailsOpen ? (
            <div className="efficiency-details-popover efficiency-details-popover-modern absolute left-1/2 top-[calc(100%+8px)] z-40 w-80 -translate-x-1/2 rounded-[1.6rem] border p-4 text-xs shadow-2xl backdrop-blur">
              <div className="text-center">
                <div className="efficiency-score-hero tabular-nums">{formattedEfficiencyScore}/100</div>
                <p className="mt-1 text-sm font-semibold text-primary">{efficiencyGradeMessage}</p>
              </div>
              <div className="mt-4 space-y-2">
                <div className="efficiency-detail-row"><span>Задачи</span><b>+{formatRatingDelta(efficiencyTaskRating)} рейтинга</b></div>
                <div className="efficiency-detail-row"><span>Привычки</span><b>+{formatRatingDelta(efficiencyHabitRating)} рейтинга</b></div>
                <div className="efficiency-detail-row"><span>Работа с ИИ</span><b>+{formatRatingDelta(efficiencyAiRating)} рейтинга</b></div>
                <div className="efficiency-detail-row efficiency-detail-row-focus"><span>Режим концентрации (х2)</span><b>+{formatRatingDelta(efficiencyFocusRating)} рейтинга</b></div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={openFocusSetup}
            className="focus-mode-button flex items-center gap-1 rounded px-3 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
            title="Режим концентрации с ИИ"
          >
            <Bot size={16} /> Концентрация
          </button>
          <button
            type="button"
            onClick={() => setIsSubscriptionModalOpen(true)}
            className="light-credit-badge flex items-center gap-1 rounded bg-slate-800 px-3 py-2 text-sm text-pink-300 transition hover:-translate-y-0.5 hover:bg-slate-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
            title="Посмотреть платные подписки и увеличить ИИ-кредиты"
          >
            <Coins size={15} />
            <span>{currentUser?.aiCredits ?? 100}</span>
          </button>
          <div className="add-menu-wrap relative" onMouseEnter={() => setIsAddMenuOpen(true)} onMouseLeave={() => setIsAddMenuOpen(false)}><button className="add-menu-trigger light-primary-action inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold" onClick={() => setIsAddMenuOpen((prev) => !prev)}><Plus size={16} /> Добавить</button>{isAddMenuOpen ? <div className="add-menu-popover absolute right-0 top-[calc(100%+0.5rem)] z-40 w-48 rounded-2xl border p-2 shadow-2xl"><button className="add-menu-option add-menu-option-task flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold" onClick={() => { setEditorState({ initialSphereId: spheres[0]?.id }); setIsAddMenuOpen(false); }}><FileText size={14} />Задача</button><button className="add-menu-option add-menu-option-event mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold" onClick={() => { setEditorState({ task: { id: '', title: '', description: '', status: 'TODO', importance: 3, urgency: 3, priorityScore: 0, sphereId: spheres[0]?.id ?? null, dueDate: null, parentTaskId: null, taskType: 'EVENT', location: '', notifyBeforeMinutes: 30, isRecurring: false, aiNotificationsEnabled: false } }); setIsAddMenuOpen(false); }}><CalendarDays size={14} />Событие</button></div> : null}</div>
          <button
            className="light-add-sector-button flex items-center gap-1 rounded bg-indigo-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={spheres.length >= MAX_SPHERES}
            onClick={() => setSectorEditorSphere({ id: '', name: '', color: HARMONIOUS_COLORS[0], icon: 'briefcase' })}
          >
            <Plus size={16} /> Сектор
          </button>
        </div>
      </section>


      {isFocusSetupOpen ? (
        <div className="modal-backdrop fixed inset-0 z-[135] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsFocusSetupOpen(false)}>
          <div className="focus-setup-modal dialog-surface flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
            <button className="absolute right-2 top-2 z-20 rounded-full p-2 text-muted transition hover:bg-white/60" onClick={() => setIsFocusModeOpen(false)} aria-label="Свернуть"><X size={18} /></button>
            <aside className="focus-side-panel flex min-h-0 flex-col overflow-y-auto rounded-3xl border p-4">
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
            <main className="focus-task-stack relative flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden">
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
                  <h3 className="font-semibold text-primary">Подзадачи</h3>
                  <div className="relative">
                    <button
                      type="button"
                      className={`focused-task-action-pill ${subtaskFilterMode !== 'none' ? 'focused-task-action-pill-active' : 'focused-task-action-pill-filter'}`}
                      onClick={() => setIsSubtaskFilterOpen((prev) => !prev)}
                    >
                      Фильтровать
                    </button>
                    {isSubtaskFilterOpen ? (
                      <div className="subtask-filter-panel absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur">
                        {SUBTASK_FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.mode}
                            type="button"
                            className={`subtask-filter-item block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${subtaskFilterMode === option.mode ? 'subtask-filter-item-active bg-cyan-500/25 text-cyan-100' : 'text-slate-200 hover:bg-slate-800/80'}`}
                            onClick={() => {
                              setSubtaskFilterMode(option.mode);
                              setIsSubtaskFilterOpen(false);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <ul className="focus-subtask-list mt-3 min-h-0 space-y-2 overflow-y-auto pr-1">
                  {(displayedSubtaskMap[focusActiveTask.id] ?? []).filter((subtask) => subtask.status !== 'DONE').map((subtask) => (
                    <li key={subtask.id} className={`focused-subtask-row relative flex items-center gap-2 overflow-hidden rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${closingTaskIds.includes(subtask.id) ? 'focused-subtask-row-completing ring-1 ring-emerald-300/70' : ''} ${subtaskFilterMode === 'importance' ? 'focused-subtask-row-importance' : ''}`}
                      style={subtaskFilterMode === 'importance' ? ({ '--subtask-importance-accent': IMPORTANCE_ACCENT_COLORS[subtask.importance ?? 3] ?? IMPORTANCE_ACCENT_COLORS[3] } as CSSProperties) : undefined}>
                      <input type="checkbox" checked={false} onChange={async () => { await toggleSubtaskDone(subtask); }} onClick={(event) => event.stopPropagation()} />
                      {closingTaskIds.includes(subtask.id) ? <Check size={13} className="timeline-task-chip-success shrink-0" /> : null}
                      <button type="button" className={`min-w-0 flex-1 truncate text-left hover:text-violet-700 ${closingTaskIds.includes(subtask.id) ? 'timeline-task-chip-completed line-through opacity-60 decoration-2' : ''}`} onClick={() => setEditorState({ task: subtask })}>{subtask.title}</button>
                      {subtask.dueDate ? <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-violet-500" title={`До дедлайна: ${formatDeadlineLeft(subtask.dueDate)}`}>{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
                      <InlineDateTimePickerIcon value={subtask.dueDate} title="Изменить срок подзадачи" timelineTasks={timelinePickerTasks} onChange={async (dueDate) => { await api.updateTask(subtask.id, { dueDate }); await load(); }} />
                    </li>
                  ))}
                  {(displayedSubtaskMap[focusActiveTask.id] ?? []).filter((subtask) => subtask.status !== 'DONE').length === 0 ? <li className="text-sm text-subtle">Активных подзадач пока нет.</li> : null}
                </ul>
              </motion.article>
              <button className="focus-stack-arrow absolute bottom-[4.25rem] z-10" onClick={() => switchFocusTask(1)}><ChevronDown size={22} /></button>
              <div className="focus-card-peek -mt-1">{focusTasks[(focusActiveIndex + 1) % focusTasks.length]?.title}</div>
            </main>
            <aside className="focus-ai-panel flex min-h-0 flex-col rounded-3xl border p-4">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div><div className="flex items-center gap-2"><Bot size={18} className="text-violet-600" /><h3 className="font-semibold text-primary">ИИ в контексте фокуса</h3></div><p className="mt-1 text-xs text-muted">ИИ знает выбранные задачи и текущую карточку: {focusActiveTask.title}</p></div>
                <div className="flex items-center gap-1.5">
                  <div className="surface-muted inline-flex items-center gap-1 rounded-lg border p-1 text-[11px]">
                    <button type="button" className={`ai-mode-toggle ${focusAiMode === 'fast' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`} onClick={() => setFocusAiMode('fast')}><span className="block text-left">Быстрая</span><span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span></button>
                    <button type="button" className={`ai-mode-toggle ${focusAiMode === 'smart' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`} onClick={() => setFocusAiMode('smart')}><span className="block text-left">Умная</span><span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span></button>
                  </div>
                  <button className="surface-muted rounded p-1.5 text-muted hover:brightness-110" onClick={() => setIsFocusAiExpanded(true)} title="Открыть полноразмерный диалог"><Maximize2 size={15} /></button>
                </div>
              </div>
              {!isFocusTimerRunning ? <span className="mt-2 text-[11px] text-amber-500">Доступно после запуска таймера</span> : null}
              <div ref={focusAiDialogContainerRef} className="chat-thread mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border p-3">
                {focusAiMessages.map((message) => <div key={message.id} className={`chat-message max-w-[92%] rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'chat-message-assistant mr-auto' : 'chat-message-user ml-auto'}`}><div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focus-${message.id}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focus-${message.id}` ? <Check size={12} /> : <Copy size={12} />}</button> : null}</div>{message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} /> : renderAiMessageContent(message.content)}</div>)}
                {focusAiMessages.length === 0 ? <p className="text-sm text-subtle">Запустите таймер — после этого ИИ предложит первые шаги и примет вопросы.</p> : null}
                {focusAiLoading ? <p className="text-xs text-muted">ИИ думает…</p> : null}
              </div>
              {focusAiError ? <p className="mt-2 text-xs text-rose-500">{focusAiError}</p> : null}
              {focusAiPendingFiles.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{focusAiPendingFiles.map((file) => <button key={file.name} type="button" className="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-700" onClick={() => removeFocusAiPendingFile(file.name)}>📎 {file.name} ×</button>)}</div> : null}
              <div className="mt-3"><textarea className="form-field h-20 w-full resize-none rounded-xl border p-2 text-sm disabled:opacity-60" value={focusAiDraft} onChange={(e) => setFocusAiDraft(e.target.value)} onKeyDown={(event) => { if (shouldSendAiMessageOnEnter(event)) { event.preventDefault(); void sendFocusAiQuestion(); } }} placeholder={isFocusTimerRunning ? 'Спросить по текущей задаче…' : 'Запустите таймер, чтобы писать ИИ'} disabled={!isFocusTimerRunning || focusAiLoading} /><input ref={focusAiFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleFocusAiFileSelect} /><div className="mt-2 flex items-center justify-between gap-2"><button className="secondary-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] disabled:opacity-50" disabled={!isFocusTimerRunning || focusAiLoading} onClick={() => focusAiFileInputRef.current?.click()}><Paperclip size={12} /> Прикрепить файл</button><button className="primary-button inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs disabled:opacity-50" disabled={!isFocusTimerRunning || focusAiLoading || (!focusAiDraft.trim() && focusAiPendingFiles.length === 0)} onClick={() => void sendFocusAiQuestion()}>{focusAiLoading ? <Loader2 className="animate-spin" size={13} /> : <SendHorizontal size={13} />} Отправить</button></div></div>
            </aside>
          </div>
        </div>
      ) : null}

      {isFocusModeOpen && isFocusAiExpanded && focusActiveTask ? (
        <div className="fixed inset-0 z-[151] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setIsFocusAiExpanded(false)}>
          <div className="dialog-surface flex h-[90vh] w-full max-w-5xl flex-col rounded-3xl border p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold ai-panel-title"><Bot size={18} /> Полноразмерный диалог режима концентрации</p>
                <p className="text-xs text-muted">Текущая задача: {focusActiveTask.title}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="surface-muted inline-flex items-center gap-1 rounded-lg border p-1 text-[11px]">
                  <button type="button" className={`ai-mode-toggle ${focusAiMode === 'fast' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`} onClick={() => setFocusAiMode('fast')}><span className="block text-left">Быстрая</span><span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span></button>
                  <button type="button" className={`ai-mode-toggle ${focusAiMode === 'smart' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`} onClick={() => setFocusAiMode('smart')}><span className="block text-left">Умная</span><span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span></button>
                </div>
                <button className="surface-muted rounded p-1.5 text-muted hover:brightness-110" onClick={() => setIsFocusAiExpanded(false)} title="Закрыть"><X size={16} /></button>
              </div>
            </div>
            {!isFocusTimerRunning ? <p className="mb-2 rounded-xl border border-amber-300/50 bg-amber-100/30 px-3 py-2 text-xs text-amber-700">Запустите таймер, чтобы отправлять сообщения и файлы ИИ.</p> : null}
            <div ref={focusAiExpandedDialogContainerRef} className="chat-thread min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border p-4">
              {focusAiMessages.map((message) => <div key={message.id} className={`chat-message max-w-[82%] rounded-2xl p-3 text-sm ${message.role === 'assistant' ? 'chat-message-assistant mr-auto' : 'chat-message-user ml-auto'}`}><div className="mb-1 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focus-expanded-${message.id}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focus-expanded-${message.id}` ? <Check size={12} /> : <Copy size={12} />}</button> : null}</div>{message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} /> : renderAiMessageContent(message.content)}</div>)}
              {focusAiMessages.length === 0 ? <p className="text-sm text-subtle">Запустите таймер — после этого ИИ предложит первые шаги и примет вопросы.</p> : null}
              {focusAiLoading ? <p className="text-sm text-muted">ИИ думает…</p> : null}
            </div>
            {focusAiError ? <p className="mt-2 text-xs text-rose-500">{focusAiError}</p> : null}
            {focusAiPendingFiles.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{focusAiPendingFiles.map((file) => <button key={file.name} type="button" className="rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-700" onClick={() => removeFocusAiPendingFile(file.name)}>📎 {file.name} ×</button>)}</div> : null}
            <div className="mt-3">
              <textarea className="form-field min-h-24 w-full resize-none rounded-xl border p-3 text-sm disabled:opacity-60" value={focusAiDraft} onChange={(e) => setFocusAiDraft(e.target.value)} onKeyDown={(event) => { if (shouldSendAiMessageOnEnter(event)) { event.preventDefault(); void sendFocusAiQuestion(); } }} placeholder={isFocusTimerRunning ? 'Напишите сообщение для ИИ…' : 'Запустите таймер, чтобы писать ИИ'} disabled={!isFocusTimerRunning || focusAiLoading} />
              <input ref={focusAiExpandedFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleFocusAiFileSelect} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button className="secondary-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] disabled:opacity-50" disabled={!isFocusTimerRunning || focusAiLoading} onClick={() => focusAiExpandedFileInputRef.current?.click()}><Paperclip size={12} /> Прикрепить файл</button>
                <button className="primary-button inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs disabled:opacity-50" disabled={!isFocusTimerRunning || focusAiLoading || (!focusAiDraft.trim() && focusAiPendingFiles.length === 0)} onClick={() => void sendFocusAiQuestion()}>{focusAiLoading ? <Loader2 className="animate-spin" size={13} /> : <SendHorizontal size={13} />} Отправить</button>
              </div>
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
        <div className="modal-backdrop fixed inset-0 z-[130] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSubscriptionModalOpen(false)}>
          <div className="subscription-modal dialog-surface w-full max-w-5xl overflow-hidden rounded-3xl border p-0 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="subscription-hero relative p-5 sm:p-6">
              <button className="absolute right-4 top-4 rounded-full p-2 text-muted transition hover:bg-white/10" onClick={() => setIsSubscriptionModalOpen(false)} aria-label="Закрыть окно подписки"><X size={18} /></button>
              <div className="subscription-eyebrow inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"><Sparkles size={14} /> Больше возможностей ИИ</div>
              <h2 className="mt-4 max-w-2xl text-2xl font-bold text-primary sm:text-3xl">Чтобы увеличить количество ИИ кредитов, приобретите платную подписку</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">Выберите тариф под свой сценарий: от дополнительного запаса кредитов до полного доступа к продвинутым ИИ-функциям.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const link = subscriptionLinks[plan.key]?.trim();
                return (
                  <article key={plan.key} className="subscription-plan-card flex min-h-full flex-col rounded-2xl border p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">{plan.badge}</div>
                        <h3 className="mt-2 text-xl font-bold text-primary">{plan.name}</h3>
                      </div>
                      <div className="flex h-12 min-w-[92px] items-center justify-center whitespace-nowrap rounded-2xl bg-gradient-to-br from-fuchsia-500 to-rose-500 px-3 text-sm font-bold text-white shadow-lg">{plan.price}</div>
                    </div>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-secondary">
                      {plan.features.map((feature) => (
                        <li key={feature} className="subscription-feature-pill flex items-start gap-2 rounded-xl px-3 py-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-300" /> <span>{feature}</span></li>
                      ))}
                    </ul>
                    <a
                      href={link || undefined}
                      target={link ? '_blank' : undefined}
                      rel={link ? 'noreferrer' : undefined}
                      aria-disabled={!link}
                      onClick={(event) => { if (!link) event.preventDefault(); }}
                      className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-lg transition ${link ? 'bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white hover:-translate-y-0.5 hover:shadow-fuchsia-500/25' : 'cursor-not-allowed bg-slate-500/40 text-slate-300'}`}
                    >
                      Купить подписку
                    </a>
                  </article>
                );
              })}
            </div>
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
            <div className="space-y-2">
              <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Логин" value={authLogin} onChange={(e) => setAuthLogin(e.target.value)} />
              <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Пароль" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
              {authModalMode === 'register' ? (
                <input className="form-field w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm" placeholder="Имя (для регистрации)" value={authName} onChange={(e) => setAuthName(e.target.value)} />
              ) : null}
              {authError ? <div className="text-xs text-rose-300">{authError}</div> : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="secondary-button flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm" onClick={closeAuthModal}>Отмена</button>
              <button className={`flex-1 rounded px-3 py-2 text-sm ${authModalMode === 'login' ? 'bg-cyan-700 light-primary-action' : 'bg-indigo-700 light-secondary-action'}`} onClick={submitAuth}>
                {authModalMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTelegramModalOpen ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsTelegramModalOpen(false)}>
          <div className="telegram-qr-modal relative w-full max-w-md rounded-2xl border p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
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

      <div className="relative min-h-0 flex-1 overflow-hidden pr-[320px]">
        {displayMode === 'bubbles' ? (
          <div className="relative h-full">
            <div className="bubble-layout-toggle absolute right-4 top-4 z-30 flex items-center gap-1 rounded-full border p-1 shadow-xl backdrop-blur" role="group" aria-label="Режим отображения баблов">
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
              themeMode={themeMode}
            tasks={visibleTasks}
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
            />
          </div>
        ) : displayMode === 'list' ? (
          <div ref={timelineScrollContainerRef} onWheel={(event) => { if (draggedTimelineTaskId !== null) { event.currentTarget.scrollTop += event.deltaY; } }} className="list-mode-canvas h-full overflow-y-auto rounded-[2.2rem] border p-4 backdrop-blur-sm">
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
                    className={`list-task-item relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-lg border px-3 py-2 text-sm transition ${isClosingTask ? 'list-task-item-completing ring-1 ring-emerald-300/70' : ''} ${
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
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`min-w-0 flex-1 truncate font-medium ${task.status === 'DONE' || isClosingTask ? 'timeline-task-chip-completed text-subtle line-through opacity-70 decoration-2' : 'text-primary'}`}>
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
                      <p className={`mt-1 text-[11px] ${hasOverdueState ? 'list-task-deadline-overdue' : 'text-subtle'}`}>
                        Дедлайн: {formatTaskDueDate(task.dueDate)}{task.dueDate ? ` · ${formatDeadlineLeft(task.dueDate)}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {rankingMode === 'coefficient' ? (
                        <span
                          className="list-task-coefficient-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: getCoefficientBadgeColor(taskCoefficient, themeMode) }}
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
                      <span
                        className="list-task-sector-icon inline-flex h-5 w-5 items-center justify-center rounded-full border"
                        style={{
                          borderColor: sphereColor,
                          backgroundColor: hexToRgba(sphereColor, themeMode === 'light' ? 0.36 : 0.26) ?? 'rgba(100,116,139,0.25)',
                          color: sphereColor
                        }}
                        title={taskSphere?.name ?? 'Без сектора'}
                      >
                        <SphereIcon size={12} />
                      </span>
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
                            {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
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
          <div ref={timelineScrollContainerRef} className="timeline-canvas h-full overflow-y-auto rounded-[2.2rem] border p-4 backdrop-blur-sm">
            <div className="space-y-4 pr-1">
              <section className="timeline-toolbar sticky top-0 z-20 rounded-2xl border p-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
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
                  <h3 className="timeline-title text-sm font-semibold">{timelineViewData.title}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="timeline-nav-button inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                      onClick={() => {
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
                    <button type="button" className="rounded-md border border-rose-400 bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500" onClick={() => setIsTimelineOptimizeModalOpen(true)} disabled={timelineOptimizeLoading}>
                      {timelineOptimizeLoading ? <Loader2 size={14} className="animate-spin" /> : 'Оптимизировать ✨'}
                    </button>
                    <div className="timeline-mode-switch flex items-center gap-1 rounded-lg border p-1">
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
                            onClick={() => void postponeAllOverdueByOneDay()}
                            disabled={timelineOverdueBulkPostponeLoading !== null}
                            title="Откладывает задачи на завтра на это же время"
                            aria-label="Отложить просроченные задачи на завтра на это же время"
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
                            <span className="inline-flex items-center gap-1 text-pink-100"><span>{OVERDUE_AI_POSTPONE_CREDITS_COST}</span><Coins size={10} /></span>
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
                              {getTimelineHabitsForDateHour(day.date, hour).map((habit) => renderTimelineHabitChip(habit, day.date))}
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
                <section className="timeline-panel rounded-2xl border">
                  {(() => {
                    const now = new Date();
                    const isCurrentDay = timelineAnchorDate.toDateString() === now.toDateString();
                    const lineHour = now.getHours();
                    const lineOffsetPercent = (now.getMinutes() / 60) * 100;
                    return timelineViewData.hourGroups.map((hourGroup) => (
                    <div key={hourGroup.hour} className="timeline-day-row grid grid-cols-[70px_minmax(0,1fr)] border-b last:border-b-0">
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
                                {quarter.minute === 0 ? getTimelineHabitsForDateHour(timelineAnchorDate, hourGroup.hour).map((habit) => renderTimelineHabitChip(habit, timelineAnchorDate, { showTime: true })) : null}
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside
          className="app-side-panel absolute right-0 top-0 z-10 h-full w-[320px] space-y-4 overflow-y-auto overscroll-contain border-l p-4"
          data-no-field-zoom="true"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          <section className="app-card rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Ближайшие подзадачи</h3>
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
                <li key={task.id} className="list-item-surface flex items-center gap-2 rounded border px-2 py-1" title={formatDeadlineTooltip(task)}>
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
            <div className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsUpcomingSubtasksModalOpen(false)}>
      
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
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
                className="flex h-[84vh] w-[min(1100px,95vw)] flex-col rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-700/70 px-4 py-3">
                  <h4 className="text-base font-semibold text-primary">Ближайшие подзадачи</h4>
                  <button type="button" className="surface-muted rounded p-1 text-muted transition hover:brightness-110" onClick={() => setIsUpcomingSubtasksModalOpen(false)} title="Закрыть">
                    <X size={16} />
                  </button>
                </div>
                <div className="border-b border-slate-700/70 px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                  {([
                    { key: 'today', label: 'на сегодня' },
                    { key: 'tomorrow', label: 'на завтра' },
                    { key: 'week', label: 'на неделю' },
                    { key: 'no_due', label: 'без срока' }
                  ] as const).map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`rounded-full border px-2.5 py-1 transition ${upcomingSubtasksFilter === filter.key ? 'border-cyan-400/80 bg-cyan-500/20 text-primary' : 'secondary-button'}`}
                      onClick={() => setUpcomingSubtasksFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                  </div>
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3 pr-3 text-sm">
                  {filteredUpcomingSubtasksForModal.length === 0 ? <li className="surface-muted rounded px-3 py-2 text-subtle">Нет подзадач для выбранного фильтра</li> : null}
                  {filteredUpcomingSubtasksForModal.map((subtask) => (
                    <li key={subtask.id} className={`flex items-start gap-3 rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-2 ${subtask.status !== 'DONE' && isOverdue(subtask) ? 'subtask-overdue-glow-static' : subtask.status !== 'DONE' && shouldTaskGlow(subtask) ? 'subtask-reminder-glow-static' : ''}`}>
                      <input type="checkbox" className="mt-1" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-100"><LinkifiedText text={subtask.title} stopPropagationOnLinkClick /></p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300"><LinkifiedText text={noteHtmlToPlainText(subtask.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick /></p>
                        <p className="mt-1 text-[11px] text-subtle">
                          Дедлайн: {formatTaskDueDate(subtask.dueDate)}{subtask.dueDate ? ` · ${formatDeadlineLeft(subtask.dueDate)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <InlineDateTimePickerIcon
                          value={subtask.dueDate}
                          title="Изменить срок подзадачи"
                          timelineTasks={timelinePickerTasks}
                          onChange={async (dueDate) => {
                            await api.updateTask(subtask.id, { dueDate });
                            await load();
                          }}
                        />
                        <button
                          type="button"
                          className="surface-muted rounded p-1 text-muted transition hover:brightness-110"
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
          <section className="app-card rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Выполненные задания</h3>
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
                <li key={task.id} className="list-item-surface flex items-center gap-2 rounded border px-2 py-1">
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
          <section className="app-card rounded-2xl border p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Фон рабочего пространства</h3>
              {themeMode === 'light' ? <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">Недоступно</span> : null}
            </div>
            {themeMode === 'light' ? (
              <p className="light-workspace-bg-note rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs leading-snug text-slate-300">
                В светлой теме фон фиксированный: без изображений и затемнения, чтобы все карточки, списки и таймлайн оставались равномерными и читаемыми.
              </p>
            ) : (
              <>
                <label className="mb-2 block rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700/80">
                  <span className="block font-medium">Загрузить изображение</span>
                  <span className="mt-1 block text-[11px] text-slate-400">Рекомендуемый размер: от 1920×1080 (лучше 2560×1440).</span>
                  <input type="file" accept="image/*" className="mt-2 block w-full text-[11px]" onChange={handleBackgroundUpload} />
                </label>
                <label className="mb-3 block rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs text-slate-200">
                  <span className="block font-medium">Приглушение фона: {Math.round(backgroundOverlayOpacity * 100)}%</span>
                  <input
                    type="range"
                    min={MIN_BACKGROUND_OVERLAY_OPACITY}
                    max={MAX_BACKGROUND_OVERLAY_OPACITY}
                    step={0.05}
                    value={backgroundOverlayOpacity}
                    className="mt-2 w-full"
                    onChange={(event) => setBackgroundOverlayOpacity(Number(event.target.value))}
                  />
                  <span className="mt-1 block text-[11px] text-slate-400">Меньше — фон ярче, больше — фон темнее.</span>
                </label>
                <button
                  className="w-full rounded bg-slate-700 px-3 py-1.5 text-xs disabled:opacity-50"
                  disabled={!backgroundImage}
                  onClick={() => setBackgroundImage(null)}
                >
                  Сбросить фон
                </button>
              </>
            )}
          </section>
          <section className="app-card rounded-2xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">Управление секторами</h3>
            <ul className="space-y-2 text-xs">
              {spheres.map((sphere) => {
                const Icon = resolveSphereIcon(sphere.icon);
                return (
                  <li key={sphere.id} className="light-sector-management-item flex items-center justify-between rounded bg-slate-800/70 px-2 py-1">
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
        </aside>
      </div>
      {editorState ? (
        <TaskEditor
          timelineTasks={timelinePickerTasks}
          task={editorState.task}
          subtasks={editorState.task?.id ? (subtaskMap[editorState.task.id] ?? []) : []}
          initialSphereId={editorState.initialSphereId}
          spheres={spheres}
          defaultAiNotificationsEnabled={isAiNotificationsDefaultEnabled}
          onCancel={() => setEditorState(null)}
          onSave={persistTask}
          onAutoSave={editorState.task?.id ? autosaveEditorTask : undefined}
          editorType={editorState.task?.taskType === 'EVENT' ? 'event' : 'task'}
          onGenerateWithAi={createTaskFromAi}
          parentTaskTitle={editorState.task?.parentTaskId ? (taskById.get(editorState.task.parentTaskId)?.title ?? null) : null}
          onOpenParentTask={editorState.task?.parentTaskId ? () => {
            setEditorState(null);
            setFocusedTaskId(editorState.task!.parentTaskId!);
          } : undefined}
          onComplete={editorState.task?.id ? () => completeTask(editorState.task!) : undefined}
          onDelete={editorState.task?.id ? async () => {
            await api.deleteTask(editorState.task!.id);
            setEditorState(null);
            await load();
          } : undefined}
        />
      ) : null}

      {focusedTask && focusedDraft && !(isFocusModeOpen && isFocusedNotesEditorOpen) ? (
        <div className={`fixed inset-0 ${isFocusModeOpen ? 'z-[150]' : 'z-40'} flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm`}>
          <div className="flex w-full max-w-[1380px] items-stretch justify-center gap-3">
    
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside className="app-side-panel focused-task-ai-panel relative order-2 hidden h-[min(90vh,800px)] min-h-0 w-[450px] shrink-0 flex-col overflow-hidden rounded-[2rem] border p-4 lg:flex">
              <button type="button" className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-slate-100" onClick={() => void closeFocusedTask()} aria-label="Закрыть окно"><X size={16} /></button>
              <div className="mb-3 flex shrink-0 items-start justify-between gap-3 pr-10">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold ai-panel-title"><Bot size={16} /> Помощь ИИ</p>
                  <p className="mt-1 text-xs text-muted">{focusedTask.title}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="surface-muted inline-flex items-center gap-1 rounded-lg border p-1 text-[11px]">
                    <button
                      className={`ai-mode-toggle ${focusedAiMode === 'fast' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`}
                      onClick={() => focusedTask && setAiModeByTask((prev) => ({ ...prev, [focusedTask.id]: 'fast' }))}
                      type="button"
                    >
                      <span className="block text-left">Быстрая</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                    </button>
                    <button
                      className={`ai-mode-toggle ${focusedAiMode === 'smart' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`}
                      onClick={() => focusedTask && setAiModeByTask((prev) => ({ ...prev, [focusedTask.id]: 'smart' }))}
                      type="button"
                    >
                      <span className="block text-left">Умная</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span>
                    </button>
                  </div>
                  <button
                    className={`rounded p-1.5 ${isFocusedAiSearchOpen ? 'bg-violet-600 text-white' : 'surface-muted text-muted hover:brightness-110'}`}
                    onClick={() => setIsFocusedAiSearchOpen((prev) => !prev)}
                    title="Поиск по диалогу"
                  >
                    <Search size={14} />
                  </button>
                  <button
                    className="surface-muted rounded p-1.5 text-muted hover:brightness-110"
                    onClick={() => setIsAiExpanded(true)}
                    title="Развернуть диалог"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
              <div ref={focusedAiDialogContainerRef} className="chat-thread mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl p-3">
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
                {filteredFocusedAiDialog.length === 0 ? <p className="text-xs text-subtle">{focusedAiDialog.length === 0 ? 'Спросите ИИ, как быстрее и качественнее выполнить задачу.' : 'Сообщения не найдены.'}</p> : null}
                {filteredFocusedAiDialog.map((message, index) => (
                  <div
                    key={message.id}
                    className={`chat-message max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'chat-message-assistant mr-auto' : 'chat-message-user ml-auto'}`}
                  >
                    <div className="mb-1 flex items-center justify-between"><p className="chat-message-label text-[11px] font-semibold uppercase tracking-wide">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focused-${index}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focused-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                    <div>{message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} /> : renderAiMessageContent(message.content)}</div>
                  </div>
                ))}
                {aiLoadingTaskId === focusedTask.id ? <p className="text-xs text-muted">ИИ думает…</p> : null}
              </div>
              <textarea
                className="form-field mb-2 min-h-20 w-full shrink-0 resize-none rounded-xl border px-3 py-2 text-sm leading-relaxed"
                placeholder="Например: предложи пошаговый план с оценкой времени"
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
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
                accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleAiFileSelect}
              />
              <div className="mb-2 flex items-center gap-2">
                <button
                  className="secondary-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                  type="button"
                  onClick={() => focusedAiFileInputRef.current?.click()}
                >
                  <Paperclip size={12} />
                  Прикрепить файл
                </button>
                <p className="text-[10px] text-subtle">PDF / DOCX / XLS(X) / PNG / JPG / WEBP / GIF, до 8MB</p>
              </div>
              {aiPendingFiles.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {aiPendingFiles.map((file) => (
                    <button
                      key={`ai-file-${file.name}`}
                      type="button"
                      onClick={() => removePendingAiFile(file.name)}
                      className="secondary-button inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]"
                      title="Убрать файл"
                    >
                      <Paperclip size={10} />
                      {file.name}
                      <X size={10} />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex shrink-0 items-center justify-between gap-2">
                <p className="min-h-4 text-[11px] text-rose-300">{aiError ?? ''}</p>
                <div className="flex items-center gap-2">
                  <button
                    className="primary-button rounded px-3 py-1.5 text-xs disabled:opacity-50"
                    disabled={aiLoadingTaskId === focusedTask.id}
                    onClick={() => void helpWithTask()}
                  >
                    Помочь с задачей
                  </button>
                  <button
                    className="primary-button flex items-center gap-1 rounded px-3 py-1.5 text-xs disabled:opacity-50"
                    disabled={aiLoadingTaskId === focusedTask.id}
                    onClick={() => void sendFocusedAiQuestion()}
                  >
                    <SendHorizontal size={13} />
                    Отправить
                  </button>
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <aside className="focused-task-editor-shell focus-mode-shell order-1 relative h-[min(90vh,800px)] min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border p-5">
            <button type="button" className="absolute right-16 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-slate-100 lg:hidden" onClick={() => void closeFocusedTask()} aria-label="Закрыть окно"><X size={16} /></button>
            <button type="button" className="absolute right-5 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-slate-100" onClick={() => setIsFocusedSettingsOpen((prev) => !prev)} aria-label="Открыть настройки задачи" title="Настройки задачи"><Settings size={16} /></button>
            <div className="flex h-full min-h-0 flex-col">
              <div className="focus-main-card flex min-h-0 flex-none flex-col overflow-visible rounded-[2rem] border-0 p-0 shadow-none">
                <div
                  className={`min-h-0 flex-1 overflow-y-auto px-1 ${
                    isFocusedTitleSingleLine ? 'focused-task-single-line-title' : ''
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Фокус задачи</p>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="relative min-w-0 flex-1">
                      <textarea
                        ref={focusedTaskTitleInputRef}
                        className="focused-task-title-input invisible-scrollbar min-w-0 w-full resize-none border-0 bg-transparent p-0 text-left text-3xl font-bold leading-tight text-slate-950 shadow-none outline-none"
                        value={isEditingFocusedTitle ? focusedTitleDraft : focusedDraft.title || 'Без названия'}
                        rows={isFocusedTitleSingleLine ? 1 : 2}
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
                      <button className="danger-button rounded-xl px-3 py-2 text-sm font-semibold" onClick={async () => { await api.deleteTask(focusedTask.id); setFocusedTaskId(null); await load(); }}>Удалить</button>
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
                  <div className="focused-task-description-surface mt-3 rounded-2xl p-3">
                    <textarea
                      className="focused-task-description-input subtask-description-inline invisible-scrollbar h-full min-h-[5.5rem] w-full resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-muted outline-none placeholder:text-slate-400"
                      placeholder="Введите описание"
                      value={noteHtmlToPlainText(focusedDraft.description ?? '', { trimEnd: false })}
                      onChange={(event) => setFocusedDraft((p) => ({ ...(p ?? {}), description: event.target.value }))}
                    />
                  </div>
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
                      <Plus size={15} />
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
                    accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleTaskAttachmentFileSelect}
                  />
                  {isFocusedSettingsOpen ? (
                    <div className="focused-task-settings-panel absolute right-5 top-16 z-30 w-[min(92vw,360px)] space-y-4 rounded-3xl border bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-primary">Настройки задачи</h4>
                        <button type="button" className="focused-task-icon-button h-8 w-8 border" onClick={() => setIsFocusedSettingsOpen(false)} aria-label="Закрыть настройки"><X size={14} /></button>
                      </div>
                  <div className="task-edit-compact-grid mt-4 grid grid-cols-2 items-end gap-3">
                    <label className="block text-xs font-semibold text-muted">Сектор
                      <div className="focus-sector-dropdown relative mt-1">
                        <button type="button" className="focus-sector-dropdown-button focused-task-sector-button inline-flex w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600" onClick={() => setIsFocusedSphereDropdownOpen((prev) => !prev)}>
                          {(() => {
                            const selectedSphere = spheres.find((sphere) => sphere.id === focusedDraft.sphereId);
                            return (
                              <>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedSphere?.color ?? '#7c3aed' }} />
                                <span className="min-w-0 flex-1 truncate text-left font-semibold">{selectedSphere?.name ?? 'Без сектора'}</span>
                                <ChevronDown size={14} className="shrink-0" />
                              </>
                            );
                          })()}
                        </button>
                        {isFocusedSphereDropdownOpen ? (
                          <div className="focus-sector-dropdown-menu absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-2xl">
                            {[{ id: '', name: 'Без сектора', color: '#7c3aed' }, ...spheres].map((sphere) => (
                              <button key={sphere.id || 'none'} type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-violet-50" onClick={() => { setFocusedDraft((prev) => ({ ...(prev ?? {}), sphereId: sphere.id || null })); setIsFocusedSphereDropdownOpen(false); }}>
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sphere.color }} />
                                <span className="font-medium">{sphere.name}</span>
                                {(focusedDraft.sphereId ?? '') === sphere.id ? <Check size={14} className="ml-auto text-violet-600" /> : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
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
                    <label className="block text-xs">Описание повторения
                      <textarea
                        className="form-field mt-1 min-h-16 w-full rounded border p-2 text-sm"
                        placeholder="Например: каждого 19 числа месяца в 12:00"
                        value={focusedDraft.recurrenceText ?? ''}
                        onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), recurrenceText: e.target.value }))}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" className="recurrence-submit-button rounded px-2 py-1 text-xs font-semibold" onClick={() => void applyFocusedRecurrence()} disabled={focusedRecurrenceLoading}>
                          {focusedRecurrenceLoading ? 'Отправка…' : 'Отправить'}
                        </button>
                        <p className="recurrence-summary-text text-[11px]">{focusedRecurrenceSummary ?? focusedDraft.recurrenceSummary ?? ''}</p>
                      </div>
                    </label>
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
                        className={`focused-task-action-pill ${subtaskFilterMode !== 'none' ? 'focused-task-action-pill-active' : 'focused-task-action-pill-filter'}`}
                        onClick={() => setIsSubtaskFilterOpen((prev) => !prev)}
                      >
                        Фильтровать
                      </button>
                      {isSubtaskFilterOpen ? (
                        <div className="subtask-filter-panel absolute right-0 top-[calc(100%+6px)] z-20 w-44 rounded-xl border border-slate-700/70 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur">
                          {SUBTASK_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.mode}
                              type="button"
                              className={`subtask-filter-item block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition ${subtaskFilterMode === option.mode ? 'subtask-filter-item-active bg-cyan-500/25 text-cyan-100' : 'text-slate-200 hover:bg-slate-800/80'}`}
                              onClick={() => {
                                setSubtaskFilterMode(option.mode);
                                setIsSubtaskFilterOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
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
                  values={hideClosedFocusedSubtasks ? (displayedSubtaskMap[focusedTask.id] ?? []).filter((task) => task.status !== 'DONE') : (displayedSubtaskMap[focusedTask.id] ?? [])}
                  onReorder={(nextOrder) => {
                    reorderVisibleSubtasks(focusedTask.id, nextOrder.map((task) => task.id));
                  }}
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm"
                >
                  {(hideClosedFocusedSubtasks ? (displayedSubtaskMap[focusedTask.id] ?? []).filter((task) => task.status !== 'DONE') : (displayedSubtaskMap[focusedTask.id] ?? [])).map((subtask) => (
                    <Reorder.Item
                      key={subtask.id}
                      value={subtask}
                      whileDrag={{ scale: 1.02, boxShadow: '0 14px 30px rgba(15,23,42,0.14)', zIndex: 90 }}
                      className={`focused-subtask-row relative flex items-center gap-2 overflow-hidden rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ${closingTaskIds.includes(subtask.id) ? 'focused-subtask-row-completing ring-1 ring-emerald-300/70' : ''} ${subtaskFilterMode === 'importance' ? 'focused-subtask-row-importance' : ''} ${subtask.status !== 'DONE' && isOverdue(subtask) ? 'subtask-compact-overdue-static' : subtask.status !== 'DONE' && shouldTaskGlow(subtask) ? 'subtask-compact-reminder-static' : ''}`}
                      style={subtaskFilterMode === 'importance' ? ({ '--subtask-importance-accent': IMPORTANCE_ACCENT_COLORS[subtask.importance ?? 3] ?? IMPORTANCE_ACCENT_COLORS[3] } as CSSProperties) : undefined}
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
                      {subtask.dueDate ? <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-violet-500" title={`До дедлайна: ${formatDeadlineLeft(subtask.dueDate)}`}>{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
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
                  {(hideClosedFocusedSubtasks ? (displayedSubtaskMap[focusedTask.id] ?? []).filter((task) => task.status !== 'DONE') : (displayedSubtaskMap[focusedTask.id] ?? [])).length === 0 ? <li className="text-xs text-subtle">Пока нет подзадач</li> : null}
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
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
          <div className="app-card w-full max-w-4xl rounded-3xl border p-5 shadow-[0_35px_100px_rgba(2,6,23,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold ai-panel-title"><Bot size={18} /> Полноэкранный диалог с ИИ</p>
                <p className="text-xs text-muted">{focusedTask.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="surface-muted flex items-center gap-1 rounded-lg p-1 text-[11px]">
                  <button
                    className={`ai-mode-toggle ${focusedAiMode === 'fast' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`}
                    onClick={() => focusedTask && setAiModeByTask((prev) => ({ ...prev, [focusedTask.id]: 'fast' }))}
                    title="Быстрый режим (gpt-5.4-mini)"
                  >
                    <span className="block text-left">Быстрая</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                  </button>
                  <button
                    className={`ai-mode-toggle ${focusedAiMode === 'smart' ? 'ai-mode-toggle-active' : 'ai-mode-toggle-idle'}`}
                    onClick={() => focusedTask && setAiModeByTask((prev) => ({ ...prev, [focusedTask.id]: 'smart' }))}
                    title="Умный режим (gpt-5.4-mini)"
                  >
                    <span className="block text-left">Умная</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span>
                  </button>
                </div>
                <button
                  className={`rounded p-1.5 ${isFocusedAiSearchOpen ? 'bg-violet-600 text-white' : 'surface-muted text-muted hover:brightness-110'}`}
                  onClick={() => setIsFocusedAiSearchOpen((prev) => !prev)}
                  title="Поиск по диалогу"
                >
                  <Search size={14} />
                </button>
                <button
                  className="rounded bg-rose-700/80 px-2 py-1.5 text-xs text-rose-100 hover:bg-rose-700"
                  onClick={clearFocusedAiDialog}
                  title="Очистить историю диалога по этой задаче"
                >
                  Очистить диалог
                </button>
                <button className="surface-muted rounded p-1.5 text-muted hover:brightness-110" onClick={() => setIsAiExpanded(false)} title="Свернуть">
                  <Minimize2 size={14} />
                </button>
                <button className="surface-muted rounded p-1.5 text-muted hover:brightness-110" onClick={() => { setIsAiExpanded(false); void closeFocusedTask(); }} title="Закрыть">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div ref={expandedAiDialogContainerRef} className="chat-thread mb-3 h-[60vh] space-y-3 overflow-y-auto rounded-2xl p-4">
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
              {filteredFocusedAiDialog.length === 0 ? <p className="text-sm text-subtle">{focusedAiDialog.length === 0 ? 'Спросите ИИ, как эффективнее выполнить задачу.' : 'Сообщения не найдены.'}</p> : null}
              {filteredFocusedAiDialog.map((message, index) => (
                <div
                  key={`expanded-${message.id}`}
                  className={`chat-message max-w-[72ch] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'chat-message-assistant mr-auto' : 'chat-message-user ml-auto'}`}
                >
                  <div className="mb-1 flex items-center justify-between"><p className="chat-message-label text-xs font-semibold uppercase tracking-wide">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`focused-expanded-${index}`, message.content)} className="chat-message-copy transition" title="Копировать">{copiedAiMessageKey === `focused-expanded-${index}` ? <Check size={12} className="text-muted" /> : <Copy size={12} />}</button> : null}</div>
                  <div>{message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} /> : renderAiMessageContent(message.content)}</div>
                </div>
              ))}
              {aiLoadingTaskId === focusedTask.id ? <p className="text-sm text-muted">ИИ думает…</p> : null}
            </div>
            <textarea
              className="form-field mb-2 min-h-28 w-full resize-none rounded-xl border px-3 py-2 text-sm leading-relaxed"
              placeholder="Опишите вопрос подробнее…"
              value={aiDraft}
              onChange={(event) => setAiDraft(event.target.value)}
              onKeyDown={(event) => {
                if (shouldSendAiMessageOnEnter(event)) {
                  event.preventDefault();
                  void sendFocusedAiQuestion();
                }
              }}
            />
            <input
              ref={expandedAiFileInputRef}
              type="file"
              accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleAiFileSelect}
            />
            <div className="mb-2 flex items-center gap-2">
              <button
                className="secondary-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                type="button"
                onClick={() => expandedAiFileInputRef.current?.click()}
              >
                <Paperclip size={12} />
                Прикрепить файл
              </button>
              <p className="text-[11px] text-subtle">PDF / DOCX / XLS(X) / PNG / JPG / WEBP / GIF, до 8MB</p>
            </div>
            {aiPendingFiles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {aiPendingFiles.map((file) => (
                  <button
                    key={`expanded-ai-file-${file.name}`}
                    type="button"
                    onClick={() => removePendingAiFile(file.name)}
                    className="secondary-button inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                    title="Убрать файл"
                  >
                    <Paperclip size={12} />
                    {file.name}
                    <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <p className="min-h-5 text-xs text-rose-300">{aiError ?? ''}</p>
              <div className="flex items-center gap-2">
                <button
                  className="primary-button rounded px-3 py-2 text-sm disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void helpWithTask()}
                >
                  Помочь с задачей
                </button>
                <button
                  className="primary-button flex items-center gap-1 rounded px-3 py-2 text-sm disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void sendFocusedAiQuestion()}
                >
                  <SendHorizontal size={14} />
                  Отправить ({focusedAiMode === 'fast' ? 'Быстрый' : 'Умный'})
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isUpcomingSubtasksModalOpen ? (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsUpcomingSubtasksModalOpen(false)}>
  
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
                      {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
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
            className="dialog-surface flex h-[84vh] w-full max-w-5xl flex-col rounded-3xl border p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold ai-panel-title">Ближайшие подзадачи</h4>
              <button type="button" className="surface-muted rounded p-1.5 text-muted hover:brightness-110" onClick={() => setIsUpcomingSubtasksModalOpen(false)} title="Закрыть">
                <X size={14} />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {([
                { key: 'today', label: 'на сегодня' },
                { key: 'tomorrow', label: 'на завтра' },
                { key: 'week', label: 'на неделю' },
                { key: 'no_due', label: 'без срока' }
              ] as const).map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 transition ${upcomingSubtasksFilter === filter.key ? 'border-cyan-400/80 bg-cyan-500/20 text-primary' : 'secondary-button'}`}
                  onClick={() => setUpcomingSubtasksFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <ul className="chat-thread flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl p-3 pr-2 text-sm">
              {filteredUpcomingSubtasksForModal.length === 0 ? <li className="surface-muted rounded px-3 py-2 text-subtle">Нет подзадач для выбранного фильтра</li> : null}
              {filteredUpcomingSubtasksForModal.map((subtask) => (
                <li
                  key={subtask.id}
                  className={`list-item-surface flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-all duration-200 hover:-translate-y-[1px] ${subtask.status !== 'DONE' && isOverdue(subtask) ? 'subtask-overdue-glow-static' : subtask.status !== 'DONE' && shouldTaskGlow(subtask) ? 'subtask-reminder-glow-static' : ''}`}
                  onClick={() => setEditorState({ task: subtask })}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={subtask.status === 'DONE'}
                    onClick={(event) => event.stopPropagation()}
                    onChange={async () => { await toggleSubtaskDone(subtask); }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-primary [overflow-wrap:anywhere]"><LinkifiedText text={subtask.title} stopPropagationOnLinkClick /></p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted [overflow-wrap:anywhere]"><LinkifiedText text={noteHtmlToPlainText(subtask.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick /></p>
                    <p className="mt-1 text-[11px] text-subtle">
                      Дедлайн: {formatTaskDueDate(subtask.dueDate)}{subtask.dueDate ? ` · ${formatDeadlineLeft(subtask.dueDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <InlineDateTimePickerIcon
                      value={subtask.dueDate}
                      title="Изменить срок подзадачи"
                      detachedPopup
                      timelineTasks={timelinePickerTasks}
                      onChange={async (dueDate) => {
                        await api.updateTask(subtask.id, { dueDate });
                        await load();
                      }}
                      className="surface-muted rounded p-1 hover:brightness-110"
                    />
                    <button
                      type="button"
                      className="surface-muted rounded p-1 text-muted transition hover:brightness-110"
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
        className="ai-chat-launcher group fixed bottom-8 right-6 z-[95] lg:right-[360px]"
        onMouseEnter={scheduleQuickAiChatScrollToBottom}
        onFocus={scheduleQuickAiChatScrollToBottom}
      >
        <div className="pointer-events-none absolute bottom-14 right-0 w-80 translate-y-2 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <div className="dialog-surface rounded-3xl border p-3 shadow-2xl backdrop-blur transition duration-200 hover:shadow-violet-500/20">
            <div ref={quickAiChatDialogContainerRef} className="quick-ai-chat-messages mb-2 max-h-72 space-y-2 overflow-y-auto overflow-x-hidden pr-1 text-xs">
              {quickAiChatMessages.map((message) => (
                <div key={message.id} className={`quick-ai-chat-message rounded-2xl px-3 py-2 shadow-sm ${message.role === 'user' ? 'quick-ai-chat-message-user ml-8' : 'quick-ai-chat-message-assistant mr-8'}`}>
                  <b>{message.role === 'user' ? 'Вы' : 'ИИ'}:</b> {message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} showTaskReferenceButtons /> : renderInlineAiMarkup(message.content)}
                </div>
              ))}
              {quickAiChatMessages.length === 0 ? <p className="text-subtle">Быстрый одноразовый вопрос. Хранится только последние 20 запросов.</p> : null}
            </div>
            <div className="flex gap-2">
              <input className="form-field min-w-0 flex-1 rounded-full border px-3 py-2 text-sm transition focus:ring-2 focus:ring-violet-300" value={quickAiChatDraft} onChange={(e) => setQuickAiChatDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void sendAiChatQuestion(true); } }} placeholder="Спросить быстро…" />
              <button className="rounded-full bg-violet-600 p-2 text-white shadow-lg transition hover:bg-violet-500 hover:shadow-violet-500/30 disabled:opacity-50" disabled={aiChatLoading || !quickAiChatDraft.trim()} onClick={() => void sendAiChatQuestion(true)}><SendHorizontal size={16} /></button>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="ai-chat-launcher-button flex h-14 w-14 touch-none select-none items-center justify-center rounded-full text-2xl text-white shadow-2xl transition duration-200 hover:scale-105 hover:shadow-violet-500/40 active:scale-95"
          title="Чат с ИИ"
          onClick={() => { setActiveAiChatProjectId(aiChatProjects[0]?.id ?? ''); setActiveAiChatId(QUICK_AI_CHAT_ID); setIsAiChatOpen(true); }}
        >✦</button>
      </div>

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
        <div className="modal-backdrop fixed inset-0 z-[140] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAiChatOpen(false)}>
          <div className="focus-mode-shell grid h-[min(820px,calc(100vh-32px))] w-full max-w-6xl grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-3xl border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <aside className="focus-side-panel flex min-h-0 flex-col gap-3 border-r p-4">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Проекты</p><button className="surface-muted rounded-full p-1.5 transition hover:bg-violet-100" onClick={openAiChatProjectDialog}><Plus size={14} /></button></div>
              <div className="space-y-2 overflow-y-auto pr-1">{aiChatProjects.map((project) => <div key={project.id} onContextMenu={(event) => openAiChatItemContextMenu(event, 'project', project.id)} className={`group/project flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-sm shadow-sm transition hover:bg-violet-500/10 ${project.id === activeAiChatProject?.id ? 'border-white/50 text-white' : 'surface-muted text-primary hover:shadow-lg'}`} style={project.id === activeAiChatProject?.id ? { background: `linear-gradient(135deg, ${project.color}, #7c3aed)` } : undefined}><button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setActiveAiChatProjectId(project.id); setActiveAiChatId(project.chats[0]?.id ?? ''); }}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-base">{project.icon}</span><span className="min-w-0 flex-1 truncate font-semibold">{project.title}</span></button><button className="rounded-full p-1 opacity-60 transition hover:bg-rose-500/15 hover:text-rose-300 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20" disabled={aiChatProjects.length <= 1} onClick={(e) => { e.stopPropagation(); deleteAiChatProject(project.id); }} title="Удалить проект"><Trash2 size={13} /></button></div>)}</div>
              <div className="mt-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Чаты</p><button className="surface-muted rounded-full p-1.5 transition hover:bg-cyan-100" onClick={createAiChatThread}><Plus size={14} /></button></div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{activeAiChatProject?.chats.map((chat) => <div key={chat.id} onContextMenu={(event) => { if (chat.id !== QUICK_AI_CHAT_ID) openAiChatItemContextMenu(event, 'chat', chat.id); }} className={`group/chat flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm shadow-sm transition hover:bg-cyan-500/10 ${chat.id === activeAiChat?.id ? 'border-cyan-300 bg-cyan-500/20 text-primary' : 'surface-muted text-muted hover:text-primary'}`}><button className="min-w-0 flex-1 text-left" onClick={() => setActiveAiChatId(chat.id)}><span className="block truncate font-medium">{chat.title}</span><span className="block truncate text-[11px] text-subtle">{chat.id === QUICK_AI_CHAT_ID ? 'Чат по умолчанию' : `${chat.messages.length} сообщ.`}</span></button><button className="rounded-full p-1 opacity-50 transition hover:bg-rose-500/15 hover:text-rose-400 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20" disabled={chat.id === QUICK_AI_CHAT_ID || (activeAiChatProject?.chats.length ?? 0) <= 1} onClick={(e) => { e.stopPropagation(); deleteAiChatThread(chat.id); }} title="Удалить чат"><Trash2 size={13} /></button></div>)}</div>
            </aside>
            <section className="flex min-h-0 flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700"><Sparkles size={14} /> Чат с ИИ</div><h2 className="mt-2 text-2xl font-bold text-primary">{activeAiChat?.title ?? 'Новый чат'}</h2><p className="text-sm text-muted">{activeAiChat?.id === QUICK_AI_CHAT_ID ? 'Развернутая версия быстрых запросов к ИИ. Этот чат открыт по умолчанию и не редактируется.' : 'Обычный ИИ-чат. Если запрос касается задач или расписания — ответит ИИ-планировщик.'}</p></div><button className="rounded-full p-2 text-muted transition hover:-translate-y-0.5 hover:bg-white/60" onClick={() => setIsAiChatOpen(false)}><X size={18} /></button></div>
              <div className="mb-3 flex items-center justify-between gap-3 border-t border-white/20 pt-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Модель чата</p><CustomSelect value={selectedAiChatModel} options={AI_CHAT_MODEL_OPTIONS} onChange={(value) => setSelectedAiChatModel(value as AiChatModel)} className="w-52" buttonClassName="rounded-full border-[color:var(--field-border)] bg-[color:var(--input-bg)] px-3 py-1.5 text-sm font-semibold text-primary shadow-sm hover:brightness-105" menuClassName="surface-popover text-primary" ariaLabel="Выбрать модель чата" /></div>
              <div ref={aiChatDialogContainerRef} className="chat-thread min-h-0 flex-1 space-y-4 overflow-y-auto rounded-3xl p-4">
                {(activeAiChat?.messages ?? []).length === 0 ? <p className="text-sm text-subtle">Начните диалог: задайте вопрос, обсудите идею или попросите помочь с задачами.</p> : null}
                {(activeAiChat?.messages ?? []).map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`ai-chat-message-bubble max-w-[78%] rounded-3xl px-4 py-3 shadow-lg ${message.role === 'user' ? 'ai-chat-message-user rounded-br-lg' : 'ai-chat-message-assistant rounded-bl-lg'}`}><div className="mb-1 flex items-center justify-between gap-3"><p className={`text-[11px] font-semibold uppercase tracking-wide ${message.role === 'user' ? 'ai-chat-message-label-user' : 'ai-chat-message-label-assistant'}`}>{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => copyAiMessage(`ai-chat-${message.id}`, message.content)} className="chat-message-copy rounded-full p-1 transition hover:bg-violet-100" title="Копировать ответ">{copiedAiMessageKey === `ai-chat-${message.id}` ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}</button> : null}</div><div className="text-sm leading-relaxed">{message.role === 'assistant' ? <AiMessageContentWithTaskRefs content={message.content} tasks={aiTaskReferenceTasks} onOpenTask={setFocusedTaskId} showTaskReferenceButtons /> : renderInlineAiMarkup(message.content)}</div></div></div>)}
                {aiChatLoading ? <p className="text-sm text-muted">ИИ думает…</p> : null}
                {aiChatError ? <p className="text-sm text-rose-400">{aiChatError}</p> : null}
              </div>
              <div className="ai-chat-composer mt-4 flex items-end gap-2 rounded-3xl border p-2 shadow-lg backdrop-blur"><textarea className="form-field min-h-12 flex-1 resize-none rounded-2xl border-0 bg-transparent p-3 text-sm transition focus:ring-0" value={aiChatDraft} onChange={(e) => setAiChatDraft(e.target.value)} onKeyDown={(e) => { if (shouldSendAiMessageOnEnter(e)) { e.preventDefault(); void sendAiChatQuestion(false); } }} placeholder="Напишите сообщение…" /><button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-500 hover:shadow-violet-500/30 active:scale-95 disabled:opacity-50" title="Отправить" disabled={aiChatLoading || !aiChatDraft.trim()} onClick={() => void sendAiChatQuestion(false)}><SendHorizontal size={18} /></button></div>
            </section>
          </div>
        </div>
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
