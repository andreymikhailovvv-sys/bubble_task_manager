-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "TaskAiMessage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAiMessage_taskId_idx" ON "TaskAiMessage"("taskId");

-- CreateIndex
CREATE INDEX "TaskAiMessage_userId_idx" ON "TaskAiMessage"("userId");

-- CreateIndex
CREATE INDEX "TaskAiMessage_taskId_createdAt_idx" ON "TaskAiMessage"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAiMessage_taskId_userId_createdAt_idx" ON "TaskAiMessage"("taskId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskAiMessage" ADD CONSTRAINT "TaskAiMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAiMessage" ADD CONSTRAINT "TaskAiMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
