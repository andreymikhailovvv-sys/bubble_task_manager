CREATE TABLE "CreditPack" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditsAmount" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "paymentUrl" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditPack_key_key" ON "CreditPack"("key");

INSERT INTO "CreditPack" ("id", "key", "name", "creditsAmount", "price", "updatedAt") VALUES
    ('credit-pack-start', 'credit_start', 'Старт', 1000, 199, CURRENT_TIMESTAMP),
    ('credit-pack-pro', 'credit_pro', 'Про', 5000, 690, CURRENT_TIMESTAMP),
    ('credit-pack-max', 'credit_max', 'Макс', 15000, 1490, CURRENT_TIMESTAMP);
