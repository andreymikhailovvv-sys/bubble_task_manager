CREATE TABLE "OrganizationWorkNotification" (
 "id" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "recipientMemberId" TEXT NOT NULL,
 "taskId" TEXT NOT NULL,
 "subtaskId" TEXT NOT NULL,
 "commentId" TEXT NOT NULL,
 "content" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" TIMESTAMP(3),
 CONSTRAINT "OrganizationWorkNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationWorkNotification_recipientMemberId_commentId_key"
  ON "OrganizationWorkNotification"("recipientMemberId","commentId");
CREATE INDEX "OrganizationWorkNotification_organizationId_recipientMemberId_readAt_createdAt_idx"
  ON "OrganizationWorkNotification"("organizationId","recipientMemberId","readAt","createdAt");
CREATE INDEX "OrganizationWorkNotification_subtaskId_recipientMemberId_readAt_idx"
  ON "OrganizationWorkNotification"("subtaskId","recipientMemberId","readAt");
ALTER TABLE "OrganizationWorkNotification" ADD CONSTRAINT "OrganizationWorkNotification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkNotification" ADD CONSTRAINT "OrganizationWorkNotification_recipientMemberId_fkey"
  FOREIGN KEY ("recipientMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkNotification" ADD CONSTRAINT "OrganizationWorkNotification_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "OrganizationWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkNotification" ADD CONSTRAINT "OrganizationWorkNotification_subtaskId_fkey"
  FOREIGN KEY ("subtaskId") REFERENCES "OrganizationWorkSubtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
