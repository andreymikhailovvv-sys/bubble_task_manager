-- Existing notifications are an immutable baseline, never broadcast historic events.
ALTER TABLE "SystemNotification"
  ADD COLUMN "pushDispatchedAt" TIMESTAMP(3),
  ADD COLUMN "pushClaimedAt" TIMESTAMP(3),
  ADD COLUMN "pushAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pushNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "SystemNotification" SET "pushDispatchedAt" = CURRENT_TIMESTAMP;
CREATE INDEX "SystemNotification_pushDispatchedAt_pushNextAttemptAt_idx"
  ON "SystemNotification"("pushDispatchedAt", "pushNextAttemptAt");

CREATE TABLE "AndroidPushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AndroidPushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AndroidPushDevice_installationId_key" ON "AndroidPushDevice"("installationId");
CREATE UNIQUE INDEX "AndroidPushDevice_token_key" ON "AndroidPushDevice"("token");
CREATE INDEX "AndroidPushDevice_userId_lastSeenAt_idx" ON "AndroidPushDevice"("userId", "lastSeenAt");
ALTER TABLE "AndroidPushDevice" ADD CONSTRAINT "AndroidPushDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
