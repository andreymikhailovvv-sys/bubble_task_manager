-- Existing profile emails are untrusted until explicitly verified. Google
-- identities are backed by Google verified_email, so mark only those verified.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "googleSub" IS NOT NULL AND "email" IS NOT NULL;

CREATE TABLE "EmailAuthToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAuthToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailAuthToken_tokenHash_key" ON "EmailAuthToken"("tokenHash");
CREATE INDEX "EmailAuthToken_userId_purpose_expiresAt_idx" ON "EmailAuthToken"("userId", "purpose", "expiresAt");
CREATE INDEX "EmailAuthToken_expiresAt_idx" ON "EmailAuthToken"("expiresAt");
ALTER TABLE "EmailAuthToken" ADD CONSTRAINT "EmailAuthToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
