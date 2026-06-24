CREATE TABLE "SubscriptionLink" (
    "planKey" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionLink_pkey" PRIMARY KEY ("planKey")
);
