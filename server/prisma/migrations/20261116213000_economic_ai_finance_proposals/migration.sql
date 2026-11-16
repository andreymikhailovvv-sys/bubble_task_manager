-- New AI financial actions are proposals, never immediate model writes.
ALTER TABLE "User" ADD COLUMN "economicAiAutoApply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EconomicAiProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "messageId" TEXT,
  "entity" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "payload" JSONB NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "appliedEntityId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "autoApplied" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3),
  CONSTRAINT "EconomicAiProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EconomicAiProposal_userId_createdAt_idx" ON "EconomicAiProposal"("userId", "createdAt");
CREATE INDEX "EconomicAiProposal_messageId_idx" ON "EconomicAiProposal"("messageId");
ALTER TABLE "EconomicAiProposal" ADD CONSTRAINT "EconomicAiProposal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomicAiProposal" ADD CONSTRAINT "EconomicAiProposal_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "EconomicAssistantMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
