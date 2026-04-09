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
  }
};
