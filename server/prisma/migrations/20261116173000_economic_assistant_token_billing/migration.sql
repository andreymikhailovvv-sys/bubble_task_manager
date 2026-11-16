-- Keep history private; record only file names, not uploaded file contents.
-- Existing text-only conversation rows remain valid with zero-cost defaults.
ALTER TABLE "EconomicAssistantMessage"
  ADD COLUMN "attachmentNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "creditsSpentMilli" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;
