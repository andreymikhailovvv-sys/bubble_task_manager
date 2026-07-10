import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { Bot, CalendarDays, Check, CheckCircle2, ChevronDown, Coins, Copy, FileText, List, Maximize2, Menu, Minus, Moon, Palette, Paperclip, Plus, Save, Search, SendHorizontal, Settings, Sun, Ticket, Trash2, X } from 'lucide-react';
import { INSUFFICIENT_AI_CREDITS_MESSAGE, api } from './lib/api';
import { NotesEditor } from './components/NotesEditor';
import { CustomSelect } from './components/CustomSelect';
import { noteHtmlToPlainText } from './lib/notes';
import type { AiChatModel, ChatAttachmentPayload, ChatMessage, ChatMode, Habit, HabitDurationMode, HabitRecurrenceType, Sphere, Task, TaskAttachment } from './lib/types';

const MINIAPP_EFFICIENCY_BONUSES = {
  doneHabit: 3,
  createdHabit: 3.35,
  completedHabit: 20.1
} as const;

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
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
const TIMELINE_HOUR_HEIGHT = 88;
const TIMELINE_CARD_HEIGHT = 52;
const TIMELINE_CARD_GAP = 8;
const TIMELINE_HOUR_EXTRA_PADDING = 10;
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
const AI_CHAT_MODEL_OPTIONS: Array<{ value: AiChatModel; label: string; creditsCost: number }> = [
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', creditsCost: 2 },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', creditsCost: 5 },
  { value: 'gpt-5.4', label: 'GPT-5.4', creditsCost: 8 }
];
const MINI_AI_PROJECT_COLORS = ['#8b5cf6', '#06b6d4', '#22c55e', '#f97316', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];
const MINI_AI_PROJECT_ICONS = ['✨', '🤖', '🧠', '🚀', '📌', '🗂️', '💬', '⚡', '🌙', '🎯', '🧩', '🪄'];

type TaskDraft = {
  title: string;
  description: string;
  dueDate: string;
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
    dueDate: ''
  });
  const [isTaskNotesEditorOpen, setIsTaskNotesEditorOpen] = useState(false);
  const [isSubtaskNotesEditorOpen, setIsSubtaskNotesEditorOpen] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);
  const [isTaskAttachmentDragActive, setIsTaskAttachmentDragActive] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const inlineAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);
  const lastMainScrollTopRef = useRef(0);
  const [aiDraft, setAiDraft] = useState('');
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [aiModeByTask, setAiModeByTask] = useState<Record<string, ChatMode>>({});
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isAiChatMenuOpen, setIsAiChatMenuOpen] = useState(false);
  const [aiChatDraft, setAiChatDraft] = useState('');
  const [selectedAiChatModel, setSelectedAiChatModel] = useState<AiChatModel>('gpt-5.4-mini');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatError, setAiChatError] = useState<string | null>(null);
  const [aiChatProjectDraft, setAiChatProjectDraft] = useState<MiniAiChatProjectDraft>({ mode: 'create', title: '', color: '#8b5cf6', icon: '✨' });
  const [isAiChatProjectDialogOpen, setIsAiChatProjectDialogOpen] = useState(false);
  const [closingMiniWindow, setClosingMiniWindow] = useState<string | null>(null);
  const [renamingAiChatId, setRenamingAiChatId] = useState<string | null>(null);
  const [aiChatRenameDraft, setAiChatRenameDraft] = useState('');
  const [aiChatProjects, setAiChatProjects] = useState<MiniAiChatProject[]>(() => {
    const fallback: MiniAiChatProject[] = [{ id: crypto.randomUUID(), title: 'Личный проект', color: '#8b5cf6', icon: '✨', chats: [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }] }];
    try {
      const parsed = JSON.parse(localStorage.getItem(AI_CHAT_STORAGE_KEY) || '') as Array<Partial<MiniAiChatProject>>;
      return parsed.length ? parsed.map((project, index) => ({
        id: project.id ?? crypto.randomUUID(),
        title: project.title ?? `Проект ${index + 1}`,
        color: project.color ?? '#8b5cf6',
        icon: project.icon ?? '✨',
        chats: project.chats?.length ? project.chats.map((chat, chatIndex) => ({
          id: chat.id ?? crypto.randomUUID(),
          title: chat.title ?? `Чат ${chatIndex + 1}`,
          messages: (chat.messages ?? []).map((message) => ({ id: message.id ?? crypto.randomUUID(), role: message.role, content: message.content }))
        })) : [{ id: crypto.randomUUID(), title: 'Новый чат', messages: [] }]
      })) : fallback;
    } catch { return fallback; }
  });
  const [activeAiChatProjectId, setActiveAiChatProjectId] = useState(() => aiChatProjects[0]?.id ?? '');
  const [activeAiChatId, setActiveAiChatId] = useState(() => aiChatProjects[0]?.chats[0]?.id ?? '');
  const aiChatDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const taskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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

      const [sphereList, taskList, habitList] = await Promise.all([api.getSpheres(), api.getTasks(), api.getHabits()]);
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
    const result = [...filteredTasks];
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

    const hourTaskCount = Array.from({ length: HOURS_IN_DAY }, () => 0);
    for (const task of timelineEntries) {
      const due = new Date(task.dueDate as string);
      const hour = due.getHours();
      if (hour >= 0 && hour < HOURS_IN_DAY) hourTaskCount[hour] += 1;
    }
    for (const habit of scheduledHabits) {
      const hour = Number((habit.reminderTime ?? '00:00').slice(0, 2));
      if (hour >= 0 && hour < HOURS_IN_DAY) hourTaskCount[hour] += 1;
    }

    const hourHeights = hourTaskCount.map((count) => {
      if (count <= 1) return TIMELINE_HOUR_HEIGHT;
      return Math.max(
        TIMELINE_HOUR_HEIGHT,
        (count * TIMELINE_CARD_HEIGHT) + ((count - 1) * TIMELINE_CARD_GAP) + TIMELINE_HOUR_EXTRA_PADDING
      );
    });
    const hourTops: number[] = [];
    let totalHeight = 0;
    for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
      hourTops.push(totalHeight);
      totalHeight += hourHeights[hour];
    }

    const currentHour = now.getHours();
    const currentTimeTop = hourTops[currentHour] + ((now.getMinutes() / 60) * hourHeights[currentHour]);
    const isCurrentDay = now.getFullYear() === anchor.getFullYear()
      && now.getMonth() === anchor.getMonth()
      && now.getDate() === anchor.getDate();
    return {
      timelineEntries,
      scheduledHabits,
      dateKey: toDateKey(startOfDay),
      currentTimeTop,
      isTodayVisible: isCurrentDay,
      hourHeights,
      hourTops,
      totalHeight,
      anchorLabel: anchor.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
    };
  }, [habits, timelineAnchorDate, timelineFilteredTasks, timelineNow]);

  const sortedHabits = useMemo(() => {
    const dateKey = toDateKey(new Date());
    return [...habits].sort((a, b) => {
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
    const itemsByHour = new Map<number, Habit[]>();

    for (const habit of timelineToday.scheduledHabits) {
      const hour = Number((habit.reminderTime ?? '00:00').slice(0, 2));
      const bucket = itemsByHour.get(hour) ?? [];
      bucket.push(habit);
      itemsByHour.set(hour, bucket);
    }

    for (const [hour, hourHabits] of itemsByHour.entries()) {
      const taskCount = timelineToday.timelineEntries.filter((task) => {
        const due = new Date(task.dueDate as string);
        return due.getHours() === hour;
      }).length;
      const sorted = hourHabits.slice().sort((a, b) => (a.reminderTime ?? '').localeCompare(b.reminderTime ?? ''));
      for (let index = 0; index < sorted.length; index += 1) {
        placements.set(sorted[index].id, { top: timelineToday.hourTops[hour] + ((taskCount + index) * (TIMELINE_CARD_HEIGHT + TIMELINE_CARD_GAP)) + 4 });
      }
    }

    return placements;
  }, [timelineToday.hourTops, timelineToday.scheduledHabits, timelineToday.timelineEntries]);

  const timelineTaskPlacements = useMemo(() => {
    const placements = new Map<string, { top: number }>();
    const tasksByHour = new Map<number, Task[]>();

    for (const task of timelineToday.timelineEntries) {
      const due = new Date(task.dueDate as string);
      const hour = due.getHours();
      const bucket = tasksByHour.get(hour) ?? [];
      bucket.push(task);
      tasksByHour.set(hour, bucket);
    }

    for (const [hour, tasks] of tasksByHour.entries()) {
      const sorted = tasks.slice().sort(compareByDueDate);
      for (let index = 0; index < sorted.length; index += 1) {
        const top = timelineToday.hourTops[hour] + (index * (TIMELINE_CARD_HEIGHT + TIMELINE_CARD_GAP)) + 4;
        placements.set(sorted[index].id, { top });
      }
    }

    return placements;
  }, [timelineToday.hourHeights, timelineToday.hourTops, timelineToday.timelineEntries]);

  const isLightTheme = miniThemeMode === 'light';
  const getMiniWindowMotionClass = (windowName: string) => closingMiniWindow === windowName ? 'miniapp-window-closing' : 'miniapp-window-opening';
  const closeMiniWindowWithMotion = (windowName: string, close: () => void) => {
    setClosingMiniWindow(windowName);
    window.setTimeout(() => {
      close();
      setClosingMiniWindow((current) => (current === windowName ? null : current));
    }, 220);
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
          title: created.title,
          description: created.description ?? '',
          dueDate: toInputDateTime(created.dueDate)
        }
      }));
      await loadData();
      setOpenedSubtaskId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить подзадачу');
    } finally {
      setCreatingSubtaskForId(null);
    }
  };

  const openCreateTaskModal = () => {
    setCreateTaskDraft({ title: '', description: '', dueDate: '' });
    setClosingMiniWindow(null);
    setIsCreateTaskModalOpen(true);
  };

  const createTask = async () => {
    setIsCreatingTask(true);
    setError(null);
    try {
      await api.createTask({
        title: createTaskDraft.title.trim() || 'Новая задача',
        description: createTaskDraft.description.trim() || null,
        dueDate: fromInputDateTime(createTaskDraft.dueDate),
        sphereId: sphereFilter === 'all' || sphereFilter === 'without-sphere' ? null : sphereFilter
      });
      await loadData();
      setIsCreateTaskModalOpen(false);
      setCreateTaskDraft({ title: '', description: '', dueDate: '' });
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
      setHabits((currentHabits) => currentHabits.map((currentHabit) => currentHabit.id === updatedHabit.id ? updatedHabit : currentHabit));
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
  const openedTaskAiMode: ChatMode = openedTask ? (aiModeByTask[openedTask.id] ?? 'fast') : 'fast';

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
    if (!question || aiChatLoading) return;
    const userMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    const history = activeAiChat?.messages ?? [];
    updateActiveAiChatMessages((messages) => [...messages, userMessage]);
    setAiChatDraft('');
    setAiChatLoading(true);
    setAiChatError(null);
    try {
      const result = await api.askAiChat({
        question,
        history,
        model: selectedAiChatModel,
        projectTitle: activeAiChatProject?.title,
        chatTitle: activeAiChat?.title
      });
      const assistantMessage: MiniAiChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: `${result.delegatedToPlanner ? '🧭 ИИ-планировщик\n' : ''}${result.answer}` };
      updateActiveAiChatMessages((messages) => [...messages, assistantMessage]);
      if (result.delegatedToPlanner) await loadData();
    } catch (e) {
      setAiChatError(e instanceof Error ? e.message : 'Не удалось получить ответ ИИ');
    } finally {
      setAiChatLoading(false);
    }
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
    const raw = localStorage.getItem('btm:task-ai-mode-map');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, ChatMode>;
      setAiModeByTask(parsed);
    } catch {
      // ignore invalid storage format
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('btm:task-ai-mode-map', JSON.stringify(aiModeByTask));
  }, [aiModeByTask]);

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
        mode: openedTaskAiMode,
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
    scrollToBottom(inlineAiDialogContainerRef.current);
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
        <section className={`sticky top-0 z-30 rounded-xl border border-slate-700 bg-slate-900/95 p-3 backdrop-blur transition-transform duration-200 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-[130%]'}`}>
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
            <div className="relative inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 bg-slate-800 p-1">
              <button
                type="button"
                onClick={openCreateTaskModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900"
                aria-label="Создать задачу"
                title="Создать задачу"
              >
                <Plus size={16} className="text-emerald-400" />
              </button>
              <button
                type="button"
                onClick={toggleDisplayMode}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900"
                aria-label={displayMode === 'list' ? 'Переключить на таймлайн' : 'Переключить на список'}
                title={displayMode === 'list' ? 'Переключить на таймлайн' : 'Переключить на список'}
              >
                {displayMode === 'list' ? (
                  <List size={16} className="text-sky-400" />
                ) : (
                  <CalendarDays size={16} className="text-violet-400" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900"
                aria-label="Открыть настройки"
                title="Настройки"
              >
                <Settings size={16} className="text-slate-300" />
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
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="miniapp-habits-strip mt-3 flex items-center gap-2 overflow-x-auto pb-1">
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

        {error ? (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {listTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">Задачи не найдены.</div>
        ) : null}

        {displayMode === 'list' ? (
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
                    {Array.from({ length: HOURS_IN_DAY }).map((_, hourIndex) => (
                      <div key={`hour-${hourIndex}`} className="absolute inset-x-0 border-t border-slate-700/80" style={{ top: `${timelineToday.hourTops[hourIndex]}px` }}>
                        <span className="miniapp-timeline-hour-label absolute -top-3 left-0 rounded bg-slate-900 px-1 text-xs text-slate-400">{`${hourIndex.toString().padStart(2, '0')}:00`}</span>
                      </div>
                    ))}
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
                      const isEvent = task.taskType === 'EVENT';
                      const hasOverdueState = !isEvent && isOverdue(task);
                      const isSubtask = Boolean(task.parentTaskId);
                      const parentTask = task.parentTaskId ? (taskById.get(task.parentTaskId) ?? null) : null;
                      const taskForSectorColor = parentTask ?? task;
                      const sphereColor = taskForSectorColor.sphereId ? spheres.find((item) => item.id === taskForSectorColor.sphereId)?.color ?? null : null;
                      const placement = timelineTaskPlacements.get(task.id) ?? { top: timelineToday.hourTops[taskHour] + 4 };
                      return (
                        <button
                          type="button"
                          key={task.id}
                          className={`absolute border px-2 py-1 text-left ${isEvent ? 'miniapp-timeline-event-card rounded-lg' : 'rounded-lg'}`}
                          style={{
                            top: `${placement.top}px`,
                            minHeight: `${TIMELINE_CARD_HEIGHT}px`,
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
                          onClick={() => openTaskModal(parentTask ?? task)}
                        >
                          <p className="flex items-center gap-1 truncate text-sm font-medium">{isEvent ? <Ticket size={13} className="shrink-0 text-amber-500" /> : null}<span className="truncate">{task.title}</span></p>
                          <p className="text-xs text-slate-300">{isEvent ? 'Событие · ' : isSubtask ? 'Подзадача · ' : ''}{formatDueDate(task.dueDate)}</p>
                        </button>
                      );
                    })}
                    {timelineToday.scheduledHabits.map((habit) => {
                      const placement = timelineHabitPlacements.get(habit.id) ?? { top: 4 };
                      const completed = getHabitCompletedForDate(habit, timelineToday.dateKey);
                      const progress = Math.round((Math.min(completed, habit.targetCount) / Math.max(1, habit.targetCount)) * 100);
                      return (
                        <div
                          key={`timeline-habit-${habit.id}`}
                          className="miniapp-timeline-habit-card absolute rounded-md border px-2 py-1 text-left"
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
                              <p className="text-xs text-emerald-200">Привычка · {(habit.reminderTimes?.join(', ') || habit.reminderTime) ?? '—'} · {completed}/{habit.targetCount}</p>
                            </div>
                          </div>
                        </div>
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
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center ${getMiniWindowMotionClass('task')}`}>
          <div className="miniapp-slide-panel max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Задача</h2>
              <button
                type="button"
                onClick={() => closeMiniWindowWithMotion('task', closeTaskModal)}
                className="rounded-md border border-slate-600 p-1 text-slate-300"
                aria-label="Закрыть окно"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Название задачи</label>
                <input
                  value={openedTaskDraft.title}
                  onChange={(event) => onChangeDraft(openedTask.id, { title: event.target.value })}
                  className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Описание</label>
                <textarea
                  value={noteHtmlToPlainText(openedTaskDraft.description, { trimEnd: false })}
                  onChange={(event) => onChangeDraft(openedTask.id, { description: event.target.value })}
                  className="miniapp-task-text-field min-h-20 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={`notes-open-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${isTaskAttachmentDragActive ? 'notes-open-button-active' : ''} ${isUploadingTaskAttachment ? 'opacity-60' : ''}`}
                    onClick={() => taskAttachmentInputRef.current?.click()}
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
                      void uploadTaskAttachmentFiles(files);
                    }}
                    disabled={isUploadingTaskAttachment}
                    title="Добавить файлы к задаче"
                    aria-label="Добавить файлы к задаче"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    className="notes-open-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
                    onClick={() => setIsTaskNotesEditorOpen(true)}
                    title="Открыть заметки"
                    aria-label="Открыть заметки"
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
                <input
                  ref={taskAttachmentInputRef}
                  type="file"
                  accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={handleTaskAttachmentFileSelect}
                />
                {taskAttachments.length > 0 ? (
                  <div className="flex flex-wrap items-start gap-2">
                    {taskAttachments.map((attachment) => (
                      <div key={attachment.id} className="inline-flex max-w-[210px] items-center gap-1 rounded-xl border border-slate-600 bg-slate-800/90 px-2 py-1 text-[11px] text-slate-100">
                        <button
                          type="button"
                          title={`${attachment.name} • скачать`}
                          onClick={() => downloadTaskAttachment(attachment)}
                          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-700"
                        >
                          <FileText size={12} className="shrink-0 text-cyan-300" />
                          <span className="truncate">{attachment.name}</span>
                        </button>
                        <button
                          type="button"
                          title="Удалить файл"
                          onClick={() => void removeTaskAttachment(attachment.id)}
                          className="rounded-md p-0.5 text-slate-300 hover:bg-rose-600/80 hover:text-white"
                        >
                          <X size={11} className="shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {isTaskNotesEditorOpen ? (
                <NotesEditor
                  value={openedTaskDraft.description}
                  onChange={(description) => onChangeDraft(openedTask.id, { description })}
                  onClose={() => setIsTaskNotesEditorOpen(false)}
                />
              ) : null}
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Срок</label>
                <input
                  type="datetime-local"
                  value={openedTaskDraft.dueDate}
                  onChange={(event) => onChangeDraft(openedTask.id, { dueDate: event.target.value })}
                  className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void saveTask(openedTask.id)}
                  disabled={savingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-600 px-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Save size={14} />
                  {savingId === openedTask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                </button>
                <button
                  type="button"
                  onClick={() => void completeTask(openedTask.id)}
                  disabled={completingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {completingId === openedTask.id ? 'Завершаем…' : 'Выполнить'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTask(openedTask.id)}
                  disabled={deletingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-rose-600 px-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deletingId === openedTask.id ? 'Удаляем…' : 'Удалить'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiDialogOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white"
                >
                  <Bot size={14} />
                  Диалог с ИИ
                </button>
              </div>
            </div>
            {isAiDialogOpen ? (
              <div className="miniapp-ai-dialog mt-3 space-y-2 rounded-md border border-violet-500/40 bg-slate-800/80 p-3">
                <h3 className="text-sm font-semibold text-violet-100">Чат по задаче</h3>
                <div className="miniapp-ai-mode-switch inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-slate-900/80 p-1 text-xs">
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 ${openedTaskAiMode === 'fast' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => openedTask && setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'fast' }))}
                  >
                    <span className="block text-left">Быстрая</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 ${openedTaskAiMode === 'smart' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => openedTask && setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'smart' }))}
                  >
                    <span className="block text-left">Умная</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span>
                  </button>
                </div>
                <div ref={inlineAiDialogContainerRef} className="miniapp-ai-thread max-h-52 space-y-2 overflow-y-auto overflow-x-hidden rounded-md bg-slate-900/80 p-2 text-xs">
                  {openedTaskAiDialog.length === 0 ? <p className="text-slate-400">История пока пустая.</p> : null}
                  {openedTaskAiDialog.map((message, index) => (
                    <div key={`mini-ai-${index}`} className={`miniapp-ai-message max-w-[94%] rounded-xl border px-2.5 py-2 ${message.role === 'assistant' ? 'miniapp-ai-message-assistant mr-auto border-violet-400/40 bg-violet-500/20 text-violet-50' : 'miniapp-ai-message-user ml-auto border-cyan-400/40 bg-cyan-500/15 text-cyan-50'}`}>
                      <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`compact-${index}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `compact-${index}` ? null : prev)), 1300); }} className="text-slate-300 transition" title="Копировать">{copiedAiMessageKey === `compact-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                      <div className="text-[13px] leading-relaxed">{renderMiniAiText(message.content)}</div>
                    </div>
                  ))}
                  {aiLoadingTaskId === openedTask.id ? <p className="text-cyan-200">ИИ думает…</p> : null}
                </div>
                <input
                  ref={aiAttachmentInputRef}
                  type="file"
                  accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={handleAiFileSelect}
                />
                {aiPendingFiles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {aiPendingFiles.map((file) => (
                      <button key={`mini-ai-file-${file.name}-${file.size}`} type="button" className="miniapp-ai-file-pill inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-[10px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}>
                        <Paperclip size={10} />
                        <span className="max-w-[170px] truncate">{file.name}</span>
                        <X size={10} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <button type="button" className="miniapp-ai-attach-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-slate-200" onClick={() => aiAttachmentInputRef.current?.click()} title="Прикрепить файл">
                    <Paperclip size={15} />
                  </button>
                  <textarea
                    ref={aiTextareaRef}
                    value={aiDraft}
                    onChange={(event) => setAiDraft(event.target.value)}
                    placeholder="Напишите сообщение для ИИ"
                    rows={1}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    className="miniapp-ai-input max-h-[180px] w-full resize-none overflow-y-auto rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void sendAiMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void sendAiMessage()}
                    disabled={aiLoadingTaskId === openedTask.id}
                    className="rounded-xl bg-violet-600 px-3 py-2 disabled:opacity-60"
                    title="Отправить"
                  >
                    <SendHorizontal size={14} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-2 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Подзадачи</h3>
                <button
                  type="button"
                  onClick={() => void addSubtask(openedTask)}
                  disabled={creatingSubtaskForId === openedTask.id}
                  className="rounded-xl bg-sky-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {creatingSubtaskForId === openedTask.id ? 'Добавляем…' : 'Добавить подзадачу'}
                </button>
              </div>
              {openedTaskSubtasks.length === 0 ? <p className="text-xs text-slate-400">Подзадач пока нет.</p> : null}
              {openedTaskSubtasks.map((subtask) => {
                const hasOverdueSubtaskState = isOverdue(subtask);
                const hasReminderSubtaskState = !hasOverdueSubtaskState && shouldTaskGlow(subtask);
                return (
                  <article
                    key={subtask.id}
                    className="rounded-xl border border-slate-700 bg-slate-900 p-2"
                    style={hasOverdueSubtaskState
                      ? { boxShadow: '0 0 15px rgba(239,68,68,0.78), inset 0 0 10px rgba(239,68,68,0.34)' }
                      : hasReminderSubtaskState
                        ? { boxShadow: '0 0 15px rgba(56,189,248,0.72), inset 0 0 10px rgba(56,189,248,0.3)' }
                        : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenedSubtaskId(subtask.id)}
                      className="flex w-full items-start justify-between gap-2 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{subtask.title}</p>
                        <p className="text-xs text-slate-300">Дедлайн: {formatDueDate(subtask.dueDate)}</p>
                      </div>
                      <ChevronDown size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {openedSubtask && openedSubtaskDraft ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 ${getMiniWindowMotionClass('subtask')}`} onClick={() => closeMiniWindowWithMotion('subtask', () => setOpenedSubtaskId(null))}>
          <div className="miniapp-slide-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Редактирование подзадачи</h3>
              <button type="button" onClick={() => closeMiniWindowWithMotion('subtask', () => setOpenedSubtaskId(null))} className="rounded-md border border-slate-600 p-1 text-slate-300" aria-label="Закрыть окно подзадачи">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={openedSubtaskDraft.title}
                onChange={(event) => onChangeDraft(openedSubtask.id, { title: event.target.value })}
                className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Название подзадачи"
              />
              <textarea
                value={noteHtmlToPlainText(openedSubtaskDraft.description, { trimEnd: false })}
                onChange={(event) => onChangeDraft(openedSubtask.id, { description: event.target.value })}
                className="miniapp-task-text-field min-h-16 w-full rounded-xl border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Описание подзадачи"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="notes-open-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
                  onClick={() => setIsSubtaskNotesEditorOpen(true)}
                  title="Открыть заметки"
                  aria-label="Открыть заметки"
                >
                  <Maximize2 size={15} />
                </button>
              </div>
              {isSubtaskNotesEditorOpen ? (
                <NotesEditor
                  value={openedSubtaskDraft.description}
                  onChange={(description) => onChangeDraft(openedSubtask.id, { description })}
                  onClose={() => setIsSubtaskNotesEditorOpen(false)}
                />
              ) : null}
              <input
                type="datetime-local"
                value={openedSubtaskDraft.dueDate}
                onChange={(event) => onChangeDraft(openedSubtask.id, { dueDate: event.target.value })}
                className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void saveTask(openedSubtask.id)} disabled={savingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-sky-600 px-3 text-sm font-medium text-white disabled:opacity-60">
                  <Save size={14} />
                  {savingId === openedSubtask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                </button>
                <button type="button" onClick={() => void completeTask(openedSubtask.id)} disabled={completingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-60">
                  <CheckCircle2 size={14} />
                  {completingId === openedSubtask.id ? 'Завершаем…' : 'Выполнить'}
                </button>
                <button type="button" onClick={() => void deleteTask(openedSubtask.id)} disabled={deletingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-rose-600 px-3 text-sm font-medium text-white disabled:opacity-60">
                  <Trash2 size={14} />
                  {deletingId === openedSubtask.id ? 'Удаляем…' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {openedTask && isAiDialogOpen ? (
        <div className={`miniapp-ai-fullscreen-backdrop miniapp-slide-backdrop fixed inset-0 z-[60] bg-slate-950/90 p-3 sm:p-6 ${getMiniWindowMotionClass('task-ai')}`}>
          <div className="miniapp-ai-dialog miniapp-slide-panel mx-auto flex h-full w-full max-w-3xl flex-col rounded-2xl border border-violet-500/40 bg-slate-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="miniapp-ai-title text-base font-semibold text-violet-100">Диалог с ИИ</h3>
                <p className="text-xs text-slate-300">{openedTask.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="miniapp-ai-mode-switch inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-slate-900/80 p-1 text-xs">
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 ${openedTaskAiMode === 'fast' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'fast' }))}
                  >
                    <span className="block text-left">Быстрая</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 ${openedTaskAiMode === 'smart' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'smart' }))}
                  >
                    <span className="block text-left">Умная</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>5</span><Coins size={10} /></span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => closeMiniWindowWithMotion('task-ai', () => setIsAiDialogOpen(false))}
                  className="rounded-md border border-slate-600 p-1 text-slate-300"
                  aria-label="Закрыть диалог с ИИ"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div ref={fullscreenAiDialogContainerRef} className="miniapp-ai-thread min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-md bg-slate-950/70 p-3 text-sm">
              {openedTaskAiDialog.length === 0 ? <p className="text-slate-400">История пока пустая.</p> : null}
              {openedTaskAiDialog.map((message, index) => (
                <div key={`mini-ai-full-${index}`} className={`miniapp-ai-message max-w-[94%] rounded-xl border px-3 py-2.5 ${message.role === 'assistant' ? 'miniapp-ai-message-assistant mr-auto border-violet-400/40 bg-violet-500/20 text-violet-50' : 'miniapp-ai-message-user ml-auto border-cyan-400/40 bg-cyan-500/15 text-cyan-50'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`compact-${index}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `compact-${index}` ? null : prev)), 1300); }} className="text-slate-300 transition" title="Копировать">{copiedAiMessageKey === `compact-${index}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                  <div className="text-sm leading-relaxed">{renderMiniAiText(message.content)}</div>
                </div>
              ))}
              {aiLoadingTaskId === openedTask.id ? <p className="text-cyan-200">ИИ думает…</p> : null}
            </div>
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
                  <button key={`mini-ai-file-full-${file.name}-${file.size}`} type="button" className="miniapp-ai-file-pill inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-[10px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}>
                    <Paperclip size={10} />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                    <X size={10} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-end gap-2">
              <button type="button" className="miniapp-ai-attach-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-slate-200" onClick={() => aiAttachmentInputRef.current?.click()} title="Прикрепить файл">
                <Paperclip size={15} />
              </button>
              <textarea
                ref={aiTextareaRef}
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                placeholder="Напишите сообщение для ИИ"
                rows={1}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className="miniapp-ai-input max-h-[180px] w-full resize-none overflow-y-auto rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void sendAiMessage();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void sendAiMessage()}
                disabled={aiLoadingTaskId === openedTask.id}
                className="rounded-xl bg-violet-600 px-3 py-2 disabled:opacity-60"
                title="Отправить"
              >
                <SendHorizontal size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => { setClosingMiniWindow(null); setIsAiChatOpen(true); setIsAiChatMenuOpen(false); }}
        className="miniapp-ai-chat-launcher fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xl text-white shadow-2xl shadow-violet-950/40 ring-2 ring-white/20 active:scale-95"
        aria-label="Открыть чат с ИИ"
      >✦</button>

      {isAiChatOpen ? (
        <div className={`miniapp-ai-chat-backdrop miniapp-slide-backdrop fixed inset-0 z-[70] bg-slate-950/92 p-3 ${getMiniWindowMotionClass('ai-chat')}`}>
          <div className="miniapp-ai-chat-panel miniapp-slide-panel mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-violet-500/30 bg-slate-900 text-slate-100 shadow-2xl">
            <div className="miniapp-ai-chat-header flex items-start justify-between gap-2 border-b border-slate-800 p-3">
              <button type="button" onClick={() => setIsAiChatMenuOpen(true)} className="miniapp-ai-chat-icon-button rounded-md border border-slate-700 bg-slate-800 p-2" aria-label="Меню чатов и проектов"><Menu size={18} /></button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">Чат с ИИ</p>
                <h2 className="truncate text-base font-semibold">{activeAiChat?.title ?? 'Новый чат'}</h2>
                <p className="truncate text-xs text-slate-400">{activeAiChatProject?.icon} {activeAiChatProject?.title ?? 'Проект'}</p>
              </div>
              <button type="button" onClick={() => closeMiniWindowWithMotion('ai-chat', () => setIsAiChatOpen(false))} className="miniapp-ai-chat-icon-button rounded-md border border-slate-700 bg-slate-800 p-2" aria-label="Закрыть чат с ИИ"><X size={18} /></button>
            </div>
            <div className="miniapp-ai-chat-model border-b border-slate-800 p-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Модель</label>
              <select value={selectedAiChatModel} onChange={(event) => setSelectedAiChatModel(event.target.value as AiChatModel)} className="miniapp-ai-chat-select mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {AI_CHAT_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.creditsCost} кредитов</option>)}
              </select>
            </div>
            <div ref={aiChatDialogContainerRef} className="miniapp-ai-chat-thread min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {(activeAiChat?.messages ?? []).length === 0 ? <p className="miniapp-ai-chat-empty rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-400">Начните диалог: задайте вопрос, обсудите идею или попросите помочь с задачами.</p> : null}
              {(activeAiChat?.messages ?? []).map((message) => (
                <div key={message.id} className={`miniapp-ai-chat-message max-w-[88%] rounded-2xl border px-3 py-2 ${message.role === 'user' ? 'miniapp-ai-chat-message-user ml-auto border-cyan-400/40 bg-cyan-500/15 text-cyan-50' : 'miniapp-ai-chat-message-assistant mr-auto border-violet-400/40 bg-violet-500/20 text-violet-50'}`}>
                  <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>{message.role === 'assistant' ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(message.content); setCopiedAiMessageKey(`mini-chat-${message.id}`); setTimeout(() => setCopiedAiMessageKey((prev) => (prev === `mini-chat-${message.id}` ? null : prev)), 1300); }} className="text-slate-300" title="Копировать">{copiedAiMessageKey === `mini-chat-${message.id}` ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}</button> : null}</div>
                  <div className="text-sm leading-relaxed">{renderMiniAiText(message.content)}</div>
                </div>
              ))}
              {aiChatLoading ? <p className="text-sm text-cyan-200">ИИ думает…</p> : null}
              {aiChatError ? <p className="text-sm text-rose-300">{aiChatError}</p> : null}
            </div>
            <div className="miniapp-ai-chat-composer flex items-end gap-2 border-t border-slate-800 p-3">
              <textarea value={aiChatDraft} onChange={(event) => setAiChatDraft(event.target.value)} rows={1} placeholder="Напишите сообщение…" className="miniapp-ai-chat-input max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none" onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void sendAiChatQuestion(); } }} />
              <button type="button" onClick={() => void sendAiChatQuestion()} disabled={aiChatLoading || !aiChatDraft.trim()} className="miniapp-ai-chat-send flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white disabled:opacity-50" aria-label="Отправить сообщение"><SendHorizontal size={17} /></button>
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
                <h3 className="font-semibold">Проекты и чаты</h3>
                <button type="button" className="rounded-md border border-slate-700 p-1.5" onClick={() => setIsAiChatMenuOpen(false)}><X size={16} /></button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Проекты</p><button type="button" className="rounded-md bg-violet-600 p-1.5" onClick={() => openAiChatProjectDialog()}><Plus size={14} /></button></div>
                {aiChatProjects.map((project) => (
                  <div key={project.id} className={`rounded-xl border p-2 ${project.id === activeAiChatProject?.id ? 'border-violet-400 bg-violet-500/15' : 'border-slate-800 bg-slate-950/50'}`}>
                    <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => { setActiveAiChatProjectId(project.id); setActiveAiChatId(project.chats[0]?.id ?? ''); }}><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: project.color }}>{project.icon}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{project.title}</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="rounded-md border border-slate-700 px-2 py-1 text-xs" onClick={() => openAiChatProjectDialog(project.id)}><Settings size={12} className="inline" /> Настроить</button><button type="button" disabled={aiChatProjects.length <= 1} className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-200 disabled:opacity-40" onClick={() => deleteAiChatProject(project.id)}><Trash2 size={12} className="inline" /> Удалить</button></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Чаты</p><button type="button" className="rounded-md bg-cyan-600 p-1.5" onClick={createAiChatThread}><Plus size={14} /></button></div>
                {(activeAiChatProject?.chats ?? []).map((chat) => (
                  <div key={chat.id} className={`rounded-xl border p-2 ${chat.id === activeAiChat?.id ? 'border-cyan-400 bg-cyan-500/15' : 'border-slate-800 bg-slate-950/50'}`}>
                    <button type="button" className="w-full text-left" onClick={() => { setActiveAiChatId(chat.id); setIsAiChatMenuOpen(false); }}><span className="block truncate text-sm font-medium">{chat.title}</span><span className="text-[11px] text-slate-400">{chat.messages.length} сообщ.</span></button>
                    <div className="mt-2 flex gap-2"><button type="button" className="rounded-md border border-slate-700 px-2 py-1 text-xs" onClick={() => { setRenamingAiChatId(chat.id); setAiChatRenameDraft(chat.title); }}>Переименовать</button><button type="button" disabled={(activeAiChatProject?.chats.length ?? 0) <= 1} className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-200 disabled:opacity-40" onClick={() => deleteAiChatThread(chat.id)}>Удалить</button></div>
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
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => closeMiniWindowWithMotion('ai-rename', () => setRenamingAiChatId(null))}>Отмена</button><button type="button" className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold" onClick={saveAiChatRename}>Сохранить</button></div>
          </div>
        </div>
      ) : null}

      {isHabitModalOpen ? (
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center ${getMiniWindowMotionClass('habit')}`}>
          <div className="miniapp-slide-panel max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{editingHabitId ? 'Редактирование привычки' : 'Новая привычка'}</h2>
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
        <div className={`miniapp-slide-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center ${getMiniWindowMotionClass('create-task')}`}>
          <div className="miniapp-slide-panel max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Новая задача</h2>
              <button type="button" onClick={() => closeMiniWindowWithMotion('create-task', () => setIsCreateTaskModalOpen(false))} className="rounded-md border border-slate-600 p-1 text-slate-300" aria-label="Закрыть окно">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Название задачи</label>
                <input
                  autoFocus
                  value={createTaskDraft.title}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Описание</label>
                <textarea
                  value={createTaskDraft.description}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="miniapp-task-text-field min-h-20 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Срок</label>
                <input
                  type="datetime-local"
                  value={createTaskDraft.dueDate}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className="miniapp-task-text-field w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void createTask()}
                disabled={isCreatingTask}
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                {isCreatingTask ? 'Создаём…' : 'Создать задачу'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
