import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, BookOpenText, CalendarClock, Check, CheckCircle2, ChevronRight, CircleHelp,
  Coins, FolderKanban, LayoutDashboard, ListTodo, Loader2, LogIn, Menu,
  Clock3, ChevronDown, ChevronUp, Plus, Search, Settings, Settings2, SlidersHorizontal, Sparkles, Trash2,
  TrendingUp, UserPlus, X
} from 'lucide-react';
import { api, type CreditPack, type CurrentUser, type CreditUsageStatistics, type SubscriptionLinks } from './lib/api';
import { showBrowserSystemNotification } from './lib/browser-system-notifications';
import type { ChatAttachmentPayload, ChatMessage, Sphere, Task } from './lib/types';
import { TaskEditor } from './components/TaskEditor';
import { SectorEditor } from './components/SectorEditor';
import { FocusedTaskWindowFrame } from './components/FocusedTaskWindowFrame';
import { StandaloneNotesWorkspace } from './components/StandaloneNotesWorkspace';
import { PlanikMascot } from './components/PlanikMascot';
import { CustomSelect } from './components/CustomSelect';
import { TaskDescriptionInput } from './components/TaskDescriptionInput';
import { ResizableDescriptionSurface } from './components/ResizableDescriptionSurface';
import { TestPageTaskDialog } from './TestPageTaskDialog';
import { TestPageSubtaskFocus } from './TestPageSubtaskFocus';
import { TestPageHabits } from './TestPageHabits';
import { TestPageRating } from './TestPageRating';
import { TestPageIntegrationsDialog } from './TestPageIntegrationsDialog';
import { NotesEditor } from './components/NotesEditor';
import { useCreditPurchase } from './lib/useCreditPurchase';
import { useSubscriptionPurchase } from './lib/useSubscriptionPurchase';
import { WorkspaceGlobalSearch } from './components/WorkspaceGlobalSearch';
import { matchesWorkspaceText } from './lib/workspaceSearch';
import { TestPageChat } from './TestPageChat';
import { TestPageSettings } from './TestPageSettings';
import { CreditUsageStats } from './components/CreditUsageStats';
import { loadThemePreference, resolveThemeMode, type ThemePreference } from './lib/autoTheme';
import { urgentFocusSubtaskFirst } from './lib/focusSubtaskSort';
import './TestPage.css';

type Section = 'overview' | 'tasks' | 'sectors' | 'notes';
type AuthMode = 'login' | 'register';
const navigation = [
  { key: 'overview', title: 'Обзор', icon: LayoutDashboard },
  { key: 'tasks', title: 'Задачи', icon: ListTodo },
  { key: 'sectors', title: 'Сектора', icon: FolderKanban },
  { key: 'notes', title: 'Заметки', icon: BookOpenText }
] as const;

type SystemNotice={id:string;eventKey?:string;taskId?:string|null;content:string;readAt?:string|null;createdAt:string};
const isTask = (task: Task) => !task.taskType || task.taskType === 'TASK';
const isDone = (task: Task) => task.status === 'DONE';
const asDateKey = (value: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(value)).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {} as Record<string, string>);
  } catch { return null; }
};
const keyOf = (value: string, timeZone: string) => {
  const date = asDateKey(value, timeZone);
  return date ? [date.year, date.month, date.day].join('-') : '';
};
const dateLabel = (value: string | null | undefined, timeZone: string) => {
  if (!value) return 'Без срока';
  try { return new Date(value).toLocaleDateString('ru-RU', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return 'Без срока'; }
};
const percent = (completed: number, total: number) => total ? Math.round(completed * 100 / total) : 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
const sortByDate = (a: Task, b: Task) => (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity);
const isOverdue = (task: Task) => !isDone(task) && !!task.dueDate && Number.isFinite(Date.parse(task.dueDate)) && Date.parse(task.dueDate) < Date.now();
const focusSubtaskSort = (a: Task, b: Task) =>
  Number(isDone(a)) - Number(isDone(b)) || urgentFocusSubtaskFirst(a, b);
const formatCredits = (credits: number) => credits.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export default function TestPage() {
  const [section, setSection] = useState<Section>('overview');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authForm, setAuthForm] = useState({ login: '', password: '', email: '', name: '', consent: false });
  const [editor, setEditor] = useState<{ task?: Task; sphereId?: string } | null>(null);
  const [testTaskDialog, setTestTaskDialog] = useState<{ task?: Task; parentTask?: Task } | null>(null);
  const [subtaskFocusId, setSubtaskFocusId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [requestedNote, setRequestedNote] = useState<{id:string;serial:number}|null>(null);
  const [overviewSearchOpen, setOverviewSearchOpen] = useState(false);
  const [overviewQuery, setOverviewQuery] = useState('');
  const [sectorEditor, setSectorEditor] = useState<Sphere | 'new' | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusChatId, setFocusChatId] = useState<string | null>(null);
  const [focusDescription, setFocusDescription] = useState('');
  const [focusNotesOpen,setFocusNotesOpen]=useState(false);
  const [heroHidden,setHeroHidden]=useState(false);
  const focusDescriptionRef = useRef('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const completionInFlightRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collaborationComplete, setCollaborationComplete] = useState<Task | null>(null);
  const [query, setQuery] = useState('');
  const [sphereFilter, setSphereFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditStats, setCreditStats] = useState<CreditUsageStatistics | null>(null);
  const [subscriptionLinks, setSubscriptionLinks] = useState<SubscriptionLinks | null>(null);
  const [creditError, setCreditError] = useState('');
  const [creditPacksError,setCreditPacksError]=useState('');
  const [creditsBusy, setCreditsBusy] = useState(false);
  const [creditTab, setCreditTab] = useState<'packs' | 'plans' | 'stats'>('packs');
  const [creditPacks,setCreditPacks]=useState<CreditPack[]>([]);
  const [creditPurchaseAvailable,setCreditPurchaseAvailable]=useState(false);
  const [subscriptionPurchaseAvailable,setSubscriptionPurchaseAvailable]=useState(false);
  const subscriptionPurchase=useSubscriptionPurchase({
    surface:'web', openConfirmation:url=>window.location.assign(url),
    onSucceeded:async()=>{const me=await api.getMe();setUser(me.user);}
  });
  const creditPurchase=useCreditPurchase({
    surface:'web',
    openConfirmation:url=>window.location.assign(url),
    onSucceeded:async()=>{const me=await api.getMe();setUser(me.user);}
  });
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemNotices,setSystemNotices]=useState<SystemNotice[]>([]);
  const [noticeToast,setNoticeToast]=useState<SystemNotice|null>(null);
  const noticedIds=useRef<Set<string>>(new Set());
  const [assistantActivity,setAssistantActivity]=useState<{busy:boolean;progress:string|null}>({busy:false,progress:null});
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const timeZone = user?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeMode, setThemeMode] = useState<ThemePreference>('auto');
  useEffect(() => {
    if (user) setThemeMode(loadThemePreference(localStorage, 'btm:' + user.id + ':theme-mode'));
  }, [user?.id]);
  useEffect(()=>{
    if(!user?.id)return;
    try{setHeroHidden(localStorage.getItem('btm:'+user.id+':test-page:hero-hidden')==='1');}
    catch{setHeroHidden(false);}
  },[user?.id]);
  const toggleHero=()=>{
    setHeroHidden(hidden=>{
      const next=!hidden;
      if(user?.id)try{localStorage.setItem('btm:'+user.id+':test-page:hero-hidden',next?'1':'0');}catch{}
      return next;
    });
  };
  useEffect(() => {
    const apply = () => setTheme(resolveThemeMode(themeMode, timeZone, new Date()));
    apply();
    const timer = window.setInterval(apply, 60_000);
    return () => window.clearInterval(timer);
  }, [themeMode, timeZone]);
  const changeThemeMode = (next: ThemePreference) => {
    setThemeMode(next);
    if (user) localStorage.setItem('btm:' + user.id + ':theme-mode', next);
  };

  const reload = useCallback(async () => {
    const [nextTasks, nextSpheres, nextUser] = await Promise.all([api.getTasks(), api.getSpheres(), api.getMe()]);
    setTasks(nextTasks);
    setSpheres(nextSpheres);
    setUser(nextUser.user);
  }, []);
  useEffect(() => {
    let mounted = true;
    void api.getMe().then(async ({ user: activeUser }) => {
      if (!mounted) return;
      setUser(activeUser);
      await reload().catch(cause => { if (mounted) setError(errorText(cause)); });
      // The dedicated poller below owns the authoritative unread count and feed.
      // Avoid racing a second request for the same notifications.
    }).catch(() => { if (mounted) setUser(null); }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [reload]);

  const rootTasks = useMemo(() => tasks.filter(task => !task.parentTaskId && isTask(task)), [tasks]);
  const subtasks = useMemo(() => tasks.filter(task => !!task.parentTaskId && isTask(task)), [tasks]);
  const taskLookup = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);
  const today = keyOf(new Date().toISOString(), timeZone);
  const todayTasks = [...rootTasks,...subtasks].filter(task => task.dueDate && keyOf(task.dueDate, timeZone) === today);
  const todayDone = todayTasks.filter(isDone).length;
  const totalDone = rootTasks.filter(isDone).length;
  const activeTasks = rootTasks.filter(task => !isDone(task)).sort(sortByDate);
  const upcomingSubtasks = subtasks.filter(task => !isDone(task) && !!task.dueDate).sort(sortByDate);
  const overviewTasks = overviewQuery.trim()
    ? activeTasks.filter(task => matchesWorkspaceText(task.title+' '+(task.description||''),overviewQuery))
    : activeTasks;
  const visibleTasks = rootTasks.filter(task => {
    if (sphereFilter !== 'all' && (task.sphereId || 'none') !== sphereFilter) return false;
    if (statusFilter === 'active' && isDone(task)) return false;
    if (statusFilter === 'done' && !isDone(task)) return false;
    return !query.trim() || matchesWorkspaceText(task.title+' '+(task.description||''),query);
  }).sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || sortByDate(a, b));
  const focusTask = focusId ? taskLookup.get(focusId) : undefined;
  const subtaskFocus = subtaskFocusId ? taskLookup.get(subtaskFocusId) : undefined;
  const focusSubtasks = focusTask ? subtasks.filter(task => task.parentTaskId === focusTask.id).sort(focusSubtaskSort) : [];
  const subtaskProgress = useMemo(()=>{
    const progress=new Map<string,{done:number;total:number}>();
    for(const item of subtasks){
      if(!item.parentTaskId)continue;
      const previous=progress.get(item.parentTaskId)||{done:0,total:0};
      previous.total++;
      if(isDone(item))previous.done++;
      progress.set(item.parentTaskId,previous);
    }
    return progress;
  },[subtasks]);
  useEffect(() => {
    setFocusNotesOpen(false);
    const content=focusTask?.description || '';
    focusDescriptionRef.current=content;
    setFocusDescription(content);
  }, [focusId]);
  useEffect(() => {
    if (!focusTask || focusDescription === (focusTask.description || '')) return;
    const id = focusTask.id;
    const pending = window.setTimeout(() => {
      void api.updateTask(id, { description: focusDescription }).then(saved => {
        setTasks(current => current.map(item => item.id === id ? { ...item, description: saved.description } : item));
      }).catch(cause => setError(errorText(cause)));
    }, 900);
    return () => window.clearTimeout(pending);
  }, [focusDescription, focusId, focusTask?.description]);
  const editFocusDescription = (next: string) => {focusDescriptionRef.current=next;setFocusDescription(next);};
  const saveFocusDescription = async () => {
    // The editor flushes buffered keystrokes on pointerdown. Read its
    // synchronous ref so clicking Complete never discards the final newline.
    const content=focusDescriptionRef.current;
    if (focusTask && content !== (focusTask.description || '')) {
      const saved = await api.updateTask(focusTask.id, { description: content });
      setTasks(current => current.map(item => item.id === saved.id ? { ...item, description: saved.description } : item));
    }
  };

  const openNotice=useCallback((notice:SystemNotice)=>{
    setNoticeToast(null);
    setAssistantOpen(true);
    if(!notice.taskId)return;
    const task=taskLookup.get(notice.taskId);
    if(!task)return;
    if(notice.eventKey?.startsWith('monitoring:')){
      setAssistantOpen(false);setFocusChatId(task.id);
    }else if(task.parentTaskId)setSubtaskFocusId(task.id);
    else setFocusId(task.id);
  },[taskLookup]);
  const openNoticeRef=useRef(openNotice);
  useEffect(()=>{openNoticeRef.current=openNotice;},[openNotice]);
  // Poll the same persisted feed as classic Planner; first load only sets a
  // baseline, so an old backlog never spams left-side alerts.
  useEffect(()=>{
    if(!user?.id)return;
    let active=true,baseline=false;
    let toastTimeout:number|undefined;
    noticedIds.current.clear();
    const pull=async()=>{
      try{
        const result=await api.getSystemNotifications();
        if(!active)return;
        const notices=result.notifications;
        const newcomers=notices.filter(item=>!noticedIds.current.has(item.id));
        notices.forEach(item=>noticedIds.current.add(item.id));
        setSystemNotices(notices);
        setUnreadCount(notices.filter(item=>item.readAt==null).length);
        if(baseline){
          for(const item of newcomers){
            if(item.readAt==null&&user.browserNotificationsEnabled!==false)
              void showBrowserSystemNotification(user.id,item,()=>openNoticeRef.current(item));
          }
          const unreadNew=newcomers.filter(item=>item.readAt==null);
          const unseen=unreadNew[unreadNew.length-1];
          if(unseen&&document.visibilityState==='visible'){
            setNoticeToast(unseen);
            if(toastTimeout!==undefined)window.clearTimeout(toastTimeout);
            toastTimeout=window.setTimeout(()=>setNoticeToast(null),5000);
          }
        }
        baseline=true;
      }catch(error){console.warn('[Test Page notifications]',error);}
    };
    void pull();
    const timer=window.setInterval(pull,15_000);
    return()=>{active=false;window.clearInterval(timer);if(toastTimeout!==undefined)window.clearTimeout(toastTimeout);noticedIds.current.clear();};
  },[user?.id,user?.browserNotificationsEnabled]);
  useEffect(()=>{
    if(!assistantOpen||!unreadCount)return;
    setUnreadCount(0);
    setSystemNotices(old=>old.map(item=>({...item,readAt:item.readAt??new Date().toISOString()})));
    void api.markSystemNotificationsRead().catch(error=>console.warn('[Test Page notifications read]',error));
  },[assistantOpen,unreadCount]);
  const refresh = async () => {
    try { await reload(); setError(''); }
    catch (cause) { setError(errorText(cause)); }
  };
  const saveTask = async (payload: Partial<Task>, drafts: Array<Pick<Task, 'title' | 'description'>> = [], eventAttachments: ChatAttachmentPayload[] = []) => {
    setBusy(true);
    try {
      const saved = editor?.task
        ? await api.updateTask(editor.task.id, payload)
        : await api.createTask({ ...payload, ...(editor?.sphereId ? { sphereId: payload.sphereId ?? editor.sphereId } : {}) });
      for (const draft of drafts) await api.createTask({ ...draft, parentTaskId: saved.id, sphereId: saved.sphereId });
      for (const attachment of eventAttachments) await api.createTaskAttachment(saved.id, attachment);
      setEditor(null);
      if (!editor?.task) void api.recordEfficiencyEvent({ delta: 1, bucket: 'task' }).catch(() => undefined);
      await refresh();
    } finally { setBusy(false); }
  };
  const generateWithAi = async (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments: ChatAttachmentPayload[] }) => {
    const result = await api.generateTaskFromAi(payload);
    const created = await api.createTask({ ...result.task, sphereId: result.suggestedSphereId ?? payload.sphereId ?? null });
    for (const subtask of result.task.subtasks) {
      await api.createTask({ ...subtask, parentTaskId: created.id, sphereId: created.sphereId });
    }
    setEditor(null);
    void api.recordEfficiencyEvent({ delta: 1, bucket: 'task' }).catch(() => undefined);
    await refresh();
  };
  const saveTestTask = async (payload: Partial<Task> & {collaborationScope?: 'me'|'all'}) => {
    if(!testTaskDialog)return;
    setBusy(true);
    try {
      const item=testTaskDialog.task;
      const parent=testTaskDialog.parentTask;
      await (item ? api.updateTask(item.id,payload) : api.createTask({...payload,parentTaskId:parent?.id??null,sphereId:payload.sphereId??parent?.sphereId??null}));
      if(!item)void api.recordEfficiencyEvent({delta:1,bucket:'task'}).catch(()=>undefined);
      setTestTaskDialog(null);
      await refresh();
    }finally{setBusy(false);}
  };
  const deleteTestTask = async () => {
    const task=testTaskDialog?.task;
    if(!task||!window.confirm('Удалить «'+task.title+'»?'))return;
    setBusy(true);
    try{
      await api.deleteTask(task.id);
      setTestTaskDialog(null);
      if(focusId===task.id)setFocusId(null);
      await refresh();
    }finally{setBusy(false);}
  };
  const setComplete = async (task: Task, scope?: 'me' | 'all') => {
    if (completionInFlightRef.current) return;
    if (!isDone(task) && task.isCollaborative && task.collaborationOwner && !task.parentTaskId && !scope) {
      setCollaborationComplete(task);
      return;
    }
    completionInFlightRef.current=true;
    try {
      const markingDone=!isDone(task);
      await api.updateTask(task.id, {
        status: markingDone ? 'DONE' : 'TODO',
        ...(task.isCollaborative ? { collaborationScope: scope ?? 'me' } : {})
      });
      if (markingDone) {
        // Keep the outgoing row/modal mounted until the completion transition
        // finishes. Refreshing first would remove it before it could animate.
        setCompletingTaskId(task.id);
        setCelebrationKey(previous => previous + 1);
        void api.recordEfficiencyEvent({ delta: task.parentTaskId ? 1.2 : 4, bucket: 'task' })
          .then(score=>setUser(current=>current?{...current,...score}:current))
          .catch(()=>undefined);
        await new Promise<void>(resolve=>window.setTimeout(resolve,360));
        if (focusId===task.id) setFocusId(null);
        if (subtaskFocusId===task.id) setSubtaskFocusId(null);
      }
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally {setCompletingTaskId(null);completionInFlightRef.current=false;}
  };
  const saveSphere = async (payload: Partial<Sphere>) => {
    try {
      if (sectorEditor && sectorEditor !== 'new') await api.updateSphere(sectorEditor.id, payload);
      else await api.createSphere(payload);
      setSectorEditor(null);
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
  };
  const deleteSphere = async (sphere: Sphere) => {
    if (!window.confirm('Удалить сектор «' + sphere.name + '»? Задачи останутся без этого сектора.')) return;
    try { await api.deleteSphere(sphere.id); await refresh(); }
    catch (cause) { setError(errorText(cause)); }
  };
  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setError('');
    try {
      if (authMode === 'register' && !authForm.consent) throw new Error('Для регистрации необходимо принять условия сервиса.');
      const result = authMode === 'register'
        ? await api.register({ login: authForm.login.trim(), password: authForm.password, name: authForm.name.trim(), email: authForm.email.trim(), consentAccepted: true })
        : await api.login({ login: authForm.login.trim(), password: authForm.password });
      setUser(result.user);
      setAuthMode(null);
      await refresh();
    } catch (cause) { setError(errorText(cause)); }
    finally { setAuthBusy(false); }
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseId = params.get('payment') === 'subscription' ? params.get('subscriptionPurchaseId') : null;
    if (!purchaseId) return;
    setCreditsOpen(true); setCreditTab('plans');
    subscriptionPurchase.setPendingPurchaseId(purchaseId);
    void subscriptionPurchase.check(purchaseId).catch(() => undefined);
    params.delete('payment'); params.delete('subscriptionPurchaseId');
    window.history.replaceState({}, '', window.location.pathname + (params.size ? '?' + params.toString() : '') + window.location.hash);
  }, []);
  const openCredits = async () => {
    setCreditsOpen(true);
    setCreditTab('packs');
    setCreditsBusy(true);
    setCreditError('');
    setCreditPacksError('');
    try {
      const [stats,links,packs,plans]=await Promise.allSettled([
        api.getCreditUsageStatistics(),api.getSubscriptionLinks(),api.getCreditPacks(),api.getSubscriptionPlans()
      ]);
      if(stats.status==='fulfilled')setCreditStats(stats.value.statistics);
      if(links.status==='fulfilled')setSubscriptionLinks(links.value.links);
      setSubscriptionPurchaseAvailable(plans.status==='fulfilled'&&plans.value.purchaseAvailable);
      if(packs.status==='fulfilled'){
        setCreditPacks(packs.value.packs);
        setCreditPurchaseAvailable(packs.value.purchaseAvailable);
      }else{
        setCreditPacks([]);setCreditPurchaseAvailable(false);
        setCreditPacksError(errorText(packs.reason));
      }
    } catch (cause) { setCreditError(errorText(cause)); }
    finally { setCreditsBusy(false); }
  };

  const taskRow = (task: Task, compact = false) => (
    <div key={task.id} className={'tp-task-row' + (isDone(task) ? ' is-done' : '') + (isOverdue(task) ? ' is-overdue' : '') + (completingTaskId===task.id?' is-completing':'')}>
      <button type="button" className="tp-task-check" onClick={() => void setComplete(task)}
        title={isDone(task) ? 'Вернуть в работу' : 'Отметить выполненной'}
        aria-label={isDone(task) ? 'Вернуть задачу в работу' : 'Выполнить задачу'}>
        {isDone(task) ? <Check size={16}/> : null}
      </button>
      <button type="button" className="tp-task-main" onClick={() => task.parentTaskId ? setSubtaskFocusId(task.id) : setFocusId(task.id)}>
        <strong>{task.title}</strong>
        <span>{task.parentTaskId ? (taskLookup.get(task.parentTaskId)?.title || 'Подзадача') : (spheres.find(s => s.id === task.sphereId)?.name || 'Без сектора')}
          <span className="tp-dot">·</span>{isOverdue(task) && <Clock3 size={12} aria-hidden="true"/>}{isOverdue(task) ? 'Просрочено: ' : ''}{dateLabel(task.dueDate, timeZone)}</span>
        {!task.parentTaskId&&subtaskProgress.has(task.id)&&(()=>{
          const progress=subtaskProgress.get(task.id)!;
          return <span className="tp-task-subtask-progress">
            <span className="tp-task-subtask-progress-bar" role="progressbar" aria-label={'Подзадачи '+task.title}
              aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <span style={{width:percent(progress.done,progress.total)+'%'}}/>
            </span>
            <span>{progress.done}/{progress.total}</span>
          </span>;
        })()}
      </button>
      {!compact && <button type="button" className="tp-row-edit" aria-label="Настроить задачу" onClick={() => setTestTaskDialog({ task })}><Settings2 size={17}/></button>}
      <ChevronRight className="tp-row-chevron" size={16}/>
    </div>
  );
  const progressCard = (title: string, done: number, total: number, subtitle: string, extraClass = '') => (
    <article className={'tp-card tp-progress-card ' + extraClass}>
      <div className="tp-card-eyebrow"><TrendingUp size={16}/>{title}</div>
      <div className="tp-progress-head"><strong>{done}<span> / {total}</span></strong><b>{percent(done, total)}%</b></div>
      <div className="tp-progress-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(done, total)}>
        <span style={{ width: percent(done, total) + '%' }}/>
      </div>
      <p>{subtitle}</p>
    </article>
  );

  return <div data-theme={theme} className={'tp-root ' + (theme === 'light' ? 'tp-light' : 'tp-dark')}>
    <div className="tp-shell">
      <aside className={'tp-sidebar' + (menuOpen ? ' is-open' : '')}>
        <a className="tp-brand" href="/test-page"><span className="tp-brand-icon"><ListTodo size={25}/></span><span><strong>Планировыч AI</strong><small>Личное пространство</small></span></a>
        <span className="tp-sidebar-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav className="tp-nav" aria-label="Разделы Планировыча">
          {navigation.map(({key,title,icon:Icon}) => <button key={key} type="button"
            className={section === key ? 'selected' : ''} aria-current={section === key ? 'page' : undefined}
            onClick={() => { setSection(key); setMenuOpen(false); }}><Icon size={19}/><span>{title}</span>{section === key && <ChevronRight size={15}/>}</button>)}
        </nav>
        <div className="tp-sidebar-footer"><span className="tp-avatar">{(user?.name || user?.username || 'П').slice(0, 1).toUpperCase()}</span>
          <div><strong>{user?.name || user?.username || 'Гость'}</strong><small>{user ? 'Личные задачи' : 'Войдите в аккаунт'}</small></div></div>
      </aside>
      <main className="tp-main">
        <header className="tp-topbar">
          <div className="tp-heading"><button type="button" className="tp-mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Разделы"><Menu size={21}/></button>
            <div><div className="tp-eyebrow">ПЛАНИРОВЫЧ AI</div><h1>{section === 'overview' ? 'Планировыч AI' : navigation.find(item => item.key === section)?.title}</h1></div></div>
          <div className="tp-actions">
            {user&&<div className="tp-global-search">
              <WorkspaceGlobalSearch key={user.id} userId={user.id} value={globalSearch} onChange={setGlobalSearch}
                tasks={tasks.filter(task=>!task.parentTaskId)} subtasks={subtasks}
                onOpenTask={task=>{if(task.taskType==='EVENT')setEditor({task});else if(task.taskType!=='REMINDER')setFocusId(task.id);}} onOpenSubtask={task=>setSubtaskFocusId(task.id)}
                onOpenNote={id=>{setRequestedNote({id,serial:Date.now()});setSection('notes');}}/>
            </div>}
            <button type="button" className="tp-primary" onClick={() => user ? setTestTaskDialog({}) : setAuthMode('login')}><Plus size={18}/> <span>Новая задача</span></button>
            {user && <button type="button" className="tp-settings-action" onClick={() => setSettingsOpen(true)}><Settings size={17}/><span>Настройки</span></button>}
            {!user && <><button type="button" onClick={() => setAuthMode('login')}><LogIn size={16}/> Вход</button><button type="button" onClick={() => setAuthMode('register')}><UserPlus size={16}/> Регистрация</button></>}
            <a href="/about"><CircleHelp size={16}/> <span>О сервисе</span></a>
            <button type="button" onClick={() => setIntegrationOpen(true)}><SlidersHorizontal size={16}/><span>Интеграции</span></button>
          </div>
        </header>
        {error && <div className="tp-alert" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Скрыть"><X size={16}/></button></div>}
        {loading ? <div className="tp-loading"><Loader2 className="tp-spin" size={25}/> Загружаем задачи…</div> : !user ? (
          <section className="tp-welcome"><span className="tp-kicker"><Sparkles size={16}/> Меньше хаоса, больше результата</span><h2>Держите задачи<br/><em>под контролем.</em></h2>
            <p>Понятный обзор дел, ближайших подзадач и прогресса. Войдите, чтобы увидеть ваши настоящие задачи, сектора и заметки.</p>
            <div className="tp-welcome-actions"><button className="tp-primary" onClick={() => setAuthMode('login')}>Войти</button><button onClick={() => setAuthMode('register')}>Создать аккаунт</button></div>
          </section>
        ) : <>
          {section === 'overview' && <>
            {!heroHidden?<section className="tp-hero">
              <div><span className="tp-kicker"><Sparkles size={16}/> Ваш день в порядке</span>
                <h2>Держите задачи<br/><em>под контролем.</em></h2>
                <p>Задачи, ближайшие шаги и результаты в одном спокойном пространстве.</p>
                <button type="button" onClick={() => setTestTaskDialog({})}><Plus size={16}/> Добавить задачу</button>
              </div>
              <div className="tp-hero-art" aria-hidden="true"><div className="tp-orbit one"/><div className="tp-orbit two"/><div className="tp-hero-main"><CheckCircle2 size={70}/></div><div className="tp-art-satellite small"/><div className="tp-art-satellite big"/></div>
              <button type="button" className="tp-hero-collapse" onClick={toggleHero} aria-expanded="true"
                aria-label="Свернуть приветственный блок" title="Свернуть блок"><ChevronUp size={18}/></button>
            </section>:<button type="button" className="tp-hero-restore" onClick={toggleHero}
              aria-expanded="false"><ChevronDown size={16}/> Развернуть приветственный блок</button>}
            <div className="tp-progress-grid">
              {progressCard('План на сегодня', todayDone, todayTasks.length, todayTasks.length ? 'Задачи и подзадачи, назначенные на сегодня' : 'На сегодня задач и подзадач пока нет', 'tp-featured')}
              {progressCard('Общий прогресс', totalDone, rootTasks.length, 'Выполнено из всех ваших задач')}
              <button type="button" className="tp-card tp-credit-card" onClick={() => void openCredits()}><span className="tp-card-eyebrow"><Coins size={17}/> ИИ-кредиты</span><strong>{formatCredits((user.aiCreditsMilli ?? (user.aiCredits ?? 0) * 1000) / 1000)}</strong><span>Доступный баланс</span><span className="tp-card-link">Подписки и статистика <ChevronRight size={16}/></span></button>
            </div>
            <TestPageRating user={user} onRefresh={()=>void refresh()}/>
            <div className="tp-board">
              <section className="tp-card"><div className="tp-card-head tp-overview-tasks-head"><div><h2>Мои задачи</h2><p>Ближайшие дела и ваши приоритеты</p></div>
                <div className="tp-overview-task-tools">
                  {overviewSearchOpen&&<label className="tp-overview-search-field tp-overview-search-inline">
                    <input type="text" autoFocus value={overviewQuery} onChange={event=>setOverviewQuery(event.target.value)}
                      onKeyDown={event=>{if(event.key==='Escape'){setOverviewSearchOpen(false);setOverviewQuery('');}}}
                      placeholder="Найти…" aria-label="Фильтр моих задач"/>
                    {overviewQuery&&<button type="button" onClick={()=>setOverviewQuery('')} aria-label="Очистить фильтр"><X size={15}/></button>}
                  </label>}
                  <button type="button" className="tp-overview-search-toggle" aria-label="Поиск в моих задачах"
                    title="Поиск в моих задачах" aria-expanded={overviewSearchOpen}
                    onClick={()=>{setOverviewSearchOpen(current=>!current);setOverviewQuery('');}}><Search size={18}/></button>
                  <button type="button" onClick={() => setSection('tasks')}>Все задачи <ChevronRight size={16}/></button>
                </div></div>

                {overviewTasks.slice(0,6).map(task=>taskRow(task))}
                {!overviewTasks.length&&<p className="tp-empty">{overviewQuery.trim()?'По вашему запросу задач не найдено.':'Активных задач нет. Можно заняться чем-то приятным.'}</p>}
                <button type="button" className="tp-add-inline" onClick={() => setTestTaskDialog({})}><Plus size={16}/> Добавить задачу</button>
              </section>
              <section className="tp-card"><div className="tp-card-head"><div><h2>Ближайшие подзадачи</h2><p>Конкретные следующие шаги</p></div><CalendarClock size={20}/></div>
                {upcomingSubtasks.slice(0, 6).map(task => taskRow(task, true))}
                {!upcomingSubtasks.length && <p className="tp-empty">Подзадач с установленным сроком пока нет.</p>}
              </section>
            </div>
            <TestPageHabits key={user.id} timeZone={timeZone}/>
          </>}
          {section === 'tasks' && <section className="tp-work-area">
            <div className="tp-section-heading"><div><h2>Все задачи</h2><p>Ваши дела по секторам, срокам и статусу.</p></div><button className="tp-secondary" onClick={() => setTestTaskDialog({})}><Plus size={17}/> Задача</button></div>
            <div className="tp-filters">
              <label className="tp-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти задачу…" aria-label="Поиск задач"/></label>
              <CustomSelect value={sphereFilter} onChange={setSphereFilter} ariaLabel="Фильтр по сектору"
                className="tp-filter-select" detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu"
                options={[{value:'all',label:'Все сектора'},{value:'none',label:'Без сектора'},...spheres.map(sphere=>({value:sphere.id,label:sphere.name,color:sphere.color}))]}/>
              <CustomSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Фильтр по статусу"
                className="tp-filter-select" detachedPopup popupVariant="settings" menuClassName="tp-dropdown-menu"
                options={[{value:'active',label:'Активные'},{value:'all',label:'Все статусы'},{value:'done',label:'Выполненные'}]}/>
            </div>
            {spheres.filter(sphere => sphereFilter === 'all' || sphereFilter === sphere.id).map(sphere => {
              const bySector = visibleTasks.filter(task => task.sphereId === sphere.id);
              if (!bySector.length) return null;
              return <section className="tp-card tp-sector-list" key={sphere.id}><div className="tp-sector-heading"><span className="tp-sector-marker" style={{ background: sphere.color }}/><h3>{sphere.name}</h3><span>{bySector.length}</span></div>{bySector.map(task => taskRow(task))}</section>;
            })}
            {(sphereFilter === 'all' || sphereFilter === 'none') && visibleTasks.some(task => !task.sphereId) && <section className="tp-card tp-sector-list"><div className="tp-sector-heading"><span className="tp-sector-marker neutral"/><h3>Без сектора</h3></div>{visibleTasks.filter(task => !task.sphereId).map(task => taskRow(task))}</section>}
            {!visibleTasks.length && <p className="tp-empty tp-card">Задач по выбранным фильтрам нет.</p>}
          </section>}
          {section === 'sectors' && <section className="tp-work-area"><div className="tp-section-heading"><div><h2>Сектора</h2><p>Разделите проекты и направления жизни по цветам.</p></div><button className="tp-secondary" onClick={() => setSectorEditor('new')} disabled={spheres.length >= 8}><Plus size={17}/> Добавить сектор</button></div>
            <div className="tp-sector-grid">{spheres.map(sphere => <article className="tp-card tp-sector-card" key={sphere.id}>
              <div className="tp-sector-tile" style={{ background: sphere.color + '22', color: sphere.color }}><FolderKanban size={25}/></div>
              <div><h3>{sphere.name}</h3><p>{rootTasks.filter(task => task.sphereId === sphere.id).length} задач</p></div>
              <div className="tp-sector-actions"><button type="button" onClick={() => setSectorEditor(sphere)}><Settings2 size={16}/> Настроить</button><button type="button" onClick={() => void deleteSphere(sphere)} aria-label={'Удалить сектор ' + sphere.name}><Trash2 size={16}/></button></div>
            </article>)}</div>{!spheres.length && <div className="tp-card tp-empty">Пока нет секторов. Создайте первый для группировки задач.</div>}
          </section>}
          {section === 'notes' && <section className="tp-work-area tp-notes-area"><div className="tp-section-heading"><div><h2>Мои заметки</h2><p>Списки, группы и редактор заметок.</p></div></div>
            <StandaloneNotesWorkspace key={user.id} userId={user.id} mode="inline" requestedNote={requestedNote}
              editorOutsideInline onClose={() => setSection('overview')}/>
          </section>}
          <footer className="tp-footer">Планировыч AI · Задачи, привычки и ИИ в одном пространстве.</footer>
        </>}
      </main>
    </div>
    {user && <button className="tp-mascot" type="button" title="Чат с Плаником" aria-label="Открыть чат с Плаником" onClick={() => setAssistantOpen(previous => !previous)}>
      <PlanikMascot notificationCount={unreadCount} celebrationKey={celebrationKey}
        busy={assistantActivity.busy} progress={assistantActivity.progress}/>
    </button>}
    {noticeToast&&<button type="button" className="tp-system-notice-toast" onClick={()=>openNotice(noticeToast)}
      aria-label="Открыть системное уведомление">
      <span>⚙️ Системное уведомление</span>
      <strong>{noticeToast.eventKey?.startsWith('monitoring:')
        ? noticeToast.content.split(/\r?\n/).slice(0,2).join(' · ')
        : noticeToast.content}</strong>
    </button>}
    {assistantOpen && user && <TestPageChat theme={theme} tasks={tasks} spheres={spheres}
      notifications={systemNotices.filter(item=>!item.eventKey?.startsWith('monitoring:'))}
      onActivityChange={setAssistantActivity} onOpenNotification={openNotice}
      onOpenCheckups={() => { setAssistantOpen(false); setSettingsOpen(true); }}
      initialMessages={assistantMessages} onMessagesChange={setAssistantMessages}
      onClose={() => setAssistantOpen(false)}
      onOpenTask={task => { setAssistantOpen(false); task.parentTaskId ? setSubtaskFocusId(task.id) : setFocusId(task.id); }}
      onDataChanged={() => void refresh()}/>}
    {focusTask && <FocusedTaskWindowFrame><div className={'tp-focus-dialog'+(!focusSubtasks.length?' tp-focus-empty':'')+(completingTaskId===focusTask.id?' is-completing':'')} role="dialog" aria-modal="true" aria-label="Фокус задачи">
      <header><div><span className="tp-eyebrow">ФОКУС ЗАДАЧИ</span><h2>{focusTask.title}</h2>
        <p>{spheres.find(sphere => sphere.id === focusTask.sphereId)?.name || 'Без сектора'} · {dateLabel(focusTask.dueDate, timeZone)}</p></div>
        <div className="tp-focus-header-actions">
          <button type="button" className={'tp-focus-complete'+(isDone(focusTask)?' is-complete':'')}
            disabled={completingTaskId===focusTask.id}
            aria-label={isDone(focusTask)?'Вернуть задачу в работу':'Выполнить задачу'}
            onClick={() => { void saveFocusDescription().then(()=>setComplete(focusTask)).catch(cause=>setError(errorText(cause))); }}>
            <Check size={16}/>{isDone(focusTask)?'Вернуть в работу':'Выполнить'}
          </button>
          <button type="button" onClick={() => { void saveFocusDescription().catch(cause => setError(errorText(cause))); setFocusId(null); }} aria-label="Закрыть"><X size={19}/></button>
        </div>
      </header>
      <div className="tp-focus-description">
        <span className="tp-focus-description-label">Описание задачи</span>
        <ResizableDescriptionSurface storageKey={'btm:'+user?.id+':test-page:focus-description-height'}
          initialHeight={146} minHeight={100} maxHeight={320} className="tp-focus-description-resizable">
          <TaskDescriptionInput value={focusDescription} onChange={editFocusDescription}
            richInlineEditing enterCreatesLineBreak
            placeholder="Нажмите, чтобы добавить описание…" className="tp-focus-description-editor"/>
        </ResizableDescriptionSurface>
        <button type="button" className="tp-description-notes-button" onClick={()=>setFocusNotesOpen(true)}>
          <Settings2 size={15}/> Редактировать описание
        </button>
      </div>
      <div className="tp-focus-subtitle"><strong>Подзадачи</strong>
        <span>{focusSubtasks.filter(isDone).length} из {focusSubtasks.length} выполнено</span>
        <button type="button" className="tp-focus-add-subtask" onClick={() => setTestTaskDialog({parentTask:focusTask})}>
          <Plus size={16}/> Добавить
        </button>
      </div>
      <div className="tp-focus-subtasks">{focusSubtasks.map(item => taskRow(item, true))}{!focusSubtasks.length && <p className="tp-empty">Подзадач пока нет.</p>}</div>
      <div className="tp-focus-actions"><button className="tp-secondary" type="button" onClick={() => { void saveFocusDescription().then(()=>setTestTaskDialog({ task: focusTask })).catch(cause=>setError(errorText(cause))); }}><Settings2 size={16}/> Настроить задачу</button>
        <button className="tp-primary" type="button" onClick={() => { void saveFocusDescription().then(() => { setAssistantOpen(false); setFocusChatId(focusTask.id); }).catch(cause=>setError(errorText(cause))); }}>
          <Sparkles size={16}/> Спросить ИИ</button>
      </div>
    </div></FocusedTaskWindowFrame>}
    {focusNotesOpen&&focusTask&&<NotesEditor key={focusTask.id} heading="Описание задачи"
      value={focusDescription} onChange={editFocusDescription}
      onClose={()=>{setFocusNotesOpen(false);void saveFocusDescription().catch(cause=>setError(errorText(cause)));}}/>}
    {subtaskFocus&&user&&<TestPageSubtaskFocus key={subtaskFocus.id}
      task={subtaskFocus} completing={completingTaskId===subtaskFocus.id}
      parentTask={subtaskFocus.parentTaskId ? taskLookup.get(subtaskFocus.parentTaskId) : undefined}
      userId={user.id} timeZone={timeZone}
      onClose={()=>setSubtaskFocusId(null)}
      onSaveDescription={async description=>{
        const saved=await api.updateTask(subtaskFocus.id,{description});
        setTasks(current=>current.map(task=>task.id===saved.id?{...task,description:saved.description}:task));
      }}
      onToggleComplete={async()=>{await setComplete(subtaskFocus);}}
      onSettings={()=>setTestTaskDialog({task:subtaskFocus})}
      onAskAi={()=>{setAssistantOpen(false);setSubtaskFocusId(null);setFocusChatId(subtaskFocus.id);}}/>}
    {focusChatId && taskLookup.get(focusChatId) && <TestPageChat key={focusChatId}
      onActivityChange={setAssistantActivity}
      theme={theme} onOpenCheckups={() => { setFocusChatId(null); setSettingsOpen(true); }}
      task={taskLookup.get(focusChatId)} tasks={tasks} spheres={spheres} onDataChanged={() => void refresh()}
      onClose={() => setFocusChatId(null)}
      onOpenTask={task => { setFocusChatId(null); task.parentTaskId ? setSubtaskFocusId(task.id) : setFocusId(task.id); }}/>}

    {settingsOpen && user && <TestPageSettings user={user} themeMode={themeMode} onThemeMode={changeThemeMode}
      onUserUpdated={setUser} onClose={() => setSettingsOpen(false)}
      onCheckup={message => { setAssistantMessages(current => [...current,message]); setAssistantOpen(true); }}/>}
    {collaborationComplete && <div className="tp-overlay"><section className="tp-dialog" role="dialog" aria-modal="true" aria-label="Завершить совместную задачу"><header><div><span className="tp-eyebrow">СОВМЕСТНАЯ ЗАДАЧА</span><h2>Завершение задачи</h2></div><button type="button" onClick={() => setCollaborationComplete(null)} aria-label="Закрыть"><X size={19}/></button></header><div className="tp-dialog-content"><p>Для кого завершить задачу «{collaborationComplete.title}»?</p><button type="button" className="tp-secondary" onClick={() => { const task = collaborationComplete; setCollaborationComplete(null); void setComplete(task, 'me'); }}>Только для меня</button><button type="button" className="tp-primary" onClick={() => { const task = collaborationComplete; setCollaborationComplete(null); void setComplete(task, 'all'); }}>Для всех участников</button></div></section></div>}
    {testTaskDialog && <TestPageTaskDialog
      key={testTaskDialog.task?.id || (testTaskDialog.parentTask?.id?'new-subtask-'+testTaskDialog.parentTask.id:'new-task')}
      task={testTaskDialog.task} parentTask={testTaskDialog.parentTask || (testTaskDialog.task?.parentTaskId ? taskLookup.get(testTaskDialog.task.parentTaskId) : undefined)}
      spheres={spheres} timeZone={timeZone}
      onClose={() => setTestTaskDialog(null)} onSave={saveTestTask}
      onDelete={testTaskDialog.task ? deleteTestTask : undefined}/>} 
    {editor && <TaskEditor key={editor.task?.id || 'new'} task={editor.task} editorType={editor.task?.taskType==='EVENT'?'event':'task'} spheres={spheres} initialSphereId={editor.sphereId} subtasks={editor.task ? tasks.filter(task => task.parentTaskId === editor.task?.id) : []}
      defaultAiNotificationsEnabled={true} timeZone={timeZone} onCancel={() => setEditor(null)}
      onSave={saveTask} onAutoSave={editor.task ? async payload => { await api.updateTask(editor.task!.id, payload); } : undefined}
      onGenerateWithAi={generateWithAi}
      onComplete={editor.task ? async () => { await setComplete(editor.task!); setEditor(null); } : undefined}
      onDelete={editor.task ? async () => { if (!window.confirm('Удалить задачу?')) return; await api.deleteTask(editor.task!.id); setEditor(null); await refresh(); } : undefined}
      parentTaskTitle={editor.task?.parentTaskId ? taskLookup.get(editor.task.parentTaskId)?.title : undefined}
      onOpenParentTask={editor.task?.parentTaskId ? () => { const id = editor.task!.parentTaskId!; setEditor(null); setFocusId(id); } : undefined}
    />}
    {sectorEditor && <SectorEditor sphere={sectorEditor === 'new' ? undefined : sectorEditor} onCancel={() => setSectorEditor(null)} onSave={saveSphere}/>}
    {creditsOpen && <div className="tp-overlay tp-credits-overlay" onMouseDown={event=>{
      if(event.target===event.currentTarget)setCreditsOpen(false);
    }}><section className="tp-dialog tp-credits-dialog" role="dialog" aria-modal="true" aria-label="Баланс и подписки">
      <header><div><span className="tp-eyebrow">БАЛАНС И ПОДПИСКИ</span><h2>ИИ-кредиты</h2></div>
        <button type="button" onClick={()=>setCreditsOpen(false)} aria-label="Закрыть"><X size={19}/></button></header>
      <div className="tp-dialog-content tp-credits-body">
        <div className="tp-credit-balance"><Coins size={24}/><div><span>Доступно</span>
          <strong>{formatCredits((user?.aiCreditsMilli??(user?.aiCredits??0)*1000)/1000)} кредитов</strong>
        </div></div>
        <div className="tp-tabs tp-credit-tabs" role="tablist" aria-label="Разделы баланса">
          <button type="button" role="tab" aria-selected={creditTab==='packs'} className={creditTab==='packs'?'active':''}
            onClick={()=>setCreditTab('packs')}>Пакеты кредитов</button>
          <button type="button" role="tab" aria-selected={creditTab==='plans'} className={creditTab==='plans'?'active':''}
            onClick={()=>setCreditTab('plans')}>Подписки</button>
          <button type="button" role="tab" aria-selected={creditTab==='stats'} className={creditTab==='stats'?'active':''}
            onClick={()=>setCreditTab('stats')}>Статистика</button>
        </div>
        {creditsBusy?<p className="tp-empty"><Loader2 className="tp-spin" size={17}/> Загрузка…</p>:
          creditTab==='stats'?<CreditUsageStats statistics={creditStats} error={creditError}/>:
          creditTab==='packs'?<>
            <p className="tp-credit-note">Разовое пополнение баланса без изменения подписки.</p>
            {creditPacksError&&<p className="tp-alert" role="alert">{creditPacksError}</p>}
            <div className="tp-credit-packs">{creditPacks.filter(pack=>pack.isActive).map(pack=>
              <article className="tp-credit-pack" key={pack.key}>
                <span className="tp-credit-pack-label">{pack.name}</span>
                <strong>{pack.creditsAmount.toLocaleString('ru-RU')}<small> ИИ-кредитов</small></strong>
                <div className="tp-credit-pack-price">{pack.price.toLocaleString('ru-RU')} ₽</div>
                <button type="button" disabled={!creditPurchaseAvailable||creditPurchase.creatingPackKey!==null}
                  onClick={()=>void creditPurchase.start(pack.key)}>
                  {creditPurchase.creatingPackKey===pack.key?'Создаём платёж…':creditPurchaseAvailable?'Купить':'Оплата недоступна'}
                </button>
              </article>)}
            </div>
            {!creditPacks.length&&!creditPacksError&&<p className="tp-empty">Сейчас нет доступных пакетов.</p>}
            {creditPurchase.isReceiptEmailRequired&&<div className="tp-credit-receipt">
              <input type="email" autoComplete="email" aria-label="Email для чека"
                placeholder="Email для чека" value={creditPurchase.receiptEmail}
                onChange={event=>creditPurchase.setReceiptEmail(event.target.value)}/>
              <button type="button" className="tp-primary"
                disabled={!creditPurchase.receiptEmail.trim()||creditPurchase.creatingPackKey!==null}
                onClick={()=>void creditPurchase.retryWithReceiptEmail()}>Продолжить</button>
            </div>}
            {creditPurchase.message&&<p className="tp-credit-notice" role="status">{creditPurchase.message}</p>}
            <p className="tp-credit-offer">Покупка означает согласие с <a href="/legal/offer" target="_blank"
              rel="noopener noreferrer">публичной офертой</a>.</p>
          </>:
          creditError?<p className="tp-alert">{creditError}</p>:
          <div className="tp-plans">{([
            ['start','Старт','Для ежедневных задач'],['pro','Про','Для активной работы'],['max','Максимум','Расширенные возможности']
          ] as const).map(([key,name,desc])=><div key={key} className="tp-plan">
            <div><strong>{name}</strong><small>{desc}</small></div>
            <button type="button" disabled={!subscriptionPurchaseAvailable||subscriptionPurchase.creatingPlanKey!==null}
              onClick={()=>void subscriptionPurchase.start(key)}>
              {subscriptionPurchase.creatingPlanKey===key?'Создаём платёж…':subscriptionPurchaseAvailable?'Купить':'Оплата недоступна'}
            </button>
          </div>)}
          <p className="tp-credit-note">Тариф действует один календарный месяц, без автопродления.</p>
          {subscriptionPurchase.isReceiptEmailRequired&&<div className="tp-credit-receipt">
            <input type="email" value={subscriptionPurchase.receiptEmail}
              onChange={event=>subscriptionPurchase.setReceiptEmail(event.target.value)}
              placeholder="Email для чека" aria-label="Email для чека подписки"/>
            <button type="button" className="tp-primary" disabled={!subscriptionPurchase.receiptEmail.trim()||!!subscriptionPurchase.creatingPlanKey}
              onClick={()=>void subscriptionPurchase.retryWithReceiptEmail()}>Продолжить</button>
          </div>}
          {subscriptionPurchase.message&&<p className="tp-credit-notice" role="status">{subscriptionPurchase.message}</p>}
          </div>}
      </div>
    </section></div>}
    {integrationOpen&&<TestPageIntegrationsDialog onClose={()=>setIntegrationOpen(false)}/>}
    {authMode && <div className="tp-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setAuthMode(null); }}><section className="tp-dialog" role="dialog" aria-modal="true" aria-label={authMode === 'login' ? 'Вход' : 'Регистрация'}><header><div><span className="tp-eyebrow">ПЛАНИРОВЫЧ AI</span><h2>{authMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2></div><button onClick={() => setAuthMode(null)} aria-label="Закрыть"><X size={19}/></button></header>
      <form className="tp-dialog-content tp-auth-form" onSubmit={submitAuth}>{error && <p className="tp-alert" role="alert">{error}</p>}{authMode === 'register' && <><label>Имя<input required value={authForm.name} onChange={event => setAuthForm(f => ({...f,name:event.target.value}))}/></label><label>Email<input required type="email" value={authForm.email} onChange={event => setAuthForm(f => ({...f,email:event.target.value}))}/></label></>}
      <label>Логин<input required autoComplete="username" value={authForm.login} onChange={event => setAuthForm(f => ({...f,login:event.target.value}))}/></label>
      <label>Пароль<input required type="password" minLength={authMode === 'register' ? 8 : undefined} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authForm.password} onChange={event => setAuthForm(f => ({...f,password:event.target.value}))}/></label>
      {authMode === 'register' && <label className="tp-consent"><input type="checkbox" checked={authForm.consent} onChange={event => setAuthForm(f => ({...f,consent:event.target.checked}))}/> Согласен с <a href="/legal/terms" target="_blank" rel="noreferrer">условиями сервиса</a> и <a href="/legal/privacy" target="_blank" rel="noreferrer">обработкой данных</a></label>}
      <button type="submit" className="tp-primary" disabled={authBusy}>{authBusy ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
      <button type="button" className="tp-auth-switch" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}</button>
      </form></section></div>}
    {busy && <div className="tp-saving" role="status"><Loader2 className="tp-spin" size={16}/> Сохраняем…</div>}
  </div>;
}
