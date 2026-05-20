ALTER TABLE "Task"
  ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceText" TEXT,
  ADD COLUMN "recurrenceJson" JSONB,
  ADD COLUMN "recurrenceSummary" TEXT,
  ADD COLUMN "recurrenceUntil" TIMESTAMP(3);
