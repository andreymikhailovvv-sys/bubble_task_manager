ALTER TABLE "TelegramAiInboxEvent" ADD COLUMN "taskModeAtPublish" TEXT NOT NULL DEFAULT 'SUGGEST';
ALTER TABLE "User" ADD COLUMN "aiTaskAutoApply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskAiMessage" ADD COLUMN "aiTaskProposalId" TEXT;
ALTER TABLE "GeneralAiMessage" ADD COLUMN "aiTaskProposalId" TEXT;

CREATE TABLE "AiTaskProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "taskId" TEXT,
  "operations" JSONB NOT NULL,
  "display" JSONB NOT NULL,
  "resolvedIds" JSONB,
  "snapshots" JSONB,
  "userTimeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "autoApplied" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTaskProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiTaskProposal_userId_requestId_key" ON "AiTaskProposal"("userId", "requestId");
CREATE INDEX "AiTaskProposal_userId_status_createdAt_idx" ON "AiTaskProposal"("userId", "status", "createdAt");
ALTER TABLE "AiTaskProposal" ADD CONSTRAINT "AiTaskProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
