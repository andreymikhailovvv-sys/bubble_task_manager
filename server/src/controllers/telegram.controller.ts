import { Request, Response } from 'express';
import { telegramService } from '../services/telegram.service.js';

export const telegramController = {
  webhook: async (req: Request, res: Response) => {
    const update = req.body ?? {};
    const updateId = typeof update.update_id === 'number' ? update.update_id : 'unknown';
    console.info(`[TelegramWebhook] received updateId=${updateId} hasMessage=${Boolean(update.message)} hasCallback=${Boolean(update.callback_query)}`);

    if (!telegramService.isEnabled()) {
      console.warn(`[TelegramWebhook] rejected updateId=${updateId}: bot token is not configured`);
      res.status(503).json({ error: 'Telegram bot is not configured' });
      return;
    }

    if (!telegramService.isWebhookAuthorized(req.headers as Record<string, unknown>)) {
      console.warn(`[TelegramWebhook] rejected updateId=${updateId}: invalid webhook secret`);
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    await telegramService.processWebhookUpdate(update);
    console.info(`[TelegramWebhook] processed updateId=${updateId}`);
    res.json({ ok: true });
  }
};
