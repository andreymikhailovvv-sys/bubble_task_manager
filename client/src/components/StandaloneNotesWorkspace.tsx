import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Maximize2, Plus, Search, Settings2, StickyNote, Tags, Trash2, X } from 'lucide-react';
import { api, type StandaloneNote, type StandaloneNoteGroup } from '../lib/api';
import { noteHtmlToPlainText, noteValueToEditorHtml } from '../lib/notes';
import { NotesEditor } from './NotesEditor';
import { StandaloneNoteGroupManager, noteGroupStyle } from './StandaloneNoteGroupManager';

type Props = { userId: string; requestedNote?: { id: string; serial: number } | null };
const sortNotes = (items: StandaloneNote[]) =>
  [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
const titleOf = (note: StandaloneNote) => note.title.trim() || 'Без названия';
const summaryOf = (note: StandaloneNote) => noteHtmlToPlainText(note.content).replace(/\s+/g, ' ').trim();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить заметку.';

export function StandaloneNotesWorkspace({ userId, requestedNote }: Props) {
  const [notes, setNotes] = useState<StandaloneNote[]>([]);
  const [groups, setGroups] = useState<StandaloneNoteGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupManager, setGroupManager] = useState<'new' | 'manage' | null>(null);
  const [groupCreateForNoteId, setGroupCreateForNoteId] = useState<string | null>(null);
  const [groupPicker, setGroupPicker] = useState<{ noteId: string; top: number; left: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [editing, setEditing] = useState<StandaloneNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only one editor is open at a time. Serialize its writes so slower network
  // responses cannot overwrite a newer version of the same note.
  const draftRef = useRef<StandaloneNote | null>(null);
  const dirtyRef = useRef(false);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [result, allGroups] = await Promise.all([api.getStandaloneNotes(), api.getStandaloneNoteGroups()]);
      setNotes(sortNotes(result));
      setGroups(allGroups);
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Clear cached notes immediately when an account changes, even if the
    // next account's API request is still in flight.
    setNotes([]);
    setGroups([]);
    setSelectedGroup('all');
    setSearchQuery('');
    setGroupManager(null);
    setGroupCreateForNoteId(null);
    setGroupPicker(null);
    setBoardOpen(false);
    setEditing(null);
    draftRef.current = null;
    dirtyRef.current = false;
    pendingRef.current = Promise.resolve();
    if (!userId) return;
    void reload();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [userId, reload]);

  // Refresh when the board is opened: notes may have been created by AI or
  // Telegram since the widget first loaded.
  useEffect(() => {
    if (boardOpen && !editing) void reload();
  }, [boardOpen, reload]);

  const saveChanges = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const draft = draftRef.current;
    if (!draft || !dirtyRef.current) {
      await pendingRef.current;
      return;
    }
    dirtyRef.current = false;
    pendingRef.current = pendingRef.current.catch(() => {}).then(async () => {
      const saved = await api.updateStandaloneNote(draft.id, { title: draft.title, content: draft.content });
      setNotes((current) => sortNotes(current.map((note) => {
        if (note.id !== saved.id) return note;
        return dirtyRef.current && draftRef.current?.id === saved.id
          ? { ...saved, title: draftRef.current.title, content: draftRef.current.content }
          : saved;
      })));
    });
    try {
      await pendingRef.current;
      setError(null);
    } catch (cause) {
      dirtyRef.current = true;
      setError('Изменения не сохранены: ' + getErrorMessage(cause));
      throw cause;
    }
  }, []);

  const changeDraft = (changes: { title?: string; content?: string }) => {
    const draft = draftRef.current;
    if (!draft) return;
    const next = { ...draft, ...changes };
    draftRef.current = next;
    dirtyRef.current = true;
    setEditing(next);
    setNotes((current) => current.map((note) => note.id === next.id ? next : note));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void saveChanges().catch(() => {}); }, 800);
  };

  const openEditor = (note: StandaloneNote) => {
    draftRef.current = { ...note };
    dirtyRef.current = false;
    setEditing({ ...note });
    setError(null);
  };

  // A top-search hit opens the exact note, even if the sidebar has not loaded
  // it yet. Fetch a fresh copy, as notes can also be edited from Telegram/AI.
  useEffect(() => {
    if (!requestedNote?.id || !userId) return;
    let cancelled = false;
    void api.getStandaloneNotes().then(result => {
      if (cancelled) return;
      const note = result.find(item => item.id === requestedNote.id);
      if (!note) {
        setBoardOpen(true);
        setError('Заметка не найдена или недоступна.');
        return;
      }
      setNotes(sortNotes(result));
      setBoardOpen(true);
      draftRef.current = { ...note };
      dirtyRef.current = false;
      setEditing({ ...note });
      setError(null);
    }).catch(() => {
      if (!cancelled) setError('Не удалось открыть найденную заметку. Повторите поиск.');
    });
    return () => { cancelled = true; };
  }, [requestedNote?.id, requestedNote?.serial, userId]);

  const closeEditor = async () => {
    try {
      await saveChanges();
      draftRef.current = null;
      dirtyRef.current = false;
      setEditing(null);
    } catch {
      // Keep the unsaved editor open so the user can retry.
    }
  };

  const createNote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const note = await api.createStandaloneNote({ groupId: selectedGroup !== 'all' && selectedGroup !== 'ungrouped' ? selectedGroup : null });
      setNotes((current) => sortNotes([note, ...current]));
      setBoardOpen(true);
      openEditor(note);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  };

  const deleteNote = async (note: StandaloneNote) => {
    if (!window.confirm('Удалить заметку «' + titleOf(note) + '»?')) return;
    try {
      await api.deleteStandaloneNote(note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  };

  // HTML-to-text conversion may be costly for long formatted notes.
  // Build the index once per notes change, not on every search keystroke.
  const noteSearchIndex = useMemo(() => new Map(notes.map(note => [
    note.id, (note.title + ' ' + noteHtmlToPlainText(note.content))
      .normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  ])), [notes]);

  const filteredNotes = useMemo(() => {
    const groupNotes = selectedGroup === 'all' ? notes
      : selectedGroup === 'ungrouped' ? notes.filter(note => !note.groupId)
      : notes.filter(note => note.groupId === selectedGroup);
    const query = searchQuery.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
    if (!query) return groupNotes;
    const terms = query.split(/\s+/);
    return groupNotes.filter(note => {
      const searchable = noteSearchIndex.get(note.id) ?? '';
      return terms.every(term => searchable.includes(term));
    });
  }, [notes, selectedGroup, searchQuery, noteSearchIndex]);
  const groupFor = (note: StandaloneNote) => groups.find(group => group.id === note.groupId);

  const createGroup = async (data: { name: string; color: string }): Promise<StandaloneNoteGroup> => {
    const created = await api.createStandaloneNoteGroup(data);
    setGroups(current => [...current, created]);
    return created;
  };
  const updateGroup = async (id: string, data: { name: string; color: string }) => {
    const updated = await api.updateStandaloneNoteGroup(id, data);
    setGroups(current => current.map(group => group.id === id ? updated : group));
  };
  const deleteGroup = async (group: StandaloneNoteGroup) => {
    await api.deleteStandaloneNoteGroup(group.id);
    setGroups(current => current.filter(item => item.id !== group.id));
    setNotes(current => current.map(note => note.groupId === group.id ? { ...note, groupId: null } : note));
    if (selectedGroup === group.id) setSelectedGroup('all');
    setGroupPicker(null);
  };
  const assignGroup = async (noteId: string, groupId: string | null) => {
    setGroupPicker(null);
    const original = draftRef.current?.id === noteId ? draftRef.current : notes.find(note => note.id === noteId);
    if (!original || original.groupId === groupId) return;
    try {
      // The rich-text editor saves title/content on a debounce. Flush that
      // write first so an older response cannot reset the newly chosen group.
      if (draftRef.current?.id === noteId) await saveChanges();
      setNotes(current => current.map(note => note.id === noteId ? { ...note, groupId } : note));
      if (draftRef.current?.id === noteId) {
        draftRef.current = { ...draftRef.current, groupId };
        setEditing(current => current?.id === noteId ? { ...current, groupId } : current);
      }
      const saved = await api.updateStandaloneNote(noteId, { groupId });
      if (saved.groupId !== groupId) throw new Error('Сервер не подтвердил изменение группы. Обновите страницу и повторите попытку.');
      setNotes(current => sortNotes(current.map(note => note.id === saved.id
        ? { ...note, groupId: saved.groupId, updatedAt: saved.updatedAt } : note)));
      setError(null);
    } catch (cause) {
      setNotes(current => current.map(note => note.id === noteId ? { ...note, groupId: original.groupId } : note));
      if (draftRef.current?.id === noteId) {
        draftRef.current = { ...draftRef.current, groupId: original.groupId };
        setEditing(current => current?.id === noteId ? { ...current, groupId: original.groupId } : current);
      }
      setError('Не удалось присвоить группу: ' + getErrorMessage(cause));
    }
  };
  const startNewGroupForNote = (noteId: string) => {
    setGroupPicker(null);
    setGroupCreateForNoteId(noteId);
    setGroupManager('new');
  };
  const openGroupManager = (mode: 'new' | 'manage') => {
    setGroupCreateForNoteId(null);
    setGroupPicker(null);
    setGroupManager(mode);
  };
  const showGroupPicker = (noteId: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const width = Math.min(250, window.innerWidth - 24);
    setGroupPicker({
      noteId, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: rect.bottom + 225 > window.innerHeight ? Math.max(12, rect.top - 225) : rect.bottom + 7
    });
  };

  const pickerNoteGroupId = groupPicker ? notes.find(note => note.id === groupPicker.noteId)?.groupId ?? null : null;

  return (
    <>
      <section className="workspace-widget-card standalone-notes-widget rounded-[1.35rem] border p-4" aria-label="Личные заметки">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold tracking-[-0.01em]">
            <StickyNote size={17} className="standalone-note-accent shrink-0" />
            Заметки
          </h3>
          <div className="flex items-center gap-1.5">
            <button type="button" className="standalone-notes-icon-button rounded-lg p-1.5" onClick={() => void createNote()} disabled={creating} aria-label="Создать заметку" title="Новая заметка"><Plus size={16} /></button>
            <button type="button" className="standalone-notes-icon-button rounded-lg p-1.5" onClick={() => setBoardOpen(true)} aria-label="Открыть все заметки" title="Развернуть заметки"><Maximize2 size={15} /></button>
          </div>
        </div>
        {error ? <p role="alert" className="standalone-notes-error mb-2 rounded-lg px-2 py-1.5 text-xs">{error}</p> : null}
        {loading && notes.length === 0 ? <p className="text-xs text-muted">Загружаю заметки…</p> : null}
        {!loading && notes.length === 0 ? (
          <button type="button" onClick={() => void createNote()} className="standalone-notes-empty w-full rounded-xl border p-3 text-left text-xs text-muted">
            Здесь появятся три последние заметки. Нажмите, чтобы создать первую.
          </button>
        ) : null}
        <div className="space-y-2">
          {notes.slice(0, 3).map((note) => (
            <button key={note.id} type="button" onClick={() => { setBoardOpen(true); openEditor(note); }} className="standalone-note-recent block w-full rounded-xl border px-3 py-2.5 text-left">
              <span className="block truncate text-sm font-semibold text-primary">{titleOf(note)}</span>
              <span className="mt-1 block truncate text-xs text-muted">{summaryOf(note) || 'Пустая заметка'}</span>
            </button>
          ))}
        </div>
        {notes.length > 3 ? (
          <button type="button" className="mt-2 text-xs font-semibold standalone-note-accent hover:underline" onClick={() => setBoardOpen(true)}>
            Показать все ({notes.length})
          </button>
        ) : null}
      </section>
      {boardOpen ? createPortal(
        <div className="standalone-notes-backdrop fixed inset-0 z-[245] flex items-center justify-center p-3 sm:p-6" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !editing) setBoardOpen(false);
        }}>
          <section className="standalone-notes-board flex h-[min(87dvh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border shadow-2xl" role="dialog" aria-modal="true" aria-label="Все заметки">
            <div className="standalone-notes-board-header flex flex-col gap-2 border-b p-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="standalone-note-accent text-xs font-semibold uppercase tracking-widest">Личные записи</p>
                  <h2 className="mt-1 text-xl font-bold text-primary">Мои заметки <span className="text-sm font-normal text-muted">({filteredNotes.length}{selectedGroup !== 'all' ? ' из ' + notes.length : ''})</span></h2>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button type="button" className="standalone-notes-create inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold" disabled={creating} onClick={() => void createNote()}><Plus size={16} /> Новая заметка</button>
                  <button type="button" className="standalone-notes-icon-button rounded-xl border p-2" onClick={() => { setGroupPicker(null); setBoardOpen(false); }} aria-label="Закрыть список заметок"><X size={18} /></button>
                </div>
              </div>
              <div className="standalone-notes-board-filters flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <nav className="standalone-group-filter flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-1" aria-label="Группы заметок">
                <button type="button" className="standalone-group-chip standalone-group-manage" title="Редактировать группы"
                  aria-label="Редактировать группы" onClick={() => openGroupManager('manage')}><Settings2 size={15} /><span className="sr-only">Управление группами</span></button>
                <button type="button" className={'standalone-group-chip ' + (selectedGroup === 'all' ? 'standalone-group-chip-active' : '')}
                  aria-pressed={selectedGroup === 'all'} onClick={() => setSelectedGroup('all')}>Все <span className="opacity-70">{notes.length}</span></button>
                <button type="button" className={'standalone-group-chip ' + (selectedGroup === 'ungrouped' ? 'standalone-group-chip-active' : '')}
                  aria-pressed={selectedGroup === 'ungrouped'} onClick={() => setSelectedGroup('ungrouped')}>Без группы</button>
                {groups.map(group => (
                  <button type="button" key={group.id} style={noteGroupStyle(group.color)}
                    className={'standalone-group-chip standalone-group-chip-colored ' + (selectedGroup === group.id ? 'standalone-group-chip-active' : '')}
                    aria-pressed={selectedGroup === group.id} onClick={() => setSelectedGroup(group.id)}>
                    <span className="standalone-group-color-dot h-2.5 w-2.5 shrink-0 rounded-full" />
                    <span className="max-w-36 truncate">{group.name}</span>
                  </button>
                ))}
                <button type="button" className="standalone-group-chip standalone-group-add" title="Добавить группу"
                  aria-label="Добавить группу" onClick={() => openGroupManager('new')} disabled={groups.length >= 40}><Plus size={17} /> Группа</button>
                </nav>
                <label className="standalone-notes-search relative flex w-full min-w-0 shrink-0 items-center overflow-hidden rounded-xl border sm:w-[255px]">
                  <Search size={16} className="ml-3 shrink-0 text-muted" aria-hidden="true" />
                  <input type="search" aria-label="Поиск по названию и содержимому заметок"
                    placeholder="Поиск по заметкам…" value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm outline-none" />
                </label>
              </div>
            </div>
            {error ? <p role="alert" className="standalone-notes-error mx-4 mt-3 rounded-lg px-3 py-2 text-sm sm:mx-6">{error}</p> : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {filteredNotes.length === 0 ? (
                <div className="standalone-notes-empty rounded-2xl border p-8 text-center text-muted">
                  <StickyNote className="mx-auto mb-3 opacity-70" size={32} />
                  {searchQuery.trim() ? 'По запросу ничего не найдено. Попробуйте другие слова.' : notes.length ? 'В этой группе пока нет заметок.' : 'Пока нет заметок. Создайте первую запись.'}
                </div>
              ) : (
                <div className="standalone-notes-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredNotes.map((note) => (
                    <article key={note.id} className="standalone-note-card group flex min-h-48 flex-col overflow-hidden rounded-2xl border">
                      <button type="button" className="standalone-note-open min-w-0 flex-1 px-4 pb-2 pt-4 text-left" onClick={() => openEditor(note)} aria-label={'Открыть заметку «' + titleOf(note) + '»'}>
                        <h3 className="break-words text-base font-bold text-primary">{titleOf(note)}</h3>
                        {groupFor(note) ? (
                          <span className="standalone-group-note-label mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={noteGroupStyle(groupFor(note)!.color)}>
                            <span className="standalone-group-color-dot h-2 w-2 rounded-full shrink-0"/><span className="truncate">{groupFor(note)!.name}</span>
                          </span>
                        ) : null}
                        <div className="standalone-note-preview mt-2 max-h-48 overflow-hidden text-sm leading-relaxed text-muted"
                          dangerouslySetInnerHTML={{ __html: noteValueToEditorHtml(note.content) }} />
                        {!note.content.trim() ? <p className="mt-2 text-sm text-subtle">Пустая заметка</p> : null}
                      </button>
                      <div className="standalone-note-card-footer flex items-center justify-between gap-2 border-t px-4 py-2">
                        <time className="truncate text-[11px] text-muted" dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                        <div className="flex items-center gap-1">
                          <button type="button" className="standalone-notes-icon-button rounded-lg p-1.5" onClick={(event) => showGroupPicker(note.id, event.currentTarget)}
                            aria-label={'Выбрать группу заметки «' + titleOf(note) + '»'} title="Выбрать группу"><Tags size={16} /></button>
                          <button type="button" className="standalone-notes-delete rounded-lg p-1.5" onClick={() => void deleteNote(note)} aria-label={'Удалить заметку «' + titleOf(note) + '»'}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>, document.body) : null}
      {groupPicker ? createPortal(
        <div className={'fixed inset-0 ' + (editing ? 'z-[2147483647]' : 'z-[270]')} onMouseDown={() => setGroupPicker(null)}>
          <div role="dialog" aria-label="Выбрать группу заметки" className="standalone-group-picker fixed w-[min(250px,calc(100vw-24px))] max-h-[min(280px,65vh)] overflow-y-auto rounded-xl border p-2 shadow-2xl"
            style={{ top: groupPicker.top, left: groupPicker.left }} onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === 'Escape') setGroupPicker(null); }}>
            <p className="mb-2 px-2 text-xs font-semibold text-muted">Переместить в группу</p>
            <button type="button" className="standalone-group-picker-option flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm" onClick={() => void assignGroup(groupPicker.noteId, null)}>Без группы {pickerNoteGroupId === null ? <Check size={15} className="shrink-0"/> : null}</button>
            {groups.map(group => (
              <button type="button" key={group.id} className="standalone-group-picker-option flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm"
                onClick={() => void assignGroup(groupPicker.noteId, group.id)} style={noteGroupStyle(group.color)}>
                <span className="standalone-group-color-dot h-3 w-3 shrink-0 rounded-full"/><span className="min-w-0 flex-1 truncate">{group.name}</span>
                {pickerNoteGroupId === group.id ? <Check size={15} className="shrink-0"/> : null}
              </button>
            ))}
            <div className="my-1 border-t" style={{ borderColor: 'var(--panel-border)' }} />
            <button type="button" className="standalone-group-picker-option flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold"
              disabled={groups.length >= 40} onClick={() => startNewGroupForNote(groupPicker.noteId)}>
              <Plus size={15} /> Создать новую группу
            </button>
            {groups.length >= 40 ? <p className="p-2 text-xs text-muted">Достигнут лимит 40 групп.</p> : null}
          </div>
        </div>, document.body) : null}
      {groupManager ? (
        <StandaloneNoteGroupManager key={groupManager + (groupCreateForNoteId ?? '')} groups={groups} startNew={groupManager === 'new'}
          onClose={() => { setGroupManager(null); setGroupCreateForNoteId(null); }}
          onCreate={createGroup} onUpdate={updateGroup} onDelete={deleteGroup}
          onCreated={(created) => {
            if (!groupCreateForNoteId) return;
            const noteId = groupCreateForNoteId;
            setGroupManager(null);
            setGroupCreateForNoteId(null);
            void assignGroup(noteId, created.id);
          }} />
      ) : null}
      {editing ? (
        <NotesEditor
          key={editing.id}
          value={editing.content}
          onChange={(content) => changeDraft({ content })}
          onClose={() => { void closeEditor(); }}
          heading="Редактирование заметки"
          titleEditor={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="standalone-note-title-input min-w-0 flex-[1_1_220px] rounded-xl border px-3 py-2 text-sm font-semibold"
                aria-label="Название заметки"
                placeholder="Название заметки"
                maxLength={160}
                value={editing.title}
                onChange={(event) => changeDraft({ title: event.target.value })}
              />
              <button type="button"
                className="standalone-note-editor-group inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold"
                style={groupFor(editing) ? noteGroupStyle(groupFor(editing)!.color) : undefined}
                aria-label="Выбрать группу заметки" title="Выбрать или создать группу"
                onClick={(event) => showGroupPicker(editing.id, event.currentTarget)}>
                {groupFor(editing) ? <span className="standalone-group-color-dot h-2.5 w-2.5 shrink-0 rounded-full"/> : <Tags size={14}/>}
                <span className="max-w-36 truncate">{groupFor(editing)?.name ?? 'Без группы'}</span>
                <ChevronDown size={14}/>
              </button>
            </div>
          }
        />
      ) : null}
    </>
  );
}
