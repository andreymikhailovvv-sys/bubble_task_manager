import { Request, Response } from 'express';
import { aiAssistantService, type AiChatContextDiagnostics } from '../services/ai-assistant.service.js';
import { telegramService } from '../services/telegram.service.js';
import { prisma } from '../db/prisma.js';
import { computeNextRecurringDueDate } from '../services/task.service.js';
import { createAiBillingSystemNotification } from '../services/ai-billing-notification.service.js';
import { randomUUID } from 'node:crypto';
import { logAiTraceSummary } from '../services/ai-trace-summary.service.js';

type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};
const DEFAULT_TIMEZONE = 'Europe/Moscow';

export const isDynamicTaskChatBillingEnabled = (userId: string) => {
  if (process.env.AI_DYNAMIC_TASK_CHAT_BILLING_ENABLED?.trim().toLowerCase() !== 'true') return false;
  const allowlist = (process.env.AI_DYNAMIC_TASK_CHAT_BILLING_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(userId);
};

const INSUFFICIENT_AI_CREDITS_ERROR = 'Недостаточно AI кредитов';
const INSUFFICIENT_AI_CREDITS_SYSTEM_MESSAGE = 'Системное сообщение: у пользователя недостаточно кредитов для использования ИИ-функции.';
const sendAiError = (res: Response, error: unknown, fallback = 'Unknown AI error') => {
  const message = error instanceof Error ? error.message : fallback;
  if (message === INSUFFICIENT_AI_CREDITS_ERROR) {
    res.status(402).json({ error: INSUFFICIENT_AI_CREDITS_SYSTEM_MESSAGE });
    return;
  }
  res.status(500).json({ error: message });
};
const normalizeTimeZone = (candidate: string): string | null => {
  const normalized = candidate.trim();
  if (!normalized) return null;
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return null;
  }
};
const resolveUserTimeZone = async (req: Request): Promise<string> => {
  const candidate = typeof req.body?.userTimeZone === 'string'
    ? req.body.userTimeZone
    : typeof req.query?.userTimeZone === 'string'
      ? req.query.userTimeZone
      : '';
  const fromRequest = normalizeTimeZone(candidate);
  if (fromRequest) {
    if (req.user?.id) {
      await prisma.user.updateMany({
        where: { id: req.user.id, OR: [{ timeZone: null }, { NOT: { timeZone: fromRequest } }] },
        data: { timeZone: fromRequest }
      });
    }
    return fromRequest;
  }
  if (req.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { timeZone: true } });
    const fromProfile = normalizeTimeZone(user?.timeZone ?? '');
    if (fromProfile) return fromProfile;
  }
  return DEFAULT_TIMEZONE;
};

export const aiController = {
  askAiChat: async (req: Request, res: Response) => {
    const startedAt = Date.now(); const requestId = randomUUID(); let traceResult: any = null; let traceDiagnostics: { context: AiChatContextDiagnostics } | null = null; let traceError: unknown = null;
    const streaming = (req.get('accept') ?? '').toLowerCase().split(',').some((value) => value.trim().split(';')[0] === 'application/x-ndjson');
    const writeStreamEvent = (event: unknown) => { res.write(`${JSON.stringify(event)}\n`); (res as Response & { flush?: () => void }).flush?.(); };
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question : '';
      if (!question.trim()) {
        if (streaming) { res.status(400).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }); writeStreamEvent({ type: 'error', message: 'question is required' }); res.end(); }
        else res.status(400).json({ error: 'question is required' });
        return;
      }
      if (streaming) { res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); }
      const history = Array.isArray(req.body?.history) ? req.body.history.filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string').map((m: any) => ({ ...(typeof m.id === 'string' ? { id: m.id } : {}), role: m.role, content: m.content })) : [];
      const requestedModel = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6-sol'].includes(req.body?.model) ? req.body.model as 'gpt-6-luna' | 'gpt-5.4-mini' | 'gpt-6-sol' : undefined;
      const userTimeZone = await resolveUserTimeZone(req);
      const projectTitle = typeof req.body?.projectTitle === 'string' ? req.body.projectTitle : undefined;
      const chatTitle = typeof req.body?.chatTitle === 'string' ? req.body.chatTitle : undefined;
      const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
      const chatId = typeof req.body?.chatId === 'string' ? req.body.chatId : undefined;
      const clientSurface = req.body?.clientSurface === 'web' || req.body?.clientSurface === 'miniapp' ? req.body.clientSurface : undefined;
      const result = await aiAssistantService.askAiChat({ userId: req.user!.id, question, history, model: requestedModel, userTimeZone, projectTitle, chatTitle, projectId, chatId, clientSurface, requestId, attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [], onDiagnosticsPrepared: (diagnostics) => { traceDiagnostics = diagnostics; }, ...(streaming ? { onProgress: (status: import('../services/ai-chat-progress.js').AiChatProgressStatus) => writeStreamEvent({ type: 'status', status }) } : {}) });
      traceResult = result;
      if (chatId === 'quick-ai-requests' || (!chatId && projectTitle === 'Личный проект' && chatTitle === 'Быстрые запросы')) {
        await aiAssistantService.appendGeneralDialogMessages({ userId: req.user!.id, messages: [{ role: 'user', content: question }] });
        await aiAssistantService.appendGeneralDialogAssistantMessage({ userId: req.user!.id, content: result.answer, creditsSpentMilli: result.billing.creditsSpentMilli });
      }
      const { diagnostics: _diagnostics, workflowDiagnostics: _workflowDiagnostics, ...publicResult } = result;
      if (streaming) { writeStreamEvent({ type: 'result', result: publicResult }); res.end(); } else res.json(publicResult);
    } catch (error) {
      traceError = error;
      if (streaming) { writeStreamEvent({ type: 'error', message: error instanceof Error ? error.message : 'Unknown AI error' }); res.end(); }
      else sendAiError(res, error);
    } finally {
      const diagnostics = traceResult?.diagnostics ?? traceDiagnostics; const workflow = traceResult?.workflowDiagnostics;
      logAiTraceSummary({ requestId, endpoint: 'ai-chat', surface: req.body?.clientSurface === 'web' || req.body?.clientSurface === 'miniapp' ? req.body.clientSurface : 'unknown', chatKind: req.body?.chatId === 'quick-ai-requests' ? 'quick' : 'project', projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : null, chatId: typeof req.body?.chatId === 'string' ? req.body.chatId : null, model: traceResult?.model ?? req.body?.model ?? null, contextMode: diagnostics?.context?.contextMode ?? (req.body?.chatId === 'quick-ai-requests' ? 'quick' : 'legacy'), memoryRevision: diagnostics?.context?.memoryRevision ?? null, memoryCompactionTriggered: diagnostics?.context?.memoryCompactionTriggered ?? false, providerStreaming: workflow?.providerStreaming ?? false, webSearchProgressObserved: workflow?.webSearchProgressObserved ?? false, providerCalls: workflow?.providerCalls ?? 0, toolCalls: workflow?.toolCalls ?? 0, toolOperations: workflow?.toolOperations ?? [], batchToolCalls: workflow?.batchToolCalls, batchActionsRequested: workflow?.batchActionsRequested, batchActionsSucceeded: workflow?.batchActionsSucceeded, batchActionsFailed: workflow?.batchActionsFailed, webSearchUsed: workflow?.webSearchUsed ?? false, webSearchCallsActual: workflow?.webSearchCallsActual ?? 0, webSearchCallsBilled: workflow?.webSearchCallsBilled ?? 0, webSearchLimit: workflow?.webSearchLimit ?? 1, webSearchLimitExceeded: workflow?.webSearchLimitExceeded ?? false, webSearchDuplicateItems: workflow?.webSearchDuplicateItems ?? 0, webSearchSearchItemsRaw: workflow?.webSearchSearchItemsRaw ?? 0, webSearchCreditsMilliBilled: workflow?.webSearchCreditsMilliBilled ?? 0, providerWebSearchCostMilli: workflow?.providerWebSearchCostMilli ?? 0, webSearchCalls: workflow?.webSearchCallsActual ?? workflow?.webSearchCalls ?? 0, webSearchCreditsMilli: workflow?.webSearchCreditsMilliBilled ?? workflow?.webSearchCreditsMilli ?? 0, webSourceCount: workflow?.webSourceCount ?? 0, inputTokensTotal: workflow?.inputTokensTotal ?? 0, outputTokensTotal: workflow?.outputTokensTotal ?? 0, creditsSpentMilli: traceResult?.billing?.creditsSpentMilli ?? 0, taskDataChanged: traceResult?.taskDataChanged ?? false, durationMs: Date.now() - startedAt, success: !traceError, ...(!traceError ? {} : { errorCode: traceError instanceof Error ? traceError.name : 'UnknownError' }) });
    }
  },

  getGeneralAssistantHistory: async (req: Request, res: Response) => {
    try {
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      const userTimeZone = await resolveUserTimeZone(req);
      const messages = await aiAssistantService.listGeneralDialog({
        userId: req.user!.id,
        since: todayUtc,
        userTimeZone
      });
      res.json({ messages });
    } catch (error) {
      sendAiError(res, error);
    }
  },
  askGeneralAssistant: async (req: Request, res: Response) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question : '';
      if (!question.trim()) {
        res.status(400).json({ error: 'question is required' });
        return;
      }
      const todayUtc = new Date();
      todayUtc.setUTCHours(0, 0, 0, 0);
      const userTimeZone = await resolveUserTimeZone(req);
      const history = await aiAssistantService.listGeneralDialog({
        userId: req.user!.id,
        since: todayUtc,
        userTimeZone
      });

      const result = await aiAssistantService.askGeneralAssistant({
        userId: req.user!.id,
        question,
        history,
        userTimeZone
      });

      await aiAssistantService.appendGeneralDialogMessages({
        userId: req.user!.id,
        messages: [{ role: 'user', content: question.trim() }]
      });
      await aiAssistantService.appendGeneralDialogAssistantMessage({ userId: req.user!.id, content: result.answer, creditsSpentMilli: result.billing.creditsSpentMilli });
      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  },
  parseRecurrence: async (req: Request, res: Response) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
      }
      const userTimeZone = await resolveUserTimeZone(req);
      const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : null;
      const task = taskId ? await prisma.task.findFirst({ where: { id: taskId, userId: req.user!.id }, select: { id: true, title: true } }) : null;
      if (taskId && !task) { res.status(404).json({ error: 'task not found' }); return; }
      const result = await aiAssistantService.parseRecurrence({ userId: req.user!.id, text, userTimeZone });
      const nextDueDate = computeNextRecurringDueDate(result.schedule, new Date());
      await createAiBillingSystemNotification({ userId: req.user!.id, taskId: task?.id, eventKey: `ai-billing:recurrence:${randomUUID()}`, creditsSpentMilli: result.billing.creditsSpentMilli, content: (credits) => task ? `ИИ сформировал правило повторения для задачи «${task.title}». Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` : `ИИ сформировал правило повторения. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` });
      res.json({ ...result, nextDueDate: nextDueDate?.toISOString() ?? null });
    } catch (error) {
      sendAiError(res, error);
    }
  },
  undoGeneralAssistantAction: async (req: Request, res: Response) => {
    try {
      const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
      await aiAssistantService.undoGeneralAssistantActions({
        userId: req.user!.id,
        operations
      });
      res.json({ ok: true });
    } catch (error) {
      sendAiError(res, error);
    }
  },
  getTaskAssistantHistory: async (req: Request, res: Response) => {
    try {
      const messages = await aiAssistantService.listTaskDialog({
        userId: req.user!.id,
        taskId: req.params.id
      });
      res.json({ messages });
    } catch (error) {
      sendAiError(res, error);
    }
  },
  askTaskAssistant: async (req: Request, res: Response) => {
    const traceStartedAt = Date.now(); const traceRequestId = randomUUID(); let traceTaskResult: any = null; let traceTaskError: unknown = null;
    const streaming = (req.get('accept') ?? '').toLowerCase().split(',').some((value) => value.trim().split(';')[0] === 'application/x-ndjson');
    const writeStreamEvent = (event: unknown) => {
      res.write(`${JSON.stringify(event)}\n`);
      (res as Response & { flush?: () => void }).flush?.();
    };
    try {
      const { question, userMessage } = req.body as {
        question?: string;
        userMessage?: string;
        mode?: 'fast' | 'smart';
        model?: 'gpt-6-luna' | 'gpt-5.4-mini' | 'gpt-6-sol';
        attachments?: ChatAttachment[];
        skipEfficiencyBonus?: boolean;
      };

      if (!question || typeof question !== 'string') {
        if (streaming) {
          res.status(400).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
          writeStreamEvent({ type: 'error', message: 'question is required' });
          res.end();
        } else res.status(400).json({ error: 'question is required' });
        return;
      }

      if (streaming) {
        res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
      }

      const mode = req.body?.mode === 'smart' ? 'smart' : 'fast';
      const model = ['gpt-6-luna', 'gpt-5.4-mini', 'gpt-6-sol'].includes(req.body?.model) ? req.body.model as 'gpt-6-luna' | 'gpt-5.4-mini' | 'gpt-6-sol' : undefined;
      console.info('[AI] /tasks/:id/ai-chat request received', {
        userId: req.user!.id,
        taskId: req.params.id,
        mode,
        model,
        questionLength: question.length,
        userMessageLength: typeof userMessage === 'string' ? userMessage.length : 0
      });

      const persistedHistory = await aiAssistantService.listTaskDialogForContext({
        userId: req.user!.id,
        taskId: req.params.id
      });

      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.askTaskAssistant({
        userId: req.user!.id,
        taskId: req.params.id,
        question,
        history: persistedHistory,
        mode,
        model,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
        userTimeZone,
        billingMode: isDynamicTaskChatBillingEnabled(req.user!.id) ? 'dynamic' : 'legacy',
        skipEfficiencyBonus: req.body?.skipEfficiencyBonus === true,
        ...(streaming ? { onProgress: (status: import('../services/task-ai-progress.js').TaskAiProgressStatus) => writeStreamEvent({ type: 'status', status }) } : {})
      });
      traceTaskResult = result;

      const normalizedUserMessage = typeof userMessage === 'string' ? userMessage.trim() : '';
      if (normalizedUserMessage) {
        await aiAssistantService.appendTaskDialogMessages({
          userId: req.user!.id,
          taskId: req.params.id,
          messages: [{ role: 'user', content: normalizedUserMessage }]
        });
      }
      await aiAssistantService.appendTaskDialogAssistantMessage({
        userId: req.user!.id,
        taskId: req.params.id,
        content: result.answer,
        creditsSpentMilli: result.billing.creditsSpentMilli
      });

      console.info('[AI] /tasks/:id/ai-chat response sent', {
        userId: req.user!.id,
        taskId: req.params.id,
        mode,
        model: result.model,
        answerLength: result.answer.length
      });

      if (streaming) {
        writeStreamEvent({ type: 'result', result });
        res.end();
      } else res.json(result);
    } catch (error) {
      traceTaskError = error;
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      console.error('[AI] /tasks/:id/ai-chat failed', {
        userId: req.user?.id,
        taskId: req.params.id,
        mode: req.body?.mode,
        questionLength: typeof req.body?.question === 'string' ? req.body.question.length : null,
        userMessageLength: typeof req.body?.userMessage === 'string' ? req.body.userMessage.length : null,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      if (streaming && res.headersSent) {
        writeStreamEvent({ type: 'error', message });
        res.end();
      } else sendAiError(res, error);
    } finally {
      logAiTraceSummary({ requestId: traceRequestId, endpoint: 'task-chat', surface: req.body?.clientSurface === 'web' || req.body?.clientSurface === 'miniapp' ? req.body.clientSurface : 'unknown', taskId: req.params.id, model: traceTaskResult?.model ?? req.body?.model ?? null, contextMode: process.env.TASK_CHAT_MEMORY_ENABLED === 'true' ? 'v3' : 'v2', memoryRevision: traceTaskResult?.diagnostics?.memoryRevision ?? null, memoryCompactionTriggered: traceTaskResult?.diagnostics?.memoryCompactionTriggered ?? false, providerCalls: traceTaskResult?.diagnostics?.providerCalls ?? 0, toolCalls: traceTaskResult?.diagnostics?.toolCalls ?? 0, toolOperations: traceTaskResult?.diagnostics?.toolOperations ?? [], inputTokensTotal: traceTaskResult?.diagnostics?.inputTokensTotal ?? 0, outputTokensTotal: traceTaskResult?.diagnostics?.outputTokensTotal ?? 0, creditsSpentMilli: traceTaskResult?.billing?.creditsSpentMilli ?? 0, durationMs: Date.now() - traceStartedAt, success: !traceTaskError, ...(!traceTaskError ? {} : { errorCode: traceTaskError instanceof Error ? traceTaskError.name : 'UnknownError' }) });
    }
  },
  appendTaskAssistantMessages: async (req: Request, res: Response) => {
    try {
      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages = rawMessages
        .map((message: unknown) => {
          if (typeof message !== 'object' || message === null) return null;
          const role = 'role' in message ? (message as { role?: unknown }).role : null;
          const content = 'content' in message ? (message as { content?: unknown }).content : null;
          if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
          return { role, content };
        })
        .filter((message: { role: 'user' | 'assistant'; content: string } | null): message is { role: 'user' | 'assistant'; content: string } => Boolean(message));

      if (messages.length === 0) {
        res.status(400).json({ error: 'messages is required' });
        return;
      }

      await aiAssistantService.appendTaskDialogMessages({
        userId: req.user!.id,
        taskId: req.params.id,
        messages
      });
      res.json({ ok: true });
    } catch (error) {
      sendAiError(res, error);
    }
  },
  generateSubtasks: async (req: Request, res: Response) => {
    try {
      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.generateSubtasks({
        userId: req.user!.id,
        taskId: req.params.id,
        note: typeof req.body?.note === 'string' ? req.body.note : undefined,
        userTimeZone
      });
      await createAiBillingSystemNotification({ userId: req.user!.id, taskId: req.params.id, eventKey: `ai-billing:generate-subtasks:${randomUUID()}`, creditsSpentMilli: result.billing.creditsSpentMilli, content: (credits) => `ИИ сформировал ${result.createdCount} подзадач для задачи «${result.taskTitle}». Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      if (message === INSUFFICIENT_AI_CREDITS_ERROR) {
        res.status(402).json({ error: INSUFFICIENT_AI_CREDITS_SYSTEM_MESSAGE });
        return;
      }
      const status = message === 'У задачи уже есть подзадачи' ? 409 : 500;
      res.status(status).json({ error: message });
    }
  },
  generateOverdueTaskNudge: async (req: Request, res: Response) => {
    try {
      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.generateOverdueTaskNudge({
        userId: req.user!.id,
        taskId: req.params.id,
        userTimeZone
      });

      if (
        result.sent &&
        result.answer &&
        !('replayed' in result && result.replayed)
      ) {
        await telegramService.notifyOverdueTaskAiMessage({
          userId: req.user!.id,
          taskId: req.params.id,
          aiMessage: result.answer
        });
      }

      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  },
  optimizeTimelineSchedule: async (req: Request, res: Response) => {
    try {
      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.optimizeTimelineSchedule({
        userId: req.user!.id,
        scope: req.body?.scope,
        periodStartIso: req.body?.periodStartIso,
        periodEndIso: req.body?.periodEndIso,
        userNote: typeof req.body?.userNote === 'string' ? req.body.userNote : undefined,
        userTimeZone
      });
      await createAiBillingSystemNotification({ userId: req.user!.id, eventKey: `ai-billing:optimize-timeline:${randomUUID()}`, creditsSpentMilli: result.billing?.creditsSpentMilli, content: (credits) => result.plan.length > 0 ? `ИИ подготовил оптимизацию расписания. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` : `ИИ проанализировал расписание. Изменения не потребовались. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` });
      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  },
  postponeOverdueWithAi: async (req: Request, res: Response) => {
    try {
      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.postponeOverdueWithAi({ userId: req.user!.id, userTimeZone });
      await createAiBillingSystemNotification({ userId: req.user!.id, eventKey: `ai-billing:overdue-postpone:${randomUUID()}`, creditsSpentMilli: result.billing?.creditsSpentMilli, content: (credits) => result.updatedTaskIds.length > 0 ? `ИИ перенёс просроченные задачи: ${result.updatedTaskIds.length}. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` : `ИИ проанализировал просроченные задачи. Перенос не потребовался. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` });
      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  },
  applyTimelineOptimization: async (req: Request, res: Response) => {
    try {
      const plan = Array.isArray(req.body?.plan) ? req.body.plan : [];
      const result = await aiAssistantService.applyTimelineOptimization({ userId: req.user!.id, plan });
      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  },
  generateTaskFromPrompt: async (req: Request, res: Response) => {
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      if (!prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      const userTimeZone = await resolveUserTimeZone(req);
      const result = await aiAssistantService.generateTaskFromPrompt({
        userId: req.user!.id,
        prompt,
        sphereId: typeof req.body?.sphereId === 'string' ? req.body.sphereId : null,
        autoAssignSphere: req.body?.autoAssignSphere === true,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
        userTimeZone
      });
      await createAiBillingSystemNotification({ userId: req.user!.id, eventKey: `ai-billing:generate-task:${randomUUID()}`, creditsSpentMilli: result.billing.creditsSpentMilli, content: (credits) => `Задача «${result.task.title}» сформирована ИИ. Потрачено кредитов: ${credits.replace(/ кредит(?:а|ов)?$/, '')}.` });
      res.json(result);
    } catch (error) {
      sendAiError(res, error);
    }
  }
};
