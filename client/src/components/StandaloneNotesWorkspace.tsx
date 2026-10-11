import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FilePenLine, Maximize2, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { api, type StandaloneNote } from '../lib/api';
import { noteHtmlToPlainText, noteValueToEditorHtml } from '../lib/notes';
import { NotesEditor } from './NotesEditor';

type Props = { userId: string };
const sortNotes = (items: StandaloneNote[]) =>
  [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
const titleOf = (note: StandaloneNote) => note.title.trim() || 'Без названия';
const summaryOf = (note: StandaloneNote) => noteHtmlToPlainText(note.content).replace(/\s+/g, ' ').trim();
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить заметку.';

export function StandaloneNotesWorkspace({ userId }: Props) {
  const [notes, setNotes] = useState<StandaloneNote[]>([]);
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
      const result = await api.getStandaloneNotes();
      setNotes(sortNotes(result));
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
      const note = await api.createStandaloneNote();
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
            <div className="standalone-notes-board-header flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-6">
              <div className="min-w-0">
                <p className="standalone-note-accent text-xs font-semibold uppercase tracking-widest">Личные записи</p>
                <h2 className="mt-1 text-xl font-bold text-primary">Мои заметки <span className="text-sm font-normal text-muted">({notes.length})</span></h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="standalone-notes-create inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold" disabled={creating} onClick={() => void createNote()}><Plus size={16} /> Новая заметка</button>
                <button type="button" className="standalone-notes-icon-button rounded-xl border p-2" onClick={() => setBoardOpen(false)} aria-label="Закрыть список заметок"><X size={18} /></button>
              </div>
            </div>
            {error ? <p role="alert" className="standalone-notes-error mx-4 mt-3 rounded-lg px-3 py-2 text-sm sm:mx-6">{error}</p> : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {notes.length === 0 ? (
                <div className="standalone-notes-empty rounded-2xl border p-8 text-center text-muted">
                  <StickyNote className="mx-auto mb-3 opacity-70" size={32} />
                  Пока нет заметок. Создайте первую запись.
                </div>
              ) : (
                <div className="standalone-notes-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {notes.map((note) => (
                    <article key={note.id} className="standalone-note-card group flex min-h-48 flex-col overflow-hidden rounded-2xl border">
                      <button type="button" className="min-w-0 flex-1 px-4 pb-2 pt-4 text-left" onClick={() => openEditor(note)} aria-label={'Открыть заметку «' + titleOf(note) + '»'}>
                        <h3 className="break-words text-base font-bold text-primary">{titleOf(note)}</h3>
                        <div className="standalone-note-preview mt-2 max-h-48 overflow-hidden text-sm leading-relaxed text-muted"
                          dangerouslySetInnerHTML={{ __html: noteValueToEditorHtml(note.content) }} />
                        {!note.content.trim() ? <p className="mt-2 text-sm text-subtle">Пустая заметка</p> : null}
                      </button>
                      <div className="standalone-note-card-footer flex items-center justify-between gap-2 border-t px-4 py-2">
                        <time className="truncate text-[11px] text-muted" dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                        <div className="flex items-center gap-1">
                          <button type="button" className="standalone-notes-icon-button rounded-lg p-1.5" onClick={() => openEditor(note)} aria-label={'Редактировать заметку «' + titleOf(note) + '»'}><FilePenLine size={16} /></button>
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
      {editing ? (
        <NotesEditor
          key={editing.id}
          value={editing.content}
          onChange={(content) => changeDraft({ content })}
          onClose={() => { void closeEditor(); }}
          heading="Редактирование заметки"
          titleEditor={
            <input
              type="text"
              className="standalone-note-title-input w-full rounded-xl border px-3 py-2 text-sm font-semibold"
              aria-label="Название заметки"
              placeholder="Название заметки"
              maxLength={160}
              value={editing.title}
              onChange={(event) => changeDraft({ title: event.target.value })}
            />
          }
        />
      ) : null}
    </>
  );
}
