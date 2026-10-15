-- Explicit opt-in monitoring. No historic policies are enabled by this migration.
ALTER TABLE "TelegramAiChatPolicy"
  ADD COLUMN "lastSeenMessageId" INTEGER,
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "nextCheckAt" TIMESTAMP(3),
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leasedUntil" TIMESTAMP(3),
  ADD COLUMN "lastSummary" JSONB,
  ADD COLUMN "lastSummaryAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "monitorRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "summaryRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditDayKey" TEXT,
  ADD COLUMN "dailySpentMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dailyReservedMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalSpentMilli" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "TelegramAiChatPolicy_due_idx" ON "TelegramAiChatPolicy"("isEnabled","nextCheckAt","leasedUntil");

CREATE TABLE "TelegramAiMonitorCall" (
  "id" TEXT NOT NULL,
  "policyId" TEXT,
  "userId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "creditDayKey" TEXT NOT NULL,
  "reservedMilli" INTEGER NOT NULL,
  "chargedMilli" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TelegramAiMonitorCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramAiMonitorCall_reservationId_key" ON "TelegramAiMonitorCall"("reservationId");
CREATE INDEX "TelegramAiMonitorCall_state_createdAt_idx" ON "TelegramAiMonitorCall"("state","createdAt");
CREATE INDEX "TelegramAiMonitorCall_policyId_creditDayKey_idx" ON "TelegramAiMonitorCall"("policyId","creditDayKey");
ALTER TABLE "TelegramAiMonitorCall" ADD CONSTRAINT "TelegramAiMonitorCall_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TelegramAiChatPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAiMonitorCall" ADD CONSTRAINT "TelegramAiMonitorCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
