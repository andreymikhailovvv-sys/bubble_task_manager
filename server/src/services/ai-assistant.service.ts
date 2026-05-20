import { prisma } from '../db/prisma.js';
import { randomUUID } from 'node:crypto';

type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};
type OpenAiTextMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
type OpenAiUserAttachmentMessage = {
  role: 'user';
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_file'; filename: string; file_data: string }
    | { type: 'input_image'; image_url: string }
  >;
};

type AskTaskAssistantInput = {
  userId: string;
  taskId: string;
  question: string;
  history: ChatMessage[];
  mode?: 'fast' | 'smart';
  attachments?: ChatAttachment[];
  userTimeZone?: string;
};

type GenerateSubtasksInput = {
  userId: string;
  taskId: string;
  note?: string;
  userTimeZone?: string;
};
type GenerateOverdueNudgeInput = {
  userId: string;
  taskId: string;
  userTimeZone?: string;
};
type GenerateTaskFromPromptInput = {
  userId: string;
  prompt: string;
  sphereId?: string | null;
  autoAssignSphere?: boolean;
  attachments?: ChatAttachment[];
  userTimeZone?: string;
};
type TranscribeAudioInput = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};
type AskGeneralAssistantInput = {
  userId: string;
  question: string;
  history: ChatMessage[];
  userTimeZone?: string;
};
type GeneralAssistantUndoOperation = {
  taskId: string;
  previous: {
    dueDate: string | null;
    status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  };
};
type UndoGeneralAssistantActionsInput = {
  userId: string;
  operations: GeneralAssistantUndoOperation[];
};
type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};

const FAST_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
const FULL_MODEL = process.env.OPENAI_MODEL_FULL?.trim() || 'gpt-5.4-mini';
const ATTACHMENTS_MODEL = process.env.OPENAI_MODEL_ATTACHMENTS?.trim() || 'gpt-5.4-mini';
const SMART_MODEL_FALLBACKS = [FAST_MODEL];
const SUPPORTED_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MOSCOW_TIMEZONE = 'Europe/Moscow';
const formatTimeZoneLabel = (timeZone: string) => `${timeZone}${timeZone === MOSCOW_TIMEZONE ? ', UTC+3' : ''}`;

type ReasoningEffort = typeof SUPPORTED_REASONING_EFFORTS[number];

function assertReasoningEffort(effort: string): asserts effort is ReasoningEffort {
  if (!SUPPORTED_REASONING_EFFORTS.includes(effort as ReasoningEffort)) {
    throw new TypeError(`Unsupported reasoning effort: "${effort}"`);
  }
}

function resolveReasoningEffort(mode: AskTaskAssistantInput['mode']): ReasoningEffort {
  const effortByMode: Record<'fast' | 'smart', ReasoningEffort> = {
    fast: 'low',
    smart: 'medium'
  };
  const normalizedMode = mode ?? 'fast';
  const effort = effortByMode[normalizedMode];
  assertReasoningEffort(effort);
  return effort;
}


function supportsReasoningEffort(model: string) {
  return model.startsWith('gpt-5');
}

function normalizeHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-20);
}

function normalizeGeneralHistory(history: ChatMessage[]): ChatMessage[] {
  return normalizeHistory(history).slice(-12);
}

function normalizeGeneralPersistedHistory(history: ChatMessage[]): ChatMessage[] {
  return normalizeHistory(history).slice(-60);
}

function trimHistoryForAttachments(history: ChatMessage[], hasAttachments: boolean): ChatMessage[] {
  if (!hasAttachments) return history;
  // Когда есть вложения, payload резко растёт (base64), и OpenAI может отсечь ранние сообщения.
  // Оставляем только короткий хвост диалога, чтобы вложения и последний вопрос точно попали в контекст.
  return history.slice(-6);
}

function formatTaskContext(task: {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  importance: number;
  urgency: number;
  priorityScore: number;
  status: string;
  subtasks: Array<{ id: string; title: string; description: string | null; dueDate: Date | null; status: string }>;
  attachments?: Array<{ name: string; mimeType: string; size: number }>;
}) {
  const dueDateText = task.dueDate ? task.dueDate.toISOString() : 'не указан';
  const subtasksText = task.subtasks.length
    ? task.subtasks
      .map((subtask, index) => `${index + 1}. [${subtask.id}] ${subtask.title} | статус: ${subtask.status} | срок: ${subtask.dueDate ? subtask.dueDate.toISOString() : 'не указан'} | описание: ${subtask.description ?? 'нет'}`)
      .join('\n')
    : 'Подзадач нет';
  const attachmentsText = task.attachments && task.attachments.length > 0
    ? task.attachments
      .map((attachment, index) => `${index + 1}. ${attachment.name} | тип: ${attachment.mimeType} | размер: ${attachment.size} байт`)
      .join('\n')
    : 'Нет прикреплённых файлов';

  return [
    `ID задачи: ${task.id}`,
    `Название задачи: ${task.title}`,
    `Описание: ${task.description ?? 'нет'}`,
    `Дедлайн: ${dueDateText}`,
    `Статус: ${task.status}`,
    `Важность: ${task.importance}`,
    `Срочность: ${task.urgency}`,
    `Приоритет: ${task.priorityScore}`,
    `Подзадачи:\n${subtasksText}`,
    `Прикреплённые файлы:\n${attachmentsText}`
  ].join('\n');
}



type TimelineOptimizationScope = 'day' | 'week' | 'month';
type TimelineOptimizationTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  importance: number;
  sphere: string | null;
};
type TimelineOptimizationPlan = {
  summary: string;
  tasks: Array<{ taskId: string; dueDate: string | null }>;
};
function parseTimelineOptimizationPlan(raw: string): TimelineOptimizationPlan {
  const parsed = JSON.parse(raw) as TimelineOptimizationPlan;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) throw new Error('ИИ вернул неверный формат оптимизации');
  return { summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '', tasks: parsed.tasks };
}

type GeneratedSubtask = {
  title: string;
  description: string;
  dueDate: string | null;
};
type GeneratedTaskDraft = {
  title: string;
  description: string;
  dueDate: string | null;
  importance: number;
  urgency: number;
  notifyBeforeMinutes: number | null;
  selectedSphereName: string | null;
  subtasks: Array<{ title: string; description: string; dueDate: string | null }>;
  firstAssistantMessage: string;
};

const FIRST_ASSISTANT_FALLBACK =
  'Отлично, начнём с первого шага: пришлите исходные данные/черновик, и я сразу помогу подготовить рабочий вариант.';

function parseGeneratedSubtasks(rawAnswer: string): GeneratedSubtask[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAnswer);
  } catch {
    throw new Error('ИИ вернул невалидный JSON для подзадач');
  }

  if (typeof parsed !== 'object' || parsed === null || !('subtasks' in parsed)) {
    throw new Error('ИИ вернул неверный формат подзадач');
  }

  const subtasks = (parsed as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(subtasks)) {
    throw new Error('ИИ вернул неверный формат списка подзадач');
  }

  const normalized = subtasks
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const title = 'title' in item ? (item as { title?: unknown }).title : undefined;
      const description = 'description' in item ? (item as { description?: unknown }).description : undefined;
      const dueDate = 'dueDate' in item ? (item as { dueDate?: unknown }).dueDate : null;
      if (typeof title !== 'string' || typeof description !== 'string') return null;
      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      if (!trimmedTitle || !trimmedDescription) return null;
      const normalizedDueDate = typeof dueDate === 'string' && dueDate.trim()
        ? dueDate.trim()
        : null;
      const parsedDueDate = normalizedDueDate ? new Date(normalizedDueDate) : null;
      return {
        title: trimmedTitle.slice(0, 180),
        description: trimmedDescription.slice(0, 4000),
        dueDate: parsedDueDate && !Number.isNaN(parsedDueDate.getTime()) ? parsedDueDate.toISOString() : null
      };
    })
    .filter((item): item is GeneratedSubtask => Boolean(item));

  if (normalized.length === 0) {
    throw new Error('ИИ не предложил ни одной валидной подзадачи');
  }

  return normalized.slice(0, 12);
}

function parseGeneratedTaskDraft(rawAnswer: string): GeneratedTaskDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAnswer);
  } catch (error) {
    console.error('[AI] parseGeneratedTaskDraft invalid JSON', {
      error: error instanceof Error ? error.message : String(error),
      rawAnswerPreview: rawAnswer.slice(0, 1200)
    });
    throw new Error('ИИ вернул невалидный JSON для генерации задачи');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('ИИ вернул неверный формат задачи');
  }
  const source = parsed as Record<string, unknown>;
  const title = typeof source.title === 'string' ? source.title.trim().slice(0, 180) : '';
  const description = typeof source.description === 'string' ? source.description.trim().slice(0, 4000) : '';
  let firstAssistantMessage = typeof source.firstAssistantMessage === 'string'
    ? source.firstAssistantMessage.trim().slice(0, 6000)
    : '';
  if (/^\s*я\b/i.test(firstAssistantMessage)) {
    firstAssistantMessage = FIRST_ASSISTANT_FALLBACK;
  }
  const dueDate = typeof source.dueDate === 'string' && source.dueDate.trim()
    ? source.dueDate.trim()
    : null;
  const importanceRaw = typeof source.importance === 'number' ? source.importance : Number(source.importance ?? 3);
  const urgencyRaw = typeof source.urgency === 'number' ? source.urgency : Number(source.urgency ?? 3);
  const notifyRaw = source.notifyBeforeMinutes;
  const selectedSphereName = typeof source.selectedSphereName === 'string' && source.selectedSphereName.trim()
    ? source.selectedSphereName.trim().slice(0, 180)
    : null;
  const notifyBeforeMinutes = notifyRaw === null || notifyRaw === undefined
    ? null
    : Math.max(1, Math.round(Number(notifyRaw)));
  const importance = Number.isFinite(importanceRaw) ? Math.max(1, Math.min(5, Math.round(importanceRaw))) : 3;
  const urgency = Number.isFinite(urgencyRaw) ? Math.max(1, Math.min(5, Math.round(urgencyRaw))) : 3;

  const subtasksSource = Array.isArray(source.subtasks) ? source.subtasks : [];
  const subtasks = subtasksSource
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const record = item as Record<string, unknown>;
      const subtaskTitle = typeof record.title === 'string' ? record.title.trim().slice(0, 180) : '';
      const subtaskDescription = typeof record.description === 'string' ? record.description.trim().slice(0, 2000) : '';
      const subtaskDueDate = typeof record.dueDate === 'string' && record.dueDate.trim()
        ? record.dueDate.trim()
        : null;
      if (!subtaskTitle) return null;
      return {
        title: subtaskTitle,
        description: subtaskDescription,
        dueDate: subtaskDueDate
      };
    })
    .filter((item): item is { title: string; description: string; dueDate: string | null } => Boolean(item))
    .slice(0, 12);

  if (!title) {
    throw new Error('ИИ не вернул название задачи');
  }
  if (!firstAssistantMessage) firstAssistantMessage = FIRST_ASSISTANT_FALLBACK;

  return {
    title,
    description,
    dueDate,
    importance,
    urgency,
    notifyBeforeMinutes,
    selectedSphereName,
    subtasks,
    firstAssistantMessage
  };
}

function extractOutputText(response: unknown): string {
  if (typeof response === 'object' && response !== null && 'output_text' in response) {
    const outputText = (response as { output_text?: unknown }).output_text;
    if (typeof outputText === 'string' && outputText.trim()) {
      return outputText.trim();
    }
  }

  if (typeof response === 'object' && response !== null && 'output' in response) {
    const output = (response as { output?: unknown }).output;
    if (Array.isArray(output)) {
      for (const item of output) {
        const contents = typeof item === 'object' && item !== null && 'content' in item
          ? (item as { content?: unknown }).content
          : null;
        if (!Array.isArray(contents)) continue;
        for (const contentPart of contents) {
          const text = typeof contentPart === 'object' && contentPart !== null && 'text' in contentPart
            ? (contentPart as { text?: unknown }).text
            : null;
          if (typeof text === 'string' && text.trim()) {
            return text.trim();
          }
        }
      }
    }
  }

  return '';
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJsonObjectFromText(raw: string): unknown | null {
  const direct = safeJsonParse(raw);
  if (direct !== null) return direct;

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fencedParsed = safeJsonParse(fencedMatch[1].trim());
    if (fencedParsed !== null) return fencedParsed;
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    const parsedCandidate = safeJsonParse(candidate);
    if (parsedCandidate !== null) return parsedCandidate;
  }

  return null;
}

type GeneralAssistantAction =
  | { type: 'reschedule_task'; taskId: string; dueDate: string }
  | { type: 'reschedule_subtask'; subtaskId: string; dueDate: string }
  | { type: 'complete_task'; taskId: string }
  | { type: 'reopen_task'; taskId: string }
  | { type: 'rebalance_today'; taskIds?: string[] }
  | {
    type: 'create_task';
    title: string;
    description?: string;
    dueDate?: string | null;
    importance?: number;
    urgency?: number;
    notifyBeforeMinutes?: number | null;
    sphereId?: string | null;
    subtasks?: Array<{ title: string; description?: string; dueDate?: string | null }>;
  }
  | {
    type: 'create_subtask';
    parentTaskId: string;
    title: string;
    description?: string;
    dueDate?: string | null;
  }
  | { type: 'rename_task'; taskId: string; title: string }
  | { type: 'update_task'; taskId: string; title?: string; description?: string; dueDate?: string | null; importance?: number; urgency?: number; notifyBeforeMinutes?: number | null }
  | { type: 'rename_subtask'; subtaskId: string; title: string }
  | { type: 'update_subtask'; subtaskId: string; description?: string; dueDate?: string | null }
  | { type: 'complete_subtask'; subtaskId: string }
  | { type: 'reopen_subtask'; subtaskId: string }
  | { type: 'delete_task'; taskId: string }
  | { type: 'delete_subtask'; subtaskId: string }
  | { type: 'change_task_sphere'; taskId: string; sphereId: string | null };

function parseGeneralAssistantPayload(rawAnswer: string): { answer: string; actions: GeneralAssistantAction[] } {
  const parsed = extractJsonObjectFromText(rawAnswer);
  if (parsed === null) {
    return {
      answer: rawAnswer.trim(),
      actions: []
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { answer: rawAnswer.trim(), actions: [] };
  }

  const source = parsed as Record<string, unknown>;
  const answer = typeof source.answer === 'string' && source.answer.trim()
    ? source.answer.trim().slice(0, 6000)
    : rawAnswer.trim().slice(0, 6000);
  const actions = Array.isArray(source.actions) ? source.actions : [];
  const normalizedActions = actions
    .map((action): GeneralAssistantAction | null => {
      if (typeof action !== 'object' || action === null) return null;
      const value = action as Record<string, unknown>;
      const type = typeof value.type === 'string' ? value.type : '';
      if (type === 'reschedule_task') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        const dueDate = typeof value.dueDate === 'string' ? value.dueDate.trim() : '';
        if (!taskId || !dueDate) return null;
        return { type, taskId, dueDate };
      }
      if (type === 'reschedule_subtask') {
        const subtaskId = typeof value.subtaskId === 'string' ? value.subtaskId.trim() : '';
        const dueDate = typeof value.dueDate === 'string' ? value.dueDate.trim() : '';
        if (!subtaskId || !dueDate) return null;
        return { type, subtaskId, dueDate };
      }
      if (type === 'complete_task' || type === 'reopen_task') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        if (!taskId) return null;
        return { type, taskId };
      }
      if (type === 'rename_task') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        const title = typeof value.title === 'string' ? value.title.trim() : '';
        if (!taskId || !title) return null;
        return { type, taskId, title };
      }
      if (type === 'update_task') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        if (!taskId) return null;
        const title = typeof value.title === 'string' ? value.title.trim() : undefined;
        const description = typeof value.description === 'string' ? value.description.trim() : undefined;
        const dueDate = typeof value.dueDate === 'string' && value.dueDate.trim() ? value.dueDate.trim() : value.dueDate === null ? null : undefined;
        const importance = typeof value.importance === 'number' ? value.importance : Number(value.importance);
        const urgency = typeof value.urgency === 'number' ? value.urgency : Number(value.urgency);
        const notifyRaw = value.notifyBeforeMinutes;
        const notifyBeforeMinutes = notifyRaw === null || notifyRaw === undefined ? notifyRaw : Number(notifyRaw);
        return {
          type,
          taskId,
          title,
          description,
          dueDate,
          importance: Number.isFinite(importance) ? importance : undefined,
          urgency: Number.isFinite(urgency) ? urgency : undefined,
          notifyBeforeMinutes: notifyBeforeMinutes === null || notifyBeforeMinutes === undefined || Number.isFinite(notifyBeforeMinutes)
            ? notifyBeforeMinutes
            : undefined
        };
      }
      if (type === 'rename_subtask') {
        const subtaskId = typeof value.subtaskId === 'string' ? value.subtaskId.trim() : '';
        const title = typeof value.title === 'string' ? value.title.trim() : '';
        if (!subtaskId || !title) return null;
        return { type, subtaskId, title };
      }
      if (type === 'update_subtask') {
        const subtaskId = typeof value.subtaskId === 'string' ? value.subtaskId.trim() : '';
        if (!subtaskId) return null;
        return {
          type,
          subtaskId,
          description: typeof value.description === 'string' ? value.description.trim() : undefined,
          dueDate: typeof value.dueDate === 'string' && value.dueDate.trim() ? value.dueDate.trim() : value.dueDate === null ? null : undefined
        };
      }
      if (type === 'complete_subtask' || type === 'reopen_subtask') {
        const subtaskId = typeof value.subtaskId === 'string' ? value.subtaskId.trim() : '';
        if (!subtaskId) return null;
        return { type, subtaskId };
      }
      if (type === 'delete_task') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        if (!taskId) return null;
        return { type, taskId };
      }
      if (type === 'delete_subtask') {
        const subtaskId = typeof value.subtaskId === 'string' ? value.subtaskId.trim() : '';
        if (!subtaskId) return null;
        return { type, subtaskId };
      }
      if (type === 'change_task_sphere') {
        const taskId = typeof value.taskId === 'string' ? value.taskId.trim() : '';
        if (!taskId) return null;
        const sphereId = value.sphereId === null ? null : typeof value.sphereId === 'string' ? value.sphereId.trim() : '';
        if (sphereId !== null && !sphereId) return null;
        return { type, taskId, sphereId };
      }
      if (type === 'rebalance_today') {
        const taskIds = Array.isArray(value.taskIds)
          ? value.taskIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
          : undefined;
        return { type, taskIds };
      }
      if (type === 'create_task') {
        const title = typeof value.title === 'string' ? value.title.trim() : '';
        if (!title) return null;
        const description = typeof value.description === 'string' ? value.description.trim() : '';
        const dueDate = typeof value.dueDate === 'string' && value.dueDate.trim() ? value.dueDate.trim() : null;
        const importance = typeof value.importance === 'number' ? value.importance : Number(value.importance);
        const urgency = typeof value.urgency === 'number' ? value.urgency : Number(value.urgency);
        const notifyBeforeMinutesRaw = value.notifyBeforeMinutes;
        const notifyBeforeMinutes = notifyBeforeMinutesRaw === null || notifyBeforeMinutesRaw === undefined
          ? null
          : Number(notifyBeforeMinutesRaw);
        const sphereId = value.sphereId === null || value.sphereId === undefined
          ? null
          : typeof value.sphereId === 'string'
            ? value.sphereId.trim()
            : null;
        const subtasks = Array.isArray(value.subtasks)
          ? value.subtasks
            .map((subtask) => {
              if (typeof subtask !== 'object' || subtask === null) return null;
              const source = subtask as Record<string, unknown>;
              const subtaskTitle = typeof source.title === 'string' ? source.title.trim() : '';
              if (!subtaskTitle) return null;
              return {
                title: subtaskTitle,
                description: typeof source.description === 'string' ? source.description.trim() : '',
                dueDate: typeof source.dueDate === 'string' && source.dueDate.trim() ? source.dueDate.trim() : null
              };
            })
            .filter((subtask): subtask is { title: string; description: string; dueDate: string | null } => Boolean(subtask))
            .slice(0, 12)
          : [];

        return {
          type,
          title,
          description,
          dueDate,
          importance: Number.isFinite(importance) ? importance : undefined,
          urgency: Number.isFinite(urgency) ? urgency : undefined,
          notifyBeforeMinutes: notifyBeforeMinutes === null || Number.isFinite(notifyBeforeMinutes) ? notifyBeforeMinutes : undefined,
          sphereId: sphereId && sphereId.length > 0 ? sphereId : null,
          subtasks
        };
      }
      if (type === 'create_subtask') {
        const parentTaskId = typeof value.parentTaskId === 'string' ? value.parentTaskId.trim() : '';
        const title = typeof value.title === 'string' ? value.title.trim() : '';
        if (!parentTaskId || !title) return null;
        return {
          type,
          parentTaskId,
          title,
          description: typeof value.description === 'string' ? value.description.trim() : '',
          dueDate: typeof value.dueDate === 'string' && value.dueDate.trim() ? value.dueDate.trim() : null
        };
      }
      return null;
    })
    .filter((action): action is GeneralAssistantAction => Boolean(action))
    .slice(0, 8);

  return { answer, actions: normalizedActions };
}

function formatGeneralTasksContext(tasks: Array<{
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: string;
  sphere?: { id: string; name: string } | null;
  subtasks: Array<{ id: string; title: string; description: string | null; dueDate: Date | null; status: string }>;
}>): string {
  if (tasks.length === 0) return 'Задач нет.';
  return tasks
    .map((task, index) => {
      const subtasksText = task.subtasks.length
        ? task.subtasks.map((subtask) => (
          `    - [${subtask.id}] ${subtask.title}; статус=${subtask.status}; дедлайн=${subtask.dueDate ? subtask.dueDate.toISOString() : 'нет'}; описание=${subtask.description ?? 'нет'}`
        )).join('\n')
        : '    - нет подзадач';
      return [
        `${index + 1}. [${task.id}] ${task.title}`,
        `   статус=${task.status}; дедлайн=${task.dueDate ? task.dueDate.toISOString() : 'нет'}`,
        `   сектор=${task.sphere?.name ?? 'без сектора'}`,
        `   описание=${task.description ?? 'нет'}`,
        '   подзадачи:',
        subtasksText
      ].join('\n');
    })
    .join('\n');
}

function normalizeAttachments(attachments: ChatAttachment[] | undefined): ChatAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) =>
      attachment
      && typeof attachment.name === 'string'
      && typeof attachment.mimeType === 'string'
      && typeof attachment.contentBase64 === 'string'
      && typeof attachment.size === 'number')
    .slice(0, MAX_ATTACHMENTS);
}

function resolveAttachmentMimeType(attachment: ChatAttachment): string {
  const normalizedMime = attachment.mimeType?.trim();
  if (normalizedMime) return normalizedMime;

  const extension = attachment.name.split('.').pop()?.toLowerCase();
  if (!extension) return 'application/octet-stream';

  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (extension === 'xls') return 'application/vnd.ms-excel';
  if (extension === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';

  return 'application/octet-stream';
}

function toInputPart(attachment: ChatAttachment): { type: 'input_file'; filename: string; file_data: string } | { type: 'input_image'; image_url: string } {
  const buffer = Buffer.from(attachment.contentBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error(`Файл "${attachment.name}" пустой или повреждён.`);
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Файл "${attachment.name}" превышает лимит ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB.`);
  }

  const normalizedName = attachment.name.toLowerCase();
  const mimeType = resolveAttachmentMimeType(attachment);
  const isPdf = mimeType === 'application/pdf' || normalizedName.endsWith('.pdf');
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || normalizedName.endsWith('.docx');
  const isXls = mimeType === 'application/vnd.ms-excel' || normalizedName.endsWith('.xls');
  const isXlsx = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || normalizedName.endsWith('.xlsx');
  const isPng = mimeType === 'image/png' || normalizedName.endsWith('.png');
  const isJpeg = mimeType === 'image/jpeg' || normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg');
  const isWebp = mimeType === 'image/webp' || normalizedName.endsWith('.webp');
  const isGif = mimeType === 'image/gif' || normalizedName.endsWith('.gif');

  if (isPng || isJpeg || isWebp || isGif) {
    return {
      type: 'input_image',
      image_url: `data:${mimeType};base64,${attachment.contentBase64}`
    };
  }

  if (isPdf || isDocx || isXls || isXlsx) {
    return {
      type: 'input_file',
      filename: attachment.name,
      file_data: `data:${mimeType};base64,${attachment.contentBase64}`
    };
  }

  throw new Error(`Формат файла "${attachment.name}" не поддерживается. Разрешены PDF, DOCX, XLS/XLSX, PNG, JPG, WEBP и GIF.`);
}

function buildAttachmentsPromptMessage(attachments: ChatAttachment[] | undefined): OpenAiUserAttachmentMessage | null {
  const normalizedAttachments = normalizeAttachments(attachments);
  if (normalizedAttachments.length === 0) {
    return null;
  }

  return {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: 'К задаче прикреплены вспомогательные файлы и/или изображения. Проанализируй содержимое каждого вложения и учитывай его как часть контекста.'
      },
      ...normalizedAttachments.map(toInputPart)
    ]
  };
}

function resolveModelCandidates(mode: AskTaskAssistantInput['mode'], hasAttachments: boolean): string[] {
  if (hasAttachments) {
    if (mode === 'smart') {
      return Array.from(new Set([FULL_MODEL, ATTACHMENTS_MODEL].filter(Boolean)));
    }
    return Array.from(new Set([ATTACHMENTS_MODEL].filter(Boolean)));
  }

  if (mode === 'smart') {
    return Array.from(new Set([FULL_MODEL, ...SMART_MODEL_FALLBACKS].filter(Boolean)));
  }

  return [FAST_MODEL];
}

export const aiAssistantService = {
  async parseRecurrence(input: { text: string; userTimeZone?: string }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    const model = FAST_MODEL;
    const now = new Date();
    const userTimeZone = input.userTimeZone || MOSCOW_TIMEZONE;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: 'Верни строго JSON без markdown: {"summary":"...","schedule":{"rrule":"...","timezone":"...","until":"ISO|null"}}. Если срок не указан, until=null.' },
          { role: 'user', content: `Сейчас UTC: ${now.toISOString()}. Таймзона пользователя: ${userTimeZone}. Текст повторения: ${input.text}` }
        ]
      })
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const raw = extractOutputText(await response.json());
    if (!raw) throw new Error('Empty AI response');
    const parsed = JSON.parse(raw) as { summary?: string; schedule?: { rrule?: string; timezone?: string; until?: string | null } };
    return {
      summary: parsed.summary ?? 'Повторение настроено.',
      schedule: {
        rrule: parsed.schedule?.rrule ?? '',
        timezone: parsed.schedule?.timezone ?? userTimeZone,
        until: parsed.schedule?.until ?? null
      },
      model
    };
  },
  async generateDailyCheckup(input: { userId: string }) {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { timeZone: true } });
    const userTimeZone = user?.timeZone || MOSCOW_TIMEZONE;
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: userTimeZone }));
    const todayStartLocal = new Date(localNow);
    todayStartLocal.setHours(0, 0, 0, 0);
    const todayEndLocal = new Date(localNow);
    todayEndLocal.setHours(23, 59, 59, 999);
    const shiftMs = localNow.getTime() - now.getTime();
    const todayStart = new Date(todayStartLocal.getTime() - shiftMs);
    const todayEnd = new Date(todayEndLocal.getTime() - shiftMs);
    const formatSlot = (value: Date | null) => {
      if (!value) return 'Без времени';
      return value.toLocaleTimeString('ru-RU', { timeZone: userTimeZone, hour: '2-digit', minute: '2-digit' });
    };
    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const suggestTaskHelp = (title: string) => {
      const normalized = title.toLowerCase();
      if (/распис|график|план/.test(normalized)) {
        return 'могу собрать удобное расписание с приоритетами и окнами времени, если пришлёте длительность задач и жёсткие дедлайны.';
      }
      if (/продаж|продать|анонс|продвиж|маркет|реклам/.test(normalized)) {
        return 'могу подготовить оффер, короткие тексты для анонсов и скрипт общения с клиентом под вашу аудиторию, если дадите УТП и площадку размещения.';
      }
      if (/обуч|инструк|сотрудник|работник/.test(normalized)) {
        return 'могу составить пошаговую инструкцию и чек-лист обучения, если пришлёте цель обучения и текущие ошибки команды.';
      }
      if (/квест|задани|сценар|иде[яй]/.test(normalized)) {
        return 'могу предложить 3–5 вариантов сценария и готовые формулировки заданий, если уточните возраст, длительность и ограничения.';
      }
      if (/музе|экскурс|vr|мастер-класс|программ/.test(normalized)) {
        return 'могу подготовить структуру программы, тексты для ведущего и блок ответов на частые вопросы, если пришлёте формат мероприятия и целевую аудиторию.';
      }
      if (/таблич|макет|дизайн|говорител|социальн/.test(normalized)) {
        return 'могу оформить понятный черновик текста и критерии проверки качества перед запуском, если пришлёте исходники и требования.';
      }
      return 'могу разбить задачу на конкретные шаги, оценить приоритет и подготовить рабочий черновик, если пришлёте ожидаемый результат и дедлайн.';
    };

    const tasks = await prisma.task.findMany({
      where: {
        userId: input.userId,
        parentTaskId: null,
        status: { not: 'DONE' },
        dueDate: { gte: todayStart, lte: todayEnd }
      },
      include: {
        subtasks: {
          where: {
            status: { not: 'DONE' },
            dueDate: { gte: todayStart, lte: todayEnd }
          },
          select: { id: true, title: true, dueDate: true }
        }
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 50
    });
    const overdueTasks = await prisma.task.findMany({
      where: {
        userId: input.userId,
        parentTaskId: null,
        status: { not: 'DONE' },
        dueDate: { lt: todayStart }
      },
      include: {
        subtasks: {
          where: {
            status: { not: 'DONE' }
          },
          select: { id: true }
        }
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 20
    });
    const totalSubtasks = tasks.reduce((sum, task) => sum + task.subtasks.length, 0);
    const timelineItems = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      load: task.subtasks.length + Math.max(1, task.importance + task.urgency - 4)
    }));
    const slotMap = new Map<string, typeof timelineItems>();
    for (const item of timelineItems) {
      const key = formatSlot(item.dueDate);
      const list = slotMap.get(key) ?? [];
      list.push(item);
      slotMap.set(key, list);
    }

    const nowPlus3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const nearestThreeHours = tasks.filter((task) => !!task.dueDate && task.dueDate >= now && task.dueDate <= nowPlus3h);
    const daytimeTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const hour = Number(task.dueDate.toLocaleString('en-US', { timeZone: userTimeZone, hour: '2-digit', hour12: false }));
      return hour >= 12 && hour < 18;
    });
    const eveningTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const hour = Number(task.dueDate.toLocaleString('en-US', { timeZone: userTimeZone, hour: '2-digit', hour12: false }));
      return hour >= 18 && hour <= 23;
    });

    const lines = [
      '🌤️ Утренний ИИ-чек-ап',
      `📌 Задач на сегодня: ${tasks.length}`,
      `🧩 Подзадач на сегодня: ${totalSubtasks}`,
      '',
      'Таймлайн на сегодня:',
      'Задачи на ближайшие 3 часа:'
    ];
    if (nearestThreeHours.length === 0) {
      lines.push('— Нет задач в ближайшие 3 часа.');
    } else {
      nearestThreeHours.forEach((task, index) => {
        lines.push(`${index + 1}. ${formatSlot(task.dueDate)} — ${escapeHtml(task.title)} (подзадач: ${task.subtasks.length})`);
      });
    }
    lines.push('', 'Задачи днём:');
    if (daytimeTasks.length === 0) {
      lines.push('— Днём задач не запланировано.');
    } else {
      daytimeTasks.forEach((task, index) => {
        lines.push(`${index + 1}. ${formatSlot(task.dueDate)} — ${escapeHtml(task.title)} (подзадач: ${task.subtasks.length})`);
      });
    }
    lines.push('', 'Задачи на вечер:');
    if (eveningTasks.length === 0) {
      lines.push('— На вечер задач не запланировано.');
    } else {
      eveningTasks.forEach((task, index) => {
        lines.push(`${index + 1}. ${formatSlot(task.dueDate)} — ${escapeHtml(task.title)} (подзадач: ${task.subtasks.length})`);
      });
    }

    if (tasks.length === 0) {
      lines.push('', '— На сегодня активных задач нет. Можно запланировать день заранее ✨');
    }

    lines.push('', 'Точки пересечения:');
    const overlaps = Array.from(slotMap.entries()).filter(([, items]) => items.length > 1 && items[0]?.dueDate);
    if (overlaps.length === 0) {
      lines.push('— Пересечений по одинаковому времени не найдено.');
    } else {
      overlaps.forEach(([slot, items]) => {
        lines.push(`— ${slot}: ${items.map((item) => escapeHtml(item.title)).join(', ')}`);
      });
    }

    const heavySlots = Array.from(slotMap.entries())
      .map(([slot, items]) => ({ slot, items, totalLoad: items.reduce((sum, item) => sum + item.load, 0) }))
      .filter((entry) => entry.items.length >= 3 || entry.totalLoad >= 14)
      .sort((a, b) => b.totalLoad - a.totalLoad);

    lines.push('', 'Где перегруз:');
    if (heavySlots.length === 0) {
      lines.push('— Критичных перегрузов по времени не видно.');
    } else {
      heavySlots.forEach((entry) => {
        lines.push(`— ${entry.slot}: ${entry.items.length} задач(и), суммарная нагрузка ${entry.totalLoad}.`);
      });
      const freeSlots = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'].filter((slot) => !slotMap.has(slot));
      const topHeavy = heavySlots[0];
      const movable = [...topHeavy.items]
        .sort((a, b) => a.load - b.load)
        .slice(0, Math.min(2, freeSlots.length));
      if (movable.length > 0) {
        lines.push('— Рекомендация по выравниванию:');
        movable.forEach((item, index) => {
          lines.push(`  • Перенести ${escapeHtml(item.title)} из ${topHeavy.slot} на ${freeSlots[index]}.`);
        });
      }
    }

    lines.push('', 'Просроченные задачи:');
    if (overdueTasks.length === 0) {
      lines.push('— Просроченных задач нет.');
    } else {
      lines.push(`— Всего просроченных задач: ${overdueTasks.length}.`);
      overdueTasks.slice(0, 5).forEach((task, index) => {
        lines.push(`${index + 1}. ${formatSlot(task.dueDate)} — ${escapeHtml(task.title)} (подзадач: ${task.subtasks.length})`);
      });
      if (overdueTasks.length > 5) {
        lines.push(`— И ещё ${overdueTasks.length - 5} просроченных задач(и).`);
      }
    }

    lines.push('', 'Где ИИ особенно поможет:');
    if (tasks.length === 0) {
      if (overdueTasks.length === 0) {
        lines.push('— Пока нет задач на сегодня и просроченных задач, где нужна помощь ИИ.');
      } else {
        overdueTasks
          .slice(0, 3)
          .forEach((task) => {
            lines.push(`— ${escapeHtml(task.title)}: ${suggestTaskHelp(task.title)}`);
          });
      }
    } else {
      const candidates = [...tasks]
        .sort((a, b) => (b.subtasks.length + b.importance + b.urgency) - (a.subtasks.length + a.importance + a.urgency))
        .slice(0, 3);
      candidates.forEach((task) => {
        lines.push(`— ${escapeHtml(task.title)}: ${suggestTaskHelp(task.title)}`);
      });
    }
    lines.push('', '💬 Чтобы ответить ИИ или попросить его о чём-то, нажмите кнопку «Общий чат с ИИ».');
    return lines.join('\n');
  },
  transcribeAudio: async (input: TranscribeAudioInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const binary = Buffer.from(input.contentBase64, 'base64');
    if (binary.byteLength === 0) {
      throw new Error('Пустой аудиофайл для расшифровки');
    }

    const formData = new FormData();
    formData.append('file', new Blob([binary], { type: input.mimeType || 'audio/ogg' }), input.fileName || `voice-${Date.now()}.ogg`);
    formData.append('model', process.env.OPENAI_AUDIO_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe');
    formData.append('language', 'ru');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Не удалось расшифровать голосовое (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const payload = await response.json() as { text?: unknown };
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      throw new Error('Расшифровка голосового вернула пустой текст');
    }

    return text;
  },

  listTaskDialog: async (input: { userId: string; taskId: string }): Promise<ChatMessage[]> => {
    await prisma.task.findFirstOrThrow({
      where: { id: input.taskId, userId: input.userId },
      select: { id: true }
    });

    const messages = await prisma.taskAiMessage.findMany({
      where: { taskId: input.taskId, userId: input.userId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true }
    });

    return messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
  },

  appendTaskDialogMessages: async (input: { userId: string; taskId: string; messages: ChatMessage[] }) => {
    const normalizedMessages = normalizeHistory(input.messages);
    if (normalizedMessages.length === 0) {
      return;
    }

    await prisma.task.findFirstOrThrow({
      where: { id: input.taskId, userId: input.userId },
      select: { id: true }
    });

    await prisma.taskAiMessage.createMany({
      data: normalizedMessages.map((message) => ({
        taskId: input.taskId,
        userId: input.userId,
        role: message.role,
        content: message.content
      }))
    });
  },

  listGeneralDialog: async (input: { userId: string; since?: Date; userTimeZone?: string }): Promise<ChatMessage[]> => {
    const messages = await prisma.generalAiMessage.findMany({
      where: {
        userId: input.userId,
        ...(input.since ? { createdAt: { gte: input.since } } : {})
      },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true }
    });

    return messages.map((message) => ({
      role: message.role,
      content: message.content
    }));
  },

  appendGeneralDialogMessages: async (input: { userId: string; messages: ChatMessage[] }) => {
    const normalizedMessages = normalizeGeneralPersistedHistory(input.messages);
    if (normalizedMessages.length === 0) {
      return;
    }

    await prisma.generalAiMessage.createMany({
      data: normalizedMessages.map((message) => ({
        userId: input.userId,
        role: message.role,
        content: message.content
      }))
    });
  },

  askTaskAssistant: async (input: AskTaskAssistantInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const task = await prisma.task.findFirstOrThrow({
      where: { id: input.taskId, userId: input.userId },
      include: {
        sphere: {
          select: {
            id: true,
            name: true
          }
        },
        subtasks: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            status: true
          },
          orderBy: { createdAt: 'asc' }
        },
        attachments: {
          select: {
            name: true,
            mimeType: true,
            size: true,
            contentBase64: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const history = normalizeHistory(input.history);
    const question = input.question.trim();
    if (!question) {
      throw new TypeError('Question is required');
    }

    const userTimeZone = input.userTimeZone || MOSCOW_TIMEZONE;
    const isSmartPostponeRequest = question.includes('SMART_POSTPONE_REQUEST');
    const now = new Date();
    const systemPrompt = [
      'Ты ИИ-помощник в задачнике Bubble Task Manager.',
      'Твоя роль — помогать пользователю выполнять конкретную задачу: планировать, разбивать на шаги, снимать блокеры, предлагать приоритеты и практичные действия.',
      'Отвечай на русском языке, по делу, в дружелюбном тоне.',
      'Опирайся на контекст задачи и подзадач. Если информации недостаточно, задай уточняющий вопрос.',
      'Пиши предельно экономно: коротко, сухо, по делу.',
      'Без длинных вступлений, повторов и лишних пояснений.',
      'По умолчанию давай 3-6 коротких пунктов или 2-4 предложения.',
      'Если вопрос простой — отвечай одной короткой репликой.',
      'Если тема сложная — только ключевые шаги и конкретные действия.',
      'Для любых вычислений времени используй часовой пояс пользователя из контекста.',
      'Ты можешь менять только текущую задачу и её подзадачи через actions.',
      'Никогда не показывай пользователю технические идентификаторы (taskId, subtaskId, UUID). В тексте answer упоминай только понятные названия задач и подзадач.',
      'Верни строго JSON без markdown: {"answer":"...","actions":[...]}',
      'Поддерживаемые action.type: reschedule_task (taskId, dueDate ISO), reschedule_subtask (subtaskId, dueDate ISO), create_subtask (parentTaskId, title, description?, dueDate?), rename_task (taskId, title), update_task (taskId, description?, importance?, urgency?, notifyBeforeMinutes?), rename_subtask (subtaskId, title), update_subtask (subtaskId, description?, dueDate?), complete_subtask (subtaskId), reopen_subtask (subtaskId), delete_subtask (subtaskId), change_task_sphere (taskId, sphereId|null).',
      `Для taskId используй только ${task.id}. Для parentTaskId используй только ${task.id}.`,
      'Текст пользователю пиши только в answer.'
    ].join(' ');

    const taskContext = formatTaskContext(task);
    const attachmentsMessage = buildAttachmentsPromptMessage([...(task.attachments ?? []), ...(input.attachments ?? [])]);
    const hasAttachments = Boolean(attachmentsMessage);
    const trimmedHistory = trimHistoryForAttachments(history, hasAttachments);
    const messages: Array<OpenAiTextMessage | OpenAiUserAttachmentMessage> = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Текущая дата и время (UTC): ${now.toISOString()}.`,
          `Локальная дата и время пользователя: ${now.toLocaleString('ru-RU', { timeZone: userTimeZone })} (${formatTimeZoneLabel(userTimeZone)}).`
        ].join('\n')
      },
      { role: 'user', content: `Контекст задачи:\n${taskContext}` },
      ...trimmedHistory,
      ...(attachmentsMessage ? [attachmentsMessage] : []),
      { role: 'user', content: question }
    ];

    const requestId = randomUUID();
    const reasoningEffort = resolveReasoningEffort(input.mode);
    const modelCandidates = resolveModelCandidates(input.mode, hasAttachments);

    console.info('[AI] Starting OpenAI request', {
      requestId,
      mode: input.mode ?? 'fast',
      models: modelCandidates,
      hasAttachments,
      taskId: input.taskId,
      userId: input.userId,
      questionLength: question.length,
      historyLength: history.length,
      historyLengthUsed: trimmedHistory.length,
      isSmartPostponeRequest
    });

    let lastError: Error | null = null;
    const modelAttemptErrors: Array<{ model: string; status: number | 'exception' | 'empty_response'; message: string }> = [];

    for (const model of modelCandidates) {
      try {
        const startedAt = Date.now();
        console.info('[AI] Sending OpenAI request', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          taskId: input.taskId,
          userId: input.userId
        });

        const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            input: messages,
            ...(supportsReasoningEffort(model) ? { reasoning: { effort: reasoningEffort } } : {})
          })
        });
        const latencyMs = Date.now() - startedAt;

        console.info('[AI] OpenAI response received', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          status: openAiResponse.status,
          ok: openAiResponse.ok,
          latencyMs,
          taskId: input.taskId,
          userId: input.userId
        });

        if (!openAiResponse.ok) {
          const errorText = await openAiResponse.text();
          console.error('[AI] OpenAI request failed', {
            requestId,
            mode: input.mode ?? 'fast',
            model,
            status: openAiResponse.status,
            taskId: input.taskId,
            userId: input.userId,
            errorText: errorText.slice(0, 2000)
          });

          const errorMessage = `OpenAI request failed for model "${model}": ${openAiResponse.status}`;
          modelAttemptErrors.push({
            model,
            status: openAiResponse.status,
            message: `${errorMessage}. ${sanitizeUpstreamErrorText(errorText)}`
          });
          lastError = new Error(errorMessage);
          if (model === FULL_MODEL && modelCandidates.length > 1) {
            console.warn('[AI] primary model failed, trying fallback', {
              requestId,
              mode: input.mode ?? 'fast',
              primaryModel: FULL_MODEL,
              fallbackModels: modelCandidates.slice(1),
              taskId: input.taskId,
              userId: input.userId
            });
          }
          continue;
        }

        const responseJson = await openAiResponse.json();
        const rawAnswer = extractOutputText(responseJson);
        if (!rawAnswer) {
          console.error('[AI] OpenAI returned empty response', {
            requestId,
            mode: input.mode ?? 'fast',
            model,
            taskId: input.taskId,
            userId: input.userId,
            responseJson
          });

          const errorMessage = `OpenAI returned empty response for model "${model}"`;
          modelAttemptErrors.push({
            model,
            status: 'empty_response',
            message: errorMessage
          });
          lastError = new Error(errorMessage);
          if (model === FULL_MODEL && modelCandidates.length > 1) {
            console.warn('[AI] primary model failed, trying fallback', {
              requestId,
              mode: input.mode ?? 'fast',
              primaryModel: FULL_MODEL,
              fallbackModels: modelCandidates.slice(1),
              taskId: input.taskId,
              userId: input.userId
            });
          }
          continue;
        }

        if (input.mode === 'smart' && model !== FULL_MODEL) {
          console.warn('[AI] Smart mode fallback model used', {
            requestId,
            requestedModel: FULL_MODEL,
            actualModel: model,
            taskId: input.taskId,
            userId: input.userId
          });
        }

        console.info('[AI] OpenAI response parsed successfully', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          answerLength: rawAnswer.length,
          taskId: input.taskId,
          userId: input.userId
        });

        const parsed = parseGeneralAssistantPayload(rawAnswer);
        if (isSmartPostponeRequest) {
          const rawJsonMatch = parsed.answer.match(/\{[\s\S]*\}/);
          let parsedDueDate: string | null = null;
          let parsedDueDateValid = false;
          if (rawJsonMatch) {
            try {
              const candidate = JSON.parse(rawJsonMatch[0]) as { dueDate?: string };
              if (candidate?.dueDate) {
                parsedDueDate = candidate.dueDate;
                parsedDueDateValid = !Number.isNaN(new Date(candidate.dueDate).getTime());
              }
            } catch {
              // no-op diagnostic branch
            }
          }
          console.info('[AI] Smart postpone diagnostic', {
            requestId,
            model,
            taskId: input.taskId,
            userId: input.userId,
            answerPreview: parsed.answer.slice(0, 280),
            hasJsonObjectInAnswer: Boolean(rawJsonMatch),
            parsedDueDate,
            parsedDueDateValid,
            actionsCount: parsed.actions.length
          });
        }
        console.info('[AI] Parsed task assistant payload', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          taskId: input.taskId,
          userId: input.userId,
          actionsCount: parsed.actions.length,
          answerLength: parsed.answer.length,
          actions: parsed.actions
        });
        const actionReports: string[] = [];
        let appliedActionsCount = 0;
        for (const action of parsed.actions) {
          console.info('[AI] Applying task action', {
            requestId,
            mode: input.mode ?? 'fast',
            model,
            taskId: input.taskId,
            userId: input.userId,
            action
          });
          if (action.type === 'reschedule_task') {
            if (action.taskId !== task.id) {
              actionReports.push('Перенос задачи пропущен: action.taskId не совпадает с текущей задачей.');
              continue;
            }
            const nextDueDate = new Date(action.dueDate);
            if (Number.isNaN(nextDueDate.getTime())) {
              actionReports.push('Перенос задачи пропущен: неверный формат даты.');
              continue;
            }
            await prisma.task.update({ where: { id: task.id }, data: { dueDate: nextDueDate } });
            actionReports.push(`Перенёс задачу "${task.title}" на ${nextDueDate.toLocaleString('ru-RU', { timeZone: input.userTimeZone || MOSCOW_TIMEZONE })}.`);
            appliedActionsCount += 1;
            console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type });
            continue;
          }
          if (action.type === 'rename_task') {
            if (action.taskId !== task.id) {
              actionReports.push('Переименование задачи пропущено: action.taskId не совпадает с текущей задачей.');
              continue;
            }
            await prisma.task.update({ where: { id: task.id }, data: { title: action.title.slice(0, 180) } });
            actionReports.push(`Переименовал задачу "${task.title}".`);
            appliedActionsCount += 1;
            console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type });
            continue;
          }
          if (action.type === 'update_task') {
            if (action.taskId !== task.id) {
              actionReports.push('Обновление задачи пропущено: action.taskId не совпадает с текущей задачей.');
              continue;
            }
            const dueDate = action.dueDate === undefined ? undefined : action.dueDate === null ? null : new Date(action.dueDate);
            if (dueDate instanceof Date && Number.isNaN(dueDate.getTime())) {
              actionReports.push('Обновление задачи пропущено: неверный формат dueDate.');
              continue;
            }
            const nextImportance = action.importance !== undefined ? Math.max(1, Math.min(5, Math.round(action.importance))) : undefined;
            const nextUrgency = action.urgency !== undefined ? Math.max(1, Math.min(5, Math.round(action.urgency))) : undefined;
            const importance = nextImportance ?? task.importance;
            const urgency = nextUrgency ?? task.urgency;
            const priorityScore = Number((importance * 0.6 + urgency * 0.4).toFixed(2));
            await prisma.task.update({
              where: { id: task.id },
              data: {
                ...(action.title !== undefined ? { title: action.title.slice(0, 180) } : {}),
                ...(action.description !== undefined ? { description: action.description.slice(0, 4000) } : {}),
                ...(dueDate === undefined ? {} : { dueDate }),
                ...(nextImportance !== undefined ? { importance: nextImportance } : {}),
                ...(nextUrgency !== undefined ? { urgency: nextUrgency } : {}),
                ...(nextImportance !== undefined || nextUrgency !== undefined ? { priorityScore } : {}),
                ...(action.notifyBeforeMinutes !== undefined ? { notifyBeforeMinutes: action.notifyBeforeMinutes === null ? 30 : Math.max(1, Math.round(action.notifyBeforeMinutes)) } : {})
              }
            });
            actionReports.push(`Обновил параметры задачи "${task.title}".`);
            appliedActionsCount += 1;
            console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type });
            continue;
          }
          if (action.type === 'change_task_sphere') {
            if (action.taskId !== task.id) {
              actionReports.push('Смена сектора пропущена: action.taskId не совпадает с текущей задачей.');
              continue;
            }
            if (action.sphereId) {
              const sphere = await prisma.sphere.findFirst({ where: { id: action.sphereId, userId: input.userId }, select: { id: true } });
              if (!sphere) {
                actionReports.push('Смена сектора пропущена: сектор не найден.');
                continue;
              }
            }
            await prisma.task.update({ where: { id: task.id }, data: { sphereId: action.sphereId } });
            actionReports.push(`Изменил сектор задачи "${task.title}".`);
            appliedActionsCount += 1;
            console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type });
            continue;
          }
          if (action.type === 'create_subtask') {
            if (action.parentTaskId !== task.id) {
              actionReports.push('Создание подзадачи пропущено: parentTaskId не совпадает с текущей задачей.');
              continue;
            }
            const dueDate = action.dueDate ? new Date(action.dueDate) : null;
            const subtask = await prisma.task.create({
              data: { title: action.title.slice(0, 180), description: (action.description ?? '').slice(0, 2000), userId: input.userId, parentTaskId: task.id, sphereId: null, importance: 3, urgency: 3, priorityScore: 3, status: 'TODO', dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null, notifyBeforeMinutes: 30 }
            });
            actionReports.push(`Добавил подзадачу "${subtask.title}".`);
            appliedActionsCount += 1;
            console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            continue;
          }
          if ('subtaskId' in action) {
            const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: task.id }, select: { id: true, title: true } });
            if (!subtask) {
              actionReports.push('Действие с подзадачей пропущено: подзадача не найдена в текущей задаче.');
              continue;
            }
            if (action.type === 'reschedule_subtask') {
              const dueDate = new Date(action.dueDate);
              if (Number.isNaN(dueDate.getTime())) {
                actionReports.push(`Перенос подзадачи "${subtask.title}" пропущен: неверная дата.`);
                continue;
              }
              await prisma.task.update({ where: { id: subtask.id }, data: { dueDate } });
              actionReports.push(`Перенёс подзадачу "${subtask.title}".`);
              appliedActionsCount += 1;
              console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            }
            if (action.type === 'rename_subtask') {
              await prisma.task.update({ where: { id: subtask.id }, data: { title: action.title.slice(0, 180) } });
              actionReports.push(`Переименовал подзадачу "${subtask.title}".`);
              appliedActionsCount += 1;
              console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            }
            if (action.type === 'update_subtask') {
              const dueDate = action.dueDate === undefined ? undefined : action.dueDate === null ? null : new Date(action.dueDate);
              if (dueDate instanceof Date && Number.isNaN(dueDate.getTime())) {
                actionReports.push(`Обновление подзадачи "${subtask.title}" пропущено: неверный формат dueDate.`);
                continue;
              }
              await prisma.task.update({ where: { id: subtask.id }, data: { ...(action.description !== undefined ? { description: action.description.slice(0, 2000) } : {}), ...(dueDate === undefined ? {} : { dueDate }) } });
              actionReports.push(`Обновил подзадачу "${subtask.title}".`);
              appliedActionsCount += 1;
              console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            }
            if (action.type === 'delete_subtask') {
              await prisma.task.delete({ where: { id: subtask.id } });
              actionReports.push(`Удалил подзадачу "${subtask.title}".`);
              appliedActionsCount += 1;
              console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            }
            if (action.type === 'complete_subtask' || action.type === 'reopen_subtask') {
              await prisma.task.update({ where: { id: subtask.id }, data: { status: action.type === 'complete_subtask' ? 'DONE' : 'TODO' } });
              actionReports.push(action.type === 'complete_subtask' ? `Отметил подзадачу "${subtask.title}" выполненной.` : `Снова открыл подзадачу "${subtask.title}".`);
              appliedActionsCount += 1;
              console.info('[AI] Task action applied', { requestId, taskId: task.id, actionType: action.type, subtaskId: subtask.id });
            }
            continue;
          }
          actionReports.push(`Действие "${action.type}" не поддерживается в диалоге внутри задачи.`);
        }

        const answer = parsed.actions.length > 0 && appliedActionsCount === 0
          ? `Не удалось применить изменения по запросу. Проверьте формулировку и попробуйте ещё раз.

${parsed.answer}`
          : parsed.answer;

        console.info('[AI] Task assistant request completed', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          taskId: input.taskId,
          userId: input.userId,
          actionsRequested: parsed.actions.length,
          actionsApplied: appliedActionsCount,
          actionReports
        });

        return { model, answer, actionReports };
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error('Unknown OpenAI error');
        lastError = normalizedError;
        modelAttemptErrors.push({
          model,
          status: 'exception',
          message: normalizedError.message
        });

        console.error('[AI] Failed to process OpenAI response', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          taskId: input.taskId,
          userId: input.userId,
          error: normalizedError.message,
          stack: normalizedError.stack
        });

        if (model === FULL_MODEL && modelCandidates.length > 1) {
          console.warn('[AI] primary model failed, trying fallback', {
            requestId,
            mode: input.mode ?? 'fast',
            primaryModel: FULL_MODEL,
            fallbackModels: modelCandidates.slice(1),
            taskId: input.taskId,
            userId: input.userId
          });
        }
      }
    }

    if (input.mode === 'smart' && modelAttemptErrors.length > 0) {
      const attemptsSummary = modelAttemptErrors
        .map((attempt) => `${attempt.model} [${attempt.status}]: ${attempt.message}`)
        .join(' | ');
      throw new Error(`Smart mode failed for all model attempts: ${attemptsSummary}`);
    }

    throw lastError ?? new Error('OpenAI request failed without details');
  },

  askGeneralAssistant: async (input: AskGeneralAssistantInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const question = input.question.trim();
    if (!question) {
      throw new Error('Question is required');
    }

    const tasks = await prisma.task.findMany({
      where: { userId: input.userId },
      include: {
        subtasks: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            status: true
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    const taskContext = formatGeneralTasksContext(tasks);
    const history = normalizeGeneralHistory(input.history);
    const now = new Date();
    const userTimeZone = input.userTimeZone || MOSCOW_TIMEZONE;
    const localNow = now.toLocaleString('ru-RU', { timeZone: userTimeZone });
    const systemPrompt = [
      'Ты справочный ИИ-помощник Bubble Task Manager.',
      'Работаешь только в режиме fast.',
      'Ты не помогаешь выполнять задачи пошагово и не мотивируешь, а даёшь справку по существующим задачам пользователя.',
      'Разрешено: подсчёты, поиск по задачам, дедлайны, статусы, краткие сводки.',
      'Никогда не показывай в ответе технические идентификаторы задач (taskId, внутренние id и т.п.), только названия задач.',
      'Если упоминаешь конкретную задачу/подзадачу из контекста, добавляй сразу после её названия скрытую метку формата [[task_ref:ID|Короткое название]]. Пример: «Проверь отчёт [[task_ref:abc123|Проверь отчёт]]».',
      'В самой фразе для пользователя оставляй только естественный текст, без объяснений формата; метка нужна интерфейсу, чтобы отрисовать кнопку «Посмотреть задачу».',
      'Для подзадачи в task_ref указывай id именно подзадачи, для задачи — id задачи.',
      'Всегда учитывай текущие дату и время из контекста.',
      'Для любых вычислений по времени и для дедлайнов используй часовой пояс пользователя из контекста.',
      'Если пользователь просит summary или список задач, отвечай на русском.',
      'Названия задач в списках и summary указывай на русском (при необходимости переводи естественно, без технических идентификаторов).',
      'Также можно управлять задачами через actions.',
      'Верни строго JSON без markdown: {"answer":"...","actions":[...]}',
      'action.type поддерживаются: reschedule_task (taskId, dueDate ISO), reschedule_subtask (subtaskId, dueDate ISO), complete_task (taskId), reopen_task (taskId), rebalance_today (taskIds опционально), create_task (title, description?, dueDate?, importance?, urgency?, notifyBeforeMinutes?, sphereId?, subtasks?), create_subtask (parentTaskId, title, description?, dueDate?), rename_task (taskId, title), update_task (taskId, description?, importance?, urgency?, notifyBeforeMinutes?), rename_subtask (subtaskId, title), update_subtask (subtaskId, description?, dueDate?), delete_task (taskId), delete_subtask (subtaskId), change_task_sphere (taskId, sphereId|null).',
      'Если действий не нужно — actions: [].',
      'Текст для пользователя клади только в answer на русском.'
    ].join(' ');

    const messages: OpenAiTextMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          `Текущая дата и время (UTC): ${now.toISOString()}.`,
          `Локальная дата и время пользователя: ${localNow} (${formatTimeZoneLabel(userTimeZone)}).`,
          'Считай все сроки и сравнения времени относительно часового пояса пользователя.'
        ].join('\n')
      },
      { role: 'user', content: `Контекст всех задач:\n${taskContext}` },
      { role: 'user', content: `Контекст секторов:\n${(await prisma.sphere.findMany({ where: { userId: input.userId }, orderBy: { createdAt: 'asc' } })).map((sphere) => `- [${sphere.id}] ${sphere.name}`).join('\n') || 'Секторов нет.'}` },
      ...history,
      { role: 'user', content: question }
    ];

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: FAST_MODEL,
        input: messages,
        ...(supportsReasoningEffort(FAST_MODEL) ? { reasoning: { effort: 'low' } } : {})
      })
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      throw new Error(`OpenAI request failed: ${openAiResponse.status}. ${sanitizeUpstreamErrorText(errorText)}`);
    }

    const responseJson = await openAiResponse.json();
    const rawAnswer = extractOutputText(responseJson);
    if (!rawAnswer) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = parseGeneralAssistantPayload(rawAnswer);
    const actionReports: string[] = [];
    const undoOperations: GeneralAssistantUndoOperation[] = [];
    let appliedActionsCount = 0;

    for (const action of parsed.actions) {
      if (action.type === 'rebalance_today') {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        const candidates = await prisma.task.findMany({
          where: {
            userId: input.userId,
            parentTaskId: null,
            status: { not: 'DONE' },
            ...(action.taskIds && action.taskIds.length > 0 ? { id: { in: action.taskIds } } : {}),
            dueDate: { gte: start, lt: end }
          },
          orderBy: { dueDate: 'asc' },
          select: { id: true, title: true, dueDate: true, status: true }
        });
        if (candidates.length < 2) {
          actionReports.push('Равномерное распределение не применено: на сегодня меньше двух активных задач.');
          continue;
        }
        const stepMinutes = Math.max(45, Math.floor((12 * 60) / candidates.length));
        for (let index = 0; index < candidates.length; index += 1) {
          const task = candidates[index];
          const nextDue = new Date(start);
          nextDue.setHours(9, 0, 0, 0);
          nextDue.setMinutes(nextDue.getMinutes() + (stepMinutes * index));
          undoOperations.push({
            taskId: task.id,
            previous: {
              dueDate: task.dueDate ? task.dueDate.toISOString() : null,
              status: task.status as 'TODO' | 'IN_PROGRESS' | 'DONE'
            }
          });
          await prisma.task.update({
            where: { id: task.id },
            data: { dueDate: nextDue }
          });
        }
        actionReports.push(`Распределил задачи на сегодня более равномерно (${candidates.length} шт.).`);
        appliedActionsCount += 1;
        continue;
      }

      if (action.type === 'create_task') {
        const rawImportance = action.importance;
        const rawUrgency = action.urgency;
        const importance = typeof rawImportance === 'number' && Number.isFinite(rawImportance)
          ? Math.max(1, Math.min(5, Math.round(rawImportance)))
          : 3;
        const urgency = typeof rawUrgency === 'number' && Number.isFinite(rawUrgency)
          ? Math.max(1, Math.min(5, Math.round(rawUrgency)))
          : 3;
        const priorityScore = Number((importance * 0.6 + urgency * 0.4).toFixed(2));
        const dueDate = action.dueDate ? new Date(action.dueDate) : null;
        const notifyBeforeMinutes = action.notifyBeforeMinutes === null || action.notifyBeforeMinutes === undefined
          ? 30
          : Math.max(1, Math.round(action.notifyBeforeMinutes));
        const createdTask = await prisma.task.create({
          data: {
            title: action.title.slice(0, 180),
            description: action.description?.slice(0, 4000) || '',
            userId: input.userId,
            sphereId: action.sphereId ?? null,
            importance,
            urgency,
            priorityScore,
            status: 'TODO',
            dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
            notifyBeforeMinutes
          }
        });

        const subtasks = Array.isArray(action.subtasks) ? action.subtasks : [];
        if (subtasks.length > 0) {
          await prisma.$transaction(subtasks.map((subtask) => {
            const subtaskDueDate = subtask.dueDate ? new Date(subtask.dueDate) : null;
            return prisma.task.create({
              data: {
                title: subtask.title.slice(0, 180),
                description: (subtask.description ?? '').slice(0, 2000),
                userId: input.userId,
                parentTaskId: createdTask.id,
                sphereId: null,
                importance: 3,
                urgency: 3,
                priorityScore: 3,
                status: 'TODO',
                dueDate: subtaskDueDate && !Number.isNaN(subtaskDueDate.getTime()) ? subtaskDueDate : null,
                notifyBeforeMinutes: 30
              }
            });
          }));
        }

        actionReports.push(`Создал новую задачу "${createdTask.title}"${subtasks.length > 0 ? ` и ${subtasks.length} подзадач(и)` : ''}.`);
        appliedActionsCount += 1;
        continue;
      }

      if (action.type === 'create_subtask') {
        const parentTask = await prisma.task.findFirst({
          where: { id: action.parentTaskId, userId: input.userId, parentTaskId: null },
          select: { id: true, title: true }
        });
        if (!parentTask) {
          actionReports.push('Добавление подзадачи пропущено: родительская задача не найдена.');
          continue;
        }
        const dueDate = action.dueDate ? new Date(action.dueDate) : null;
        const subtask = await prisma.task.create({
          data: {
            title: action.title.slice(0, 180),
            description: (action.description ?? '').slice(0, 2000),
            userId: input.userId,
            parentTaskId: parentTask.id,
            sphereId: null,
            importance: 3,
            urgency: 3,
            priorityScore: 3,
            status: 'TODO',
            dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
            notifyBeforeMinutes: 30
          }
        });
        actionReports.push(`Добавил подзадачу "${subtask.title}" к задаче "${parentTask.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'delete_subtask') {
        const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: { not: null } }, select: { id: true, title: true } });
        if (!subtask) {
          actionReports.push('Удаление подзадачи пропущено: подзадача не найдена.');
          continue;
        }
        await prisma.task.delete({ where: { id: subtask.id } });
        actionReports.push(`Удалил подзадачу "${subtask.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'rename_subtask') {
        const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: { not: null } }, select: { id: true, title: true } });
        if (!subtask) {
          actionReports.push('Переименование подзадачи пропущено: подзадача не найдена.');
          continue;
        }
        await prisma.task.update({ where: { id: subtask.id }, data: { title: action.title.slice(0, 180) } });
        actionReports.push(`Переименовал подзадачу "${subtask.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'update_subtask') {
        const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: { not: null } }, select: { id: true, title: true } });
        if (!subtask) {
          actionReports.push('Изменение подзадачи пропущено: подзадача не найдена.');
          continue;
        }
        const dueDate = action.dueDate === undefined ? undefined : action.dueDate === null ? null : new Date(action.dueDate);
        await prisma.task.update({
          where: { id: subtask.id },
          data: {
            ...(action.description !== undefined ? { description: action.description.slice(0, 2000) } : {}),
            ...(dueDate === undefined ? {} : { dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null })
          }
        });
        actionReports.push(`Обновил подзадачу "${subtask.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'reschedule_subtask') {
        const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: { not: null } }, select: { id: true, title: true } });
        if (!subtask) {
          actionReports.push('Перенос подзадачи пропущен: подзадача не найдена.');
          continue;
        }
        const dueDate = new Date(action.dueDate);
        if (Number.isNaN(dueDate.getTime())) {
          actionReports.push(`Не удалось перенести подзадачу "${subtask.title}": неверная дата.`);
          continue;
        }
        await prisma.task.update({ where: { id: subtask.id }, data: { dueDate } });
        actionReports.push(`Перенёс подзадачу "${subtask.title}" на ${dueDate.toLocaleString('ru-RU', { timeZone: input.userTimeZone || MOSCOW_TIMEZONE })}.`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'complete_subtask' || action.type === 'reopen_subtask') {
        const subtask = await prisma.task.findFirst({ where: { id: action.subtaskId, userId: input.userId, parentTaskId: { not: null } }, select: { id: true, title: true } });
        if (!subtask) {
          actionReports.push('Изменение статуса подзадачи пропущено: подзадача не найдена.');
          continue;
        }
        await prisma.task.update({
          where: { id: subtask.id },
          data: { status: action.type === 'complete_subtask' ? 'DONE' : 'TODO' }
        });
        actionReports.push(action.type === 'complete_subtask' ? `Отметил подзадачу "${subtask.title}" выполненной.` : `Снова открыл подзадачу "${subtask.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (!('taskId' in action)) {
        actionReports.push('Действие пропущено: нет taskId.');
        continue;
      }

      const task = await prisma.task.findFirst({
        where: { id: action.taskId, userId: input.userId },
        select: { id: true, title: true, dueDate: true, status: true, importance: true, urgency: true }
      });
      if (!task) {
        actionReports.push(`Действие "${action.type}" пропущено: задача не найдена.`);
        continue;
      }
      undoOperations.push({
        taskId: task.id,
        previous: {
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          status: task.status as 'TODO' | 'IN_PROGRESS' | 'DONE'
        }
      });

      if (action.type === 'reschedule_task') {
        const nextDueDate = new Date(action.dueDate);
        if (Number.isNaN(nextDueDate.getTime())) {
          actionReports.push(`Не удалось перенести "${task.title}": неверная дата.`);
          continue;
        }
        await prisma.task.update({
          where: { id: task.id },
          data: { dueDate: nextDueDate }
        });
        actionReports.push(`Перенёс задачу "${task.title}" на ${nextDueDate.toLocaleString('ru-RU', { timeZone: input.userTimeZone || MOSCOW_TIMEZONE })}.`);
        appliedActionsCount += 1;
        continue;
      }

      if (action.type === 'complete_task') {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'DONE' }
        });
        actionReports.push(`Отметил задачу "${task.title}" выполненной.`);
        appliedActionsCount += 1;
        continue;
      }

      if (action.type === 'reopen_task') {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: 'TODO' }
        });
        actionReports.push(`Вернул задачу "${task.title}" в активные.`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'rename_task') {
        await prisma.task.update({ where: { id: task.id }, data: { title: action.title.slice(0, 180) } });
        actionReports.push(`Переименовал задачу "${task.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'update_task') {
        const nextImportance = action.importance !== undefined ? Math.max(1, Math.min(5, Math.round(action.importance))) : undefined;
        const nextUrgency = action.urgency !== undefined ? Math.max(1, Math.min(5, Math.round(action.urgency))) : undefined;
        const importance = nextImportance ?? task.importance;
        const urgency = nextUrgency ?? task.urgency;
        const priorityScore = Number((importance * 0.6 + urgency * 0.4).toFixed(2));
        await prisma.task.update({
          where: { id: task.id },
          data: {
            ...(action.description !== undefined ? { description: action.description.slice(0, 4000) } : {}),
            ...(nextImportance !== undefined ? { importance: nextImportance } : {}),
            ...(nextUrgency !== undefined ? { urgency: nextUrgency } : {}),
            ...(nextImportance !== undefined || nextUrgency !== undefined ? { priorityScore } : {}),
            ...(action.notifyBeforeMinutes !== undefined
              ? { notifyBeforeMinutes: action.notifyBeforeMinutes === null ? 30 : Math.max(1, Math.round(action.notifyBeforeMinutes)) }
              : {})
          }
        });
        actionReports.push(`Обновил параметры задачи "${task.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'delete_task') {
        await prisma.task.delete({ where: { id: task.id } });
        actionReports.push(`Удалил задачу "${task.title}".`);
        appliedActionsCount += 1;
        continue;
      }
      if (action.type === 'change_task_sphere') {
        if (action.sphereId) {
          const sphere = await prisma.sphere.findFirst({ where: { id: action.sphereId, userId: input.userId }, select: { id: true } });
          if (!sphere) {
            actionReports.push(`Не удалось сменить сектор для "${task.title}": сектор не найден.`);
            continue;
          }
        }
        await prisma.task.update({ where: { id: task.id }, data: { sphereId: action.sphereId } });
        actionReports.push(`Изменил сектор задачи "${task.title}".`);
        appliedActionsCount += 1;
      }
    }

    const answer = parsed.actions.length > 0 && appliedActionsCount === 0
      ? `Не удалось применить изменения по запросу. Проверьте названия задач/подзадач и попробуйте ещё раз.\n\n${parsed.answer}`
      : parsed.answer;

    return {
      answer,
      model: FAST_MODEL,
      actionReports,
      undoOperations
    };
  },

  undoGeneralAssistantActions: async (input: UndoGeneralAssistantActionsInput) => {
    const operations = Array.isArray(input.operations) ? input.operations : [];
    for (const operation of operations) {
      const task = await prisma.task.findFirst({
        where: { id: operation.taskId, userId: input.userId },
        select: { id: true }
      });
      if (!task) continue;
      const dueDate = operation.previous.dueDate ? new Date(operation.previous.dueDate) : null;
      await prisma.task.update({
        where: { id: operation.taskId },
        data: {
          dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
          status: operation.previous.status
        }
      });
    }
    return { ok: true };
  },

  generateOverdueTaskNudge: async (input: GenerateOverdueNudgeInput) => {
    const now = new Date();
    const updated = await prisma.task.updateMany({
      where: {
        id: input.taskId,
        userId: input.userId,
        status: { not: 'DONE' },
        dueDate: { not: null, lt: now },
        overdueAiNotifiedAt: null
      },
      data: {
        overdueAiNotifiedAt: now
      }
    });

    if (updated.count === 0) {
      const task = await prisma.task.findFirst({
        where: {
          id: input.taskId,
          userId: input.userId,
          status: { not: 'DONE' },
          dueDate: { not: null, lt: now },
          overdueAiNotifiedAt: { not: null }
        },
        select: {
          overdueAiNotifiedAt: true
        }
      });

      if (!task?.overdueAiNotifiedAt) {
        return { sent: false as const };
      }

      const existingNudge = await prisma.taskAiMessage.findFirst({
        where: {
          taskId: input.taskId,
          userId: input.userId,
          role: 'assistant',
          createdAt: { gte: task.overdueAiNotifiedAt }
        },
        orderBy: { createdAt: 'desc' },
        select: {
          content: true
        }
      });

      if (existingNudge?.content) {
        return {
          sent: true as const,
          answer: existingNudge.content,
          replayed: true as const
        };
      }

      return { sent: false as const };
    }

    try {
      const result = await aiAssistantService.askTaskAssistant({
        userId: input.userId,
        taskId: input.taskId,
        history: [],
        mode: 'fast',
        question: [
          'Задача только что стала просроченной.',
          'Проанализируй контекст и предложи пользователю максимально конкретный следующий шаг, который можно сделать прямо сейчас.',
          'Ответ должен завершаться одним уточняющим вопросом, который подтолкнёт к действию.',
          'Если контекста недостаточно, вместо плана задай 1-2 точечных вопроса для уточнения.'
        ].join(' ')
      });

      await aiAssistantService.appendTaskDialogMessages({
        userId: input.userId,
        taskId: input.taskId,
        messages: [{ role: 'assistant', content: result.answer }]
      });

      return {
        sent: true as const,
        answer: result.answer,
        model: result.model
      };
    } catch (error) {
      await prisma.task.updateMany({
        where: { id: input.taskId, userId: input.userId, overdueAiNotifiedAt: now },
        data: { overdueAiNotifiedAt: null }
      });
      throw error;
    }
  },

  optimizeTimelineSchedule: async (input: { userId: string; scope: TimelineOptimizationScope; periodStartIso: string; periodEndIso: string; userNote?: string; userTimeZone?: string }) => {
    const periodStart = new Date(input.periodStartIso);
    const periodEnd = new Date(input.periodEndIso);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart > periodEnd) throw new Error('Невалидный период оптимизации');
    const tasks = await prisma.task.findMany({ where: { userId: input.userId, dueDate: { gte: periodStart, lt: periodEnd } }, include: { sphere: { select: { name: true } }, parentTask: { select: { id: true, title: true } } }, orderBy: { dueDate: 'asc' } });
    const payloadLines = tasks.map((t, index) => [
      `${index + 1}. taskId=${t.id}`,
      `тип=${t.parentTaskId ? 'подзадача' : 'задача'}`,
      `название=${t.title}`,
      `срок=${t.dueDate ? t.dueDate.toISOString() : 'null'}`,
      `важность=${t.importance}`,
      `сфера=${t.sphere?.name ?? 'null'}`,
      `основнаяЗадача=${t.parentTask ? `${t.parentTask.title} (${t.parentTask.id})` : 'null'}`
    ].join(' | ')).join('\n');
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: FULL_MODEL, input: [{ role: 'system', content: 'Ты помощник по планированию. Верни только JSON.' }, { role: 'user', content: `Оптимизируй задачи в режиме ${input.scope}. Текущее время пользователя (${formatTimeZoneLabel(input.userTimeZone ?? MOSCOW_TIMEZONE)}): ${new Date().toISOString()}. Учитывай пожелание пользователя: ${input.userNote ?? 'нет'}. Не оптимизируй без необходимости. Просроченные задачи перенеси. Верни JSON: {"summary":"...","tasks":[{"taskId":"...","dueDate":"ISO|null"}]}. Каждая задача/подзадача ниже указана отдельной строкой:\n${payloadLines}` }] }) });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const parsed = parseTimelineOptimizationPlan(extractOutputText(await response.json()));
    return { model: FULL_MODEL, summary: parsed.summary, plan: parsed.tasks };
  },

  applyTimelineOptimization: async (input: { userId: string; plan: Array<{ taskId: string; dueDate: string | null }> }) => {
    await prisma.$transaction(async (tx) => {
      for (const item of input.plan) {
        const task = await tx.task.findFirst({ where: { id: item.taskId, userId: input.userId } });
        if (!task) continue;
        const taskDue = item.dueDate ? new Date(item.dueDate) : null;
        await tx.task.update({ where: { id: task.id }, data: { dueDate: taskDue && !Number.isNaN(taskDue.getTime()) ? taskDue : null } });
      }
    });
    return { ok: true as const };
  },


  generateSubtasks: async (input: GenerateSubtasksInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const task = await prisma.task.findFirstOrThrow({
      where: { id: input.taskId, userId: input.userId },
      include: {
        subtasks: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            status: true
          },
          orderBy: { createdAt: 'asc' }
        },
        attachments: {
          select: {
            name: true,
            mimeType: true,
            size: true,
            contentBase64: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (task.subtasks.length > 0) {
      throw new Error('У задачи уже есть подзадачи');
    }

    const taskContext = formatTaskContext(task);
    const requestId = randomUUID();
    const taskAttachmentsMessage = buildAttachmentsPromptMessage(task.attachments);
    const modelForSubtasks = taskAttachmentsMessage ? ATTACHMENTS_MODEL : FAST_MODEL;

    const now = new Date();
    const userTimeZone = input.userTimeZone || MOSCOW_TIMEZONE;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForSubtasks,
        input: [
          {
            role: 'system',
            content: [
              'Ты сервис, который декомпозирует задачу на подзадачи.',
              'Верни только JSON без markdown и без любых комментариев.',
              'Строгий формат ответа:',
              '{"subtasks":[{"title":"...","description":"...","dueDate":"ISO-8601 или null"}]}.',
              'В каждом объекте должны быть только поля title, description и dueDate.',
              'От 3 до 8 подзадач, конкретных и выполнимых.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              `Разбей задачу на подзадачи:\n${taskContext}`,
              `Текущая дата и время (UTC): ${now.toISOString()}.`,
              `Локальная дата и время пользователя: ${now.toLocaleString('ru-RU', { timeZone: userTimeZone })} (${formatTimeZoneLabel(userTimeZone)}).`,
              `Для подзадач старайся ставить реалистичные dueDate (ISO-8601, ${input.userTimeZone || MOSCOW_TIMEZONE}), если срок можно оценить.`
            ].join('\n')
          },
          ...(input.note?.trim()
            ? [{
              role: 'user' as const,
              content: `Дополнительное пояснение пользователя: ${input.note.trim().slice(0, 2000)}`
            }]
            : []),
          ...(taskAttachmentsMessage ? [taskAttachmentsMessage] : [])
        ],
        ...(supportsReasoningEffort(FAST_MODEL) ? { reasoning: { effort: 'low' } } : {})
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI] generateSubtasks failed', {
        requestId,
        taskId: input.taskId,
        userId: input.userId,
        status: response.status,
        errorText: errorText.slice(0, 1000)
      });
      throw new Error('Не удалось получить подзадачи от ИИ');
    }

    const payload = await response.json();
    const rawAnswer = extractOutputText(payload);
    if (!rawAnswer) {
      throw new Error('ИИ вернул пустой ответ для подзадач');
    }

    const generatedSubtasks = parseGeneratedSubtasks(rawAnswer);

    const created = await prisma.$transaction(
      generatedSubtasks.map((subtask) => prisma.task.create({
        data: {
          title: subtask.title,
          description: subtask.description,
          userId: input.userId,
          parentTaskId: task.id,
          sphereId: null,
          importance: 3,
          urgency: 3,
          priorityScore: 3,
          status: 'TODO',
          dueDate: subtask.dueDate ? new Date(subtask.dueDate) : null,
          notifyBeforeMinutes: 30
        }
      }))
    );

    return {
      model: modelForSubtasks,
      createdCount: created.length
    };
  },

  generateTaskFromPrompt: async (input: GenerateTaskFromPromptInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new TypeError('Prompt is required');
    }
    const now = new Date();
    const attachmentsMessage = buildAttachmentsPromptMessage(input.attachments);
    const modelForPrompt = attachmentsMessage ? ATTACHMENTS_MODEL : FAST_MODEL;
    const userSpheres = input.autoAssignSphere
      ? await prisma.sphere.findMany({
        where: { userId: input.userId },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' }
      })
      : [];
    const spheresPromptLine = userSpheres.length > 0
      ? userSpheres.map((sphere, index) => `${index + 1}. ${sphere.name}`).join('; ')
      : 'список пуст';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelForPrompt,
        input: [
          {
            role: 'system',
            content: [
              'Ты формируешь структуру задачи для планировщика.',
              'Верни только JSON без markdown и без дополнительных комментариев.',
              'Точный формат:',
              '{"title":"...","description":"...","dueDate":"ISO-8601 или null","importance":1-5,"urgency":1-5,"notifyBeforeMinutes":число или null,"selectedSphereName":"название сектора или null","subtasks":[{"title":"...","description":"...","dueDate":"ISO-8601 или null"}],"firstAssistantMessage":"..."}',
              'Старайся давать короткое и ёмкое название основной задачи: поле title по возможности не длиннее 3-6 слов.',
              'В firstAssistantMessage дай 1 конкретное первое сообщение от лица ИИ-помощника (не от лица пользователя).',
              'firstAssistantMessage должно содержать практическую помощь по первому шагу: мини-инструкцию, пример, чеклист, готовый фрагмент или точечное предложение помочь с первым шагом.',
              'Не пиши общие фразы и не используй формулировки в стиле "Я сделаю...".',
              'Учитывай текущие дату и время из контекста.',
              'Для всех сроков и дедлайнов используй часовой пояс пользователя из контекста.',
              'Поле dueDate заполняй обязательно, если задачу реально можно оценить по сроку: определи примерную длительность выполнения и поставь дедлайн относительно текущей даты.',
              'Если по описанию срок не оценить вообще, только тогда верни dueDate = null.',
              input.autoAssignSphere
                ? 'Поле selectedSphereName обязательно: выбери ровно одно название сектора из списка пользователя (без изменений и сокращений). Если список секторов пуст — верни null.'
                : 'Поле selectedSphereName верни как null.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              `Текущая дата и время: ${now.toISOString()}.`,
              `Локальная дата и время пользователя: ${now.toLocaleString('ru-RU', { timeZone: input.userTimeZone || MOSCOW_TIMEZONE })} (${formatTimeZoneLabel(input.userTimeZone || MOSCOW_TIMEZONE)}).`,
              'Считай дедлайны относительно часового пояса пользователя.',
              `Сектор задачи: ${input.sphereId ? `выбран (${input.sphereId})` : 'не выбран'}.`,
              input.autoAssignSphere
                ? `Доступные секторы пользователя: ${spheresPromptLine}.`
                : 'Автоматический выбор сектора отключён.',
              `Описание от пользователя: ${prompt}`
            ].join('\n')
          },
          ...(attachmentsMessage ? [attachmentsMessage] : [])
        ],
        ...(supportsReasoningEffort(FAST_MODEL) ? { reasoning: { effort: 'low' } } : {})
      })
    });

    if (!response.ok) {
      throw new Error('Не удалось получить структуру задачи от ИИ');
    }

    const payload = await response.json();
    const rawAnswer = extractOutputText(payload);
    if (!rawAnswer) {
      throw new Error('ИИ вернул пустой ответ для генерации задачи');
    }
    const taskDraft = parseGeneratedTaskDraft(rawAnswer);
    const suggestedSphereId = input.autoAssignSphere
      ? userSpheres.find((sphere) => sphere.name.trim().toLowerCase() === (taskDraft.selectedSphereName ?? '').trim().toLowerCase())?.id ?? null
      : null;

    return {
      model: modelForPrompt,
      suggestedSphereId,
      task: {
        title: taskDraft.title,
        description: taskDraft.description,
        dueDate: taskDraft.dueDate,
        importance: taskDraft.importance,
        urgency: taskDraft.urgency,
        notifyBeforeMinutes: taskDraft.notifyBeforeMinutes,
        subtasks: taskDraft.subtasks
      },
      firstAssistantMessage: taskDraft.firstAssistantMessage
    };
  }
};
function sanitizeUpstreamErrorText(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.includes('<!doctype html') || lower.includes('<html')) {
    return 'upstream returned HTML error page';
  }
  return trimmed.replace(/\s+/g, ' ').slice(0, 500);
}

