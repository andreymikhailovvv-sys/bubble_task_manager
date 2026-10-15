ALTER TABLE "TaskAiMessage" ADD COLUMN "telegramReadDraft" JSONB, ADD COLUMN "telegramReadOwnerId" TEXT;
CREATE TABLE "TelegramAiReadRequest" (
 "id" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "taskId" TEXT,
 "requestedName" TEXT NOT NULL,
 "suggestedId" TEXT,
 "suggestedName" TEXT,
 "state" TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claimedAt" TIMESTAMP(3),
 CONSTRAINT "TelegramAiReadRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TelegramAiReadRequest_userId_createdAt_idx" ON "TelegramAiReadRequest"("userId", "createdAt");
ALTER TABLE "TelegramAiReadRequest" ADD CONSTRAINT "TelegramAiReadRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
