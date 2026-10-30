ALTER TABLE "Task" ADD COLUMN "aiMonitoringModel" TEXT NOT NULL DEFAULT 'gpt-6.1-terra';

-- Upgrade existing monitored tasks as well as their subtasks: old deadlines
-- must not survive the transition to trigger-controlled scheduling.
UPDATE "Task"
SET "dueDate" = NULL, "telegramNotifiedAt" = NULL
WHERE "aiMonitoringEnabled" = TRUE
   OR "parentTaskId" IN (
     SELECT "id" FROM "Task" WHERE "aiMonitoringEnabled" = TRUE
   );
