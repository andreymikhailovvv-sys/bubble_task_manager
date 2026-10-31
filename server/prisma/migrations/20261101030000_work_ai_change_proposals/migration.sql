-- B2B-only pending approvals. The personal AI proposal workflow is unchanged.
CREATE TABLE "OrganizationAiChangeProposal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorMemberId" TEXT NOT NULL,
  "assistantMessageId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "operations" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationAiChangeProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationAiChangeProposal_assistantMessageId_key"
  ON "OrganizationAiChangeProposal"("assistantMessageId");
CREATE INDEX "OrganizationAiChangeProposal_organizationId_actorMemberId_status_idx"
  ON "OrganizationAiChangeProposal"("organizationId","actorMemberId","status");
ALTER TABLE "OrganizationAiChangeProposal" ADD CONSTRAINT "OrganizationAiChangeProposal_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiChangeProposal" ADD CONSTRAINT "OrganizationAiChangeProposal_actorMemberId_fkey"
  FOREIGN KEY ("actorMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiChangeProposal" ADD CONSTRAINT "OrganizationAiChangeProposal_assistantMessageId_fkey"
  FOREIGN KEY ("assistantMessageId") REFERENCES "OrganizationAiMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
