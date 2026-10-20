import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { runDynamicResponsesCall, settleDynamicResponsesCall, refundDynamicResponsesCall } from './dynamic-responses-billing.service.js';
import { wordDocumentService, type GeneratedDocumentMeta, type WordDocumentBlock } from './word-document.service.js';
import { aiAssistantService } from './ai-assistant.service.js';

export const TASK_REPORT_MODEL = 'gpt-6-luna';
const MAX_CHAT = 240;
const MAX_EVENTS = 300;
const MAX_CONTEXT_CHARACTERS = 85000;
const MAX_TEXT_PER_MESSAGE = 650;
const trim = (value: string | null | undefined, max = 800) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const date = (value: Date, timeZone: string) => {
  try { return new Intl.DateTimeFormat('ru-RU', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(value); }
  catch { return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' }).format(value); }
};

export type ReportTimelineItem = { occurredAt: Date; kind: string; text: string };
export function sortedTaskReportTimeline(items: ReportTimelineItem[]): ReportTimelineItem[] {
  return items.filter(item => !Number.isNaN(item.occurredAt.getTime()))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.kind.localeCompare(b.kind));
}

const reportSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    challenges: { type: 'array', items: { type: 'string' } },
    result: { type: 'string' }
  },
  required: ['summary', 'decisions', 'challenges', 'result']
} as const;

export function formatTaskReportEvidence(items: ReportTimelineItem[], timeZone: string, maxCharacters = MAX_CONTEXT_CHARACTERS) {
  const lines: string[] = [];
  let remaining = maxCharacters;
  let omitted = 0;
  for (const item of sortedTaskReportTimeline(items)) {
    const line = '[' + date(item.occurredAt, timeZone) + '] ' + item.kind + ': ' + trim(item.text, MAX_TEXT_PER_MESSAGE);
    if (line.length > remaining) { omitted += 1; continue; }
    lines.push(line);
    remaining -= line.length + 1;
  }
  return { text: lines.join('\n'), omitted };
}

function safeResultJson(response: Record<string, unknown>): { summary: string; decisions: string[]; challenges: string[]; result: string } {
  const output = Array.isArray(response.output) ? response.output : [];
  const text = typeof response.output_text === 'string' ? response.output_text
    : output.flatMap(item => typeof item === 'object' && item !== null && 'content' in item && Array.isArray(item.content)
      ? item.content.flatMap((part: unknown) => typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : []) : []).join('');
  if (!text) throw new Error('Luna 6 не сформировала содержимое отчёта.');
  const data = JSON.parse(text) as Record<string, unknown>;
  if (typeof data.summary !== 'string' || typeof data.result !== 'string'
    || !Array.isArray(data.decisions) || !Array.isArray(data.challenges)) throw new Error('Некорректный ответ модели при подготовке отчёта.');
  return { summary: trim(data.summary, 3200), result: trim(data.result, 2400),
    decisions: data.decisions.filter((item): item is string => typeof item === 'string').slice(0, 18).map(item => trim(item, 700)),
    challenges: data.challenges.filter((item): item is string => typeof item === 'string').slice(0, 18).map(item => trim(item, 700)) };
}

export async function generateTaskCompletionReport(input: { userId: string; taskId: string }): Promise<{
  document: GeneratedDocumentMeta; model: string; creditsSpentMilli: number; coveredEvents: number; omittedEvents: number;
}> {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, AND: [taskAccessWhere(input.userId)] },
    include: {
      subtasks: { select: { id: true, title: true, description: true, status: true, createdAt: true, updatedAt: true, dueDate: true }, orderBy: { createdAt: 'asc' } },
      attachments: { select: { name: true, mimeType: true, size: true, createdAt: true } }
    }
  });
  if (!task) throw new Error('Задача недоступна.');

  const taskIds = [task.id, ...task.subtasks.map(subtask => subtask.id)];
  const [chat, chatCount, activity, activityCount, comments, chatFiles, generatedFiles, user] = await Promise.all([
    prisma.taskAiMessage.findMany({ where: { taskId: input.taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: MAX_CHAT, select: { role: true, content: true, createdAt: true, messageKind: true } }),
    prisma.taskAiMessage.count({ where: { taskId: input.taskId } }),
    prisma.taskActivityEvent.findMany({ where: { taskId: { in: taskIds } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: MAX_EVENTS, select: { taskId: true, actorId: true, type: true, details: true, createdAt: true } }),
    prisma.taskActivityEvent.count({ where: { taskId: { in: taskIds } } }),
    prisma.taskComment.findMany({ where: { taskId: { in: taskIds } }, orderBy: { createdAt: 'desc' }, take: 140, select: { taskId: true, content: true, createdAt: true } }),
    prisma.aiConversationAttachment.findMany({ where: { taskId: input.taskId }, orderBy: { createdAt: 'desc' }, take: 100, select: { fileName: true, size: true, createdAt: true } }),
    prisma.aiGeneratedDocument.findMany({ where: { taskId: input.taskId }, orderBy: { createdAt: 'desc' }, take: 100, select: { fileName: true, mimeType: true, size: true, createdAt: true } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { timeZone: true } })
  ]);
  const timeZone = user?.timeZone ?? 'Europe/Moscow';
  const nameById = new Map(task.subtasks.map(item => [item.id, item.title] as const));
  nameById.set(task.id, task.title);
  const items: ReportTimelineItem[] = [
    { occurredAt: task.createdAt, kind: 'Создание задачи', text: task.title },
    ...task.subtasks.map(subtask => ({ occurredAt: subtask.createdAt, kind: 'Создание подзадачи', text: subtask.title })),
    ...activity.map(event => {
      const d = event.details && typeof event.details === 'object' && !Array.isArray(event.details)
        ? event.details as Record<string, unknown> : {};
      const old = typeof d.beforeStatus === 'string' ? d.beforeStatus : '?';
      const next = typeof d.afterStatus === 'string' ? d.afterStatus : '?';
      return { occurredAt: event.createdAt, kind: event.type === 'status_changed' ? 'Изменение статуса' : 'Изменение данных',
        text: (nameById.get(event.taskId) ?? 'Задача') + (event.type === 'status_changed' ? ' (' + old + ' → ' + next + ')' : ' (название, описание или срок)') };
    }),
    ...chat.map(message => ({ occurredAt: message.createdAt,
      kind: message.messageKind === 'AI' ? (message.role === 'assistant' ? 'Ответ ИИ' : 'Запрос пользователя к ИИ') : 'Сообщение участников',
      text: trim(message.content, MAX_TEXT_PER_MESSAGE) })),
    ...comments.map(comment => ({ occurredAt: comment.createdAt, kind: 'Комментарий',
      text: (nameById.get(comment.taskId) ?? 'Задача') + ': ' + comment.content })),
    ...task.attachments.map(file => ({ occurredAt: file.createdAt, kind: 'Вложение задачи', text: file.name + ' (' + file.mimeType + ')' })),
    ...chatFiles.map(file => ({ occurredAt: file.createdAt, kind: 'Вложение чата', text: file.fileName })),
    ...generatedFiles.map(file => ({ occurredAt: file.createdAt, kind: 'Созданный ИИ файл', text: file.fileName }))
  ];
  const evidence = formatTaskReportEvidence(items, timeZone);
  const omittedEvents = evidence.omitted + Math.max(0, chatCount - chat.length) + Math.max(0, activityCount - activity.length);
  const subtaskSummary = task.subtasks.map(subtask => {
    const completed = activity.find(event => event.taskId === subtask.id && event.type === 'status_changed'
      && event.details && typeof event.details === 'object' && !Array.isArray(event.details)
      && (event.details as Record<string, unknown>).afterStatus === 'DONE');
    return subtask.title + ' | статус: ' + subtask.status + ' | создана: ' + date(subtask.createdAt, timeZone)
      + ' | зафиксированное завершение: ' + (completed ? date(completed.createdAt, timeZone) : 'нет достоверной даты в журнале')
      + ' | срок: ' + (subtask.dueDate ? date(subtask.dueDate, timeZone) : 'не задан');
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const actionId = randomUUID();
  const call = await runDynamicResponsesCall({
    userId: input.userId, actionId, providerCallIndex: 1,
    feature: 'ai_chat_planner', apiKey, maxOutputTokensCap: 4096, stream: false,
    payload: {
      model: TASK_REPORT_MODEL,
      input: [
        { role: 'system', content: 'Ты готовишь достоверный отчёт о выполнении задачи на русском языке. Опирайся ТОЛЬКО на фактические записи. Перескажи видимые обсуждения и решения, не придумывай скрытые рассуждения ИИ, не выдумывай даты выполнения. Если данных недостаточно, обозначь пробел. Верни строго JSON по заданной схеме. В summary опиши этапы и контекст, в decisions реальные обсуждавшиеся решения, в challenges зафиксированные сложности, в result подтверждённые итоги. Никаких несвязанных советов.' },
        { role: 'user', content: 'ЗАДАЧА: ' + task.title + '\nОписание: ' + trim(task.description, 6000)
          + '\nСтатус: ' + task.status + '; создана ' + date(task.createdAt, timeZone)
          + '; срок ' + (task.dueDate ? date(task.dueDate, timeZone) : 'не задан')
          + '\nПОДЗАДАЧИ:\n' + subtaskSummary.join('\n').slice(0, 20000)
          + '\nХРОНОЛОГИЯ ДОКУМЕНТИРОВАННЫХ СОБЫТИЙ:\n' + evidence.text
          + '\nПропущенные из-за ограничений события: ' + omittedEvents
          + '\nИстория до внедрения журнала изменений может не содержать дат завершения.' }
      ],
      text: { format: { type: 'json_schema', name: 'task_completion_report', strict: true, schema: reportSchema } },
      tool_choice: 'none'
    }
  });
  let document: GeneratedDocumentMeta;
  try {
    const content = safeResultJson(call.responseJson);
    const blocks: WordDocumentBlock[] = [
      { type: 'heading', level: 1, text: 'Отчёт по задаче' },
      { type: 'paragraph', text: task.title },
      { type: 'paragraph', text: 'Статус: ' + task.status + '. Создана: ' + date(task.createdAt, timeZone) +
          '. Срок: ' + (task.dueDate ? date(task.dueDate, timeZone) : 'не задан') + '.' },
      { type: 'heading', level: 2, text: 'Общая картина выполнения' },
      { type: 'paragraph', text: content.summary || 'Сведений недостаточно для достоверного резюме.' },
      { type: 'heading', level: 2, text: 'Обсуждённые решения и этапы' },
      { type: 'bullets', items: content.decisions.length ? content.decisions : ['В сохранённых материалах решения явно не зафиксированы.'] },
      { type: 'heading', level: 2, text: 'Сложности и изменения плана' },
      { type: 'bullets', items: content.challenges.length ? content.challenges : ['Подтверждённых сведений о сложностях нет.'] },
      { type: 'heading', level: 2, text: 'Подзадачи' },
      { type: 'bullets', items: subtaskSummary.length ? subtaskSummary.slice(0, 100) : ['Подзадач нет.'] },
      { type: 'heading', level: 2, text: 'Результаты' },
      { type: 'paragraph', text: content.result || 'Итог не подтверждён сохранённой историей.' },
      { type: 'heading', level: 2, text: 'Хронология событий и работы с вложениями' }
    ];
    // Preserve chronological order but stay within the validated Word export limits.
    const timelineAll = sortedTaskReportTimeline(items);
    const timeline = timelineAll.slice(-180);
    for (let i = 0; i < timeline.length; i += 15) {
      const slice = timeline.slice(i, i + 15);
      blocks.push({ type: 'bullets', items: slice.map(event =>
        '[' + date(event.occurredAt, timeZone) + '] ' + event.kind + ': ' + trim(event.text, 230)) });
    }
    blocks.push({ type: 'paragraph', text: 'Примечание. Отчёт сформирован по сохранённым событиям. Даты завершения до внедрения журнала могут отсутствовать. Пропущено записей: ' + (omittedEvents + Math.max(0, timelineAll.length - timeline.length)) + '. Раздел о решениях является резюме видимых сообщений, а не скрытых рассуждений модели.' });
    document = await wordDocumentService.create({
      userId: input.userId, taskId: input.taskId,
      spec: { fileName: 'Отчёт_' + task.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 65) + '.docx', blocks }
    });
  } catch (error) {
    await refundDynamicResponsesCall(call);
    throw error;
  }
  const payment = await settleDynamicResponsesCall(call);
  await aiAssistantService.appendTaskDialogAssistantMessage({
    userId: input.userId, taskId: input.taskId, content: 'Подготовлен отчёт по задаче в Word. Новая версия отчёта прикреплена к сообщению.',
    generatedDocumentId: document.id, creditsSpentMilli: payment.chargedMilli
  });
  return { document, model: TASK_REPORT_MODEL, creditsSpentMilli: payment.chargedMilli,
    coveredEvents: items.length - evidence.omitted, omittedEvents };
}
