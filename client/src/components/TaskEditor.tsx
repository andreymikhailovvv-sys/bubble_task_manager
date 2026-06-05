import { Coins, Loader2, Maximize2, Paperclip, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ChatAttachmentPayload, Sphere, Task } from '../lib/types';
import { DateTimePickerWithApply } from './DateTimePickerWithApply';
import { api } from '../lib/api';
import { noteHtmlToPlainText } from '../lib/notes';
import { NotesEditor } from './NotesEditor';

type Props = {
  task?: Task;
  initialSphereId?: string;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>) => Promise<void>;
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
    <div className="notes-editor-backdrop fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
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

export function TaskEditor({ task, initialSphereId, spheres, onSave, onAutoSave, onGenerateWithAi, onDelete, onCancel, onComplete, parentTaskTitle, onOpenParentTask, defaultAiNotificationsEnabled, timelineTasks = [] }: Props) {
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
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);
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

  return (
    <div className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onCancel}>
      <aside className="modal-card w-full max-w-xl space-y-3 rounded-2xl border p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-primary">{isEditing ? 'Редактирование задачи' : 'Новая задача'}</h3>
        {canShowAiCreateMode ? (
          <div className="grid grid-cols-2 gap-2">
            <button className={`rounded px-3 py-2 text-sm font-semibold ${createMode === 'manual' ? 'primary-button' : 'secondary-button'}`} onClick={() => setCreateMode('manual')}>Вручную</button>
            <button
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${createMode === 'ai'
                ? 'border-rose-300 bg-rose-500 text-white hover:bg-rose-400'
                : 'secondary-button border-rose-300/70 text-primary hover:brightness-110'}`}
              onClick={() => setCreateMode('ai')}
            >
              Через ИИ
            </button>
          </div>
        ) : null}
        {createMode === 'ai' && canShowAiCreateMode ? (
          <>
            <p className="text-xs text-muted">
              Опишите задачу в свободной форме — ИИ сам заполнит название, описание, сроки, степень важности, а также сразу даст подсказки по выполнению <span className="inline-flex items-center gap-1 text-rose-300">(стоимость 2 <Coins size={11} />)</span>
            </p>
            <textarea
              className="form-field min-h-28 w-full rounded border p-2 text-sm"
              placeholder="Например: нужно подготовить презентацию для созвона с клиентом в четверг, собрать метрики, согласовать бюджет…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <input
              ref={aiAttachmentInputRef}
              type="file"
              accept=".pdf,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleAiFileSelect}
            />
            <div className="flex flex-wrap items-center gap-2">
              {aiPendingFiles.map((file) => (
                <button
                  key={`${file.name}:${file.size}`}
                  type="button"
                  className="secondary-button inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                  onClick={() => setAiPendingFiles((prev) => prev.filter((item) => `${item.name}:${item.size}` !== `${file.name}:${file.size}`))}
                >
                  <Paperclip size={11} />
                  <span className="truncate">{file.name}</span>
                  <X size={11} />
                </button>
              ))}
              <button
                type="button"
                className="secondary-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed text-primary hover:brightness-110"
                onClick={() => aiAttachmentInputRef.current?.click()}
                title="Добавить файл"
              >
                <Plus size={15} />
              </button>
            </div>
            <select className="form-field w-full rounded border p-2 text-sm" value={aiSphereSelection} onChange={(e) => setAiSphereSelection(e.target.value)}>
              <option value="auto">Автоматически</option>
              <option value="none">Без сектора</option>
              {spheres.map((sphere) => (
                <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2">
              <p className="min-h-4 text-xs text-rose-300">{aiError ?? ''}</p>
              <button className="primary-button rounded px-3 py-2 text-sm disabled:opacity-60" onClick={() => void submitAiGenerate()} disabled={isGeneratingByAi}>
                {isGeneratingByAi ? 'Формирую…' : 'Сформировать задачу'}
              </button>
            </div>
          </>
        ) : (
          <>
        <input className="form-field w-full rounded border p-2 text-sm" placeholder="Название" value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        <div>
          <textarea className="form-field min-h-20 w-full resize-none rounded border p-2 text-sm" placeholder="Описание" value={noteHtmlToPlainText(descriptionValue)} onChange={(e) => updateDescription(e.target.value)} />
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              className="notes-open-button inline-flex h-8 w-8 items-center justify-center rounded-full border transition"
              onClick={() => setIsNotesEditorOpen(true)}
              title="Открыть заметки"
              aria-label="Открыть заметки"
            >
              <Maximize2 size={15} />
            </button>
          </div>
        </div>
        {isNotesEditorOpen ? <NotesEditor value={descriptionValue} onChange={updateDescription} onClose={() => setIsNotesEditorOpen(false)} /> : null}
        {isSubtask && parentTaskTitle && onOpenParentTask ? (
          <button
            type="button"
            className="main-task-link-button inline-flex rounded-full border px-3 py-1 text-xs font-semibold transition"
            onClick={onOpenParentTask}
            title={`Открыть основную задачу: ${parentTaskTitle}`}
          >
            Основная задача: {parentTaskTitle}
          </button>
        ) : null}
        {!isSubtask ? (
          <>
            <select className="form-field w-full rounded border p-2 text-sm" value={form.sphereId ?? ''} onChange={(e) => setForm((p) => ({ ...p, sphereId: e.target.value || null }))}>
              <option value="">Без сектора</option>
              {spheres.map((sphere) => (
                <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
              ))}
            </select>
            <div>
              <p className="mb-1 text-xs">Важность: {selectedImportance}</p>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    className={`rounded border px-2 py-2 text-sm font-semibold transition ${IMPORTANCE_STYLES[level]} ${selectedImportance === level ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'}`}
                    onClick={() => setForm((p) => ({ ...p, importance: level }))}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {!isSubtask ? (
          <>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isRecurring} onChange={(e) => {
                const enabled = e.target.checked;
                setIsRecurring(enabled);
                if (enabled) {
                  setForm((p) => ({ ...p, isRecurring: true, recurrenceText: recurrenceText.trim() || p.recurrenceText || null }));
                }
                if (!enabled) {
                  setRecurrenceSummary(null);
                  setRecurrenceNextDueLabel(null);
                  setForm((p) => ({ ...p, isRecurring: false, recurrenceText: null, recurrenceJson: null, recurrenceSummary: null, recurrenceUntil: null }));
                }
              }} />
              повторять
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.aiNotificationsEnabled ?? defaultAiNotificationsEnabled}
                onChange={(e) => setForm((p) => ({ ...p, aiNotificationsEnabled: e.target.checked }))}
              />
              уведомления от ИИ
            </label>
            {isRecurring ? (
              <div className="surface-card rounded border p-2 text-xs">
                <p className="mb-1 text-muted">Опишите как должна повторяться задача</p>
                <textarea className="form-field min-h-16 w-full rounded border p-2 text-sm" placeholder="Например: каждый вторник и четверг в 17:00 в течение месяца" value={recurrenceText} onChange={(e) => setRecurrenceText(e.target.value)} />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="recurrence-send-button rounded px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-70" onClick={() => void applyRecurrence()} disabled={recurrenceLoading}>{recurrenceLoading ? <Loader2 size={14} className="animate-spin" /> : 'Отправить'}</button>
                  <p className="text-[11px] text-emerald-300">{recurrenceSummary ?? ''}</p>
                </div>
                <p className="mt-1 text-[11px] text-muted">{recurrenceNextDueLabel ? `Ближайший срок: ${recurrenceNextDueLabel}` : ''}</p>
              </div>
            ) : null}
          </>
        ) : null}
        <label className="block text-xs">Срок (дата и время)
          <DateTimePickerWithApply
            className="mt-1"
            value={form.dueDate}
            onChange={(nextValue) => setForm((p) => ({ ...p, dueDate: nextValue }))}
            timelineTasks={timelineTasks}
          />
        </label>
        {!isRecurring ? <label className="block text-xs">Уведомлять за
          <select
            className="form-field mt-1 w-full rounded border p-2 text-sm"
            value={notifyPreset}
            onChange={(e) => {
              const value = e.target.value;
              setNotifyPreset(value);
              if (value === 'null') {
                setForm((p) => ({ ...p, notifyBeforeMinutes: null }));
              } else {
                setForm((p) => ({ ...p, notifyBeforeMinutes: Number(value) }));
              }
            }}
          >
            {NOTIFY_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>{preset.label}</option>
            ))}
          </select>
        </label> : null}

        <div className="flex gap-2">
          <button className="primary-button flex-1 rounded px-3 py-2 text-sm" onClick={() => onSave(form)}>Сохранить</button>
          {isEditing ? <button className="danger-button rounded px-3 py-2 text-sm" onClick={() => onDelete?.()}>Удалить</button> : null}
          <button className="secondary-button rounded px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
        {isEditing ? (
          <button className="success-button w-full rounded px-3 py-2 text-sm font-semibold" onClick={() => onComplete?.()}>
            Выполнена
          </button>
        ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
