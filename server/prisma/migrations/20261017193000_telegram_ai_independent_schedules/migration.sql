-- Independent schedules and checkpoints: keep previous monitor cursor to avoid replaying historical messages.
ALTER TABLE "TelegramAiChatPolicy"
  ADD COLUMN "interactionIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "autoReplyIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "summaryIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "summaryInstructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "suggestWhen" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "suggestHow" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastInteractionMessageId" INTEGER,
  ADD COLUMN "lastSummaryMessageId" INTEGER,
  ADD COLUMN "lastTaskMessageId" INTEGER,
  ADD COLUMN "nextInteractionAt" TIMESTAMP(3),
  ADD COLUMN "nextSummaryAt" TIMESTAMP(3),
  ADD COLUMN "nextTaskAt" TIMESTAMP(3);
UPDATE "TelegramAiChatPolicy" SET
  "interactionIntervalMinutes" = "checkIntervalMinutes",
  "autoReplyIntervalMinutes" = "checkIntervalMinutes",
  "summaryIntervalMinutes" = "checkIntervalMinutes",
  "summaryInstructions" = "instructions",
  "lastInteractionMessageId" = "lastSeenMessageId",
  "lastSummaryMessageId" = "lastSeenMessageId",
  "lastTaskMessageId" = "lastSeenMessageId",
  "nextInteractionAt" = "nextCheckAt",
  "nextSummaryAt" = "nextCheckAt",
  "nextTaskAt" = "nextCheckAt",
  "suggestWhen" = CASE WHEN "mode" = 'SUGGEST' THEN "autoReplyWhen" ELSE '' END,
  "suggestHow" = CASE WHEN "mode" = 'SUGGEST' THEN "autoReplyHow" ELSE '' END
WHERE TRUE;
ALTER TABLE "TelegramAiInboxEvent"
  ADD COLUMN "suggestedReplyMessageId" INTEGER,
  ADD COLUMN "suggestedReplyText" TEXT,
  ADD COLUMN "suggestedReplyStatus" TEXT NOT NULL DEFAULT 'PENDING';
CREATE INDEX "TelegramAiInboxEvent_suggestedReplyMessageId_idx"
  ON "TelegramAiInboxEvent" ("policyId", "suggestedReplyMessageId");
