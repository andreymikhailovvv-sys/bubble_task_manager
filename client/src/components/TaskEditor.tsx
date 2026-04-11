import { Paperclip, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ChatAttachmentPayload, Sphere, Task } from '../lib/types';
import { DateTimePickerWithApply } from './DateTimePickerWithApply';

type Props = {
  task?: Task;
  initialSphereId?: string;
  spheres: Sphere[];
  onSave: (payload: Partial<Task>) => Promise<void>;
  onGenerateWithAi: (payload: { prompt: string; sphereId?: string | null; attachments: ChatAttachmentPayload[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onComplete?: () => Promise<void>;
};
const MAX_AI_ATTACHMENTS = 3;
const MAX_AI_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const SUPPORTED_AI_FILE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);
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

export function TaskEditor({ task, initialSphereId, spheres, onSave, onGenerateWithAi, onDelete, onCancel, onComplete }: Props) {
  const isEditing = Boolean(task?.id);
  const [form, setForm] = useState<Partial<Task>>({ importance: 3, sphereId: initialSphereId ?? null });
  const [notifyPreset, setNotifyPreset] = useState<string>('60');
  const [createMode, setCreateMode] = useState<'manual' | 'ai'>('manual');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSphereId, setAiSphereId] = useState<string | null>(initialSphereId ?? null);
  const [aiPendingFiles, setAiPendingFiles] = useState<File[]>([]);
  const [isGeneratingByAi, setIsGeneratingByAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAttachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextForm = task ?? { importance: 3, sphereId: initialSphereId ?? null, status: 'TODO', notifyBeforeMinutes: 60 };
    setForm(nextForm);
    if (nextForm.notifyBeforeMinutes === null) {
      setNotifyPreset('null');
    } else if ([15, 30, 60, 180].includes(nextForm.notifyBeforeMinutes ?? 60)) {
      setNotifyPreset(String(nextForm.notifyBeforeMinutes ?? 60));
    } else {
      setNotifyPreset('60');
      setForm((prev) => ({ ...prev, notifyBeforeMinutes: 60 }));
    }
    setCreateMode('manual');
    setAiPrompt('');
    setAiSphereId(initialSphereId ?? null);
    setAiPendingFiles([]);
    setIsGeneratingByAi(false);
    setAiError(null);
  }, [task, initialSphereId]);

  const selectedImportance = form.importance ?? 3;
  const isSubtask = Boolean(form.parentTaskId);
  const canShowAiCreateMode = !isEditing && !isSubtask;

  const fileToAttachmentPayload = async (file: File): Promise<ChatAttachmentPayload> => ({
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    contentBase64: await file.arrayBuffer().then((buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))),
    size: file.size
  });

  const handleAiFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    const normalized = selectedFiles.filter((file) => SUPPORTED_AI_FILE_TYPES.has(file.type) || /\.(pdf|docx|png|jpe?g|webp|gif)$/i.test(file.name));
    if (normalized.length === 0) {
      setAiError('Разрешены PDF, DOCX и изображения.');
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
      await onGenerateWithAi({ prompt, sphereId: aiSphereId ?? null, attachments });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Не удалось сформировать задачу через ИИ');
    } finally {
      setIsGeneratingByAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onClick={onCancel}>
      <aside className="w-full max-w-xl space-y-3 rounded-2xl border border-slate-700/50 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-100">{isEditing ? 'Редактирование задачи' : 'Новая задача'}</h3>
        {canShowAiCreateMode ? (
          <div className="grid grid-cols-2 gap-2">
            <button className={`rounded px-3 py-2 text-sm font-semibold ${createMode === 'manual' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`} onClick={() => setCreateMode('manual')}>Вручную</button>
            <button className={`rounded px-3 py-2 text-sm font-semibold ${createMode === 'ai' ? 'bg-rose-500 text-white' : 'border border-rose-300/60 bg-rose-500/25 text-rose-100'}`} onClick={() => setCreateMode('ai')}>Через ИИ</button>
          </div>
        ) : null}
        {createMode === 'ai' && canShowAiCreateMode ? (
          <>
            <p className="text-xs text-slate-300">
              Опишите задачу в свободной форме — ИИ сам заполнит название, описание, сроки, степень важности, а также сразу даст подсказки по выполнению
            </p>
            <textarea
              className="min-h-28 w-full rounded bg-slate-800 p-2 text-sm"
              placeholder="Например: нужно подготовить презентацию для созвона с клиентом в четверг, собрать метрики, согласовать бюджет…"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <input
              ref={aiAttachmentInputRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleAiFileSelect}
            />
            <div className="flex flex-wrap items-center gap-2">
              {aiPendingFiles.map((file) => (
                <button
                  key={`${file.name}:${file.size}`}
                  type="button"
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-slate-700/90 px-2 py-1 text-[11px]"
                  onClick={() => setAiPendingFiles((prev) => prev.filter((item) => `${item.name}:${item.size}` !== `${file.name}:${file.size}`))}
                >
                  <Paperclip size={11} />
                  <span className="truncate">{file.name}</span>
                  <X size={11} />
                </button>
              ))}
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700"
                onClick={() => aiAttachmentInputRef.current?.click()}
                title="Добавить файл"
              >
                <Plus size={15} />
              </button>
            </div>
            <select className="w-full rounded bg-slate-800 p-2 text-sm" value={aiSphereId ?? ''} onChange={(e) => setAiSphereId(e.target.value || null)}>
              <option value="">Без сектора</option>
              {spheres.map((sphere) => (
                <option key={sphere.id} value={sphere.id}>{sphere.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2">
              <p className="min-h-4 text-xs text-rose-300">{aiError ?? ''}</p>
              <button className="rounded bg-violet-600 px-3 py-2 text-sm disabled:opacity-60" onClick={() => void submitAiGenerate()} disabled={isGeneratingByAi}>
                {isGeneratingByAi ? 'Формирую…' : 'Сформировать задачу'}
              </button>
            </div>
          </>
        ) : (
          <>
        <input className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="Название" value={form.title ?? ''} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        <textarea className="min-h-20 w-full rounded bg-slate-800 p-2 text-sm" placeholder="Описание" value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        {!isSubtask ? (
          <>
            <select className="w-full rounded bg-slate-800 p-2 text-sm" value={form.sphereId ?? ''} onChange={(e) => setForm((p) => ({ ...p, sphereId: e.target.value || null }))}>
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
        <label className="block text-xs">Срок (дата и время)
          <DateTimePickerWithApply
            className="mt-1"
            value={form.dueDate}
            onChange={(nextValue) => setForm((p) => ({ ...p, dueDate: nextValue }))}
          />
        </label>
        <label className="block text-xs">Уведомлять за
          <select
            className="mt-1 w-full rounded bg-slate-800 p-2 text-sm"
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
        </label>

        <div className="flex gap-2">
          <button className="flex-1 rounded bg-cyan-600 px-3 py-2 text-sm" onClick={() => onSave(form)}>Сохранить</button>
          {isEditing ? <button className="rounded bg-rose-600 px-3 py-2 text-sm" onClick={() => onDelete?.()}>Удалить</button> : null}
          <button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={onCancel}>Закрыть</button>
        </div>
        {isEditing ? (
          <button className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold" onClick={() => onComplete?.()}>
            Выполнена
          </button>
        ) : null}
          </>
        )}
      </aside>
    </div>
  );
}
