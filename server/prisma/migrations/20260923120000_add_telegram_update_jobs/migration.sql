CREATE TYPE "TelegramUpdateJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

CREATE TABLE "TelegramUpdateJob" (
    "id" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TelegramUpdateJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUpdateJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramUpdateJob_updateId_key" ON "TelegramUpdateJob"("updateId");
CREATE INDEX "TelegramUpdateJob_status_nextAttemptAt_idx" ON "TelegramUpdateJob"("status", "nextAttemptAt");
CREATE INDEX "TelegramUpdateJob_status_processingStartedAt_idx" ON "TelegramUpdateJob"("status", "processingStartedAt");
