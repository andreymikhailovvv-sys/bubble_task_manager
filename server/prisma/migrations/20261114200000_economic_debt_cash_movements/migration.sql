-- Each debt records a cash movement and, when repaid, its reverse movement.
-- Existing debts are left untouched: retroactive movement would change balances
-- without proof of when the cash actually moved.
ALTER TABLE "EconomicOperation" ADD COLUMN "debtId" TEXT;
ALTER TABLE "EconomicOperation" ADD COLUMN "debtPhase" TEXT;

CREATE UNIQUE INDEX "EconomicOperation_debtId_debtPhase_key" ON "EconomicOperation"("debtId", "debtPhase");
CREATE INDEX "EconomicOperation_userId_debtId_idx" ON "EconomicOperation"("userId", "debtId");

ALTER TABLE "EconomicOperation"
  ADD CONSTRAINT "EconomicOperation_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "EconomicDebt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
