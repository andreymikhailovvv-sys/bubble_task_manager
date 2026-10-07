ALTER TABLE "User" ADD COLUMN "subscriptionPlan" TEXT NOT NULL DEFAULT 'free';

CREATE INDEX "User_subscriptionPlan_idx" ON "User"("subscriptionPlan");
