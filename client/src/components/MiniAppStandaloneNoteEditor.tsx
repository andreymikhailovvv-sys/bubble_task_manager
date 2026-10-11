import { useCallback, useEffect, useRef, useState } from 'react';
import type { StandaloneNote } from '../lib/api';
import { api } from '../lib/api';
import { NotesEditor } from './NotesEditor';

type Props = { note: StandaloneNote; onClose: () => void };

export function MiniAppStandaloneNoteEditor({ note, onClose }: Props) {
  const [draft, setDraft] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const latest = useRef(note);
  const dirty = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    await queue.current.catch(() => {});
    if (!dirty.current) return;
    const snapshot = latest.current;
    dirty.current = false;
    const next = queue.current.catch(() => {}).then(async () => {
      const saved = await api.updateStandaloneNote(snapshot.id, {
        title: snapshot.title, content: snapshot.content
      });
      // The server owns the saved copy; local edits made while saving win.
      if (!dirty.current) latest.current = { ...saved, groupId: snapshot.groupId };
    });
    queue.current = next;
    try {
      await next;
      setError(null);
    } catch (cause) {
      dirty.current = true;
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить заметку');
      throw cause;
    }
    // Changes typed during a pending network request also need saving.
    if (dirty.current) await flush();
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const change = (patch: Partial<Pick<StandaloneNote, 'title' | 'content'>>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    dirty.current = true;
    setDraft(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 850);
  };

  const close = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await flush();
      onClose();
    } catch {
      // Never discard an unsaved note. Let the user retry by closing again.
    } finally {
      setClosing(false);
    }
  };

  return (
    <NotesEditor
      value={draft.content}
      onChange={(content) => change({ content })}
      onClose={() => { void close(); }}
      miniAppSheet
      heading="Новая заметка"
      titleEditor={
        <div className="space-y-2">
          <input type="text" maxLength={160} value={draft.title} aria-label="Название заметки"
            placeholder="Название заметки" onChange={(event) => change({ title: event.target.value })}
            className="standalone-note-title-input w-full rounded-xl border px-3 py-2 text-sm font-semibold" />
          <p className="text-xs text-muted">{closing ? 'Сохраняю…' : 'Заметка сохранится в общем разделе на сайте.'}</p>
          {error ? <p role="alert" className="standalone-notes-error rounded-lg px-2 py-1 text-xs">
            {error}. Повторите попытку закрытия, чтобы сохранить изменения.
          </p> : null}
        </div>
      }
    />
  );
}
