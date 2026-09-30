CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "openAiResponseId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER NOT NULL,
    "cacheWriteTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "reasoningTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "providerCostNanoUsd" BIGINT,
    "estimatedCreditsMilli" INTEGER,
    "pricingVersion" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL DEFAULT 'SHADOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");
CREATE INDEX "AiUsageEvent_requestId_idx" ON "AiUsageEvent"("requestId");

ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
