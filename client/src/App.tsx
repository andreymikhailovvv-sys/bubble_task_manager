import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Bot, Check, GripVertical, Maximize2, Minimize2, Paperclip, Plus, SendHorizontal, X } from 'lucide-react';
import { BubbleField } from './components/BubbleField';
import { InlineDateTimePickerIcon } from './components/InlineDateTimePickerIcon';
import { DateTimePickerWithApply } from './components/DateTimePickerWithApply';
import { SectorEditor, HARMONIOUS_COLORS } from './components/SectorEditor';
import { TaskEditor } from './components/TaskEditor';
import { api, setUnauthorizedHandler, type CurrentUser } from './lib/api';
import { calcScore } from './lib/layout';
import { resolveSphereIcon } from './lib/sphereIcons';
import type { ChatAttachmentPayload, ChatMessage, ChatMode, Insight, Sphere, Task } from './lib/types';

const MAX_SPHERES = 8;
const MAX_AI_ATTACHMENTS = 3;
const MAX_AI_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const SUPPORTED_AI_FILE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;
const getAiDialogStorageKey = (userId: string) => `btm:${userId}:ai-dialog-by-task`;
const getBackgroundStorageKey = (userId: string) => `btm:${userId}:background-image`;

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<'global' | 'sectors'>('sectors');
  const [search, setSearch] = useState('');
  const [selectedSphereIds, setSelectedSphereIds] = useState<string[]>([]);
  const [isSphereFilterOpen, setIsSphereFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [editorState, setEditorState] = useState<{ task?: Task; initialSphereId?: string } | null>(null);
  const [sectorEditorSphere, setSectorEditorSphere] = useState<Sphere | null>(null);
  const [poppingTaskId, setPoppingTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedDraft, setFocusedDraft] = useState<Partial<Task> | null>(null);
  const [focusedNotifyPreset, setFocusedNotifyPreset] = useState('60');
  const [isAddingFocusedSubtask, setIsAddingFocusedSubtask] = useState(false);
  const [focusedSubtaskTitle, setFocusedSubtaskTitle] = useState('');
  const [aiDraft, setAiDraft] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoadingTaskId, setAiLoadingTaskId] = useState<string | null>(null);
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [aiMode, setAiMode] = useState<ChatMode>('fast');
  const [aiDialogByTask, setAiDialogByTask] = useState<Record<string, ChatMessage[]>>({});
  const [subtaskOrderMap, setSubtaskOrderMap] = useState<Record<string, string[]>>({});
  const [isSubtaskFilterActive, setIsSubtaskFilterActive] = useState(false);
  const [completedFilter, setCompletedFilter] = useState<'today' | 'all'>('today');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const focusedSubtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const focusedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const expandedAiDialogContainerRef = useRef<HTMLDivElement | null>(null);
  const focusedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const expandedAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const focusedDueDateInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const sphereData = await api.getSpheres();
    const [taskData, insightData] = await Promise.all([api.getTasks(), api.getInsights()]);
    setSpheres(sphereData);
    setTasks(taskData);
    setInsights(insightData);
  }

  const clearUserState = () => {
    setCurrentUser(null);
    setSpheres([]);
    setTasks([]);
    setInsights([]);
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
    setAiPendingFiles([]);
    setIsAiExpanded(false);
      setAiMode('fast');
      setAiDialogByTask({});
      setSubtaskOrderMap({});
      setBackgroundImage(null);
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
      setBackgroundImage(null);
      return;
    }
    try {
      const aiDialogRaw = localStorage.getItem(getAiDialogStorageKey(currentUser.id));
      if (!aiDialogRaw) {
        setAiDialogByTask({});
      } else {
        const parsed = JSON.parse(aiDialogRaw) as Record<string, ChatMessage[]>;
        setAiDialogByTask(parsed && typeof parsed === 'object' ? parsed : {});
      }
    } catch {
      setAiDialogByTask({});
    }

    setBackgroundImage(localStorage.getItem(getBackgroundStorageKey(currentUser.id)));
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
    localStorage.setItem(getAiDialogStorageKey(currentUser.id), JSON.stringify(aiDialogByTask));
  }, [aiDialogByTask, currentUser?.id]);

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
      if (!isSubtaskFilterActive) {
        acc[parentId] = items;
        return acc;
      }
      acc[parentId] = [...items].sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE'));
      return acc;
    }, {}),
    [isSubtaskFilterActive, subtaskMap]
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
  const focusedTask = useMemo(() => rootTasks.find((task) => task.id === focusedTaskId) ?? null, [rootTasks, focusedTaskId]);
  const focusedAiDialog = useMemo(
    () => (focusedTask ? aiDialogByTask[focusedTask.id] ?? [] : []),
    [aiDialogByTask, focusedTask]
  );

  useEffect(() => {
    if (!focusedTask) {
      setFocusedDraft(null);
      setIsAddingFocusedSubtask(false);
      setFocusedSubtaskTitle('');
      setAiDraft('');
      setAiError(null);
      setIsAiExpanded(false);
      setAiMode('fast');
      setAiPendingFiles([]);
      return;
    }
    setFocusedDraft(focusedTask);
    if (focusedTask.notifyBeforeMinutes === null) {
      setFocusedNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(focusedTask.notifyBeforeMinutes ?? 60)) {
      setFocusedNotifyPreset(String(focusedTask.notifyBeforeMinutes ?? 60));
    } else {
      setFocusedNotifyPreset('60');
    }
  }, [focusedTask]);

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

  const sendFocusedAiQuestion = async () => {
    if (!focusedTask) return;
    const question = aiDraft.trim();
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
    const userContent = fileNames.length > 0
      ? `${question || 'Пользователь отправил сообщение с вложением.'}\n\n📎 Файлы: ${fileNames.join(', ')}`
      : question;
    const nextDialog = [...previousDialog, { role: 'user' as const, content: userContent }];
    setAiDialogByTask((prev) => ({ ...prev, [taskId]: nextDialog }));
    setAiDraft('');
    setAiPendingFiles([]);
    setAiError(null);
    setAiLoadingTaskId(taskId);

    try {
      const result = await askTaskAssistant(taskId, {
        question: question || 'Пользователь отправил сообщение с вложением. Проанализируй содержимое файлов.',
        history: previousDialog,
        mode: aiMode,
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
    mimeType: file.type,
    size: file.size,
    contentBase64: await toBase64(file)
  });

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx)$/i.test(file.name));
    if (normalized.length !== selectedFiles.length) {
      setAiError('Можно прикреплять только PDF и DOCX файлы.');
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

  const visibleTasks = useMemo(
    () =>
      activeTasks.filter((task) => {
        if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
        const isFilteringBySubset = spheres.length > 0 && selectedSphereIds.length > 0 && selectedSphereIds.length < spheres.length;
        if (isFilteringBySubset && (!task.sphereId || !selectedSphereIds.includes(task.sphereId))) return false;
        if (timeFilter !== 'all') {
          const timestamp = task.dueDate ?? task.createdAt ?? task.updatedAt;
          if (!timestamp) return false;
          const taskDate = new Date(timestamp);
          if (Number.isNaN(taskDate.getTime())) return false;

          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (timeFilter === 'today') {
            const endOfToday = new Date(startOfToday);
            endOfToday.setDate(endOfToday.getDate() + 1);
            if (taskDate < startOfToday || taskDate >= endOfToday) return false;
          } else if (timeFilter === 'week') {
            const day = startOfToday.getDay();
            const offsetToMonday = (day + 6) % 7;
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfWeek.getDate() - offsetToMonday);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 7);
            if (taskDate < startOfWeek || taskDate >= endOfWeek) return false;
          } else if (timeFilter === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            if (taskDate < startOfMonth || taskDate >= endOfMonth) return false;
          }
        }
        return true;
      }),
    [activeTasks, search, selectedSphereIds, spheres.length, timeFilter]
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

  const shouldTaskGlow = (task: Task) => {
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const diff = due.getTime() - Date.now();
    if (diff < 0) return true;
    if (task.notifyBeforeMinutes === null) return false;
    const notifyBefore = (task.notifyBeforeMinutes ?? 60) * 60_000;
    return diff <= notifyBefore;
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
    if (nextSubtasks.length === 0) return;
    const allDone = nextSubtasks.every((task) => task.status === 'DONE');
    const parentTask = allTasks.find((task) => task.id === parentTaskId);
    if (!parentTask) return;
    if (allDone && parentTask.status !== 'DONE') {
      await api.updateTask(parentTaskId, { status: 'DONE' });
    }
    if (!allDone && parentTask.status === 'DONE') {
      await api.updateTask(parentTaskId, { status: 'TODO' });
    }
  };

  const toggleSubtaskDone = async (subtask: Task) => {
    const nextStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    await api.updateTask(subtask.id, { status: nextStatus });
    if (subtask.parentTaskId) {
      await syncParentStatusBySubtasks(subtask.parentTaskId);
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
    await createSubtaskForParent(focusedTask, { title, notifyBeforeMinutes: 60 });
    setFocusedSubtaskTitle('');
    setIsAddingFocusedSubtask(false);
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

  const askTaskAssistant = async (taskId: string, payload: { question: string; history: ChatMessage[]; mode: ChatMode; attachments?: ChatAttachmentPayload[] }) => {
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

  return (
    <main
      className="flex h-screen flex-col overflow-hidden p-4 text-slate-100 lg:p-6"
      style={{
        backgroundImage: backgroundImage
          ? `linear-gradient(rgba(2,6,23,0.58), rgba(2,6,23,0.72)), url(${backgroundImage})`
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

      <section className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-4">
        <div className="relative">
          <button
            className="flex w-full items-center justify-between rounded bg-slate-800 p-2 text-left text-sm"
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
        <div>
          <select
            className="w-full rounded bg-slate-800 p-2 text-sm"
            value={timeFilter}
            onChange={(event) => setTimeFilter(event.target.value as 'all' | 'today' | 'week' | 'month')}
          >
            <option value="all">За все время</option>
            <option value="today">За сегодня</option>
            <option value="week">За эту неделю</option>
            <option value="month">За этот месяц</option>
          </select>
        </div>
        <div className="lg:col-span-2 flex flex-wrap items-center justify-end gap-2">
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
        <BubbleField
          className="h-full"
          tasks={visibleTasks}
          spheres={visibleSpheres}
          subtaskMap={displayedSubtaskMap}
          isSubtaskFilterActive={isSubtaskFilterActive}
          onToggleSubtaskFilter={() => setIsSubtaskFilterActive((prev) => !prev)}
          mode={mode}
          poppingTaskId={poppingTaskId}
          selectedId={editorState?.task?.id}
          onSelect={(task) => setFocusedTaskId(task.id)}
          onSelectSubtask={(subtask) => setEditorState({ task: subtask })}
          onCreateSubtask={async (parentTask, payload) => {
            await createSubtaskForParent(parentTask, payload);
          }}
          onToggleSubtaskDone={toggleSubtaskDone}
          onUpdateSubtaskDueDate={async (subtask, dueDate) => {
            await api.updateTask(subtask.id, { dueDate });
            await load();
          }}
          onReorderSubtasks={(parentTaskId, sourceIndex, targetIndex) => {
            setSubtaskOrderMap((prev) => {
              const current = prev[parentTaskId] ?? (subtaskMap[parentTaskId] ?? []).map((task) => task.id);
              if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || sourceIndex >= current.length || targetIndex >= current.length) {
                return prev;
              }
              const next = [...current];
              const [moved] = next.splice(sourceIndex, 1);
              next.splice(targetIndex, 0, moved);
              return { ...prev, [parentTaskId]: next };
            });
          }}
          onAddTaskToSphere={(sphere) => setEditorState({ initialSphereId: sphere.id })}
          onRenameSphere={(sphere) => setSectorEditorSphere(sphere)}
        />
        <aside
          className="absolute right-0 top-0 z-10 h-full w-[320px] space-y-4 overflow-y-auto overscroll-contain border-l border-slate-700/60 bg-slate-950/90 p-4 backdrop-blur-sm"
          data-no-field-zoom="true"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">AI suggestions</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.map((insight) => <li key={insight.id}>• {insight.text}</li>)}
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
                  <span className="truncate">{task.title}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-4">
            <h3 className="mb-2 text-sm font-semibold">Фон рабочего пространства</h3>
            <label className="mb-2 block rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-700/80">
              <span className="block font-medium">Загрузить изображение</span>
              <span className="mt-1 block text-[11px] text-slate-400">Рекомендуемый размер: от 1920×1080 (лучше 2560×1440).</span>
              <input type="file" accept="image/*" className="mt-2 block w-full text-[11px]" onChange={handleBackgroundUpload} />
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
          onComplete={editorState.task?.id ? () => completeTask(editorState.task!) : undefined}
          onDelete={editorState.task?.id ? async () => {
            await api.deleteTask(editorState.task!.id);
            setEditorState(null);
            await load();
          } : undefined}
        />
      ) : null}

      {focusedTask && focusedDraft ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" onClick={() => setFocusedTaskId(null)}>
          <div className="flex w-full max-w-[1380px] items-stretch justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <aside className="hidden h-[min(86vh,760px)] min-h-0 w-[410px] shrink-0 flex-col overflow-hidden rounded-[2rem] border border-violet-300/30 bg-slate-950/92 p-4 shadow-2xl lg:flex">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-violet-100"><Bot size={16} /> Помощь ИИ</p>
                  <p className="mt-1 text-xs text-slate-300">{focusedTask.title}</p>
                </div>
                <button
                  className="rounded bg-slate-700/80 p-1.5 text-slate-200 hover:bg-slate-600"
                  onClick={() => setIsAiExpanded(true)}
                  title="Развернуть диалог"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
              <div ref={focusedAiDialogContainerRef} className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-900/90 p-3">
                {focusedAiDialog.length === 0 ? <p className="text-xs text-slate-400">Спросите ИИ, как быстрее и качественнее выполнить задачу.</p> : null}
                {focusedAiDialog.map((message, index) => (
                  <div
                    key={`focused-ai-${message.role}-${index}`}
                    className={`max-w-[88%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                    <p>{message.content}</p>
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
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                <p className="text-[10px] text-slate-400">PDF / DOCX, до 8MB</p>
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
                <button
                  className="flex items-center gap-1 rounded bg-violet-600 px-3 py-1.5 text-xs disabled:opacity-50"
                  disabled={aiLoadingTaskId === focusedTask.id}
                  onClick={() => void sendFocusedAiQuestion()}
                >
                  <SendHorizontal size={13} />
                  Отправить
                </button>
              </div>
            </aside>
            <aside className="h-[min(86vh,760px)] min-h-0 w-full max-w-3xl overflow-hidden rounded-[2.3rem] border border-cyan-200/30 bg-slate-900 p-5 shadow-2xl">
            <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col">
                <div className="space-y-3 overflow-y-auto pr-1">
                  <h3 className="text-xl font-semibold text-slate-100">Фокус задачи</h3>
                  <input className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.title ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), title: e.target.value }))} />
                  <textarea className="min-h-44 w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.description ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), description: e.target.value }))} />
                  <select className="w-full rounded bg-slate-800 p-2 text-sm" value={focusedDraft.sphereId ?? ''} onChange={(e) => setFocusedDraft((p) => ({ ...(p ?? {}), sphereId: e.target.value || null }))}>
                  <option value="">Без сектора</option>
                  {spheres.map((sphere) => <option key={sphere.id} value={sphere.id}>{sphere.name}</option>)}
                  </select>
                  <label className="block text-xs">Срок (дата и время)
                    <DateTimePickerWithApply
                      className="mt-1"
                      value={focusedDraft.dueDate}
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
                        <button key={level} className={`rounded border px-2 py-1 text-sm ${focusedDraft.importance === level ? 'border-cyan-300 bg-cyan-600' : 'border-slate-600 bg-slate-800'}`} onClick={() => setFocusedDraft((p) => ({ ...(p ?? {}), importance: level }))}>{level}</button>
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
                  <h4 className="text-sm font-semibold">Подзадачи</h4>
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
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
                  {(displayedSubtaskMap[focusedTask.id] ?? []).map((subtask, index) => (
                    <li
                      key={subtask.id}
                      className="flex items-center gap-2 rounded bg-slate-800/70 px-2 py-1"
                      draggable={!isSubtaskFilterActive}
                      onDragStart={(event) => {
                        if (isSubtaskFilterActive) return;
                        event.dataTransfer.setData('text/plain', String(index));
                      }}
                      onDragOver={(event) => {
                        if (isSubtaskFilterActive) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (isSubtaskFilterActive) return;
                        event.preventDefault();
                        const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                        if (Number.isNaN(sourceIndex)) return;
                        setSubtaskOrderMap((prev) => {
                          const current = prev[focusedTask.id] ?? (subtaskMap[focusedTask.id] ?? []).map((task) => task.id);
                          const next = [...current];
                          const [moved] = next.splice(sourceIndex, 1);
                          next.splice(index, 0, moved);
                          return { ...prev, [focusedTask.id]: next };
                        });
                      }}
                      style={isOverdue(subtask)
                        ? { boxShadow: '0 0 10px rgba(239,68,68,0.55), inset 0 0 8px rgba(239,68,68,0.2)' }
                        : shouldTaskGlow(subtask)
                          ? { boxShadow: '0 0 10px rgba(56,189,248,0.5), inset 0 0 8px rgba(56,189,248,0.2)', animation: 'subtask-reminder-glow 2.3s ease-in-out infinite' }
                          : undefined}
                    >
                      <span className="cursor-grab text-slate-400 active:cursor-grabbing"><GripVertical size={14} /></span>
                      <input type="checkbox" checked={subtask.status === 'DONE'} onChange={async () => { await toggleSubtaskDone(subtask); }} />
                      <button
                        className={`flex-1 text-left ${subtask.status === 'DONE' ? 'line-through opacity-60' : ''}`}
                        onClick={() => setEditorState({ task: subtask })}
                        title="Открыть доп задачу"
                      >
                        {subtask.title}
                      </button>
                      <InlineDateTimePickerIcon
                        value={subtask.dueDate}
                        title="Изменить срок подзадачи"
                        onChange={async (dueDate) => {
                          await api.updateTask(subtask.id, { dueDate });
                          await load();
                        }}
                      />
                    </li>
                  ))}
                  {(displayedSubtaskMap[focusedTask.id] ?? []).length === 0 ? <li className="text-xs text-slate-400">Пока нет подзадач</li> : null}
                </ul>
              </div>
            </div>
            </aside>
          </div>
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
              {focusedAiDialog.length === 0 ? <p className="text-sm text-slate-400">Спросите ИИ, как эффективнее выполнить задачу.</p> : null}
              {focusedAiDialog.map((message, index) => (
                <div
                  key={`expanded-ai-${message.role}-${index}`}
                  className={`max-w-[72ch] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-line break-words [overflow-wrap:anywhere] ${message.role === 'assistant' ? 'mr-auto bg-violet-600/30 text-violet-50' : 'ml-auto bg-slate-700/90 text-slate-50'}`}
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-200/80">{message.role === 'assistant' ? 'ИИ' : 'Вы'}</p>
                  <p>{message.content}</p>
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
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              <p className="text-[11px] text-slate-400">PDF / DOCX, до 8MB</p>
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
