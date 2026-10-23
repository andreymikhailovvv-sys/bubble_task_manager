-- Preserve existing morningAiCheckupTime; NULL means one legacy slot.
ALTER TABLE "User" ADD COLUMN "aiCheckupSchedules" JSONB;

CREATE TABLE "AiCheckupRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCheckupRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiCheckupRun_userId_scheduleId_dateKey_key"
ON "AiCheckupRun"("userId", "scheduleId", "dateKey");
CREATE INDEX "AiCheckupRun_createdAt_idx" ON "AiCheckupRun"("createdAt");
ALTER TABLE "AiCheckupRun" ADD CONSTRAINT "AiCheckupRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
