-- Credit-card available credit is stored as the account's current balance.
-- Adjustments are real ledger movements, excluded from spending/income reports.
ALTER TABLE "EconomicAccount" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "EconomicAccount" ADD COLUMN "creditLimitMinor" BIGINT;
ALTER TABLE "EconomicOperation" ADD COLUMN "isAdjustment" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "EconomicOperation_userId_isAdjustment_occurredAt_idx" ON "EconomicOperation"("userId", "isAdjustment", "occurredAt");
