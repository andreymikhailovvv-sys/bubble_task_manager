import { Request, Response } from 'express';
import { aiAssistantService } from '../services/ai-assistant.service.js';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
  size: number;
};

export const aiController = {
  askTaskAssistant: async (req: Request, res: Response) => {
    try {
      const { question, history } = req.body as {
        question?: string;
        history?: ChatMessage[];
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
        historyLength: Array.isArray(history) ? history.length : 0
      });

      const result = await aiAssistantService.askTaskAssistant({
        userId: req.user!.id,
        taskId: req.params.id,
        question,
        history: Array.isArray(history) ? history : [],
        mode,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : []
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
        historyLength: Array.isArray(req.body?.history) ? req.body.history.length : null,
        error: message,
        stack: error instanceof Error ? error.stack : null
      });
      res.status(500).json({ error: message });
    }
  },
  generateSubtasks: async (req: Request, res: Response) => {
    try {
      const result = await aiAssistantService.generateSubtasks({
        userId: req.user!.id,
        taskId: req.params.id
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
      const result = await aiAssistantService.generateOverdueTaskNudge({
        userId: req.user!.id,
        taskId: req.params.id
      });
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
      const result = await aiAssistantService.generateTaskFromPrompt({
        userId: req.user!.id,
        prompt,
        sphereId: typeof req.body?.sphereId === 'string' ? req.body.sphereId : null,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : []
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
    }
  }
};
