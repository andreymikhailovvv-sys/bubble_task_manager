import { Api, TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { prisma } from '../db/prisma.js';
import { canUseTelegramUserClient } from '../lib/telegram-user-client-access.js';
import { decryptTelegramAppCredentials } from '../lib/telegram-user-app-credentials.js';
import { decryptTelegramUserSession } from '../lib/telegram-user-client-crypto.js';
import { telegramUserClientNetworkOptions } from '../lib/telegram-user-client-network.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { buildTelegramAnalysisSnapshot } from '../lib/telegram-user-client-analysis-snapshot.js';
import { telegramSendTargetFromDialog } from './telegram-send-targets.service.js';
import { downloadTelegramMonitorMedia, MONITOR_MEDIA_MAX_ITEMS, MONITOR_MEDIA_MAX_TOTAL_BYTES, type TelegramMonitorMedia } from './telegram-ai-monitor-media.service.js';

// Closed, owner-only reader for PR5. This module is never exported as an AI tool.
// No dialogs, message texts, attachments, or peer-access data are persisted.
const MAX_SCANNED_DIALOGS = 150;
const MAX_VISIBLE_DIALOGS = 60;
const MAX_SEND_TARGETS = 120;
const HISTORY_LIMIT = 30;
const MAX_MESSAGE_CHARS = 4096;
const listLimiter = new FixedWindowRateLimiter(8, 5 * 60_000);
const historyLimiter = new FixedWindowRateLimiter(15, 5 * 60_000);
const monitorLimiter = new FixedWindowRateLimiter(40, 5 * 60_000);
const inFlight = new Set<string>();
export type TelegramPrivateDialog = { id: string; name: string; username: string | null };

export function isTelegramUserReadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TELEGRAM_USER_CLIENT_ENABLED === 'true' && env.TELEGRAM_USER_READ_ENABLED === 'true';
}

/** Prevent admin-password-only access to another user's personal Telegram history. */
export function requireTelegramReadOwner(authenticatedUserId: string | undefined, targetUserId: string): void {
  if (!authenticatedUserId || authenticatedUserId !== targetUserId) {
    throw new TelegramUserClientError(403, 'Читать Telegram может только владелец подключённого аккаунта Планировыча');
  }
}

export function validateTelegramDialogId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) {
    throw new TelegramUserClientError(400, 'Выберите личный диалог из списка');
  }
  return value;
}

export function isReadablePersonalDialog(value: unknown, accountId: string): value is {
  isUser: true; entity: Api.User; id: { toString(): string }; name?: string
} {
  if (!value || typeof value !== 'object') return false;
  const dialog = value as { isUser?: unknown; isGroup?: unknown; isChannel?: unknown; isCommunity?: unknown; entity?: unknown; id?: unknown };
  if (dialog.isUser !== true || dialog.isGroup === true || dialog.isChannel === true || dialog.isCommunity === true ||
      !(dialog.entity instanceof Api.User) || dialog.entity.bot || dialog.entity.deleted) {
    return false;
  }
  const id = String(dialog.entity.id);
  return /^[1-9][0-9]{0,19}$/.test(id) && id !== accountId;
}

export function safeTelegramMessage(message: Api.Message, senderName: string) {
  const raw = typeof message.message === 'string' ? message.message : '';
  const truncated = raw.length > MAX_MESSAGE_CHARS;
  const text = raw.slice(0, MAX_MESSAGE_CHARS);
  return {
    id: message.id,
    date: typeof message.date === 'number' && Number.isFinite(message.date) ? message.date : 0,
    out: Boolean(message.out),
    senderName: message.out ? 'Вы' : senderName,
    text,
    truncated,
    hasMedia: Boolean(message.media)
  };
}

async function validOwner(userId: string) {
  if (!isTelegramUserReadEnabled()) {
    throw new TelegramUserClientError(403, 'Просмотр личных Telegram-диалогов отключён на сервере');
  }
  if (!userId || userId.length > 128) throw new TelegramUserClientError(400, 'Некорректный пользователь');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramChatId: true,
      telegramUserClientConnection: { select: {
        pilotEnabled: true, encryptedSession: true, encryptedApiCredentials: true, connectedAt: true, telegramAccountId: true
      } }
    }
  });
  if (!user) throw new TelegramUserClientError(404, 'Пользователь не найден');
  const c = user.telegramUserClientConnection;
  if (!canUseTelegramUserClient(c?.pilotEnabled === true) ||
      !c?.encryptedSession || !c.encryptedApiCredentials || !c.connectedAt || !c.telegramAccountId ||
      user.telegramChatId !== c.telegramAccountId) {
    throw new TelegramUserClientError(403, 'Telegram не подключён или право доступа отозвано');
  }
  return { userId, encryptedSession: c.encryptedSession, encryptedApiCredentials: c.encryptedApiCredentials, accountId: c.telegramAccountId };
}

type ReadOwner = Awaited<ReturnType<typeof validOwner>>;

async function openReadClient(owner: ReadOwner) {
  const credentials = decryptTelegramAppCredentials(owner.userId, owner.encryptedApiCredentials);
  const session = decryptTelegramUserSession(owner.encryptedSession, owner.userId);
  const client = new TelegramClient(new StringSession(session), credentials.apiId, credentials.apiHash, {
    connectionRetries: 1,
    ...telegramUserClientNetworkOptions()
  });
  try {
    await client.connect();
    const me = await client.getMe();
    if (me.bot || String(me.id) !== owner.accountId) {
      throw new TelegramUserClientError(409, 'Подключённый Telegram-аккаунт изменился');
    }
    return client;
  } catch (error) {
    try { await client.disconnect(); } catch { /* no session logs */ }
    throw error;
  }
}

async function loadPersonalDialogs(client: TelegramClient, accountId: string) {
  // Telegram's GetDialogs API fetches preview data, but we deliberately never
  // serialize, log, cache, or expose those previews (only public peer metadata).
  const rows = await client.getDialogs({ limit: MAX_SCANNED_DIALOGS, ignoreMigrated: true });
  const allowed = rows.filter((row) => isReadablePersonalDialog(row, accountId));
  return {
    rows: allowed,
    dialogs: allowed.slice(0, MAX_VISIBLE_DIALOGS).map((row): TelegramPrivateDialog => ({
      id: String(row.entity.id),
      name: (row.name || row.entity.firstName || 'Пользователь').slice(0, 100),
      username: row.entity.username ? '@' + row.entity.username : null
    })),
    limited: allowed.length > MAX_VISIBLE_DIALOGS || rows.length >= MAX_SCANNED_DIALOGS
  };
}

async function withReadClient<T>(userId: string, kind: 'list' | 'history' | 'monitor', work: (client: TelegramClient, owner: ReadOwner) => Promise<T>): Promise<T> {
  if (inFlight.has(userId)) throw new TelegramUserClientError(409, 'Предыдущий запрос Telegram ещё выполняется');
  const limiter = kind === 'list' ? listLimiter : kind === 'monitor' ? monitorLimiter : historyLimiter;
  if (!limiter.consume(userId).allowed) {
    throw new TelegramUserClientError(429, 'Слишком много запросов к Telegram. Повторите позже');
  }
  inFlight.add(userId);
  let client: TelegramClient | null = null;
  try {
    const owner = await validOwner(userId);
    client = await openReadClient(owner);
    const data = await work(client, owner);
    // Permission and session must still be valid when returning sensitive data.
    const current = await validOwner(userId);
    if (current.accountId !== owner.accountId || current.encryptedSession !== owner.encryptedSession) {
      throw new TelegramUserClientError(403, 'Доступ к Telegram изменён во время чтения');
    }
    return data;
  } catch (error) {
    if (error instanceof TelegramUserClientError) throw error;
    console.warn('[TelegramUserClient] manual Telegram read failed', { kind, category: 'network_or_mtproto' });
    throw new TelegramUserClientError(503, 'Не удалось получить данные Telegram. Повторите позже');
  } finally {
    if (client) try { await client.disconnect(); } catch { /* best effort */ }
    inFlight.delete(userId);
  }
}

export const telegramUserClientRead = {
  async list(userId: string) {
    return withReadClient(userId, 'list', async (client, owner) => {
      const { dialogs, limited } = await loadPersonalDialogs(client, owner.accountId);
      return { dialogs, limited };
    });
  },
  async listSendTargets(userId: string) {
    // Only peer metadata: no group message history and no automatic AI access.
    // The existing history() method remains private-user-only.
    return withReadClient(userId, 'list', async (client, owner) => {
      const rows = await client.getDialogs({ limit: MAX_SCANNED_DIALOGS, ignoreMigrated: true });
      const all = rows
        .map(row => telegramSendTargetFromDialog(row, owner.accountId))
        .filter((target): target is NonNullable<typeof target> => target !== null);
      return {
        dialogs: all.slice(0, MAX_SEND_TARGETS),
        limited: all.length > MAX_SEND_TARGETS || rows.length >= MAX_SCANNED_DIALOGS
      };
    });
  },
  async aiHistory(userId: string, dialogId: unknown, count: number, monitoring = false, mediaAfterId?: number) {
    // This entry point is deliberately NOT an LLM tool. Invoke only from
    // the consent-consuming endpoint, after a real browser click.
    if (![10, 20, 30, 50, 100].includes(count)) {
      throw new TelegramUserClientError(400, 'Выберите 10, 20, 30, 50 или 100 сообщений');
    }
    if (typeof dialogId !== 'string' || dialogId.length > 60) {
      throw new TelegramUserClientError(400, 'Неверный Telegram-чат');
    }
    return withReadClient(userId, monitoring ? 'monitor' : 'history', async (client, owner) => {
      const rows = await client.getDialogs({ limit: MAX_SCANNED_DIALOGS, ignoreMigrated: true });
      const row = rows.find(dialog => telegramSendTargetFromDialog(dialog, owner.accountId)?.id === dialogId);
      if (!row) throw new TelegramUserClientError(404, 'Чат отсутствует в доступных личных и групповых диалогах');
      const target = telegramSendTargetFromDialog(row, owner.accountId);
      if (!target) throw new TelegramUserClientError(404, 'Этот чат недоступен для чтения');
      // No markAsRead, no downloads, no files, no logging of message bodies.
      const messages = await client.getMessages(row.inputEntity, { limit: count });
      const participants = new Map<string, number>();
      const rawMessages = messages
        .filter((message): message is Api.Message => message instanceof Api.Message)
        .reverse();
      const items = rawMessages.map(message => {
          const raw = typeof message.message === 'string' ? message.message : '';
          return {
            id: message.id,
            date: typeof message.date === 'number' ? message.date : 0,
            speaker: message.out ? 'Вы' : target.kind === 'user' ? target.name : (() => {
              const from = (message as Api.Message & { sender?: unknown; senderId?: unknown }).sender;
              if (from instanceof Api.User) {
                const name = [from.firstName, from.lastName].filter(Boolean).join(' ').trim();
                if (name) return name.slice(0, 100);
              }
              const peer = String((message as Api.Message & { senderId?: unknown }).senderId ?? 'unknown');
              if (!participants.has(peer)) participants.set(peer, participants.size + 1);
              return 'Участник ' + participants.get(peer);
            })(),
            text: raw.slice(0, 1200),
            truncated: raw.length > 1200,
            hasMedia: Boolean(message.media)
          };
        });
      // Overall bounded provider data size even for 100 very long messages.
      let used = 0;
      const bounded: Array<(typeof items)[number] & { media?: TelegramMonitorMedia; mediaNote?: string }> = items.map(item => {
        const left = Math.max(0, 72000 - used);
        const text = item.text.slice(0, left);
        used += text.length;
        return { ...item, text, truncated: item.truncated || text.length < item.text.length };
      });
      // Attachment bytes are fetched only by autonomous monitoring with a
      // verified policy and only for new messages (or an explicit refresh).
      // Manual consent/history reads remain metadata and text only.
      if (monitoring && Number.isSafeInteger(mediaAfterId) && (mediaAfterId ?? -1) >= 0) {
        let usedBytes = 0;
        let downloaded = 0;
        for (const message of rawMessages.slice(-40)) {
          if (message.id <= mediaAfterId! || !message.media) continue;
          const item = bounded.find(row => row.id === message.id);
          if (!item) continue;
          if (downloaded >= MONITOR_MEDIA_MAX_ITEMS) {
            item.mediaNote = 'Лимит вложений за одну проверку достигнут; содержимое не прочитано';
            continue;
          }
          const result = await downloadTelegramMonitorMedia(client, message, MONITOR_MEDIA_MAX_TOTAL_BYTES - usedBytes);
          item.mediaNote = result.mediaNote;
          if (result.media) {
            item.media = result.media;
            usedBytes += result.bytesDownloaded;
            downloaded += 1;
          }
        }
      }
      return { chatName: target.name, kind: target.kind, requestedCount: count, messages: bounded };
    });
  },
  async history(userId: string, dialogId: unknown) {
    const selectedId = validateTelegramDialogId(dialogId);
    return withReadClient(userId, 'history', async (client, owner) => {
      // No getEntity(numeric ID): only a personal dialog returned from the
      // user's own bounded dialog listing may become an authorized read target.
      const { rows } = await loadPersonalDialogs(client, owner.accountId);
      const dialog = rows.find((row) => String(row.entity.id) === selectedId);
      if (!dialog) throw new TelegramUserClientError(404, 'Личный диалог не найден в доступном списке');
      const messages = await client.getMessages(dialog.inputEntity, { limit: HISTORY_LIMIT });
      const name = (dialog.name || dialog.entity.firstName || 'Собеседник').slice(0, 100);
      const safe = messages
        .filter((message): message is Api.Message => message instanceof Api.Message)
        .map((message) => safeTelegramMessage(message, name))
        .reverse();
      return {
        dialog: { id: selectedId, name },
        messages: safe,
        analysisSnapshot: buildTelegramAnalysisSnapshot(selectedId, safe),
        limit: HISTORY_LIMIT
      };
    });
  }
};
