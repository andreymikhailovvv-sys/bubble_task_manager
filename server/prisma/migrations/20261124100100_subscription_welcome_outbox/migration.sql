ALTER TABLE "SystemNotification"
 ADD COLUMN "subscriptionTelegramSentAt" TIMESTAMP(3),
 ADD COLUMN "subscriptionEmailSentAt" TIMESTAMP(3),
 ADD COLUMN "subscriptionDeliveryClaimedAt" TIMESTAMP(3),
 ADD COLUMN "subscriptionDeliveryNextAt" TIMESTAMP(3);
CREATE INDEX "SystemNotification_subscriptionDeliveryNextAt_idx" ON "SystemNotification"("subscriptionDeliveryNextAt");
