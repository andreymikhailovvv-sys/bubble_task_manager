import { prisma } from '../db/prisma.js';
import { randomUUID } from 'node:crypto';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
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
};
type GenerateTaskFromPromptInput = {
  userId: string;
  prompt: string;
  sphereId?: string | null;
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
const SMART_MODEL_FALLBACKS = [FAST_MODEL];
const SUPPORTED_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

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
};
type GeneratedTaskDraft = {
  title: string;
  description: string;
  dueDate: string | null;
  importance: number;
  urgency: number;
  notifyBeforeMinutes: number | null;
  subtasks: Array<{ title: string; description: string; dueDate: string | null }>;
  firstAssistantMessage: string;
};

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
      if (typeof title !== 'string' || typeof description !== 'string') return null;
      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      if (!trimmedTitle || !trimmedDescription) return null;
      return { title: trimmedTitle.slice(0, 180), description: trimmedDescription.slice(0, 4000) };
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
  const firstAssistantMessage = typeof source.firstAssistantMessage === 'string'
    ? source.firstAssistantMessage.trim().slice(0, 6000)
    : '';
  const dueDate = typeof source.dueDate === 'string' && source.dueDate.trim()
    ? source.dueDate.trim()
    : null;
  const importanceRaw = typeof source.importance === 'number' ? source.importance : Number(source.importance ?? 3);
  const urgencyRaw = typeof source.urgency === 'number' ? source.urgency : Number(source.urgency ?? 3);
  const notifyRaw = source.notifyBeforeMinutes;
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
  if (!firstAssistantMessage) {
    throw new Error('ИИ не вернул первое сообщение в чат');
  }

  return {
    title,
    description,
    dueDate,
    importance,
    urgency,
    notifyBeforeMinutes,
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

function toInputPart(attachment: ChatAttachment): { type: 'input_file'; filename: string; file_data: string } | { type: 'input_image'; image_url: string } {
  const buffer = Buffer.from(attachment.contentBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error(`Файл "${attachment.name}" пустой или повреждён.`);
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Файл "${attachment.name}" превышает лимит ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB.`);
  }

  const normalizedName = attachment.name.toLowerCase();
  const isPdf = attachment.mimeType === 'application/pdf' || normalizedName.endsWith('.pdf');
  const isDocx = attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || normalizedName.endsWith('.docx');
  const isPng = attachment.mimeType === 'image/png' || normalizedName.endsWith('.png');
  const isJpeg = attachment.mimeType === 'image/jpeg' || normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg');
  const isWebp = attachment.mimeType === 'image/webp' || normalizedName.endsWith('.webp');
  const isGif = attachment.mimeType === 'image/gif' || normalizedName.endsWith('.gif');

  if (isPng || isJpeg || isWebp || isGif) {
    return {
      type: 'input_image',
      image_url: `data:${attachment.mimeType};base64,${attachment.contentBase64}`
    };
  }

  if (isPdf || isDocx) {
    return {
      type: 'input_file',
      filename: attachment.name,
      file_data: `data:${attachment.mimeType};base64,${attachment.contentBase64}`
    };
  }

  throw new Error(`Формат файла "${attachment.name}" не поддерживается. Разрешены PDF, DOCX, PNG, JPG, WEBP и GIF.`);
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

export const aiAssistantService = {
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
    const messages: Array<OpenAiTextMessage | OpenAiUserAttachmentMessage> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Контекст задачи:\n${taskContext}` },
      ...(attachmentsMessage
        ? [attachmentsMessage]
        : []),
      ...history,
      { role: 'user', content: question }
    ];

    const requestId = randomUUID();
    const reasoningEffort = resolveReasoningEffort(input.mode);
    const modelCandidates = input.mode === 'smart'
      ? Array.from(new Set([FULL_MODEL, ...SMART_MODEL_FALLBACKS].filter(Boolean)))
      : [FAST_MODEL];

    console.info('[AI] Starting OpenAI request', {
      requestId,
      mode: input.mode ?? 'fast',
      models: modelCandidates,
      taskId: input.taskId,
      userId: input.userId,
      questionLength: question.length,
      historyLength: history.length
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
          if (input.mode === 'smart' && model === FULL_MODEL && modelCandidates.length > 1) {
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
          if (input.mode === 'smart' && model === FULL_MODEL && modelCandidates.length > 1) {
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

        if (input.mode === 'smart' && model === FULL_MODEL && modelCandidates.length > 1) {
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

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: FAST_MODEL,
        input: [
          {
            role: 'system',
            content: [
              'Ты сервис, который декомпозирует задачу на подзадачи.',
              'Верни только JSON без markdown и без любых комментариев.',
              'Строгий формат ответа:',
              '{"subtasks":[{"title":"...","description":"..."}]}.',
              'В каждом объекте должны быть только поля title и description.',
              'От 3 до 8 подзадач, конкретных и выполнимых.'
            ].join(' ')
          },
          {
            role: 'user',
            content: `Разбей задачу на подзадачи:\n${taskContext}`
          },
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
          notifyBeforeMinutes: 60
        }
      }))
    );

    return {
      model: FAST_MODEL,
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
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: FAST_MODEL,
        input: [
          {
            role: 'system',
            content: [
              'Ты формируешь структуру задачи для планировщика.',
              'Верни только JSON без markdown и без дополнительных комментариев.',
              'Точный формат:',
              '{"title":"...","description":"...","dueDate":"ISO-8601 или null","importance":1-5,"urgency":1-5,"notifyBeforeMinutes":число или null,"subtasks":[{"title":"...","description":"...","dueDate":"ISO-8601 или null"}],"firstAssistantMessage":"..."}',
              'В firstAssistantMessage дай 1 короткое полезное сообщение в чат: либо план выполнения, либо уточняющие вопросы.',
              'Учитывай текущие дату и время из контекста.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              `Текущая дата и время: ${now.toISOString()}.`,
              `Локальная дата и время: ${now.toLocaleString('ru-RU', { timeZone: 'UTC' })} (UTC).`,
              `Сектор задачи: ${input.sphereId ? `выбран (${input.sphereId})` : 'не выбран'}.`,
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

    return {
      model: FAST_MODEL,
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
