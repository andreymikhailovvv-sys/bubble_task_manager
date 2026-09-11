import { Request, Response } from 'express';

const TELEGRAM_RELAY_TIMEOUT_MS = 12_000;
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

type FetchImplementation = typeof fetch;

const relayEnabled = () => process.env.TELEGRAM_RELAY_ENABLED?.trim().toLowerCase() === 'true';

const getUpdateId = (body: unknown): number | 'unknown' => {
  if (typeof body !== 'object' || body === null || !('update_id' in body)) return 'unknown';
  return typeof body.update_id === 'number' ? body.update_id : 'unknown';
};

const getTargetUrl = (): URL | null => {
  const configuredUrl = process.env.TELEGRAM_RELAY_TARGET_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const targetUrl = new URL(configuredUrl);
    return targetUrl.protocol === 'https:' ? targetUrl : null;
  } catch {
    return null;
  }
};

export const createTelegramRelayController = (fetchImplementation: FetchImplementation = fetch) => ({
  webhook: async (req: Request, res: Response) => {
    if (!relayEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const sourceSecret = process.env.TELEGRAM_RELAY_SOURCE_SECRET?.trim();
    const targetUrl = getTargetUrl();
    if (!sourceSecret || !targetUrl) {
      console.error('[TelegramRelay] relay is enabled but configuration is incomplete');
      res.status(503).json({ error: 'Telegram relay is not configured' });
      return;
    }

    if (req.get(SECRET_HEADER) !== sourceSecret) {
      console.warn('[TelegramRelay] rejected request: invalid source secret');
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    const updateId = getUpdateId(req.body);
    const startedAt = Date.now();
    console.info(`[TelegramRelay] received updateId=${updateId}`);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), TELEGRAM_RELAY_TIMEOUT_MS);
    try {
      const targetSecret = process.env.TELEGRAM_RELAY_TARGET_SECRET?.trim();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (targetSecret) headers[SECRET_HEADER] = targetSecret;

      const targetResponse = await fetchImplementation(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body ?? {}),
        signal: abortController.signal
      });
      await targetResponse.body?.cancel();

      const durationMs = Date.now() - startedAt;
      if (!targetResponse.ok) {
        console.error(`[TelegramRelay] forward failed updateId=${updateId} status=${targetResponse.status} durationMs=${durationMs} targetHost=${targetUrl.hostname}`);
        res.status(502).json({ error: 'Telegram relay target rejected the update' });
        return;
      }

      console.info(`[TelegramRelay] forwarded updateId=${updateId} status=${targetResponse.status} durationMs=${durationMs} targetHost=${targetUrl.hostname}`);
      res.status(200).json({ ok: true });
    } catch {
      const durationMs = Date.now() - startedAt;
      const status = abortController.signal.aborted ? 504 : 502;
      console.error(`[TelegramRelay] forward failed updateId=${updateId} durationMs=${durationMs} targetHost=${targetUrl.hostname}`);
      res.status(status).json({ error: status === 504 ? 'Telegram relay target timed out' : 'Telegram relay target is unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  }
});

export const telegramRelayController = createTelegramRelayController();
