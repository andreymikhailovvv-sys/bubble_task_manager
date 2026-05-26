import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Bot, CalendarDays, Check, CheckCircle2, ChevronDown, Coins, Copy, List, Paperclip, Plus, Save, Search, SendHorizontal, Trash2, X } from 'lucide-react';
import { api } from './lib/api';
import type { ChatAttachmentPayload, ChatMessage, ChatMode, Sphere, Task } from './lib/types';

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

type TaskDraft = {
  title: string;
  description: string;
  dueDate: string;
};

const timeFilterLabel: Record<TimeFilter, string> = {
  all: 'Все сроки',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: '7 дней',
  month: '30 дней'
};

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
  const [loading, setLoading] = useState(true);
  const [copiedAiMessageKey, setCopiedAiMessageKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sphereFilter, setSphereFilter] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [listSortMode, setListSortMode] = useState<ListSortMode>('sector');
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
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [createTaskDraft, setCreateTaskDraft] = useState<TaskDraft>({
    title: '',
    description: '',
    dueDate: ''
  });
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
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const launchParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId')?.trim() || null;
    const openAi = ['1', 'true', 'yes'].includes((params.get('openAi') ?? '').toLowerCase());
    return { taskId, openAi };
  }, []);

  const loadData = async () => {
    setLoading(true);
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

      const [sphereList, taskList] = await Promise.all([api.getSpheres(), api.getTasks()]);
      setSpheres(sphereList);
      setTasks(taskList);
      console.info(`[MiniApp] Данные загружены: sectors=${sphereList.length}, tasks=${taskList.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить мини-приложение');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
      const text = [task.title, task.description ?? ''].join(' ').toLowerCase();
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
      const text = [task.title, task.description ?? ''].join(' ').toLowerCase();
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
      currentTimeTop,
      isTodayVisible: isCurrentDay,
      hourHeights,
      hourTops,
      totalHeight,
      anchorLabel: anchor.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
    };
  }, [timelineAnchorDate, timelineFilteredTasks, timelineNow]);

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
    setIsAiDialogOpen(false);
    setAiDraft('');
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
      attachmentsPayload = await Promise.all(aiPendingFiles.map(async (file) => ({
        name: file.name,
        mimeType: resolveAttachmentMimeType(file),
        size: file.size,
        contentBase64: await file.arrayBuffer().then((buffer) => {
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let index = 0; index < bytes.length; index += chunkSize) {
            const chunk = bytes.subarray(index, index + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          return btoa(binary);
        })
      })));
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
      setError(e instanceof Error ? e.message : 'Не удалось отправить сообщение в чат ИИ');
      setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: baseDialog }));
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
    return <main className="h-screen overflow-y-auto miniapp-scrollless bg-slate-950 p-4 text-sm text-slate-100">Загружаем мини-приложение…</main>;
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
      className="miniapp-scrollless h-screen overflow-y-auto bg-slate-950 p-4 text-slate-100"
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
              className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            </div>
            <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 bg-slate-800 p-1">
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
            </div>
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
                <select
                  value={listSortMode}
                  onChange={(event) => setListSortMode(event.target.value as ListSortMode)}
                  className="h-8 rounded-md border border-slate-600 bg-slate-800 px-2 text-xs text-slate-100"
                >
                  <option value="sector">По секторам</option>
                  <option value="importance">По важности</option>
                </select>
                <select
                  value={timeFilter}
                  onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                  className="h-8 rounded-md border border-slate-600 bg-slate-800 px-2 text-xs text-slate-100"
                >
                  <option value="all">За все время</option>
                  <option value="today">Сегодня</option>
                  <option value="tomorrow">Завтра</option>
                  <option value="week">Неделя</option>
                </select>
              </div>
            </div>

            {listTasks.map((task) => {
              const hasOverdueState = isOverdue(task);
              const hasReminderState = !hasOverdueState && shouldTaskGlow(task);
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

              return (
                <article
                  key={task.id}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 p-3"
                  style={hasOverdueState
                    ? { boxShadow: '0 0 12px rgba(239,68,68,0.45), inset 0 0 8px rgba(239,68,68,0.2)', animation: 'subtask-overdue-glow 2.3s ease-in-out infinite', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                    : hasReminderState
                      ? { boxShadow: '0 0 12px rgba(56,189,248,0.45), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite', borderLeftWidth: '4px', borderLeftColor: leftStripeColor }
                      : { borderLeftWidth: '4px', borderLeftColor: leftStripeColor }}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => openTaskModal(task)}
                  >
                    <div>
                      <h3 className="font-medium">{task.title}</h3>
                      <p className="mt-1 text-xs text-slate-300">Дедлайн: {formatDueDate(task.dueDate)}</p>
                      <p className="text-xs text-sky-200">{formatRemaining(task.dueDate)}</p>
                    </div>
                    <ChevronDown size={18} />
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
                        <span className="absolute -top-3 left-0 rounded bg-slate-900 px-1 text-xs text-slate-400">{`${hourIndex.toString().padStart(2, '0')}:00`}</span>
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
                      const hasOverdueState = isOverdue(task);
                      const isSubtask = Boolean(task.parentTaskId);
                      const parentTask = task.parentTaskId ? (taskById.get(task.parentTaskId) ?? null) : null;
                      const taskForSectorColor = parentTask ?? task;
                      const sphereColor = taskForSectorColor.sphereId ? spheres.find((item) => item.id === taskForSectorColor.sphereId)?.color ?? null : null;
                      const placement = timelineTaskPlacements.get(task.id) ?? { top: timelineToday.hourTops[taskHour] + 4 };
                      return (
                        <button
                          type="button"
                          key={task.id}
                          className="absolute rounded-md border px-2 py-1 text-left"
                          style={{
                            top: `${placement.top}px`,
                            minHeight: `${TIMELINE_CARD_HEIGHT}px`,
                            left: 'calc(4rem + 2px)',
                            width: 'calc(100% - 4rem - 8px)',
                            zIndex: 10,
                            borderColor: isSubtask
                              ? 'rgba(100,116,139,0.9)'
                              : (hexToRgba(sphereColor ?? '', 0.8) ?? 'rgba(56,189,248,0.35)'),
                            background: isSubtask
                              ? 'rgba(71,85,105,0.82)'
                              : (hexToRgba(sphereColor ?? '', 0.25) ?? 'rgba(14,165,233,0.18)'),
                            borderLeftWidth: isSubtask ? '4px' : '1px',
                            borderLeftColor: isSubtask
                              ? (hexToRgba(sphereColor ?? '', 0.95) ?? 'rgba(56,189,248,0.95)')
                              : (hexToRgba(sphereColor ?? '', 0.8) ?? 'rgba(56,189,248,0.35)'),
                            boxShadow: hasOverdueState ? '0 0 12px rgba(239,68,68,0.45)' : undefined
                          }}
                          onClick={() => openTaskModal(parentTask ?? task)}
                        >
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-slate-300">{isSubtask ? 'Подзадача · ' : ''}{formatDueDate(task.dueDate)}</p>
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
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Задача</h2>
              <button
                type="button"
                onClick={closeTaskModal}
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
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Описание</label>
                <textarea
                  value={openedTaskDraft.description}
                  onChange={(event) => onChangeDraft(openedTask.id, { description: event.target.value })}
                  className="min-h-20 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Срок</label>
                <input
                  type="datetime-local"
                  value={openedTaskDraft.dueDate}
                  onChange={(event) => onChangeDraft(openedTask.id, { dueDate: event.target.value })}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void saveTask(openedTask.id)}
                  disabled={savingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-sky-600 px-3 text-sm font-medium disabled:opacity-60"
                >
                  <Save size={14} />
                  {savingId === openedTask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                </button>
                <button
                  type="button"
                  onClick={() => void completeTask(openedTask.id)}
                  disabled={completingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {completingId === openedTask.id ? 'Завершаем…' : 'Выполнить'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTask(openedTask.id)}
                  disabled={deletingId === openedTask.id}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-rose-600 px-3 text-sm font-medium disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deletingId === openedTask.id ? 'Удаляем…' : 'Удалить'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiDialogOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-600 px-3 text-sm font-medium"
                >
                  <Bot size={14} />
                  Диалог с ИИ
                </button>
              </div>
            </div>
            {isAiDialogOpen ? (
              <div className="mt-3 space-y-2 rounded-md border border-violet-500/40 bg-slate-800/80 p-3">
                <h3 className="text-sm font-semibold text-violet-100">Чат по задаче</h3>
                <div className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-slate-900/80 p-1 text-xs">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${openedTaskAiMode === 'fast' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => openedTask && setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'fast' }))}
                  >
                    <span className="block text-left">Быстрая</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${openedTaskAiMode === 'smart' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => openedTask && setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'smart' }))}
                  >
                    <span className="block text-left">Умная</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>4</span><Coins size={10} /></span>
                  </button>
                </div>
                <div ref={inlineAiDialogContainerRef} className="max-h-52 space-y-2 overflow-y-auto overflow-x-hidden rounded-md bg-slate-900/80 p-2 text-xs">
                  {openedTaskAiDialog.length === 0 ? <p className="text-slate-400">История пока пустая.</p> : null}
                  {openedTaskAiDialog.map((message, index) => (
                    <div key={`mini-ai-${index}`} className={`max-w-[94%] rounded-xl border px-2.5 py-2 ${message.role === 'assistant' ? 'mr-auto border-violet-400/40 bg-violet-500/20 text-violet-50' : 'ml-auto border-cyan-400/40 bg-cyan-500/15 text-cyan-50'}`}>
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
                      <button key={`mini-ai-file-${file.name}-${file.size}`} type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-[10px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}>
                        <Paperclip size={10} />
                        <span className="max-w-[170px] truncate">{file.name}</span>
                        <X size={10} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-slate-200" onClick={() => aiAttachmentInputRef.current?.click()} title="Прикрепить файл">
                    <Paperclip size={15} />
                  </button>
                  <textarea
                    ref={aiTextareaRef}
                    value={aiDraft}
                    onChange={(event) => setAiDraft(event.target.value)}
                    placeholder="Напишите сообщение для ИИ"
                    rows={1}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    className="max-h-[180px] w-full resize-none overflow-y-auto rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendAiMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void sendAiMessage()}
                    disabled={aiLoadingTaskId === openedTask.id}
                    className="rounded-md bg-violet-600 px-3 py-2 disabled:opacity-60"
                    title="Отправить"
                  >
                    <SendHorizontal size={14} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-2 rounded-md border border-slate-700 bg-slate-800/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Подзадачи</h3>
                <button
                  type="button"
                  onClick={() => void addSubtask(openedTask)}
                  disabled={creatingSubtaskForId === openedTask.id}
                  className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium disabled:opacity-60"
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
                    className="rounded-md border border-slate-700 bg-slate-900 p-2"
                    style={hasOverdueSubtaskState
                      ? { boxShadow: '0 0 12px rgba(239,68,68,0.45), inset 0 0 8px rgba(239,68,68,0.2)', animation: 'subtask-overdue-glow 2.3s ease-in-out infinite' }
                      : hasReminderSubtaskState
                        ? { boxShadow: '0 0 12px rgba(56,189,248,0.45), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setOpenedSubtaskId(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Редактирование подзадачи</h3>
              <button type="button" onClick={() => setOpenedSubtaskId(null)} className="rounded-md border border-slate-600 p-1 text-slate-300" aria-label="Закрыть окно подзадачи">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={openedSubtaskDraft.title}
                onChange={(event) => onChangeDraft(openedSubtask.id, { title: event.target.value })}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Название подзадачи"
              />
              <textarea
                value={openedSubtaskDraft.description}
                onChange={(event) => onChangeDraft(openedSubtask.id, { description: event.target.value })}
                className="min-h-16 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                placeholder="Описание подзадачи"
              />
              <input
                type="datetime-local"
                value={openedSubtaskDraft.dueDate}
                onChange={(event) => onChangeDraft(openedSubtask.id, { dueDate: event.target.value })}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void saveTask(openedSubtask.id)} disabled={savingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-sky-600 px-3 text-sm font-medium disabled:opacity-60">
                  <Save size={14} />
                  {savingId === openedSubtask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                </button>
                <button type="button" onClick={() => void completeTask(openedSubtask.id)} disabled={completingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-medium disabled:opacity-60">
                  <CheckCircle2 size={14} />
                  {completingId === openedSubtask.id ? 'Завершаем…' : 'Выполнить'}
                </button>
                <button type="button" onClick={() => void deleteTask(openedSubtask.id)} disabled={deletingId === openedSubtask.id} className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-rose-600 px-3 text-sm font-medium disabled:opacity-60">
                  <Trash2 size={14} />
                  {deletingId === openedSubtask.id ? 'Удаляем…' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {openedTask && isAiDialogOpen ? (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 p-3 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col rounded-2xl border border-violet-500/40 bg-slate-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-violet-100">Диалог с ИИ</h3>
                <p className="text-xs text-slate-300">{openedTask.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-slate-900/80 p-1 text-xs">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${openedTaskAiMode === 'fast' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'fast' }))}
                  >
                    <span className="block text-left">Быстрая</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>2</span><Coins size={10} /></span>
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${openedTaskAiMode === 'smart' ? 'bg-violet-600 text-white' : 'text-slate-300'}`}
                    onClick={() => setAiModeByTask((prev) => ({ ...prev, [openedTask.id]: 'smart' }))}
                  >
                    <span className="block text-left">Умная</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-rose-300"><span>4</span><Coins size={10} /></span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAiDialogOpen(false)}
                  className="rounded-md border border-slate-600 p-1 text-slate-300"
                  aria-label="Закрыть диалог с ИИ"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div ref={fullscreenAiDialogContainerRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-md bg-slate-950/70 p-3 text-sm">
              {openedTaskAiDialog.length === 0 ? <p className="text-slate-400">История пока пустая.</p> : null}
              {openedTaskAiDialog.map((message, index) => (
                <div key={`mini-ai-full-${index}`} className={`max-w-[94%] rounded-xl border px-3 py-2.5 ${message.role === 'assistant' ? 'mr-auto border-violet-400/40 bg-violet-500/20 text-violet-50' : 'ml-auto border-cyan-400/40 bg-cyan-500/15 text-cyan-50'}`}>
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
                  <button key={`mini-ai-file-full-${file.name}-${file.size}`} type="button" className="inline-flex items-center gap-1 rounded-full bg-slate-700/80 px-2 py-1 text-[10px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => !(item.name === file.name && item.size === file.size)))}>
                    <Paperclip size={10} />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                    <X size={10} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex items-end gap-2">
              <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-slate-200" onClick={() => aiAttachmentInputRef.current?.click()} title="Прикрепить файл">
                <Paperclip size={15} />
              </button>
              <textarea
                ref={aiTextareaRef}
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                placeholder="Напишите сообщение для ИИ"
                rows={1}
                style={{ WebkitTapHighlightColor: 'transparent' }}
                className="max-h-[180px] w-full resize-none overflow-y-auto rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-0"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendAiMessage();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void sendAiMessage()}
                disabled={aiLoadingTaskId === openedTask.id}
                className="rounded-md bg-violet-600 px-3 py-2 disabled:opacity-60"
                title="Отправить"
              >
                <SendHorizontal size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateTaskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/85 sm:items-center sm:justify-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Новая задача</h2>
              <button type="button" onClick={() => setIsCreateTaskModalOpen(false)} className="rounded-md border border-slate-600 p-1 text-slate-300" aria-label="Закрыть окно">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Название задачи</label>
                <input
                  value={createTaskDraft.title}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Описание</label>
                <textarea
                  value={createTaskDraft.description}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-20 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-300">Срок</label>
                <input
                  type="datetime-local"
                  value={createTaskDraft.dueDate}
                  onChange={(event) => setCreateTaskDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => void createTask()}
                disabled={isCreatingTask}
                className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
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
