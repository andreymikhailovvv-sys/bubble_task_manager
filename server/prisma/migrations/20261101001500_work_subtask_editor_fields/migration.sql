ALTER TABLE "OrganizationWorkSubtask" ADD COLUMN "description" TEXT;
ALTER TABLE "OrganizationWorkSubtask" ADD COLUMN "importance" INTEGER NOT NULL DEFAULT 3;
