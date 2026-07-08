CREATE TYPE "TaskType" AS ENUM ('TASK', 'EVENT');
ALTER TABLE "Task" ADD COLUMN "taskType" "TaskType" NOT NULL DEFAULT 'TASK';
ALTER TABLE "Task" ADD COLUMN "location" TEXT;
CREATE INDEX "Task_taskType_idx" ON "Task"("taskType");
