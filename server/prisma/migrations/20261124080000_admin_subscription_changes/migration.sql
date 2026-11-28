CREATE TABLE "AdminSubscriptionChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousPlan" TEXT NOT NULL,
    "nextPlan" TEXT NOT NULL,
    "previousExpiresAt" TIMESTAMP(3),
    "nextExpiresAt" TIMESTAMP(3),
    "previousIncludedMilli" INTEGER NOT NULL,
    "nextIncludedMilli" INTEGER NOT NULL,
    "previousPeriod" TEXT NOT NULL,
    "nextPeriod" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSubscriptionChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminSubscriptionChange_userId_createdAt_idx" ON "AdminSubscriptionChange"("userId", "createdAt");
ALTER TABLE "AdminSubscriptionChange" ADD CONSTRAINT "AdminSubscriptionChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
