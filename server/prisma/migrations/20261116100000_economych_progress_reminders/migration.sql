-- User-controlled debt posting and payment progress. Existing debt records are
-- treated as posted only if they actually have a funding ledger entry.
ALTER TABLE "EconomicDebt"
  ADD COLUMN "postedToAccount" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "paidMinor" BIGINT NOT NULL DEFAULT 0;
UPDATE "EconomicDebt" AS d
SET "postedToAccount" = EXISTS (
  SELECT 1 FROM "EconomicOperation" AS o WHERE o."debtId" = d."id" AND o."debtPhase" = 'FUNDING'
), "accountId" = (
  SELECT o."sourceAccountId" FROM "EconomicOperation" AS o
  WHERE o."debtId" = d."id" AND o."debtPhase" = 'FUNDING' LIMIT 1
);
UPDATE "EconomicDebt" SET "paidMinor" = "amountMinor" WHERE "isClosed" = TRUE;
CREATE INDEX "EconomicDebt_accountId_idx" ON "EconomicDebt"("accountId");
ALTER TABLE "EconomicDebt" ADD CONSTRAINT "EconomicDebt_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "EconomicAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EconomicLoan"
  ADD COLUMN "paidMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "monthlyPaymentOverrideMinor" BIGINT,
  ADD COLUMN "paymentDate" TIMESTAMP(3),
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "lastReminderPeriod" TEXT;
CREATE INDEX "EconomicLoan_remindersEnabled_isClosed_idx" ON "EconomicLoan"("remindersEnabled", "isClosed");
