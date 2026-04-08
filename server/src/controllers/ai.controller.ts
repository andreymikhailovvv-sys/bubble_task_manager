import { Request, Response } from 'express';
import { aiAssistantService } from '../services/ai-assistant.service.js';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const aiController = {
  askTaskAssistant: async (req: Request, res: Response) => {
    try {
      const { question, history } = req.body as {
        question?: string;
        history?: ChatMessage[];
        mode?: 'fast' | 'full';
      };

      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'question is required' });
        return;
      }

      const result = await aiAssistantService.askTaskAssistant({
        taskId: req.params.id,
        question,
        history: Array.isArray(history) ? history : [],
        mode: req.body?.mode === 'full' ? 'full' : 'fast'
      });

      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      res.status(500).json({ error: message });
    }
  }
};
