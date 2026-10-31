CREATE TABLE "OrganizationWorkSubtask" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "isDone" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationWorkSubtask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationWorkSubtask_taskId_sortOrder_createdAt_idx" ON "OrganizationWorkSubtask"("taskId","sortOrder","createdAt");
CREATE INDEX "OrganizationWorkSubtask_createdByMemberId_idx" ON "OrganizationWorkSubtask"("createdByMemberId");
ALTER TABLE "OrganizationWorkSubtask" ADD CONSTRAINT "OrganizationWorkSubtask_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "OrganizationWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkSubtask" ADD CONSTRAINT "OrganizationWorkSubtask_createdByMemberId_fkey"
  FOREIGN KEY ("createdByMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
