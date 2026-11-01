ALTER TABLE "EmailAnalysis" ADD COLUMN "taskPublishedAt" TIMESTAMP(3);
ALTER TABLE "EmailAnalysis" ADD COLUMN "replyPublishedAt" TIMESTAMP(3);
CREATE TABLE "EmailDigest" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "mailboxId" TEXT NOT NULL,
  "content" TEXT NOT NULL, "botStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "botClaimedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDigest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailDigest_mailboxId_createdAt_idx" ON "EmailDigest"("mailboxId","createdAt");
CREATE INDEX "EmailDigest_botStatus_createdAt_idx" ON "EmailDigest"("botStatus","createdAt");
ALTER TABLE "EmailDigest" ADD CONSTRAINT "EmailDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDigest" ADD CONSTRAINT "EmailDigest_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
