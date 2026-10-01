CREATE TABLE "TaskAiConversationMemory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "summarizedThroughMessageId" TEXT NOT NULL,
    "summarizedThroughCreatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "formatVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAiConversationMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskAiConversationMemory_taskId_key" ON "TaskAiConversationMemory"("taskId");
CREATE INDEX "TaskAiConversationMemory_userId_idx" ON "TaskAiConversationMemory"("userId");
CREATE INDEX "TaskAiConversationMemory_userId_updatedAt_idx" ON "TaskAiConversationMemory"("userId", "updatedAt");

ALTER TABLE "TaskAiConversationMemory" ADD CONSTRAINT "TaskAiConversationMemory_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
