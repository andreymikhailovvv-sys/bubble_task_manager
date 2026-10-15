import { prisma } from '../db/prisma.js';
import { canUseTelegramUserClient } from '../lib/telegram-user-client-access.js';
import { isTelegramUserReadEnabled } from './telegram-user-client-read.service.js';
import { isTelegramAiDraftEnabled } from './telegram-user-client-draft.service.js';
import { isManualTelegramSendingEnabled } from './telegram-user-client-send.service.js';

// Owner-only capability snapshot for the personal AI chat. The UI is unlocked
// only for the actual connected user, never by an administrator picking an ID.
// Do not return the Telegram session, linked peer ID, or usage audit.
export async function telegramUserChatCapability(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramChatId: true,
      telegramUserClientConnection: {
        select: { pilotEnabled: true, encryptedSession: true, telegramAccountId: true, connectedAt: true }
      }
    }
  });
  const c = user?.telegramUserClientConnection;
  const connected = Boolean(
    c?.pilotEnabled && canUseTelegramUserClient(c.pilotEnabled) &&
    c.connectedAt && c.encryptedSession && c.telegramAccountId &&
    c.telegramAccountId === user?.telegramChatId
  );
  return {
    connected,
    readEnabled: connected && isTelegramUserReadEnabled(),
    analyzeEnabled: connected && isTelegramUserReadEnabled() && isTelegramAiDraftEnabled(),
    sendEnabled: connected && isManualTelegramSendingEnabled()
  };
}
