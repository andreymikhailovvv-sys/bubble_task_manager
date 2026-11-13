-- Snapshot only EXISTING users with a stored email and no verified address.
-- The migration runs once. Future registrations do not enter this mailing batch.
CREATE TABLE "EmailVerificationOutreach" (
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "EmailVerificationOutreach_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "EmailVerificationOutreach_status_createdAt_idx"
  ON "EmailVerificationOutreach"("status", "createdAt");
ALTER TABLE "EmailVerificationOutreach"
  ADD CONSTRAINT "EmailVerificationOutreach_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EmailVerificationOutreach" ("userId", "email")
SELECT "id", LOWER(TRIM(COALESCE(NULLIF("pendingEmail", ''), NULLIF("email", ''))))
FROM "User"
WHERE "emailVerifiedAt" IS NULL
  AND ("username" IS NOT NULL OR "googleSub" IS NOT NULL)
  AND COALESCE(NULLIF(TRIM("pendingEmail"), ''), NULLIF(TRIM("email"), '')) IS NOT NULL
ON CONFLICT ("userId") DO NOTHING;
