import { Request, Response } from 'express';
import { telegramService } from '../services/telegram.service.js';

export const telegramController = {
  webhook: async (req: Request, res: Response) => {
    if (!telegramService.isEnabled()) {
      res.status(503).json({ error: 'Telegram bot is not configured' });
      return;
    }

    if (!telegramService.isWebhookAuthorized(req.headers as Record<string, unknown>)) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    await telegramService.processWebhookUpdate(req.body ?? {});
    res.json({ ok: true });
  }
};
