ALTER TABLE "User" ADD COLUMN "offerTaskCompletionReport" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "TaskActivityEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskActivityEvent_taskId_createdAt_idx" ON "TaskActivityEvent"("taskId","createdAt");
CREATE INDEX "TaskActivityEvent_actorId_createdAt_idx" ON "TaskActivityEvent"("actorId","createdAt");
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
