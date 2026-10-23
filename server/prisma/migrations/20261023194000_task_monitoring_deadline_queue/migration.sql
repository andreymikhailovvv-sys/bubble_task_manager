-- Extend the already deployed opt-in monitoring run table with a durable due-time queue.
ALTER TABLE "TaskMonitoringRun" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "TaskMonitoringRun" ADD COLUMN "sourceTaskId" TEXT;
CREATE INDEX "TaskMonitoringRun_state_dueAt_idx" ON "TaskMonitoringRun"("state", "dueAt");
CREATE INDEX "TaskMonitoringRun_sourceTaskId_state_idx" ON "TaskMonitoringRun"("sourceTaskId", "state");
