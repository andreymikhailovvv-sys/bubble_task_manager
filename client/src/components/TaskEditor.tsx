import { Bold, Check, CheckCircle2, ChevronDown, Coins, Edit3, Heading1, Heading2, Italic, Loader2, Maximize2, Paperclip, Plus, Trash2, Underline, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import type { ChatAttachmentPayload, Sphere, Task } from '../lib/types';
import { DateTimePickerWithApply } from './DateTimePickerWithApply';
import { api } from '../lib/api';
import { noteHtmlToPlainText } from '../lib/notes';
import { NotesEditor as TaskNotesEditor } from './NotesEditor';
import { CustomSelect } from './CustomSelect';

type Props = {
  task?: Task;
  subtasks?: Task[];
  initialSphereId?: string;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>, draftSubtasks?: Array<Pick<Task, 'title' | 'description'>>) => Promise<void>;
  onAutoSave?: (payload: Partial<Task>) => Promise<void>;
  onGenerateWithAi: (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments: ChatAttachmentPayload[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onComplete?: () => Promise<void>;
  parentTaskTitle?: string | null;
  onOpenParentTask?: () => void;
  defaultAiNotificationsEnabled: boolean;
  timelineTasks?: Array<{ id: string; title: string; dueDate?: string | null; isSubtask?: boolean; sphereColor?: string | null }>;
};
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
const NOTIFY_PRESETS = [
  { value: 'null', label: 'Не уведомлять' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 мин' },
  { value: '60', label: 'За час' },
  { value: '180', label: 'За 3 часа' }
] as const;

const IMPORTANCE_STYLES: Record<number, string> = {
  1: 'bg-sky-500/70 border-sky-300',
  2: 'bg-cyan-500/70 border-cyan-300',
  3: 'bg-violet-500/70 border-violet-300',
  4: 'bg-orange-500/70 border-orange-300',
  5: 'bg-rose-500/75 border-rose-300'
};
const SUBTASK_IMPORTANCE_OPTIONS = [
  { level: 1, color: '#38bdf8', label: 'Низкая важность' },
  { level: 2, color: '#facc15', label: 'Средняя важность' },
  { level: 3, color: '#ef4444', label: 'Высокая важность' }
] as const;

type NoteFormat = 'h1' | 'h2' | 'bold' | 'underline' | 'italic';

type NotesEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

const NOTE_FORMAT_BUTTONS: Array<{ format: NoteFormat; label: string; title: string; icon: typeof Bold }> = [
  { format: 'h1', label: 'H1', title: 'Заголовок первого порядка', icon: Heading1 },
  { format: 'h2', label: 'H2', title: 'Заголовок второго порядка', icon: Heading2 },
  { format: 'bold', label: 'B', title: 'Жирный', icon: Bold },
  { format: 'underline', label: 'U', title: 'Подчёркнутый', icon: Underline },
  { format: 'italic', label: 'I', title: 'Курсив', icon: Italic }
];

function replaceSelection(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (value: string) => void,
  formatter: (selectedText: string) => { text: string; selectionStart: number; selectionEnd: number }
) {
  const textarea = textareaRef.current;
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const selectedText = value.slice(start, end);
  const formatted = formatter(selectedText);
  const nextValue = `${value.slice(0, start)}${formatted.text}${value.slice(end)}`;
  onChange(nextValue);
  window.requestAnimationFrame(() => {
    textarea?.focus();
    textarea?.setSelectionRange(start + formatted.selectionStart, start + formatted.selectionEnd);
  });
}

function formatHeading(selectedText: string, level: 1 | 2) {
  const marker = level === 1 ? '# ' : '## ';
  const text = selectedText || (level === 1 ? 'Заголовок' : 'Подзаголовок');
  const formattedText = text
    .split('\n')
    .map((line) => `${marker}${line.replace(/^#{1,6}\s+/, '')}`)
    .join('\n');
  return { text: formattedText, selectionStart: marker.length, selectionEnd: formattedText.length };
}

function formatInline(selectedText: string, prefix: string, suffix = prefix, placeholder = 'текст') {
  const text = selectedText || placeholder;
  return {
    text: `${prefix}${text}${suffix}`,
    selectionStart: prefix.length,
    selectionEnd: prefix.length + text.length
  };
}


function formatDeadlineLeft(date: string) {
  const diff = new Date(date).getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.max(1, Math.floor((abs % 3_600_000) / 60_000));
  const parts = days > 0 ? `${days} д ${hours} ч` : hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  return diff >= 0 ? parts : `просрочено на ${parts}`;
}

function NotesEditor({ value, onChange, onClose }: NotesEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyFormat = (format: NoteFormat) => {
    const formatters: Record<NoteFormat, (selectedText: string) => { text: string; selectionStart: number; selectionEnd: number }> = {
      h1: (selectedText) => formatHeading(selectedText, 1),
      h2: (selectedText) => formatHeading(selectedText, 2),
      bold: (selectedText) => formatInline(selectedText, '**'),
      underline: (selectedText) => formatInline(selectedText, '<u>', '</u>'),
      italic: (selectedText) => formatInline(selectedText, '_')
    };
    replaceSelection(textareaRef, value, onChange, formatters[format]);
  };

  return (
    <div className="notes-editor-backdrop fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <section className="notes-editor-panel flex h-[min(82vh,680px)] w-full max-w-4xl flex-col rounded-3xl border shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="notes-editor-header flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h4 className="text-base font-semibold text-primary">Заметки</h4>
            <p className="text-xs text-muted">Выделите текст и примените простое форматирование.</p>
          </div>
          <button type="button" className="notes-editor-close rounded-full px-3 py-1.5 text-sm font-semibold" onClick={onClose}>Готово</button>
        </div>
        <div className="notes-editor-toolbar flex flex-wrap gap-2 border-b px-4 py-3">
          {NOTE_FORMAT_BUTTONS.map(({ format, label, title, icon: Icon }) => (
            <button
              key={format}
              type="button"
              className="notes-editor-tool inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
              title={title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat(format)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="notes-editor-textarea min-h-0 flex-1 resize-none border-0 p-5 text-sm leading-6 outline-none"
          placeholder="Пишите заметки, детали задачи, ссылки и план действий…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
        />
      </section>
    </div>
  );
}

export function TaskEditor({ task, subtasks = [], initialSphereId, spheres, onSave, onAutoSave, onGenerateWithAi, onDelete, onCancel, onComplete, parentTaskTitle, onOpenParentTask, defaultAiNotificationsEnabled, timelineTasks = [] }: Props) {
  const isEditing = Boolean(task?.id);
  const [form, setForm] = useState<Partial<Task>>({ importance: 3, sphereId: initialSphereId ?? null });
  const [notifyPreset, setNotifyPreset] = useState<string>('30');
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSphereSelection, setAiSphereSelection] = useState<string>('auto');
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [isGeneratingByAi, setIsGeneratingByAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceText, setRecurrenceText] = useState('');
  const [recurrenceLoading, setRecurrenceLoading] = useState(false);
  const [recurrenceSummary, setRecurrenceSummary] = useState<string | null>(null);
  const [recurrenceNextDueLabel, setRecurrenceNextDueLabel] = useState<string | null>(null);
  const [isNotesEditorOpen, setIsNotesEditorOpen] = useState(false);
  const [isSphereDropdownOpen, setIsSphereDropdownOpen] = useState(false);
  const [draftSubtasks, setDraftSubtasks] = useState<Array<Pick<Task, 'title' | 'description'>>>([]);
  const [draftSubtaskTitle, setDraftSubtaskTitle] = useState('');
  const [isAddingDraftSubtask, setIsAddingDraftSubtask] = useState(false);
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const subtaskDescriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    const nextForm: Partial<Task> = task ?? { importance: 3, sphereId: initialSphereId ?? null, status: 'TODO', notifyBeforeMinutes: 30, aiNotificationsEnabled: defaultAiNotificationsEnabled };
    setForm(nextForm);
    if (nextForm.notifyBeforeMinutes === null) {
      setNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(nextForm.notifyBeforeMinutes ?? 30)) {
      setNotifyPreset(String(nextForm.notifyBeforeMinutes ?? 30));
    } else {
      setNotifyPreset('30');
      setForm((prev) => ({ ...prev, notifyBeforeMinutes: 30 }));
    }
    setCreateMode('manual');
    setAiPrompt('');
    setAiSphereSelection('auto');
    setAiPendingFiles([]);
    setIsGeneratingByAi(false);
    setAiError(null);
    setIsRecurring(Boolean(nextForm.isRecurring));
    setRecurrenceText(nextForm.recurrenceText ?? '');
    setRecurrenceSummary(nextForm.recurrenceSummary ?? null);
    setRecurrenceNextDueLabel(nextForm.dueDate ? new Date(nextForm.dueDate).toLocaleString('ru-RU') : null);
    setIsNotesEditorOpen(false);
    setIsSphereDropdownOpen(false);
    setDraftSubtasks([]);
    setDraftSubtaskTitle('');
    setIsAddingDraftSubtask(false);
    autosaveSignatureRef.current = task ? JSON.stringify({
      title: task.title ?? '',
      description: task.description ?? '',
      sphereId: task.sphereId ?? null,
      dueDate: task.dueDate ?? null,
      notifyBeforeMinutes: task.notifyBeforeMinutes ?? null,
      isRecurring: task.isRecurring ?? false,
      recurrenceText: task.recurrenceText ?? null,
      recurrenceJson: task.recurrenceJson ?? null,
      recurrenceSummary: task.recurrenceSummary ?? null,
      recurrenceUntil: task.recurrenceUntil ?? null,
      importance: task.importance ?? 3,
      urgency: task.urgency ?? 3,
      status: task.status ?? 'TODO'
      ,
      aiNotificationsEnabled: task.aiNotificationsEnabled ?? defaultAiNotificationsEnabled
    }) : null;
  }, [task, initialSphereId, defaultAiNotificationsEnabled]);

  useEffect(() => {
    if (!isEditing || !task?.id || !onAutoSave) return;
    const normalized = {
      ...form,
      importance: form.importance ?? 3,
      urgency: form.urgency ?? 3,
      status: form.status ?? 'TODO'
    };
    const nextSignature = JSON.stringify({
      title: normalized.title ?? '',
      description: normalized.description ?? '',
      sphereId: normalized.sphereId ?? null,
      dueDate: normalized.dueDate ?? null,
      notifyBeforeMinutes: normalized.notifyBeforeMinutes ?? null,
      isRecurring: normalized.isRecurring ?? false,
      recurrenceText: normalized.recurrenceText ?? null,
      recurrenceJson: normalized.recurrenceJson ?? null,
      recurrenceSummary: normalized.recurrenceSummary ?? null,
      recurrenceUntil: normalized.recurrenceUntil ?? null,
      importance: normalized.importance,
      urgency: normalized.urgency,
      status: normalized.status
      ,
      aiNotificationsEnabled: normalized.aiNotificationsEnabled ?? defaultAiNotificationsEnabled
    });
    if (autosaveSignatureRef.current === nextSignature) return;
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      void onAutoSave(normalized).then(() => {
        autosaveSignatureRef.current = nextSignature;
      });
    }, 700);
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [form, isEditing, onAutoSave, task?.id, defaultAiNotificationsEnabled]);

  const selectedImportance = form.importance ?? 3;
  const isSubtask = Boolean(form.parentTaskId);
  const canShowAiCreateMode = !isEditing && !isSubtask;
  const descriptionValue = form.description ?? '';
  const updateDescription = (description: string) => setForm((previous) => ({ ...previous, description }));

  const resolveAttachmentMimeType = (file: File): string => {
    const fromBrowser = file.type?.trim();
    if (fromBrowser) return fromBrowser;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension) return 'application/octet-stream';
    return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  };

  const fileToAttachmentPayload = async (file: File): Promise<ChatAttachmentPayload> => ({
    name: file.name,
    mimeType: resolveAttachmentMimeType(file),
    contentBase64: await file.arrayBuffer().then((buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))),
    size: file.size
  });

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|xlsx?|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length === 0) {
      setAiError('Разрешены PDF, DOCX, XLS/XLSX и изображения.');
      return;
    }
    const oversized = normalized.find((file) => file.size > MAX_AI_ATTACHMENT_SIZE);
    if (oversized) {
      setAiError(`Файл "${oversized.name}" превышает лимит 8MB.`);
      return;
    }
    setAiError(null);
    setAiPendingFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}:${file.size}`));
      const merged = [...prev, ...normalized.filter((file) => !existing.has(`${file.name}:${file.size}`))];
      return merged.slice(0, MAX_AI_ATTACHMENTS);
    });
  };

  const submitAiGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError('Введите описание задачи для ИИ.');
      return;
    }
    try {
      setAiError(null);
      setIsGeneratingByAi(true);
      const attachments = await Promise.all(aiPendingFiles.map((file) => fileToAttachmentPayload(file)));
      const autoAssignSphere = aiSphereSelection === 'auto';
      const sphereId = aiSphereSelection === 'none' || aiSphereSelection === 'auto'
        ? null
        : aiSphereSelection;
      await onGenerateWithAi({ prompt, sphereId, autoAssignSphere, attachments });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Не удалось сформировать задачу через ИИ');
    } finally {
      setIsGeneratingByAi(false);
    }
  };
  const visibleSubtasks = subtasks.filter((subtask) => subtask.status !== 'DONE').slice(0, 5);
  const deadlineLabel = form.dueDate ? `До дедлайна: ${formatDeadlineLeft(form.dueDate)}` : 'Дедлайн не задан';

  const applyRecurrence = async () => {
    if (!isRecurring) return;
    const text = recurrenceText.trim();
    if (!text) return;
    setRecurrenceLoading(true);
    try {
      const parsed = await api.parseRecurrence({ text });
      setRecurrenceSummary(parsed.summary);
      setRecurrenceNextDueLabel(parsed.nextDueDate ? new Date(parsed.nextDueDate).toLocaleString('ru-RU') : null);
      setForm((p) => ({ ...p, isRecurring: true, recurrenceText: text, recurrenceJson: parsed.schedule, recurrenceSummary: parsed.summary, recurrenceUntil: parsed.schedule.until, dueDate: parsed.nextDueDate }));
    } finally {
      setRecurrenceLoading(false);
    }
  };

  const closeEditor = async () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    const hasMeaningfulManualDraft = Boolean((form.title ?? '').trim() || noteHtmlToPlainText(form.description ?? '', { trimEnd: true }).trim() || form.dueDate);
    if (isEditing || (!isEditing && createMode === 'manual' && hasMeaningfulManualDraft)) {
      await onSave(form, draftSubtasks);
      return;
    }
    onCancel();
  };

  const addDraftSubtask = () => {
    const title = draftSubtaskTitle.trim();
    if (!title) return;
    setDraftSubtasks((prev) => [...prev, { title, description: '' }]);
    setDraftSubtaskTitle('');
    setIsAddingDraftSubtask(false);
  };

  const renderSphereDropdown = () => {
    const selectedSphere = spheres.find((sphere) => sphere.id === form.sphereId);
    return (
      <div className="focus-sector-dropdown relative">
        <button type="button" className="focus-sector-dropdown-button focused-task-sector-button inline-flex w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-600" onClick={() => setIsSphereDropdownOpen((prev) => !prev)}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedSphere?.color ?? '#7c3aed' }} />
          <span className="min-w-0 flex-1 truncate text-left font-semibold">{selectedSphere?.name ?? 'Без сектора'}</span>
          <ChevronDown size={14} className="shrink-0" />
        </button>
        {isSphereDropdownOpen ? (
          <div className="focus-sector-dropdown-menu absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border bg-white p-1 shadow-2xl">
            {[{ id: '', name: 'Без сектора', color: '#7c3aed' }, ...spheres].map((sphere) => (
              <button key={sphere.id || 'none'} type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-violet-50" onClick={() => { setForm((prev) => ({ ...prev, sphereId: sphere.id || null })); setIsSphereDropdownOpen(false); }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sphere.color }} />
                <span className="font-medium">{sphere.name}</span>
                {(form.sphereId ?? '') === sphere.id ? <Check size={14} className="ml-auto text-violet-600" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-[180] flex items-center justify-center p-3 backdrop-blur-sm" onClick={() => void closeEditor()}>
      <aside className={`task-edit-shell focused-task-editor-shell relative ${isSubtask ? 'h-[min(560px,calc(100vh-24px))]' : 'h-[min(760px,calc(100vh-24px))]'} w-full max-w-3xl overflow-hidden rounded-[2.3rem] border bg-white p-5 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="absolute right-5 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-slate-100" onClick={() => void closeEditor()} aria-label="Закрыть окно"><X size={18} /></button>
        <main className="focus-main-card task-edit-card flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">{isSubtask ? 'Редактирование подзадачи' : isEditing ? 'Редактирование задачи' : 'Новая задача'}</p>
          {canShowAiCreateMode ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={`rounded-full px-3 py-2 text-sm font-semibold ${createMode === 'manual' ? 'primary-button' : 'secondary-button'}`} onClick={() => setCreateMode('manual')}>Вручную</button>
              <button className={`ai-create-mode-button rounded-full border px-3 py-2 text-sm font-semibold transition ${createMode === 'ai' ? 'ai-create-mode-button-active' : ''}`} onClick={() => setCreateMode('ai')}>Через ИИ</button>
            </div>
          ) : null}
          {createMode === 'ai' && canShowAiCreateMode ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <p className="text-xs text-muted">Опишите задачу в свободной форме — ИИ сам заполнит название, описание, сроки, степень важности и даст подсказки <span className="inline-flex items-center gap-1 text-rose-300">(стоимость 2 <Coins size={11} />)</span></p>
              <textarea className="form-field min-h-0 flex-1 resize-none rounded-2xl border p-3 text-sm" placeholder="Например: нужно подготовить презентацию…" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
              <input ref={aiAttachmentInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={handleAiFileSelect} />
              <div className="flex flex-wrap items-center gap-2">{aiPendingFiles.map((file) => <button key={`${file.name}:${file.size}`} type="button" className="secondary-button inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-1 text-[11px]" onClick={() => setAiPendingFiles((prev) => prev.filter((item) => `${item.name}:${item.size}` !== `${file.name}:${file.size}`))}><Paperclip size={11} /><span className="truncate">{file.name}</span><X size={11} /></button>)}<button type="button" className="secondary-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed text-primary hover:brightness-110" onClick={() => aiAttachmentInputRef.current?.click()} title="Добавить файл"><Plus size={15} /></button></div>
              <CustomSelect value={aiSphereSelection} onChange={setAiSphereSelection} options={[{ value: 'auto', label: 'Автоматически', color: '#0ea5e9' }, { value: 'none', label: 'Без сектора', color: '#7c3aed' }, ...spheres.map((sphere) => ({ value: sphere.id, label: sphere.name, color: sphere.color }))]} ariaLabel="Выбор сектора для ИИ" buttonClassName="focused-task-pill-select" menuClassName="task-edit-sector-menu" detachedPopup popupPlacement="top" />
              <div className="flex items-center justify-between gap-2"><p className="min-h-4 text-xs text-rose-300">{aiError ?? ''}</p><button className="primary-button rounded-full px-4 py-2 text-sm disabled:opacity-60" onClick={() => void submitAiGenerate()} disabled={isGeneratingByAi}>{isGeneratingByAi ? 'Формирую…' : 'Сформировать задачу'}</button></div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mt-2 flex items-start justify-between gap-3">
                <textarea className="task-edit-title-input invisible-scrollbar min-h-[2.6rem] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-3xl font-bold leading-tight text-slate-950 shadow-none outline-none" placeholder="Введите название" rows={isSubtask ? 2 : Math.max(1, Math.min(4, (form.title ?? '').split('\n').length))} value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm font-medium text-violet-500"><span>{deadlineLabel}</span><DateTimePickerWithApply value={form.dueDate} onChange={(nextValue) => setForm((p) => ({ ...p, dueDate: nextValue }))} timelineTasks={timelineTasks} iconOnly detachedPopup buttonClassName="focused-task-icon-button" /></div>
              <div className="mt-3 flex h-32 min-h-32 items-start rounded-2xl bg-slate-50/70 p-3" onClick={() => subtaskDescriptionInputRef.current?.focus()}>
                {isEditing && !isSubtask ? (
                  <p className="focus-task-description task-edit-description min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-muted">{noteHtmlToPlainText(descriptionValue, { trimEnd: true }) || 'Описание не заполнено.'}</p>
                ) : (
                  <textarea ref={subtaskDescriptionInputRef} className="subtask-description-inline invisible-scrollbar h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-muted outline-none placeholder:text-slate-400" placeholder="Введите описание" value={descriptionValue} onChange={(e) => updateDescription(e.target.value)} />
                )}
              </div>
              <div className="mt-2 flex items-center gap-2"><button type="button" className="focused-task-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition" onClick={() => setIsNotesEditorOpen(true)} title="Редактировать описание"><Edit3 size={15} /></button><button type="button" className="focused-task-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition" onClick={() => aiAttachmentInputRef.current?.click()} title="Добавить файл"><Plus size={15} /></button></div>
              <input ref={aiAttachmentInputRef} type="file" accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif" multiple className="hidden" onChange={handleAiFileSelect} />
              {isSubtask && parentTaskTitle && onOpenParentTask ? <button type="button" className="main-task-link-button mt-2 inline-flex max-w-full min-w-0 rounded-full border px-3 py-1 text-xs font-semibold transition" onClick={onOpenParentTask}><span className="truncate">Основная задача: {parentTaskTitle}</span></button> : null}
              {isNotesEditorOpen ? <TaskNotesEditor value={descriptionValue} onChange={updateDescription} onClose={() => setIsNotesEditorOpen(false)} /> : null}
              {!isSubtask ? <div className="mt-4 grid grid-cols-2 gap-2">{renderSphereDropdown()}<CustomSelect value={notifyPreset} onChange={(value) => { setNotifyPreset(value); setForm((p) => ({ ...p, notifyBeforeMinutes: value === 'null' ? null : Number(value) })); }} options={NOTIFY_PRESETS} ariaLabel="Уведомлять за" disabled={isRecurring} buttonClassName="focused-task-pill-select" menuClassName="task-edit-notify-menu" detachedPopup /></div> : null}
              {!isSubtask ? <div className="mt-3 pt-1"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">Важность: {selectedImportance}</p><div className="importance-choice-group grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((level) => <button key={level} className={`importance-choice-button task-edit-importance rounded-xl border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${selectedImportance === level ? 'importance-choice-button-active ring-2' : 'opacity-80 hover:opacity-100'}`} onClick={() => setForm((p) => ({ ...p, importance: level }))}>{level}</button>)}</div></div> : <div className="mt-auto pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-500">Важность: {selectedImportance}</p><div className="importance-choice-group grid grid-cols-3 gap-2">{SUBTASK_IMPORTANCE_OPTIONS.map(({ level, label }) => <button key={level} type="button" title={label} className={`importance-choice-button task-edit-importance rounded-xl border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${selectedImportance === level ? 'importance-choice-button-active ring-2' : 'opacity-80 hover:opacity-100'}`} onClick={() => setForm((p) => ({ ...p, importance: level }))}>{level}</button>)}</div></div>}
              {!isSubtask ? <div className="mt-3 flex flex-wrap gap-3 text-sm"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={isRecurring} onChange={(e) => { const enabled = e.target.checked; setIsRecurring(enabled); setForm((p) => enabled ? ({ ...p, isRecurring: true, recurrenceText: recurrenceText.trim() || p.recurrenceText || null }) : ({ ...p, isRecurring: false, recurrenceText: null, recurrenceJson: null, recurrenceSummary: null, recurrenceUntil: null })); if (!enabled) { setRecurrenceSummary(null); setRecurrenceNextDueLabel(null); } }} />повторять</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.aiNotificationsEnabled ?? defaultAiNotificationsEnabled} onChange={(e) => setForm((p) => ({ ...p, aiNotificationsEnabled: e.target.checked }))} />уведомления от ИИ</label></div> : null}
              {isRecurring ? <div className="surface-card mt-2 rounded-2xl border p-2 text-xs"><p className="mb-1 text-muted">Опишите как должна повторяться задача</p><textarea className="form-field min-h-16 w-full rounded border p-2 text-sm" placeholder="Например: каждый вторник и четверг в 17:00" value={recurrenceText} onChange={(e) => setRecurrenceText(e.target.value)} /><div className="mt-2 flex items-center gap-2"><button type="button" className="recurrence-send-button rounded px-2 py-1 text-xs font-semibold disabled:opacity-70" onClick={() => void applyRecurrence()} disabled={recurrenceLoading}>{recurrenceLoading ? <Loader2 size={14} className="animate-spin" /> : 'Отправить'}</button><p className="text-[11px] text-emerald-300">{recurrenceSummary ?? ''}</p></div><p className="mt-1 text-[11px] text-muted">{recurrenceNextDueLabel ? `Ближайший срок: ${recurrenceNextDueLabel}` : ''}</p></div> : null}
              {!isEditing && !isSubtask ? <div className="focused-task-subtasks mt-3 flex min-h-0 flex-col space-y-2 border-t border-violet-100 pt-3"><div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-1.5 text-sm font-semibold">Подзадачи<button type="button" className="focused-task-add-subtask-button" onClick={() => { setDraftSubtaskTitle(''); setIsAddingDraftSubtask(true); }} title="Добавить подзадачу" aria-label="Добавить подзадачу"><Plus size={15} /></button></h4><span className="text-xs text-subtle">{draftSubtasks.length}</span></div>{isAddingDraftSubtask ? <div className="space-y-2"><input className="form-field w-full rounded border px-2 py-1.5 text-xs" placeholder="Название доп задачи" value={draftSubtaskTitle} onChange={(e) => setDraftSubtaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftSubtask(); } }} /><div className="flex gap-2"><button type="button" className="primary-button flex-1 rounded px-2 py-1.5 text-xs font-semibold" onClick={addDraftSubtask}>Сохранить</button><button type="button" className="secondary-button rounded px-2 py-1.5 text-xs font-semibold" onClick={() => { setIsAddingDraftSubtask(false); setDraftSubtaskTitle(''); }}>Отмена</button></div></div> : null}{draftSubtasks.length > 0 ? <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">{draftSubtasks.map((subtask, index) => <li key={`${subtask.title}-${index}`} className="focused-subtask-row flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={false} readOnly /><span className="min-w-0 flex-1 truncate">{subtask.title}</span><button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => setDraftSubtasks((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} title="Удалить подзадачу"><X size={12} /></button></li>)}</ul> : <p className="text-xs text-subtle">Пока нет подзадач</p>}</div> : null}
              {isEditing ? <div className="mt-auto flex gap-2 pt-4"><button type="button" className="success-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => onComplete?.()}><CheckCircle2 size={16} />Выполнить</button><button className="danger-button inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => onDelete?.()}><Trash2 size={15} />Удалить</button></div> : <button type="button" className="primary-button mt-4 rounded-xl px-3 py-2 text-sm font-semibold" onClick={() => void onSave(form, draftSubtasks)}>Сформировать задачу</button>}
              {isEditing && !isSubtask ? <div className="mt-4 min-h-0 flex-1"><div className="flex items-center justify-between"><h3 className="font-semibold text-primary">Подзадачи</h3><button type="button" className="task-edit-icon-button" title="Показать все подзадачи"><Maximize2 size={15} /></button></div><ul className="focus-subtask-list mt-3 min-h-0 space-y-2 overflow-y-auto pr-1">{visibleSubtasks.map((subtask) => <li key={subtask.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={false} readOnly /><span className="min-w-0 flex-1 truncate">{subtask.title}</span></li>)}{visibleSubtasks.length === 0 ? <li className="text-sm text-subtle">Активных подзадач пока нет.</li> : null}</ul></div> : null}
            </div>
          )}
        </main>
      </aside>
    </div>
  );
}
