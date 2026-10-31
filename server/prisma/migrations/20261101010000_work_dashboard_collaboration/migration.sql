-- Add collaboration ownership metadata, preserving all existing company and personal rows.
ALTER TABLE "OrganizationProject" ADD COLUMN "createdByMemberId" TEXT;
ALTER TABLE "OrganizationWorkTask" ADD COLUMN "createdByMemberId" TEXT;
ALTER TABLE "OrganizationAiMessage" ADD COLUMN "memberId" TEXT;
CREATE INDEX "OrganizationProject_createdByMemberId_idx" ON "OrganizationProject"("createdByMemberId");
CREATE INDEX "OrganizationWorkTask_createdByMemberId_status_idx" ON "OrganizationWorkTask"("createdByMemberId","status");
CREATE INDEX "OrganizationAiMessage_organizationId_memberId_createdAt_idx" ON "OrganizationAiMessage"("organizationId","memberId","createdAt");
ALTER TABLE "OrganizationProject" ADD CONSTRAINT "OrganizationProject_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkTask" ADD CONSTRAINT "OrganizationWorkTask_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMessage" ADD CONSTRAINT "OrganizationAiMessage_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
