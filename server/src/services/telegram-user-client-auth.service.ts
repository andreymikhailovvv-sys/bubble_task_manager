import { randomUUID } from 'node:crypto';
import qrcode from 'qrcode';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { prisma } from '../db/prisma.js';
import { canUseTelegramUserClient } from '../lib/telegram-user-client-access.js';
import { encryptTelegramAppCredentials, decryptTelegramAppCredentials, validateTelegramAppCredentials } from '../lib/telegram-user-app-credentials.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { decryptTelegramUserSession, encryptTelegramUserSession } from '../lib/telegram-user-client-crypto.js';
import { matchesBotLinkedTelegramAccount } from '../lib/telegram-user-client-binding.js';
import { classifyTelegramUserNetworkError, telegramUserClientNetworkOptions } from '../lib/telegram-user-client-network.js';

// A login is deliberately process-local. A restarted process requires a fresh QR.
// Do not distribute these endpoints across replicas without sticky sessions/Redis ownership.
const ATTEMPT_TTL_MS = 180_000;
const MAX_PENDING_ATTEMPTS = 5;
const MAX_PASSWORD_SUBMISSIONS = 3;
type State = 'starting' | 'qr' | 'password_required' | 'verifying_password' | 'connected' | 'failed' | 'cancelled';
type Client = TelegramClient;
type Attempt = {
  id: string;
  userId: string;
  expectedTelegramId: string;
  credentialCipher: string;
  client: Client;
  controller: AbortController;
  createdAt: number;
  expiresAt: number;
  status: State;
  qrDataUrl: string | null;
  qrExpiresAt: number | null;
  passwordHint: string | null;
  error: string | null;
  passwordCount: number;
  passwordResolver: ((value: string) => void) | null;
  passwordRejecter: ((error: Error) => void) | null;
  timer: ReturnType<typeof setTimeout>;
};
const attempts = new Map<string, Attempt>();
const credentialUpdates = new FixedWindowRateLimiter(5, 60 * 60_000);

export class TelegramUserClientError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

function config(userId: string, encrypted: string): { apiId: number; apiHash: string } {
  if (!/^[a-f0-9]{64}$/i.test(process.env.TELEGRAM_USER_SESSION_KEY ?? '')) {
    throw new TelegramUserClientError(503, 'Шифрование Telegram на сервере недоступно');
  }
  return decryptTelegramAppCredentials(userId, encrypted);
}

async function eligible(userId: string, requireBotLink = true) {
  if (process.env.TELEGRAM_USER_CLIENT_ENABLED !== 'true') {
    throw new TelegramUserClientError(403, 'Telegram-ассистент пока отключён на сервере');
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramChatId: true, telegramUserClientConnection: { select: { pilotEnabled: true, encryptedSession: true, encryptedApiCredentials: true, connectedAt: true } } }
  });
  if (!user) throw new TelegramUserClientError(404, 'Пользователь не найден');
  if (!canUseTelegramUserClient(user.telegramUserClientConnection?.pilotEnabled === true) || !user.telegramUserClientConnection?.encryptedApiCredentials) {
    throw new TelegramUserClientError(403, 'Сначала укажите Telegram API ID и API Hash в Интеграциях');
  }
  if (requireBotLink && (!user.telegramChatId || !/^\d+$/.test(user.telegramChatId))) {
    throw new TelegramUserClientError(409, 'Сначала привяжите Telegram-бота Планировыча к этому аккаунту');
  }
  return user;
}

function safeState(attempt: Attempt | undefined) {
  if (!attempt) return { status: 'idle' as const, attemptId: null, qrDataUrl: null, qrExpiresAt: null, passwordHint: null, error: null };
  return {
    status: attempt.status,
    attemptId: attempt.id,
    qrDataUrl: attempt.status === 'qr' ? attempt.qrDataUrl : null,
    qrExpiresAt: attempt.status === 'qr' ? attempt.qrExpiresAt : null,
    passwordHint: attempt.status === 'password_required' ? attempt.passwordHint : null,
    error: attempt.error
  };
}

function release(attempt: Attempt, status: 'failed' | 'cancelled', message: string) {
  if (attempts.get(attempt.userId) !== attempt) return;
  attempt.controller.abort();
  clearTimeout(attempt.timer);
  attempt.passwordRejecter?.(new Error('Авторизация отменена'));
  attempt.passwordResolver = null;
  attempt.passwordRejecter = null;
  attempt.status = status;
  attempt.error = message;
  attempt.qrDataUrl = null;
  attempt.qrExpiresAt = null;
  // Show the result in the admin UI until the next explicit login.
}

async function cleanupClient(attempt: Attempt, linked: boolean) {
  try {
    if (!linked && await attempt.client.isUserAuthorized()) {
      // Do not leave an unmatched/aborted authorization alive in Telegram.
      await attempt.client.logOut();
    } else {
      await attempt.client.disconnect();
    }
  } catch {
    try { await attempt.client.disconnect(); } catch { /* best effort; don't log secrets */ }
  }
}

async function runLogin(attempt: Attempt, credentials: {apiId: number; apiHash: string}) {
  let stored = false;
  try {
    await attempt.client.connect();
    const me = await attempt.client.signInUserWithQrCode(credentials, {
      abortSignal: attempt.controller.signal,
      onError: async (error: Error) => {
        // Do not log Telegram error objects; they can include sensitive metadata.
        if (attempt.controller.signal.aborted) return true;
        if (attempt.status === 'verifying_password' && attempt.passwordCount < MAX_PASSWORD_SUBMISSIONS) return false;
        return true;
      },
      qrCode: async ({token, expires}: {token: Buffer; expires: number}) => {
        if (attempt.controller.signal.aborted) throw new Error('Login cancelled');
        const url = 'tg://login?token=' + token.toString('base64url');
        attempt.qrDataUrl = await qrcode.toDataURL(url, {errorCorrectionLevel: 'M', width: 280, margin: 2});
        attempt.qrExpiresAt = expires * 1000;
        attempt.passwordHint = null;
        attempt.status = 'qr';
      },
      password: async (hint?: string) => {
        if (attempt.controller.signal.aborted) throw new Error('Login cancelled');
        attempt.status = 'password_required';
        attempt.passwordHint = typeof hint === 'string' ? hint.slice(0, 80) : null;
        attempt.qrDataUrl = null;
        return await new Promise<string>((resolve, reject) => {
          attempt.passwordResolver = resolve;
          attempt.passwordRejecter = reject;
        });
      }
    });
    if (attempt.controller.signal.aborted) throw new Error('Login cancelled');
    const telegramId = String(me.id);
    if (!matchesBotLinkedTelegramAccount(attempt.expectedTelegramId, telegramId, Boolean('bot' in me && me.bot))) {
      throw new TelegramUserClientError(409, 'Telegram-аккаунт не совпадает с выбранным пользователем Планировыча');
    }
    const owner = await eligible(attempt.userId);
    if (owner.telegramChatId !== telegramId || owner.telegramUserClientConnection?.encryptedSession) {
      throw new TelegramUserClientError(409, 'Привязка Telegram изменилась во время авторизации');
    }
    const session = String((attempt.client.session as StringSession).save());
    const encryptedSession = encryptTelegramUserSession(session, attempt.userId);
    // Credential revocation must win against any in-flight QR authorization.
    const saved = await prisma.telegramUserClientConnection.updateMany({
      where: { userId: attempt.userId, pilotEnabled: true, encryptedSession: null,
        encryptedApiCredentials: attempt.credentialCipher },
      data: { encryptedSession, telegramAccountId: telegramId, connectedAt: new Date() }
    });
    if (saved.count !== 1 || attempt.controller.signal.aborted) {
      if (saved.count === 1) {
        await prisma.telegramUserClientConnection.updateMany({
          where: { userId: attempt.userId, telegramAccountId: telegramId },
          data: { encryptedSession: null, connectedAt: null, telegramAccountId: null }
        });
      }
      throw new TelegramUserClientError(409, 'Авторизация отменена или доступ закрыт');
    }
    stored = true;
    attempt.status = 'connected';
    attempt.qrDataUrl = null;
    attempt.qrExpiresAt = null;
    attempt.passwordHint = null;
    clearTimeout(attempt.timer);
  } catch (error) {
    if (attempt.status !== 'cancelled' && attempt.status !== 'failed') {
      const category = classifyTelegramUserNetworkError(error);
      console.error('[TelegramUserClient] authorization failed', { phase: attempt.status, category });
      const message = error instanceof TelegramUserClientError ? error.message
        : attempt.controller.signal.aborted ? 'Время авторизации истекло'
        : category === 'proxy_rejected'
          ? 'Прокси отклонил соединение с Telegram. Проверьте прокси на сервере'
          : category === 'proxy_timeout' || category === 'network_timeout' || category === 'network_unavailable'
            ? 'Нет соединения с серверами Telegram по MTProto. Проверьте доступность прокси'
            : 'Не удалось подключить Telegram. Проверьте настройки и повторите попытку';
      release(attempt, 'failed', message);
    }
  } finally {
    await cleanupClient(attempt, stored);
  }
}

export const telegramUserClientAuth = {
  async getStatus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramUserClientConnection: { select: { pilotEnabled: true, connectedAt: true, encryptedApiCredentials: true } } }
    });
    if (!user) throw new TelegramUserClientError(404, 'Пользователь не найден');
    return {
      enabled: process.env.TELEGRAM_USER_CLIENT_ENABLED === 'true',
      credentialsSet: Boolean(user.telegramUserClientConnection?.encryptedApiCredentials),
      readEnabled: process.env.TELEGRAM_USER_CLIENT_ENABLED === 'true' &&
        process.env.TELEGRAM_USER_READ_ENABLED === 'true',
      connected: Boolean(user.telegramUserClientConnection?.connectedAt && user.telegramUserClientConnection?.encryptedApiCredentials),
      ...safeState(attempts.get(userId))
    };
  },
  async configure(userId: string, apiId: unknown, apiHash: unknown) {
    if (process.env.TELEGRAM_USER_CLIENT_ENABLED !== 'true') throw new TelegramUserClientError(403, 'Интеграция Telegram отключена на сервере');
    if (!credentialUpdates.consume(userId).allowed) throw new TelegramUserClientError(429, 'Слишком много попыток настройки. Повторите позже');
    let credentials;
    try { credentials = validateTelegramAppCredentials(apiId, apiHash); }
    catch { throw new TelegramUserClientError(400, 'Введите корректные API ID и API Hash из my.telegram.org'); }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, telegramUserClientConnection: { select: { connectedAt: true, encryptedSession: true } } } });
    if (user?.telegramUserClientConnection?.connectedAt || user?.telegramUserClientConnection?.encryptedSession) throw new TelegramUserClientError(409, 'Сначала отключите текущее подключение в интеграциях');
    if (!user?.telegramChatId) throw new TelegramUserClientError(409, 'Сначала привяжите Telegram-бота Планировыча');
    if (['starting', 'qr', 'password_required', 'verifying_password'].includes(attempts.get(userId)?.status ?? '')) {
      throw new TelegramUserClientError(409, 'Завершите или отмените текущий вход');
    }
    const encryptedApiCredentials = encryptTelegramAppCredentials(userId, credentials);
    await prisma.telegramUserClientConnection.upsert({
      where: { userId },
      create: { userId, pilotEnabled: true, encryptedApiCredentials },
      update: { pilotEnabled: true, encryptedApiCredentials, encryptedSession: null, connectedAt: null, telegramAccountId: null }
    });
    return { ok: true, credentialsSet: true };
  },
  async begin(userId: string) {
    // Release long-completed outcomes to avoid unbounded admin-session memory growth.
    for (const [key, old] of attempts) {
      if (!['starting', 'qr', 'password_required', 'verifying_password'].includes(old.status) && Date.now() > old.expiresAt + 600_000) {
        attempts.delete(key);
      }
    }
    const user = await eligible(userId);
    const credentials = config(userId, user.telegramUserClientConnection!.encryptedApiCredentials!);
    if (user.telegramUserClientConnection?.encryptedSession) {
      throw new TelegramUserClientError(409, 'Telegram уже подключён; сначала отключите прежнюю сессию');
    }
    const existing = attempts.get(userId);
    if (existing && ['starting', 'qr', 'password_required', 'verifying_password'].includes(existing.status)) {
      throw new TelegramUserClientError(409, 'Подключение уже выполняется: отмените или завершите текущую попытку');
    }
    const pending = [...attempts.values()].filter(x=>['starting','qr','password_required','verifying_password'].includes(x.status));
    if (pending.length >= MAX_PENDING_ATTEMPTS) throw new TelegramUserClientError(429, 'Слишком много одновременных подключений');
    const controller = new AbortController();
    const attempt: Attempt = {
      id: randomUUID(), userId, expectedTelegramId: user.telegramChatId!, credentialCipher: user.telegramUserClientConnection!.encryptedApiCredentials!,
      controller, client: new TelegramClient(new StringSession(''), credentials.apiId, credentials.apiHash, {
        connectionRetries: 2,
        ...telegramUserClientNetworkOptions()
      }), createdAt: Date.now(), expiresAt: Date.now() + ATTEMPT_TTL_MS,
      status: 'starting', qrDataUrl: null, qrExpiresAt: null, passwordHint: null, error: null,
      passwordCount: 0, passwordResolver: null, passwordRejecter: null,
      timer: setTimeout(() => {}, ATTEMPT_TTL_MS)
    };
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => release(attempt, 'failed', 'Время подключения истекло'), ATTEMPT_TTL_MS);
    attempt.timer.unref?.();
    attempts.set(userId, attempt);
    void runLogin(attempt, credentials);
    return { attemptId: attempt.id, status: attempt.status };
  },
  async submitPassword(userId: string, attemptId: string, password: string) {
    const attempt = attempts.get(userId);
    if (!attempt || attempt.id !== attemptId || attempt.status !== 'password_required' || !attempt.passwordResolver) {
      throw new TelegramUserClientError(409, 'Нет активного запроса пароля Telegram');
    }
    await eligible(userId);
    if (!password || password.length > 256 || attempt.passwordCount >= MAX_PASSWORD_SUBMISSIONS) {
      throw new TelegramUserClientError(400, 'Некорректный пароль или превышено число попыток');
    }
    attempt.passwordCount += 1;
    attempt.status = 'verifying_password';
    const resolver = attempt.passwordResolver;
    attempt.passwordResolver = null;
    attempt.passwordRejecter = null;
    resolver(password);
    return { ok: true };
  },
  async cancel(userId: string, attemptId: string) {
    const attempt = attempts.get(userId);
    if (!attempt || attempt.id !== attemptId) throw new TelegramUserClientError(404, 'Попытка авторизации не найдена');
    release(attempt, 'cancelled', 'Авторизация отменена');
    return { ok: true };
  },
  async disconnect(userId: string) {
    const attempt = attempts.get(userId);
    if (attempt) release(attempt, 'cancelled', 'Доступ отключён администратором');
    const connection = await prisma.telegramUserClientConnection.findUnique({
      where: { userId },
      select: { encryptedSession: true, encryptedApiCredentials: true }
    });
    const encrypted = connection?.encryptedSession ?? null;
    // Disable locally first even if Telegram is unreachable.
    await prisma.telegramUserClientConnection.updateMany({
      where: { userId }, data: { pilotEnabled: false, encryptedApiCredentials: null, encryptedSession: null, telegramAccountId: null, connectedAt: null }
    });
    if (!encrypted || !connection?.encryptedApiCredentials) return { ok: true, remoteLogout: 'not_needed' as const };
    try {
      const credentials = config(userId, connection.encryptedApiCredentials);
      const plaintext = decryptTelegramUserSession(encrypted, userId);
      const client = new TelegramClient(new StringSession(plaintext), credentials.apiId, credentials.apiHash, {
        connectionRetries: 1,
        ...telegramUserClientNetworkOptions()
      });
      await client.connect();
      const loggedOut = await client.logOut();
      return { ok: true, remoteLogout: loggedOut ? 'ok' as const : 'failed' as const };
    } catch {
      return { ok: true, remoteLogout: 'failed' as const };
    }
  },
  // Called when the admin disables the pilot; remote logout is best effort.
  async revoke(userId: string) { return this.disconnect(userId); }
};
