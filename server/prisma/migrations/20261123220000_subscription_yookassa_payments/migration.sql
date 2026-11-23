-- Paid subscriptions have their own verified YooKassa ledger.
-- Existing manual subscriptions remain untouched (NULL expiry).
ALTER TABLE "User" ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);

CREATE TABLE "SubscriptionPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "creditsMilli" INTEGER NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "yookassaPaymentId" TEXT,
  "idempotenceKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "confirmationUrl" TEXT,
  "providerStatus" TEXT,
  "providerCheckedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPurchase_userId_clientRequestId_key" ON "SubscriptionPurchase"("userId", "clientRequestId");
CREATE UNIQUE INDEX "SubscriptionPurchase_yookassaPaymentId_key" ON "SubscriptionPurchase"("yookassaPaymentId");
CREATE UNIQUE INDEX "SubscriptionPurchase_idempotenceKey_key" ON "SubscriptionPurchase"("idempotenceKey");
CREATE INDEX "SubscriptionPurchase_userId_createdAt_idx" ON "SubscriptionPurchase"("userId","createdAt");
CREATE INDEX "SubscriptionPurchase_status_idx" ON "SubscriptionPurchase"("status");
-- Prevent two simultaneous unfinished subscription checkouts for one account.
CREATE UNIQUE INDEX "SubscriptionPurchase_one_unfinished_per_user_idx" ON "SubscriptionPurchase"("userId")
  WHERE "status" IN ('created', 'pending', 'create_failed');
ALTER TABLE "SubscriptionPurchase" ADD CONSTRAINT "SubscriptionPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
