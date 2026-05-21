ALTER TABLE "User"
ADD COLUMN "aiCredits" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "aiCreditsPeriod" TEXT NOT NULL DEFAULT '';

UPDATE "User"
SET "aiCredits" = 100,
    "aiCreditsPeriod" = to_char(NOW(), 'YYYY-MM');
