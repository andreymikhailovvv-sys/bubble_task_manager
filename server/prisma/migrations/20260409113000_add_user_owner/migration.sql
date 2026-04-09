-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleSub" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- Seed default owner for existing rows
INSERT INTO "User" ("id", "email", "name", "googleSub", "avatarUrl", "createdAt", "updatedAt")
VALUES ('system_migration_user', 'migration.owner@example.com', 'Migration Owner', 'migration-owner-sub', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

-- AlterTable
ALTER TABLE "Sphere" ADD COLUMN "userId" TEXT;
ALTER TABLE "Task" ADD COLUMN "userId" TEXT;

-- Backfill existing data
UPDATE "Sphere" SET "userId" = 'system_migration_user' WHERE "userId" IS NULL;
UPDATE "Task" SET "userId" = 'system_migration_user' WHERE "userId" IS NULL;

-- Set NOT NULL
ALTER TABLE "Sphere" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Sphere_userId_idx" ON "Sphere"("userId");
CREATE INDEX "Sphere_userId_createdAt_idx" ON "Sphere"("userId", "createdAt");
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
CREATE INDEX "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");

-- AddForeignKey
ALTER TABLE "Sphere" ADD CONSTRAINT "Sphere_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
