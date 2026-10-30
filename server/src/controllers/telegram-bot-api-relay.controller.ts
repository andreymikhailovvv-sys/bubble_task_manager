import crypto from 'node:crypto';
import { type Request, type Response } from 'express';

const SECRET_HEADER = 'x-telegram-outbound-relay-secret';
const MAX_UPSTREAM_BYTES = 22 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
const ALLOWED_METHODS = new Set([
  'sendMessage', 'sendPhoto', 'editMessageText',
  'editMessageReplyMarkup', 'answerCallbackQuery', 'getFile'
]);
type RelayPart = { name: string; value: string } |
  { name: string; base64: string; filename: string; mimeType: string };
type RelayEnvelope =
  { kind: 'api'; method: string; payload: Record<string, unknown> } |
  { kind: 'multipart'; method: 'sendPhoto'; parts: RelayPart[] } |
  { kind: 'file'; path: string };

const validSecret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value);

function authorized(expected: string, actual: string | undefined): boolean {
  if (!actual || !validSecret(actual) || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function parseBotApiRelayEnvelope(value: unknown): RelayEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  const body = value as Record<string, unknown>;
  if (body.kind === 'api' && typeof body.method === 'string' && ALLOWED_METHODS.has(body.method) &&
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) {
    return { kind: 'api', method: body.method, payload: body.payload as Record<string, unknown> };
  }
  if (body.kind === 'file' && typeof body.path === 'string' &&
      body.path.length <= 512 && /^[a-zA-Z0-9_./-]+$/.test(body.path) &&
      body.path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')) {
    return { kind: 'file', path: body.path };
  }
  if (body.kind === 'multipart' && body.method === 'sendPhoto' &&
      Array.isArray(body.parts) && body.parts.length > 0 && body.parts.length <= 8) {
    let foundPhoto = false;
    const parts: RelayPart[] = [];
    for (const part of body.parts) {
      if (!part || typeof part !== 'object') return null;
      if (part.name === 'photo' && !foundPhoto && typeof part.base64 === 'string' &&
          part.base64.length <= Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 &&
          /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.base64) &&
          typeof part.filename === 'string' && part.filename.length <= 128 &&
          ['image/jpeg', 'image/png', 'image/webp'].includes(part.mimeType)) {
        foundPhoto = true;
        parts.push({ name: 'photo', base64: part.base64, filename: part.filename, mimeType: part.mimeType });
      } else if (['chat_id', 'caption', 'parse_mode'].includes(part.name) &&
          typeof part.value === 'string' && part.value.length <= 4096) {
        parts.push({ name: part.name, value: part.value });
      } else {
        return null;
      }
    }
    if (foundPhoto && parts.some(part => part.name === 'chat_id')) {
      return { kind: 'multipart', method: 'sendPhoto', parts };
    }
  }
  return null;
}

export const createTelegramBotApiRelayController = (fetchImplementation: typeof fetch = fetch) => ({
  forward: async (req: Request, res: Response) => {
    if (process.env.TELEGRAM_BOT_API_RELAY_ENABLED?.trim().toLowerCase() !== 'true') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const secret = process.env.TELEGRAM_BOT_API_RELAY_SECRET?.trim();
    if (!validSecret(secret)) {
      const reason = !secret ? 'shared_secret_missing' : 'shared_secret_invalid_format';
      console.error('[TelegramBotApiRelay] configuration error', { reason });
      res.status(503).json({ error: 'Outbound relay not configured', reason });
      return;
    }
    if (!authorized(secret, req.get(SECRET_HEADER))) {
      console.warn('[TelegramBotApiRelay] request rejected', {
        reason: 'relay_auth_failed',
        secretHeaderPresent: Boolean(req.get(SECRET_HEADER))
      });
      res.status(401).json({ error: 'Unauthorized', reason: 'relay_auth_failed' });
      return;
    }

    // Only the dedicated Timeweb bot token, stored as a Render environment
    // secret, is permitted. Never use the unrelated legacy TELEGRAM_BOT_TOKEN
    // and never accept Telegram tokens inside the HTTP payload.
    if (req.body && typeof req.body === 'object' && 'botToken' in req.body) {
      console.warn('[TelegramBotApiRelay] request rejected', { reason: 'bot_token_in_payload' });
      res.status(400).json({ error: 'Bot token must not be sent in request body', reason: 'bot_token_in_payload' });
      return;
    }
    const botToken = process.env.TELEGRAM_BOT_API_RELAY_BOT_TOKEN?.trim();
    if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
      const reason = !botToken ? 'outbound_bot_token_missing' : 'outbound_bot_token_invalid_format';
      console.error('[TelegramBotApiRelay] configuration error', { reason });
      res.status(503).json({ error: 'Outbound relay not configured', reason });
      return;
    }

    const envelope = parseBotApiRelayEnvelope(req.body);
    if (!envelope) {
      res.status(400).json({ error: 'Unsupported Telegram relay operation' });
      return;
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      let target: string;
      let init: RequestInit;
      if (envelope.kind === 'file') {
        const escapedPath = envelope.path.split('/').map(encodeURIComponent).join('/');
        target = `https://api.telegram.org/file/bot${botToken}/${escapedPath}`;
        init = { method: 'GET', redirect: 'error', signal: controller.signal };
      } else {
        target = `https://api.telegram.org/bot${botToken}/${envelope.method}`;
        if (envelope.kind === 'multipart') {
          const form = new FormData();
          for (const part of envelope.parts) {
            if ('base64' in part) {
              const bytes = Buffer.from(part.base64, 'base64');
              if (bytes.byteLength > MAX_UPLOAD_BYTES) {
                res.status(413).json({ error: 'Telegram upload too large' });
                return;
              }
              form.append(part.name, new Blob([bytes], { type: part.mimeType }), part.filename);
            } else {
              form.append(part.name, part.value);
            }
          }
          init = { method: 'POST', body: form, redirect: 'error', signal: controller.signal };
        } else {
          init = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope.payload),
            redirect: 'error',
            signal: controller.signal
          };
        }
      }
      const upstream = await fetchImplementation(target, init);
      const declaredSize = Number(upstream.headers.get('content-length') ?? 0);
      if (declaredSize > MAX_UPSTREAM_BYTES) {
        await upstream.body?.cancel();
        res.status(502).json({ error: 'Telegram response too large' });
        return;
      }
      // A bounded response buffer preserves Telegram's status/body for existing
      // callers, including binary file downloads used by voice messages.
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_UPSTREAM_BYTES) {
        res.status(502).json({ error: 'Telegram response too large' });
        return;
      }
      res.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
      res.set('Cache-Control', 'no-store');
      res.status(upstream.status).send(bytes);
      console.info('[TelegramBotApiRelay] completed', {
        operation: envelope.kind === 'file' ? 'file' : envelope.method,
        status: upstream.status,
        durationMs: Date.now() - started
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      console.warn('[TelegramBotApiRelay] upstream failure', {
        operation: envelope.kind === 'file' ? 'file' : envelope.method,
        timedOut,
        durationMs: Date.now() - started
      });
      res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'Telegram request timed out' : 'Telegram unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  }
});

export const telegramBotApiRelayController = createTelegramBotApiRelayController();
