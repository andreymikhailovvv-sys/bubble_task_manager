ALTER TABLE "TelegramAiChatPolicy"
  ADD COLUMN "monitorModel" TEXT NOT NULL DEFAULT 'gpt-6-luna';

CREATE TABLE "TelegramAiInboxEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "messageId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "botStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "botClaimedAt" TIMESTAMP(3),
  "botDeliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiInboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiInboxEvent_policyId_messageId_key" ON "TelegramAiInboxEvent"("policyId","messageId");
CREATE INDEX "TelegramAiInboxEvent_userId_createdAt_idx" ON "TelegramAiInboxEvent"("userId","createdAt");
CREATE INDEX "TelegramAiInboxEvent_botStatus_createdAt_idx" ON "TelegramAiInboxEvent"("botStatus","createdAt");
ALTER TABLE "TelegramAiInboxEvent" ADD CONSTRAINT "TelegramAiInboxEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiInboxEvent" ADD CONSTRAINT "TelegramAiInboxEvent_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "TelegramAiChatPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TelegramAiTaskApproval" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "itemIndex" INTEGER NOT NULL,
  "taskId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiTaskApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiTaskApproval_eventId_itemIndex_key" ON "TelegramAiTaskApproval"("eventId","itemIndex");
CREATE INDEX "TelegramAiTaskApproval_userId_createdAt_idx" ON "TelegramAiTaskApproval"("userId","createdAt");
ALTER TABLE "TelegramAiTaskApproval" ADD CONSTRAINT "TelegramAiTaskApproval_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAiTaskApproval" ADD CONSTRAINT "TelegramAiTaskApproval_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "TelegramAiInboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
