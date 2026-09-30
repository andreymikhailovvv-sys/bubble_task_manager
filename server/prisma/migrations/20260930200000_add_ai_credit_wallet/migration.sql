-- Add the three source-of-truth wallet buckets. The legacy aiCredits column is
-- retained as a compatibility mirror.
BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "aiIncludedCreditsMilli" INTEGER NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS "aiBonusCreditsMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiPurchasedCreditsMilli" INTEGER NOT NULL DEFAULT 0;

-- Existing balances cannot safely be classified, so preserve all of them in
-- the non-expiring bonus bucket. Fail with an actionable error before the
-- assignment if a legacy balance cannot be represented by an INTEGER bucket.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "aiCredits"::bigint * 1000 NOT BETWEEN -2147483648 AND 2147483647
  ) THEN
    RAISE EXCEPTION 'AI credit wallet migration cannot backfill: aiCredits * 1000 exceeds the INTEGER millicredit range';
  END IF;
END $$;

UPDATE "User"
SET
  "aiIncludedCreditsMilli" = 0,
  "aiBonusCreditsMilli" = ("aiCredits"::bigint * 1000)::integer,
  "aiPurchasedCreditsMilli" = 0;

-- Abort deployment rather than silently losing value if the backfill invariant
-- is ever changed incorrectly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "aiIncludedCreditsMilli"::bigint
        + "aiBonusCreditsMilli"::bigint
        + "aiPurchasedCreditsMilli"::bigint
      <> "aiCredits"::bigint * 1000
  ) THEN
    RAISE EXCEPTION 'AI credit wallet migration sanity check failed: milli buckets do not equal legacy aiCredits * 1000';
  END IF;
END $$;

COMMIT;
