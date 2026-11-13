-- Email activation can be completed by either the existing one-time URL
-- or a 6-digit code from the same email. No existing users or tokens are deleted.
ALTER TABLE "EmailAuthToken" ADD COLUMN "codeHash" TEXT;
ALTER TABLE "EmailAuthToken" ADD COLUMN "codeExpiresAt" TIMESTAMP(3);
ALTER TABLE "EmailAuthToken" ADD COLUMN "codeAttempts" INTEGER NOT NULL DEFAULT 0;
