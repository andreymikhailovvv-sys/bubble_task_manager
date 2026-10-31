-- Work AI accounting, durable conversations, scheduled monitoring; no personal data migration.
ALTER TABLE "Organization" ADD COLUMN "aiCreditsMilli" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'gpt-6.1-terra';
ALTER TABLE "OrganizationWorkTask" ADD COLUMN "aiMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrganizationWorkTask" ADD COLUMN "aiMonitoringRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OrganizationAiReservation" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"reservedMilli" INTEGER NOT NULL,
  "chargedMilli" INTEGER NOT NULL DEFAULT 0,"state" TEXT NOT NULL DEFAULT 'RESERVED',
  "feature" TEXT NOT NULL,"model" TEXT NOT NULL,"inputTokens" INTEGER,
  "outputTokens" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationAiReservation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationAiCreditLedger" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"deltaMilli" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,"actorUserId" TEXT,"reservationId" TEXT,"note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationAiCreditLedger_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationAiMessage" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"taskId" TEXT,
  "role" TEXT NOT NULL,"content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationAiMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationAiMonitoringJob" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"taskId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,"dueAt" TIMESTAMP(3) NOT NULL,"instruction" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationAiMonitoringJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrganizationAiReservation_organizationId_createdAt_idx" ON "OrganizationAiReservation"("organizationId","createdAt");
CREATE INDEX "OrganizationAiReservation_state_createdAt_idx" ON "OrganizationAiReservation"("state","createdAt");
CREATE INDEX "OrganizationAiCreditLedger_organizationId_createdAt_idx" ON "OrganizationAiCreditLedger"("organizationId","createdAt");
CREATE INDEX "OrganizationAiMessage_organizationId_taskId_createdAt_idx" ON "OrganizationAiMessage"("organizationId","taskId","createdAt");
CREATE UNIQUE INDEX "OrganizationAiMonitoringJob_eventKey_key" ON "OrganizationAiMonitoringJob"("eventKey");
CREATE INDEX "OrganizationAiMonitoringJob_state_dueAt_idx" ON "OrganizationAiMonitoringJob"("state","dueAt");
CREATE INDEX "OrganizationAiMonitoringJob_organizationId_taskId_dueAt_idx" ON "OrganizationAiMonitoringJob"("organizationId","taskId","dueAt");

ALTER TABLE "OrganizationAiReservation" ADD CONSTRAINT "OrganizationAiReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiCreditLedger" ADD CONSTRAINT "OrganizationAiCreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMessage" ADD CONSTRAINT "OrganizationAiMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMessage" ADD CONSTRAINT "OrganizationAiMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrganizationWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMonitoringJob" ADD CONSTRAINT "OrganizationAiMonitoringJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationAiMonitoringJob" ADD CONSTRAINT "OrganizationAiMonitoringJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrganizationWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
