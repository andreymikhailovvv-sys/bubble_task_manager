-- AlterTable
ALTER TABLE "AiUsageEvent"
ADD COLUMN "actionId" TEXT,
ADD COLUMN "providerCallIndex" INTEGER;

-- CreateIndex
CREATE INDEX "AiUsageEvent_actionId_idx" ON "AiUsageEvent"("actionId");
