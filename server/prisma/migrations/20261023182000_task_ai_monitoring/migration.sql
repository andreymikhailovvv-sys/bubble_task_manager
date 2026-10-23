ALTER TABLE "Task" ADD COLUMN "aiMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TaskMonitoringStatus" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TaskMonitoringStatus_taskId_createdAt_idx" ON "TaskMonitoringStatus"("taskId", "createdAt");
ALTER TABLE "TaskMonitoringStatus" ADD CONSTRAINT "TaskMonitoringStatus_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "TaskMonitoringTrigger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "question" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TaskMonitoringTrigger_state_dueAt_idx" ON "TaskMonitoringTrigger"("state", "dueAt");
CREATE INDEX "TaskMonitoringTrigger_taskId_state_idx" ON "TaskMonitoringTrigger"("taskId", "state");
ALTER TABLE "TaskMonitoringTrigger" ADD CONSTRAINT "TaskMonitoringTrigger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "TaskMonitoringRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TaskMonitoringRun_eventKey_key" ON "TaskMonitoringRun"("eventKey");
CREATE INDEX "TaskMonitoringRun_taskId_createdAt_idx" ON "TaskMonitoringRun"("taskId", "createdAt");
CREATE INDEX "TaskMonitoringRun_state_createdAt_idx" ON "TaskMonitoringRun"("state", "createdAt");
ALTER TABLE "TaskMonitoringRun" ADD CONSTRAINT "TaskMonitoringRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;