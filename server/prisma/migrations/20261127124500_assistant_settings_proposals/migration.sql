CREATE TABLE "AssistantSettingsProposal" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL, "targetLabel" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "changes" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantSettingsProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantSettingsProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AssistantSettingsProposal_userId_kind_targetId_createdAt_idx" ON "AssistantSettingsProposal"("userId","kind","targetId","createdAt");
