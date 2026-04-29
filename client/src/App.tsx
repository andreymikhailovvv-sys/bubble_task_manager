import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Bot, CalendarDays, Check, ChevronDown, ChevronRight, Eye, EyeOff, FileText, GripVertical, LayoutGrid, List, Maximize2, Minimize2, MousePointer2, Paperclip, Plus, RotateCcw, Search, SendHorizontal, X } from 'lucide-react';
import { motion, Reorder } from 'framer-motion';
import { BubbleField } from './components/BubbleField';
import { InlineDateTimePickerIcon } from './components/InlineDateTimePickerIcon';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { api, setUnauthorizedHandler, type CurrentUser } from './lib/api';
import { calcScore, type BubbleRankingMode } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { ChatAttachmentPayload, ChatMessage, ChatMode, Sphere, Task, TaskAttachment } from './lib/types';
import { LinkifiedText } from './components/LinkifiedText';

const MAX_SPHERES = 8;
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
  1: 'bg-sky-500/70 border-sky-300',
  2: 'bg-cyan-500/70 border-cyan-300',
  3: 'bg-violet-500/70 border-violet-300',
  4: 'bg-orange-500/70 border-orange-300',
  5: 'bg-rose-500/75 border-rose-300'
};
const getAiReadCursorStorageKey = (userId: string) => `btm:${userId}:ai-read-cursor-by-task`;
const getBackgroundStorageKey = (userId: string) => `btm:${userId}:background-image`;
const getBackgroundOverlayStorageKey = (userId: string) => `btm:${userId}:background-overlay-opacity`;
const DEFAULT_BACKGROUND_OVERLAY_OPACITY = 0.65;
const MIN_BACKGROUND_OVERLAY_OPACITY = 0.2;
const MAX_BACKGROUND_OVERLAY_OPACITY = 0.9;
const HELP_WITH_TASK_PROMPT = [
  'Помоги мне выполнить эту задачу, используя весь контекст задачи и подзадач.',
  'Если информации уже достаточно — сразу дай конкретный план действий, приоритеты и ближайшие шаги.',
  'Если данных недостаточно — сначала задай наводящие вопросы, чтобы уточнить контекст, а потом предложи конкретную помощь.'
].join(' ');
const BOLD_MARKUP_PATTERN = /(\*\*[\s\S]+?\*\*)/g;
const OVERDUE_CHECK_INTERVAL_MS = 30_000;
const OVERDUE_NUDGE_RETRY_INTERVAL_MS = 60_000;
const MAX_SHINE_WINDOW_MINUTES = 180;
const DISPLAY_MODE_OPTIONS = [
  { value: 'bubbles', label: 'Баблы', icon: LayoutGrid, iconClassName: 'text-cyan-300' },
  { value: 'list', label: 'Список', icon: List, iconClassName: 'text-violet-300' },
  { value: 'timeline', label: 'Таймлайн', icon: CalendarDays, iconClassName: 'text-amber-300' }
] as const;
type DisplayMode = (typeof DISPLAY_MODE_OPTIONS)[number]['value'];
type GeneralAiUndoOperation = {
  taskId: string;
  previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
};
type GeneralAiMessage = ChatMessage & { id: string };

function renderAiMessageContent(content: string): ReactNode {
  return content.split(BOLD_MARKUP_PATTERN).map((part, index) => {
    if (!part) return null;
    const isBoldMarkup = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    if (!isBoldMarkup) {
      return <span key={`plain-${index}`}>{part}</span>;
    }

    const boldText = part.slice(2, -2);
    if (!boldText) return null;

    return (
      <strong key={`bold-${index}`} className="font-semibold text-white">
        {boldText}
      </strong>
    );
  });
}

function resolveAttachmentMimeType(file: File): string {
  const fromBrowser = file.type?.trim();
  if (fromBrowser) return fromBrowser;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) return 'application/octet-stream';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
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

type TimelineViewData = {
  title: string;
  tasksWithoutDate: Task[];
  tasksInRange: Task[];
  dayGroups: Array<{ key: string; date: Date; tasks: Task[] }>;
  hourGroups: Array<{ hour: number; tasks: Task[] }>;
  monthCells: Array<{ key: string; date: Date | null; tasks: Task[] }>;
};

function buildTimelineViewData(
  listTasks: Task[],
  timelineAnchorDate: Date,
  timelineViewMode: 'day' | 'week' | 'month'
): TimelineViewData {
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

  const tasksInRange = datedTasks.filter(({ dueDate }) => dueDate >= rangeStart && dueDate < rangeEnd);
  const dayGroups = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const start = startOfDay(date);
    const end = addDays(start, 1);
    return {
      key: start.toISOString(),
      date,
      tasks: tasksInRange.filter(({ dueDate }) => dueDate >= start && dueDate < end).map(({ task }) => task)
    };
  });
  const hourGroups = Array.from({ length: 24 }, (_, hour) => {
    const start = new Date(dayStart);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    return {
      hour,
      tasks: tasksInRange.filter(({ dueDate }) => dueDate >= start && dueDate < end).map(({ task }) => task)
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
      tasks: tasksInRange.filter(({ dueDate }) => dueDate >= start && dueDate < end).map(({ task }) => task)
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bubbles');
  const [isDisplayModeMenuOpen, setIsDisplayModeMenuOpen] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState<'day' | 'week' | 'month'>('month');
  const [timelineAnchorDate, setTimelineAnchorDate] = useState(() => new Date());
  const [isTaskDragEnabled, setIsTaskDragEnabled] = useState(false);
  const [draggedTimelineTaskId, setDraggedTimelineTaskId] = useState<string | null>(null);
  const [draggedListTaskId, setDraggedListTaskId] = useState<string | null>(null);
  const [listDropPreview, setListDropPreview] = useState<{ y: number; dueDateIso: string } | null>(null);
  const [editorState, setEditorState] = useState<{ task?: Task; initialSphereId?: string } | null>(null);
  const [sectorEditorSphere, setSectorEditorSphere] = useState<Sphere | null>(null);
  const [poppingTaskId, setPoppingTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedDraft, setFocusedDraft] = useState<Partial<Task> | null>(null);
  const [focusedNotifyPreset, setFocusedNotifyPreset] = useState('30');
  const [listHoveredTaskId, setListHoveredTaskId] = useState<string | null>(null);
  const [expandedListTaskIds, setExpandedListTaskIds] = useState<string[]>([]);
  const [hideClosedFocusedSubtasks, setHideClosedFocusedSubtasks] = useState(true);
  const [isAddingFocusedSubtask, setIsAddingFocusedSubtask] = useState(false);
  const [focusedSubtaskTitle, setFocusedSubtaskTitle] = useState('');
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
  const [aiMode, setAiMode] = useState<ChatMode>('fast');
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [aiReadCursorByTask, setAiReadCursorByTask] = useState<Record<string, number>>({});
  const [generalAiMessages, setGeneralAiMessages] = useState<GeneralAiMessage[]>([]);
  const [generalAiSearchQuery, setGeneralAiSearchQuery] = useState('');
  const [isGeneralAiSearchOpen, setIsGeneralAiSearchOpen] = useState(false);
  const [generalAiDraft, setGeneralAiDraft] = useState('');
  const [isGeneralAiFullscreen, setIsGeneralAiFullscreen] = useState(false);
  const [generalAiLoading, setGeneralAiLoading] = useState(false);
  const [generalAiError, setGeneralAiError] = useState<string | null>(null);
  const [lastGeneralAiUndoOperations, setLastGeneralAiUndoOperations] = useState<GeneralAiUndoOperation[]>([]);
  const [subtaskOrderMap, setSubtaskOrderMap] = useState<Record<string, string[]>>({});
  const [isSubtaskFilterActive, setIsSubtaskFilterActive] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundOverlayOpacity, setBackgroundOverlayOpacity] = useState(DEFAULT_BACKGROUND_OVERLAY_OPACITY);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const focusedSubtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const focusedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const expandedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const generalAiFullscreenDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const expandedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusedTaskAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const focusedDueDateInputRef = useRef<HTMLInputElement | null>(null);
  const displayModeMenuRef = useRef<HTMLDivElement | null>(null);
  const focusedAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedAutosaveSignatureRef = useRef<string | null>(null);
  const overdueNudgeAttemptAtByTaskRef = useRef<Record<string, number>>({});
  const loadedAiHistoryTaskIdsRef = useRef<Set<string>>(new Set());
  const [overdueTick, setOverdueTick] = useState(0);

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
    const sphereData = await api.getSpheres();
    const taskData = await api.getTasks();
    setSpheres(sphereData);
    setTasks(taskData);
  }

  const clearUserState = () => {
    setCurrentUser(null);
    setSpheres([]);
    setTasks([]);
    setEditorState(null);
    setSectorEditorSphere(null);
    setPoppingTaskId(null);
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
      setAiMode('fast');
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
      } catch {
        if (isCancelled) return;
        setGeneralAiMessages([]);
      }
    };
    void loadGeneralAiHistory();

    setBackgroundImage(localStorage.getItem(getBackgroundStorageKey(currentUser.id)));
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
    localStorage.setItem(getAiReadCursorStorageKey(currentUser.id), JSON.stringify(aiReadCursorByTask));
  }, [aiReadCursorByTask, currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !focusedTaskId) return;
    if (loadedAiHistoryTaskIdsRef.current.has(focusedTaskId)) return;
    let isCancelled = false;
    const loadAiTaskHistory = async () => {
      try {
        const result = await api.getTaskAssistantHistory(focusedTaskId);
        if (isCancelled) return;
        loadedAiHistoryTaskIdsRef.current.add(focusedTaskId);
        setAiDialogByTask((prev) => ({ ...prev, [focusedTaskId]: result.messages }));
      } catch {
        if (isCancelled) return;
        loadedAiHistoryTaskIdsRef.current.add(focusedTaskId);
      }
    };
    void loadAiTaskHistory();
    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, focusedTaskId]);

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
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isDisplayModeMenuOpen, isSphereFilterOpen]);

  useEffect(() => {
    if (!currentUser) {
      overdueNudgeAttemptAtByTaskRef.current = {};
      return;
    }

    const isOverdue = (task: Task) => {
      if (task.parentTaskId) return false;
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
                : [...previousDialog, { role: 'assistant', content: answer }];
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
        return toDeadlineTimestamp(a) - toDeadlineTimestamp(b);
      });
      return acc;
    }, {}),
    [subtaskMap]
  );
  const activeTasks = useMemo(() => rootTasks.filter((task) => task.status !== 'DONE'), [rootTasks]);
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
  const focusedTask = useMemo(() => rootTasks.find((task) => task.id === focusedTaskId) ?? null, [rootTasks, focusedTaskId]);
  const focusedAiDialog = useMemo(
    () => (focusedTask ? aiDialogByTask[focusedTask.id] ?? [] : []),
    [aiDialogByTask, focusedTask]
  );
  const filteredFocusedAiDialog = useMemo(() => {
    if (!isFocusedAiSearchOpen) return focusedAiDialog;
    const query = focusedAiSearchQuery.trim().toLowerCase();
    if (!query) return focusedAiDialog;
    return focusedAiDialog.filter((message) => message.content.toLowerCase().includes(query));
  }, [focusedAiDialog, focusedAiSearchQuery, isFocusedAiSearchOpen]);
  const filteredGeneralAiMessages = useMemo(() => {
    if (!isGeneralAiSearchOpen) return generalAiMessages;
    const query = generalAiSearchQuery.trim().toLowerCase();
    if (!query) return generalAiMessages;
    return generalAiMessages.filter((message) => message.content.toLowerCase().includes(query));
  }, [generalAiMessages, generalAiSearchQuery, isGeneralAiSearchOpen]);

  useEffect(() => {
    if (!focusedTask) {
      setFocusedDraft(null);
      setIsAddingFocusedSubtask(false);
      setFocusedSubtaskTitle('');
      setIsAiSubtasksPromptOpen(false);
      setAiSubtasksPrompt('');
      setAiDraft('');
      setAiError(null);
      setIsAiExpanded(false);
      setAiMode('fast');
      setAiPendingFiles([]);
      setFocusedAiSearchQuery('');
      setIsFocusedAiSearchOpen(false);
      setHideClosedFocusedSubtasks(true);
      setFocusedTaskAttachments([]);
      setAiSubtasksLoadingTaskId(null);
      focusedAutosaveSignatureRef.current = null;
      return;
    }
    setFocusedDraft(focusedTask);
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
      importance: focusedTask.importance ?? 3,
      urgency: focusedTask.urgency ?? 3,
      status: focusedTask.status ?? 'TODO'
    });
  }, [focusedTask]);

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
  }, [focusedTask?.id, focusedDraft]);

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
    const nextDialog = [...previousDialog, { role: 'user' as const, content: userContent }];
    setAiDialogByTask((prev) => ({ ...prev, [taskId]: nextDialog }));
    setAiDraft('');
    setAiPendingFiles([]);
    setAiError(null);
    setAiLoadingTaskId(taskId);

    try {
      const result = await askTaskAssistant(taskId, {
        question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.',
        userMessage: userContent,
        mode: options?.modeOverride ?? aiMode,
        attachments: attachmentsPayload
      });
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { role: 'assistant', content: result.answer }]
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
      setAiError(message);
      setAiDialogByTask((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? nextDialog), { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.' }]
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
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить ответ общего ИИ-чата';
      setGeneralAiError(message);
      setGeneralAiMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: 'Не удалось выполнить запрос. Попробуйте ещё раз.' }
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
  const effectiveTimeFilter = isTimelineMode ? 'all' : timeFilter;
  const shouldApplySphereFilter = !isTimelineMode;

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
    [activeTasks, effectiveTimeFilter, search, selectedSphereIds, shouldApplySphereFilter, spheres.length, subtaskMap]
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

  const persistTask = async (payload: Partial<Task>) => {
    const normalized = {
      ...payload,
      importance: payload.importance ?? 3,
      urgency: payload.urgency ?? 3,
      status: payload.status ?? 'TODO'
    };
    const score = calcScore(normalized.importance, normalized.urgency);

    if (editorState?.task?.id) {
      await api.updateTask(editorState.task.id, { ...normalized, priorityScore: score });
    } else {
      await api.createTask({ ...normalized, priorityScore: score });
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
    const score = calcScore(normalized.importance, normalized.urgency);
    await api.updateTask(editorState.task.id, { ...normalized, priorityScore: score });
  };

  const createTaskFromAi = async (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments: ChatAttachmentPayload[] }) => {
    const generated = await api.generateTaskFromAi(payload);
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
      [createdTask.id]: [{ role: 'assistant', content: generated.firstAssistantMessage }]
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

  const completeTask = async (task: Task) => {
    setPoppingTaskId(task.id);
    await new Promise((resolve) => setTimeout(resolve, 320));
    await api.updateTask(task.id, { status: 'DONE' });
    setPoppingTaskId(null);
    setEditorState(null);
    setFocusedTaskId(null);
    await load();
  };

  const saveFocusedTask = async () => {
    if (!focusedTask || !focusedDraft) return;
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
      await api.updateTask(parentTaskId, { status: 'DONE' });
    }
    if (!allDone && parentTask.status === 'DONE') {
      await api.updateTask(parentTaskId, { status: 'TODO' });
    }
    return allDone;
  };

  const toggleSubtaskDone = async (subtask: Task) => {
    const nextStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    await api.updateTask(subtask.id, { status: nextStatus });
    if (subtask.parentTaskId) {
      const parentCompleted = await syncParentStatusBySubtasks(subtask.parentTaskId);
      if (parentCompleted && focusedTaskId === subtask.parentTaskId) {
        setFocusedTaskId(null);
        setFocusedDraft(null);
      }
    }
    await load();
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
    if (parentTask.status === 'DONE') {
      await api.updateTask(parentTask.id, { status: 'TODO' });
    }
    await load();
    return createdSubtask;
  };

  const addFocusedSubtask = async () => {
    if (!focusedTask) return;
    const title = focusedSubtaskTitle.trim() || 'Новая доп задача';
    await createSubtaskForParent(focusedTask, { title, notifyBeforeMinutes: 30 });
    setFocusedSubtaskTitle('');
    setIsAddingFocusedSubtask(false);
  };

  const generateFocusedSubtasksWithAi = async () => {
    if (!focusedTask) return;
    setAiError(null);
    setAiSubtasksLoadingTaskId(focusedTask.id);
    try {
      await api.generateTaskSubtasks(focusedTask.id, { note: aiSubtasksPrompt.trim() || undefined });
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

  const askTaskAssistant = async (taskId: string, payload: { question: string; userMessage?: string; mode: ChatMode; attachments?: ChatAttachmentPayload[] }) => {
    return api.askTaskAssistant(taskId, payload);
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
      <main className="flex h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
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

  const sphereById = new Map(spheres.map((sphere) => [sphere.id, sphere]));
  const getTimelineTaskViewModel = (task: Task) => {
    const taskSubtasks = displayedSubtaskMap[task.id] ?? [];
    const hasOverdueSubtask = taskSubtasks.some((subtask) => subtask.status !== 'DONE' && isOverdue(subtask));
    const hasReminderSubtask = taskSubtasks.some((subtask) => subtask.status !== 'DONE' && !isOverdue(subtask) && shouldTaskGlow(subtask));
    const hasOverdueState = task.status !== 'DONE' && (isOverdue(task) || hasOverdueSubtask);
    const hasReminderState = task.status !== 'DONE' && !hasOverdueState && (shouldTaskGlow(task) || hasReminderSubtask);
    const taskSphere = task.sphereId ? (sphereById.get(task.sphereId) ?? null) : null;
    const sphereColor = taskSphere?.color ?? '#64748b';
    return {
      taskSubtasks,
      hasOverdueState,
      hasReminderState,
      sphereColor
    };
  };
  const renderTimelineTaskChip = (task: Task, options?: { showTime?: boolean }) => {
    const { taskSubtasks, hasOverdueState, hasReminderState, sphereColor } = getTimelineTaskViewModel(task);
    const canDragTask = isTaskDragEnabled && task.status !== 'DONE' && Boolean(task.dueDate);
    return (
      <motion.button
        layout
        key={task.id}
        type="button"
        draggable={canDragTask}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-xs text-slate-100 transition-all duration-200 hover:brightness-110 ${
          canDragTask ? 'cursor-grab active:cursor-grabbing' : ''
        } ${draggedTimelineTaskId === task.id ? 'opacity-60' : ''}`}
        style={{
          borderColor: hasOverdueState ? 'rgba(251,113,133,0.85)' : sphereColor,
          backgroundColor: hasOverdueState
            ? 'rgba(136,19,55,0.45)'
            : hexToRgba(sphereColor, 0.34) ?? 'rgba(100,116,139,0.34)',
          boxShadow: hasOverdueState
            ? '0 0 12px rgba(239,68,68,0.45), inset 0 0 8px rgba(239,68,68,0.2)'
            : hasReminderState
              ? '0 0 12px rgba(56,189,248,0.45), inset 0 0 8px rgba(56,189,248,0.2)'
              : undefined,
          animation: hasOverdueState
            ? 'subtask-overdue-glow 2.3s ease-in-out infinite'
            : hasReminderState
              ? 'subtask-reminder-glow 2.3s ease-in-out infinite'
              : undefined
        }}
        onDragStartCapture={(event) => {
          if (!canDragTask) return;
          setDraggedTimelineTaskId(task.id);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/task-id', task.id);
        }}
        onDragEndCapture={() => setDraggedTimelineTaskId(null)}
        onClick={() => setFocusedTaskId(task.id)}
      >
        <span className="truncate">
          <LinkifiedText text={task.title} stopPropagationOnLinkClick />
          {options?.showTime && task.dueDate ? (
            <span className="ml-1 text-slate-200/80">
              ({new Date(task.dueDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
            </span>
          ) : null}
        </span>
        <span className="rounded-full border border-slate-200/30 px-1.5 py-0.5 text-[10px] text-slate-100/90">
          {taskSubtasks.length}
        </span>
      </motion.button>
    );
  };

  const listTasks = [...visibleTasks].sort((a, b) => {
    if (isTimelineMode) {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'ru');
    }
    if (rankingMode === 'importance' && a.importance !== b.importance) return b.importance - a.importance;
    if (rankingMode === 'urgency' && a.urgency !== b.urgency) return b.urgency - a.urgency;
    if (a.urgency !== b.urgency) return b.urgency - a.urgency;
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    if (a.importance !== b.importance) return b.importance - a.importance;
    return a.title.localeCompare(b.title, 'ru');
  });
  const activeListTasks = listTasks.filter((task) => task.status !== 'DONE');
  const timelineViewData = (() => {
    try {
      return buildTimelineViewData(listTasks, timelineAnchorDate, timelineViewMode);
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
  const isTimelineDragging = isTaskDragEnabled && draggedTimelineTaskId !== null;
  const isListDragging = isTaskDragEnabled && draggedListTaskId !== null;

  const getListDropDueDate = (clientY: number) => {
    const now = Date.now();
    const windowStart = now - (12 * 60 * 60 * 1000);
    const windowEnd = now + (14 * 24 * 60 * 60 * 1000);
    const ratio = Math.max(0, Math.min(1, clientY / window.innerHeight));
    return new Date(windowStart + ratio * (windowEnd - windowStart)).toISOString();
  };

  const applyTaskDueDate = async (taskId: string, nextDueDateIso: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const previousDueDate = task.dueDate ?? null;
    setTasks((prev) => prev.map((item) => (item.id === taskId ? { ...item, dueDate: nextDueDateIso, updatedAt: new Date().toISOString() } : item)));
    try {
      await api.updateTask(taskId, { dueDate: nextDueDateIso });
    } catch {
      setTasks((prev) => prev.map((item) => (item.id === taskId ? { ...item, dueDate: previousDueDate, updatedAt: new Date().toISOString() } : item)));
      await load();
    }
  };

  const handleTimelineTaskDrop = async (target: { date: Date; hour?: number; keepOriginalTime?: boolean }) => {
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
      nextDueDate.setHours(target.hour, currentDueDate.getMinutes(), 0, 0);
    }

    const nextDueDateIso = nextDueDate.toISOString();
    setTasks((prev) => prev.map((item) => (
      item.id === taskId
        ? { ...item, dueDate: nextDueDateIso, updatedAt: new Date().toISOString() }
        : item
    )));

    try {
      await api.updateTask(taskId, { dueDate: nextDueDateIso });
    } catch {
      setTasks((prev) => prev.map((item) => (
        item.id === taskId
          ? { ...item, dueDate: previousDueDate, updatedAt: new Date().toISOString() }
          : item
      )));
      await load();
    }
  };

  return (
    <main
      className="flex h-screen flex-col overflow-hidden p-4 text-slate-100 lg:p-6"
      style={{
        backgroundImage: backgroundImage
          ? `linear-gradient(rgba(2,6,23,${backgroundOverlayOpacity}), rgba(2,6,23,${backgroundOverlayOpacity})), url(${backgroundImage})`
          : undefined,
        backgroundSize: backgroundImage ? 'cover' : undefined,
        backgroundPosition: backgroundImage ? 'center' : undefined
      }}
    >
      <header className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 backdrop-blur">
        <h1 className="mr-3 text-xl font-semibold">Bubble Task Manager</h1>
        <div className="mr-1 text-xs text-slate-300">{currentUser.name ?? currentUser.username ?? currentUser.email ?? 'Локальный пользователь'}</div>
        {currentUser.username ? (
          <div className="rounded bg-emerald-700/80 px-2 py-1 text-xs">Аккаунт: {currentUser.username}</div>
        ) : (
          <div className="rounded bg-slate-700 px-2 py-1 text-xs">Гостевой режим</div>
        )}
        <input className="min-w-52 flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm" placeholder="Поиск по задачам" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded bg-cyan-700 px-3 py-2 text-sm" onClick={() => setAuthModalMode('login')}>Войти</button>
        <button className="rounded bg-indigo-700 px-3 py-2 text-sm" onClick={() => setAuthModalMode('register')}>Регистрация</button>
        <button
          className="rounded bg-slate-700 px-3 py-2 text-sm"
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-600 bg-slate-900/85 transition hover:border-cyan-300/70"
            onClick={() => setIsDisplayModeMenuOpen((prev) => !prev)}
            aria-label="Выбрать режим отображения"
          >
            <selectedDisplayMode.icon size={20} className={selectedDisplayMode.iconClassName} />
          </button>
          {isDisplayModeMenuOpen ? (
            <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-44 rounded-xl border border-slate-700/70 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
              {DISPLAY_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                    option.value === displayMode
                      ? 'bg-slate-700/90 text-slate-50'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  }`}
                  onClick={() => {
                    setDisplayMode(option.value);
                    setIsDisplayModeMenuOpen(false);
                  }}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-900/80">
                    <option.icon size={18} className={option.iconClassName} />
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative w-full min-w-52 flex-1 sm:w-auto sm:flex-none" data-sphere-filter-root="true">
          <button
            className={`flex w-full items-center justify-between rounded p-2 text-left text-sm ${
              isTimelineMode ? 'cursor-not-allowed bg-slate-800/55 text-slate-500' : 'bg-slate-800'
            }`}
            disabled={isTimelineMode}
            onClick={() => setIsSphereFilterOpen((prev) => !prev)}
          >
            <span className="truncate">{sphereFilterLabel}</span>
            <span className="ml-2 text-xs text-slate-400">{isSphereFilterOpen ? '▲' : '▼'}</span>
          </button>
          {isSphereFilterOpen ? (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-slate-700/70 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
              <label className="mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-800/80">
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
                  <label key={sphere.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-800/80">
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
          <select
            className={`w-full rounded p-2 text-sm ${isTimelineMode ? 'cursor-not-allowed bg-slate-800/55 text-slate-500' : 'bg-slate-800'}`}
            value={timeFilter}
            disabled={isTimelineMode}
            onChange={(event) => setTimeFilter(event.target.value as 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'focus')}
          >
            <option value="all">За все время</option>
            <option value="today">За сегодня</option>
            <option value="tomorrow">За завтра</option>
            <option value="week">За эту неделю</option>
            <option value="month">За этот месяц</option>
            <option value="focus">Фокус</option>
          </select>
        </div>
        <div className="w-full min-w-40 flex-1 sm:w-auto sm:flex-none">
          <select
            className={`w-full rounded p-2 text-sm ${isTimelineMode ? 'cursor-not-allowed bg-slate-800/55 text-slate-500' : 'bg-slate-800'}`}
            value={rankingMode}
            disabled={isTimelineMode}
            onChange={(event) => setRankingMode(event.target.value as BubbleRankingMode)}
          >
            <option value="urgency">По срочности</option>
            <option value="importance">По важности</option>
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-xs transition ${
              isTaskDragEnabled
                ? 'border-cyan-300 bg-cyan-700/60 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.5)]'
                : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-cyan-300/70'
            }`}
            onClick={() => {
              setIsTaskDragEnabled((prev) => !prev);
              setDraggedTimelineTaskId(null);
              setDraggedListTaskId(null);
              setListDropPreview(null);
            }}
            title="Перетаскивание задач (все режимы)"
            aria-label="Переключить перетаскивание задач"
          >
            <MousePointer2 size={14} />
          </button>
          <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => setMode((m) => (m === 'global' ? 'sectors' : 'global'))}>{mode === 'global' ? 'Сектора' : 'Общий круг'}</button>
          <button className="flex items-center gap-1 rounded bg-cyan-700 px-3 py-2 text-sm" onClick={() => setEditorState({ initialSphereId: spheres[0]?.id })}><Plus size={16} /> Задача</button>
          <button
            className="flex items-center gap-1 rounded bg-indigo-700 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={spheres.length >= MAX_SPHERES}
            onClick={() => setSectorEditorSphere({ id: '', name: '', color: HARMONIOUS_COLORS[0], icon: 'briefcase' })}
          >
            <Plus size={16} /> Сектор
          </button>
        </div>
      </section>

      {authModalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{authModalMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
              <button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={closeAuthModal}>Закрыть</button>
            </div>
            <div className="space-y-2">
              <input className="w-full rounded bg-slate-800 px-3 py-2 text-sm" placeholder="Логин" value={authLogin} onChange={(e) => setAuthLogin(e.target.value)} />
              <input className="w-full rounded bg-slate-800 px-3 py-2 text-sm" placeholder="Пароль" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
              {authModalMode === 'register' ? (
                <input className="w-full rounded bg-slate-800 px-3 py-2 text-sm" placeholder="Имя (для регистрации)" value={authName} onChange={(e) => setAuthName(e.target.value)} />
              ) : null}
              {authError ? <div className="text-xs text-rose-300">{authError}</div> : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="flex-1 rounded bg-slate-700 px-3 py-2 text-sm" onClick={closeAuthModal}>Отмена</button>
              <button className={`flex-1 rounded px-3 py-2 text-sm ${authModalMode === 'login' ? 'bg-cyan-700' : 'bg-indigo-700'}`} onClick={submitAuth}>
                {authModalMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden pr-[320px]">
        {displayMode === 'bubbles' ? (
          <BubbleField
            className="h-full"
            tasks={visibleTasks}
            spheres={visibleSpheres}
            rankingMode={rankingMode}
            subtaskMap={displayedSubtaskMap}
            isSubtaskFilterActive={isSubtaskFilterActive}
            onToggleSubtaskFilter={() => setIsSubtaskFilterActive((prev) => !prev)}
            mode={mode}
            poppingTaskId={poppingTaskId}
            hasAiNotification={hasUnreadAiMessage}
            selectedId={editorState?.task?.id}
            onSelect={(task) => {
              setFocusedTaskId(task.id);
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
            onAddTaskToSphere={(sphere) => setEditorState({ initialSphereId: sphere.id })}
            onRenameSphere={(sphere) => setSectorEditorSphere(sphere)}
          />
        ) : displayMode === 'list' ? (
          <div className="h-full overflow-y-auto rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-900/80 via-slate-950/76 to-indigo-950/72 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)] backdrop-blur-sm">
            <ul className="space-y-3 pr-1">
              {activeListTasks.length === 0 ? (
                <li className="rounded-xl border border-slate-700/70 bg-slate-900/75 px-4 py-3 text-sm text-slate-300">
                  Нет задач для выбранных фильтров
                </li>
              ) : null}
              {activeListTasks.map((task) => {
                const taskSubtasks = displayedSubtaskMap[task.id] ?? [];
                const hasOverdueSubtask = taskSubtasks.some((subtask) => subtask.status !== 'DONE' && isOverdue(subtask));
                const hasReminderSubtask = taskSubtasks.some((subtask) => subtask.status !== 'DONE' && !isOverdue(subtask) && shouldTaskGlow(subtask));
                const isExpandedByState = shouldTaskGlow(task) || isOverdue(task) || hasOverdueSubtask || hasReminderSubtask;
                const isExpandedTask = isExpandedByState || expandedListTaskIds.includes(task.id);
                const hasOverdueState = task.status !== 'DONE' && isOverdue(task);
                const hasReminderState = task.status !== 'DONE' && !hasOverdueState && shouldTaskGlow(task);
                const isHoveredTask = listHoveredTaskId === task.id;
                const taskSphere = task.sphereId ? (sphereById.get(task.sphereId) ?? null) : null;
                const sphereColor = taskSphere?.color ?? '#64748b';
                const sectorBadgeStyle = {
                  backgroundColor: hexToRgba(sphereColor, 0.26) ?? 'rgba(100,116,139,0.25)',
                  borderColor: sphereColor
                };
                return (
                  <motion.li
                    key={task.id}
                    layout
                    draggable={isTaskDragEnabled}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition hover:border-cyan-300/70 hover:bg-slate-800/70 ${
                      hasOverdueState
                        ? 'border-rose-400/70 bg-rose-950/25'
                        : hasReminderState
                          ? 'border-cyan-300/60 bg-cyan-950/20'
                          : 'border-slate-700/70 bg-slate-900/75'
                    }`}
                    style={hasOverdueState
                      ? { boxShadow: '0 0 12px rgba(239,68,68,0.45), inset 0 0 8px rgba(239,68,68,0.2)', animation: `${isHoveredTask ? 'subtask-overdue-glow-static' : 'subtask-overdue-glow'} 2.3s ease-in-out infinite` }
                      : hasReminderState
                        ? { boxShadow: '0 0 12px rgba(56,189,248,0.45), inset 0 0 8px rgba(56,189,248,0.2)', animation: `${isHoveredTask ? 'subtask-reminder-glow-static' : 'subtask-reminder-glow'} 2.3s ease-in-out infinite` }
                        : undefined}
                    onMouseEnter={() => setListHoveredTaskId(task.id)}
                    onMouseLeave={() => setListHoveredTaskId((prev) => (prev === task.id ? null : prev))}
                    onDragStartCapture={(event) => {
                      if (!isTaskDragEnabled) return;
                      setDraggedListTaskId(task.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/task-id', task.id);
                    }}
                    onDragOverCapture={(event) => {
                      if (!isListDragging) return;
                      event.preventDefault();
                      setListDropPreview({ y: event.clientY, dueDateIso: getListDropDueDate(event.clientY) });
                    }}
                    onDropCapture={async (event) => {
                      if (!isTaskDragEnabled) return;
                      event.preventDefault();
                      const taskId = draggedListTaskId ?? event.dataTransfer.getData('text/task-id');
                      const dueDateIso = getListDropDueDate(event.clientY);
                      if (taskId) await applyTaskDueDate(taskId, dueDateIso);
                      setDraggedListTaskId(null);
                      setListDropPreview(null);
                    }}
                    onDragEndCapture={() => {
                      setDraggedListTaskId(null);
                      setListDropPreview(null);
                    }}
                    onClick={() => setFocusedTaskId(task.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="mt-0.5 rounded p-0.5 text-slate-300 hover:bg-slate-700/70"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedListTaskIds((prev) => (prev.includes(task.id) ? prev.filter((id) => id !== task.id) : [...prev, task.id]));
                            }}
                            title={isExpandedTask ? 'Свернуть задачу' : 'Развернуть задачу'}
                          >
                            {isExpandedTask ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <h3 className={`text-sm font-semibold ${task.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                            <LinkifiedText text={task.title} stopPropagationOnLinkClick />
                          </h3>
                          <span className={`shrink-0 text-[11px] ${hasOverdueState ? 'text-rose-200' : 'text-slate-300'}`}>
                            {formatDeadlineLeft(task.dueDate)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="rounded-full border px-2 py-0.5 text-[11px] text-slate-100"
                          style={sectorBadgeStyle}
                        >
                          Сектор: {taskSphere?.name ?? 'Без сектора'}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] text-slate-100 ${IMPORTANCE_STYLES[task.importance] ?? IMPORTANCE_STYLES[3]}`}>
                          Важность: {task.importance}
                        </span>
                      </div>
                    </div>
                    {isExpandedTask ? (
                      <div className="mt-2 space-y-2 text-xs text-slate-200">
                        <p className="text-slate-300"><LinkifiedText text={task.description} fallback="Без описания" stopPropagationOnLinkClick /></p>
                        <p className="text-slate-400">Срок: {formatTaskDueDate(task.dueDate)}</p>
                        <div>
                          <p className="mb-1 text-slate-300">Подзадачи:</p>
                          <ul className="space-y-1">
                            {taskSubtasks.length === 0 ? <li className="text-slate-500">Подзадач пока нет</li> : null}
                            {taskSubtasks.map((subtask) => {
                              const hasSubtaskOverdueState = subtask.status !== 'DONE' && isOverdue(subtask);
                              const hasSubtaskReminderState = subtask.status !== 'DONE' && !hasSubtaskOverdueState && shouldTaskGlow(subtask);
                              return (
                                <li
                                  key={subtask.id}
                                  className={`flex items-center gap-2 rounded border px-2 py-1 ${
                                    hasSubtaskOverdueState
                                      ? 'border-rose-400/70 bg-rose-950/25'
                                      : hasSubtaskReminderState
                                        ? 'border-cyan-300/60 bg-cyan-950/25'
                                        : 'border-slate-700/70 bg-slate-800/70'
                                  }`}
                                  style={hasSubtaskOverdueState
                                    ? { animation: 'subtask-overdue-glow 2.3s ease-in-out infinite' }
                                    : hasSubtaskReminderState
                                      ? { animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
                                      : undefined}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={subtask.status === 'DONE'}
                                    onChange={() => {
                                      void toggleSubtaskDone(subtask);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className={`flex-1 truncate text-left ${subtask.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-100'}`}
                                    onClick={() => setEditorState({ task: subtask })}
                                  >
                                    <LinkifiedText text={subtask.title} stopPropagationOnLinkClick />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </motion.li>
                );
              })}
            </ul>
            {listDropPreview ? (
              <div
                className="pointer-events-none fixed z-40 -translate-y-full rounded-lg border border-cyan-300/70 bg-slate-900/95 px-2 py-1 text-xs text-cyan-100 shadow-lg"
                style={{ left: 24, top: listDropPreview.y - 8 }}
              >
                Перенос на: {formatTaskDueDate(listDropPreview.dueDateIso)}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-full overflow-y-auto rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-900/80 via-slate-950/76 to-indigo-950/72 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)] backdrop-blur-sm">
            <div className="space-y-4 pr-1">
              <section className="sticky top-0 z-20 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/70"
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
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/70"
                      onClick={() => setTimelineAnchorDate(new Date())}
                    >
                      Сегодня
                    </button>
                    <button
                      className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/70"
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
                  <h3 className="text-sm font-semibold text-cyan-100">{timelineViewData.title}</h3>
                  <div className="flex items-center gap-2">

                    <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/70 p-1">
                      {([
                        { key: 'day', label: 'День' },
                        { key: 'week', label: 'Неделя' },
                        { key: 'month', label: 'Месяц' }
                      ] as const).map((mode) => (
                        <button
                          key={mode.key}
                          className={`rounded-md px-2 py-1 text-xs transition ${
                            timelineViewMode === mode.key
                              ? 'bg-cyan-700 text-white'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                          onClick={() => setTimelineViewMode(mode.key)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {timelineViewData.tasksInRange.length === 0 ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/75 px-4 py-3 text-sm text-slate-300">
                  Нет задач с датой для выбранного режима
                </div>
              ) : null}

              {timelineViewMode === 'month' ? (
                <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
                  <div className="mb-2 grid grid-cols-7 gap-2">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName, index) => (
                      <div
                        key={dayName}
                        className={`text-center text-xs font-semibold uppercase tracking-wide ${index >= 5 ? 'text-rose-300/80' : 'text-slate-400'}`}
                      >
                        {dayName}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-7">
                    {timelineViewData.monthCells.map((cell) => (
                      <div
                        key={cell.key}
                        className={`min-h-32 rounded-xl border p-2 ${
                          cell.date
                            ? ((cell.date.getDay() === 0 || cell.date.getDay() === 6)
                              ? 'border-rose-800/60 bg-rose-950/18'
                              : 'border-slate-700/70 bg-slate-900/75')
                            : 'border-transparent bg-slate-900/20'
                        } ${cell.date && cell.date.toDateString() === new Date().toDateString() ? 'ring-2 ring-cyan-400/70' : ''} ${isTimelineDragging && cell.date ? 'ring-1 ring-cyan-500/30 transition' : ''}`}
                        onDragOver={(event) => {
                          if (!isTaskDragEnabled || !cell.date) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={async (event) => {
                          if (!isTaskDragEnabled || !cell.date) return;
                          event.preventDefault();
                          const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                          setDraggedTimelineTaskId(taskId || null);
                          await handleTimelineTaskDrop({ date: cell.date, keepOriginalTime: true });
                          setDraggedTimelineTaskId(null);
                        }}
                      >
                        {cell.date ? (
                          <>
                            <p className="mb-2 text-xs font-semibold text-slate-300">{cell.date.getDate()}</p>
                            <ul className="space-y-1">
                              {cell.tasks.slice(0, 4).map((task) => renderTimelineTaskChip(task))}
                              {cell.tasks.length > 4 ? <li className="text-[11px] text-slate-400">+ ещё {cell.tasks.length - 4}</li> : null}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {timelineViewMode === 'week' ? (
                <section className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/70">
                  <div className="grid min-w-[980px] grid-cols-[80px_repeat(7,minmax(120px,1fr))]">
                    <div className="border-b border-r border-slate-800/80 bg-slate-900/90 p-2 text-xs text-slate-400">Время</div>
                    {timelineViewData.dayGroups.map((day) => {
                      const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                      const isToday = day.date.toDateString() === new Date().toDateString();
                      return (
                        <div
                          key={`header-${day.key}`}
                          className={`border-b border-r border-slate-800/80 p-2 text-center ${
                            isToday ? 'bg-cyan-950/30 ring-1 ring-cyan-400/60' : isWeekend ? 'bg-rose-950/20' : 'bg-slate-900/85'
                          }`}
                        >
                          <p className={`text-xs ${isToday ? 'text-cyan-200' : isWeekend ? 'text-rose-200/90' : 'text-slate-400'}`}>
                            {day.date.toLocaleDateString('ru-RU', { weekday: 'short' })}
                          </p>
                          <p className={`text-sm font-semibold ${isToday ? 'text-cyan-50' : isWeekend ? 'text-rose-100' : 'text-slate-100'}`}>
                            {day.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                      );
                    })}
                    {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
                      <Fragment key={`week-hour-${hour}`}>
                        <div className="border-b border-r border-slate-800/80 px-2 py-2 text-xs text-slate-400">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                        {timelineViewData.dayGroups.map((day) => {
                          const hourTasks = day.tasks.filter((task) => {
                            if (!task.dueDate) return false;
                            const dueDate = new Date(task.dueDate);
                            return !Number.isNaN(dueDate.getTime()) && dueDate.getHours() === hour;
                          });
                          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                          return (
                            <div
                              key={`${day.key}-${hour}`}
                              className={`min-h-14 space-y-1 border-b border-r border-slate-800/80 px-1.5 py-1.5 ${
                                isWeekend ? 'bg-rose-950/10' : 'bg-slate-900/40'
                              } ${isTimelineDragging ? 'transition-colors hover:bg-cyan-900/20' : ''}`}
                              onDragOver={(event) => {
                                if (!isTaskDragEnabled) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={async (event) => {
                                if (!isTaskDragEnabled) return;
                                event.preventDefault();
                                const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                                setDraggedTimelineTaskId(taskId || null);
                                await handleTimelineTaskDrop({ date: day.date, hour });
                                setDraggedTimelineTaskId(null);
                              }}
                            >
                              {hourTasks.map((task) => renderTimelineTaskChip(task, { showTime: false }))}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </section>
              ) : null}

              {timelineViewMode === 'day' ? (
                <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70">
                  {timelineViewData.hourGroups.map((hourGroup) => (
                    <div key={hourGroup.hour} className="grid grid-cols-[70px_minmax(0,1fr)] border-b border-slate-800/80 last:border-b-0">
                      <div className="border-r border-slate-800/80 px-2 py-2 text-xs text-slate-400">{String(hourGroup.hour).padStart(2, '0')}:00</div>
                      <div
                        className={`min-h-11 space-y-2 px-2 py-2 ${isTimelineDragging ? 'transition-colors hover:bg-cyan-900/15' : ''}`}
                        onDragOver={(event) => {
                          if (!isTaskDragEnabled) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={async (event) => {
                          if (!isTaskDragEnabled) return;
                          event.preventDefault();
                          const taskId = draggedTimelineTaskId ?? event.dataTransfer.getData('text/task-id');
                          setDraggedTimelineTaskId(taskId || null);
                          const dayDate = new Date(timelineAnchorDate);
                          dayDate.setHours(0, 0, 0, 0);
                          await handleTimelineTaskDrop({ date: dayDate, hour: hourGroup.hour });
                          setDraggedTimelineTaskId(null);
                        }}
                      >
                        {hourGroup.tasks.map((task) => renderTimelineTaskChip(task, { showTime: true }))}
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {timelineViewData.tasksWithoutDate.length > 0 ? (
                <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200">Без даты</h3>
                    <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">{timelineViewData.tasksWithoutDate.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {timelineViewData.tasksWithoutDate.map((task) => (
                      <li
                        key={task.id}
                        className="cursor-pointer rounded-lg border border-slate-700/70 bg-slate-900/75 px-3 py-2 transition hover:border-cyan-300/70 hover:bg-slate-800/70"
                        onClick={() => setFocusedTaskId(task.id)}
                      >
                        <p className={`text-sm font-semibold ${task.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                          <LinkifiedText text={task.title} stopPropagationOnLinkClick />
                        </p>
                        <p className="mt-1 text-xs text-slate-400">Срок: Без дедлайна</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        )}
        <aside
          className="absolute right-0 top-0 z-10 h-full w-[320px] space-y-4 overflow-y-auto overscroll-contain border-l border-slate-700/60 bg-slate-950/90 p-4 backdrop-blur-sm"
          data-no-field-zoom="true"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Ближайшие подзадачи</h3>
            <ul className="max-h-[30vh] space-y-2 overflow-y-auto pr-1 text-xs text-slate-200">
              {upcomingSubtasksForPanel.length === 0 ? <li className="text-slate-400">Нет подзадач с ближайшим дедлайном</li> : null}
              {upcomingSubtasksForPanel.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1" title={formatDeadlineTooltip(task)}>
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
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Выполненные задания</h3>
              <div className="flex items-center gap-1 rounded-lg bg-slate-800/80 p-1 text-[11px]">
                <button
                  className={`rounded px-2 py-0.5 ${completedFilter === 'today' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('today')}
                >
                  сегодня
                </button>
                <button
                  className={`rounded px-2 py-0.5 ${completedFilter === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}
                  onClick={() => setCompletedFilter('all')}
                >
                  все
                </button>
              </div>
            </div>
            <ul className="max-h-[34vh] space-y-2 overflow-y-auto pr-1 text-xs text-slate-200">
              {completedTasksForPanel.length === 0 ? <li className="text-slate-400">Нет выполненных задач для выбранного фильтра</li> : null}
              {completedTasksForPanel.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1">
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
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Общий чат с ИИ</h3>
              <div className="flex items-center gap-1.5">
                <button
                  className={`rounded p-1.5 ${isGeneralAiSearchOpen ? 'bg-cyan-600 text-white' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}
                  onClick={() => setIsGeneralAiSearchOpen((prev) => !prev)}
                  title="Поиск по диалогу"
                >
                  <Search size={14} />
                </button>
                <button
                  className="rounded bg-slate-700/80 p-1.5 text-slate-200 hover:bg-slate-600"
                  onClick={() => setIsGeneralAiFullscreen(true)}
                  title="Развернуть общий чат"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            <div ref={generalAiDialogContainerRef} className="mb-2 h-[220px] overflow-y-auto rounded-xl bg-slate-900/90 p-2 text-xs">
              {isGeneralAiSearchOpen ? (
                <label className="mb-2 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300">
                  <Search size={12} />
                  <input
                    className="w-full bg-transparent text-[11px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                    placeholder="Поиск по сообщениям"
                    value={generalAiSearchQuery}
                    onChange={(event) => setGeneralAiSearchQuery(event.target.value)}
                  />
                </label>
              ) : null}
              {filteredGeneralAiMessages.length === 0 ? <p className="text-slate-400">{generalAiMessages.length === 0 ? 'Задайте вопрос по любым задачам или попросите изменить расписание.' : 'Сообщения не найдены.'}</p> : null}
              <div className="space-y-2">
                {filteredGeneralAiMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[92%] rounded-lg px-2.5 py-2 whitespace-pre-line ${message.role === 'assistant' ? 'mr-auto bg-cyan-700/20 text-cyan-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                  >
                    <p className="mb-1 text-[10px] uppercase text-slate-300">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                    <div>{message.content}</div>
                  </div>
                ))}
              </div>
              {generalAiLoading ? <p className="mt-2 text-[11px] text-cyan-200">ИИ обрабатывает запрос…</p> : null}
            </div>
            {generalAiError ? <p className="mb-2 text-[11px] text-rose-300">{generalAiError}</p> : null}
            <textarea
              className="mb-2 min-h-16 w-full resize-none rounded-lg bg-slate-800 px-2 py-1.5 text-xs"
              placeholder="Например: сколько задач осталось на этой неделе?"
              value={generalAiDraft}
              onChange={(event) => setGeneralAiDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendGeneralAiQuestion();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                onClick={() => void sendGeneralAiQuestion()}
                disabled={generalAiLoading || !generalAiDraft.trim()}
              >
                <SendHorizontal size={12} /> Отправить
              </button>
              <button
                className="inline-flex items-center gap-1 rounded bg-slate-700 px-2.5 py-1 text-xs text-slate-100 disabled:opacity-50"
                onClick={() => void undoGeneralAiAction()}
                disabled={generalAiLoading || lastGeneralAiUndoOperations.length === 0}
              >
                <RotateCcw size={12} /> Отменить
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Фон рабочего пространства</h3>
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
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Управление секторами</h3>
            <ul className="space-y-2 text-xs">
              {spheres.map((sphere) => {
                const Icon = resolveSphereIcon(sphere.icon);
                return (
                  <li key={sphere.id} className="flex items-center justify-between rounded bg-slate-800/70 px-2 py-1">
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
          task={editorState.task}
          initialSphereId={editorState.initialSphereId}
          spheres={spheres}
          onCancel={() => setEditorState(null)}
          onSave={persistTask}
          onAutoSave={editorState.task?.id ? autosaveEditorTask : undefined}
          onGenerateWithAi={createTaskFromAi}
          onComplete={editorState.task?.id ? () => completeTask(editorState.task!) : undefined}
          onDelete={editorState.task?.id ? async () => {
            await api.deleteTask(editorState.task!.id);
            setEditorState(null);
            await load();
          } : undefined}
        />
      ) : null}

      {focusedTask && focusedDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="flex w-full max-w-[1380px] items-stretch justify-center gap-3">
            <aside className="hidden h-[min(86vh,760px)] min-h-0 w-[410px] shrink-0 flex-col overflow-hidden rounded-[2rem] border border-violet-300/30 bg-slate-950/92 p-4 shadow-2xl lg:flex">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-violet-100"><Bot size={16} /> Помощь ИИ</p>
                  <p className="mt-1 text-xs text-slate-300">{focusedTask.title}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className={`rounded p-1.5 ${isFocusedAiSearchOpen ? 'bg-violet-600 text-white' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}
                    onClick={() => setIsFocusedAiSearchOpen((prev) => !prev)}
                    title="Поиск по диалогу"
                  >
                    <Search size={14} />
                  </button>
                  <button
                    className="rounded bg-slate-700/80 p-1.5 text-slate-200 hover:bg-slate-600"
                    onClick={() => setIsAiExpanded(true)}
                    title="Развернуть диалог"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
              <div ref={focusedAiDialogContainerRef} className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-900/90 p-3">
                {isFocusedAiSearchOpen ? (
                  <label className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300">
                    <Search size={12} />
                    <input
                      className="w-full bg-transparent text-[11px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
                      placeholder="Поиск по сообщениям"
                      value={focusedAiSearchQuery}
                      onChange={(event) => setFocusedAiSearchQuery(event.target.value)}
                    />
                  </label>
                ) : null}
                {filteredFocusedAiDialog.length === 0 ? <p className="text-xs text-slate-400">{focusedAiDialog.length === 0 ? 'Спросите ИИ, как быстрее и качественнее выполнить задачу.' : 'Сообщения не найдены.'}</p> : null}
                {filteredFocusedAiDialog.map((message, index) => (
                  <div
                    key={`focused-ai-${message.role}-${index}`}
                    className={`max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                    <div>{renderAiMessageContent(message.content)}</div>
                  </div>
                ))}
                {aiLoadingTaskId === focusedTask.id ? <p className="text-xs text-violet-200">ИИ думает…</p> : null}
              </div>
              <textarea
                className="mb-2 min-h-20 w-full shrink-0 resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm leading-relaxed"
                placeholder="Например: предложи пошаговый план с оценкой времени"
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
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
                  className="inline-flex items-center gap-1 rounded-md bg-slate-700/90 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-600"
                  type="button"
                  onClick={() => focusedAiFileInputRef.current?.click()}
                >
                  <Paperclip size={12} />
                  Прикрепить файл
                </button>
                <p className="text-[10px] text-slate-400">PDF / DOCX / XLS(X) / PNG / JPG / WEBP / GIF, до 8MB</p>
              </div>
              {aiPendingFiles.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {aiPendingFiles.map((file) => (
                    <button
                      key={`ai-file-${file.name}`}
                      type="button"
                      onClick={() => removePendingAiFile(file.name)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-[10px] text-slate-100 hover:bg-slate-600"
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
                    className="rounded bg-sky-700 px-3 py-1.5 text-xs text-sky-50 disabled:opacity-50"
                    disabled={aiLoadingTaskId === focusedTask.id}
                    onClick={() => void helpWithTask()}
                  >
                    Помочь с задачей
                  </button>
                  <button
                    className="flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 text-xs disabled:opacity-50"
                    disabled={aiLoadingTaskId === focusedTask.id}
                    onClick={() => void sendFocusedAiQuestion()}
                  >
                    <SendHorizontal size={13} />
                    Отправить
                  </button>
                </div>
              </div>
            </aside>
            <aside className="h-[min(86vh,760px)] min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border border-cyan-200/30 bg-slate-900 p-5 shadow-2xl">
            <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col">
                <div className="space-y-3 overflow-y-auto pr-1">
                  <h3 className="text-xl font-semibold text-slate-100">Фокус задачи</h3>
                  <input className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.title ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), title: e.target.value }))} />
                  <textarea className="min-h-44 w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.description ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), description: e.target.value }))} />
                  <input
                    ref={focusedTaskAttachmentInputRef}
                    type="file"
                    accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleTaskAttachmentFileSelect}
                  />
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-400">Файлы к задаче (используются ИИ в чате, «Помочь с задачей» и «Сформировать ИИ»)</p>
                    <div className="flex flex-wrap items-start gap-2">
                      {focusedTaskAttachments.map((attachment) => (
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
                      <button
                        type="button"
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed text-slate-200 transition ${isTaskAttachmentDragActive ? 'border-cyan-300 bg-cyan-700/30' : 'border-slate-500 bg-slate-800 hover:bg-slate-700'} ${isUploadingTaskAttachment ? 'opacity-60' : ''}`}
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
                        title="Добавить файл или перетащить в плюс"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <select className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.sphereId ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), sphereId: e.target.value || null }))}>
                  <option value="">Без сектора</option>
                  {spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
                  </select>
                  <label className="block text-xs">Срок (дата и время)
                    <DateTimePickerWithApply
                      className="mt-1"
                      value={focusedDraft.dueDate}
                      detachedPopup
                      onChange={(nextValue) => setFocusedDraft((p) => ({ ...(p ?? {}), dueDate: nextValue }))}
                    />
                  </label>
                  <label className="block text-xs">Уведомлять за
                    <select
                      className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
                      value={focusedNotifyPreset}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFocusedNotifyPreset(value);
                        setFocusedDraft((p) => ({ ...(p ?? {}), notifyBeforeMinutes: value === 'null' ? null : Number(value) }));
                      }}
                    >
                      {NOTIFY_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <p className="mb-1 text-xs">Важность: {focusedDraft.importance ?? 3}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          className={`rounded border px-2 py-1 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${focusedDraft.importance === level ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'}`}
                          onClick={() => setFocusedDraft((p) => ({ ...(p ?? {}), importance: level }))}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex shrink-0 gap-2">
                  <button className="rounded bg-cyan-600 px-3 py-2 text-sm" onClick={saveFocusedTask}>Сохранить</button>
                  <button className="rounded bg-emerald-600 px-3 py-2 text-sm" onClick={() => completeTask(focusedTask)}>Выполнена</button>
                  <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={async () => { await api.deleteTask(focusedTask.id); setFocusedTaskId(null); await load(); }}>Удалить</button>
                  <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => setFocusedTaskId(null)}>Закрыть</button>
                </div>
              </div>
              <div className="flex min-h-0 flex-col space-y-2 rounded-2xl border border-slate-700/60 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    Подзадачи
                    <button
                      type="button"
                      className={`rounded p-1 ${hideClosedFocusedSubtasks ? 'text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}
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
                        className="inline-flex items-center rounded-full border border-rose-300 bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
                        onClick={() => setIsAiSubtasksPromptOpen(true)}
                        disabled={aiSubtasksLoadingTaskId === focusedTask.id}
                      >
                        {aiSubtasksLoadingTaskId === focusedTask.id ? 'Генерирую…' : 'Сформировать ИИ'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${isSubtaskFilterActive
                        ? 'border-cyan-300 bg-cyan-600/90 text-white'
                        : 'border-slate-500 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80'}`}
                      onClick={() => setIsSubtaskFilterActive((prev) => !prev)}
                    >
                      Фильтровать
                    </button>
                  </div>
                </div>
                {isAddingFocusedSubtask ? (
                  <div className="space-y-2">
                    <input
                      ref={focusedSubtaskTitleInputRef}
                      className="w-full rounded bg-slate-800 px-2 py-1.5 text-xs"
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
                    <div className="flex gap-2">
                      <button className="flex-1 rounded bg-cyan-600 px-2 py-1.5 text-xs" onClick={() => void addFocusedSubtask()}>
                        Сохранить
                      </button>
                      <button
                        className="rounded bg-slate-700 px-2 py-1.5 text-xs"
                        onClick={() => {
                          setIsAddingFocusedSubtask(false);
                          setFocusedSubtaskTitle('');
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="rounded bg-cyan-700 px-3 py-1 text-xs"
                    onClick={() => {
                      setFocusedSubtaskTitle('');
                      setIsAddingFocusedSubtask(true);
                    }}
                  >
                    + Добавить подзадачу
                  </button>
                )}
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
                      whileDrag={{ scale: 1.03, boxShadow: '0 18px 38px rgba(2,6,23,0.65)', zIndex: 90 }}
                      className="relative flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1"
                      style={subtask.status !== 'DONE' && isOverdue(subtask)
                        ? { boxShadow: '0 0 10px rgba(239,68,68,0.55), inset 0 0 8px rgba(239,68,68,0.2)', animation: 'subtask-overdue-glow 2.3s ease-in-out infinite' }
                        : subtask.status !== 'DONE' && shouldTaskGlow(subtask)
                          ? { boxShadow: '0 0 10px rgba(56,189,248,0.5), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
                          : undefined}
                    >
                      <button type="button" className="cursor-grab text-slate-400 active:cursor-grabbing" title="Перетащите для смены порядка">
                        <GripVertical size={14} />
                      </button>
                      <input type="checkbox" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      <div
                        className={`flex-1 cursor-pointer text-left ${subtask.status === 'DONE' ? 'line-through opacity-60' : ''}`}
                        onClick={() => setEditorState({ task: subtask })}
                        title="Открыть доп задачу"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setEditorState({ task: subtask });
                          }
                        }}
                      >
                        <LinkifiedText text={subtask.title} stopPropagationOnLinkClick />
                      </div>
                      <InlineDateTimePickerIcon
                        value={subtask.dueDate}
                        title="Изменить срок подзадачи"
                        detachedPopup
                        onChange={async (dueDate) => {
                          await api.updateTask(subtask.id, { dueDate });
                          await load();
                        }}
                      />
                    </Reorder.Item>
                  ))}
                  {(hideClosedFocusedSubtasks ? (displayedSubtaskMap[focusedTask.id] ?? []).filter((task) => task.status !== 'DONE') : (displayedSubtaskMap[focusedTask.id] ?? [])).length === 0 ? <li className="text-xs text-slate-400">Пока нет подзадач</li> : null}
                </Reorder.Group>
              </div>
            </div>
            </aside>
          </div>
          {isAiSubtasksPromptOpen ? (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
              onClick={() => {
                if (aiSubtasksLoadingTaskId !== focusedTask.id) {
                  setIsAiSubtasksPromptOpen(false);
                }
              }}
            >
              <aside className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-700/50 bg-slate-900 p-4" onClick={(event) => event.stopPropagation()}>
                <h4 className="text-base font-semibold text-slate-100">Пояснение для генерации подзадач</h4>
                <p className="text-xs text-slate-300">
                  При желании добавьте пояснение, чтобы ИИ лучше понял контекст. Например: желаемый формат, ограничения, приоритеты.
                </p>
                <textarea
                  className="min-h-24 w-full rounded bg-slate-800 p-2 text-sm"
                  placeholder="Необязательно. Например: сначала быстрые шаги на сегодня, затем всё остальное."
                  value={aiSubtasksPrompt}
                  onChange={(event) => setAiSubtasksPrompt(event.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded bg-slate-700 px-3 py-2 text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setIsAiExpanded(false)}>
          <div className="w-full max-w-4xl rounded-3xl border border-violet-200/40 bg-slate-950/99 p-5 shadow-[0_35px_100px_rgba(2,6,23,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold text-violet-100"><Bot size={18} /> Полноэкранный диалог с ИИ</p>
                <p className="text-xs text-slate-300">{focusedTask.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-900/80 p-1 text-[11px]">
                  <button
                    className={`rounded px-2 py-1 ${aiMode === 'fast' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiMode('fast')}
                    title="Быстрый режим (gpt-5.4-mini)"
                  >
                    Быстрый
                  </button>
                  <button
                    className={`rounded px-2 py-1 ${aiMode === 'smart' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiMode('smart')}
                    title="Умный режим (gpt-5.4)"
                  >
                    Умный
                  </button>
                </div>
                <button
                  className={`rounded p-1.5 ${isFocusedAiSearchOpen ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
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
                <button className="rounded bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600" onClick={() => setIsAiExpanded(false)} title="Свернуть">
                  <Minimize2 size={14} />
                </button>
                <button className="rounded bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600" onClick={() => { setIsAiExpanded(false); setFocusedTaskId(null); }} title="Закрыть">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div ref={expandedAiDialogContainerRef} className="mb-3 h-[60vh] space-y-3 overflow-y-auto rounded-2xl bg-slate-900/95 p-4">
              {isFocusedAiSearchOpen ? (
                <label className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-[12px] text-slate-300">
                  <Search size={12} />
                  <input
                    className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none"
                    placeholder="Поиск по сообщениям"
                    value={focusedAiSearchQuery}
                    onChange={(event) => setFocusedAiSearchQuery(event.target.value)}
                  />
                </label>
              ) : null}
              {filteredFocusedAiDialog.length === 0 ? <p className="text-sm text-slate-400">{focusedAiDialog.length === 0 ? 'Спросите ИИ, как эффективнее выполнить задачу.' : 'Сообщения не найдены.'}</p> : null}
              {filteredFocusedAiDialog.map((message, index) => (
                <div
                  key={`expanded-ai-${message.role}-${index}`}
                  className={`max-w-[72ch] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                  <div>{renderAiMessageContent(message.content)}</div>
                </div>
              ))}
              {aiLoadingTaskId === focusedTask.id ? <p className="text-sm text-violet-200">ИИ думает…</p> : null}
            </div>
            <textarea
              className="mb-2 min-h-28 w-full resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm leading-relaxed"
              placeholder="Опишите вопрос подробнее…"
              value={aiDraft}
              onChange={(event) => setAiDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
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
                className="inline-flex items-center gap-1 rounded-md bg-slate-700/90 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
                type="button"
                onClick={() => expandedAiFileInputRef.current?.click()}
              >
                <Paperclip size={12} />
                Прикрепить файл
              </button>
              <p className="text-[11px] text-slate-400">PDF / DOCX / XLS(X) / PNG / JPG / WEBP / GIF, до 8MB</p>
            </div>
            {aiPendingFiles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {aiPendingFiles.map((file) => (
                  <button
                    key={`expanded-ai-file-${file.name}`}
                    type="button"
                    onClick={() => removePendingAiFile(file.name)}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
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
                  className="rounded bg-sky-700 px-3 py-2 text-sm text-sky-50 disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void helpWithTask()}
                >
                  Помочь с задачей
                </button>
                <button
                  className="flex items-center gap-1 rounded bg-violet-600 px-3 py-2 text-sm disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void sendFocusedAiQuestion()}
                >
                  <SendHorizontal size={14} />
                  Отправить ({aiMode === 'fast' ? 'Быстрый' : 'Умный'})
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isGeneralAiFullscreen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setIsGeneralAiFullscreen(false)}>
          <div className="w-full max-w-4xl rounded-3xl border border-cyan-200/30 bg-slate-950/95 p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold text-cyan-100"><Bot size={18} /> Общий чат с ИИ</p>
                <p className="text-xs text-slate-300">Справка по задачам и команды для управления задачами.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className={`rounded p-1.5 ${isGeneralAiSearchOpen ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                  onClick={() => setIsGeneralAiSearchOpen((prev) => !prev)}
                  title="Поиск по диалогу"
                >
                  <Search size={14} />
                </button>
                <button className="rounded bg-slate-700 p-1.5 text-slate-200 hover:bg-slate-600" onClick={() => setIsGeneralAiFullscreen(false)} title="Свернуть">
                  <Minimize2 size={14} />
                </button>
              </div>
            </div>
            <div ref={generalAiFullscreenDialogContainerRef} className="mb-3 h-[60vh] space-y-3 overflow-y-auto rounded-2xl bg-slate-900/95 p-4">
              {isGeneralAiSearchOpen ? (
                <label className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-xs text-slate-300">
                  <Search size={12} />
                  <input
                    className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none"
                    placeholder="Поиск по сообщениям"
                    value={generalAiSearchQuery}
                    onChange={(event) => setGeneralAiSearchQuery(event.target.value)}
                  />
                </label>
              ) : null}
              {filteredGeneralAiMessages.length === 0 ? <p className="text-sm text-slate-400">{generalAiMessages.length === 0 ? 'История чата очищается каждый день в 00:00.' : 'Сообщения не найдены.'}</p> : null}
              {filteredGeneralAiMessages.map((message) => (
                <div
                  key={`general-full-${message.id}`}
                  className={`max-w-[72ch] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${message.role === 'assistant' ? 'mr-auto bg-cyan-700/20 text-cyan-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                  <div>{message.content}</div>
                </div>
              ))}
              {generalAiLoading ? <p className="text-sm text-cyan-200">ИИ обрабатывает запрос…</p> : null}
            </div>
            <textarea
              className="mb-2 min-h-24 w-full resize-none rounded-xl bg-slate-800 px-3 py-2 text-sm leading-relaxed"
              placeholder="Например: перенеси задачу «Подготовить отчёт» на завтра 18:00"
              value={generalAiDraft}
              onChange={(event) => setGeneralAiDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendGeneralAiQuestion();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="min-h-5 text-xs text-rose-300">{generalAiError ?? ''}</p>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded bg-slate-700 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                  disabled={generalAiLoading || lastGeneralAiUndoOperations.length === 0}
                  onClick={() => void undoGeneralAiAction()}
                >
                  <RotateCcw size={14} /> Отменить
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded bg-cyan-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={generalAiLoading || !generalAiDraft.trim()}
                  onClick={() => void sendGeneralAiQuestion()}
                >
                  <SendHorizontal size={14} /> Отправить
                </button>
              </div>
            </div>
          </div>
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
    </main>
  );
}
