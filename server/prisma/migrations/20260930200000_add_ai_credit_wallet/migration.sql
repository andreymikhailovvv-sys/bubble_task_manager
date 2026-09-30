-- Add the three source-of-truth wallet buckets. The legacy aiCredits column is
-- retained as a compatibility mirror.
ALTER TABLE "User"
  ADD COLUMN "aiIncludedCreditsMilli" INTEGER NOT NULL DEFAULT 100000,
  ADD COLUMN "aiBonusCreditsMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiPurchasedCreditsMilli" INTEGER NOT NULL DEFAULT 0;

-- Existing balances cannot safely be classified, so preserve all of them in
-- the non-expiring bonus bucket. This statement and the DDL run atomically in
-- a normal Prisma/PostgreSQL migration deployment.
UPDATE "User"
SET
  "aiIncludedCreditsMilli" = 0,
  "aiBonusCreditsMilli" = "aiCredits" * 1000,
  "aiPurchasedCreditsMilli" = 0;

-- Abort deployment rather than silently losing value if the backfill invariant
-- is ever changed incorrectly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "aiIncludedCreditsMilli" + "aiBonusCreditsMilli" + "aiPurchasedCreditsMilli"
      <> "aiCredits" * 1000
  ) THEN
    RAISE EXCEPTION 'AI credit wallet migration sanity check failed';
  END IF;
END $$;
