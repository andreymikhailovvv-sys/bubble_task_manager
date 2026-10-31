CREATE TABLE "OrganizationWorkSubtaskComment" (
  "id" TEXT NOT NULL,
  "subtaskId" TEXT NOT NULL,
  "authorMemberId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationWorkSubtaskComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationWorkSubtaskComment_subtaskId_createdAt_idx"
  ON "OrganizationWorkSubtaskComment"("subtaskId","createdAt");
ALTER TABLE "OrganizationWorkSubtaskComment"
  ADD CONSTRAINT "OrganizationWorkSubtaskComment_subtaskId_fkey"
  FOREIGN KEY ("subtaskId") REFERENCES "OrganizationWorkSubtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkSubtaskComment"
  ADD CONSTRAINT "OrganizationWorkSubtaskComment_authorMemberId_fkey"
  FOREIGN KEY ("authorMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMessage" ADD COLUMN "senderMemberId" TEXT;
ALTER TABLE "OrganizationAiMessage" ADD COLUMN "recipientMemberId" TEXT;
CREATE INDEX "OrganizationAiMessage_organizationId_taskId_recipientMemberId_createdAt_idx"
  ON "OrganizationAiMessage"("organizationId","taskId","recipientMemberId","createdAt");
ALTER TABLE "OrganizationAiMessage" ADD CONSTRAINT "OrganizationAiMessage_senderMemberId_fkey"
  FOREIGN KEY ("senderMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMessage" ADD CONSTRAINT "OrganizationAiMessage_recipientMemberId_fkey"
  FOREIGN KEY ("recipientMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
