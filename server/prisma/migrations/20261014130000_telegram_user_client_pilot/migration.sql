-- Separate from TelegramSession (which stores Bot API chat state).
-- This table is not reachable by any end-user endpoint in stage 1.
CREATE TABLE "TelegramUserClientConnection" (
  "userId" TEXT NOT NULL,
  "pilotEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "encryptedSession" TEXT,
  "telegramAccountId" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramUserClientConnection_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "TelegramUserClientConnection"
  ADD CONSTRAINT "TelegramUserClientConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
