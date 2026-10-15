ALTER TABLE "TelegramUserClientConnection" ADD COLUMN "encryptedApiCredentials" TEXT;

-- Existing connections were admin-only pilot sessions. This release replaces
-- those with explicit owner-driven linking; invalidate them locally, without
-- touching Telegram-bot identity, TelegramSession or other integrations.
UPDATE "TelegramUserClientConnection"
SET "pilotEnabled" = false, "encryptedSession" = NULL,
    "telegramAccountId" = NULL, "connectedAt" = NULL,
    "encryptedApiCredentials" = NULL;
