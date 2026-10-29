-- Named, independent one-time AI actions. Existing rows remain valid.
ALTER TABLE "TaskMonitoringTrigger" ADD COLUMN "title" TEXT;
ALTER TABLE "TaskMonitoringTrigger" ADD COLUMN "description" TEXT;
