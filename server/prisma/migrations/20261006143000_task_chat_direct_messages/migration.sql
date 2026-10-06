ALTER TABLE "TaskAiMessage"
  ADD COLUMN "messageKind" TEXT NOT NULL DEFAULT 'AI',
  ADD COLUMN "recipientUserId" TEXT;

CREATE INDEX "TaskAiMessage_taskId_messageKind_createdAt_idx"
  ON "TaskAiMessage"("taskId", "messageKind", "createdAt");

CREATE INDEX "TaskAiMessage_recipientUserId_createdAt_idx"
  ON "TaskAiMessage"("recipientUserId", "createdAt");
