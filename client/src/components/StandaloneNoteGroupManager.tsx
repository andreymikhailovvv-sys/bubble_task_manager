import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Layers3, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { StandaloneNoteGroup } from '../lib/api';

export const NOTE_GROUP_COLOR_OPTIONS = [
  { value: '#8b5cf6', label: 'Фиолетовый' },
  { value: '#0891b2', label: 'Бирюзовый' },
  { value: '#d97706', label: 'Янтарный' },
  { value: '#db2777', label: 'Розовый' },
  { value: '#059669', label: 'Изумрудный' },
  { value: '#4f46e5', label: 'Индиго' },
  { value: '#e11d48', label: 'Коралловый' },
  { value: '#64748b', label: 'Серо-синий' }
] as const;
export const noteGroupStyle = (color: string) => ({ '--note-group-color': color } as CSSProperties);

type Props = {
  groups: StandaloneNoteGroup[];
  startNew: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; color: string }) => Promise<StandaloneNoteGroup>;
  onCreated?: (group: StandaloneNoteGroup) => void;
  onUpdate: (id: string, data: { name: string; color: string }) => Promise<void>;
  onDelete: (group: StandaloneNoteGroup) => Promise<void>;
};

export function StandaloneNoteGroupManager({ groups, startNew, onClose, onCreate, onCreated, onUpdate, onDelete }: Props) {
  const [editedId, setEditedId] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(startNew);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(NOTE_GROUP_COLOR_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCreate = () => {
    setEditedId(null);
    setName('');
    setColor(NOTE_GROUP_COLOR_OPTIONS[0].value);
    setFormVisible(true);
    setError(null);
  };
  const startEdit = (group: StandaloneNoteGroup) => {
    setEditedId(group.id);
    setName(group.name);
    setColor(group.color);
    setFormVisible(true);
    setError(null);
  };
  const save = async () => {
    if (saving) return;
    if (!name.trim()) { setError('Введите название группы.'); return; }
    setSaving(true);
    setError(null);
    try {
      const data = { name: name.trim(), color };
      if (editedId) await onUpdate(editedId, data);
      else {
        const created = await onCreate(data);
        onCreated?.(created);
      }
      setFormVisible(false);
      setEditedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить группу.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (group: StandaloneNoteGroup) => {
    if (!window.confirm('Удалить группу «' + group.name + '»? Все её заметки останутся без группы.')) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(group);
      if (editedId === group.id) setFormVisible(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось удалить группу.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="standalone-group-manager-backdrop fixed inset-0 z-[2147483647] flex items-center justify-center p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="standalone-group-manager flex max-h-[min(85dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Управление группами заметок"
        onKeyDown={(event) => { if (event.key === 'Escape' && !saving) onClose(); }}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4 standalone-group-manager-header">
          <div>
            <h3 className="text-lg font-bold text-primary">Группы заметок</h3>
            <p className="mt-1 text-xs text-muted">Название и цвет можно менять. При удалении группы заметки сохраняются.</p>
          </div>
          <button type="button" className="standalone-notes-icon-button rounded-lg p-2" onClick={onClose} aria-label="Закрыть управление группами" disabled={saving}><X size={17}/></button>
        </div>
        <div className="min-h-0 overflow-y-auto space-y-3 p-5">
          {groups.map((group) => (
            <div key={group.id} className="standalone-group-manager-row flex items-center justify-between gap-3 rounded-xl border p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="standalone-group-color-dot h-3.5 w-3.5 shrink-0 rounded-full" style={noteGroupStyle(group.color)} />
                <span className="truncate text-sm font-semibold text-primary">{group.name}</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="standalone-notes-icon-button rounded-lg p-1.5" title="Редактировать группу" aria-label={'Редактировать группу «' + group.name + '»'} onClick={() => startEdit(group)} disabled={saving}><Pencil size={15}/></button>
                <button type="button" className="standalone-notes-delete rounded-lg p-1.5" title="Удалить группу" aria-label={'Удалить группу «' + group.name + '»'} onClick={() => void remove(group)} disabled={saving}><Trash2 size={15}/></button>
              </div>
            </div>
          ))}
          {groups.length === 0 ? <p className="text-sm text-muted">Групп пока нет.</p> : null}
          {!formVisible ? (
            <button type="button" className="standalone-notes-icon-button flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
              onClick={startCreate} disabled={saving || groups.length >= 40}><Plus size={16}/> Новая группа</button>
          ) : (
            <div className="standalone-group-form space-y-3 rounded-2xl border p-4">
              <h4 className="text-sm font-semibold text-primary">{editedId ? 'Изменить группу' : 'Новая группа'}</h4>
              <label className="block text-xs font-semibold text-muted" htmlFor="standalone-group-name">Название</label>
              <input id="standalone-group-name" autoFocus maxLength={50} value={name} onChange={e=>setName(e.target.value)}
                placeholder="Например, Идеи" className="standalone-note-title-input w-full rounded-xl border px-3 py-2 text-sm"/>
              <p className="text-xs font-semibold text-muted">Цвет группы</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Цвет группы">
                {NOTE_GROUP_COLOR_OPTIONS.map(option => (
                  <button key={option.value} type="button" style={noteGroupStyle(option.value)}
                    className={'standalone-group-swatch h-9 w-9 rounded-full ' + (color === option.value ? 'standalone-group-swatch-selected' : '')}
                    title={option.label} aria-label={option.label} aria-pressed={color === option.value}
                    onClick={()=>setColor(option.value)} />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="standalone-notes-icon-button rounded-xl border px-3 py-2 text-sm" onClick={()=>{setFormVisible(false);setError(null);}} disabled={saving}>Отмена</button>
                <button type="button" className="standalone-notes-create rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => void save()} disabled={saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
              </div>
            </div>
          )}
          {error ? <p role="alert" className="standalone-notes-error rounded-lg px-3 py-2 text-sm">{error}</p> : null}
        </div>
      </section>
    </div>, document.body);
}
