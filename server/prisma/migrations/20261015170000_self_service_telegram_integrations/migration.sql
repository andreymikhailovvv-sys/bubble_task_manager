ALTER TABLE "TelegramUserClientConnection" ADD COLUMN "encryptedApiCredentials" TEXT;

-- Existing connections were admin-only pilot sessions. This release replaces
-- those with explicit owner-driven linking; invalidate them locally, without
-- touching Telegram-bot identity, TelegramSession or other integrations.
UPDATE "TelegramUserClientConnection"
SET "pilotEnabled" = false, "encryptedSession" = NULL,
    "telegramAccountId" = NULL, "connectedAt" = NULL,
    "encryptedApiCredentials" = NULL;

-- Never deliver previously queued pilot messages after the user reconnects.
UPDATE "TelegramQuickSendJob"
SET "state" = 'FAILED', "encryptedPayload" = NULL,
    "completedAt" = CURRENT_TIMESTAMP
WHERE "state" IN ('QUEUED', 'PROCESSING');
-- Pending remote sends cannot be safely repeated; mark the old ledger as unknown.
UPDATE "TelegramUserClientSendAudit"
SET "result" = 'UNKNOWN', "completedAt" = CURRENT_TIMESTAMP
WHERE "result" = 'PENDING';
