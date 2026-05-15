import { Request, Response } from 'express';
import { aiAssistantService } from '../services/ai-assistant.service.js';
import { telegramService } from '../services/telegram.service.js';
import { prisma } from '../db/prisma.js';

type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};
const DEFAULT_TIMEZONE = 'Europe/Moscow';
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
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
        messages: [
          { role: 'user', content: question.trim() },
          { role: 'assistant', content: result.answer }
        ]
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
    }
  },
  askTaskAssistant: async (req: Request, res: Response) => {
    try {
      const { question, userMessage } = req.body as {
        question?: string;
        userMessage?: string;
        mode?: 'fast' | 'smart';
        attachments?: ChatAttachment[];
      };

      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'question is required' });
        return;
      }

      const mode = req.body?.mode === 'smart' ? 'smart' : 'fast';
      console.info('[AI] /tasks/:id/ai-chat request received', {
        userId: req.user!.id,
        taskId: req.params.id,
        mode,
        questionLength: question.length,
        userMessageLength: typeof userMessage === 'string' ? userMessage.length : 0
      });

      const persistedHistory = await aiAssistantService.listTaskDialog({
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
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
        userTimeZone
      });

      const normalizedUserMessage = typeof userMessage === 'string' ? userMessage.trim() : '';
      await aiAssistantService.appendTaskDialogMessages({
        userId: req.user!.id,
        taskId: req.params.id,
        messages: normalizedUserMessage
          ? [
            { role: 'user', content: normalizedUserMessage },
            { role: 'assistant', content: result.answer }
          ]
          : [
            { role: 'assistant', content: result.answer }
          ]
      });

      console.info('[AI] /tasks/:id/ai-chat response sent', {
        userId: req.user!.id,
        taskId: req.params.id,
        mode,
        model: result.model,
        answerLength: result.answer.length
      });

      res.json(result);
    } catch (error) {
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
      res.status(500).json({ error: message });
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
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
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
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
    }
  },
  applyTimelineOptimization: async (req: Request, res: Response) => {
    try {
      const plan = Array.isArray(req.body?.plan) ? req.body.plan : [];
      const result = await aiAssistantService.applyTimelineOptimization({ userId: req.user!.id, plan });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
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
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
    }
  }
};
