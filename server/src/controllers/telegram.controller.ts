import { Request, Response } from 'express';
import { telegramService } from '../services/telegram.service.js';
import { telegramUpdateQueue } from '../services/telegram-update-queue.service.js';

type TelegramControllerDependencies = {
  queue: Pick<typeof telegramUpdateQueue, 'enqueue'>;
  service: Pick<typeof telegramService, 'isEnabled' | 'isWebhookAuthorized'>;
};

export const createTelegramController = ({
  queue = telegramUpdateQueue,
  service = telegramService
}: Partial<TelegramControllerDependencies> = {}) => ({
  webhook: async (req: Request, res: Response) => {
    const update = req.body ?? {};
    const updateId = typeof update.update_id === 'number' ? update.update_id : 'unknown';
    console.info(`[TelegramWebhook] received updateId=${updateId} hasMessage=${Boolean(update.message)} hasCallback=${Boolean(update.callback_query)}`);

    if (!service.isEnabled()) {
      console.warn(`[TelegramWebhook] rejected updateId=${updateId}: bot token is not configured`);
      res.status(503).json({ error: 'Telegram bot is not configured' });
      return;
    }

    if (!service.isWebhookAuthorized(req.headers as Record<string, unknown>)) {
      console.warn(`[TelegramWebhook] rejected updateId=${updateId}: invalid webhook secret`);
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId)) {
      res.status(400).json({ error: 'Invalid Telegram update_id' });
      return;
    }

    const result = await queue.enqueue(updateId, update);
    console.info(`[TelegramWebhook] ${result} updateId=${updateId}`);
    res.json({ ok: true });
  }
});

export const telegramController = createTelegramController();
