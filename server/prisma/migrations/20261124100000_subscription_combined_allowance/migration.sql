ALTER TABLE "User" ADD COLUMN "subscriptionAllowanceMilli" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "subscriptionAllowanceMilli" = CASE "subscriptionPlan" WHEN 'start' THEN 3000000 WHEN 'pro' THEN 6000000 WHEN 'max' THEN 13000000 ELSE 0 END WHERE "subscriptionExpiresAt" IS NOT NULL;
