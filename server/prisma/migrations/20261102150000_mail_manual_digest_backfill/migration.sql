-- On-demand summaries may review a bounded number of existing messages without
-- enabling unsolicited historical imports, task proposals, or auto-replies.
ALTER TABLE "EmailMailbox" ADD COLUMN "manualDigestRequestedAt" TIMESTAMP(3);
ALTER TABLE "EmailAnalysis" ADD COLUMN "summaryOnly" BOOLEAN NOT NULL DEFAULT false;
