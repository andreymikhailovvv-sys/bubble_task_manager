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
};

type GenerateSubtasksInput = {
  userId: string;
  taskId: string;
  note?: string;
};
type GenerateOverdueNudgeInput = {
  userId: string;
  taskId: string;
};
type GenerateTaskFromPromptInput = {
  userId: string;
  prompt: string;
  sphereId?: string | null;
  autoAssignSphere?: boolean;
  attachments?: ChatAttachment[];
};
type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};

const FAST_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
const FULL_MODEL = process.env.OPENAI_MODEL_FULL?.trim() || 'gpt-5.4';
const ATTACHMENTS_MODEL = process.env.OPENAI_MODEL_ATTACHMENTS?.trim() || FULL_MODEL;
const SMART_MODEL_FALLBACKS = [FAST_MODEL];
const SUPPORTED_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MOSCOW_TIMEZONE = 'Europe/Moscow';

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

function normalizeHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content.length > 0)
    .slice(-20);
}

function trimHistoryForAttachments(history: ChatMessage[], hasAttachments: boolean): ChatMessage[] {
  if (!hasAttachments) return history;
  // Когда есть вложения, payload резко растёт (base64), и OpenAI может отсечь ранние сообщения.
  // Оставляем только короткий хвост диалога, чтобы вложения и последний вопрос точно попали в контекст.
  return history.slice(-6);
}

function formatTaskContext(task: {
  title: string;
  description: string | null;
  dueDate: Date | null;
  importance: number;
  urgency: number;
  priorityScore: number;
  status: string;
  subtasks: Array<{ title: string; description: string | null; dueDate: Date | null; status: string }>;
  attachments?: Array<{ name: string; mimeType: string; size: number }>;
}) {
  const dueDateText = task.dueDate ? task.dueDate.toISOString() : 'не указан';
  const subtasksText = task.subtasks.length
    ? task.subtasks
      .map((subtask, index) => `${index + 1}. ${subtask.title} | статус: ${subtask.status} | срок: ${subtask.dueDate ? subtask.dueDate.toISOString() : 'не указан'} | описание: ${subtask.description ?? 'нет'}`)
      .join('\n')
    : 'Подзадач нет';
  const attachmentsText = task.attachments && task.attachments.length > 0
    ? task.attachments
      .map((attachment, index) => `${index + 1}. ${attachment.name} | тип: ${attachment.mimeType} | размер: ${attachment.size} байт`)
      .join('\n')
    : 'Нет прикреплённых файлов';

  return [
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
  } catch {
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

  askTaskAssistant: async (input: AskTaskAssistantInput) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const task = await prisma.task.findFirstOrThrow({
      where: { id: input.taskId, userId: input.userId },
      include: {
        subtasks: {
          select: {
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

    const systemPrompt = [
      'Ты ИИ-помощник в задачнике Bubble Task Manager.',
      'Твоя роль — помогать пользователю выполнять конкретную задачу: планировать, разбивать на шаги, снимать блокеры, предлагать приоритеты и практичные действия.',
      'Отвечай на русском языке, по делу, в дружелюбном тоне.',
      'Опирайся на контекст задачи и подзадач. Если информации недостаточно, задай уточняющий вопрос.',
      'Пиши предельно экономно: коротко, сухо, по делу.',
      'Без длинных вступлений, повторов и лишних пояснений.',
      'По умолчанию давай 3-6 коротких пунктов или 2-4 предложения.',
      'Если вопрос простой — отвечай одной короткой репликой.',
      'Если тема сложная — только ключевые шаги и конкретные действия.'
    ].join(' ');

    const taskContext = formatTaskContext(task);
    const attachmentsMessage = buildAttachmentsPromptMessage([...(task.attachments ?? []), ...(input.attachments ?? [])]);
    const hasAttachments = Boolean(attachmentsMessage);
    const trimmedHistory = trimHistoryForAttachments(history, hasAttachments);
    const messages: Array<OpenAiTextMessage | OpenAiUserAttachmentMessage> = [
      { role: 'system', content: systemPrompt },
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
      historyLengthUsed: trimmedHistory.length
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
            reasoning: { effort: reasoningEffort }
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
            message: `${errorMessage}. ${errorText.slice(0, 500)}`
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
        const answer = extractOutputText(responseJson);
        if (!answer) {
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
          answerLength: answer.length,
          taskId: input.taskId,
          userId: input.userId
        });

        return {
          model,
          answer
        };
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
              `Текущая дата и время: ${new Date().toISOString()}.`,
              'Для подзадач старайся ставить реалистичные dueDate (ISO-8601, Europe/Moscow), если срок можно оценить.'
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
        reasoning: { effort: 'low' }
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
              'Для всех сроков и дедлайнов используй московский часовой пояс (Europe/Moscow, UTC+3).',
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
              `Локальная дата и время (Москва): ${now.toLocaleString('ru-RU', { timeZone: MOSCOW_TIMEZONE })} (Europe/Moscow, UTC+3).`,
              'Считай дедлайны относительно московского времени.',
              `Сектор задачи: ${input.sphereId ? `выбран (${input.sphereId})` : 'не выбран'}.`,
              input.autoAssignSphere
                ? `Доступные секторы пользователя: ${spheresPromptLine}.`
                : 'Автоматический выбор сектора отключён.',
              `Описание от пользователя: ${prompt}`
            ].join('\n')
          },
          ...(attachmentsMessage ? [attachmentsMessage] : [])
        ],
        reasoning: { effort: 'low' }
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
