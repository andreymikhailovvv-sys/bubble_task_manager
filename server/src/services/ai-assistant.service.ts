import { prisma } from '../db/prisma.js';
import { randomUUID } from 'node:crypto';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AskTaskAssistantInput = {
  userId: string;
  taskId: string;
  question: string;
  history: ChatMessage[];
  mode?: 'fast' | 'smart';
};

const FAST_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
const FULL_MODEL = process.env.OPENAI_MODEL_FULL?.trim() || 'gpt-5.4';
const SMART_MODEL_FALLBACKS = [FAST_MODEL];

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
}) {
  const dueDateText = task.dueDate ? task.dueDate.toISOString() : 'не указан';
  const subtasksText = task.subtasks.length
    ? task.subtasks
      .map((subtask, index) => `${index + 1}. ${subtask.title} | статус: ${subtask.status} | срок: ${subtask.dueDate ? subtask.dueDate.toISOString() : 'не указан'} | описание: ${subtask.description ?? 'нет'}`)
      .join('\n')
    : 'Подзадач нет';

  return [
    `Название задачи: ${task.title}`,
    `Описание: ${task.description ?? 'нет'}`,
    `Дедлайн: ${dueDateText}`,
    `Статус: ${task.status}`,
    `Важность: ${task.importance}`,
    `Срочность: ${task.urgency}`,
    `Приоритет: ${task.priorityScore}`,
    `Подзадачи:\n${subtasksText}`
  ].join('\n');
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
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Контекст задачи:\n${taskContext}` },
      ...history,
      { role: 'user', content: question }
    ];

    const requestId = randomUUID();
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
            reasoning: { effort: 'minimal' }
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

          lastError = new Error(`OpenAI request failed for model "${model}": ${openAiResponse.status}`);
          if (input.mode === 'smart' && model !== modelCandidates[modelCandidates.length - 1]) {
            continue;
          }
          throw lastError;
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

          lastError = new Error(`OpenAI returned empty response for model "${model}"`);
          if (input.mode === 'smart' && model !== modelCandidates[modelCandidates.length - 1]) {
            continue;
          }
          throw lastError;
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

        console.error('[AI] Failed to process OpenAI response', {
          requestId,
          mode: input.mode ?? 'fast',
          model,
          taskId: input.taskId,
          userId: input.userId,
          error: normalizedError.message,
          stack: normalizedError.stack
        });

        if (input.mode === 'smart' && model !== modelCandidates[modelCandidates.length - 1]) {
          continue;
        }
      }
    }

    throw lastError ?? new Error('OpenAI request failed without details');
  }
};
