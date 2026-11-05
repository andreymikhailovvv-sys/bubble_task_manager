ALTER TABLE "Task" ADD COLUMN "bubbleGlobalX" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN "bubbleGlobalY" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN "bubbleSectorX" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN "bubbleSectorY" DOUBLE PRECISION;

CREATE TABLE "TaskBubbleLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstTaskId" TEXT NOT NULL,
    "secondTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskBubbleLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskBubbleLink_firstTaskId_secondTaskId_key" ON "TaskBubbleLink"("firstTaskId","secondTaskId");
CREATE INDEX "TaskBubbleLink_userId_idx" ON "TaskBubbleLink"("userId");
CREATE INDEX "TaskBubbleLink_secondTaskId_idx" ON "TaskBubbleLink"("secondTaskId");
ALTER TABLE "TaskBubbleLink" ADD CONSTRAINT "TaskBubbleLink_firstTaskId_fkey" FOREIGN KEY ("firstTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBubbleLink" ADD CONSTRAINT "TaskBubbleLink_secondTaskId_fkey" FOREIGN KEY ("secondTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
