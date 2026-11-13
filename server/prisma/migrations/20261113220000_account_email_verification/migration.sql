-- Existing profile emails are untrusted until explicitly verified.
-- Even an old Google account may have edited its email without confirmation;
-- its address will become verified after a fresh, verified Google OAuth login.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
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
