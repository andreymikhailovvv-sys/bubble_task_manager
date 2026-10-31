-- Separate organization-owned work data; no changes to personal Task/Sphere.
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE');
CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TABLE "OrganizationProject" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationWorkTask" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "assignedMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationWorkTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationProject_organizationId_isArchived_createdAt_idx" ON "OrganizationProject"("organizationId","isArchived","createdAt");
CREATE INDEX "OrganizationWorkTask_projectId_status_createdAt_idx" ON "OrganizationWorkTask"("projectId","status","createdAt");
CREATE INDEX "OrganizationWorkTask_assignedMemberId_status_idx" ON "OrganizationWorkTask"("assignedMemberId","status");
CREATE INDEX "OrganizationWorkTask_dueAt_idx" ON "OrganizationWorkTask"("dueAt");

ALTER TABLE "OrganizationProject"
  ADD CONSTRAINT "OrganizationProject_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkTask"
  ADD CONSTRAINT "OrganizationWorkTask_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "OrganizationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationWorkTask"
  ADD CONSTRAINT "OrganizationWorkTask_assignedMemberId_fkey"
  FOREIGN KEY ("assignedMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
