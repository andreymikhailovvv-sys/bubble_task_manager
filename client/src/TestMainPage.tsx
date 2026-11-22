import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronDown, Grip, GripVertical, LayoutGrid,
  ListTodo, Loader2, MessageCircle, Plus, RotateCcw, Search, Sparkles, StickyNote, X
} from 'lucide-react';
import { api, type CurrentUser } from './lib/api';
import type { ChatMessage, Sphere, Task } from './lib/types';
import { BubbleField } from './components/BubbleField';
import { FullscreenUpcomingTasksPanel } from './components/FullscreenUpcomingTasksPanel';
import { StandaloneNotesWorkspace } from './components/StandaloneNotesWorkspace';
import { TestPageChat } from './TestPageChat';
import { TestPageHabits } from './TestPageHabits';
import { TestPageTaskDialog } from './TestPageTaskDialog';
import { loadThemePreference, resolveThemeMode } from './lib/autoTheme';
import {
  TEST_MAIN_MODULES, testMainAdd, testMainColumns, testMainDefaults, testMainMove,
  testMainReadLayouts, testMainReflow, testMainStorageKey, type TestMainBlock,
  type TestMainLayouts, type TestMainModule
} from './lib/testMainGrid';
import './TestPage.css';
import './TestMainPage.css';

const iconFor = { bubbles: LayoutGrid, tasks: ListTodo, timeline: CalendarDays,
  notes: StickyNote, chat: MessageCircle, habits: CheckCircle2, upcoming: CalendarDays } as const;
const taskOnly = (task: Task) => !task.taskType || task.taskType === 'TASK';
const isDone = (task: Task) => task.status === 'DONE';
const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Без срока';
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось выполнить действие.';

type Drag = { id: string; mode: 'move' | 'resize'; pointerId: number;
  startX: number; startY: number; base: TestMainBlock; snapshot: TestMainBlock[];
  unitX: number; unitY: number; changed: boolean };

export default function TestMainPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [spheres, setSpheres] = useState<Sphere[]>([]);
  const [columns, setColumns] = useState(() => testMainColumns(window.innerWidth - 48));
  const [layouts, setLayouts] = useState<TestMainLayouts>({});
  const [layoutReady, setLayoutReady] = useState(false);
  const [preview, setPreview] = useState<TestMainBlock[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ task?: Task; parentTask?: Task } | null>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [bubbleMode, setBubbleMode] = useState<'global' | 'sectors'>('global');
  const [subtaskFilter, setSubtaskFilter] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [nextTasks, nextSpheres] = await Promise.all([api.getTasks(), api.getSpheres()]);
    setTasks(nextTasks);
    setSpheres(nextSpheres);
  }, []);
  useEffect(() => {
    let active = true;
    void api.getMe().then(async ({ user: activeUser }) => {
      if (!active) return;
      setUser(activeUser);
      try { await refresh(); } catch (cause) { if (active) setError(errorText(cause)); }
    }).catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!user) { setLayoutReady(false); return; }
    let saved: TestMainLayouts = {};
    try { saved = testMainReadLayouts(localStorage.getItem(testMainStorageKey(user.id))); } catch { /* Storage may be disabled. */ }
    setLayouts(saved);
    setLayoutReady(true);
  }, [user?.id]);
  useEffect(() => {
    if (!layoutReady || !user) return;
    try { localStorage.setItem(testMainStorageKey(user.id), JSON.stringify(layouts)); } catch { /* Private browsing. */ }
  }, [layouts, layoutReady, user?.id]);
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const update = () => setColumns(testMainColumns(element.clientWidth || window.innerWidth - 48));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, user?.id]);
  useEffect(() => {
    const previous = document.body.getAttribute('data-theme');
    if (!user) return;
    const preference = loadThemePreference(localStorage, 'btm:' + user.id + ':theme-mode');
    const apply = () => {
      const next = resolveThemeMode(preference, user.timeZone || 'Europe/Moscow', new Date());
      setTheme(next);
      document.body.setAttribute('data-theme', next);
    };
    apply();
    const timer = window.setInterval(apply, 60_000);
    return () => {
      window.clearInterval(timer);
      if (previous === null) document.body.removeAttribute('data-theme');
      else document.body.setAttribute('data-theme', previous);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!adding) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setAdding(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAdding(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [adding]);

  const blocks = useMemo(() => layouts[String(columns)]
    ?? (layouts['12'] ? testMainReflow(layouts['12'], columns) : testMainDefaults(columns)),
    [layouts, columns]);
  const visibleBlocks = preview ?? blocks;
  const commit = (next: TestMainBlock[]) => setLayouts(current => ({ ...current, [columns]: next }));
  const addBlock = (kind: TestMainModule) => {
    commit(testMainAdd(blocks, kind, crypto.randomUUID(), columns));
    setAdding(false);
  };
  const deleteBlock = (id: string) => commit(blocks.filter(block => block.id !== id));
  const reset = () => {
    if (!window.confirm('Сбросить расположение модулей на этой тестовой странице? Данные задач и заметок не изменятся.')) return;
    setLayouts({});
    setPreview(null);
  };
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, block: TestMainBlock, mode: Drag['mode']) => {
    if (event.button !== 0 || !gridRef.current) return;
    event.preventDefault();
    const style = getComputedStyle(gridRef.current);
    const gap = Number.parseFloat(style.columnGap) || 14;
    const rowHeight = Number.parseFloat(style.gridAutoRows) || 88;
    dragRef.current = {
      id: block.id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      base: block, snapshot: blocks, unitX: (gridRef.current.clientWidth - (columns - 1) * gap) / columns + gap,
      unitY: rowHeight + (Number.parseFloat(style.rowGap) || gap), changed: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = Math.round((event.clientX - drag.startX) / drag.unitX);
    const dy = Math.round((event.clientY - drag.startY) / drag.unitY);
    if (!dx && !dy) { setPreview(null); return; }
    drag.changed = true;
    const patch = drag.mode === 'move'
      ? { x: drag.base.x + dx, y: Math.max(0, drag.base.y + dy) }
      : { w: drag.base.w + dx, h: drag.base.h + dy };
    setPreview(testMainMove(drag.snapshot, drag.id, patch, columns));
  };
  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!cancelled && preview && drag.changed) commit(preview);
    setPreview(null);
  };
  const keyboardGrid = (event: ReactKeyboardEvent<HTMLButtonElement>, block: TestMainBlock) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    const patch = event.shiftKey
      ? (horizontal ? { w: block.w + delta } : { h: block.h + delta })
      : (horizontal ? { x: block.x + delta } : { y: Math.max(0, block.y + delta) });
    commit(testMainMove(blocks, block.id, patch, columns));
  };

  const rootTasks = useMemo(() => tasks.filter(task => !task.parentTaskId && taskOnly(task)), [tasks]);
  const subtaskMap = useMemo(() => {
    const result: Record<string, Task[]> = {};
    tasks.filter(task => !!task.parentTaskId).forEach(task => { (result[task.parentTaskId!] ??= []).push(task); });
    return result;
  }, [tasks]);
  const filtered = useMemo(() => rootTasks.filter(task => !query.trim() ||
    (task.title + ' ' + (task.description || '')).toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))),
    [rootTasks, query]);
  const sorted = useMemo(() => [...filtered].sort((a, b) =>
    Number(isDone(a)) - Number(isDone(b)) || (Date.parse(a.dueDate || '') || Infinity) - (Date.parse(b.dueDate || '') || Infinity)), [filtered]);
  const upcomingTasks = useMemo(() => tasks.filter(task => taskOnly(task)), [tasks]);
  const timeZone = user?.timeZone || 'Europe/Moscow';

  const updateTask = async (task: Task, patch: Partial<Task>) => {
    setError('');
    try {
      await api.updateTask(task.id, patch);
      await refresh();
    } catch (cause) { setError(errorText(cause)); throw cause; }
  };
  const toggleDone = (task: Task) => updateTask(task, {
    status: isDone(task) ? 'TODO' : 'DONE',
    ...(task.isCollaborative ? { collaborationScope: 'me' } : {})
  });
  const saveEditedTask = async (payload: Partial<Task> & { collaborationScope?: 'me' | 'all' }) => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.task) await api.updateTask(editing.task.id, payload);
      else await api.createTask({ ...payload, parentTaskId: editing.parentTask?.id ?? null,
        sphereId: payload.sphereId ?? editing.parentTask?.sphereId ?? null });
      setEditing(null);
      await refresh();
    } catch (cause) { setError(errorText(cause)); throw cause; }
    finally { setSaving(false); }
  };
  const deleteEditedTask = async () => {
    if (!editing?.task || !window.confirm('Удалить задачу «' + editing.task.title + '»?')) return;
    setSaving(true);
    try { await api.deleteTask(editing.task.id); setEditing(null); await refresh(); }
    catch (cause) { setError(errorText(cause)); throw cause; }
    finally { setSaving(false); }
  };
  const quickPostpone = async (task: Task, option: '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart') => {
    if (option === 'smart') { setError('Умный перенос пока доступен только в основном интерфейсе Планировыча.'); return null; }
    const current = task.dueDate && Date.parse(task.dueDate) > Date.now() ? new Date(task.dueDate) : new Date();
    if (option === 'tomorrow') current.setDate(current.getDate() + 1);
    else current.setMinutes(current.getMinutes() + ({ '15m': 15, '30m': 30, '1h': 60, '3h': 180 } as const)[option]);
    await updateTask(task, { dueDate: current.toISOString() });
    return dateLabel(current.toISOString());
  };
  const renderContent = (block: TestMainBlock) => {
    switch (block.kind) {
      case 'bubbles': return <div className="tm-bubble-host">
        <BubbleField tasks={rootTasks.filter(task => !isDone(task))} subtaskMap={subtaskMap}
          spheres={spheres} mode={bubbleMode} rankingMode="coefficient" compact fullscreen themeMode={theme}
          onSelect={task => setEditing({ task })} onSelectSubtask={task => setEditing({ task })}
          onToggleSubtaskDone={toggleDone}
          onUpdateSubtaskDueDate={(task, dueDate) => updateTask(task, { dueDate })}
          onQuickCompleteTask={async task => { await toggleDone(task); }}
          onQuickChangeTaskImportance={async (task, delta) => { await updateTask(task, { importance: Math.max(1, Math.min(5, task.importance + delta)) }); }}
          onQuickPostponeTask={quickPostpone}
          onCreateSubtask={async (parent, payload) => {
            await api.createTask({ ...payload, parentTaskId: parent.id, sphereId: parent.sphereId });
            await refresh();
          }}
          onBubbleAction={async (task, payload) => { await api.bubbleAction(task.id, payload); await refresh(); }}
          isSubtaskFilterActive={subtaskFilter} onToggleSubtaskFilter={() => setSubtaskFilter(current => !current)}
          onRenameSphere={() => { window.location.href = '/'; }}
          onAddTaskToSphere={sphere => setEditing({ parentTask: undefined, task: undefined })}
          onRescheduleTask={task => setEditing({ task })} />
      </div>;
      case 'tasks': return <div className="tm-task-content">
        <div className="tm-inner-toolbar">
          <span>{sorted.filter(task => !isDone(task)).length} активных</span>
          <button type="button" onClick={() => setEditing({})}><Plus size={15}/> Задача</button>
        </div>
        {sorted.map(task => <div className="tm-task-row" key={task.id}>
          <button type="button" className={'tm-check ' + (isDone(task) ? 'done' : '')}
            onClick={() => void toggleDone(task).catch(() => undefined)} aria-label={isDone(task) ? 'Возобновить' : 'Выполнить'}>
            {isDone(task) && <Check size={15}/>}</button>
          <button type="button" className="tm-task-label" onClick={() => setEditing({ task })}>
            <strong className={isDone(task) ? 'is-done' : ''}>{task.title}</strong>
            <span>{spheres.find(sphere => sphere.id === task.sphereId)?.name ?? 'Без сектора'} · {dateLabel(task.dueDate)}</span>
          </button>
          <span className="tm-task-score">{task.importance}</span>
        </div>)}
        {!sorted.length && <p className="tm-empty">Задач здесь пока нет.</p>}
      </div>;
      case 'timeline': return <div className="tm-timeline">
        {Array.from({ length: 7 }, (_, index) => {
          const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index);
          const next = new Date(day); next.setDate(day.getDate() + 1);
          const items = tasks.filter(task => task.dueDate && taskOnly(task) && !isDone(task)
            && new Date(task.dueDate).getTime() >= day.getTime() && new Date(task.dueDate).getTime() < next.getTime());
          return <section className="tm-timeline-day" key={index}>
            <div className="tm-timeline-date"><b>{index === 0 ? 'Сегодня' : day.toLocaleDateString('ru-RU', { weekday: 'short' })}</b>
              <span>{day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></div>
            <div className="tm-timeline-events">{items.map(task => <button type="button" key={task.id}
              onClick={() => setEditing({ task })} style={{ borderLeftColor: spheres.find(sphere => sphere.id === task.sphereId)?.color || '#5fc5ef' }}>
              <small>{new Date(task.dueDate!).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
              <strong>{task.title}</strong></button>)}
              {!items.length && <span className="tm-timeline-free">Свободно</span>}
            </div>
          </section>;
        })}
      </div>;
      case 'notes': return <div className="tm-notes-host tp-notes-area">
        <StandaloneNotesWorkspace key={user!.id} userId={user!.id} mode="inline" editorOutsideInline />
      </div>;
      case 'chat': return <div className="tm-chat-host">
        <TestPageChat theme={theme} tasks={tasks} spheres={spheres} onClose={() => deleteBlock(block.id)}
          onOpenTask={task => setEditing({ task })} onDataChanged={() => void refresh()}
          initialMessages={chatMessages} onMessagesChange={setChatMessages}/>
      </div>;
      case 'habits': return <div className="tm-habits-host"><TestPageHabits timeZone={timeZone}/></div>;
      case 'upcoming': return <div className="tm-upcoming-host">
        <FullscreenUpcomingTasksPanel tasks={upcomingTasks} onOpenTask={task => setEditing({ task })}
          onComplete={task => toggleDone(task).catch(() => undefined)} />
      </div>;
    }
  };
  const renderGrid = () => visibleBlocks.map(block => {
    const spec = TEST_MAIN_MODULES.find(item => item.kind === block.kind)!;
    const Icon = iconFor[block.kind];
    const isMoving = dragRef.current?.id === block.id;
    const style: CSSProperties = { gridColumn: (block.x + 1) + ' / span ' + block.w,
      gridRow: (block.y + 1) + ' / span ' + block.h };
    return <section key={block.id} className={'tm-block' + (isMoving ? ' is-moving' : '')}
      style={style} aria-label={'Модуль: ' + spec.label}>
      <header className="tm-block-head">
        <div className="tm-block-title"><span className="tm-block-icon"><Icon size={16}/></span>
          <strong>{spec.label}</strong>
          {block.kind === 'bubbles' && <button type="button" className="tm-mode-button"
            onClick={() => setBubbleMode(current => current === 'global' ? 'sectors' : 'global')}>
            {bubbleMode === 'global' ? 'Общий круг' : 'Сектора'} <ChevronDown size={12}/></button>}
        </div>
        <div className="tm-block-actions">
          <button className="tm-drag-handle" type="button" title="Переместить. Стрелки для сдвига, Shift+стрелки для размера"
            aria-label={'Переместить модуль ' + spec.label} onPointerDown={event => beginDrag(event, block, 'move')}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={event => endDrag(event, true)}
            onKeyDown={event => keyboardGrid(event, block)}><Grip size={17}/></button>
          <button type="button" title="Убрать модуль" aria-label={'Убрать модуль ' + spec.label}
            onClick={() => deleteBlock(block.id)}><X size={16}/></button>
        </div>
      </header>
      <div className="tm-block-body">{renderContent(block)}</div>
      <button type="button" className="tm-resize-handle"
        title="Изменить размер. Shift+стрелки на ручке перемещения"
        aria-label={'Изменить размер модуля ' + spec.label}
        onPointerDown={event => beginDrag(event, block, 'resize')}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={event => endDrag(event, true)}>
        <GripVertical size={17}/></button>
    </section>;
  });

  return <div className={'tp-root tm-root ' + (theme === 'light' ? 'tp-light' : 'tp-dark')} data-theme={theme}>
    <div className="tm-shell">
      <header className="tm-topbar">
        <div className="tm-brand"><span className="tm-brand-mark"><Sparkles size={21}/></span>
          <div><strong>Планировыч AI</strong><span>TEST MAIN PAGE · Модульное пространство</span></div></div>
        <div className="tm-header-actions">
          <a href="/" className="tm-link"><ArrowLeft size={16}/> Основной интерфейс</a>
          <a href="/test-page" className="tm-link">Test Page</a>
        </div>
      </header>
      <div className="tm-heading">
        <div><span className="tm-eyebrow">ЭКСПЕРИМЕНТАЛЬНЫЙ ИНТЕРФЕЙС</span>
          <h1>Соберите своё пространство</h1>
          <p>Добавляйте модули, двигайте за <Grip size={13} aria-hidden="true"/> и меняйте размер за угол. Раскладка сохраняется автоматически.</p>
        </div>
        <div className="tm-controls">
          <label className="tm-search"><Search size={16}/><input value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Поиск задач…" aria-label="Поиск задач"/></label>
          <button type="button" className="tm-reset" onClick={reset} title="Сбросить расположение"><RotateCcw size={16}/> <span>Сбросить</span></button>
          <div className="tm-add-anchor" ref={menuRef}>
            <button type="button" className="tm-add-button" aria-expanded={adding} aria-haspopup="menu"
              onClick={() => setAdding(current => !current)}><Plus size={18}/> Добавить модуль</button>
            {adding && <div className="tm-add-menu" role="menu">
              <p>Модули рабочего пространства</p>
              {TEST_MAIN_MODULES.map(item => {
                const Icon = iconFor[item.kind];
                return <button key={item.kind} role="menuitem" type="button" onClick={() => addBlock(item.kind)}>
                  <span><Icon size={18}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Plus size={15}/></button>;
              })}
            </div>}
          </div>
        </div>
      </div>
      {error && <div className="tm-error" role="alert">{error}
        <button type="button" onClick={() => setError('')} aria-label="Закрыть ошибку"><X size={16}/></button></div>}
      {loading ? <div className="tm-loading"><Loader2 size={23} className="tp-spin"/> Загружаем пространство…</div>
        : !user ? <div className="tm-auth"><Sparkles size={28}/><h2>Войдите в Планировыч</h2>
          <p>Тестовая страница использует те же задачи, привычки и заметки, что и ваш аккаунт.</p>
          <a href="/test-page">Перейти ко входу</a></div>
        : <div className="tm-grid" ref={gridRef} style={{ gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))' }}>
          {layoutReady && renderGrid()}
          {layoutReady && !visibleBlocks.length && <div className="tm-grid-empty"><LayoutGrid size={34}/>
            <h2>Рабочее пространство пусто</h2><p>Добавьте первый модуль через кнопку сверху.</p></div>}
        </div>}
      <footer className="tm-footer">Тестовый режим. Основной интерфейс и его расположение окон не изменены.</footer>
    </div>
    {editing && user && <TestPageTaskDialog key={editing.task?.id || editing.parentTask?.id || 'new'}
      task={editing.task} parentTask={editing.parentTask} spheres={spheres} timeZone={timeZone}
      onClose={() => { if (!saving) setEditing(null); }} onSave={saveEditedTask}
      onDelete={editing.task ? deleteEditedTask : undefined}/>}
  </div>;
}
