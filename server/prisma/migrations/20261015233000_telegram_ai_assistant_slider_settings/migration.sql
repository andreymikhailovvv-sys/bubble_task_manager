-- The first assistant configuration PR is already deployed. Migrate existing
-- inactive chat profiles, preserving the explicit choice to suggest tasks.
-- A slider profile cannot activate background reading or outbound operations.
ALTER TABLE "TelegramAiChatPolicy"
    ADD COLUMN "taskMode" TEXT NOT NULL DEFAULT 'SUGGEST';
UPDATE "TelegramAiChatPolicy"
SET "taskMode" = CASE WHEN "suggestTasks" THEN 'SUGGEST' ELSE 'NONE' END;

-- The simplified UI has exactly three supported polling intervals.
UPDATE "TelegramAiChatPolicy"
SET "checkIntervalMinutes" = CASE
  WHEN "checkIntervalMinutes" = 5 THEN 5
  WHEN "checkIntervalMinutes" = 30 THEN 30
  ELSE 30
END;
ALTER TABLE "TelegramAiChatPolicy"
    ALTER COLUMN "checkIntervalMinutes" SET DEFAULT 30;

-- Older caps could be below 50; profiles remain paused and need an explicit
-- later activation before any charging is possible. Map to visible slider tiers.
UPDATE "TelegramAiChatPolicy"
SET "dailyCreditLimitMilli" = CASE
  WHEN "dailyCreditLimitMilli" >= 5000000 THEN 5000000
  WHEN "dailyCreditLimitMilli" >= 2500000 THEN 2500000
  WHEN "dailyCreditLimitMilli" >= 1000000 THEN 1000000
  WHEN "dailyCreditLimitMilli" >= 500000 THEN 500000
  WHEN "dailyCreditLimitMilli" >= 250000 THEN 250000
  WHEN "dailyCreditLimitMilli" >= 100000 THEN 100000
  ELSE 50000
END;
ALTER TABLE "TelegramAiChatPolicy"
    ALTER COLUMN "dailyCreditLimitMilli" DROP NOT NULL,
    ALTER COLUMN "dailyCreditLimitMilli" SET DEFAULT 50000;

ALTER TABLE "TelegramAiChatPolicy"
    DROP COLUMN "analysisLevel",
    DROP COLUMN "maxMessagesPerCheck",
    DROP COLUMN "summaryFrequency",
    DROP COLUMN "suggestTasks",
    DROP COLUMN "monthlyCreditLimitMilli";

-- Nothing in this migration grants monitoring or auto-action permission.
UPDATE "TelegramAiChatPolicy" SET "isEnabled" = false;
