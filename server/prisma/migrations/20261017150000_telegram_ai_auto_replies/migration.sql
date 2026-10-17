ALTER TABLE "TelegramAiChatPolicy"
  ADD COLUMN "autoReplyWhen" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "autoReplyHow" TEXT NOT NULL DEFAULT '';

CREATE TABLE "TelegramAiAutoReplyAttempt" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "messageId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CLAIMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TelegramAiAutoReplyAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiAutoReplyAttempt_policyId_messageId_key" ON "TelegramAiAutoReplyAttempt"("policyId", "messageId");
CREATE INDEX "TelegramAiAutoReplyAttempt_createdAt_idx" ON "TelegramAiAutoReplyAttempt"("createdAt");
ALTER TABLE "TelegramAiAutoReplyAttempt" ADD CONSTRAINT "TelegramAiAutoReplyAttempt_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "TelegramAiChatPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
