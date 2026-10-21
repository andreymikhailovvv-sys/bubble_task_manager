import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, FileText, ListChecks, LoaderCircle, Search, StickyNote, X } from 'lucide-react';
import { api, type StandaloneNote } from '../lib/api';
import type { Task } from '../lib/types';
import { searchWorkspace, noteSearchText, type WorkspaceSearchHit, type WorkspaceSearchKind } from '../lib/workspaceSearch';

type Props = {
  userId: string;
  value: string;
  onChange: (value: string) => void;
  tasks: Task[];
  subtasks: Task[];
  onOpenTask: (task: Task) => void;
  onOpenSubtask: (subtask: Task) => void;
  onOpenNote: (id: string) => void;
  mobile?: boolean;
  onOpenChange?: (open: boolean) => void;
};
const sections: Array<{kind:WorkspaceSearchKind; label:string}> = [
  {kind:'task',label:'Задачи'},
  {kind:'subtask',label:'Подзадачи'},
  {kind:'note',label:'Заметки'}
];

export function WorkspaceGlobalSearch({
  userId, value, onChange, tasks, subtasks, onOpenTask, onOpenSubtask, onOpenNote,
  mobile = false, onOpenChange
}: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<StandaloneNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ top: 0, left: 0, width: 450 });
  const hasQuery = Boolean(value.trim());

  useEffect(() => { onOpenChange?.(open && hasQuery); }, [onOpenChange, open, hasQuery]);

  useEffect(() => {
    if (!open || !hasQuery || !userId) return;
    let cancelled = false;
    setLoadingNotes(true);
    setNotesError(false);
    void api.getStandaloneNotes().then(result => {
      if (!cancelled) setNotes(result);
    }).catch(() => {
      if (!cancelled) { setNotes([]); setNotesError(true); }
    }).finally(() => { if (!cancelled) setLoadingNotes(false); });
    return () => { cancelled = true; };
  }, [userId, open, refresh, hasQuery]);

  useEffect(() => {
    setNotes([]);
    setNotesError(false);
    setOpen(false);
  }, [userId]);

  useEffect(() => {
    if (!open || !hasQuery) return;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (mobile) {
        // The Telegram WebView and mobile browser keyboard both shrink the
        // visual viewport, even when innerHeight does not change.
        const viewport = window.visualViewport;
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
        const width = Math.max(160, Math.min(window.innerWidth - 16, 620));
        const top = rect.bottom + 6;
        const room = visibleBottom - top - 8;
        setPosition({
          position: 'fixed', left: Math.max(8, (window.innerWidth - width) / 2),
          top, bottom: undefined, width, maxHeight: Math.max(80, Math.min(480, room))
        });
        return;
      }
      const width = Math.min(Math.max(rect.width, 340), window.innerWidth - 24, 620);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const flip = below < 210 && above > below;
      setPosition({
        position: 'fixed', left, top: flip ? undefined : rect.bottom + 7,
        bottom: flip ? window.innerHeight - rect.top + 7 : undefined,
        width, maxHeight: Math.max(120, Math.min(460, flip ? above - 7 : below - 7))
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    if (mobile) {
      window.visualViewport?.addEventListener('resize', update);
      window.visualViewport?.addEventListener('scroll', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      if (mobile) {
        window.visualViewport?.removeEventListener('resize', update);
        window.visualViewport?.removeEventListener('scroll', update);
      }
    };
  }, [open, hasQuery, mobile]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  // HTML can be large; strip formatting once when notes are fetched, not on
  // every keystroke. Search scoring stays lightweight even with many notes.
  const indexedNotes = useMemo(() => notes.map(note => ({ ...note, content: noteSearchText(note.content) })), [notes]);
  const results = useMemo(() => searchWorkspace(tasks, subtasks, indexedNotes, value), [tasks, subtasks, indexedNotes, value]);
  const entries = useMemo(() => sections.flatMap(({kind}) => results[kind]), [results]);
  useEffect(() => setFocusedIndex(0), [value]);
  const selectResult = (item: WorkspaceSearchHit) => {
    setOpen(false);
    if (item.kind === 'note') {
      onOpenNote(item.id);
    } else if (item.kind === 'subtask') {
      const itemTask = subtasks.find(task => task.id === item.id);
      if (itemTask) onOpenSubtask(itemTask);
    } else {
      const itemTask = tasks.find(task => task.id === item.id);
      if (itemTask) onOpenTask(itemTask);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter') && hasQuery) {
      event.preventDefault(); setOpen(true); return;
    }
    if (!open || entries.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault(); setFocusedIndex(i => (i + 1) % entries.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); setFocusedIndex(i => (i + entries.length - 1) % entries.length);
    } else if (event.key === 'Enter') {
      event.preventDefault(); selectResult(entries[Math.min(focusedIndex, entries.length - 1)]);
    }
  };

  let runningIndex = -1;
  return (
    <div className={'workspace-global-search-anchor relative flex-1 ' + (mobile ? 'min-w-0' : 'min-w-52')} ref={anchorRef}>
      <div className={'workspace-global-search-field surface-input light-search-input flex w-full items-center border ' + (mobile ? 'miniapp-global-search-field rounded-lg' : 'rounded-xl')}>
        <Search size={17} className="ml-3 shrink-0 text-muted" aria-hidden="true"/>
        <input
          type="search"
          aria-label="Поиск по задачам, подзадачам и заметкам"
          aria-expanded={open && hasQuery}
          aria-controls="workspace-global-search-results"
          aria-autocomplete="list"
          role="combobox"
          className={'w-full min-w-0 flex-1 bg-transparent px-2 py-2 text-primary outline-none ' + (mobile ? 'text-base' : 'text-sm')}
          placeholder="Поиск"
          value={value}
          onChange={event => { onChange(event.target.value); setOpen(Boolean(event.target.value.trim())); }}
          onFocus={() => { setOpen(true); setRefresh(i => i + 1); }}
          onKeyDown={handleKeyDown}
        />
        {hasQuery ? <button type="button" className="workspace-global-search-clear mr-2 rounded-lg p-1 text-muted" onClick={() => { onChange(''); setOpen(false); }} title="Очистить поиск" aria-label="Очистить поиск"><X size={15}/></button> : null}
      </div>
      {open && hasQuery ? createPortal(
        <section id="workspace-global-search-results" className={'workspace-global-search-panel z-[220] flex flex-col overflow-hidden rounded-2xl border shadow-2xl ' + (mobile ? 'workspace-global-search-panel-mobile' : '')} style={position}
          ref={panelRef} role="listbox" aria-label="Результаты общего поиска">
          <div className="workspace-global-search-panel-header flex items-center justify-between gap-2 border-b px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.09em] text-muted">Найдено в Планировыче</span>
            <span className="text-xs text-muted">{entries.length} показано</span>
          </div>
          <div className="min-h-0 overflow-y-auto px-2 py-2">
            {sections.map(({kind, label}) => {
              const group = results[kind];
              if (group.length === 0) return null;
              const Icon = kind === 'task' ? ListChecks : kind === 'subtask' ? FileText : StickyNote;
              return (
                <div key={kind} className="workspace-global-search-section mb-2">
                  <p className={'workspace-global-search-section-title workspace-global-search-section-title--' + kind + ' flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]'}>
                    <Icon size={14} aria-hidden="true"/>{label}
                  </p>
                  {group.map(item => {
                    const index = ++runningIndex;
                    return <button key={item.kind + item.id} type="button" role="option"
                      aria-selected={focusedIndex === index}
                      className={'workspace-global-search-hit flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left '+(focusedIndex === index ? 'workspace-global-search-hit-active' : '')}
                      onMouseEnter={() => setFocusedIndex(index)}
                      onClick={() => selectResult(item)}>
                      <span className="truncate text-sm font-semibold text-primary">{item.title}</span>
                      {item.context ? <span className="truncate text-[11px] text-muted">В задаче: {item.context}</span> : null}
                      {item.preview ? <span className="workspace-global-search-preview text-xs text-muted">{item.preview}</span> : null}
                    </button>;
                  })}
                </div>
              );
            })}
            {entries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted">
                {loadingNotes ? <LoaderCircle className="animate-spin" size={19} /> : <Search size={20}/>}
                <span>{loadingNotes ? 'Ищу также в заметках…' : 'Совпадений пока нет'}</span>
              </div>
            ) : null}
            {loadingNotes && entries.length ? <p className="px-3 py-2 text-xs text-muted">Проверяю заметки…</p> : null}
            {notesError ? <p className="workspace-global-search-error rounded-xl px-3 py-2 text-xs" role="status">Заметки не удалось загрузить. Поиск по задачам доступен.</p> : null}
          </div>
          <div className={'workspace-global-search-footer border-t px-3 py-2 text-[11px] text-muted' + (mobile ? ' flex justify-center' : '')}>
            {mobile ? (
              <button type="button" className="workspace-global-search-collapse inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                onClick={() => { setOpen(false); anchorRef.current?.querySelector('input')?.blur(); }}
                aria-label="Свернуть результаты поиска">
                <ChevronUp size={13} aria-hidden="true" />Свернуть
              </button>
            ) : '↑ ↓ выбор · Enter открыть · Esc закрыть'}
          </div>
        </section>, document.body) : null}
    </div>
  );
}
