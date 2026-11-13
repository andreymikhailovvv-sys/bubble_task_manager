-- Snapshot only bot-linked accounts present at deployment, with either no
-- verified email or a new replacement email still pending confirmation.
-- A positive numeric Telegram chat ID is required so no account-status
-- notice can accidentally be posted into a group or channel.
CREATE TABLE "TelegramEmailVerificationOutreach" (
  "userId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "TelegramEmailVerificationOutreach_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "TelegramEmailVerificationOutreach_status_createdAt_idx"
  ON "TelegramEmailVerificationOutreach"("status", "createdAt");
ALTER TABLE "TelegramEmailVerificationOutreach"
  ADD CONSTRAINT "TelegramEmailVerificationOutreach_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TelegramEmailVerificationOutreach" ("userId", "chatId")
SELECT "id", "telegramChatId"
FROM "User"
WHERE "telegramChatId" ~ '^[1-9][0-9]{0,19}$'
  AND ("emailVerifiedAt" IS NULL OR NULLIF(BTRIM("pendingEmail"), '') IS NOT NULL)
ON CONFLICT ("userId") DO NOTHING;
