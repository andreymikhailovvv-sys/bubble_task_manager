ALTER TABLE "TaskAiMessage" ADD COLUMN "mailSendDraft" JSONB;
CREATE TABLE "MailComposeDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailComposeDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MailComposeDraft_userId_createdAt_idx" ON "MailComposeDraft"("userId","createdAt");
ALTER TABLE "MailComposeDraft" ADD CONSTRAINT "MailComposeDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
