import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, List, Save, Search, SendHorizontal, Trash2, X } from 'lucide-react';
import { api } from './lib/api';
import type { ChatMessage, Sphere, Task } from './lib/types';

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
const MAX_SHINE_WINDOW_MINUTES = 180;
const HOURS_IN_DAY = 24;
const TIMELINE_HOUR_HEIGHT = 88;
const TIMELINE_HOUR_EXPANDED_STEP = 20;
const TIMELINE_HOUR_EXPANDED_MAX = 230;

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
  const [timelineNow, setTimelineNow] = useState(() => new Date());
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);
  const [expandedSubtaskIds, setExpandedSubtaskIds] = useState<string[]>([]);
  const [draftByTaskId, setDraftByTaskId] = useState<Record<string, TaskDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingSubtaskForId, setCreatingSubtaskForId] = useState<string | null>(null);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const inlineAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const [aiDraft, setAiDraft] = useState('');
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const requestedTaskId = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('taskId');
    return value?.trim() ? value.trim() : null;
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

    return tasks.filter((task) => {
      if (task.parentTaskId) return false;
      if (task.status === 'DONE') return false;
      if (sphereFilter !== 'all') {
        const taskSphereValue = task.sphereId ?? 'without-sphere';
        if (taskSphereValue !== sphereFilter) return false;
      }
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
    }).filter((task) => {
      const query = taskSearch.trim().toLowerCase();
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

  const groupedBySphere = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      const key = task.sphereId ?? 'without-sphere';
      const current = map.get(key) ?? [];
      current.push(task);
      map.set(key, current);
    }
    return Array.from(map.entries()).map(([sphereId, sphereTasks]) => ({
      sphereId,
      sphereName: sphereId === 'without-sphere' ? 'Без сектора' : (spheres.find((item) => item.id === sphereId)?.name ?? 'Без сектора'),
      tasks: sphereTasks.sort(compareByDueDate)
    }));
  }, [filteredTasks, spheres]);

  const timelineGroups = useMemo(() => {
    const tasksWithDate = filteredTasks
      .filter((task) => Boolean(task.dueDate))
      .sort(compareByDueDate);
    const grouped = new Map<string, Task[]>();

    for (const task of tasksWithDate) {
      const key = new Date(task.dueDate as string).toDateString();
      const current = grouped.get(key) ?? [];
      current.push(task);
      grouped.set(key, current);
    }

    const withoutDate = filteredTasks.filter((task) => !task.dueDate);
    return {
      dated: Array.from(grouped.entries()).map(([key, value]) => ({
        key,
        label: new Date(key).toLocaleDateString('ru-RU', {
          weekday: 'short',
          day: '2-digit',
          month: 'long'
        }),
        tasks: value
      })),
      withoutDate
    };
  }, [filteredTasks]);

  const timelineToday = useMemo(() => {
    const now = timelineNow;
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todayTasks = filteredTasks
      .filter((task) => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        if (Number.isNaN(dueDate.getTime())) return false;
        return dueDate >= startOfDay && dueDate < endOfDay;
      })
      .sort(compareByDueDate);

    const timelineSubtasks = todayTasks.flatMap((task) => (subtasksByParent[task.id] ?? []))
      .filter((subtask) => subtask.status !== 'DONE');
    const timelineEntries = [...todayTasks, ...timelineSubtasks]
      .filter((task) => Boolean(task.dueDate))
      .sort(compareByDueDate);

    const hourTaskCount = Array.from({ length: HOURS_IN_DAY }, () => 0);
    for (const task of timelineEntries) {
      const due = new Date(task.dueDate as string);
      const hour = due.getHours();
      if (hour >= 0 && hour < HOURS_IN_DAY) hourTaskCount[hour] += 1;
    }

    const hourHeights = hourTaskCount.map((count) => (
      count <= 1 ? TIMELINE_HOUR_HEIGHT : Math.min(TIMELINE_HOUR_HEIGHT + ((count - 1) * TIMELINE_HOUR_EXPANDED_STEP), TIMELINE_HOUR_EXPANDED_MAX)
    ));
    const hourTops: number[] = [];
    let totalHeight = 0;
    for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
      hourTops.push(totalHeight);
      totalHeight += hourHeights[hour];
    }

    const currentHour = now.getHours();
    const currentTimeTop = hourTops[currentHour] + ((now.getMinutes() / 60) * hourHeights[currentHour]);
    return {
      timelineEntries,
      currentTimeTop,
      isTodayVisible: timeFilter === 'all' || timeFilter === 'today',
      hourHeights,
      hourTops,
      totalHeight
    };
  }, [filteredTasks, subtasksByParent, timeFilter, timelineNow]);

  const timelineTaskPlacements = useMemo(() => {
    const TASK_HEIGHT = 42;
    const placements = new Map<string, { depth: number; overlapCount: number }>();
    const tasksWithTop = timelineToday.timelineEntries.map((task) => {
      const due = new Date(task.dueDate as string);
      const hour = due.getHours();
      const top = timelineToday.hourTops[hour] + ((due.getMinutes() / 60) * timelineToday.hourHeights[hour]);
      return { task, top };
    });

    let groupStart = 0;
    while (groupStart < tasksWithTop.length) {
      let groupEnd = groupStart;
      let maxBottom = tasksWithTop[groupStart].top + TASK_HEIGHT;

      while (groupEnd + 1 < tasksWithTop.length && tasksWithTop[groupEnd + 1].top < maxBottom) {
        groupEnd += 1;
        const nextBottom = tasksWithTop[groupEnd].top + TASK_HEIGHT;
        if (nextBottom > maxBottom) maxBottom = nextBottom;
      }

      const overlapCount = groupEnd - groupStart + 1;
      for (let index = groupStart; index <= groupEnd; index += 1) {
        placements.set(tasksWithTop[index].task.id, { depth: index - groupStart, overlapCount });
      }

      groupStart = groupEnd + 1;
    }

    return placements;
  }, [timelineToday.hourHeights, timelineToday.hourTops, timelineToday.timelineEntries]);

  useEffect(() => {
    if (displayMode !== 'timeline') return;
    const container = timelineScrollRef.current;
    if (!container) return;
    const centeredTop = Math.max(0, timelineToday.currentTimeTop - (container.clientHeight / 2));
    container.scrollTo({ top: centeredTop });
  }, [displayMode, timelineToday.currentTimeTop]);

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
    setExpandedSubtaskIds([]);
    setOpenedTaskId(task.id);
  };

  useEffect(() => {
    if (!requestedTaskId || loading || tasks.length === 0 || openedTaskId) return;
    const requestedTask = tasks.find((task) => task.id === requestedTaskId && !task.parentTaskId && task.status !== 'DONE');
    if (!requestedTask) return;
    openTaskModal(requestedTask);
  }, [loading, openedTaskId, requestedTaskId, tasks]);

  const closeTaskModal = () => {
    setOpenedTaskId(null);
    setExpandedSubtaskIds([]);
    setIsAiDialogOpen(false);
    setAiDraft('');
  };

  const toggleExpandedSubtask = (subtaskId: string) => {
    setExpandedSubtaskIds((prev) => (
      prev.includes(subtaskId) ? prev.filter((item) => item !== subtaskId) : [...prev, subtaskId]
    ));
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
        dueDate: parentTask.dueDate ?? null
      });
      setDraftByTaskId((prev) => ({
        ...prev,
        [created.id]: {
          title: created.title,
          description: created.description ?? '',
          dueDate: toInputDateTime(created.dueDate)
        }
      }));
      setExpandedSubtaskIds((prev) => [...new Set([...prev, created.id])]);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить подзадачу');
    } finally {
      setCreatingSubtaskForId(null);
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
  const openedTaskAiDialog = openedTask ? (aiDialogByTask[openedTask.id] ?? []) : [];

  useEffect(() => {
    if (!openedTaskId || !isAiDialogOpen) return;
    const loadTaskChatHistory = async () => {
      try {
        const result = await api.getTaskAssistantHistory(openedTaskId);
        setAiDialogByTask((prev) => ({ ...prev, [openedTaskId]: result.messages }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить чат ИИ');
      }
    };
    void loadTaskChatHistory();
  }, [isAiDialogOpen, openedTaskId]);

  const sendAiMessage = async () => {
    if (!openedTask) return;
    const question = aiDraft.trim();
    if (!question) return;
    setAiLoadingTaskId(openedTask.id);
    setError(null);
    const baseDialog = aiDialogByTask[openedTask.id] ?? [];
    const nextDialog: ChatMessage[] = [...baseDialog, { role: 'user', content: question }];
    setAiDialogByTask((prev) => ({ ...prev, [openedTask.id]: nextDialog }));
    setAiDraft('');
    try {
      const result = await api.askTaskAssistant(openedTask.id, { question, mode: 'fast' });
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

  useEffect(() => {
    if (!isAiDialogOpen) return;
    const scrollToBottom = (container: HTMLDivElement | null) => {
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    };
    scrollToBottom(inlineAiDialogContainerRef.current);
    scrollToBottom(fullscreenAiDialogContainerRef.current);
  }, [isAiDialogOpen, openedTaskId, openedTaskAiDialog.length, aiLoadingTaskId]);

  if (loading) {
    return <main className="h-screen overflow-y-auto miniapp-scrollless bg-slate-950 p-4 text-sm text-slate-100">Загружаем мини-приложение…</main>;
  }

  return (
    <main className="miniapp-scrollless h-screen overflow-y-auto bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Мини-приложение задач</h1>
          <p className="text-sm text-slate-300">Список задач с секторами, фильтром по времени и редактированием карточек.</p>
        </header>

        <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <label className="mb-1 block text-xs text-slate-300">Поиск по задачам</label>
          <div className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={taskSearch}
              onChange={(event) => setTaskSearch(event.target.value)}
              placeholder="Введите ключевое слово"
              className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-600 bg-slate-800 p-1">
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
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
              <select
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                className="h-9 min-w-32 rounded-full border border-slate-600 bg-slate-800 px-3 text-xs text-slate-100"
              >
                {(Object.keys(timeFilterLabel) as TimeFilter[]).map((value) => (
                  <option key={value} value={value}>
                    Срок: {timeFilterLabel[value]}
                  </option>
                ))}
              </select>
              <select
                value={sphereFilter}
                onChange={(event) => setSphereFilter(event.target.value)}
                className="h-9 min-w-36 rounded-full border border-slate-600 bg-slate-800 px-3 text-xs text-slate-100"
              >
                <option value="all">Сектор: Все</option>
                <option value="without-sphere">Сектор: Без сектора</option>
                {spheres.map((sphere) => (
                  <option key={sphere.id} value={sphere.id}>
                    Сектор: {sphere.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Активно: {timeFilterLabel[timeFilter]} · {selectedSphereName}
          </p>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {groupedBySphere.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">Задачи не найдены.</div>
        ) : null}

        {displayMode === 'list' ? groupedBySphere.map((group) => (
          <section
            key={group.sphereId}
            className="space-y-2 rounded-xl border p-3"
            style={{
              borderColor: group.sphereId === 'without-sphere' ? 'rgba(71,85,105,0.8)' : (hexToRgba(spheres.find((item) => item.id === group.sphereId)?.color ?? '', 0.7) ?? 'rgba(71,85,105,0.8)'),
              background: group.sphereId === 'without-sphere'
                ? 'rgba(15,23,42,0.82)'
                : (hexToRgba(spheres.find((item) => item.id === group.sphereId)?.color ?? '', 0.14) ?? 'rgba(15,23,42,0.82)')
            }}
          >
            <h2 className="text-lg font-semibold">Сектор: {group.sphereName}</h2>

            {group.tasks.map((task) => {
              const hasOverdueState = isOverdue(task);
              const hasReminderState = !hasOverdueState && shouldTaskGlow(task);

              return (
                <article
                  key={task.id}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 p-3"
                  style={hasOverdueState
                    ? { boxShadow: '0 0 12px rgba(239,68,68,0.45), inset 0 0 8px rgba(239,68,68,0.2)', animation: 'subtask-overdue-glow 2.3s ease-in-out infinite' }
                    : hasReminderState
                      ? { boxShadow: '0 0 12px rgba(56,189,248,0.45), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
                      : undefined}
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
        )) : (
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-3">
            <h2 className="mb-3 text-lg font-semibold">Таймлайн задач</h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                <div ref={timelineScrollRef} className="relative overflow-x-hidden overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  <div className="relative" style={{ height: `${timelineToday.totalHeight}px` }}>
                    {Array.from({ length: HOURS_IN_DAY }).map((_, hourIndex) => (
                      <div key={`hour-${hourIndex}`} className="absolute inset-x-0 border-t border-slate-700/80" style={{ top: `${timelineToday.hourTops[hourIndex]}px` }}>
                        <span className="absolute -top-3 left-0 rounded bg-slate-900 px-1 text-xs text-slate-400">{`${hourIndex.toString().padStart(2, '0')}:00`}</span>
                      </div>
                    ))}
                    {timelineToday.isTodayVisible ? (
                      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: `${timelineToday.currentTimeTop}px` }}>
                        <span className="h-3 w-3 -translate-x-1 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                        <span className="h-[2px] w-full bg-rose-400/90" />
                      </div>
                    ) : null}
                    {timelineToday.timelineEntries.map((task) => {
                      const dueDate = new Date(task.dueDate as string);
                      const taskHour = dueDate.getHours();
                      const top = timelineToday.hourTops[taskHour] + ((dueDate.getMinutes() / 60) * timelineToday.hourHeights[taskHour]);
                      const hasOverdueState = isOverdue(task);
                      const isSubtask = Boolean(task.parentTaskId);
                      const sphereColor = task.sphereId ? spheres.find((item) => item.id === task.sphereId)?.color ?? null : null;
                      const placement = timelineTaskPlacements.get(task.id) ?? { depth: 0, overlapCount: 1 };
                      const widthShrinkPercent = Math.min(placement.depth * 12, 45);
                      return (
                        <button
                          type="button"
                          key={task.id}
                          className="absolute rounded-md border px-2 py-1 text-left"
                          style={{
                            top: `${top + 4}px`,
                            minHeight: `${42 + ((placement.overlapCount - 1) * 10)}px`,
                            left: 'calc(4rem + 2px)',
                            width: `calc(100% - 4rem - 8px - ${widthShrinkPercent}%)`,
                            zIndex: 10 + placement.depth,
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
                          onClick={() => openTaskModal(task)}
                        >
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-slate-300">{isSubtask ? 'Подзадача · ' : ''}{formatDueDate(task.dueDate)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {timelineGroups.withoutDate.length > 0 ? (
                <div className="space-y-2 rounded-md border border-dashed border-slate-700 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Без дедлайна</p>
                  {timelineGroups.withoutDate.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      className="w-full rounded-md border border-slate-700 bg-slate-800/65 px-3 py-2 text-left text-sm"
                      onClick={() => openTaskModal(task)}
                    >
                      {task.title}
                    </button>
                  ))}
                </div>
              ) : null}
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void saveTask(openedTask.id)}
                  disabled={savingId === openedTask.id}
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  <Save size={14} />
                  {savingId === openedTask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                </button>
                <button
                  type="button"
                  onClick={() => void completeTask(openedTask.id)}
                  disabled={completingId === openedTask.id}
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {completingId === openedTask.id ? 'Завершаем…' : 'Выполнить'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTask(openedTask.id)}
                  disabled={deletingId === openedTask.id}
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deletingId === openedTask.id ? 'Удаляем…' : 'Удалить'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsAiDialogOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium"
              >
                <Bot size={14} />
                Диалог с ИИ
              </button>
            </div>
            {isAiDialogOpen ? (
              <div className="mt-3 space-y-2 rounded-md border border-violet-500/40 bg-slate-800/80 p-3">
                <h3 className="text-sm font-semibold text-violet-100">Чат по задаче</h3>
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
                <div className="flex items-center gap-2">
                  <input
                    value={aiDraft}
                    onChange={(event) => setAiDraft(event.target.value)}
                    placeholder="Напишите сообщение для ИИ"
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
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
                const isSubtaskExpanded = expandedSubtaskIds.includes(subtask.id);
                const subtaskDraft = draftByTaskId[subtask.id] ?? {
                  title: subtask.title,
                  description: subtask.description ?? '',
                  dueDate: toInputDateTime(subtask.dueDate)
                };
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
                      onClick={() => toggleExpandedSubtask(subtask.id)}
                      className="flex w-full items-start justify-between gap-2 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{subtask.title}</p>
                        <p className="text-xs text-slate-300">Дедлайн: {formatDueDate(subtask.dueDate)}</p>
                      </div>
                      {isSubtaskExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {isSubtaskExpanded ? (
                      <div className="mt-2 space-y-2 border-t border-slate-700 pt-2">
                        <input
                          value={subtaskDraft.title}
                          onChange={(event) => onChangeDraft(subtask.id, { title: event.target.value })}
                          className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                          placeholder="Название подзадачи"
                        />
                        <textarea
                          value={subtaskDraft.description}
                          onChange={(event) => onChangeDraft(subtask.id, { description: event.target.value })}
                          className="min-h-16 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                          placeholder="Описание подзадачи"
                        />
                        <input
                          type="datetime-local"
                          value={subtaskDraft.dueDate}
                          onChange={(event) => onChangeDraft(subtask.id, { dueDate: event.target.value })}
                          className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => void saveTask(subtask.id)}
                            disabled={savingId === subtask.id}
                            className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium disabled:opacity-60"
                          >
                            {savingId === subtask.id ? 'Сохраняем…' : 'Сохранить задачу'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void completeTask(subtask.id)}
                            disabled={completingId === subtask.id}
                            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium disabled:opacity-60"
                          >
                            {completingId === subtask.id ? 'Завершаем…' : 'Выполнить'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteTask(subtask.id)}
                            disabled={deletingId === subtask.id}
                            className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium disabled:opacity-60"
                          >
                            {deletingId === subtask.id ? 'Удаляем…' : 'Удалить'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
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
              <button
                type="button"
                onClick={() => setIsAiDialogOpen(false)}
                className="rounded-md border border-slate-600 p-1 text-slate-300"
                aria-label="Закрыть диалог с ИИ"
              >
                <X size={16} />
              </button>
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
            <div className="mt-3 flex items-center gap-2">
              <input
                value={aiDraft}
                onChange={(event) => setAiDraft(event.target.value)}
                placeholder="Напишите сообщение для ИИ"
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
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
    </main>
  );
}
