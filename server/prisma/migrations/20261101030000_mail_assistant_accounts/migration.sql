CREATE TABLE "EmailMailbox" (
"id" TEXT NOT NULL, "userId" TEXT NOT NULL, "provider" TEXT NOT NULL,
"email" TEXT NOT NULL, "passwordCipher" TEXT NOT NULL,
"enabled" BOOLEAN NOT NULL DEFAULT false,
"intervalMinutes" INTEGER NOT NULL DEFAULT 5,
"taskMode" TEXT NOT NULL DEFAULT 'SUGGEST',
"instructions" TEXT NOT NULL DEFAULT '',
"inboxUid" INTEGER NOT NULL DEFAULT 0, "inboxValidity" TEXT NOT NULL,
"sentFolder" TEXT, "sentUid" INTEGER NOT NULL DEFAULT 0, "sentValidity" TEXT,
"processedCount" INTEGER NOT NULL DEFAULT 0, "lastCheckedAt" TIMESTAMP(3),
"lastError" TEXT, "nextCheckAt" TIMESTAMP(3), "leaseToken" TEXT,
"leasedUntil" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 0,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "EmailMailbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMailbox_userId_email_key" ON "EmailMailbox"("userId", "email");
CREATE INDEX "EmailMailbox_enabled_nextCheckAt_idx" ON "EmailMailbox"("enabled","nextCheckAt");
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailAnalysis" (
"id" TEXT NOT NULL, "userId" TEXT NOT NULL, "mailboxId" TEXT NOT NULL,
"folder" TEXT NOT NULL, "validity" TEXT NOT NULL, "uid" INTEGER NOT NULL,
"subject" TEXT NOT NULL, "sender" TEXT NOT NULL,
"status" TEXT NOT NULL DEFAULT 'PROCESSING', "summary" JSONB, "error" TEXT,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "EmailAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailAnalysis_mailboxId_folder_validity_uid_key" ON "EmailAnalysis"("mailboxId","folder","validity","uid");
CREATE INDEX "EmailAnalysis_userId_createdAt_idx" ON "EmailAnalysis"("userId","createdAt");
ALTER TABLE "EmailAnalysis" ADD CONSTRAINT "EmailAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAnalysis" ADD CONSTRAINT "EmailAnalysis_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
