-- An explicit, durable marker makes trial grants one-time per account.
-- Previously registered users already received their opening credits; mark them
-- as granted without modifying any existing balance.
ALTER TABLE "User" ADD COLUMN "aiTrialGrantedAt" TIMESTAMP(3);
UPDATE "User"
SET "aiTrialGrantedAt" = NOW()
WHERE "username" IS NOT NULL OR "passwordHash" IS NOT NULL
   OR "googleSub" IS NOT NULL OR "email" IS NOT NULL OR "telegramChatId" IS NOT NULL
   OR "deviceId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "aiCredits" SET DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "aiIncludedCreditsMilli" SET DEFAULT 0;
