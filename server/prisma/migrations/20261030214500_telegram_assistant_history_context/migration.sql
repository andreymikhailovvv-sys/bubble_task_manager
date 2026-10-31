ALTER TABLE "TelegramAiChatPolicy"
  ADD COLUMN "historyAccessEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "historyMessageLimit" INTEGER DEFAULT 50,
  ADD COLUMN "historyContextSummary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "historyImportCursor" INTEGER,
  ADD COLUMN "historyImportRemaining" INTEGER,
  ADD COLUMN "historyImportedCount" INTEGER NOT NULL DEFAULT 0;

-- Existing assistants did not grant retroactive history access.
-- Keep them opted out until their owner explicitly saves the new setting.
UPDATE "TelegramAiChatPolicy" SET "historyAccessEnabled" = FALSE;
