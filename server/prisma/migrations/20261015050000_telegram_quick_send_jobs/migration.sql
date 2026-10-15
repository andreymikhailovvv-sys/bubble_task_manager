CREATE TABLE "TelegramQuickSendJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'SEND',
    "encryptedPayload" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "recipientIndex" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramQuickSendJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramQuickSendJob_state_nextRunAt_idx" ON "TelegramQuickSendJob"("state", "nextRunAt");
CREATE INDEX "TelegramQuickSendJob_userId_createdAt_idx" ON "TelegramQuickSendJob"("userId", "createdAt");
ALTER TABLE "TelegramQuickSendJob" ADD CONSTRAINT "TelegramQuickSendJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
