-- Add parent-child relation for subtasks
ALTER TABLE "Task" ADD COLUMN "parentTaskId" TEXT;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_parentTaskId_fkey"
FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
