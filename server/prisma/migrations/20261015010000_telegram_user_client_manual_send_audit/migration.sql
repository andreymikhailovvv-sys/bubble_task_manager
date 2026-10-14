CREATE TABLE "TelegramUserClientSendAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientTelegramId" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TelegramUserClientSendAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramUserClientSendAudit_userId_createdAt_idx"
    ON "TelegramUserClientSendAudit"("userId", "createdAt");

ALTER TABLE "TelegramUserClientSendAudit"
    ADD CONSTRAINT "TelegramUserClientSendAudit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
