CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "creditPackKey" TEXT NOT NULL,
    "creditsAmount" INTEGER NOT NULL,
    "creditsMilli" INTEGER NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "yookassaPaymentId" TEXT,
    "idempotenceKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "confirmationUrl" TEXT,
    "providerStatus" TEXT,
    "providerCheckedAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditPurchase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreditPurchase_yookassaPaymentId_key" ON "CreditPurchase"("yookassaPaymentId");
CREATE UNIQUE INDEX "CreditPurchase_idempotenceKey_key" ON "CreditPurchase"("idempotenceKey");
CREATE UNIQUE INDEX "CreditPurchase_userId_clientRequestId_key" ON "CreditPurchase"("userId", "clientRequestId");
CREATE INDEX "CreditPurchase_userId_createdAt_idx" ON "CreditPurchase"("userId", "createdAt");
CREATE INDEX "CreditPurchase_status_idx" ON "CreditPurchase"("status");
