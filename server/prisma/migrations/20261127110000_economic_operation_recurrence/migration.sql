ALTER TABLE "EconomicOperation" ADD COLUMN "recurrenceJson" JSONB, ADD COLUMN "nextRepeatAt" TIMESTAMP(3);
CREATE INDEX "EconomicOperation_nextRepeatAt_idx" ON "EconomicOperation"("nextRepeatAt");
