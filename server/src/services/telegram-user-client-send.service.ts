import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Api, TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { prisma } from '../db/prisma.js';
import { canUseTelegramUserClient } from '../lib/telegram-user-client-access.js';
import { decryptTelegramAppCredentials } from '../lib/telegram-user-app-credentials.js';
import { decryptTelegramUserSession } from '../lib/telegram-user-client-crypto.js';
import { telegramUserClientNetworkOptions } from '../lib/telegram-user-client-network.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';

// Manual-only administrative pilot. Nothing under the AI tools layer imports this service.
// A preview ticket is process-local and deliberately lost on restart / redeploy.
const PREVIEW_TTL_MS = 90_000;
const MAX_PENDING_PREVIEWS = 30;
const MAX_TEXT_CHARS = 1000;
const MAX_TEXT_BYTES = 4096;
const MAX_PER_10_MIN = 3;
const MAX_PER_DAY = 12;
const MIN_SEND_GAP_MS = 20_000;

export type ManualTelegramTarget = 'saved' | 'username';
export type ManualTelegramSendStatus = 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';

type Draft = {
  id: string;
  userId: string;
  kind: ManualTelegramTarget;
  username: string | null;
  recipientId: string;
  recipientName: string;
  text: string;
  telegramAccountId: string;
  expiresAt: number;
};
const drafts = new Map<string, Draft>();

export function normalizeManualTelegramRequest(kind: unknown, username: unknown, text: unknown): { kind: ManualTelegramTarget; username: string | null; text: string } {
  if (kind !== 'saved' && kind !== 'username') {
    throw new TelegramUserClientError(400, 'Выберите «Избранное» или получателя по @username');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS ||
      Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new TelegramUserClientError(400, 'Сообщение должно содержать от 1 до 1000 символов (не более 4 КБ)');
  }
  let normalizedUsername: string | null = null;
  if (kind === 'username') {
    if (typeof username !== 'string' || !/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) {
      throw new TelegramUserClientError(400, 'Укажите Telegram @username пользователя');
    }
    normalizedUsername = username.toLowerCase();
  }
  return { kind, username: normalizedUsername, text };
}

export function isManualTelegramSendingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TELEGRAM_USER_CLIENT_ENABLED === 'true' && env.TELEGRAM_USER_SEND_ENABLED === 'true';
}

function assertSendEnabled() {
  if (!isManualTelegramSendingEnabled()) {
    throw new TelegramUserClientError(403, 'Ручная отправка отключена на сервере: TELEGRAM_USER_SEND_ENABLED');
  }
}

export type ConnectionRecord = { encryptedSession: string; encryptedApiCredentials: string; telegramAccountId: string; userId: string };

export async function connectedOwner(userId: string): Promise<ConnectionRecord> {
  assertSendEnabled();
  if (!userId || userId.length > 128) throw new TelegramUserClientError(400, 'Некорректный пользователь');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramChatId: true,
      telegramUserClientConnection: {
        select: { pilotEnabled: true, encryptedSession: true, encryptedApiCredentials: true, telegramAccountId: true, connectedAt: true }
      }
    }
  });
  if (!user) throw new TelegramUserClientError(404, 'Пользователь не найден');
  const connection = user.telegramUserClientConnection;
  if (!canUseTelegramUserClient(connection?.pilotEnabled === true) ||
      !connection?.encryptedSession || !connection.encryptedApiCredentials || !connection.telegramAccountId || !connection.connectedAt ||
      user.telegramChatId !== connection.telegramAccountId) {
    throw new TelegramUserClientError(403, 'Сессия или разрешение Telegram недействительны');
  }
  return { userId, encryptedSession: connection.encryptedSession, encryptedApiCredentials: connection.encryptedApiCredentials, telegramAccountId: connection.telegramAccountId };
}

function appCredentials(owner: ConnectionRecord): { apiId: number; apiHash: string } {
  return decryptTelegramAppCredentials(owner.userId, owner.encryptedApiCredentials);
}

export async function openClient(owner: ConnectionRecord): Promise<TelegramClient> {
  const credentials = appCredentials(owner);
  const plaintext = decryptTelegramUserSession(owner.encryptedSession, owner.userId);
  const client = new TelegramClient(new StringSession(plaintext), credentials.apiId, credentials.apiHash, {
    connectionRetries: 1,
    ...telegramUserClientNetworkOptions()
  });
  try {
    await client.connect();
    const me = await client.getMe();
    if (String(me.id) !== owner.telegramAccountId || Boolean(me.bot)) {
      throw new TelegramUserClientError(409, 'Аккаунт Telegram не совпадает с подключённым пользователем');
    }
    return client;
  } catch (error) {
    try { await client.disconnect(); } catch { /* best effort */ }
    throw error;
  }
}

async function resolveRecipient(client: TelegramClient, kind: ManualTelegramTarget, username: string | null) {
  if (kind === 'saved') {
    const me = await client.getMe();
    return { id: String(me.id), name: 'Избранное (себе)', entity: await client.getInputEntity('me') };
  }
  if (!username) throw new TelegramUserClientError(400, 'Получатель не указан');
  const entity = await client.getEntity(username);
  if (!(entity instanceof Api.User) || entity.bot || entity.deleted) {
    throw new TelegramUserClientError(400, 'Разрешена отправка только личному Telegram-пользователю (не боту или группе)');
  }
  const label = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim() || username;
  return { id: String(entity.id), name: label.slice(0, 100), entity };
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, item] of drafts) if (item.expiresAt <= now) drafts.delete(id);
}

export function checkManualTelegramSendWindow(times: Date[], now: number = Date.now()): number {
  const sorted = times.map((time) => time.getTime())
    .filter((time) => Number.isFinite(time) && time > now - 24 * 60 * 60_000)
    .sort((a, b) => b - a);
  const last10 = sorted.filter((time) => time > now - 10 * 60_000);
  const deadlines: number[] = [];
  if (sorted.length >= MAX_PER_DAY) deadlines.push(sorted[MAX_PER_DAY - 1] + 24 * 60 * 60_000);
  if (last10.length >= MAX_PER_10_MIN) deadlines.push(last10[MAX_PER_10_MIN - 1] + 10 * 60_000);
  if (sorted.length) deadlines.push(sorted[0] + MIN_SEND_GAP_MS);
  const deadline = Math.max(now, ...deadlines);
  return deadline > now ? Math.max(1, Math.ceil((deadline - now) / 1000)) : 0;
}

async function claimSend(item: Draft) {
  try {
    await prisma.$transaction(async (tx) => {
      // Repeat permission checks inside the serializable transaction. The remote
      // send happens *only after* the audit slot is durably committed.
      const linked = await tx.user.findUnique({
        where: { id: item.userId },
        select: { telegramChatId: true, telegramUserClientConnection: {
          select: { pilotEnabled: true, encryptedSession: true, telegramAccountId: true }
        } }
      });
      const c = linked?.telegramUserClientConnection;
      if (!canUseTelegramUserClient(c?.pilotEnabled === true) || !c?.encryptedSession ||
          c.telegramAccountId !== item.telegramAccountId || linked?.telegramChatId !== item.telegramAccountId) {
        throw new TelegramUserClientError(403, 'Доступ к Telegram отозван');
      }
      assertSendEnabled();
      const now = Date.now();
      const recent = await tx.telegramUserClientSendAudit.findMany({
        where: { userId: item.userId, createdAt: { gte: new Date(now - 24 * 60 * 60_000) } },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_DAY,
        select: { createdAt: true }
      });
      const retry = checkManualTelegramSendWindow(recent.map((x) => x.createdAt), now);
      if (retry) throw new TelegramUserClientError(429, 'Достигнут лимит отправки. Повторите позже');
      await tx.telegramUserClientSendAudit.create({
        data: { id: item.id, userId: item.userId, recipientKind: item.kind,
          recipientTelegramId: item.recipientId, result: 'PENDING' }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof TelegramUserClientError) throw error;
    // P2002 duplicate ID or P2034 serializable conflict: never resend blindly.
    throw new TelegramUserClientError(409, 'Попытка отправки уже обрабатывается или конфликтует с другой');
  }
}

async function finalize(id: string, result: ManualTelegramSendStatus) {
  await prisma.telegramUserClientSendAudit.updateMany({
    where: { id, result: 'PENDING' }, data: { result, completedAt: new Date() }
  });
}

export const telegramUserClientSend = {
  async status(userId: string) {
    // Do not reveal audit or enabled state without admin password (enforced in route).
    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!owner) throw new TelegramUserClientError(404, 'Пользователь не найден');
    const audit = await prisma.telegramUserClientSendAudit.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, recipientKind: true, recipientTelegramId: true, result: true, createdAt: true, completedAt: true }
    });
    return { enabled: isManualTelegramSendingEnabled(),
      aiDraftEnabled: isManualTelegramSendingEnabled() && process.env.TELEGRAM_USER_AI_DRAFT_ENABLED === 'true',
      audit };
  },

  async preview(userId: string, kind: unknown, username: unknown, text: unknown) {
    const input = normalizeManualTelegramRequest(kind, username, text);
    const owner = await connectedOwner(userId);
    cleanExpired();
    // A new request invalidates a prior preview even if recipient lookup fails.
    drafts.delete(userId);
    if (drafts.size >= MAX_PENDING_PREVIEWS) {
      throw new TelegramUserClientError(429, 'Слишком много неподтверждённых сообщений');
    }
    const client = await openClient(owner);
    try {
      const recipient = await resolveRecipient(client, input.kind, input.username);
      if (input.kind === 'username' && recipient.id === owner.telegramAccountId) {
        throw new TelegramUserClientError(400, 'Для сообщения себе выберите «Избранное»');
      }
      // Delete older preview: only one unspent ticket per user.
      const id = randomUUID();
      const item: Draft = { id, userId, kind: input.kind, username: input.username,
        recipientId: recipient.id, recipientName: recipient.name, text: input.text,
        telegramAccountId: owner.telegramAccountId, expiresAt: Date.now() + PREVIEW_TTL_MS };
      drafts.set(userId, item);
      return { confirmationId: id, recipientName: recipient.name, recipientId: recipient.id,
        recipientKind: input.kind, text: input.text, expiresAt: item.expiresAt };
    } catch (error) {
      if (error instanceof TelegramUserClientError) throw error;
      // Do not include raw Telegram error, username or session in logs.
      console.error('[TelegramUserClient] recipient preview failed', { category: 'mtproto_resolution' });
      throw new TelegramUserClientError(503, 'Не удалось проверить получателя Telegram');
    } finally {
      try { await client.disconnect(); } catch { /* no secrets */ }
    }
  },

  async confirm(userId: string, confirmationId: unknown) {
    if (typeof confirmationId !== 'string' || !/^[0-9a-f-]{36}$/.test(confirmationId)) {
      throw new TelegramUserClientError(400, 'Некорректный код подтверждения');
    }
    const item = drafts.get(userId);
    // Single-use, consumed *before* any async operation. No retry of unknown sends.
    if (!item || item.id !== confirmationId || item.expiresAt < Date.now()) {
      throw new TelegramUserClientError(409, 'Подтверждение истекло или уже использовано. Создайте новый предварительный просмотр');
    }
    drafts.delete(userId);
    await connectedOwner(userId);
    await claimSend(item);
    let sendStarted = false;
    let client: TelegramClient | null = null;
    try {
      const owner = await connectedOwner(userId);
      if (owner.telegramAccountId !== item.telegramAccountId) {
        throw new TelegramUserClientError(409, 'Аккаунт Telegram изменился');
      }
      client = await openClient(owner);
      const recipient = await resolveRecipient(client, item.kind, item.username);
      if (recipient.id !== item.recipientId) {
        throw new TelegramUserClientError(409, 'Получатель изменился. Подтвердите сообщение заново');
      }
      // Recheck gate and owner immediately before network side effect.
      const check = await connectedOwner(userId);
      if (check.telegramAccountId !== item.telegramAccountId ||
          check.encryptedSession !== owner.encryptedSession) {
        throw new TelegramUserClientError(409, 'Сессия Telegram изменилась');
      }
      sendStarted = true;
      // formattingEntities=[] sends the literal text; linkPreview=false prevents
      // remote link previews. Never forward, schedule, or auto-send.
      await client.sendMessage(recipient.entity, {
        message: item.text, formattingEntities: [], linkPreview: false
      });
      await finalize(item.id, 'SENT');
      console.info('[TelegramUserClient] manual message sent', { auditId: item.id, recipientKind: item.kind });
      return { ok: true, auditId: item.id };
    } catch (error) {
      const result: ManualTelegramSendStatus = sendStarted ? 'UNKNOWN' : 'FAILED';
      try { await finalize(item.id, result); } catch { /* retain PENDING: treat as unknown */ }
      console.warn('[TelegramUserClient] manual send ended', { auditId: item.id, result });
      if (sendStarted) {
        throw new TelegramUserClientError(503, 'Результат отправки неизвестен. Проверьте Telegram вручную, не повторяйте отправку автоматически');
      }
      if (error instanceof TelegramUserClientError) throw error;
      throw new TelegramUserClientError(503, 'Не удалось подготовить отправку Telegram');
    } finally {
      if (client) try { await client.disconnect(); } catch { /* best effort */ }
    }
  }
};
