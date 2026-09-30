ALTER TABLE "User"
  ADD COLUMN "aiIncludedCreditsMilli" INTEGER NOT NULL DEFAULT 100000,
  ADD COLUMN "aiPurchasedCreditsMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiBonusCreditsMilli" INTEGER NOT NULL DEFAULT 0;

UPDATE "User" SET "aiIncludedCreditsMilli" = "aiCredits" * 1000;

ALTER TABLE "TaskAiMessage" ADD COLUMN "creditsSpentMilli" INTEGER;
ALTER TABLE "GeneralAiMessage" ADD COLUMN "creditsSpentMilli" INTEGER;

CREATE TABLE "AiUsageTransaction" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "actionId" TEXT NOT NULL,
  "feature" TEXT NOT NULL, "provider" TEXT NOT NULL DEFAULT 'openai', "primaryModel" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL, "cachedInputTokens" INTEGER NOT NULL,
  "cacheWriteTokens" INTEGER NOT NULL, "outputTokens" INTEGER NOT NULL,
  "reasoningTokens" INTEGER NOT NULL, "providerCallCount" INTEGER NOT NULL DEFAULT 1,
  "providerCostNanoUsd" BIGINT NOT NULL, "creditsChargedMilli" INTEGER NOT NULL,
  "includedCreditsSpentMilli" INTEGER NOT NULL, "bonusCreditsSpentMilli" INTEGER NOT NULL,
  "purchasedCreditsSpentMilli" INTEGER NOT NULL, "pricingVersion" TEXT NOT NULL,
  "usageDetails" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiUsageTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiUsageTransaction_actionId_key" ON "AiUsageTransaction"("actionId");
CREATE INDEX "AiUsageTransaction_userId_createdAt_idx" ON "AiUsageTransaction"("userId", "createdAt");

CREATE TABLE "AiCreditReservation" (
  "id" TEXT NOT NULL, "actionId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "includedMilli" INTEGER NOT NULL, "bonusMilli" INTEGER NOT NULL,
  "purchasedMilli" INTEGER NOT NULL, "reservedMilli" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiCreditReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiCreditReservation_actionId_key" ON "AiCreditReservation"("actionId");
CREATE INDEX "AiCreditReservation_userId_idx" ON "AiCreditReservation"("userId");

UPDATE "CreditPack" SET "creditsAmount" = CASE "key"
  WHEN 'credit_start' THEN 1800 WHEN 'credit_pro' THEN 6200 WHEN 'credit_max' THEN 14000
  ELSE "creditsAmount" END
WHERE "key" IN ('credit_start', 'credit_pro', 'credit_max');
