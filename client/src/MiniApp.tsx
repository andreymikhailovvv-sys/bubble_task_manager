import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { ArrowUpRight, Bot, CalendarDays, Check, CheckCircle2, ChevronDown, Coins, Copy, FileText, List, Maximize2, Menu, Minus, Moon, Palette, Paperclip, Plus, Save, Search, SendHorizontal, Settings, Smartphone, Sparkles, Sun, Ticket, Trash2, X } from 'lucide-react';
import { INSUFFICIENT_AI_CREDITS_MESSAGE, api } from './lib/api';
import { NotesEditor } from './components/NotesEditor';
import { CustomSelect } from './components/CustomSelect';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { noteHtmlToPlainText } from './lib/notes';
import type { AiChatModel, ChatAttachmentPayload, ChatMessage, Habit, HabitDurationMode, HabitRecurrenceType, Sphere, Task, TaskAttachment } from './lib/types';

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
  addToHomeScreen?: () => void;
  onEvent?: (eventType: TelegramWebAppEvent, callback: () => void) => void;
  offEvent?: (eventType: TelegramWebAppEvent, callback: () => void) => void;
  SettingsButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (callback: () => void) => void;
    offClick?: (callback: () => void) => void;
  };
};

type TelegramWebAppEvent = 'settingsButtonClicked';

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

const sendMiniAppHomeScreenLog = (event: string, data: Record<string, unknown> = {}) => {
  console.info(`[MiniAppHomeScreen] ${event}`, data);
  void api.logMiniAppClientEvent({ event: `home-screen:${event}`, data }).catch(() => {
    // ignore debug log delivery failures
  });
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
type ListSortMode = 'sector' | 'importance';
type MiniThemeMode = 'dark' | 'light';
const MAX_SHINE_WINDOW_MINUTES = 180;
const HOURS_IN_DAY = 24;
const TIMELINE_QUARTERS_PER_HOUR = 4;
const TIMELINE_QUARTER_HEIGHT = 24;
const TIMELINE_CARD_HEIGHT = 52;
const TIMELINE_SUBTASK_CARD_HEIGHT = 42;
const TIMELINE_CARD_GAP = 8;
const TIMELINE_QUARTER_PADDING = 8;
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


type MiniAiChatMessage = ChatMessage & { id: string };
type MiniAiChatThread = { id: string; title: string; messages: MiniAiChatMessage[] };
type MiniAiChatProject = { id: string; title: string; color: string; icon: string; chats: MiniAiChatThread[] };
type MiniAiChatProjectDraft = { mode: 'create' | 'edit'; projectId?: string; title: string; color: string; icon: string };

const AI_CHAT_STORAGE_KEY = 'btm:ai-chat-projects';

const QUICK_AI_CHAT_TITLE = 'Быстрые запросы';
const QUICK_AI_CHAT_PROJECT_TITLE = 'Личный проект';
const QUICK_AI_CHAT_ID = 'quick-ai-requests';

function normalizeMiniAiChatProjects(rawProjects: Array<Partial<MiniAiChatProject>> | null | undefined): MiniAiChatProject[] {
  const quickChat: MiniAiChatThread = { id: QUICK_AI_CHAT_ID, title: QUICK_AI_CHAT_TITLE, messages: [] };
  const fallback: MiniAiChatProject[] = [{ id: crypto.randomUUID(), title: QUICK_AI_CHAT_PROJECT_TITLE, color: '#8b5cf6', icon: '✨', chats: [quickChat] }];
  const source = rawProjects?.length ? rawProjects : fallback;
  const normalized = source.map((project, index) => ({
    id: project.id ?? crypto.randomUUID(),
    title: index === 0 ? QUICK_AI_CHAT_PROJECT_TITLE : (project.title ?? `Проект ${index + 1}`),
    color: project.color ?? '#8b5cf6',
    icon: project.icon ?? '✨',
    chats: (project.chats?.length ? project.chats : [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }]).map((chat, chatIndex) => ({
      id: chat.id ?? crypto.randomUUID(),
      title: chat.title ?? `Чат ${chatIndex + 1}`,
      messages: (chat.messages ?? [])
        .filter((message) => (message?.role === 'user' || message?.role === 'assistant') && typeof message?.content === 'string')
        .map((message) => ({ id: message.id ?? crypto.randomUUID(), role: message.role, content: message.content }))
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
    messages: (existingQuickChat?.messages ?? []).slice(-20)
  };
  normalized[0] = {
    ...defaultProject,
    title: QUICK_AI_CHAT_PROJECT_TITLE,
    chats: [mergedQuickChat, ...defaultProject.chats.filter((_, index) => index !== existingQuickChatIndex)]
  };
  return normalized;
}
const AI_CHAT_MODEL_OPTIONS: Array<{ value: AiChatModel; label: string; creditsCost: number }> = [
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', creditsCost: 2 },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', creditsCost: 5 },
  { value: 'gpt-5.4', label: 'GPT-5.4', creditsCost: 8 }
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
  subtasks?: CreateSubtaskDraft[];
};

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
  const lines = useMemo(() => normalizedContent.split(/\r?\n/), [normalizedContent]);

  return (
    <>
      {lines.map((line, lineIndex) => {
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
    </>
  );
}

function renderMiniAiText(content: string) {
  return content.split('\n').map((line, lineIndex) => (
    <p key={`mini-ai-line-${lineIndex}`} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) => {
        const isBold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
        if (!isBold) return <span key={`mini-ai-part-${lineIndex}-${partIndex}`}>{part}</span>;
        return <strong key={`mini-ai-part-${lineIndex}-${partIndex}`} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
      })}
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

async function fileToAttachmentPayload(file: File): Promise<ChatAttachmentPayload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return {
    name: file.name,
    mimeType: resolveAttachmentMimeType(file),
    size: file.size,
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
  const notifyBefore = Math.min(task.notifyBeforeMinutes ?? 30, MAX_SHINE_WINDOW_MINUTES) * 60_000;
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

export default function MiniApp() {
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedAiMessageKey, setCopiedAiMessageKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sphereFilter, setSphereFilter] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [listSortMode, setListSortMode] = useState<ListSortMode>('sector');
  const [miniThemeMode, setMiniThemeMode] = useState<MiniThemeMode>(() => {
    const stored = localStorage.getItem('btm:miniapp-theme-mode');
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [areHabitsExpanded, setAreHabitsExpanded] = useState(false);
  const [homeScreenHint, setHomeScreenHint] = useState<string | null>(null);
  const [hasHomeScreenApi, setHasHomeScreenApi] = useState(false);
  const [timelineNow, setTimelineNow] = useState(() => new Date());
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(() => new Date());
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);
  const [openedSubtaskId, setOpenedSubtaskId] = useState<string | null>(null);
  const [draftByTaskId, setDraftByTaskId] = useState<Record<string, TaskDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingSubtaskForId, setCreatingSubtaskForId] = useState<string | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState<HabitDraft>(() => createEmptyHabitDraft());
  const [savingHabit, setSavingHabit] = useState(false);
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
    notifyBeforeMinutes: 30,
    importance: 3,
    isRecurring: false,
    recurrenceText: '',
    recurrenceJson: null,
    recurrenceSummary: null,
    recurrenceUntil: null,
    aiNotificationsEnabled: true,
    subtasks: []
  });
  const [isCreateTaskSettingsOpen, setIsCreateTaskSettingsOpen] = useState(false);
  const [createTaskNotifyPreset, setCreateTaskNotifyPreset] = useState('30');
  const [createTaskRecurrenceLoading, setCreateTaskRecurrenceLoading] = useState(false);
  const [createTaskRecurrenceNextDueLabel, setCreateTaskRecurrenceNextDueLabel] = useState<string | null>(null);
  const [isTaskNotesEditorOpen, setIsTaskNotesEditorOpen] = useState(false);
  const [isSubtaskNotesEditorOpen, setIsSubtaskNotesEditorOpen] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);
  const [isTaskAttachmentDragActive, setIsTaskAttachmentDragActive] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const fullscreenAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);
  const lastMainScrollTopRef = useRef(0);
  const [aiDraft, setAiDraft] = useState('');
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isAiChatMenuOpen, setIsAiChatMenuOpen] = useState(false);
  const [aiChatDraft, setAiChatDraft] = useState('');
  const [aiChatPendingFiles, setAiChatPendingFiles] = useState<File[]>([]);
  const [selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-5.4-mini');
  const [aiChatLoading, setAiChatLoading] = useState(false);
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
  const [activeAiChatProjectId, setActiveAiChatProjectId] = useState(() => aiChatProjects[0]?.id ?? '');
  const [activeAiChatId, setActiveAiChatId] = useState(() => QUICK_AI_CHAT_ID);
  const aiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const aiChatFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const taskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const subtaskTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSubtaskTitleFocusIdRef = useRef<string | null>(null);
  const lastHomeScreenRequestAtRef = useRef(0);
  const [isTaskTitleSingleLine, setIsTaskTitleSingleLine] = useState(false);
  const [isSubtaskTitleSingleLine, setIsSubtaskTitleSingleLine] = useState(false);
  const launchParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId')?.trim() || null;
    const openAi = ['1', 'true', 'yes'].includes((params.get('openAi') ?? '').toLowerCase());
    return { taskId, openAi };
  }, []);

  const loadData = async (options: { showInitialLoader?: boolean } = {}) => {
    if (options.showInitialLoader ?? false) setLoading(true);
    setError(null);
    try {
      const tgWindow = window as TelegramWindow;
      const initData = tgWindow.Telegram?.WebApp?.initData?.trim() || extractInitDataFromUrl();

      if (initData) {
        console.info(`[MiniApp] Используем Telegram initData (length=${initData.length})`);
        await api.loginTelegramMiniApp({ initData });
        tgWindow.Telegram?.WebApp?.ready?.();
        tgWindow.Telegram?.WebApp?.expand?.();
      } else {
        throw new Error('Telegram initData не найден. Откройте мини-приложение из Telegram бота.');
      }

      const [sphereList, taskList, habitList, quickHistory] = await Promise.all([
        api.getSpheres(),
        api.getTasks(),
        api.getHabits(),
        api.getGeneralAssistantHistory().catch(() => ({ messages: [] as ChatMessage[] }))
      ]);
      const quickMessages: MiniAiChatMessage[] = quickHistory.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .map((message) => ({ id: crypto.randomUUID(), role: message.role, content: message.content }))
        .slice(-20);
      setAiChatProjects((prev) => normalizeMiniAiChatProjects(prev).map((project, projectIndex) => projectIndex === 0 ? {
        ...project,
        chats: project.chats.map((chat) => chat.id === QUICK_AI_CHAT_ID ? { ...chat, messages: quickMessages } : chat)
      } : project));
      setSpheres(sphereList);
      setTasks(taskList);
      setHabits(habitList);
      console.info(`[MiniApp] Данные загружены: sectors=${sphereList.length}, tasks=${taskList.length}, habits=${habitList.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить мини-приложение');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData({ showInitialLoader: true });
  }, []);

  useEffect(() => {
    const tgWindow = window as TelegramWindow;
    const tgWebApp = tgWindow.Telegram?.WebApp;
    const canAddToHomeScreen = typeof tgWebApp?.addToHomeScreen === 'function';
    setHasHomeScreenApi(canAddToHomeScreen);
    sendMiniAppHomeScreenLog('api-detected', {
      hasWebApp: Boolean(tgWebApp),
      hasAddToHomeScreen: canAddToHomeScreen,
      hasSettingsButton: Boolean(tgWebApp?.SettingsButton),
      version: tgWebApp?.version ?? null,
      platform: tgWebApp?.platform ?? null
    });
  }, []);

  const requestAddMiniAppToHomeScreen = (source: 'settings-button' | 'settings-pointer' | 'telegram-settings-menu') => {
    const requestedAt = Date.now();
    if (requestedAt - lastHomeScreenRequestAtRef.current < 250) {
      sendMiniAppHomeScreenLog('duplicate-request-skipped', { source });
      return;
    }
    lastHomeScreenRequestAtRef.current = requestedAt;

    const tgWindow = window as TelegramWindow;
    const tgWebApp = tgWindow.Telegram?.WebApp;
    sendMiniAppHomeScreenLog('request', {
      source,
      hasWebApp: Boolean(tgWebApp),
      hasAddToHomeScreen: typeof tgWebApp?.addToHomeScreen === 'function',
      version: tgWebApp?.version ?? null,
      platform: tgWebApp?.platform ?? null
    });

    if (typeof tgWebApp?.addToHomeScreen === 'function') {
      try {
        tgWebApp.addToHomeScreen();
        setHomeScreenHint(null);
        sendMiniAppHomeScreenLog('call-completed', { source });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendMiniAppHomeScreenLog('call-threw', { source, message });
        setHomeScreenHint(`Telegram вернул ошибку при открытии добавления ярлыка: ${message}`);
      }
      return;
    }

    sendMiniAppHomeScreenLog('api-unavailable', { source });
    setHomeScreenHint('В этой версии Telegram кнопка недоступна. Обновите Telegram или проверьте меню ⋯ — пункт «Создать ярлык» показывает сам клиент Telegram.');
  };

  useEffect(() => {
    const tgWebApp = (window as TelegramWindow).Telegram?.WebApp;
    if (!tgWebApp) return;

    const handleTelegramSettingsClick = () => {
      requestAddMiniAppToHomeScreen('telegram-settings-menu');
    };

    tgWebApp.SettingsButton?.show?.();
    tgWebApp.SettingsButton?.onClick?.(handleTelegramSettingsClick);
    tgWebApp.onEvent?.('settingsButtonClicked', handleTelegramSettingsClick);

    return () => {
      tgWebApp.SettingsButton?.offClick?.(handleTelegramSettingsClick);
      tgWebApp.offEvent?.('settingsButtonClicked', handleTelegramSettingsClick);
      tgWebApp.SettingsButton?.hide?.();
    };
  }, []);

  useEffect(() => {
    document.body.dataset.theme = miniThemeMode;
    document.documentElement.dataset.theme = miniThemeMode;
    localStorage.setItem('btm:miniapp-theme-mode', miniThemeMode);

    return () => {
      delete document.body.dataset.theme;
      delete document.documentElement.dataset.theme;
    };
  }, [miniThemeMode]);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyWebkitOverflowScrolling = document.body.style.getPropertyValue('-webkit-overflow-scrolling');
    const prevRootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'auto';
    document.body.style.setProperty('-webkit-overflow-scrolling', 'touch');
    document.documentElement.style.overflow = 'auto';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.setProperty('-webkit-overflow-scrolling', prevBodyWebkitOverflowScrolling);
      document.documentElement.style.overflow = prevRootOverflow;
    };
  }, []);

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
      return text.includes(query);
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
      return text.includes(query);
    });
  }, [sphereFilter, taskSearch, tasks, timeFilter]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      if (task.status === 'DONE') continue;
      if (!map[task.parentTaskId]) map[task.parentTaskId] = [];
      map[task.parentTaskId].push(task);
    }
    for (const taskId of Object.keys(map)) {
      map[taskId].sort(compareByDueDate);
    }
    return map;
  }, [tasks]);

  const subtaskProgressByParent = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      const current = map.get(task.parentTaskId) ?? { total: 0, completed: 0 };
      current.total += 1;
      if (task.status === 'DONE') current.completed += 1;
      map.set(task.parentTaskId, current);
    }
    return map;
  }, [tasks]);

  const listTasks = useMemo(() => {
    const result = filteredTasks.filter((task) => task.taskType !== 'EVENT');
    result.sort((a, b) => {
      if (listSortMode === 'importance') {
        if (a.importance !== b.importance) return b.importance - a.importance;
        return compareByDueDate(a, b);
      }

      const aSectorName = a.sphereId ? (spheres.find((item) => item.id === a.sphereId)?.name ?? 'Без сектора') : 'Без сектора';
      const bSectorName = b.sphereId ? (spheres.find((item) => item.id === b.sphereId)?.name ?? 'Без сектора') : 'Без сектора';
      const sectorCompare = aSectorName.localeCompare(bSectorName, 'ru-RU');
      if (sectorCompare !== 0) return sectorCompare;
      return compareByDueDate(a, b);
    });
    return result;
  }, [filteredTasks, listSortMode, spheres]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const timelineToday = useMemo(() => {
    const now = timelineNow;
    const anchor = timelineAnchorDate;
    const startOfDay = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const scheduledHabits = habits
      .filter((habit) => habit.reminderTime && isHabitScheduledForDate(habit, startOfDay))
      .sort((a, b) => (a.reminderTime ?? '').localeCompare(b.reminderTime ?? ''));

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
    for (const habit of scheduledHabits) {
      const [hour, minute] = (habit.reminderTime ?? '00:00').split(':').map(Number);
      const quarter = (hour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(minute / 15);
      if (quarter >= 0 && quarter < quarterItemHeights.length) quarterItemHeights[quarter].push(TIMELINE_CARD_HEIGHT);
    }

    const quarterHeights = quarterItemHeights.map((itemHeights) => itemHeights.length === 0
      ? TIMELINE_QUARTER_HEIGHT
      : itemHeights.reduce((sum, height) => sum + height, 0)
        + ((itemHeights.length - 1) * TIMELINE_CARD_GAP)
        + TIMELINE_QUARTER_PADDING);
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
    const itemsByQuarter = new Map<number, Habit[]>();

    for (const habit of timelineToday.scheduledHabits) {
      const [hour, minute] = (habit.reminderTime ?? '00:00').split(':').map(Number);
      const quarter = (hour * TIMELINE_QUARTERS_PER_HOUR) + Math.floor(minute / 15);
      const bucket = itemsByQuarter.get(quarter) ?? [];
      bucket.push(habit);
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
      const sorted = quarterHabits.slice().sort((a, b) => (a.reminderTime ?? '').localeCompare(b.reminderTime ?? ''));
      for (let index = 0; index < sorted.length; index += 1) {
        placements.set(sorted[index].id, { top: timelineToday.quarterTops[quarter] + tasksHeight + (index * (TIMELINE_CARD_HEIGHT + TIMELINE_CARD_GAP)) + 4 });
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
      let offset = 4;
      for (let index = 0; index < sorted.length; index += 1) {
        const top = timelineToday.quarterTops[quarter] + offset;
        placements.set(sorted[index].id, { top });
        offset += (sorted[index].parentTaskId ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT) + TIMELINE_CARD_GAP;
      }
    }

    return placements;
  }, [timelineToday.quarterTops, timelineToday.timelineEntries]);

  const isLightTheme = miniThemeMode === 'light';
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
  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === 'list' ? 'timeline' : 'list'));
  };

  const openTaskModal = (task: Task) => {
    setDraftByTaskId((drafts) => ({
      ...drafts,
      [task.id]: {
        title: task.title,
        description: task.description ?? '',
        dueDate: toInputDateTime(task.dueDate)
      }
    }));
    const subtasks = subtasksByParent[task.id] ?? [];
    for (const subtask of subtasks) {
      setDraftByTaskId((drafts) => ({
        ...drafts,
        [subtask.id]: {
          title: subtask.title,
          description: subtask.description ?? '',
          dueDate: toInputDateTime(subtask.dueDate)
        }
      }));
    }
    setClosingMiniWindow(null);
    setOpenedTaskId(task.id);
  };

  const openSubtaskModal = (subtask: Task, options: { focusTitle?: boolean } = {}) => {
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

  useEffect(() => {
    if (!launchParams.taskId || loading || tasks.length === 0 || openedTaskId) return;
    const requestedTask = tasks.find((task) => task.id === launchParams.taskId && !task.parentTaskId && task.status !== 'DONE');
    if (!requestedTask) return;
    openTaskModal(requestedTask);
    if (launchParams.openAi) setIsAiDialogOpen(true);
  }, [launchParams, loading, openedTaskId, tasks]);

  const closeTaskModal = () => {
    setOpenedTaskId(null);
    setOpenedSubtaskId(null);
    setIsTaskNotesEditorOpen(false);
    setIsSubtaskNotesEditorOpen(false);
    setIsAiDialogOpen(false);
    setAiDraft('');
    setTaskAttachments([]);
  };

  const onChangeDraft = (taskId: string, patch: Partial<TaskDraft>) => {
    setDraftByTaskId((prev) => ({
      ...prev,
      [taskId]: {
        title: prev[taskId]?.title ?? '',
        description: prev[taskId]?.description ?? '',
        dueDate: prev[taskId]?.dueDate ?? '',
        ...patch
      }
    }));
  };

  const saveTask = async (taskId: string) => {
    const draft = draftByTaskId[taskId];
    if (!draft) return;
    setSavingId(taskId);
    setError(null);
    try {
      await api.updateTask(taskId, {
        title: draft.title.trim() || 'Задача без названия',
        description: draft.description.trim() || null,
        dueDate: fromInputDateTime(draft.dueDate)
      });
      await loadData();
      if (taskId === openedSubtaskId) {
        setOpenedSubtaskId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить задачу');
    } finally {
      setSavingId(null);
    }
  };

  const completeTask = async (taskId: string) => {
    setCompletingId(taskId);
    setError(null);
    try {
      await api.updateTask(taskId, { status: 'DONE' });
      const completed = tasks.find((item) => item.id === taskId);
      if (completed?.parentTaskId) {
        const siblings = tasks.filter((item) => item.parentTaskId === completed.parentTaskId && item.id !== taskId);
        const allOthersDone = siblings.every((item) => item.status === 'DONE');
        if (allOthersDone) {
          const shouldCloseParent = window.confirm('Это была последняя подзадача. Закрыть основную задачу?');
          if (shouldCloseParent) await api.updateTask(completed.parentTaskId, { status: 'DONE' });
        }
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось завершить задачу');
    } finally {
      setCompletingId(null);
    }
  };

  const deleteTask = async (taskId: string) => {
    setDeletingId(taskId);
    setError(null);
    try {
      await api.deleteTask(taskId);
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

  const addSubtask = async (parentTask: Task) => {
    setCreatingSubtaskForId(parentTask.id);
    setError(null);
    try {
      const created = await api.createTask({
        title: 'Новая подзадача',
        description: null,
        parentTaskId: parentTask.id,
        sphereId: parentTask.sphereId ?? null,
        dueDate: null
      });
      setDraftByTaskId((prev) => ({
        ...prev,
        [created.id]: {
          title: '',
          description: created.description ?? '',
          dueDate: toInputDateTime(created.dueDate)
        }
      }));
      await loadData();
      openSubtaskModal(created, { focusTitle: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить подзадачу');
    } finally {
      setCreatingSubtaskForId(null);
    }
  };

  const createEmptyTaskDraft = (): TaskDraft => ({
    title: '',
    description: '',
    dueDate: '',
    sphereId: sphereFilter === 'all' || sphereFilter === 'without-sphere' ? null : sphereFilter,
    notifyBeforeMinutes: 30,
    importance: 3,
    isRecurring: false,
    recurrenceText: '',
    recurrenceJson: null,
    recurrenceSummary: null,
    recurrenceUntil: null,
    aiNotificationsEnabled: true,
    subtasks: []
  });

  const openCreateTaskModal = (dueDate?: Date) => {
    const draft = createEmptyTaskDraft();
    setCreateTaskDraft(dueDate ? { ...draft, dueDate: toInputDateTime(dueDate.toISOString()) } : draft);
    setCreateTaskNotifyPreset('30');
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

  const createTask = async () => {
    setIsCreatingTask(true);
    setError(null);
    try {
      const createdTask = await api.createTask({
        title: createTaskDraft.title.trim() || 'Новая задача',
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
        aiNotificationsEnabled: createTaskDraft.aiNotificationsEnabled ?? true
      });
      const draftSubtasks = (createTaskDraft.subtasks ?? [])
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
      await loadData();
      setIsCreateTaskModalOpen(false);
      setCreateTaskDraft(createEmptyTaskDraft());
      setIsCreateTaskSettingsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать задачу');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openCreateHabitModal = () => {
    setEditingHabitId(null);
    setHabitDraft(createEmptyHabitDraft());
    setIsCustomHabitIconOpen(false);
    setCustomHabitIconDraft('');
    setClosingMiniWindow(null);
    setIsHabitModalOpen(true);
  };

  const openEditHabitModal = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setHabitDraft(habitToDraft(habit));
    setIsCustomHabitIconOpen(!HABIT_ICON_OPTIONS.includes(habit.icon || ''));
    setCustomHabitIconDraft(HABIT_ICON_OPTIONS.includes(habit.icon || '') ? '' : (habit.icon || ''));
    setIsHabitModalOpen(true);
  };

  const closeHabitModal = () => {
    setIsHabitModalOpen(false);
    setEditingHabitId(null);
    setHabitDraft(createEmptyHabitDraft());
    setIsCustomHabitIconOpen(false);
    setCustomHabitIconDraft('');
  };

  const recordMiniAppEfficiencyBonus = async (delta: number) => {
    try {
      await api.recordEfficiencyEvent({ delta, bucket: 'habit' });
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
      closeHabitModal();
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
  const openedTaskSubtasks = openedTask ? (subtasksByParent[openedTask.id] ?? []) : [];
  const openedSubtask = openedSubtaskId
    ? tasks.find((task) => task.id === openedSubtaskId && task.status !== 'DONE') ?? null
    : null;
  const openedSubtaskDraft = openedSubtask
    ? (draftByTaskId[openedSubtask.id] ?? {
      title: openedSubtask.title,
      description: openedSubtask.description ?? '',
      dueDate: toInputDateTime(openedSubtask.dueDate)
    })
    : null;
  const openedTaskAiDialog = openedTask ? (aiDialogByTask[openedTask.id] ?? []) : [];

  useLayoutEffect(() => {
    const updateTitleRows = (textarea: HTMLTextAreaElement | null, setIsSingleLine: (value: boolean) => void) => {
      if (!textarea) return;
      const previousRows = textarea.rows;
      textarea.rows = 1;
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 36;
      setIsSingleLine(textarea.scrollHeight <= lineHeight + 4);
      textarea.rows = previousRows;
    };

    updateTitleRows(taskTitleInputRef.current, setIsTaskTitleSingleLine);
    updateTitleRows(subtaskTitleInputRef.current, setIsSubtaskTitleSingleLine);
  }, [openedTaskDraft?.title, openedSubtaskDraft?.title]);

  useEffect(() => {
    if (!openedSubtaskId || pendingSubtaskTitleFocusIdRef.current !== openedSubtaskId) return;
    pendingSubtaskTitleFocusIdRef.current = null;
    subtaskTitleInputRef.current?.focus();
  }, [openedSubtaskId]);

  const activeAiChatProject = aiChatProjects.find((project) => project.id === activeAiChatProjectId) ?? aiChatProjects[0];
  const activeAiChat = activeAiChatProject?.chats.find((chat) => chat.id === activeAiChatId) ?? activeAiChatProject?.chats[0];

  useEffect(() => {
    localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(aiChatProjects));
  }, [aiChatProjects]);



  useEffect(() => {
    aiChatDialogContainerRef.current?.scrollTo({ top: aiChatDialogContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeAiChat?.messages.length, aiChatLoading, isAiChatOpen]);

  const updateActiveAiChatMessages = (updater: (messages: MiniAiChatMessage[]) => MiniAiChatMessage[]) => {
    setAiChatProjects((prev) => prev.map((project) => project.id !== activeAiChatProject?.id ? project : {
      ...project,
      chats: project.chats.map((chat) => chat.id !== activeAiChat?.id ? chat : { ...chat, messages: updater(chat.messages) })
    }));
  };

  const sendAiChatQuestion = async () => {
    const question = aiChatDraft.trim();
    if ((!question && aiChatPendingFiles.length === 0) || aiChatLoading) return;
    const fileNames = aiChatPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiChatPendingFiles.map((file) => fileToAttachmentPayload(file)));
    } catch {
      setAiChatError('Не удалось прочитать приложенные файлы');
      return;
    }
    const userMessageContent = fileNames.length > 0
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : question;
    const userMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'user', content: userMessageContent };
    const history = activeAiChat?.messages ?? [];
    updateActiveAiChatMessages((messages) => [...messages, userMessage]);
    setAiChatDraft('');
    setAiChatPendingFiles([]);
    setAiChatLoading(true);
    setAiChatError(null);
    try {
      const result = await api.askAiChat({
        question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.',
        history,
        model: activeAiChat?.id === QUICK_AI_CHAT_ID ? 'gpt-5.4-nano' : selectedAiChatModel,
        projectTitle: activeAiChat?.id === QUICK_AI_CHAT_ID ? QUICK_AI_CHAT_PROJECT_TITLE : activeAiChatProject?.title,
        chatTitle: activeAiChat?.id === QUICK_AI_CHAT_ID ? QUICK_AI_CHAT_TITLE : activeAiChat?.title,
        attachments: attachmentsPayload
      });
      const assistantMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `${result.delegatedToPlanner ? '🧭 ИИ-планировщик\n' : ''}${normalizeMiniAiMessageContent(result.answer)}` };
      updateActiveAiChatMessages((messages) => [...messages, assistantMessage]);
      if (result.delegatedToPlanner) await loadData();
    } catch (e) {
      setAiChatError(e instanceof Error ? e.message : 'Не удалось получить ответ ИИ');
    } finally {
      setAiChatLoading(false);
    }
  };


  const handleAiChatFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setAiChatError('Можно прикреплять PDF, DOCX, XLS/XLSX и изображения (PNG/JPG/WEBP/GIF).');
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
    if (!activeAiChatProject) return;
    const chat: MiniAiChatThread = { id: crypto.randomUUID(), title: `Чат ${activeAiChatProject.chats.length + 1}`, messages: [] };
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: [chat, ...project.chats] } : project));
    setActiveAiChatId(chat.id);
  };

  const saveAiChatRename = () => {
    if (!renamingAiChatId || !activeAiChatProject) return;
    const title = aiChatRenameDraft.trim() || 'Новый чат';
    setAiChatProjects((prev) => prev.map((project) => project.id === activeAiChatProject.id ? { ...project, chats: project.chats.map((chat) => chat.id === renamingAiChatId ? { ...chat, title } : chat) } : project));
    setRenamingAiChatId(null);
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

  const deleteAiChatThread = (chatId: string) => {
    if (!activeAiChatProject || activeAiChatProject.chats.length <= 1) return;
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
    const normalized = files.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== files.length) {
      setError('Для задачи можно прикреплять только PDF, DOCX, XLS/XLSX и изображения.');
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

  const downloadTaskAttachment = (attachment: TaskAttachment) => {
    if (!openedTask) return;
    const link = document.createElement('a');
    link.href = api.getTaskAttachmentDownloadUrl(openedTask.id, attachment.id);
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    const question = aiDraft.trim();
    if (!question && aiPendingFiles.length === 0) return;
    setAiLoadingTaskId(openedTask.id);
    setError(null);
    const fileNames = aiPendingFiles.map((file) => file.name);
    let attachmentsPayload: ChatAttachmentPayload[] = [];
    try {
      attachmentsPayload = await Promise.all(aiPendingFiles.map((file) => fileToAttachmentPayload(file)));
    } catch {
      setError('Не удалось прочитать приложенные файлы');
      setAiLoadingTaskId(null);
      return;
    }
    const baseDialog = aiDialogByTask[openedTask.id] ?? [];
    const userMessage = fileNames.length > 0
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : question;
    const nextDialog: ChatMessage[] = [...baseDialog, { role: 'user', content: userMessage }];
    setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: nextDialog }));
    setAiDraft('');
    setAiPendingFiles([]);
    try {
      const result = await api.askTaskAssistant(openedTask.id, {
        question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.',
        userMessage,
        mode: selectedAiChatModel === 'gpt-5.4' ? 'smart' : 'fast',
        model: selectedAiChatModel,
        attachments: attachmentsPayload
      });
      setAiDialogByTask((prev) => ({
        ...prev,
        [openedTask.id]: [...(prev[openedTask.id] ?? nextDialog), { role: 'assistant', content: result.answer }]
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось отправить сообщение в чат ИИ';
      setError(message);
      if (message === INSUFFICIENT_AI_CREDITS_MESSAGE) {
        setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: [...nextDialog, { role: 'assistant', content: INSUFFICIENT_AI_CREDITS_MESSAGE }] }));
      } else {
        setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: baseDialog }));
      }
    } finally {
      setAiLoadingTaskId(null);
    }
  };

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) setError('Можно прикреплять PDF, DOCX, XLS/XLSX и изображения (PNG/JPG/WEBP/GIF).');
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
    const textarea = aiTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [aiDraft, isAiDialogOpen, openedTaskId]);

  useEffect(() => {
    if (!isAiDialogOpen) return;
    const scrollToBottom = (container: HTMLDivElement | null) => {
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    };
    scrollToBottom(fullscreenAiDialogContainerRef.current);
  }, [isAiDialogOpen, openedTaskId, openedTaskAiDialog.length, aiLoadingTaskId]);

  useEffect(() => {
    if (displayMode !== 'timeline' || !timelineToday.isTodayVisible) return;
    const main = mainScrollRef.current;
    const timelineGrid = timelineGridRef.current;
    if (!main || !timelineGrid) return;
    const targetTop = timelineGrid.offsetTop + timelineToday.currentTimeTop - (main.clientHeight * 0.35);
    main.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [displayMode, timelineToday.currentTimeTop, timelineToday.isTodayVisible]);

  if (loading) {
    return <main className={`miniapp-shell miniapp-scrollless h-screen overflow-y-auto p-4 text-sm ${isLightTheme ? 'miniapp-light' : 'bg-slate-950 text-slate-100'}`}>Загружаем мини-приложение…</main>;
  }

  return (
    <main
      ref={mainScrollRef}
      onScroll={(event) => {
        const nextTop = event.currentTarget.scrollTop;
        const prevTop = lastMainScrollTopRef.current;
        if (nextTop <= 8) setIsHeaderVisible(true);
        else if (nextTop > prevTop + 6) setIsHeaderVisible(false);
        else if (nextTop < prevTop - 6) setIsHeaderVisible(true);
        lastMainScrollTopRef.current = nextTop;
      }}
      className={`miniapp-shell miniapp-scrollless h-screen overflow-y-auto p-4 ${isLightTheme ? 'miniapp-light' : 'bg-slate-950 text-slate-100'}`}
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <section className={`sticky top-0 z-30 rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 backdrop-blur transition-transform duration-200 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-[130%]'}`}>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={taskSearch}
              onChange={(event) => setTaskSearch(event.target.value)}
              placeholder="Поиск по задачам"
              className="miniapp-search-input w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            </div>
            <div className="relative inline-flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openCreateTaskModal()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 transition-colors hover:bg-emerald-500/10"
                aria-label="Создать задачу"
                title="Создать задачу"
              >
                <Plus size={16} className="text-emerald-400" />
              </button>
              <button
                type="button"
                onClick={toggleDisplayMode}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 transition-colors hover:bg-sky-500/10"
                aria-label={displayMode === 'list' ? 'Переключить на таймлайн' : 'Переключить на список'}
                title={displayMode === 'list' ? 'Переключить на таймлайн' : 'Переключить на список'}
              >
                {displayMode === 'list' ? (
                  <List size={16} className="text-sky-400" />
                ) : (
                  <CalendarDays size={16} className="text-sky-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-800 transition-colors hover:bg-amber-500/10"
                aria-label="Открыть настройки"
                title="Настройки"
              >
                <Settings size={16} className="text-amber-400" />
              </button>
              {isSettingsOpen ? (
                <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-600 bg-slate-900 p-3 text-sm shadow-xl">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">Настройки</span>
                    <button type="button" onClick={() => setIsSettingsOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-800" aria-label="Закрыть настройки">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Тема мини-приложения</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMiniThemeMode('light')}
                        className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs ${isLightTheme ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-slate-600 bg-slate-800 text-slate-300'}`}
                      >
                        <Sun size={13} />
                        Светлая
                      </button>
                      <button
                        type="button"
                        onClick={() => setMiniThemeMode('dark')}
                        className={`inline-flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs ${!isLightTheme ? 'border-violet-400 bg-violet-500/20 text-violet-200' : 'border-slate-600 bg-slate-800 text-slate-300'}`}
                      >
                        <Moon size={13} />
                        Тёмная
                      </button>
                    </div>
                    <div className={`border-t pt-2 ${isLightTheme ? 'border-slate-200' : 'border-slate-700'}`}>
                      <p className={`mb-2 text-xs ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>Ярлык на главном экране</p>
                      <button
                        type="button"
                        onClick={() => requestAddMiniAppToHomeScreen('settings-button')}
                        className={`inline-flex w-full items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs font-medium transition ${
                          isLightTheme
                            ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                            : 'border-sky-500/60 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25'
                        }`}
                      >
                        <Smartphone size={13} />
                        Добавить ярлык
                      </button>
                      {!hasHomeScreenApi && homeScreenHint ? (
                        <p className="mt-2 text-[11px] leading-snug text-slate-500">{homeScreenHint}</p>
                      ) : null}
                    </div>
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
          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h2 className="text-lg font-semibold">Привычки</h2>
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

          <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Список задач</h2>
              <div className="flex items-center gap-2">
                <CustomSelect
                  className="min-w-32"
                  value={listSortMode}
                  onChange={(value) => setListSortMode(value as ListSortMode)}
                  options={[{ value: 'sector', label: 'По секторам' }, { value: 'importance', label: 'По важности' }]}
                  buttonClassName="h-8 px-2 py-1 text-xs"
                  ariaLabel="Сортировка задач"
                />
                <CustomSelect
                  className="min-w-32"
                  value={timeFilter}
                  onChange={(value) => setTimeFilter(value as TimeFilter)}
                  options={[{ value: 'all', label: 'За все время' }, { value: 'today', label: 'Сегодня' }, { value: 'tomorrow', label: 'Завтра' }, { value: 'week', label: 'Неделя' }]}
                  buttonClassName="h-8 px-2 py-1 text-xs"
                  ariaLabel="Фильтр по времени"
                />
              </div>
            </div>

            {listTasks.length === 0 ? (
              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-4 text-sm text-slate-300">Задачи не найдены.</div>
            ) : null}

            {listTasks.map((task) => {
              const isEvent = task.taskType === 'EVENT';
              const hasOverdueState = !isEvent && isOverdue(task);
              const hasReminderState = !isEvent && !hasOverdueState && shouldTaskGlow(task);
              const taskSubtasks = subtasksByParent[task.id] ?? [];
              const hasOverdueSubtaskState = !hasOverdueState && taskSubtasks.some((subtask) => isOverdue(subtask));
              const hasReminderSubtaskState = !hasOverdueState && !hasReminderState && !hasOverdueSubtaskState && taskSubtasks.some((subtask) => shouldTaskGlow(subtask));
              const taskSphereColor = task.sphereId ? spheres.find((item) => item.id === task.sphereId)?.color ?? null : null;
              const importanceColors: Record<number, string> = {
                1: 'rgba(148,163,184,0.95)',
                2: 'rgba(56,189,248,0.95)',
                3: 'rgba(34,197,94,0.95)',
                4: 'rgba(251,191,36,0.95)',
                5: 'rgba(248,113,113,0.95)'
              };
              const leftStripeColor = listSortMode === 'sector'
                ? (hexToRgba(taskSphereColor ?? '', 0.95) ?? 'rgba(100,116,139,0.95)')
                : (importanceColors[task.importance] ?? importanceColors[3]);
              const subtaskProgress = subtaskProgressByParent.get(task.id);
              const hasSubtasks = Boolean(subtaskProgress && subtaskProgress.total > 0);
              const progressPercent = hasSubtasks
                ? Math.round(((subtaskProgress?.completed ?? 0) / (subtaskProgress?.total ?? 1)) * 100)
                : 0;
              const taskCardStyle: CSSProperties & Record<'--miniapp-task-stripe', string> = isEvent
                ? { '--miniapp-task-stripe': 'rgba(245,158,11,0.95)', borderColor: 'rgba(245,158,11,0.72)', borderLeftWidth: '1px', borderLeftColor: 'rgba(245,158,11,0.95)' }
                : hasOverdueState
                  ? { '--miniapp-task-stripe': leftStripeColor, boxShadow: '0 0 15px rgba(239,68,68,0.78), inset 0 0 10px rgba(239,68,68,0.34)', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                  : hasReminderState
                    ? { '--miniapp-task-stripe': leftStripeColor, boxShadow: '0 0 15px rgba(56,189,248,0.72), inset 0 0 10px rgba(56,189,248,0.3)', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                    : hasOverdueSubtaskState
                      ? { '--miniapp-task-stripe': leftStripeColor, boxShadow: '0 0 11px rgba(239,68,68,0.38), inset 0 0 8px rgba(239,68,68,0.16)', backgroundColor: 'rgba(127,29,29,0.18)', borderColor: 'rgba(248,113,113,0.46)', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                      : hasReminderSubtaskState
                        ? { '--miniapp-task-stripe': leftStripeColor, boxShadow: '0 0 11px rgba(56,189,248,0.34), inset 0 0 8px rgba(56,189,248,0.14)', backgroundColor: 'rgba(8,47,73,0.18)', borderColor: 'rgba(103,232,249,0.42)', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                        : { '--miniapp-task-stripe': leftStripeColor, borderLeftWidth: '4px', borderLeftColor: leftStripeColor };

              return (
                <article
                  key={task.id}
                  className={`miniapp-task-list-card border border-slate-700 bg-slate-800/80 p-3 ${isEvent ? 'miniapp-task-list-event-card rounded-lg' : 'rounded-lg'}`}
                  style={taskCardStyle}
                >
                  <button
                    type="button"
                    className="relative flex w-full items-start gap-2 text-left"
                    onClick={() => openTaskModal(task)}
                  >
                    <div className="min-w-0 flex-1 pr-8">
                      <h3 className="flex items-center gap-1 font-medium">{isEvent ? <Ticket size={14} className="shrink-0 text-amber-500" /> : null}<span className="truncate">{task.title}</span></h3>
                      <p className="mt-1 text-xs text-slate-300">{isEvent ? 'Событие' : 'Дедлайн'}: {formatDueDate(task.dueDate)}</p>
                      <p className="text-xs text-sky-200">{formatRemaining(task.dueDate)}</p>
                    </div>
                    <ChevronDown size={18} className="absolute right-0 top-0 shrink-0" />
                    {hasSubtasks ? (
                      <span
                        className="miniapp-subtask-progress pointer-events-none absolute bottom-0 right-0 block h-4 w-4 shrink-0 rounded-full border border-slate-500/80"
                        style={{ background: `conic-gradient(rgb(34 197 94) ${progressPercent}%, rgba(51,65,85,0.75) ${progressPercent}% 100%)` }}
                        title={`Подзадачи: ${subtaskProgress?.completed ?? 0}/${subtaskProgress?.total ?? 0}`}
                        aria-label={`Прогресс подзадач: ${subtaskProgress?.completed ?? 0} из ${subtaskProgress?.total ?? 0}`}
                      >
                        <span className="miniapp-subtask-progress-core absolute inset-[3px] rounded-full bg-slate-800/95" />
                      </span>
                    ) : null}
                  </button>
                </article>
              );
            })}
          </section>
          </div>
        ) : (

          <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Таймлайн задач</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1">{timelineToday.anchorLabel}</span>
                <button type="button" onClick={() => setTimelineAnchorDate((prev) => { const next = new Date(prev); next.setDate(next.getDate() - 1); return next; })} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1">←</button>
                <button type="button" onClick={() => setTimelineAnchorDate((prev) => { const next = new Date(prev); next.setDate(next.getDate() + 1); return next; })} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1">→</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                <div className="relative overflow-x-hidden">
                  <div ref={timelineGridRef} className="relative" style={{ height: `${timelineToday.totalHeight}px` }}>
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
                      const hour = Math.floor(quarterIndex / TIMELINE_QUARTERS_PER_HOUR);
                      const minute = (quarterIndex % TIMELINE_QUARTERS_PER_HOUR) * 15;
                      const isHour = minute === 0;
                      return (
                      <div key={`quarter-${quarterIndex}`} className={`miniapp-timeline-quarter-line absolute inset-x-0 border-t ${isHour ? 'border-slate-700/80' : 'border-slate-700/35'}`} style={{ top: `${top}px` }}>
                        <span className={`${isHour ? 'miniapp-timeline-hour-label text-xs text-slate-400' : 'miniapp-timeline-quarter-label text-[10px] text-slate-500'} absolute left-0 bg-slate-950/80 px-1`}>
                          {isHour ? `${hour.toString().padStart(2, '0')}:00` : `:${minute.toString().padStart(2, '0')}`}
                        </span>
                      </div>
                      );
                    })}
                    <div className="absolute inset-x-0 border-t border-slate-700/80" style={{ top: `${timelineToday.totalHeight - 1}px` }} />
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
                      const hasOverdueState = !isEvent && isOverdue(task);
                      const isSubtask = Boolean(task.parentTaskId);
                      const parentTask = task.parentTaskId ? (taskById.get(task.parentTaskId) ?? null) : null;
                      const taskForSectorColor = parentTask ?? task;
                      const sphereColor = taskForSectorColor.sphereId ? spheres.find((item) => item.id === taskForSectorColor.sphereId)?.color ?? null : null;
                      const placement = timelineTaskPlacements.get(task.id) ?? { top: timelineToday.quarterTops[taskQuarter] + 4 };
                      return (
                        <button
                          type="button"
                          key={task.id}
                          className={`miniapp-timeline-task-card absolute border px-2 py-1 text-left ${isSubtask ? 'miniapp-timeline-subtask-card' : ''} ${isEvent ? 'miniapp-timeline-event-card rounded-lg' : 'rounded-lg'}`}
                          style={{
                            top: `${placement.top}px`,
                            height: `${isSubtask ? TIMELINE_SUBTASK_CARD_HEIGHT : TIMELINE_CARD_HEIGHT}px`,
                            left: 'calc(4rem + 2px)',
                            width: 'calc(100% - 4rem - 8px)',
                            zIndex: 10,
                            borderColor: isEvent
                              ? 'rgba(245,158,11,0.9)'
                              : isSubtask
                                ? (isLightTheme ? 'rgba(148,163,184,0.95)' : 'rgba(100,116,139,0.9)')
                                : (hexToRgba(sphereColor ?? '', isLightTheme ? 0.62 : 0.8) ?? (isLightTheme ? 'rgba(14,165,233,0.45)' : 'rgba(56,189,248,0.35)')),
                            background: isEvent
                              ? (isLightTheme ? 'rgba(254,243,199,0.96)' : 'rgba(146,64,14,0.42)')
                              : isSubtask
                                ? (isLightTheme ? 'rgba(248,250,252,0.94)' : 'rgba(71,85,105,0.82)')
                                : (hexToRgba(sphereColor ?? '', isLightTheme ? 0.15 : 0.25) ?? (isLightTheme ? 'rgba(224,242,254,0.94)' : 'rgba(14,165,233,0.18)')),
                            borderLeftWidth: isSubtask ? '4px' : '1px',
                            borderLeftColor: isSubtask
                              ? (hexToRgba(sphereColor ?? '', 0.95) ?? 'rgba(56,189,248,0.95)')
                              : isEvent
                                ? 'rgba(245,158,11,0.9)'
                                : (hexToRgba(sphereColor ?? '', 0.8) ?? 'rgba(56,189,248,0.35)'),
                            boxShadow: hasOverdueState ? (isLightTheme ? '0 10px 28px rgba(225,29,72,0.18)' : '0 0 12px rgba(239,68,68,0.45)') : undefined
                          }}
                          onClick={() => {
                            if (isSubtask) {
                              openSubtaskModal(task);
                              return;
                            }
                            openTaskModal(task);
                          }}
                        >
                          <p className={`flex items-center gap-1 truncate font-medium ${isSubtask ? 'text-xs leading-4' : 'text-sm'}`}>{isEvent ? <Ticket size={13} className="shrink-0 text-amber-500" /> : null}<span className="truncate">{task.title}</span></p>
                          <p className={isSubtask ? 'text-[10px] leading-3 text-slate-300' : 'text-xs text-slate-300'}>{isEvent ? 'Событие · ' : isSubtask ? 'Подзадача · ' : ''}{formatDueDate(task.dueDate)}</p>
                        </button>
                      );
                    })}
                    {timelineToday.scheduledHabits.map((habit) => {
                      const placement = timelineHabitPlacements.get(habit.id) ?? { top: 4 };
                      const completed = getHabitCompletedForDate(habit, timelineToday.dateKey);
                      const progress = Math.round((Math.min(completed, habit.targetCount) / Math.max(1, habit.targetCount)) * 100);
                      return (
                        <button
                          type="button"
                          key={`timeline-habit-${habit.id}`}
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
                              <p className="miniapp-timeline-habit-meta text-xs">Привычка · {(habit.reminderTimes?.join(', ') || habit.reminderTime) ?? '—'} · {completed}/{habit.targetCount}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {openedTask && openedTaskDraft ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[90] flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('task')}`}>
          <div className="miniapp-slide-panel miniapp-focus-panel miniapp-focus-task-panel max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[2rem]">
            <div className="flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Фокус задачи</p>
                <button type="button" onClick={() => closeMiniWindowWithMotion('task', closeTaskModal)} className="miniapp-focus-icon-button" aria-label="Закрыть окно">
                  <X size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <textarea
                  ref={taskTitleInputRef}
                  value={openedTaskDraft.title}
                  onChange={(event) => onChangeDraft(openedTask.id, { title: event.target.value })}
                  className={`miniapp-focus-title-input invisible-scrollbar w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none ${isTaskTitleSingleLine ? 'min-h-[2.15rem]' : 'min-h-[4.5rem]'}`}
                  rows={isTaskTitleSingleLine ? 1 : 2}
                  placeholder="Без названия"
                />
                <div className={`${isTaskTitleSingleLine ? '-mt-[0.15rem]' : 'mt-2'} flex items-center gap-2 text-sm font-semibold text-violet-500`}>
                  <span>{openedTaskDraft.dueDate ? `До дедлайна: ${formatRemaining(openedTaskDraft.dueDate)}` : 'Дедлайн не задан'}</span>
                </div>
                <div className="miniapp-focus-description-surface mt-3 rounded-2xl px-3 pb-1 pt-2">
                  <textarea
                    value={noteHtmlToPlainText(openedTaskDraft.description, { trimEnd: false })}
                    onChange={(event) => onChangeDraft(openedTask.id, { description: event.target.value })}
                    className="miniapp-focus-description-input invisible-scrollbar min-h-32 w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                    placeholder="Введите описание"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DateTimePickerWithApply
                    value={fromInputDateTime(openedTaskDraft.dueDate)}
                    onChange={(nextValue) => onChangeDraft(openedTask.id, { dueDate: toInputDateTime(nextValue) })}
                    timelineTasks={tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, isSubtask: Boolean(task.parentTaskId), sphereColor: spheres.find((sphere) => sphere.id === task.sphereId)?.color ?? null, taskType: task.taskType }))}
                    iconOnly
                    detachedPopup
                    buttonClassName="miniapp-focus-icon-button"
                  />
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
                    title="Добавить файлы к задаче"
                    aria-label="Добавить файлы к задаче"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <input ref={taskAttachmentInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleTaskAttachmentFileSelect} />
                {taskAttachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {taskAttachments.map((attachment) => (
                      <div key={attachment.id} className="miniapp-focus-attachment-pill inline-flex max-w-[210px] items-center gap-1 rounded-xl border px-2 py-1 text-[11px]">
                        <button type="button" title={`${attachment.name} • скачать`} onClick={() => downloadTaskAttachment(attachment)} className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5">
                          <FileText size={12} className="shrink-0" />
                          <span className="truncate">{attachment.name}</span>
                        </button>
                        <button type="button" title="Удалить файл" onClick={() => void removeTaskAttachment(attachment.id)} className="rounded-md p-0.5 hover:bg-rose-600/80 hover:text-white">
                          <X size={11} className="shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {isTaskNotesEditorOpen ? <NotesEditor value={openedTaskDraft.description} onChange={(description) => onChangeDraft(openedTask.id, { description })} onClose={() => setIsTaskNotesEditorOpen(false)} /> : null}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => void saveTask(openedTask.id)} disabled={savingId === openedTask.id} className="miniapp-focus-primary-button">
                    <Save size={14} /> {savingId === openedTask.id ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                  <button type="button" onClick={() => void completeTask(openedTask.id)} disabled={completingId === openedTask.id} className="miniapp-focus-success-button">
                    <CheckCircle2 size={14} /> {completingId === openedTask.id ? '...' : 'Выполнить'}
                  </button>
                  <button type="button" onClick={() => void deleteTask(openedTask.id)} disabled={deletingId === openedTask.id} className="miniapp-focus-danger-button">
                    <Trash2 size={14} /> {deletingId === openedTask.id ? '...' : 'Удалить'}
                  </button>
                </div>
                <button type="button" onClick={() => setIsAiDialogOpen(true)} className="miniapp-focus-ai-dialog-button mt-2 w-full">
                  <Bot size={16} /> Открыть диалог с ИИ
                </button>

                <div className="miniapp-focus-subtasks mt-4 flex min-h-0 flex-col space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">Подзадачи</h3>
                    <button type="button" onClick={() => void addSubtask(openedTask)} disabled={creatingSubtaskForId === openedTask.id} className="miniapp-focus-action-pill">
                      <Plus size={13} /> {creatingSubtaskForId === openedTask.id ? 'Добавляем…' : 'Добавить'}
                    </button>
                  </div>
                  {openedTaskSubtasks.length === 0 ? <p className="text-xs text-slate-400">Пока нет подзадач</p> : null}
                  <div className="space-y-2">
                    {openedTaskSubtasks.map((subtask) => {
                      return (
                        <article key={subtask.id} className={`miniapp-focus-subtask-row rounded-xl px-3 py-2 text-sm ${subtask.status === 'DONE' ? 'opacity-60' : ''}`}>
                          <button type="button" onClick={() => openSubtaskModal(subtask)} className="flex w-full items-center gap-2 text-left">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                            <span className="min-w-0 flex-1 truncate font-medium">{subtask.title}</span>
                            {subtask.dueDate ? <span className="shrink-0 text-xs font-semibold text-violet-500">{formatSubtaskRelativeDeadline(subtask.dueDate)}</span> : null}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {openedSubtask && openedSubtaskDraft ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[100] flex items-end bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('subtask')}`} onClick={() => closeMiniWindowWithMotion('subtask', () => setOpenedSubtaskId(null))}>
          <div className="miniapp-slide-panel miniapp-focus-panel max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] border p-4 shadow-2xl sm:max-w-xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Редактирование подзадачи</p>
                <p className="mt-1 text-xs text-slate-400">Минимальная карточка с описанием и сроком</p>
              </div>
              <button type="button" onClick={() => closeMiniWindowWithMotion('subtask', () => setOpenedSubtaskId(null))} className="miniapp-focus-icon-button" aria-label="Закрыть окно подзадачи">
                <X size={16} />
              </button>
            </div>
            <textarea
              ref={subtaskTitleInputRef}
              value={openedSubtaskDraft.title}
              onChange={(event) => onChangeDraft(openedSubtask.id, { title: event.target.value })}
              className={`miniapp-focus-title-input invisible-scrollbar w-full resize-none border-0 bg-transparent p-0 text-2xl font-bold leading-tight outline-none ${isSubtaskTitleSingleLine ? 'min-h-[1.9rem]' : 'min-h-[3.8rem]'}`}
              rows={isSubtaskTitleSingleLine ? 1 : 2}
              placeholder="Название подзадачи"
            />
            <div className="miniapp-focus-description-surface mt-3 rounded-2xl px-3 pb-1 pt-2">
              <textarea
                value={noteHtmlToPlainText(openedSubtaskDraft.description, { trimEnd: false })}
                onChange={(event) => onChangeDraft(openedSubtask.id, { description: event.target.value })}
                className="miniapp-focus-description-input invisible-scrollbar min-h-28 w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none placeholder:text-slate-400"
                placeholder="Описание подзадачи"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-violet-500">
                {openedSubtaskDraft.dueDate ? formatSubtaskRelativeDeadline(fromInputDateTime(openedSubtaskDraft.dueDate)) : 'Срок не задан'}
              </span>
              <DateTimePickerWithApply
                value={fromInputDateTime(openedSubtaskDraft.dueDate)}
                onChange={(nextValue) => onChangeDraft(openedSubtask.id, { dueDate: toInputDateTime(nextValue) })}
                timelineTasks={tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, isSubtask: Boolean(task.parentTaskId), sphereColor: spheres.find((sphere) => sphere.id === task.sphereId)?.color ?? null, taskType: task.taskType }))}
                iconOnly
                detachedPopup
                buttonClassName="miniapp-focus-icon-button"
              />
              <button type="button" className="miniapp-focus-icon-button" onClick={() => setIsSubtaskNotesEditorOpen(true)} title="Открыть заметки" aria-label="Открыть заметки">
                <Maximize2 size={15} />
              </button>
            </div>
            {isSubtaskNotesEditorOpen ? <NotesEditor value={openedSubtaskDraft.description} onChange={(description) => onChangeDraft(openedSubtask.id, { description })} onClose={() => setIsSubtaskNotesEditorOpen(false)} /> : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => void saveTask(openedSubtask.id)} disabled={savingId === openedSubtask.id} className="miniapp-focus-primary-button">
                <Save size={14} /> {savingId === openedSubtask.id ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button type="button" onClick={() => void completeTask(openedSubtask.id)} disabled={completingId === openedSubtask.id} className="miniapp-focus-success-button">
                <CheckCircle2 size={14} /> {completingId === openedSubtask.id ? '...' : 'Выполнить'}
              </button>
              <button type="button" onClick={() => void deleteTask(openedSubtask.id)} disabled={deletingId === openedSubtask.id} className="miniapp-focus-danger-button">
                <Trash2 size={14} /> {deletingId === openedSubtask.id ? '...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {openedTask && isAiDialogOpen ? (
        <div className={`miniapp-ai-chat-backdrop miniapp-slide-backdrop fixed inset-0 z-[110] bg-slate-950/75 p-0 backdrop-blur-sm ${getMiniWindowMotionClass('task-ai')}`}>
          <div className="miniapp-ai-chat-panel miniapp-slide-panel mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-none border-y border-violet-500/30 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="miniapp-ai-chat-header flex items-center justify-between gap-2 border-b border-slate-800 p-3">
              <h2 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-primary">Помощь ИИ</h2>
              <button type="button" onClick={() => closeMiniWindowWithMotion('task-ai', () => setIsAiDialogOpen(false))} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Закрыть диалог с ИИ"><X size={18} /></button>
            </div>
            <div className="miniapp-ai-chat-thread-wrap relative min-h-0 flex-1">
              <select value={selectedAiChatModel} onChange={(event) => setSelectedAiChatModel(event.target.value as AiChatModel)} className="miniapp-ai-chat-select miniapp-ai-chat-model-cap absolute left-1/2 top-0 z-10 w-40 -translate-x-1/2 rounded-b-xl rounded-t-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold" aria-label="Выбрать модель помощи ИИ">
                {AI_CHAT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div ref={fullscreenAiDialogContainerRef} className="miniapp-ai-chat-thread h-full min-h-0 space-y-3 overflow-y-auto p-3">
                {openedTaskAiDialog.length === 0 ? <p className="miniapp-ai-chat-empty rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-400">История пока пустая. Спросите ИИ, как эффективнее выполнить задачу.</p> : null}
                {openedTaskAiDialog.map((message, index) => (
                  <div key={`mini-ai-full-${index}`} className={`miniapp-ai-chat-message max-w-[88%] rounded-3xl px-4 py-3 shadow-lg ${message.role === 'user' ? 'miniapp-ai-chat-message-user ml-auto rounded-br-lg' : 'miniapp-ai-chat-message-assistant mr-auto rounded-bl-lg'}`}>
                    <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`compact-${index}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `compact-${index}` ? null : prev)), 1300); }} className="text-slate-300" title="Копировать">{copiedAiMessageKey === `compact-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                    <div className="text-sm leading-relaxed">{message.role === 'assistant' ? <MiniAiMessageContentWithTaskRefs content={message.content} tasks={tasks} onOpenTask={openTaskModal} /> : renderMiniAiText(message.content)}</div>
                  </div>
                ))}
                {aiLoadingTaskId === openedTask.id ? <p className="text-sm text-cyan-200">ИИ думает…</p> : null}
              </div>
            </div>
            <div className="miniapp-ai-chat-composer border-t border-slate-800 p-3">
              <input
                ref={aiAttachmentInputRef}
                type="file"
                accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleAiFileSelect}
              />
              {aiPendingFiles.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {aiPendingFiles.map((file) => (
                    <button key={`mini-ai-file-full-${file.name}-${file.size}`} type="button" className="miniapp-ai-file-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}>
                      <Paperclip size={10} />
                      <span className="max-w-[190px] truncate">{file.name}</span>
                      <X size={10} />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="miniapp-ai-chat-composer-card flex items-end gap-2 rounded-3xl border p-2 shadow-lg backdrop-blur">
                <textarea
                  ref={aiTextareaRef}
                  value={aiDraft}
                  onChange={(event) => setAiDraft(event.target.value)}
                  placeholder="Напишите сообщение…"
                  rows={1}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  className="miniapp-ai-chat-input max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm leading-6 focus:outline-none focus:ring-0"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void sendAiMessage();
                    }
                  }}
                />
                <button type="button" className="miniapp-ai-chat-attach flex h-11 w-11 shrink-0 items-center justify-center rounded-full" onClick={() => aiAttachmentInputRef.current?.click()} aria-label="Прикрепить файл" title="Прикрепить файл">
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => void sendAiMessage()}
                  disabled={aiLoadingTaskId === openedTask.id || (!aiDraft.trim() && aiPendingFiles.length === 0)}
                  className="miniapp-ai-chat-send flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
                  aria-label="Отправить сообщение"
                  title="Отправить"
                >
                  <SendHorizontal size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => { setClosingMiniWindow(null); setActiveAiChatProjectId(aiChatProjects[0]?.id ?? ''); setActiveAiChatId(QUICK_AI_CHAT_ID); setIsAiChatOpen(true); setIsAiChatMenuOpen(false); }}
        className="miniapp-ai-chat-launcher fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xl text-white shadow-2xl shadow-violet-950/40 ring-2 ring-white/20 active:scale-95"
        aria-label="Открыть чат с ИИ"
      >✦</button>

      {isAiChatOpen ? (
        <div className={`miniapp-ai-chat-backdrop miniapp-slide-backdrop fixed inset-0 z-[70] bg-slate-950/75 p-0 backdrop-blur-sm ${getMiniWindowMotionClass('ai-chat')}`}>
          <div className="miniapp-ai-chat-panel miniapp-slide-panel mx-auto flex h-full w-full max-w-none flex-col overflow-hidden rounded-none border-y border-violet-500/30 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="miniapp-ai-chat-header flex items-start justify-between gap-2 border-b border-slate-800 p-3">
              <button type="button" onClick={() => setIsAiChatMenuOpen(true)} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Меню чатов и проектов"><Menu size={18} /></button>
              <div className="min-w-0 flex-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700"><Sparkles size={13} /> Чат с ИИ</p>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-primary">{activeAiChat?.title ?? 'Новый чат'}</h2>
                  <div className="miniapp-ai-chat-project-chip inline-flex max-w-[46%] shrink-0 items-center gap-1.5 rounded-2xl border px-2 py-1 text-[11px] font-semibold shadow-sm" style={{ '--project-color': activeAiChatProject?.color ?? '#8b5cf6' } as CSSProperties}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm">{activeAiChatProject?.icon}</span>
                    <span className="truncate">{activeAiChatProject?.title ?? 'Проект'}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => closeMiniWindowWithMotion('ai-chat', () => setIsAiChatOpen(false))} className="miniapp-ai-chat-icon-button rounded-full border border-slate-700 bg-slate-800 p-2" aria-label="Закрыть чат с ИИ"><X size={18} /></button>
            </div>
            <div className="miniapp-ai-chat-thread-wrap relative min-h-0 flex-1">
              <select value={selectedAiChatModel} onChange={(event) => setSelectedAiChatModel(event.target.value as AiChatModel)} className="miniapp-ai-chat-select miniapp-ai-chat-model-cap absolute left-1/2 top-0 z-10 w-40 -translate-x-1/2 rounded-b-xl rounded-t-none border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold" aria-label="Выбрать модель чата">
                {AI_CHAT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div ref={aiChatDialogContainerRef} className="miniapp-ai-chat-thread h-full min-h-0 space-y-3 overflow-y-auto p-3">
              {(activeAiChat?.messages ?? []).length === 0 ? <p className="miniapp-ai-chat-empty rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-400">Начните диалог: задайте вопрос, обсудите идею или попросите помочь с задачами.</p> : null}
              {(activeAiChat?.messages ?? []).map((message) => (
                <div key={message.id} className={`miniapp-ai-chat-message max-w-[88%] rounded-3xl px-4 py-3 shadow-lg ${message.role === 'user' ? 'miniapp-ai-chat-message-user ml-auto rounded-br-lg' : 'miniapp-ai-chat-message-assistant mr-auto rounded-bl-lg'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`mini-chat-${message.id}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `mini-chat-${message.id}` ? null : prev)), 1300); }} className="text-slate-300" title="Копировать">{copiedAiMessageKey === `mini-chat-${message.id}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                  <div className="text-sm leading-relaxed">{message.role === 'assistant' ? <MiniAiMessageContentWithTaskRefs content={message.content} tasks={tasks} onOpenTask={openTaskModal} /> : renderMiniAiText(message.content)}</div>
                </div>
              ))}
              {aiChatLoading ? <p className="text-sm text-cyan-200">ИИ думает…</p> : null}
              {aiChatError ? <p className="text-sm text-rose-300">{aiChatError}</p> : null}
              </div>
            </div>
            <div className="miniapp-ai-chat-composer border-t border-slate-800 p-3">
              {aiChatPendingFiles.length > 0 ? <div className="mb-2 flex flex-wrap gap-1.5">{aiChatPendingFiles.map((file) => <button key={`mini-general-ai-file-${file.name}-${file.size}`} type="button" className="miniapp-ai-file-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]" onClick={() => setAiChatPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}><Paperclip size={10} /><span className="max-w-[190px] truncate">{file.name}</span><X size={10} /></button>)}</div> : null}
              <div className="miniapp-ai-chat-composer-card flex items-end gap-2 rounded-3xl border p-2 shadow-lg backdrop-blur">
                <textarea value={aiChatDraft} onChange={(event) => setAiChatDraft(event.target.value)} rows={1} placeholder="Напишите сообщение…" className="miniapp-ai-chat-input max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm leading-6 focus:outline-none focus:ring-0" onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void sendAiChatQuestion(); } }} />
                <input ref={aiChatFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={handleAiChatFileSelect} />
                <button type="button" onClick={() => aiChatFileInputRef.current?.click()} className="miniapp-ai-chat-attach flex h-11 w-11 shrink-0 items-center justify-center rounded-full" aria-label="Прикрепить файл"><Paperclip size={17} /></button>
                <button type="button" onClick={() => void sendAiChatQuestion()} disabled={aiChatLoading || (!aiChatDraft.trim() && aiChatPendingFiles.length === 0)} className="miniapp-ai-chat-send flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50" aria-label="Отправить сообщение"><SendHorizontal size={17} /></button>
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
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => { setActiveAiChatProjectId(project.id); setActiveAiChatId(project.chats[0]?.id ?? ''); }}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-base miniapp-ai-chat-menu-project-icon" style={{ backgroundColor: project.color }}>{project.icon}</span><span className="min-w-0 flex-1 truncate text-sm font-bold miniapp-ai-chat-menu-title">{project.title}</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="miniapp-ai-chat-menu-action inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold" disabled={project.id === aiChatProjects[0]?.id} onClick={() => openAiChatProjectDialog(project.id)}><Settings size={12} /> Настроить</button><button type="button" disabled={project.id === aiChatProjects[0]?.id || aiChatProjects.length <= 1} className="miniapp-ai-chat-menu-action miniapp-ai-chat-menu-action-danger inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40" onClick={() => deleteAiChatProject(project.id)}><Trash2 size={12} /> Удалить</button></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Чаты</p><button type="button" className="miniapp-ai-chat-menu-add miniapp-ai-chat-menu-add-chat rounded-2xl p-2 text-white" onClick={createAiChatThread}><Plus size={16} /></button></div>
                {(activeAiChatProject?.chats ?? []).map((chat) => (
                  <div key={chat.id} className={`miniapp-ai-chat-menu-card rounded-3xl border p-2.5 shadow-sm ${chat.id === activeAiChat?.id ? 'miniapp-ai-chat-menu-card-active-chat' : ''}`}>
                    <button type="button" className="w-full text-left" onClick={() => { setActiveAiChatId(chat.id); setIsAiChatMenuOpen(false); }}><span className="block truncate text-sm font-bold miniapp-ai-chat-menu-title">{chat.title}</span><span className="miniapp-ai-chat-menu-subtitle text-[11px]">{chat.messages.length} сообщ.</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="miniapp-ai-chat-menu-action rounded-xl border px-2.5 py-1.5 text-xs font-semibold" disabled={chat.id === QUICK_AI_CHAT_ID} onClick={() => { setRenamingAiChatId(chat.id); setAiChatRenameDraft(chat.title); }}>Переименовать</button><button type="button" disabled={chat.id === QUICK_AI_CHAT_ID || (activeAiChatProject?.chats.length ?? 0) <= 1} className="miniapp-ai-chat-menu-action miniapp-ai-chat-menu-action-danger rounded-xl border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40" onClick={() => deleteAiChatThread(chat.id)}>Удалить</button></div>
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

      {isHabitModalOpen ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center ${getMiniWindowMotionClass('habit')}`}>
          <div className="miniapp-slide-panel miniapp-habit-modal-panel max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 text-slate-950 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{editingHabitId ? 'Редактирование привычки' : 'Новая привычка'}</h2>
                <p className="text-xs text-slate-400">Нажатие на круг — редактирование, зажатие — отметка выполнения.</p>
              </div>
              <button type="button" onClick={() => closeMiniWindowWithMotion('habit', closeHabitModal)} className="rounded-md border border-slate-600 p-1 text-slate-300" aria-label="Закрыть окно">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <div
                  className="miniapp-habit-circle relative inline-flex h-[68px] w-[68px] items-center justify-center rounded-full border"
                  style={{ '--habit-color': habitDraft.color, '--habit-progress': '65%' } as CSSProperties}
                >
                  <span className="miniapp-habit-circle-core absolute inset-[6px] rounded-full" />
                  <span className="relative z-10 text-2xl">{habitDraft.icon}</span>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs text-slate-300">Название привычки</label>
                  <input
                    value={habitDraft.name}
                    onChange={(event) => setHabitDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Например, вода или зарядка"
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  />
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2">
                    <span className="text-xs text-slate-300">Выполнение: <span className="font-semibold text-slate-100">{habitModalCompleted}/{parseHabitTargetCount(habitDraft.targetCount)}</span></span>
                    <div className="flex items-center gap-2">
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

              <div className="flex gap-2">
                {editingHabitId ? (
                  <button
                    type="button"
                    onClick={() => void deleteHabit(editingHabitId)}
                    disabled={deletingHabitId === editingHabitId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/60 px-3 py-2 text-sm text-rose-200 disabled:opacity-60"
                  >
                    <Trash2 size={14} />
                    {deletingHabitId === editingHabitId ? 'Удаляем…' : 'Удалить'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveHabit()}
                  disabled={savingHabit}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {savingHabit ? 'Сохраняем…' : editingHabitId ? 'Сохранить привычку' : 'Создать привычку'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateTaskModalOpen ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/70 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 ${getMiniWindowMotionClass('create-task')}`}>
          <div className="relative miniapp-slide-panel miniapp-focus-panel miniapp-focus-task-panel max-h-[94vh] w-full overflow-hidden rounded-t-[2rem] border p-4 shadow-2xl sm:max-h-[88vh] sm:max-w-2xl sm:rounded-[2rem]">
            <div className="flex max-h-[calc(94vh-2rem)] min-h-0 flex-col sm:max-h-[calc(88vh-2rem)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Новая задача</p>
                <div className="relative flex items-center gap-2">
                  <button type="button" onClick={() => setIsCreateTaskSettingsOpen((prev) => !prev)} className="miniapp-focus-icon-button" aria-label="Настройки новой задачи" aria-expanded={isCreateTaskSettingsOpen}>
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
                      <label className="mt-3 flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={createTaskDraft.aiNotificationsEnabled ?? true}
                          onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, aiNotificationsEnabled: event.target.checked }))}
                        />
                        уведомления от ИИ
                      </label>
                      {createTaskDraft.isRecurring ? (
                        <div className="mt-3 rounded-2xl border border-violet-200/70 p-2 text-xs">
                          <p className="mb-1 text-slate-500">Опишите как должна повторяться задача</p>
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
                  placeholder="Введите название"
                />
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-violet-500">
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DateTimePickerWithApply
                    value={fromInputDateTime(createTaskDraft.dueDate)}
                    onChange={(nextValue) => setCreateTaskDraft((prev) => ({ ...prev, dueDate: toInputDateTime(nextValue) }))}
                    timelineTasks={tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, isSubtask: Boolean(task.parentTaskId), sphereColor: spheres.find((sphere) => sphere.id === task.sphereId)?.color ?? null, taskType: task.taskType }))}
                    iconOnly
                    detachedPopup
                    buttonClassName="miniapp-focus-icon-button"
                  />
                </div>
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
                <div className="mt-3 pt-1">
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
                </div>
                <div className="miniapp-focus-subtasks mt-4 flex min-h-0 flex-col space-y-2 border-t pt-3">
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
                              <span className="truncate text-xs font-semibold text-violet-500">{subtask.dueDate ? formatSubtaskRelativeDeadline(fromInputDateTime(subtask.dueDate)) : 'Срок не задан'}</span>
                              <DateTimePickerWithApply
                                value={fromInputDateTime(subtask.dueDate)}
                                onChange={(nextValue) => setCreateTaskDraft((prev) => ({
                                  ...prev,
                                  subtasks: (prev.subtasks ?? []).map((item) => item.id === subtask.id ? { ...item, dueDate: toInputDateTime(nextValue) } : item)
                                }))}
                                timelineTasks={tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, isSubtask: Boolean(task.parentTaskId), sphereColor: spheres.find((sphere) => sphere.id === task.sphereId)?.color ?? null, taskType: task.taskType }))}
                                iconOnly
                                detachedPopup
                                buttonClassName="miniapp-focus-icon-button"
                              />
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
                </div>
              </div>
              <div className="miniapp-create-task-sticky-action pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4 pt-8">
                <button
                  type="button"
                  onClick={() => void createTask()}
                  disabled={isCreatingTask}
                  className="miniapp-focus-primary-button pointer-events-auto min-w-[12rem] shadow-2xl"
                >
                  {isCreatingTask ? 'Создаём…' : 'Создать задачу'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
